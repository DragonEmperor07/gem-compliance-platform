"""
Test suite for the tender -> bidder compliance pipeline.

Stdlib unittest only, no network and no LLM: every test runs the deterministic
path, so this works on a clean checkout.

    python test_pipeline.py
    python -m unittest -v
"""

from __future__ import annotations

import io
import json
import logging
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

import pymupdf

from .bidder_zip import ExtractedDocument, ingest_zip, read_document, safe_extract, write_documents
from .checklist_build import build_checklist, canonical_id, label_for, slugify
from .compliance_score import document_states, score_report
from .doc_check import load_checklist, read_inputs, reconcile
from .document_classifier import classify_document
from .match_engine import alias_hits, classify_against_checklist, match
from .req import RequirementDraft, RequirementExtraction, SubRequirementDraft
from .scenario_json import evaluate_scenario

# Unreadable-file warnings are expected here; several tests assert on them.
logging.disable(logging.WARNING)


# ---------------------------------------------------------------- helpers

def requirement(name, evidence, mandatory=True):
    return RequirementDraft(
        name=name,
        description=f"{name} description",
        domain="general",
        category="eligibility",
        mandatory=mandatory,
        evidence_types=evidence,
        source_page=1,
        source_text=f"{name} source text",
    )


def make_pdf(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    for index, line in enumerate(text.split("\n")):
        page.insert_text((60, 90 + index * 16), line, fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


class TempDirCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)


# ---------------------------------------------------------------- checklist

class TestChecklistBuild(unittest.TestCase):

    def test_sub_requirements_become_individual_checklist_criteria(self):
        parent = requirement("Financial standing", ["Audited financial statements"])
        parent.sub_requirements = [
            SubRequirementDraft(
                name="Audited annual accounts",
                description="Accounts must be audited.",
                evidence_types=["Audited financial statements"],
                source_page=1,
                source_text="Audited annual accounts",
            ),
            SubRequirementDraft(
                name="Minimum annual turnover",
                description="Meet the stated turnover threshold.",
                evidence_types=["Audited financial statements"],
                source_page=1,
                source_text="Minimum turnover",
                thresholds=[{"name": "turnover", "value": "100", "unit": "lakhs"}],
            ),
        ]

        checklist = build_checklist(RequirementExtraction(requirements=[parent]))

        self.assertEqual(len(checklist["documents"]), 1)
        entry = checklist["documents"][0]
        self.assertEqual(entry["requirements"], [
            "Financial standing — Audited annual accounts",
            "Financial standing — Minimum annual turnover",
        ])
        self.assertEqual(entry["criteria"][1]["thresholds"][0]["value"], "100")

    def test_canonical_id_maps_known_evidence(self):
        cases = {
            "GST registration certificate": "GST_CERTIFICATE",
            "PAN card": "PAN_CARD",
            "Audited balance sheet": "AUDITED_FINANCIAL_STATEMENTS",
            "OEM authorization letter": "OEM_AUTHORIZATION",
            "Udyam registration certificate": "UDYAM_CERTIFICATE",
        }
        for evidence, expected in cases.items():
            with self.subTest(evidence=evidence):
                self.assertEqual(canonical_id(evidence), expected)

    def test_canonical_id_returns_none_for_unknown(self):
        self.assertIsNone(canonical_id("Board resolution"))
        self.assertIsNone(canonical_id(""))

    def test_label_and_slug(self):
        self.assertEqual(label_for("GST_CERTIFICATE"), "GST Certificate")
        self.assertEqual(label_for("OEM_AUTHORIZATION"), "OEM Authorization")
        self.assertEqual(slugify("Board resolution!"), "BOARD_RESOLUTION")

    def test_unknown_evidence_becomes_custom_entry(self):
        checklist = build_checklist(RequirementExtraction(
            requirements=[requirement("Signatory", ["Board resolution"])]
        ))
        entry = checklist["documents"][0]
        self.assertEqual(entry["id"], "BOARD_RESOLUTION")
        self.assertEqual(entry["label"], "Board resolution")
        self.assertIn("board resolution", entry["aliases"])

    def test_same_document_from_two_requirements_merges(self):
        checklist = build_checklist(RequirementExtraction(requirements=[
            requirement("Tax registration", ["GST registration certificate"], mandatory=False),
            requirement("Statutory compliance", ["GST certificate"], mandatory=True),
        ]))
        self.assertEqual(len(checklist["documents"]), 1)

        entry = checklist["documents"][0]
        self.assertEqual(entry["id"], "GST_CERTIFICATE")
        # Required if ANY contributing requirement is mandatory.
        self.assertTrue(entry["required"])
        self.assertEqual(len(entry["requirements"]), 2)

    def test_requirement_without_evidence_is_kept_not_dropped(self):
        checklist = build_checklist(RequirementExtraction(requirements=[
            requirement("Site visit", []),
            requirement("Tax", ["GST certificate"]),
        ]))
        self.assertEqual(len(checklist["documents"]), 1)
        self.assertEqual(len(checklist["unmapped_requirements"]), 1)
        self.assertEqual(checklist["unmapped_requirements"][0]["name"], "Site visit")

    def test_required_documents_sort_first(self):
        checklist = build_checklist(RequirementExtraction(requirements=[
            requirement("Optional", ["OEM authorization letter"], mandatory=False),
            requirement("Mandatory", ["GST certificate"], mandatory=True),
        ]))
        self.assertTrue(checklist["documents"][0]["required"])

    def test_output_loads_as_a_valid_checklist(self):
        checklist = build_checklist(RequirementExtraction(
            requirements=[requirement("Tax", ["GST certificate"])]
        ))
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, ignore_errors=True)

        path = tmp / "required_docs.json"
        path.write_text(json.dumps(checklist), encoding="utf-8")

        # doc_check.load_checklist enforces the schema and unique ids.
        self.assertEqual(len(load_checklist(path)["documents"]), 1)


# ---------------------------------------------------------------- ingestion

class TestBidderZip(TempDirCase):

    def build_zip(self, entries: dict[str, bytes]) -> Path:
        path = self.tmp / "bidder.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
        return path

    def test_zip_slip_is_blocked(self):
        archive = self.build_zip({"../escaped.txt": b"evil"})
        dest = self.tmp / "unpacked"
        safe_extract(archive, dest)

        self.assertFalse((self.tmp / "escaped.txt").exists())
        self.assertEqual(list(dest.rglob("*.txt")), [])

    def test_nested_archive_is_unpacked(self):
        inner = io.BytesIO()
        with zipfile.ZipFile(inner, "w") as archive:
            archive.writestr("Turnover_Certificate.txt", b"annual turnover certificate")

        archive_path = self.build_zip({"nested/more.zip": inner.getvalue()})
        dest = self.tmp / "unpacked"
        safe_extract(archive_path, dest)

        found = list(dest.rglob("Turnover_Certificate.txt"))
        self.assertEqual(len(found), 1)
        # The nested archive itself is consumed.
        self.assertEqual(list(dest.rglob("*.zip")), [])

    def test_archive_noise_is_skipped(self):
        archive = self.build_zip({
            "__MACOSX/._junk": b"noise",
            ".hidden": b"noise",
            "Real.txt": b"real content",
        })
        documents = ingest_zip(archive, self.tmp / "extracted", self.tmp / "work")
        self.assertEqual([d.source_file for d in documents], ["Real.txt"])

    def test_reads_pdf_text_layer(self):
        archive = self.build_zip({"GST.pdf": make_pdf("GSTIN 29ABCDE1234F1Z5")})
        documents = ingest_zip(archive, self.tmp / "extracted", self.tmp / "work")

        self.assertEqual(documents[0].status, "text")
        self.assertIn("GSTIN", documents[0].text)

    def test_unreadable_file_is_reported_not_dropped(self):
        archive = self.build_zip({"broken.docx": b"not really a docx"})
        documents = ingest_zip(archive, self.tmp / "extracted", self.tmp / "work")

        self.assertEqual(len(documents), 1)
        self.assertEqual(documents[0].status, "error")
        self.assertTrue(documents[0].note)

    def test_pdf_without_text_reports_empty(self):
        archive = self.build_zip({"blank.pdf": make_pdf("")})
        documents = ingest_zip(archive, self.tmp / "extracted", self.tmp / "work")

        self.assertEqual(documents[0].status, "empty")
        self.assertEqual(documents[0].text, "")

    def test_unsupported_extension_is_ignored(self):
        archive = self.build_zip({"video.mp4": b"\x00\x01", "Real.txt": b"content"})
        documents = ingest_zip(archive, self.tmp / "extracted", self.tmp / "work")
        self.assertEqual([d.source_file for d in documents], ["Real.txt"])

    def test_output_is_readable_by_doc_check(self):
        archive = self.build_zip({"folder/GST.txt": b"GSTIN 29ABCDE1234F1Z5"})
        extracted = self.tmp / "extracted"
        ingest_zip(archive, extracted, self.tmp / "work")

        documents = read_inputs(extracted)
        self.assertEqual(len(documents), 1)
        self.assertIn("GSTIN", documents[0][1])

    def test_nested_names_do_not_collide(self):
        documents = [
            ExtractedDocument("a/report.pdf", "first", "text"),
            ExtractedDocument("b/report.pdf", "second", "text"),
        ]
        out = self.tmp / "extracted"
        write_documents(documents, out)

        self.assertEqual(len(list(out.glob("*.json"))), 2)

    def test_read_document_rejects_unknown_type(self):
        path = self.tmp / "thing.xyz"
        path.write_bytes(b"data")
        _, status, _ = read_document(path)
        self.assertEqual(status, "unsupported")


# ---------------------------------------------------------------- classifier

class TestDocumentClassifier(unittest.TestCase):

    def test_prompt_template_formats(self):
        # Regression: literal JSON braces used to raise KeyError, silently
        # killing the LLM fallback.
        from .document_classifier import DOCUMENT_TYPES, OLLAMA_PROMPT
        rendered = OLLAMA_PROMPT.format(
            allowed_types=", ".join(DOCUMENT_TYPES),
            filename="x.pdf",
            content="body",
        )
        self.assertIn("document_type", rendered)

    def test_strong_filename_and_content_classify(self):
        result = classify_document(
            "GST_Certificate.pdf",
            "GSTIN 29ABCDE1234F1Z5 goods and services tax",
            use_llm_fallback=False,
        )
        self.assertEqual(result.document_type, "GST_CERTIFICATE")
        self.assertEqual(result.classification_status, "CLASSIFIED")

    def test_empty_document_is_unknown(self):
        result = classify_document("mystery.pdf", "", use_llm_fallback=False)
        self.assertEqual(result.document_type, "UNKNOWN")


# ---------------------------------------------------------------- matching

class TestMatchEngine(unittest.TestCase):

    def setUp(self):
        self.checklist = build_checklist(RequirementExtraction(requirements=[
            requirement("Tax registration", ["GST registration certificate"]),
            requirement("Financial standing", ["Turnover certificate from CA"]),
            requirement("Signatory", ["Board resolution"]),
            requirement("OEM tie-up", ["OEM authorization letter"], mandatory=False),
        ]))

    def test_alias_hits_ignores_nested_aliases(self):
        # Regression: "turnover" nested inside "annual turnover" counted twice,
        # so one passing mention looked like corroborated evidence.
        checklist = {"documents": [{
            "id": "TURNOVER_CERTIFICATE",
            "aliases": ["annual turnover", "turnover"],
        }]}
        self.assertEqual(
            alias_hits("our annual turnover is high", checklist, "TURNOVER_CERTIFICATE"),
            1,
        )

    def test_alias_hits_counts_distinct_phrases(self):
        checklist = {"documents": [{
            "id": "TURNOVER_CERTIFICATE",
            "aliases": ["turnover certificate", "certified turnover"],
        }]}
        self.assertEqual(
            alias_hits(
                "turnover certificate. certified turnover for FY2023.",
                checklist,
                "TURNOVER_CERTIFICATE",
            ),
            2,
        )

    def test_real_certificate_is_classified(self):
        result = classify_against_checklist(
            "GST_Certificate.pdf",
            "GSTIN 29ABCDE1234F1Z5 goods and services tax registration",
            self.checklist,
            use_llm=False,
        )
        self.assertEqual(result.doc_type, "GST_CERTIFICATE")
        self.assertGreaterEqual(result.confidence, 0.55)

    def test_passing_mention_does_not_count_as_present(self):
        result = classify_against_checklist(
            "Covering_Letter.txt",
            "Covering letter. We confirm our annual turnover meets the criteria.",
            self.checklist,
            use_llm=False,
        )
        self.assertLess(result.confidence, 0.55)

    def test_custom_id_matched_by_alias(self):
        result = classify_against_checklist(
            "Resolution.txt",
            "Certified true copy of the board resolution. "
            "The board resolution authorises the signatory.",
            self.checklist,
            use_llm=False,
        )
        self.assertEqual(result.doc_type, "BOARD_RESOLUTION")

    def test_match_splits_present_and_missing(self):
        documents = [
            ("GST_Certificate.pdf", "GSTIN 29ABCDE1234F1Z5 goods and services tax"),
            ("Turnover_Certificate.pdf",
             "turnover certificate. average annual turnover certified for FY2023."),
        ]
        report = match(self.checklist, documents, use_llm=False, verbose=False)

        present = {entry["id"] for entry in report["present"]}
        missing = {entry["id"] for entry in report["missing"]}

        self.assertIn("GST_CERTIFICATE", present)
        self.assertIn("TURNOVER_CERTIFICATE", present)
        self.assertIn("BOARD_RESOLUTION", missing)
        self.assertIn("OEM_AUTHORIZATION", missing)
        self.assertEqual(report["status"], "incomplete")

    def test_complete_submission_reports_complete(self):
        checklist = build_checklist(RequirementExtraction(
            requirements=[requirement("Tax", ["GST registration certificate"])]
        ))
        report = match(
            checklist,
            [("GST_Certificate.pdf", "GSTIN 29ABCDE1234F1Z5 goods and services tax")],
            use_llm=False,
            verbose=False,
        )
        self.assertEqual(report["status"], "complete")
        self.assertEqual(report["counts"]["missing_required"], 0)


# ---------------------------------------------------------------- scoring

class TestComplianceScore(unittest.TestCase):

    def report(self):
        """present / review / missing, one of each."""
        return {
            "present": [
                {"id": "GST_CERTIFICATE", "label": "GST Certificate", "required": True,
                 "files": ["gst.json"], "confidence": 1.0, "duplicate": False},
            ],
            "missing": [
                {"id": "TURNOVER_CERTIFICATE", "label": "Turnover Certificate",
                 "required": True,
                 "possible_match": {"file": "letter.json", "confidence": 0.5}},
                {"id": "BOARD_RESOLUTION", "label": "Board resolution", "required": True},
                {"id": "OEM_AUTHORIZATION", "label": "OEM Authorization", "required": False},
            ],
        }

    def test_points_per_state(self):
        states = {row["id"]: (row["state"], row["points"])
                  for row in document_states(self.report())}

        self.assertEqual(states["GST_CERTIFICATE"], ("present", 2))
        self.assertEqual(states["TURNOVER_CERTIFICATE"], ("review", 1))
        self.assertEqual(states["BOARD_RESOLUTION"], ("missing", 0))
        self.assertEqual(states["OEM_AUTHORIZATION"], ("missing", 0))

    def test_totals(self):
        score = score_report(self.report())

        self.assertEqual(score["earned"], 3)        # 2 + 1 + 0 + 0
        self.assertEqual(score["maximum"], 8)       # 4 documents x 2
        self.assertEqual(score["percentage"], 37.5)
        self.assertEqual((score["present"], score["review"], score["missing"]), (1, 1, 2))

    def test_earned_matches_row_sum(self):
        score = score_report(self.report())
        self.assertEqual(sum(row["points"] for row in score["documents"]), score["earned"])

    def test_every_checklist_document_is_scored_once(self):
        report = self.report()
        rows = document_states(report)
        self.assertEqual(len(rows), len(report["present"]) + len(report["missing"]))
        self.assertEqual(len({row["id"] for row in rows}), len(rows))

    def test_worst_rows_come_first(self):
        rows = document_states(self.report())
        self.assertEqual([row["points"] for row in rows], sorted(row["points"] for row in rows))

    def test_perfect_and_empty_submissions(self):
        perfect = score_report({
            "present": [{"id": "A", "label": "A", "required": True,
                         "files": ["a.json"], "confidence": 1.0, "duplicate": False}],
            "missing": [],
        })
        self.assertEqual(perfect["percentage"], 100.0)

        empty = score_report({"present": [], "missing": []})
        self.assertEqual((empty["earned"], empty["maximum"], empty["percentage"]), (0, 0, 0.0))


# ---------------------------------------------------------------- end to end

class TestEndToEnd(TempDirCase):

    def test_zip_to_score(self):
        archive = self.tmp / "bidder.zip"
        with zipfile.ZipFile(archive, "w") as z:
            z.writestr("GST_Certificate.pdf", make_pdf("GSTIN 29ABCDE1234F1Z5\ngoods and services tax"))
            z.writestr("Covering_Letter.txt", "We confirm our annual turnover meets the criteria.")

        checklist = build_checklist(RequirementExtraction(requirements=[
            requirement("Tax", ["GST registration certificate"]),
            requirement("Finance", ["Turnover certificate from CA"]),
            requirement("Signatory", ["Board resolution"]),
        ]))

        ingest_zip(archive, self.tmp / "extracted", self.tmp / "work")
        documents = read_inputs(self.tmp / "extracted")
        report = match(checklist, documents, use_llm=False, verbose=False)

        self.assertEqual(report["status"], "incomplete")

        score = report["compliance"]
        self.assertEqual(score["maximum"], 6)                 # 3 documents x 2
        self.assertEqual(score["present"], 1)                 # GST only
        self.assertEqual(sum(r["points"] for r in score["documents"]), score["earned"])

        # The report is JSON-serialisable end to end.
        json.loads(json.dumps(report))


class TestScenarioJsonAdapter(unittest.TestCase):

    @staticmethod
    def scenario(document_state="SUBMITTED", validation="PASS", gstin="29ABCDE1234F1Z5"):
        return {
            "scenario": {"scenario_id": "TEST", "scenario_name": "Adapter test"},
            "tender": {"eligibility_criteria": [{
                "sl_no": 1,
                "criterion": "Statutory Registration",
                "requirement": "PAN and GST registration",
                "threshold": {"mandatory_registrations": ["PAN", "GST"]},
            }]},
            "bidder": {"bidder_id": "B-1", "legal_name": "Example Bidder", "pan": "ABCDE1234F", "gstin": gstin},
            "documents": [{
                "document_id": "DOC-01",
                "document_name": "GST certificate",
                "mandatory": True,
                "submission_status": document_state,
                "file": {"file_name": "gst.pdf"} if document_state == "SUBMITTED" else None,
                "validation": {"result": validation, "severity": "CRITICAL", "remarks": "fixture check"},
            }],
            "compliance_summary": {"bid_responsiveness": "RESPONSIVE"},
        }

    def test_complete_scenario_is_responsive(self):
        result = evaluate_scenario(self.scenario())
        self.assertEqual(result["decision"]["bid_responsiveness"], "RESPONSIVE")
        self.assertEqual(result["decision"]["score"]["percentage"], 100.0)
        self.assertTrue(result["expected_comparison"]["all_matched"])

    def test_missing_and_failed_facts_are_blocking(self):
        result = evaluate_scenario(self.scenario(document_state="NOT_SUBMITTED", validation="FAIL", gstin=None))
        decision = result["decision"]
        self.assertEqual(decision["bid_responsiveness"], "NON_RESPONSIVE")
        self.assertEqual(decision["counts"]["documents_missing"], 1)
        self.assertEqual(decision["counts"]["eligibility_criteria_not_met"], 1)
        # The deliberately incorrect expected summary is compared, never used
        # to determine the engine's result.
        self.assertFalse(result["expected_comparison"]["all_matched"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

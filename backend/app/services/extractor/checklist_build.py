"""
Track A bridge: tender requirements -> required_docs.json

    tender.pdf -> TenderPipeline.prepare() -> extract_requirements()
               -> build_checklist() -> required_docs.json

Document ids come from document_classifier, so the checklist and the classifier
speak the same vocabulary and the matching engine needs no translation table.

    python checklist_build.py --tender tender.pdf --out required_docs.json
    python checklist_build.py --requirements reqs.json --out required_docs.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from .document_classifier import _score_rules
from .req import RequirementExtraction

# Acronyms that must not be title-cased when building a label.
ACRONYMS = {"GST", "PAN", "TAN", "OEM", "EPFO", "ESIC", "NSIC", "BOQ", "ITR", "MSME"}

# A filename rule hit scores 3.0 in _score_rules; anything less is a stray
# content word and too weak to claim a canonical type.
CANONICAL_MIN_SCORE = 3.0


def label_for(doc_id: str) -> str:
    """GST_CERTIFICATE -> 'GST Certificate'."""
    return " ".join(
        word if word in ACRONYMS else word.capitalize()
        for word in doc_id.split("_")
    )


def slugify(text: str) -> str:
    """Free-text evidence type -> a stable custom id."""
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return (slug[:60] or "unspecified").upper()


def clean(text: str) -> str:
    """Lowercase, punctuation-free form used for aliases."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 &]+", " ", text.lower())).strip()


def canonical_id(evidence_type: str) -> str | None:
    """
    Map a free-text evidence type onto a DOCUMENT_TYPES id.

    Reuses the classifier's own rule scoring, so both sides agree by construction.
    """
    probe = evidence_type.replace(".", " ").strip()
    if not probe:
        return None

    scores = _score_rules(probe, probe)
    best_type, best_score = max(scores.items(), key=lambda item: item[1])

    return best_type if best_score >= CANONICAL_MIN_SCORE else None


def build_checklist(
    extraction: RequirementExtraction,
    checklist_name: str = "Tender document checklist",
) -> dict[str, Any]:
    """
    One checklist entry per distinct document.

    Requirements often demand the same certificate; they merge, and the entry is
    required if any contributing requirement is mandatory.
    """
    entries: dict[str, dict[str, Any]] = {}
    unmapped: list[dict[str, Any]] = []

    for requirement in extraction.requirements:
        # A parent with sub-requirements is a review group, not an additional
        # piece of evidence. Only its independent criteria become checklist
        # entries, preventing one broad parent from hiding a missing child.
        criteria = requirement.sub_requirements or [requirement]

        for criterion in criteria:
            evidence_types = [e.strip() for e in criterion.evidence_types if e.strip()]
            criterion_name = criterion.name if criterion is not requirement else requirement.name
            criterion_label = criterion_name if criterion is requirement else f"{requirement.name} — {criterion_name}"
            required = requirement.mandatory and criterion.mandatory

            # No evidence document means presence cannot prove it. Kept aside
            # rather than dropped, with its parent retained for review.
            if not evidence_types:
                unmapped.append({
                    "name": criterion_label,
                    "parent_requirement": requirement.name,
                    "mandatory": required,
                })
                continue

            for evidence in evidence_types:

                doc_id = canonical_id(evidence)
                custom = doc_id is None
                doc_id = doc_id or slugify(evidence)

                entry = entries.setdefault(doc_id, {
                    "id": doc_id,
                    "label": evidence if custom else label_for(doc_id),
                    "required": False,
                    "aliases": [],
                    "requirements": [],
                    "criteria": [],
                })

                entry["required"] = entry["required"] or required

                alias = clean(evidence)
                if alias and alias not in entry["aliases"]:
                    entry["aliases"].append(alias)

                if criterion_label not in entry["requirements"]:
                    entry["requirements"].append(criterion_label)
                criterion_reference = {
                    "name": criterion_name,
                    "parent_requirement": requirement.name,
                    "mandatory": required,
                    "condition": criterion.condition or requirement.condition,
                    "thresholds": criterion.thresholds or requirement.thresholds,
                    "source_page": criterion.source_page or requirement.source_page,
                }
                if criterion_reference not in entry["criteria"]:
                    entry["criteria"].append(criterion_reference)

    documents = sorted(entries.values(), key=lambda e: (not e["required"], e["id"]))

    return {
        "checklist_name": checklist_name,
        "documents": documents,
        "unmapped_requirements": unmapped,
    }


def save_checklist(checklist: dict[str, Any], path: Path) -> None:
    path.write_text(
        json.dumps(checklist, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def requirements_from_tender(pdf_path: Path) -> RequirementExtraction:
    """Run the existing Track A pipeline end to end."""
    from .llm_extract import extract_requirements
    from .tender_pipeline import TenderPipeline

    pipeline = TenderPipeline(str(pdf_path))
    context = pipeline.prepare()

    if not context.strip():
        sys.exit(f"no extractable text in {pdf_path} (scanned tender? OCR needed)")

    print(f"context: {len(context)} chars from pages {pipeline.candidates}")
    return extract_requirements(context)


def main() -> None:
    ap = argparse.ArgumentParser(description="Build required_docs.json from a tender")
    source = ap.add_mutually_exclusive_group(required=True)
    source.add_argument("--tender", type=Path, help="tender PDF")
    source.add_argument("--requirements", type=Path, help="saved extraction JSON")
    ap.add_argument("--out", type=Path, default=Path("required_docs.json"))
    ap.add_argument("--name", default="Tender document checklist")
    args = ap.parse_args()

    if args.tender:
        extraction = requirements_from_tender(args.tender)
    else:
        extraction = RequirementExtraction.model_validate_json(
            args.requirements.read_text(encoding="utf-8")
        )

    checklist = build_checklist(extraction, args.name)
    save_checklist(checklist, args.out)

    for doc in checklist["documents"]:
        flag = "REQUIRED" if doc["required"] else "optional"
        print(f"  [{flag:8s}] {doc['id']}")

    print(f"\n{len(checklist['documents'])} documents -> {args.out}")


if __name__ == "__main__":
    main()

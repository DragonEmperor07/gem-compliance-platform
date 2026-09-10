"""Criterion-level validation for real bidder submission documents.

The checks in this module validate submitted content and cross-document
consistency. They deliberately leave authoritative registry checks in REVIEW
until a government/source connector supplies confirmation.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from .bidder_zip import ExtractedDocument
from .criterion_engine import FAIL, MISSING, PASS, REVIEW, evaluate_compliance
from .field_extraction import extract_fields


WORD_NUMBERS = {
    "one": 1.0, "two": 2.0, "three": 3.0, "four": 4.0, "five": 5.0,
    "six": 6.0, "seven": 7.0, "eight": 8.0, "nine": 9.0, "ten": 10.0,
}

EXTERNAL_VERIFICATION_TYPES = {"GST_CERTIFICATE", "PAN_CARD", "TAN_CERTIFICATE", "UDYAM_CERTIFICATE"}
IDENTIFIER_BY_TYPE = {
    "GST_CERTIFICATE": "GSTIN",
    "PAN_CARD": "PAN",
    "TAN_CERTIFICATE": "TAN",
    "UDYAM_CERTIFICATE": "UDYAM",
}


def _excerpt(text: str, match: re.Match[str] | None = None, width: int = 180) -> str:
    if match is None:
        return re.sub(r"\s+", " ", text[:width]).strip()
    start = max(0, match.start() - 60)
    end = min(len(text), match.end() + 100)
    return re.sub(r"\s+", " ", text[start:end]).strip()


def _number(value: Any, unit: str = "") -> float | None:
    raw = str(value or "").replace(",", "").strip().lower()
    if raw in WORD_NUMBERS:
        number = WORD_NUMBERS[raw]
    else:
        found = re.search(r"\d+(?:\.\d+)?", raw)
        if not found:
            return None
        number = float(found.group(0))
    unit = unit.lower()
    if "crore" in unit:
        number *= 10_000_000
    elif "lakh" in unit:
        number *= 100_000
    return number


def _actual_turnover(text: str) -> tuple[float | None, str]:
    match = re.search(
        r"(?:average\s+annual\s+)?turnover.{0,140}?(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s*(crores?|lakhs?)?",
        text, re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None, ""
    return _number(match.group(1), match.group(2) or "INR"), _excerpt(text, match)


def _actual_percentage(text: str) -> tuple[float | None, str]:
    match = re.search(r"local\s+content\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%", text, re.IGNORECASE)
    return (float(match.group(1)), _excerpt(text, match)) if match else (None, "")


def _actual_count(text: str, words: str) -> tuple[float | None, str]:
    match = re.search(rf"\b(\d+|{'|'.join(WORD_NUMBERS)})\b.{{0,45}}?\b(?:{words})\b", text, re.IGNORECASE)
    return (_number(match.group(1)), _excerpt(text, match)) if match else (None, "")


def _actual_years(text: str) -> tuple[float | None, str]:
    match = re.search(
        rf"\b(\d+|{'|'.join(WORD_NUMBERS)})\b\s*(?:-|\s)?\s*years?\b",
        text,
        re.IGNORECASE,
    )
    return (_number(match.group(1)), _excerpt(text, match)) if match else (None, "")


def _threshold_result(threshold: dict[str, Any], text: str) -> tuple[str, str, dict[str, Any]]:
    name = str(threshold.get("name", "threshold")).lower()
    expected = _number(threshold.get("value"), str(threshold.get("unit", "")))
    actual: float | None = None
    evidence = ""

    if "turnover" in name or "project value" in name:
        actual, evidence = _actual_turnover(text)
    elif "local content" in name:
        actual, evidence = _actual_percentage(text)
    elif "set" in name or "cop" in name:
        actual, evidence = _actual_count(text, "sets?|copies")
    elif "similar work" in name:
        actual, evidence = _actual_count(text, r"comparable\s+works?|similar\s+(?:works?|installations?)")
    elif "lookback" in name or "year" in name:
        actual, evidence = _actual_years(text)

    details = {
        "threshold": threshold,
        "actual": actual,
        "excerpt": evidence,
    }
    if expected is None:
        return REVIEW, "The tender threshold could not be normalized automatically.", details
    if actual is None:
        return REVIEW, "The document was found, but the stated threshold value could not be extracted.", details
    if actual < expected:
        return FAIL, f"Extracted value {actual:g} is below the required value {expected:g}.", details
    return PASS, f"Extracted value {actual:g} meets the required value {expected:g}.", details


def _content_result(doc_id: str, text: str) -> tuple[str, str, dict[str, Any]]:
    if not text.strip():
        return FAIL, "The submitted file yielded no readable text.", {}

    field_name = IDENTIFIER_BY_TYPE.get(doc_id)
    if field_name:
        values = [field for field in extract_fields("", text) if field["field"] == field_name]
        if not values:
            return FAIL, f"No valid-format {field_name} was found in the submitted document.", {}
        evidence = {"field": field_name, "value": values[0]["value"], "excerpt": values[0]["evidence"]}
        if doc_id in EXTERNAL_VERIFICATION_TYPES:
            return REVIEW, f"{field_name} format was extracted, but authoritative-source verification is not connected.", evidence

    signatures = {
        "INTEGRITY_PACT": r"\bintegrity\s+pact\b.*\b(?:signed|executed|stamped)\b",
        "OEM_AUTHORIZATION": r"\b(?:authori[sz]ed|authori[sz]ation)\b.*\b(?:oem|original equipment manufacturer|supply|bid)\b",
        "AUDITED_FINANCIAL_STATEMENTS": r"\b(?:audited|auditor)\b.*\b(?:financial|annual accounts|turnover)\b",
        "MAKE_IN_INDIA_DECLARATION": r"\b(?:make in india|local content)\b",
        "UNDERTAKING": r"\bundertaking\b.*\b(?:signed|stamped)\b",
        "DECLARATION": r"\b(?:declare|confirm|accept)\b.*\b(?:terms|conditions|compliance)\b",
        "TECHNICAL_DOCUMENT": r"\b(?:technical|operation|maintenance|specification|schematic)\b",
        "WORK_ORDER": r"\b(?:work order|contract|purchase order)\b.*\b(?:similar|comparable|supply|completed)\b",
    }
    pattern = signatures.get(doc_id)
    if pattern:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if not match:
            return FAIL, "The file type matched, but required document-language evidence was not found.", {"excerpt": _excerpt(text)}
        return PASS, "Required document-language evidence was found.", {"excerpt": _excerpt(text, match)}

    return REVIEW, "The document was matched, but no deterministic content validator exists for this evidence type.", {"excerpt": _excerpt(text)}


def _criterion_check(doc: dict[str, Any], criterion: dict[str, Any], source: ExtractedDocument) -> dict[str, Any]:
    thresholds = criterion.get("thresholds") or []
    results = [_threshold_result(threshold, source.text) for threshold in thresholds]
    if not results:
        results = [_content_result(doc["id"], source.text)]

    states = [result[0] for result in results]
    state = FAIL if FAIL in states else REVIEW if REVIEW in states else PASS
    reasons = [result[1] for result in results]
    return {
        "id": f"{doc['id']}::{criterion.get('name', doc['label'])}",
        "name": criterion.get("name", doc["label"]),
        "label": f"{doc['label']} — {criterion.get('name', 'content validation')}",
        "mandatory": criterion.get("mandatory", doc.get("required", True)),
        "state": state,
        "severity": "CRITICAL" if state == FAIL else "MEDIUM" if state == REVIEW else "NONE",
        "reason": " ".join(reasons),
        "evidence": {
            "file": source.source_file,
            "source_page": criterion.get("source_page"),
            "checks": [result[2] for result in results],
        },
    }


def _cross_document_checks(documents: list[ExtractedDocument]) -> list[dict[str, Any]]:
    fields = [field for document in documents for field in extract_fields(document.source_file, document.text)]
    pans = {field["value"]: field for field in fields if field["field"] == "PAN"}
    gstins = {field["value"]: field for field in fields if field["field"] == "GSTIN"}
    checks = []
    if pans and gstins:
        gst_pans = {value[2:12] for value in gstins}
        matched = bool(set(pans) & gst_pans)
        checks.append({
            "id": "CROSS::PAN_GSTIN",
            "name": "PAN and GSTIN consistency",
            "label": "PAN and GSTIN consistency",
            "mandatory": True,
            "state": PASS if matched else FAIL,
            "severity": "NONE" if matched else "CRITICAL",
            "reason": "The PAN embedded in GSTIN matches the submitted PAN." if matched else "The submitted PAN does not match the PAN embedded in GSTIN.",
            "evidence": {"pan": sorted(pans), "gstin": sorted(gstins)},
        })

    expiry_pattern = re.compile(r"(?:valid\s+(?:until|upto)|expir(?:y|es?)(?:\s+date)?)[\s:.-]*(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})", re.IGNORECASE)
    for document in documents:
        match = expiry_pattern.search(document.text)
        if not match:
            continue
        parsed = None
        for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
            try:
                parsed = datetime.strptime(match.group(1), fmt).date()
                break
            except ValueError:
                pass
        state = REVIEW if parsed is None else FAIL if parsed < date.today() else PASS
        checks.append({
            "id": f"CROSS::EXPIRY::{document.source_file}",
            "name": "Document validity date",
            "label": f"Validity — {Path(document.source_file).name}",
            "mandatory": True,
            "state": state,
            "severity": "CRITICAL" if state == FAIL else "MEDIUM" if state == REVIEW else "NONE",
            "reason": "The document is expired." if state == FAIL else "The validity date is current." if state == PASS else "The validity date could not be parsed.",
            "evidence": {"file": document.source_file, "date": match.group(1), "as_of": date.today().isoformat()},
        })
    return checks


def validate_real_submission(
    checklist: dict[str, Any],
    documents: list[ExtractedDocument],
    report: dict[str, Any],
) -> dict[str, Any]:
    """Validate matched evidence and return coverage plus criterion decision."""
    source_by_name = {document.source_file: document for document in documents}
    present_by_id = {item["id"]: item for item in report.get("present", [])}
    missing_by_id = {item["id"]: item for item in report.get("missing", [])}
    document_checks = []
    criterion_checks = []

    for document in checklist.get("documents", []):
        present = present_by_id.get(document["id"])
        missing = missing_by_id.get(document["id"])
        if not present:
            possible = (missing or {}).get("possible_match")
            state = REVIEW if possible else MISSING
            reason = "A possible filename/content match needs officer review." if possible else "No submitted document matched this required evidence."
            evidence = {"possible_match": possible, "requirements": document.get("requirements", [])}
        else:
            state = PASS
            reason = "Submitted evidence was confidently classified and matched."
            evidence = {"files": present.get("files", []), "confidence": present.get("confidence")}
        document_checks.append({
            "id": document["id"], "label": document["label"],
            "mandatory": document.get("required", True), "state": state,
            "severity": "CRITICAL" if state == MISSING else "MEDIUM" if state == REVIEW else "NONE",
            "reason": reason, "evidence": evidence,
        })

        criteria = document.get("criteria") or [{"name": "Document content", "mandatory": document.get("required", True)}]
        if present:
            source = next((source_by_name[name] for name in present.get("files", []) if name in source_by_name), None)
            if source:
                criterion_checks.extend(_criterion_check(document, criterion, source) for criterion in criteria)
                continue
        for criterion in criteria:
            criterion_checks.append({
                "id": f"{document['id']}::{criterion.get('name', document['label'])}",
                "name": criterion.get("name", document["label"]),
                "label": f"{document['label']} — {criterion.get('name', 'content validation')}",
                "mandatory": criterion.get("mandatory", document.get("required", True)),
                "state": REVIEW if (missing or {}).get("possible_match") else MISSING,
                "severity": "MEDIUM" if (missing or {}).get("possible_match") else "CRITICAL",
                "reason": "Content validation cannot complete until the document match is resolved." if (missing or {}).get("possible_match") else "Content validation cannot run because the evidence is missing.",
                "evidence": {"possible_match": (missing or {}).get("possible_match")},
            })

    criterion_checks.extend(_cross_document_checks(documents))
    decision = evaluate_compliance(document_checks, criterion_checks)
    review_count = sum(1 for check in document_checks + criterion_checks if check["state"] == REVIEW)
    decision["validation_complete"] = review_count == 0
    decision["score"]["is_final"] = decision["validation_complete"]
    decision["score"]["label"] = "Final compliance score" if decision["validation_complete"] else "Provisional criterion score"
    decision["coverage"] = report.get("compliance", {})
    return decision

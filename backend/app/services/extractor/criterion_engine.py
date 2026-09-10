"""Shared, deterministic compliance decision and scoring.

Adapters turn real ZIP matching or structured test scenarios into the same two
inputs: document checks and eligibility checks.  The decision engine does not
read fixture expectations and never makes an award decision for the officer.
"""

from __future__ import annotations

from typing import Any


PASS = "pass"
REVIEW = "review"
FAIL = "fail"
MISSING = "missing"

POINTS = {PASS: 1.0, REVIEW: 0.5, FAIL: 0.0, MISSING: 0.0}


def _component_score(checks: list[dict[str, Any]], *, required_only: bool) -> float | None:
    scored = [check for check in checks if not required_only or check.get("mandatory", True)]
    if not scored:
        return None
    earned = sum(POINTS.get(check.get("state", REVIEW), 0.5) for check in scored)
    return round(100.0 * earned / len(scored), 1)


def evaluate_compliance(
    document_checks: list[dict[str, Any]],
    eligibility_checks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a transparent score and recommendation from normalized checks."""
    eligibility_checks = eligibility_checks or []
    document_score = _component_score(document_checks, required_only=True)
    eligibility_score = _component_score(eligibility_checks, required_only=True)

    if document_score is None and eligibility_score is None:
        percentage = 0.0
    elif eligibility_score is None:
        percentage = document_score or 0.0
    elif document_score is None:
        percentage = eligibility_score
    else:
        # Document compliance remains the larger component while substantive
        # tender eligibility cannot be hidden by uploading many files.
        percentage = round(document_score * 0.6 + eligibility_score * 0.4, 1)

    blocking_documents = [
        check for check in document_checks
        if check.get("mandatory", True) and check.get("state") in {FAIL, MISSING}
    ]
    failed_eligibility = [
        check for check in eligibility_checks
        if check.get("mandatory", True) and check.get("state") == FAIL
    ]
    review_items = [
        check for check in document_checks + eligibility_checks
        if check.get("mandatory", True) and check.get("state") == REVIEW
    ]

    if blocking_documents or failed_eligibility:
        responsiveness = "NON_RESPONSIVE"
        technical_status = "DISQUALIFIED"
        recommendation = "Do not advance automatically; officer review of blocking deficiencies is required."
    elif review_items:
        responsiveness = "REVIEW_REQUIRED"
        technical_status = "PENDING_REVIEW"
        recommendation = "Resolve review items before the officer decides whether to advance the bid."
    else:
        responsiveness = "RESPONSIVE"
        technical_status = "QUALIFIED"
        recommendation = "Eligible for officer review before opening the next bid stage."

    missing = [check for check in document_checks if check.get("state") == MISSING]
    invalid = [check for check in document_checks if check.get("state") == FAIL]
    submitted = [check for check in document_checks if check.get("state") != MISSING]
    passed_eligibility = [check for check in eligibility_checks if check.get("state") == PASS]

    findings = []
    for check in document_checks + eligibility_checks:
        if check.get("state") == PASS:
            continue
        findings.append({
            "id": check.get("id"),
            "title": check.get("label") or check.get("name") or "Compliance check",
            "state": check.get("state", REVIEW),
            "severity": check.get("severity", "MEDIUM"),
            "explanation": check.get("reason") or "This item needs officer review.",
            "evidence": check.get("evidence", {}),
        })

    return {
        "score": {
            "percentage": percentage,
            "document_component": document_score,
            "eligibility_component": eligibility_score,
            "method": "60% mandatory-document validity + 40% eligibility criteria",
        },
        "bid_responsiveness": responsiveness,
        "technical_evaluation_status": technical_status,
        "recommendation": recommendation,
        "human_decision_required": True,
        "counts": {
            "documents_total": len(document_checks),
            "documents_submitted": len(submitted),
            "documents_missing": len(missing),
            "mandatory_documents_missing": sum(1 for check in missing if check.get("mandatory", True)),
            "documents_failing_validation": len(invalid),
            "eligibility_criteria_evaluated": len(eligibility_checks),
            "eligibility_criteria_met": len(passed_eligibility),
            "eligibility_criteria_not_met": len(failed_eligibility),
        },
        "document_checks": document_checks,
        "eligibility_checks": eligibility_checks,
        "findings": findings,
    }


def decision_from_match_report(report: dict[str, Any]) -> dict[str, Any]:
    """Adapt the existing real-ZIP match output to the shared decision engine."""
    checks: list[dict[str, Any]] = []
    for item in report.get("present", []):
        checks.append({
            "id": item["id"],
            "label": item["label"],
            "mandatory": item.get("required", True),
            "state": PASS,
            "reason": "A submitted document was confidently matched.",
            "evidence": {"files": item.get("files", []), "confidence": item.get("confidence")},
        })
    for item in report.get("missing", []):
        possible = item.get("possible_match")
        checks.append({
            "id": item["id"],
            "label": item["label"],
            "mandatory": item.get("required", True),
            "state": REVIEW if possible else MISSING,
            "reason": "A possible document match needs review." if possible else "No submitted document matched this checklist item.",
            "evidence": {"possible_match": possible, "requirements": item.get("requirements", [])},
        })
    return evaluate_compliance(checks)

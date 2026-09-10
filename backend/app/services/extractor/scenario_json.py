"""Adapter for versioned, structured bidder-compliance test scenarios."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from .criterion_engine import FAIL, MISSING, PASS, REVIEW, evaluate_compliance


def _require_object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a JSON object")
    return value


def _require_list(value: Any, name: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{name} must be a JSON array")
    return value


def parse_scenario_json(raw: bytes) -> dict[str, Any]:
    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"invalid scenario JSON: {exc}") from exc
    payload = _require_object(payload, "scenario")
    for key in ("scenario", "tender", "bidder"):
        _require_object(payload.get(key), key)
    _require_list(payload.get("documents"), "documents")
    return payload


def _document_checks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    checks = []
    for index, record_value in enumerate(payload["documents"], 1):
        record = _require_object(record_value, f"documents[{index - 1}]")
        validation = record.get("validation") if isinstance(record.get("validation"), dict) else {}
        submission_status = str(record.get("submission_status", "NOT_SUBMITTED")).upper()
        validation_result = str(validation.get("result", "REVIEW")).upper()

        if submission_status != "SUBMITTED" or not record.get("file"):
            state = MISSING
            reason = validation.get("remarks") or "The document was not submitted."
        elif validation_result == "PASS":
            state = PASS
            reason = validation.get("remarks") or "The submitted document passed validation."
        elif validation_result in {"REVIEW", "WARNING", "PENDING", "UNVERIFIED"}:
            state = REVIEW
            reason = validation.get("remarks") or "The submitted document needs review."
        else:
            state = FAIL
            reason = validation.get("remarks") or "The submitted document failed validation."

        checks.append({
            "id": record.get("document_id") or f"DOC-{index:02d}",
            "label": record.get("document_name") or f"Document {index}",
            "category": record.get("category", "general"),
            "mandatory": bool(record.get("mandatory", True)),
            "state": state,
            "severity": validation.get("severity", "NONE" if state == PASS else "MEDIUM"),
            "reason": reason,
            "evidence": {
                "file": (record.get("file") or {}).get("file_name") if isinstance(record.get("file"), dict) else None,
                "bid_cover": record.get("bid_cover"),
                "rule_id": validation.get("rule_id"),
                "extracted_fields": record.get("extracted_fields", {}),
            },
        })
    return checks


def _criterion_result(
    criterion: dict[str, Any],
    state: str,
    reason: str,
    evidence: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": f"ELIG-{criterion.get('sl_no', 0)}",
        "name": criterion.get("criterion", "Eligibility criterion"),
        "label": criterion.get("criterion", "Eligibility criterion"),
        "mandatory": True,
        "state": state,
        "severity": "CRITICAL" if state == FAIL else "MEDIUM" if state == REVIEW else "NONE",
        "reason": reason,
        "evidence": evidence,
        "requirement": criterion.get("requirement"),
    }


def _iso_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


def _eligibility_checks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    tender = payload["tender"]
    bidder = payload["bidder"]
    documents = payload["documents"]
    criteria = _require_list(tender.get("eligibility_criteria", []), "tender.eligibility_criteria")
    results = []

    for criterion_value in criteria:
        criterion = _require_object(criterion_value, "eligibility criterion")
        name = str(criterion.get("criterion", "")).lower()
        threshold = criterion.get("threshold") if isinstance(criterion.get("threshold"), dict) else {}

        if "establishment" in name or "constitution" in name:
            required_years = float(threshold.get("min_years_of_operation", 0) or 0)
            actual_years = float(bidder.get("years_in_operation_as_on_tender_date", 0) or 0)
            state = PASS if actual_years >= required_years else FAIL
            reason = f"Operating history is {actual_years:g} years against the required {required_years:g} years."
            results.append(_criterion_result(criterion, state, reason, {"actual_years": actual_years, "required_years": required_years}))
            continue

        if "turnover" in name:
            required_amount = float(threshold.get("min_average_annual_turnover_inr", 0) or 0)
            required_years = list(threshold.get("financial_years", []))
            rows = bidder.get("financials") if isinstance(bidder.get("financials"), list) else []
            by_year = {str(row.get("financial_year")): row.get("turnover_inr") for row in rows if isinstance(row, dict)}
            missing_years = [year for year in required_years if by_year.get(year) is None]
            divisor = len(required_years) or len(rows)
            average = sum(float(by_year.get(year) or 0) for year in required_years) / divisor if divisor else 0.0
            state = PASS if not missing_years and average >= required_amount else FAIL
            reason = f"Average annual turnover is INR {average:,.2f} against INR {required_amount:,.2f}."
            if missing_years:
                reason += " Missing financial years: " + ", ".join(missing_years) + "."
            results.append(_criterion_result(criterion, state, reason, {"average_turnover_inr": round(average, 2), "required_turnover_inr": required_amount, "missing_financial_years": missing_years}))
            continue

        if "registration" in name:
            field_map = {"PAN": "pan", "GST": "gstin", "GSTIN": "gstin", "TAN": "tan", "TIN": "tin"}
            required = [str(item).upper() for item in threshold.get("mandatory_registrations", [])]
            missing = [item for item in required if not bidder.get(field_map.get(item, item.lower()))]
            state = PASS if not missing else FAIL
            reason = "All mandatory registrations are present." if not missing else "Missing mandatory registrations: " + ", ".join(missing) + "."
            results.append(_criterion_result(criterion, state, reason, {"required": required, "missing": missing, "values": {item: bidder.get(field_map.get(item, item.lower())) for item in required}}))
            continue

        if "technical experience" in name or "similar" in name:
            required_count = int(threshold.get("min_similar_works", 0) or 0)
            minimum_value = float(threshold.get("min_value_per_work_inr", 0) or 0)
            period_from = _iso_date(threshold.get("period_from"))
            period_ending = _iso_date(threshold.get("period_ending"))
            works = bidder.get("past_experience") if isinstance(bidder.get("past_experience"), list) else []
            qualifying = []
            for work in works:
                if not isinstance(work, dict) or float(work.get("order_value_inr", 0) or 0) < minimum_value:
                    continue
                work_date = _iso_date(work.get("order_date") or work.get("completion_date"))
                if period_from and (not work_date or work_date < period_from):
                    continue
                if period_ending and (not work_date or work_date > period_ending):
                    continue
                qualifying.append(work)
            state = PASS if len(qualifying) >= required_count else FAIL
            reason = f"{len(qualifying)} qualifying similar works found; {required_count} required at INR {minimum_value:,.2f} or more."
            results.append(_criterion_result(criterion, state, reason, {"qualifying_works": [work.get("order_no") for work in qualifying], "required_count": required_count, "minimum_value_inr": minimum_value}))
            continue

        if "commercial" in name or "acceptance" in name:
            atc = next((doc for doc in documents if isinstance(doc, dict) and doc.get("category") == "atc" and doc.get("submission_status") == "SUBMITTED"), None)
            fields = atc.get("extracted_fields", {}) if isinstance(atc, dict) and isinstance(atc.get("extracted_fields"), dict) else {}
            deviations = int(fields.get("deviations_recorded", 0) or 0) if atc else None
            permitted = int(threshold.get("deviations_permitted", 0) or 0)
            state = PASS if deviations is not None and deviations <= permitted else FAIL
            reason = "Commercial terms were accepted without deviations." if state == PASS else f"{deviations if deviations is not None else 'No'} commercial acceptance recorded; maximum permitted deviations: {permitted}."
            results.append(_criterion_result(criterion, state, reason, {"deviations_recorded": deviations, "deviations_permitted": permitted, "document_id": atc.get("document_id") if atc else None}))
            continue

        results.append(_criterion_result(criterion, REVIEW, "No deterministic evaluator is available for this criterion yet.", {}))

    return results


def _compare_expected(decision: dict[str, Any], expected: Any) -> dict[str, Any]:
    if not isinstance(expected, dict):
        return {"available": False, "all_matched": None, "checks": []}
    actual_counts = decision["counts"]
    mappings = {
        "documents_submitted": actual_counts["documents_submitted"],
        "documents_missing": actual_counts["documents_missing"],
        "mandatory_documents_missing": actual_counts["mandatory_documents_missing"],
        "documents_failing_validation": actual_counts["documents_failing_validation"],
        "eligibility_criteria_met": actual_counts["eligibility_criteria_met"],
        "eligibility_criteria_not_met": actual_counts["eligibility_criteria_not_met"],
        "bid_responsiveness": decision["bid_responsiveness"],
        "technical_evaluation_status": decision["technical_evaluation_status"],
    }
    checks = [
        {"field": field, "expected": expected.get(field), "actual": actual, "matched": expected.get(field) == actual}
        for field, actual in mappings.items() if field in expected
    ]
    return {"available": True, "all_matched": all(check["matched"] for check in checks), "checks": checks}


def evaluate_scenario(payload: dict[str, Any]) -> dict[str, Any]:
    document_checks = _document_checks(payload)
    eligibility_checks = _eligibility_checks(payload)
    decision = evaluate_compliance(document_checks, eligibility_checks)
    scenario = payload.get("scenario", {})
    bidder = payload.get("bidder", {})
    return {
        "scenario": {
            "id": scenario.get("scenario_id"),
            "name": scenario.get("scenario_name"),
            "description": scenario.get("description"),
        },
        "bidder": {
            "id": bidder.get("bidder_id"),
            "legal_name": bidder.get("legal_name"),
            "constitution": bidder.get("constitution"),
        },
        "decision": decision,
        "expected_comparison": _compare_expected(decision, payload.get("compliance_summary")),
    }


def evaluate_scenario_bytes(raw: bytes) -> dict[str, Any]:
    return evaluate_scenario(parse_scenario_json(raw))

"""Verify submitted identifiers through an optional external provider."""

from __future__ import annotations

import re
from typing import Any

from .bidder_zip import ExtractedDocument
from .field_extraction import extract_fields
from .government_client import GovernmentClient


FIELD_TO_SERVICE = {"GSTIN": "GST", "PAN": "PAN", "UDYAM": "UDYAM"}
GOOD_STATUSES = {"ACTIVE", "VALID", "CLEAR"}
BAD_STATUSES = {
    "CANCELLED",
    "NOT_FOUND",
    "BLACKLISTED",
    "UNAVAILABLE",
    "ERROR",
    "INVALID_RESPONSE",
}


def _documents_as_pairs(
    documents: list[ExtractedDocument] | list[tuple[str, str]],
) -> list[tuple[str, str]]:
    pairs = []
    for document in documents:
        if isinstance(document, tuple):
            pairs.append(document)
        else:
            pairs.append((document.source_file, document.text))
    return pairs


def extract_identifiers(
    documents: list[ExtractedDocument] | list[tuple[str, str]],
) -> dict[str, list[dict[str, str]]]:
    """Return unique supported identifiers with their submitted source file."""
    found: dict[str, list[dict[str, str]]] = {
        "GST": [], "PAN": [], "UDYAM": [], "TAN": [],
    }
    seen: set[tuple[str, str]] = set()
    for filename, text in _documents_as_pairs(documents):
        for field in extract_fields(filename, text):
            service = FIELD_TO_SERVICE.get(field["field"], field["field"])
            if service not in found:
                continue
            key = (service, field["value"])
            if key in seen:
                continue
            seen.add(key)
            found[service].append({
                "identifier": field["value"],
                "source_file": filename,
                "evidence": field["evidence"],
            })
    return found


def _normalized_entity(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _entity_match(record: dict[str, Any], bidder_name: str | None) -> bool | None:
    if not bidder_name:
        return None
    entity = record.get("legal_name") or record.get("enterprise_name")
    if not isinstance(entity, str) or not entity.strip():
        return None
    return _normalized_entity(entity) == _normalized_entity(bidder_name)


def _not_configured(identifiers: dict[str, list[dict[str, str]]]) -> dict[str, Any]:
    return {
        "source": "NOT_CONFIGURED",
        "environment": "UNCONFIGURED",
        "authoritative": False,
        "overall": "NOT_CONFIGURED",
        "identifiers": identifiers,
        "checks": [],
        "summary": {"checks": 0, "verified": 0, "reported_valid": 0, "problems": 0},
        "message": "No government verification provider is configured; submitted values remain unverified.",
    }


def verify_documents(
    documents: list[ExtractedDocument] | list[tuple[str, str]],
    client: GovernmentClient | None,
    bidder_name: str | None = None,
) -> dict[str, Any]:
    identifiers = extract_identifiers(documents)
    if client is None:
        return _not_configured(identifiers)

    checks: list[dict[str, Any]] = []
    for service in ("GST", "PAN", "UDYAM"):
        for item in identifiers[service]:
            response = client.lookup(service, item["identifier"])
            check = {
                "service": service,
                "identifier": item["identifier"],
                "source_file": item["source_file"],
                "evidence": item["evidence"],
                "source": response.get("source", "CONFIGURED_PROVIDER"),
                "environment": response.get("environment", "UNKNOWN"),
                "authoritative": response.get("authoritative") is True,
                "status": str(response.get("status", "UNKNOWN")).upper(),
                "record": response,
            }
            check["entity_match"] = _entity_match(response, bidder_name)
            checks.append(check)

    if bidder_name:
        response = client.lookup("BLACKLIST", bidder_name)
        blacklisted = response.get("blacklisted") is True
        checks.append({
            "service": "BLACKLIST",
            "identifier": bidder_name,
            "source": response.get("source", "CONFIGURED_PROVIDER"),
            "environment": response.get("environment", "UNKNOWN"),
            "authoritative": response.get("authoritative") is True,
            "status": "BLACKLISTED" if blacklisted else str(response.get("status", "CLEAR")).upper(),
            "record": response,
        })

    reported_valid = [
        check for check in checks
        if check["status"] in GOOD_STATUSES and check.get("entity_match") is not False
    ]
    verified = [check for check in reported_valid if check["authoritative"]]
    problems = [
        check for check in checks
        if check["status"] in BAD_STATUSES or check.get("entity_match") is False
    ]
    authoritative = bool(checks) and all(check["authoritative"] for check in checks)
    if not checks:
        overall = "NO_IDENTIFIERS_FOUND"
    elif authoritative and any(check["status"] == "BLACKLISTED" for check in checks):
        overall = "HIGH_RISK"
    elif problems:
        overall = "REVIEW"
    elif not authoritative:
        overall = "REVIEW"
    else:
        overall = "VERIFIED"

    return {
        "source": checks[0]["source"] if checks else "CONFIGURED_PROVIDER",
        "environment": checks[0]["environment"] if checks else "UNKNOWN",
        "authoritative": authoritative,
        "overall": overall,
        "identifiers": identifiers,
        "checks": checks,
        "summary": {
            "checks": len(checks),
            "verified": len(verified),
            "reported_valid": len(reported_valid),
            "problems": len(problems),
        },
    }

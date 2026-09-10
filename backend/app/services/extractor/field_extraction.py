"""Deterministic extraction of traceable identifiers from bidder documents.

These values are intentionally labelled as submitted evidence. A separate
authorised-source connector is required before any value can be verified.
"""
from __future__ import annotations

import re
from typing import Any


PATTERNS = {
    "GSTIN": r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b",
    "PAN": r"\b[A-Z]{5}\d{4}[A-Z]\b",
    "TAN": r"\b[A-Z]{4}\d{5}[A-Z]\b",
    "CIN": r"\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b",
    "UDYAM": r"\bUDYAM-[A-Z]{2}-\d{2}-\d{7}\b",
    "DATE": r"\b(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}\b",
}


def extract_fields(source_file: str, text: str) -> list[dict[str, Any]]:
    """Return unique values with a small local evidence excerpt for review."""
    fields: list[dict[str, Any]] = []
    for field, pattern in PATTERNS.items():
        seen: set[str] = set()
        for match in re.finditer(pattern, text, re.IGNORECASE):
            value = match.group(0).upper()
            if value in seen:
                continue
            seen.add(value)
            excerpt = re.sub(r"\s+", " ", text[max(0, match.start() - 70):match.end() + 90]).strip()
            fields.append({
                "field": field,
                "value": value,
                "source_file": source_file,
                "verification_status": "submitted_unverified",
                "evidence": excerpt,
            })
    return fields

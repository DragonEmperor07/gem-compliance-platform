"""Synthetic government verification API for local demonstrations only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse


DATA_PATH = Path(__file__).with_name("data.json")
DATA: dict[str, Any] = json.loads(DATA_PATH.read_text(encoding="utf-8"))

app = FastAPI(title="Trust Setu Mock Verification API", version="1.0")


def result(service: str, identifier: str, record: dict[str, Any] | None) -> JSONResponse:
    base = {
        "source": "MOCK_GOVERNMENT_DATA",
        "environment": "DEMO",
        "authoritative": False,
        "service": service,
        "identifier": identifier,
    }
    if record is None:
        return JSONResponse({**base, "status": "NOT_FOUND"}, status_code=404)
    return JSONResponse({**base, **record})


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "source": "MOCK_GOVERNMENT_DATA",
        "environment": "DEMO",
        "authoritative": False,
    }


@app.get("/api/gst/{gstin}")
def gst(gstin: str):
    identifier = gstin.upper()
    return result("GST", identifier, DATA["gst"].get(identifier))


@app.get("/api/pan/{pan}")
def pan(pan: str):
    identifier = pan.upper()
    return result("PAN", identifier, DATA["pan"].get(identifier))


@app.get("/api/udyam/{udyam_number:path}")
def udyam(udyam_number: str):
    identifier = udyam_number.upper()
    return result("UDYAM", identifier, DATA["udyam"].get(identifier))


@app.get("/api/blacklist/{identifier:path}")
def blacklist(identifier: str):
    key = identifier.strip()
    return result("BLACKLIST", key, DATA["blacklist"].get(key))

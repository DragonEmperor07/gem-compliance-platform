"""Environment-backed operational limits for untrusted uploads."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

REQUIREMENT_MODEL = os.getenv("REQUIREMENT_MODEL", "qwen3:8b")
DOCUMENT_CLASSIFIER_MODEL = os.getenv("DOCUMENT_CLASSIFIER_MODEL", "phi3:mini")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
LLM_ENABLED = os.getenv("LLM_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
GOVERNMENT_API_URL = os.getenv("GOVERNMENT_API_URL", "").strip()


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


def _positive_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


MIB = 1024 * 1024

MAX_TENDER_BYTES = _positive_int("MAX_TENDER_BYTES", 25 * MIB)
MAX_BIDDER_ZIP_BYTES = _positive_int("MAX_BIDDER_ZIP_BYTES", 50 * MIB)
MAX_SCENARIO_JSON_BYTES = _positive_int("MAX_SCENARIO_JSON_BYTES", 5 * MIB)
MAX_ARCHIVE_ENTRIES = _positive_int("MAX_ARCHIVE_ENTRIES", 500)
MAX_ARCHIVE_UNCOMPRESSED_BYTES = _positive_int("MAX_ARCHIVE_UNCOMPRESSED_BYTES", 250 * MIB)
MAX_ARCHIVE_MEMBER_BYTES = _positive_int("MAX_ARCHIVE_MEMBER_BYTES", 25 * MIB)
MAX_COMPRESSION_RATIO = _positive_int("MAX_COMPRESSION_RATIO", 200)
MAX_NESTED_ZIP_DEPTH = _positive_int("MAX_NESTED_ZIP_DEPTH", 3)
MAX_PDF_PAGES = _positive_int("MAX_PDF_PAGES", 500)
UPLOAD_CHUNK_BYTES = _positive_int("UPLOAD_CHUNK_BYTES", MIB)
GOVERNMENT_API_TIMEOUT_SECONDS = _positive_float("GOVERNMENT_API_TIMEOUT_SECONDS", 5.0)
OLLAMA_TIMEOUT_SECONDS = _positive_float("OLLAMA_TIMEOUT_SECONDS", 90.0)

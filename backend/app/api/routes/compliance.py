import io
import json
import zipfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.compliance import ChecklistPayload, RequirementsPayload
from app.config import (
    MAX_BIDDER_ZIP_BYTES,
    MAX_SCENARIO_JSON_BYTES,
    MAX_TENDER_BYTES,
    UPLOAD_CHUNK_BYTES,
    REQUIREMENT_MODEL,
)
from app.services.extractor.api_pipeline import (
    checklist_from_requirements,
    extract_submission,
    match_submission,
    requirements_from_tender,
    run_pipeline,
    tender_context,
)
from app.services.extractor.scenario_json import evaluate_scenario_bytes

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


async def _read_limited(upload: UploadFile, maximum: int, label: str) -> bytes:
    chunks = []
    total = 0
    while chunk := await upload.read(UPLOAD_CHUNK_BYTES):
        total += len(chunk)
        if total > maximum:
            raise HTTPException(413, f"{label} exceeds the configured {maximum}-byte limit")
        chunks.append(chunk)
    if not chunks:
        raise HTTPException(422, f"{label} is empty")
    return b"".join(chunks)


async def _pdf(upload: UploadFile) -> bytes:
    if not upload.filename or not upload.filename.lower().endswith(".pdf"):
        raise HTTPException(422, "tender must be a PDF file")
    data = await _read_limited(upload, MAX_TENDER_BYTES, "tender PDF")
    if not data.lstrip().startswith(b"%PDF-"):
        raise HTTPException(422, "tender file does not have a valid PDF signature")
    return data


async def _zip(upload: UploadFile) -> bytes:
    if not upload.filename or not upload.filename.lower().endswith(".zip"):
        raise HTTPException(422, "submission must be a ZIP file")
    data = await _read_limited(upload, MAX_BIDDER_ZIP_BYTES, "bidder ZIP")
    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise HTTPException(422, "submission file is not a valid ZIP archive")
    return data


async def _scenario(upload: UploadFile) -> bytes:
    if not upload.filename or not upload.filename.lower().endswith(".json"):
        raise HTTPException(422, "scenario must be a JSON file")
    return await _read_limited(upload, MAX_SCENARIO_JSON_BYTES, "scenario JSON")


@router.post("/tenders/context")
async def tender_context_endpoint(tender: UploadFile = File(...)):
    try:
        return tender_context(await _pdf(tender))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not read tender PDF: {exc}") from exc


@router.post("/tenders/requirements")
async def requirements_endpoint(tender: UploadFile = File(...), model: str = Form(REQUIREMENT_MODEL)):
    try:
        return requirements_from_tender(await _pdf(tender), model)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Requirement extraction failed: {exc}") from exc


@router.post("/checklists")
async def checklist_endpoint(requirements: RequirementsPayload, checklist_name: str = "Tender document checklist"):
    return checklist_from_requirements(requirements, checklist_name)


@router.post("/bidders/extract")
async def bidder_extract_endpoint(submission: UploadFile = File(...), use_ocr: bool = Form(True)):
    try:
        return {"documents": [document.__dict__ for document in extract_submission(await _zip(submission), use_ocr)]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not extract bidder ZIP: {exc}") from exc


@router.post("/scenarios/evaluate")
async def scenario_evaluate_endpoint(scenario: UploadFile = File(...)):
    """Evaluate a structured JSON fixture without treating it as bid evidence."""
    try:
        return evaluate_scenario_bytes(await _scenario(scenario))
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/match")
async def match_endpoint(submission: UploadFile = File(...), checklist: str = Form(...), use_ocr: bool = Form(True)):
    try:
        parsed = ChecklistPayload.model_validate_json(checklist)
        return match_submission(parsed, extract_submission(await _zip(submission), use_ocr))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not process bidder ZIP: {exc}") from exc


@router.post("/pipeline")
async def pipeline_endpoint(
    tender: UploadFile = File(...), submission: UploadFile = File(...),
    requirements: str | None = Form(None), checklist_name: str = Form("Tender document checklist"),
    model: str = Form(REQUIREMENT_MODEL), use_ocr: bool = Form(True),
):
    try:
        parsed = RequirementsPayload.model_validate_json(requirements) if requirements else None
        return run_pipeline(await _pdf(tender), await _zip(submission), requirements=parsed, checklist_name=checklist_name, model=model, use_ocr=use_ocr)
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, f"Compliance pipeline failed: {exc}") from exc

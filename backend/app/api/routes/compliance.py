import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.schemas.compliance import ChecklistPayload, RequirementsPayload
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


async def _pdf(upload: UploadFile) -> bytes:
    if not upload.filename or not upload.filename.lower().endswith(".pdf"):
        raise HTTPException(422, "tender must be a PDF file")
    return await upload.read()


@router.post("/tenders/context")
async def tender_context_endpoint(tender: UploadFile = File(...)):
    try:
        return tender_context(await _pdf(tender))
    except Exception as exc:
        raise HTTPException(422, f"Could not read tender PDF: {exc}") from exc


@router.post("/tenders/requirements")
async def requirements_endpoint(tender: UploadFile = File(...), model: str = Form("qwen3:8b")):
    try:
        return requirements_from_tender(await _pdf(tender), model)
    except Exception as exc:
        raise HTTPException(503, f"Requirement extraction failed: {exc}") from exc


@router.post("/checklists")
async def checklist_endpoint(requirements: RequirementsPayload, checklist_name: str = "Tender document checklist"):
    return checklist_from_requirements(requirements, checklist_name)


@router.post("/bidders/extract")
async def bidder_extract_endpoint(submission: UploadFile = File(...), use_ocr: bool = Form(True)):
    if not submission.filename or not submission.filename.lower().endswith(".zip"):
        raise HTTPException(422, "submission must be a ZIP file")
    try:
        return {"documents": [document.__dict__ for document in extract_submission(await submission.read(), use_ocr)]}
    except Exception as exc:
        raise HTTPException(422, f"Could not extract bidder ZIP: {exc}") from exc


@router.post("/scenarios/evaluate")
async def scenario_evaluate_endpoint(scenario: UploadFile = File(...)):
    """Evaluate a structured JSON fixture without treating it as bid evidence."""
    if not scenario.filename or not scenario.filename.lower().endswith(".json"):
        raise HTTPException(422, "scenario must be a JSON file")
    try:
        return evaluate_scenario_bytes(await scenario.read())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/match")
async def match_endpoint(submission: UploadFile = File(...), checklist: str = Form(...), use_ocr: bool = Form(True)):
    try:
        parsed = ChecklistPayload.model_validate_json(checklist)
        return match_submission(parsed, extract_submission(await submission.read(), use_ocr))
    except Exception as exc:
        raise HTTPException(422, f"Could not process bidder ZIP: {exc}") from exc


@router.post("/pipeline")
async def pipeline_endpoint(
    tender: UploadFile = File(...), submission: UploadFile = File(...),
    requirements: str | None = Form(None), checklist_name: str = Form("Tender document checklist"),
    model: str = Form("qwen3:8b"), use_ocr: bool = Form(True),
):
    if not submission.filename or not submission.filename.lower().endswith(".zip"):
        raise HTTPException(422, "submission must be a ZIP file")
    try:
        parsed = RequirementsPayload.model_validate_json(requirements) if requirements else None
        return run_pipeline(await _pdf(tender), await submission.read(), requirements=parsed, checklist_name=checklist_name, model=model, use_ocr=use_ocr)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, f"Compliance pipeline failed: {exc}") from exc

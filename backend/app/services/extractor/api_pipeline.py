"""Adapters that connect upload-based FastAPI routes to the migrated pipeline.

The original extractor works with paths and JSON artifacts.  These functions
provide request-scoped temporary files, so the same pipeline can be used by
the API without retaining bidder documents on the server.
"""
from __future__ import annotations

import tempfile
import re
from pathlib import Path

import httpx
from ollama import ResponseError
from pydantic import ValidationError

from app.config import GOVERNMENT_API_TIMEOUT_SECONDS, GOVERNMENT_API_URL, LLM_ENABLED, REQUIREMENT_MODEL
from app.schemas.compliance import ChecklistPayload, Requirement, RequirementsPayload, SubRequirement

from .bidder_zip import ExtractedDocument, ingest_zip
from .checklist_build import build_checklist
from .field_extraction import extract_fields
from .government_client import GovernmentClient
from .government_verification import verify_documents
from .llm_extract import extract_requirements
from .match_engine import match
from .req import RequirementExtraction
from .tender_pipeline import TenderPipeline
from .real_validation import validate_real_submission


def tender_context(pdf_bytes: bytes) -> dict:
    with tempfile.TemporaryDirectory() as temporary:
        tender_path = Path(temporary) / "tender.pdf"
        tender_path.write_bytes(pdf_bytes)
        pipeline = TenderPipeline(tender_path)
        context = pipeline.prepare()
        return {
            "pages": pipeline.candidates,
            "page_count": len(pipeline.results),
            "context": context,
        }


def _heuristic_requirements(context: str) -> RequirementsPayload:
    """Extract explicit evidence types when an optional local LLM is unavailable.

    This deliberately produces only document-oriented requirements whose terms
    occur in the tender text; uncertain judgement remains visible as review.
    """
    signals = [
        (r"certificate of incorporation|registration by registrar", "Entity registration", "Certificate of incorporation", "eligibility", None),
        (r"\boem\b.{0,120}authori[sz]ation|authori[sz]ation certificate", "OEM authorisation", "OEM authorization letter", "evidence", "Applies when the bidder is not the original equipment manufacturer."),
        (r"annual turnover|audited annual accounts", "Financial standing", "Audited financial statements", "eligibility", None),
        (r"\bpan\b", "PAN registration", "PAN card", "eligibility", None),
        (r"\btan\b", "TAN registration", "TAN certificate", "eligibility", None),
        (r"gst\s+registration|registration certificates.{0,180}\bgst\b", "GST registration", "GST registration certificate", "eligibility", None),
        (r"technical experience|similar type of works|similar work|contract/order.{0,180}(successful|completion)", "Similar work experience", "Work order", "eligibility", None),
        (r"performance certificate|proof of satisfactory performance", "Performance evidence", "Performance certificate", "eligibility", None),
        (r"local content|make in india\s+(?:declaration|certificate)", "Local content declaration", "Make in India declaration", "declaration", "Applies when the tender's Make in India/local-supplier clause applies to the bidder."),
        (r"integrity pact|undertaking", "Signed undertaking", "Undertaking", "declaration", None),
        (r"unconditional acceptance|commercial terms", "Commercial terms acceptance", "Declaration", "commercial", None),
    ]
    requirements: list[Requirement] = []

    def criterion(
        name: str,
        description: str,
        evidence: str,
        *,
        mandatory: bool = True,
        condition: str | None = None,
        thresholds: list[dict[str, str]] | None = None,
        source_page: int | None = None,
        source_text: str = "",
    ) -> SubRequirement:
        return SubRequirement(
            name=name,
            description=description,
            mandatory=mandatory,
            evidence_types=[evidence],
            source_page=source_page,
            source_text=source_text,
            condition=condition,
            thresholds=thresholds or [],
            review_required=True,
        )

    def source_at(start: int, end: int, padding: int = 220) -> tuple[int | None, str]:
        page_matches = list(re.finditer(r"===== PAGE (\d+) =====", context[:start]))
        page = int(page_matches[-1].group(1)) if page_matches else None
        excerpt = re.sub(r"\s+", " ", context[max(0, start - padding):end + padding]).strip()
        return page, excerpt

    for pattern, name, evidence, requirement_type, condition in signals:
        found = re.search(pattern, context, re.IGNORECASE | re.DOTALL)
        if not found:
            continue
        source_page, source_text = source_at(found.start(), found.end())
        thresholds = []
        threshold_page, threshold_text = source_page, source_text
        amount = re.search(
            r"minimum average annual turnover\s*(?:of)?\s*(?:rs\.?\s*)?([\d,]+)(?:/-)?\s*(lakhs|crores)?",
            context,
            re.IGNORECASE,
        )
        if amount and name == "Financial standing":
            threshold_page, threshold_text = source_at(amount.start(), amount.end(), 320)
            thresholds.append({"name": "minimum average annual turnover", "value": amount.group(1), "unit": amount.group(2) or "INR"})
            period = re.search(r"previous\s+(\d+)\s+financial years?\s+ending\s+([\d-]+)", context[amount.end():amount.end() + 180], re.IGNORECASE)
            if period:
                thresholds.append({"name": "financial years", "value": period.group(1), "unit": f"ending {period.group(2)}"})
        percentage = re.search(r"local\s+content\s*=\s*(\d+(?:\.\d+)?)\s*%", context, re.IGNORECASE)
        if percentage and name == "Local content declaration":
            threshold_page, threshold_text = source_at(percentage.start(), percentage.end(), 320)
            thresholds.append({"name": "local content", "value": percentage.group(1), "unit": "%"})

        sub_requirements: list[SubRequirement] = []
        if name == "Entity registration":
            sub_requirements.append(criterion("Incorporation or registration proof", "Submit the bidder's incorporation or registration evidence.", evidence, source_page=source_page, source_text=source_text))
        elif name == "OEM authorisation":
            sub_requirements.append(criterion("OEM authorisation letter", "Submit a valid OEM authorisation where the bidder is not the OEM.", evidence, condition=condition, source_page=source_page, source_text=source_text))
            literature = re.search(r"(\d+)\s*(?:\([^)]*\)\s*)?sets? of technical literature", context, re.IGNORECASE)
            if literature:
                sub_requirements.append(criterion("Technical literature", "Submit the requested sets of operation, maintenance, and repair literature.", "Technical literature", thresholds=[{"name": "sets", "value": literature.group(1), "unit": "copies"}], source_page=source_page, source_text=source_text))
        elif name == "Financial standing":
            sub_requirements.append(criterion("Audited annual accounts", "Submit audited annual accounts for the required financial period.", evidence, source_page=source_page, source_text=source_text))
            if thresholds:
                sub_requirements.append(criterion("Minimum annual turnover", "Demonstrate the tender's stated average annual turnover.", evidence, thresholds=thresholds, source_page=threshold_page, source_text=threshold_text))
        elif name == "PAN registration":
            sub_requirements.append(criterion("PAN certificate", "Submit PAN registration evidence for the Indian bidder party.", evidence, source_page=source_page, source_text=source_text))
        elif name == "TAN registration":
            sub_requirements.append(criterion("TAN certificate", "Submit TAN registration evidence for the Indian bidder party.", evidence, source_page=source_page, source_text=source_text))
        elif name == "GST registration":
            sub_requirements.append(criterion("GST registration certificate", "Submit GST registration evidence for the Indian bidder party.", evidence, source_page=source_page, source_text=source_text))
        elif name == "Similar work experience":
            sub_requirements.append(criterion("Similar-work contract or order", "Submit contracts or orders for comparable work.", evidence, source_page=source_page, source_text=source_text))
            experience = re.search(r"minimum\s+(two|\d+)\s+installations?\s+of\s+similar type.*?within\s+(\d+)\s+years?.*?(?:rs\.?\s*)?([\d,.]+)\s*lakhs", context, re.IGNORECASE | re.DOTALL)
            if not experience:
                experience = re.search(r"at least\s+0*(\d+)\s+similar type.*?last\s+0*(\d+)\s+years?.*?minimum of\s+([\d,.]+)\s*lakhs", context, re.IGNORECASE | re.DOTALL)
            if experience:
                work_count = "2" if experience.group(1).lower() == "two" else experience.group(1)
                experience_thresholds = [
                    {"name": "similar works", "value": work_count, "unit": "works"},
                    {"name": "lookback period", "value": experience.group(2), "unit": "years"},
                    {"name": "minimum project value", "value": experience.group(3), "unit": "lakhs"},
                ]
                sub_requirements.append(criterion("Comparable-work threshold", "Demonstrate the stated number, period, and value of comparable works.", evidence, thresholds=experience_thresholds, source_page=source_page, source_text=source_text))
            if re.search(r"proof of satisfactory\s+performance", context, re.IGNORECASE):
                sub_requirements.append(criterion("Performance evidence", "Provide available proof of satisfactory performance, including support evidence where requested.", "Performance certificate", source_page=source_page, source_text=source_text))
        elif name == "Local content declaration":
            sub_requirements.append(criterion("Make in India declaration", "Submit the tender's requested local-content declaration.", evidence, condition=condition, source_page=source_page, source_text=source_text))
            if thresholds:
                sub_requirements.append(criterion("Local-content threshold", "Demonstrate the stated local-content percentage.", evidence, condition=condition, thresholds=thresholds, source_page=threshold_page, source_text=threshold_text))
        elif name == "Signed undertaking":
            sub_requirements.append(criterion("Integrity Pact", "Submit the required Integrity Pact.", "Integrity Pact", source_page=source_page, source_text=source_text))
            sub_requirements.append(criterion("Signed and stamped undertaking", "Submit the undertaking signed and stamped with tender reference and date details.", evidence, source_page=source_page, source_text=source_text))
        elif name == "Commercial terms acceptance":
            sub_requirements.append(criterion("General terms acceptance", "Confirm compliance with the tender's general terms and conditions.", "Commercial terms acceptance declaration", source_page=source_page, source_text=source_text))
            sub_requirements.append(criterion("Unconditional commercial acceptance", "Submit unconditional acceptance of commercial terms and conditions.", "Commercial terms acceptance declaration", source_page=source_page, source_text=source_text))
            sub_requirements.append(criterion("Offer make and product specification", "State the offered make and product specification.", "Product specification sheet", source_page=source_page, source_text=source_text))
        requirements.append(Requirement(
            name=name,
            description=f"Tender text requests {evidence.lower()} as bidder evidence.",
            # Conditional clauses should be explicitly reviewed by the officer
            # before they become a required checklist item for this bidder.
            mandatory=condition is None,
            evidence_types=[evidence],
            source_page=source_page,
            source_text=source_text,
            requirement_type=requirement_type,
            condition=condition,
            thresholds=thresholds,
            review_required=True,
            sub_requirements=sub_requirements,
        ))
    if not requirements:
        raise RuntimeError("No explicit document requirements could be identified in this tender.")
    return RequirementsPayload(requirements=requirements)


def requirements_from_context(context: str, model: str = REQUIREMENT_MODEL) -> RequirementsPayload:
    if not LLM_ENABLED:
        fallback = _heuristic_requirements(context)
        return fallback.model_copy(update={
            "extraction_method": "heuristic",
            "fallback_reason": "disabled",
            "warnings": [
                "Local LLM extraction is disabled; conservative heuristic extraction was used."
            ],
        })

    try:
        extraction = extract_requirements(context, model)
        return RequirementsPayload(
            requirements=[requirement.model_dump() for requirement in extraction.requirements],
            extraction_method="ollama",
        )
    except (httpx.HTTPError, ResponseError, ValidationError, ConnectionError, TimeoutError) as exc:
        fallback = _heuristic_requirements(context)
        return fallback.model_copy(update={
            "extraction_method": "heuristic",
            "fallback_reason": type(exc).__name__,
            "warnings": [
                "The configured requirement model was unavailable or returned invalid structured output; conservative heuristic extraction was used."
            ],
        })


def requirements_from_tender(pdf_bytes: bytes, model: str = REQUIREMENT_MODEL) -> RequirementsPayload:
    return requirements_from_context(tender_context(pdf_bytes)["context"], model)


def checklist_from_requirements(
    requirements: RequirementsPayload,
    checklist_name: str = "Tender document checklist",
) -> dict:
    extraction = RequirementExtraction.model_validate(requirements.model_dump())
    return build_checklist(extraction, checklist_name)


def extract_submission(zip_bytes: bytes, use_ocr: bool = True) -> list[ExtractedDocument]:
    with tempfile.TemporaryDirectory() as temporary:
        work = Path(temporary)
        zip_path = work / "submission.zip"
        extracted = work / "extracted"
        zip_path.write_bytes(zip_bytes)
        return ingest_zip(zip_path, extracted, work / "unpacked", use_ocr)


def match_submission(
    checklist: ChecklistPayload,
    documents: list[ExtractedDocument],
    use_llm: bool = False,
) -> dict:
    return match(
        checklist.model_dump(mode="json"),
        [(document.source_file, document.text) for document in documents],
        use_llm=use_llm,
        verbose=False,
    )


def configured_government_client() -> GovernmentClient | None:
    """Build the server-configured provider client, if verification is enabled."""
    if not GOVERNMENT_API_URL:
        return None
    return GovernmentClient(GOVERNMENT_API_URL, GOVERNMENT_API_TIMEOUT_SECONDS)


def verify_submission(
    documents: list[ExtractedDocument],
    bidder_name: str | None = None,
    *,
    client: GovernmentClient | None = None,
) -> dict:
    return verify_documents(
        documents,
        client if client is not None else configured_government_client(),
        bidder_name=bidder_name,
    )


def run_pipeline(
    tender_bytes: bytes,
    submission_bytes: bytes,
    *,
    requirements: RequirementsPayload | None = None,
    checklist_name: str = "Tender document checklist",
    model: str = REQUIREMENT_MODEL,
    use_ocr: bool = True,
    bidder_name: str | None = None,
    government_client: GovernmentClient | None = None,
) -> dict:
    tender = tender_context(tender_bytes)
    extraction = requirements or requirements_from_context(tender["context"], model)
    if requirements is not None and requirements.extraction_method == "provided":
        extraction = requirements.model_copy(update={"extraction_method": "officer_reviewed"})
    checklist_data = checklist_from_requirements(extraction, checklist_name)
    documents = extract_submission(submission_bytes, use_ocr)
    report = match_submission(ChecklistPayload.model_validate(checklist_data), documents)
    government_verification = verify_submission(
        documents,
        bidder_name,
        client=government_client,
    )
    decision = validate_real_submission(
        checklist_data,
        documents,
        report,
        government_verification=government_verification,
    )
    document_summaries = [
        {
            "source_file": document.source_file,
            "status": document.status,
            "note": document.note,
            "text_length": len(document.text),
            "fields": extract_fields(document.source_file, document.text),
        }
        for document in documents
    ]
    findings = decision["findings"]
    return {
        "tender": {"pages": tender["pages"], "page_count": tender["page_count"]},
        "requirements": extraction.model_dump(mode="json"),
        "checklist": checklist_data,
        "documents": document_summaries,
        "findings": findings,
        "decision": decision,
        "government_verification": government_verification,
        "report": report,
    }

"""
Document classifier for bidder submissions.

Pipeline:
    filename + extracted text
        -> deterministic rules
        -> if confident: return classification
        -> if ambiguous: optional Ollama fallback
        -> otherwise UNKNOWN / REVIEW

The classifier deliberately does NOT decide compliance.
It only identifies the type of evidence/document submitted.
"""

import json
import logging
import re
from pathlib import Path

import requests
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "phi3:mini"
OLLAMA_TIMEOUT = 120

DOCUMENT_TYPES = [
    "GST_CERTIFICATE",
    "PAN_CARD",
    "TAN_CERTIFICATE",
    "UDYAM_CERTIFICATE",
    "INCOME_TAX_DOCUMENT",
    "TURNOVER_CERTIFICATE",
    "AUDITED_FINANCIAL_STATEMENTS",
    "EXPERIENCE_CERTIFICATE",
    "WORK_ORDER",
    "PERFORMANCE_CERTIFICATE",
    "OEM_AUTHORIZATION",
    "BID_SECURITY_DECLARATION",
    "MAKE_IN_INDIA_DECLARATION",
    "EPFO_CERTIFICATE",
    "ESIC_CERTIFICATE",
    "STARTUP_INDIA_CERTIFICATE",
    "NSIC_CERTIFICATE",
    "TECHNICAL_DOCUMENT",
    "PRICE_BID",
    "BOQ",
    "DECLARATION",
    "UNDERTAKING",
    "OTHER",
    "UNKNOWN",
]


class DocumentClassification(BaseModel):
    document_type: str
    confidence: float = Field(ge=0.0, le=1.0)
    classification_status: str
    reason: str


# Strong filename signals. These are intentionally conservative.
FILENAME_RULES = {
    "GST_CERTIFICATE": [
        r"\bgst\b",
        r"\bgstin\b",
        r"gst.?certificate",
        r"gst.?registration",
    ],
    "PAN_CARD": [
        r"\bpan\b",
        r"pan.?card",
        r"pan.?certificate",
    ],
    "TAN_CERTIFICATE": [
        r"\btan\b",
        r"tan.?certificate",
    ],
    "UDYAM_CERTIFICATE": [
        r"udyam",
        r"msme",
        r"udyam.?registration",
    ],
    "INCOME_TAX_DOCUMENT": [
        r"income.?tax",
        r"itr",
        r"tax.?return",
    ],
    "TURNOVER_CERTIFICATE": [
        r"turnover",
        r"annual.?turnover",
        r"ca.?certificate",
    ],
    "AUDITED_FINANCIAL_STATEMENTS": [
        r"balance.?sheet",
        r"profit.?and.?loss",
        r"profit.?loss",
        r"financial.?statement",
        r"audited.?accounts",
        r"audited.?financial",
    ],
    "EXPERIENCE_CERTIFICATE": [
        r"experience",
        r"similar.?work",
        r"similar.?works",
    ],
    "WORK_ORDER": [
        r"work.?order",
        r"purchase.?order",
        r"\bpo\b",
    ],
    "PERFORMANCE_CERTIFICATE": [
        r"performance",
        r"completion",
        r"satisfactory.?performance",
    ],
    "OEM_AUTHORIZATION": [
        r"oem",
        r"authorization",
        r"authorisation",
        r"authorized.?dealer",
        r"authorised.?dealer",
    ],
    "BID_SECURITY_DECLARATION": [
        r"bid.?security",
        r"bid.?security.?declaration",
        r"security.?declaration",
    ],
    "MAKE_IN_INDIA_DECLARATION": [
        r"make.?in.?india",
        r"local.?content",
        r"local.?supplier",
    ],
    "EPFO_CERTIFICATE": [
        r"epfo",
        r"pf.?registration",
        r"provident.?fund",
    ],
    "ESIC_CERTIFICATE": [
        r"esic",
        r"esi.?registration",
    ],
    "STARTUP_INDIA_CERTIFICATE": [
        r"startup.?india",
        r"startup.?recognition",
        r"dpiit",
    ],
    "NSIC_CERTIFICATE": [
        r"nsic",
        r"small.?scale",
    ],
    "PRICE_BID": [
        r"price.?bid",
        r"financial.?bid",
        r"commercial.?offer",
    ],
    "BOQ": [
        r"\bboq\b",
        r"bill.?of.?quantities",
        r"price.?breakup",
    ],
    "TECHNICAL_DOCUMENT": [
        r"technical",
        r"datasheet",
        r"specification",
        r"technical.?offer",
    ],
    "UNDERTAKING": [
        r"undertaking",
    ],
    "DECLARATION": [
        r"declaration",
        r"self.?declaration",
    ],
}


# Content signatures are stronger than generic filename words.
CONTENT_RULES = {
    "GST_CERTIFICATE": [
        r"\bgstin\b",
        r"goods and services tax",
        r"gst registration",
    ],
    "PAN_CARD": [
        r"permanent account number",
        r"\bpan\b.*\b(income tax|department)\b",
    ],
    "UDYAM_CERTIFICATE": [
        r"udyam registration",
        r"udyam registration number",
        r"ministry of micro, small and medium enterprises",
    ],
    "TURNOVER_CERTIFICATE": [
        r"average annual turnover",
        r"annual turnover",
        r"turnover certificate",
        r"certified turnover",
    ],
    "AUDITED_FINANCIAL_STATEMENTS": [
        r"balance sheet",
        r"profit and loss account",
        r"profit & loss",
        r"auditor",
        r"audited financial statements",
    ],
    "EXPERIENCE_CERTIFICATE": [
        r"experience certificate",
        r"similar work",
        r"successfully completed",
        r"years of experience",
    ],
    "WORK_ORDER": [
        r"work order",
        r"purchase order",
        r"letter of award",
    ],
    "PERFORMANCE_CERTIFICATE": [
        r"performance certificate",
        r"satisfactory performance",
        r"completion certificate",
    ],
    "OEM_AUTHORIZATION": [
        r"authorized.*oem",
        r"authorised.*oem",
        r"manufacturer.*authorization",
        r"manufacturer.*authorisation",
    ],
    "MAKE_IN_INDIA_DECLARATION": [
        r"make in india",
        r"local content",
        r"class-i local supplier",
        r"class-ii local supplier",
    ],
    "BID_SECURITY_DECLARATION": [
        r"bid security declaration",
        r"bid security",
    ],
    "EPFO_CERTIFICATE": [
        r"employees.*provident fund",
        r"epfo",
        r"provident fund organization",
    ],
    "ESIC_CERTIFICATE": [
        r"employees.*state insurance",
        r"\besic\b",
    ],
    "STARTUP_INDIA_CERTIFICATE": [
        r"startup india",
        r"dpiit recognition",
        r"department for promotion of industry",
    ],
    "NSIC_CERTIFICATE": [
        r"\bnsic\b",
        r"national small industries corporation",
    ],
    "PRICE_BID": [
        r"price bid",
        r"financial bid",
        r"commercial offer",
    ],
    "BOQ": [
        r"bill of quantities",
        r"\bboq\b",
    ],
}


def _normalise(value: str) -> str:
    return re.sub(r"[\s_\-]+", " ", value.lower()).strip()


def _score_rules(filename: str, text: str) -> dict[str, float]:
    name = _normalise(Path(filename).stem)
    content = text[:20000].lower()

    scores = {doc_type: 0.0 for doc_type in DOCUMENT_TYPES}

    for doc_type, patterns in FILENAME_RULES.items():
        for pattern in patterns:
            if re.search(pattern, name, re.IGNORECASE):
                scores[doc_type] += 3.0

    for doc_type, patterns in CONTENT_RULES.items():
        for pattern in patterns:
            if re.search(pattern, content, re.IGNORECASE | re.DOTALL):
                scores[doc_type] += 1.0

    return scores


def _deterministic_classification(
    filename: str,
    text: str,
) -> DocumentClassification | None:
    scores = _score_rules(filename, text)

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_type, best_score = ranked[0]

    if best_score <= 0:
        return None

    second_score = ranked[1][1]

    # Strong filename match, or several independent content signals.
    if best_score >= 4.0 and best_score - second_score >= 1.0:
        confidence = min(0.98, 0.70 + 0.05 * best_score)
        return DocumentClassification(
            document_type=best_type,
            confidence=confidence,
            classification_status="CLASSIFIED",
            reason="Deterministic filename/content rules produced a clear match.",
        )

    # A weaker but still useful result should be reviewed rather than treated
    # as certain.
    if best_score >= 2.0:
        confidence = min(0.79, 0.55 + 0.04 * best_score)
        return DocumentClassification(
            document_type=best_type,
            confidence=confidence,
            classification_status="REVIEW",
            reason="A possible document type was detected, but the evidence is ambiguous.",
        )

    return None


OLLAMA_PROMPT = """You classify a bidder-submitted procurement document.

Return ONLY valid JSON with exactly these fields:
{{
  "document_type": "one value from the allowed list",
  "confidence": 0.0,
  "reason": "short evidence-based reason"
}}

Allowed document_type values:
{allowed_types}

Rules:
1. Classify the document itself, not whether it complies with a tender.
2. Use UNKNOWN when the document type cannot be determined.
3. Do not invent identifiers, amounts, dates, or facts.
4. Confidence must be between 0 and 1.
5. Base the reason only on the supplied filename and document text.

FILENAME:
{filename}

DOCUMENT TEXT:
{content}
"""


def _ollama_classification(
    filename: str,
    text: str,
) -> DocumentClassification:
    content = text[:12000]

    prompt = OLLAMA_PROMPT.format(
        allowed_types=", ".join(DOCUMENT_TYPES),
        filename=filename,
        content=content,
    )

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0},
            },
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()

        raw = response.json().get("response", "").strip()
        data = json.loads(raw)

        document_type = data.get("document_type", "UNKNOWN")
        confidence = float(data.get("confidence", 0.0))
        reason = str(data.get("reason", "No reason supplied."))

        if document_type not in DOCUMENT_TYPES:
            document_type = "UNKNOWN"

        confidence = max(0.0, min(1.0, confidence))

        if document_type == "UNKNOWN" or confidence < 0.60:
            status = "REVIEW"
        else:
            status = "CLASSIFIED"

        return DocumentClassification(
            document_type=document_type,
            confidence=confidence,
            classification_status=status,
            reason=reason,
        )

    except requests.ConnectionError:
        logger.warning("Ollama unavailable while classifying %s", filename)
    except requests.Timeout:
        logger.warning("Ollama timed out while classifying %s", filename)
    except (json.JSONDecodeError, ValueError, TypeError, KeyError) as exc:
        logger.warning("Invalid Ollama classification for %s: %s", filename, exc)
    except requests.RequestException as exc:
        logger.warning("Ollama request failed for %s: %s", filename, exc)
    except Exception as exc:
        logger.exception("Unexpected classifier error for %s: %s", filename, exc)

    return DocumentClassification(
        document_type="UNKNOWN",
        confidence=0.0,
        classification_status="REVIEW",
        reason="Document could not be classified deterministically and LLM fallback was unavailable or invalid.",
    )


def classify_document(
    filename: str,
    text: str,
    use_llm_fallback: bool = True,
) -> DocumentClassification:
    """
    Main classifier.

    The LLM is only used when deterministic classification is inconclusive.
    This prevents an Ollama call for every bidder document.
    """
    deterministic = _deterministic_classification(filename, text)

    if deterministic is not None and deterministic.classification_status == "CLASSIFIED":
        return deterministic

    if not use_llm_fallback:
        if deterministic is not None:
            return deterministic
        return DocumentClassification(
            document_type="UNKNOWN",
            confidence=0.0,
            classification_status="REVIEW",
            reason="No sufficiently strong deterministic document-type signal was found.",
        )

    llm_result = _ollama_classification(filename, text)

    # Preserve a deterministic review result if the LLM is unable to classify.
    if (
        llm_result.document_type == "UNKNOWN"
        and deterministic is not None
    ):
        return deterministic

    return llm_result

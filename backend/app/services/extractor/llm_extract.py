from ollama import chat
from app.config import REQUIREMENT_MODEL
from .req import RequirementExtraction


def extract_requirements(
    context: str,
    model: str = REQUIREMENT_MODEL,
) -> RequirementExtraction:

    response = chat(
        model=model,
        messages=[
            {
                "role": "system",
                "content": """
/no_think
You are a procurement compliance extraction system.

Extract ONLY bidder-facing compliance requirements from the supplied tender text.

For every requirement:
- name: concise requirement name
- description: what the bidder must satisfy or submit
- domain: choose the most appropriate domain
- category: choose the most appropriate category
- mandatory: true only when the tender clearly indicates it is mandatory
- evidence_types: documents/certificates/declarations required
- source_page: page where the requirement appears
- source_text: exact relevant text supporting the requirement
- requirement_type: evidence, eligibility, declaration, commercial, or post_award
- condition: when the requirement applies; null only when it applies to every bidder
- thresholds: stated amounts, percentages, dates, counts, years, or other measurable limits
- review_required: true unless the clause is unambiguous and unconditional
- sub_requirements: independently checkable parts of this requirement. Each
  has name, description, mandatory, evidence_types, source_page, source_text,
  condition, thresholds, and review_required.

Rules:
1. Do not invent requirements.
2. Do not infer facts that are not stated.
3. Do not summarize general tender content.
4. Separate distinct requirements.
5. A single page may contain multiple requirements.
6. Preserve traceability to the source page.
7. Do not treat post-award obligations as bid-submission evidence requirements.
8. Do not mark a conditional clause mandatory for every bidder.
9. Keep a parent requirement for the officer, but split separate documents,
   thresholds, signatures, dates, and bidder-role conditions into its
   sub_requirements. Do not create a sub-requirement when it cannot be tied to
   tender text.
"""
            },
            {
                "role": "user",
                "content": context
            }
        ],
        format=RequirementExtraction.model_json_schema(),
        options={
            "temperature": 0
        }
    )

    return RequirementExtraction.model_validate_json(
        response.message.content
    )

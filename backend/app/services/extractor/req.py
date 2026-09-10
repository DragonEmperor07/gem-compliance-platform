from pydantic import BaseModel, Field


class SubRequirementDraft(BaseModel):
    name: str
    description: str
    mandatory: bool = True
    evidence_types: list[str] = Field(default_factory=list)
    source_page: int | None = None
    source_text: str = ""
    condition: str | None = None
    thresholds: list[dict[str, str]] = Field(default_factory=list)
    review_required: bool = True


class RequirementDraft(BaseModel):
    name: str
    description: str
    domain: str
    category: str
    mandatory: bool
    evidence_types: list[str]
    source_page: int | None
    source_text: str
    requirement_type: str = "evidence"
    condition: str | None = None
    thresholds: list[dict[str, str]] = Field(default_factory=list)
    review_required: bool = True
    sub_requirements: list[SubRequirementDraft] = Field(default_factory=list)


class RequirementExtraction(BaseModel):
    requirements: list[RequirementDraft]

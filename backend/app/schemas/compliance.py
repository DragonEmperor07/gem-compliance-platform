from typing import Any, Literal

from pydantic import BaseModel, Field


class SubRequirement(BaseModel):
    """One independently reviewable criterion within a tender requirement."""

    name: str
    description: str
    mandatory: bool = True
    evidence_types: list[str] = Field(default_factory=list)
    source_page: int | None = None
    source_text: str = ""
    condition: str | None = None
    thresholds: list[dict[str, str]] = Field(default_factory=list)
    review_required: bool = True


class Requirement(BaseModel):
    name: str
    description: str
    domain: str = "general"
    category: str = "eligibility"
    mandatory: bool = True
    evidence_types: list[str] = Field(default_factory=list)
    source_page: int | None = None
    source_text: str = ""
    requirement_type: str = "evidence"
    condition: str | None = None
    thresholds: list[dict[str, str]] = Field(default_factory=list)
    review_required: bool = True
    sub_requirements: list[SubRequirement] = Field(default_factory=list)


class RequirementsPayload(BaseModel):
    requirements: list[Requirement]
    extraction_method: Literal["ollama", "heuristic", "officer_reviewed", "provided"] = "provided"
    fallback_reason: str | None = None
    warnings: list[str] = Field(default_factory=list)


class ChecklistDocument(BaseModel):
    id: str
    label: str
    required: bool
    aliases: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    criteria: list[dict[str, Any]] = Field(default_factory=list)


class ChecklistPayload(BaseModel):
    checklist_name: str = "Tender document checklist"
    documents: list[ChecklistDocument]
    unmapped_requirements: list[dict[str, Any]] = Field(default_factory=list)

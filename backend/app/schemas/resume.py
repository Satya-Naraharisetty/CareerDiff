"""Resume extraction and claims schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ResumeUploadResponse(BaseModel):
    """Initial response returned upon resume upload acceptance."""

    resume_id: uuid.UUID
    status: str
    filename: str


class ResumeClaimRead(BaseModel):
    """Verifiable claim extracted with exact character offsets."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    claim_text: str
    category: str
    source_section: str
    start_offset: int
    end_offset: int
    technologies: list[str] = Field(default_factory=list)
    confidence_score: float = 1.0
    created_at: datetime


class ResumeRead(BaseModel):
    """Full resume detail with extracted claims and source text."""

    model_config = ConfigDict(from_attributes=True)

    resume_id: uuid.UUID
    status: str
    filename: str
    raw_extracted_text: str | None = None
    claims: list[ResumeClaimRead] = Field(default_factory=list)


class ResumeTextUploadRequest(BaseModel):
    """Payload for submitting raw resume text directly."""

    raw_text: str = Field(
        min_length=10, max_length=100000, description="Raw text of the candidate resume"
    )
    filename: str = Field(default="pasted_resume.txt", max_length=255)


class ResumeAnalysisResponse(BaseModel):
    """Comprehensive response returned upon resume parsing and profile analysis."""

    model_config = ConfigDict(from_attributes=True)

    resume_id: uuid.UUID
    status: str
    filename: str
    detected_seniority: str
    primary_discipline: str
    years_experience: int
    summary: str
    verified_skills: list[str] = Field(default_factory=list)
    claims: list[ResumeClaimRead] = Field(default_factory=list)
    recommended_role_id: uuid.UUID | None = None
    recommended_role_name: str | None = None

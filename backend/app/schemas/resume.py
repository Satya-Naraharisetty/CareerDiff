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

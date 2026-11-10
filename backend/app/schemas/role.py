"""Schemas for Job Roles, Competency Catalog, and Job Description (JD) Intelligence."""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class CompetencyRead(BaseModel):
    """Competency information schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    display_order: int


class JobRoleRead(BaseModel):
    """Job role details with associated competencies."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    competencies: list[CompetencyRead] = []


class RoleListResponse(BaseModel):
    """Collection wrapper for role catalog listings."""

    items: list[JobRoleRead]


class JdAnalysisRequest(BaseModel):
    """Payload containing raw Job Description text to calibrate custom interview role."""

    jd_text: str = Field(min_length=15, max_length=50000, description="Raw job description text")
    job_title: str | None = Field(default=None, max_length=100)


class JdAnalysisResponse(BaseModel):
    """Analysis result of job description with tailored role and competencies."""

    model_config = ConfigDict(from_attributes=True)

    role: JobRoleRead
    extracted_title: str
    detected_seniority: str
    primary_discipline: str
    key_requirements: list[str] = Field(default_factory=list)
    matched_technologies: list[str] = Field(default_factory=list)
    tailored_competencies: list[CompetencyRead] = Field(default_factory=list)

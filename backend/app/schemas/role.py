"""Schemas for Job Roles, Competency Catalog, and Job Description (JD) Intelligence."""

import uuid
from typing import Literal

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
    suggested_company_name: str | None = None
    suggested_persona: Literal["STANDARD", "BIG_TECH", "SCALE_UP", "FINTECH"] | None = None


class ResumeJdMatchRequest(BaseModel):
    """Payload to compute comparative fit between resume and job description."""

    resume_text: str = Field(min_length=10, max_length=100000)
    jd_text: str = Field(min_length=10, max_length=50000)
    resume_skills: list[str] = Field(default_factory=list)
    jd_technologies: list[str] = Field(default_factory=list)
    candidate_seniority: str = Field(default="SENIOR")
    required_seniority: str = Field(default="SENIOR")


class ResumeJdMatchResponse(BaseModel):
    """Comparative alignment metrics and interview calibration between resume and JD."""

    match_score_pct: int = Field(ge=0, le=100)
    alignment_summary: str
    seniority_fit: str
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    differentiating_skills: list[str] = Field(default_factory=list)
    adaptive_interview_strategy: str


class CompanyAnalysisRequest(BaseModel):
    """Payload to classify and calibrate company engineering archetype."""

    company_name: str = Field(
        min_length=2, max_length=120, description="Company or organization name"
    )
    jd_text: str | None = Field(
        default=None, max_length=50000, description="Optional job description context"
    )


class CompanyAnalysisResponse(BaseModel):
    """Classification of company engineering scale, archetype, and recommended persona."""

    company_name: str
    detected_persona: Literal["STANDARD", "BIG_TECH", "SCALE_UP", "FINTECH"]
    scale_tier: str
    rationale: str
    architectural_focus: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.9)

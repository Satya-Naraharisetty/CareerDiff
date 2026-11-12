"""Pydantic schemas for Assessment Reports, Competency Scores, and Normalized Evidence."""

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class EvidenceType(str, Enum):
    """Classification of grounded transcript evidence."""

    POSITIVE_MASTERY = "POSITIVE_MASTERY"
    KNOWLEDGE_GAP = "KNOWLEDGE_GAP"
    CONTRADICTION = "CONTRADICTION"
    SUPERFICIAL_EXPLANATION = "SUPERFICIAL_EXPLANATION"


class AssessmentImpact(str, Enum):
    """Weighting effect of evidence on competency scoring."""

    UPWEIGHT = "UPWEIGHT"
    DOWNWEIGHT = "DOWNWEIGHT"
    NEUTRAL = "NEUTRAL"
    DISQUALIFYING = "DISQUALIFYING"


class ScoreStatus(str, Enum):
    """Evaluation completeness status of a competency."""

    EVALUATED = "EVALUATED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class ClaimVerificationStatus(str, Enum):
    """Verification outcome for an extracted resume claim."""

    VERIFIED = "VERIFIED"
    CONTRADICTED = "CONTRADICTED"
    VAGUE = "VAGUE"
    UNTESTED = "UNTESTED"


class EvaluationEvidenceRead(BaseModel):
    """Single normalized piece of grounded evidence with character offsets."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    interview_turn_id: uuid.UUID
    turn_index: int
    evidence_type: EvidenceType
    assessment_impact: AssessmentImpact
    transcript_excerpt: str
    start_char_offset: int
    end_char_offset: int
    confidence: float
    rationale: str


class CompetencyScoreRead(BaseModel):
    """Individual dimension rating with linked normalized evidence."""

    model_config = ConfigDict(from_attributes=True)

    competency_id: uuid.UUID
    competency_name: str
    score: int | None = Field(default=None, ge=1, le=4)
    status: ScoreStatus
    rationale: str
    confidence: float
    evidence_items: list[EvaluationEvidenceRead] = Field(default_factory=list)


class ClaimVerificationRead(BaseModel):
    """Verification record of a candidate resume claim against spoken interview turns."""

    model_config = ConfigDict(from_attributes=True)

    claim_id: uuid.UUID
    claim_text: str
    category: str
    status: ClaimVerificationStatus
    confidence: float
    auditor_notes: str | None = None
    verified_turn_index: int | None = None


class AssessmentReportRead(BaseModel):
    """Comprehensive candidate evaluation dossier."""

    model_config = ConfigDict(from_attributes=True)

    report_id: uuid.UUID
    interview_id: uuid.UUID
    version: int
    is_latest: bool
    model_used: str
    overall_score: float | None
    summary: str
    strengths: list[str] = Field(default_factory=list)
    knowledge_gaps: list[str] = Field(default_factory=list)
    study_recommendations: list[str] = Field(default_factory=list)
    ats_score: int | None = None
    ats_breakdown: dict[str, Any] | None = None
    communication_score: int | None = None
    communication_breakdown: dict[str, Any] | None = None
    competency_scores: list[CompetencyScoreRead] = Field(default_factory=list)
    claim_verifications: list[ClaimVerificationRead] = Field(default_factory=list)
    created_at: datetime


class EvaluationTriggerResponse(BaseModel):
    """Response returned upon triggering post-interview asynchronous evaluation."""

    interview_id: uuid.UUID
    status: str
    message: str
    task_id: str | None = None

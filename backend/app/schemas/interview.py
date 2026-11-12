"""Schemas for Interview Sessions and Blueprints."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BlueprintTopicRead(BaseModel):
    """Topic allocation summary in an interview blueprint."""

    model_config = ConfigDict(from_attributes=True)

    topic_name: str
    allocated_seconds: int
    mapped_claims_count: int = 0


class InterviewBlueprintRead(BaseModel):
    """Interview blueprint topic plan and time distribution."""

    model_config = ConfigDict(from_attributes=True)

    total_topics: int
    total_allocated_seconds: int
    warmup_seconds: int
    conclusion_seconds: int
    topics: list[BlueprintTopicRead] = []


class InterviewCreateRequest(BaseModel):
    """Payload to configure and initiate a new interview."""

    role_id: uuid.UUID
    target_seniority: Literal["JUNIOR", "MID", "SENIOR", "STAFF"] = "SENIOR"
    duration_minutes: int = Field(default=30, ge=15, le=60)
    mode: Literal["VOICE", "TEXT"] = "VOICE"
    preferred_language: str = Field(
        default="Python",
        description="Candidate's chosen primary programming language for code and questions",
    )
    jd_text: str | None = Field(
        default=None,
        description="Raw calibrated job description text for ATS and interview alignment",
    )
    company_persona: Literal["STANDARD", "BIG_TECH", "SCALE_UP", "FINTECH"] = Field(
        default="STANDARD",
        description="Target company interview style and questioning depth persona",
    )
    target_company: str | None = Field(
        default=None,
        description="Target company name for contextual scenarios and reverse Q&A",
    )


class TurnRetakeRequest(BaseModel):
    """Payload to re-attempt an interview turn for immediate feedback and delta scoring."""

    turn_index: int
    new_transcript: str = Field(min_length=5, max_length=5000)
    code_snippet: str | None = None


class TurnRetakeResponse(BaseModel):
    """Evaluation delta and coaching feedback for a re-attempted turn."""

    turn_index: int
    previous_transcript: str
    new_transcript: str
    previous_estimated_score: float
    new_score: float
    score_delta: float
    improved_tier: str
    coaching_feedback: str
    staff_model_answer: str
    key_strengths_improved: list[str] = Field(default_factory=list)


class InterviewCreateResponse(BaseModel):
    """Response returned upon successful interview creation with generated blueprint."""

    model_config = ConfigDict(from_attributes=True)

    interview_id: uuid.UUID
    state: str
    scheduled_duration_minutes: int
    blueprint: InterviewBlueprintRead

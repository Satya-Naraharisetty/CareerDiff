"""Pydantic schemas and enums for Adaptive Interview Engine, Actions, and Turns."""

import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class EngineAction(StrEnum):
    """Closed 9-action decision space for interviewer turns."""

    PROBE_DEEPER = "PROBE_DEEPER"
    CLARIFY = "CLARIFY"
    CHALLENGE = "CHALLENGE"
    VERIFY_CLAIM = "VERIFY_CLAIM"
    SCENARIO = "SCENARIO"
    CHANGE_TOPIC = "CHANGE_TOPIC"
    SIMPLIFY = "SIMPLIFY"
    REVISIT = "REVISIT"
    CONCLUDE = "CONCLUDE"


class QuestionArchetype(StrEnum):
    """Comprehensive taxonomy of technical interview question categories."""

    WARMUP_MOTIVATION = "WARMUP_MOTIVATION"
    SKILL_FUNDAMENTALS = "SKILL_FUNDAMENTALS"
    SYSTEM_ARCHITECTURE = "SYSTEM_ARCHITECTURE"
    SCENARIO_DECISION = "SCENARIO_DECISION"
    ANALYZING_DESIGN = "ANALYZING_DESIGN"
    DEBUGGING_INCIDENT = "DEBUGGING_INCIDENT"
    CODE_REVIEW = "CODE_REVIEW"
    COMPANY_SPECIFIC = "COMPANY_SPECIFIC"
    REVERSE_QA = "REVERSE_QA"


class InterviewState(StrEnum):
    """Macro lifecycle states for an interview session."""

    CREATED = "CREATED"
    WARMUP = "WARMUP"
    TECHNICAL_CORE = "TECHNICAL_CORE"
    CONCLUDING = "CONCLUDING"
    COMPLETED = "COMPLETED"
    PAUSED = "PAUSED"
    ABORTED = "ABORTED"


class Speaker(StrEnum):
    """Speaker role enum for turns."""

    CANDIDATE = "CANDIDATE"
    INTERVIEWER = "INTERVIEWER"
    SYSTEM = "SYSTEM"


class AnswerDepth(StrEnum):
    """Observed depth of candidate technical answer."""

    SHALLOW = "SHALLOW"
    ADEQUATE = "ADEQUATE"
    DEEP = "DEEP"
    EVASIVE = "EVASIVE"
    STUCK = "STUCK"


class SessionPolicy(BaseModel):
    """Configurable policy constraints and budgets governing interview behavior."""

    max_duration_seconds: int = Field(default=1800, ge=600, le=5400)
    conclusion_buffer_seconds: int = Field(default=180, ge=60, le=600)
    warmup_duration_seconds: int = Field(default=120, ge=60, le=600)
    max_consecutive_probes: int = Field(default=3, ge=1, le=6)
    minimum_coverage_ratio: float = Field(default=0.70, ge=0.50, le=1.0)
    min_evidence_items_per_competency: int = Field(default=2, ge=1, le=5)
    required_competency_ids: list[str] = Field(default_factory=list)


class InterpretationResult(BaseModel):
    """Fast semantic interpretation output of a candidate turn."""

    observed_depth: AnswerDepth
    contradiction_detected: bool = False
    recommended_action: EngineAction
    rationale: str
    entities_mentioned: list[str] = Field(default_factory=list)


class CandidateTurnRequest(BaseModel):
    """Candidate inbound turn payload."""

    transcript: str = Field(min_length=1, max_length=10000)
    duration_ms: int | None = Field(default=None, ge=0)
    code_snippet: str | None = Field(
        default=None,
        max_length=15000,
        description="Optional architecture diagram, SQL schema, or code snippet from scratchpad",
    )


class InterviewerTurnResponse(BaseModel):
    """Interviewer response turn emitted back to client."""

    turn_index: int
    speaker: str = "INTERVIEWER"
    transcript: str
    action_taken: EngineAction
    session_state: str
    active_topic: str | None = None
    question_archetype: str | None = None
    code_sample: str | None = None
    created_at: datetime


class InterviewTurnRead(BaseModel):
    """Persisted turn representation for transcript history."""

    turn_index: int
    speaker: str
    transcript: str
    action_taken: str | None = None
    question_archetype: str | None = None
    code_sample: str | None = None
    audio_duration_ms: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InterviewDetailResponse(BaseModel):
    """Detailed view of active interview session."""

    id: uuid.UUID
    state: str
    target_seniority: str
    scheduled_duration_minutes: int
    actual_duration_seconds: int
    current_topic: str | None = None
    consecutive_probes: int = 0
    total_turns: int = 0
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

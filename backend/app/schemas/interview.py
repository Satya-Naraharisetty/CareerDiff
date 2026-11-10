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


class InterviewCreateResponse(BaseModel):
    """Response returned upon successful interview creation with generated blueprint."""

    model_config = ConfigDict(from_attributes=True)

    interview_id: uuid.UUID
    state: str
    scheduled_duration_minutes: int
    blueprint: InterviewBlueprintRead

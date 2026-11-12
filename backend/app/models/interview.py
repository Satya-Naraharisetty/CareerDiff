"""SQLAlchemy 2.0 models for Interview Sessions, Blueprints, and Planned Topics."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.role import Competency, JobRole
    from app.models.user import CandidateProfile


class Interview(Base):
    """Interview session record with configurable policy and state tracking."""

    __tablename__ = "interviews"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    candidate_profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("job_roles.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    target_seniority: Mapped[str] = mapped_column(
        String(20),
        default="SENIOR",
        nullable=False,
    )
    state: Mapped[str] = mapped_column(
        String(30),
        default="CREATED",
        nullable=False,
    )
    mode: Mapped[str] = mapped_column(
        String(20),
        default="VOICE",
        nullable=False,
    )
    scheduled_duration_minutes: Mapped[int] = mapped_column(
        Integer,
        default=30,
        nullable=False,
    )
    actual_duration_seconds: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    session_policy: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    candidate_profile: Mapped["CandidateProfile"] = relationship()
    role: Mapped["JobRole"] = relationship(
        back_populates="interviews",
    )
    blueprint: Mapped["InterviewBlueprint | None"] = relationship(
        back_populates="interview",
        uselist=False,
        cascade="all, delete-orphan",
    )
    turns: Mapped[list["InterviewTurn"]] = relationship(
        back_populates="interview",
        cascade="all, delete-orphan",
        order_by="InterviewTurn.turn_index",
    )


class InterviewBlueprint(Base):
    """Deterministic topic schedule and time budget allocation for an interview."""

    __tablename__ = "interview_blueprints"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    total_topics: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    total_allocated_seconds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    warmup_seconds: Mapped[int] = mapped_column(
        Integer,
        default=120,
        nullable=False,
    )
    conclusion_seconds: Mapped[int] = mapped_column(
        Integer,
        default=180,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    interview: Mapped["Interview"] = relationship(
        back_populates="blueprint",
    )
    topics: Mapped[list["BlueprintTopic"]] = relationship(
        back_populates="blueprint",
        cascade="all, delete-orphan",
        order_by="BlueprintTopic.display_order",
    )


class BlueprintTopic(Base):
    """Individual scheduled topic budget within an interview blueprint."""

    __tablename__ = "blueprint_topics"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    blueprint_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_blueprints.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    competency_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("competencies.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    display_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    topic_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    allocated_seconds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    mapped_claim_ids: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    blueprint: Mapped["InterviewBlueprint"] = relationship(
        back_populates="topics",
    )
    competency: Mapped["Competency"] = relationship(
        back_populates="blueprint_topics",
    )


class InterviewTurn(Base):
    """Immutable sequence of candidate and interviewer utterances."""

    __tablename__ = "interview_turns"
    __table_args__ = (
        UniqueConstraint("interview_id", "turn_index", name="uq_turn_sequence"),
        Index("idx_turns_interview", "interview_id", "turn_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    speaker: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    transcript: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    action_taken: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )
    interrupted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    audio_duration_ms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    latency_ms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    question_archetype: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    code_sample: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    interview: Mapped["Interview"] = relationship(
        back_populates="turns",
    )

"""SQLAlchemy 2.0 models for Assessment Reports, Competency Scores, and Normalized Evidence."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.interview import Interview, InterviewTurn
    from app.models.resume import ResumeClaim
    from app.models.role import Competency


class AssessmentReport(Base):
    """Versioned evaluation dossier compiled after interview completion."""

    __tablename__ = "assessment_reports"
    __table_args__ = (
        UniqueConstraint("interview_id", "version", name="uq_interview_report_version"),
        Index("idx_reports_interview", "interview_id"),
        Index(
            "uq_reports_latest",
            "interview_id",
            unique=True,
            postgresql_where=text("is_latest = TRUE"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    is_latest: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    prompt_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    rubric_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    model_used: Mapped[str] = mapped_column(
        String(100),
        default="gemini-2.5-pro",
        nullable=False,
    )
    overall_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    summary: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    strengths: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    knowledge_gaps: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    study_recommendations: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    interview: Mapped["Interview"] = relationship()
    competency_scores: Mapped[list["CompetencyScore"]] = relationship(
        back_populates="assessment_report",
        cascade="all, delete-orphan",
    )


class CompetencyScore(Base):
    """Individual dimension rating representing aggregate performance on a competency."""

    __tablename__ = "competency_scores"
    __table_args__ = (
        UniqueConstraint("assessment_report_id", "competency_id", name="uq_report_competency"),
        Index("idx_comp_scores_report", "assessment_report_id"),
        Index("idx_comp_scores_competency", "competency_id"),
        CheckConstraint(
            "(status = 'INSUFFICIENT_EVIDENCE' AND score IS NULL) OR "
            "(status = 'EVALUATED' AND score BETWEEN 1 AND 4)",
            name="chk_score_status_semantics",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    assessment_report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assessment_reports.id", ondelete="CASCADE"),
        nullable=False,
    )
    competency_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("competencies.id", ondelete="RESTRICT"),
        nullable=False,
    )
    score: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    rationale: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    confidence: Mapped[float] = mapped_column(
        Float,
        default=1.0,
        nullable=False,
    )

    assessment_report: Mapped["AssessmentReport"] = relationship(
        back_populates="competency_scores",
    )
    competency: Mapped["Competency"] = relationship()
    evidence_items: Mapped[list["EvaluationEvidence"]] = relationship(
        back_populates="competency_score",
        cascade="all, delete-orphan",
    )


class EvaluationEvidence(Base):
    """Normalized relation storing verbatim evidence items grounding each competency score."""

    __tablename__ = "evaluation_evidence"
    __table_args__ = (
        CheckConstraint("end_char_offset >= start_char_offset", name="chk_evidence_offsets"),
        Index("idx_eval_evidence_score", "competency_score_id"),
        Index("idx_eval_evidence_turn", "interview_turn_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    competency_score_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("competency_scores.id", ondelete="CASCADE"),
        nullable=False,
    )
    interview_turn_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interview_turns.id", ondelete="RESTRICT"),
        nullable=False,
    )
    evidence_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    assessment_impact: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    transcript_excerpt: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    start_char_offset: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    end_char_offset: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    evaluation_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    confidence: Mapped[float] = mapped_column(
        Float,
        default=1.0,
        nullable=False,
    )
    rationale: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    competency_score: Mapped["CompetencyScore"] = relationship(
        back_populates="evidence_items",
    )
    interview_turn: Mapped["InterviewTurn"] = relationship()


class InterviewClaimVerification(Base):
    """The session-scoped ledger validating candidate resume claims against spoken answers."""

    __tablename__ = "interview_claim_verifications"
    __table_args__ = (
        UniqueConstraint("interview_id", "resume_claim_id", name="uq_interview_claim"),
        Index("idx_claim_verif_interview", "interview_id"),
        Index("idx_claim_verif_claim", "resume_claim_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    interview_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False,
    )
    resume_claim_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("resume_claims.id", ondelete="CASCADE"),
        nullable=False,
    )
    verified_turn_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("interview_turns.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default="UNTESTED",
        nullable=False,
    )
    confidence: Mapped[float] = mapped_column(
        Float,
        default=1.0,
        nullable=False,
    )
    auditor_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    interview: Mapped["Interview"] = relationship()
    resume_claim: Mapped["ResumeClaim"] = relationship()
    verified_turn: Mapped["InterviewTurn | None"] = relationship()

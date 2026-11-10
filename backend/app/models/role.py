"""SQLAlchemy 2.0 models for Job Roles, Competencies, and Versioned Rubrics."""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.interview import BlueprintTopic, Interview


class JobRole(Base):
    """Target engineering job role track (e.g. Backend Engineering)."""

    __tablename__ = "job_roles"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    competencies: Mapped[list["Competency"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
        order_by="Competency.display_order",
    )
    interviews: Mapped[list["Interview"]] = relationship(
        back_populates="role",
    )


class Competency(Base):
    """High-level technical skill domain associated with a job role."""

    __tablename__ = "competencies"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("job_roles.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    display_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    role: Mapped["JobRole"] = relationship(
        back_populates="competencies",
    )
    rubrics: Mapped[list["Rubric"]] = relationship(
        back_populates="competency",
        cascade="all, delete-orphan",
    )
    blueprint_topics: Mapped[list["BlueprintTopic"]] = relationship(
        back_populates="competency",
    )


class Rubric(Base):
    """Immutable, versioned rubric evaluating a specific competency."""

    __tablename__ = "rubrics"
    __table_args__ = (
        UniqueConstraint("competency_id", "version", name="uq_rubric_competency_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    competency_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("competencies.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    competency: Mapped["Competency"] = relationship(
        back_populates="rubrics",
    )
    criteria: Mapped[list["RubricCriteria"]] = relationship(
        back_populates="rubric",
        cascade="all, delete-orphan",
        order_by="RubricCriteria.tier_level",
    )


class RubricCriteria(Base):
    """Specific observable criteria definition for a rubric tier (1 to 4)."""

    __tablename__ = "rubric_criteria"
    __table_args__ = (UniqueConstraint("rubric_id", "tier_level", name="uq_rubric_tier"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    rubric_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rubrics.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    tier_level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    tier_name: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    observable_criteria: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    sample_answer_gist: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    rubric: Mapped["Rubric"] = relationship(
        back_populates="criteria",
    )

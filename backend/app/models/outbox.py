"""SQLAlchemy 2.0 models for Transactional Outbox and Worker Idempotency."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OutboxEvent(Base):
    """Transactional outbox event ensuring at-least-once delivery of background jobs."""

    __tablename__ = "outbox_events"
    __table_args__ = (
        Index(
            "idx_outbox_claimable",
            "created_at",
            postgresql_where=text("status IN ('PENDING', 'CLAIMED')"),
        ),
        Index("idx_outbox_aggregate", "aggregate_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    aggregate_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    aggregate_id: Mapped[uuid.UUID] = mapped_column(
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="PENDING",
        nullable=False,
    )
    retry_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    claimed_by: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )
    claimed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    claim_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class WorkerExecution(Base):
    """Durable idempotency ledger in PostgreSQL preventing duplicate worker execution."""

    __tablename__ = "worker_executions"
    __table_args__ = (
        UniqueConstraint("task_name", "idempotency_key", name="uq_worker_task_idempotency"),
        Index(
            "idx_worker_exec_running",
            "started_at",
            postgresql_where=text("status = 'RUNNING'"),
        ),
        Index("idx_worker_exec_aggregate", "aggregate_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    task_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    aggregate_id: Mapped[uuid.UUID] = mapped_column(
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        default="RUNNING",
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    result_reference: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

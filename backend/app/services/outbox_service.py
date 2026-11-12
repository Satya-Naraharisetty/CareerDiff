"""Transactional Outbox Service ensuring at-least-once background job delivery."""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbox import OutboxEvent

logger = logging.getLogger("CareerDiff.outbox")


class OutboxService:
    """Manages creation, claiming, and dispatch of transactional outbox events."""

    @staticmethod
    def create_event(
        db: AsyncSession,
        event_type: str,
        aggregate_type: str,
        aggregate_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> OutboxEvent:
        """Create and stage an outbox event within the active database transaction.

        ADR-005 Invariant: Inserted inside the exact same ACID transaction as the state mutation.
        """
        event = OutboxEvent(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
            status="PENDING",
            retry_count=0,
        )
        db.add(event)
        logger.info(
            "Staged outbox event %s for %s:%s",
            event_type,
            aggregate_type,
            aggregate_id,
        )
        return event

    @staticmethod
    async def claim_pending_events(
        db: AsyncSession,
        batch_size: int = 10,
        worker_id: str = "outbox-poller-1",
        lease_seconds: int = 30,
    ) -> list[OutboxEvent]:
        """Claim a batch of pending or expired-lease outbox events with row-level locks.

        ADR-005 Invariant: Commits lease immediately so locks are NOT held during worker dispatch.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            select(OutboxEvent)
            .where(
                (OutboxEvent.status == "PENDING")
                | (
                    (OutboxEvent.status == "CLAIMED")
                    & (OutboxEvent.claim_expires_at.is_not(None))
                    & (OutboxEvent.claim_expires_at < now)
                )
            )
            .order_by(OutboxEvent.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(batch_size)
        )
        result = await db.execute(stmt)
        events = list(result.scalars().all())

        if not events:
            return []

        expires_at = now + timedelta(seconds=lease_seconds)
        for event in events:
            event.status = "CLAIMED"
            event.claimed_by = worker_id
            event.claimed_at = now
            event.claim_expires_at = expires_at

        await db.commit()
        for event in events:
            await db.refresh(event)

        logger.info("Claimed %d outbox events under worker lease %s", len(events), worker_id)
        return events

    @staticmethod
    async def mark_published(
        db: AsyncSession,
        event_id: uuid.UUID,
    ) -> None:
        """Mark an outbox event as confirmed published by the message broker or worker."""
        stmt = select(OutboxEvent).where(OutboxEvent.id == event_id)
        event = (await db.execute(stmt)).scalar_one_or_none()
        if not event:
            logger.warning("Outbox event %s not found to mark published", event_id)
            return

        event.status = "PUBLISHED"
        event.published_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Outbox event %s marked PUBLISHED", event_id)

    @staticmethod
    async def mark_failed(
        db: AsyncSession,
        event_id: uuid.UUID,
        error_message: str | None = None,
        max_retries: int = 5,
    ) -> None:
        """Record a dispatch failure and backoff or transition to DEAD_LETTER."""
        stmt = select(OutboxEvent).where(OutboxEvent.id == event_id)
        event = (await db.execute(stmt)).scalar_one_or_none()
        if not event:
            return

        event.retry_count += 1
        if event.retry_count >= max_retries:
            event.status = "DEAD_LETTER"
            logger.error(
                "Outbox event %s exceeded max retries (%d). Moved to DEAD_LETTER: %s",
                event_id,
                max_retries,
                error_message,
            )
        else:
            event.status = "PENDING"
            event.claimed_by = None
            event.claimed_at = None
            event.claim_expires_at = None
            logger.warning(
                "Outbox event %s failed (attempt %d). Re-enqueued to PENDING: %s",
                event_id,
                event.retry_count,
                error_message,
            )
        await db.commit()

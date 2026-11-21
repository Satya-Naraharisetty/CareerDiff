"""Outbox Poller Service dispatching claimed database events in-process."""

import asyncio
import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.outbox import OutboxEvent
from app.services.evaluator import AssessmentEvaluator
from app.services.outbox_service import OutboxService

logger = logging.getLogger("CareerDiff.outbox_poller")


class OutboxPoller:
    """Reads leased outbox events from PostgreSQL and dispatches them in-process."""

    @classmethod
    async def poll_and_dispatch_batch(
        cls,
        db: AsyncSession,
        batch_size: int = 10,
        worker_id: str = "outbox-poller-inprocess",
    ) -> int:
        """Claim a batch of pending events and dispatch them to in-process handlers."""
        events: list[OutboxEvent] = await OutboxService.claim_pending_events(
            db=db,
            batch_size=batch_size,
            worker_id=worker_id,
        )

        if not events:
            return 0

        dispatched_count = 0
        for event in events:
            try:
                await cls._dispatch_single_event(event)
                await OutboxService.mark_published(db=db, event_id=event.id)
                dispatched_count += 1
            except Exception as exc:
                logger.error("Failed to dispatch outbox event %s: %s", event.id, exc)
                await OutboxService.mark_failed(db=db, event_id=event.id, error_message=str(exc))

        return dispatched_count

    @classmethod
    async def _dispatch_single_event(cls, event: OutboxEvent) -> Any:
        """Route event payload to corresponding in-process handler."""
        if event.event_type == "interview.completed":
            interview_id = str(event.payload.get("interview_id") or event.aggregate_id)
            idempotency_key = f"outbox:{event.id}"
            logger.info(
                "In-process evaluation dispatch for interview %s (outbox event: %s)",
                interview_id,
                event.id,
            )
            # Use an isolated AsyncSession so evaluation transaction does not collide with outbox lease transaction
            async with async_session_factory() as eval_db:
                return await AssessmentEvaluator.evaluate_interview(
                    db=eval_db,
                    interview_id=uuid.UUID(interview_id),
                    idempotency_key=idempotency_key,
                )
        else:
            logger.warning("Unrecognized event_type: %s (id: %s)", event.event_type, event.id)

    @classmethod
    def trigger_dispatch_in_background(cls) -> None:
        """Fire-and-forget in-process background task to process outbox events immediately."""

        async def _dispatch_task() -> None:
            try:
                async with async_session_factory() as db:
                    await cls.poll_and_dispatch_batch(db=db, worker_id="in-process-event-trigger")
            except Exception as exc:
                logger.error("Background outbox dispatch failed: %s", exc)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_dispatch_task())
        except RuntimeError:
            pass


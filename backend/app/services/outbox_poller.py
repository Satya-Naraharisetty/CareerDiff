"""Outbox Poller Service dispatching claimed database events to background workers."""

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outbox import OutboxEvent
from app.services.outbox_service import OutboxService
from app.tasks.eval_tasks import evaluate_interview_task

logger = logging.getLogger("CareerDiff.outbox_poller")


class OutboxPoller:
    """Reads leased outbox events from PostgreSQL and dispatches them to Taskiq worker."""

    @classmethod
    async def poll_and_dispatch_batch(
        cls,
        db: AsyncSession,
        batch_size: int = 10,
        worker_id: str = "outbox-poller-1",
    ) -> int:
        """Claim a batch of pending events and dispatch them to the message broker."""
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
        """Route event payload to corresponding taskiq worker task."""
        if event.event_type == "interview.completed":
            interview_id = str(event.payload.get("interview_id") or event.aggregate_id)
            idempotency_key = f"outbox:{event.id}"
            logger.info(
                "Dispatching evaluate_interview_task for interview %s (outbox event: %s)",
                interview_id,
                event.id,
            )
            # Dispatch to Taskiq broker
            return await evaluate_interview_task.kiq(
                interview_id=interview_id,
                idempotency_key=idempotency_key,
            )
        else:
            logger.warning("Unrecognized event_type: %s (id: %s)", event.event_type, event.id)

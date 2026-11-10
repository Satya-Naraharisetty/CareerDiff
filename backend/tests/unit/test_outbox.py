"""Unit tests for Transactional Outbox pattern and poller dispatch."""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.outbox import OutboxEvent
from app.services.outbox_poller import OutboxPoller
from app.services.outbox_service import OutboxService


@pytest.mark.asyncio
async def test_outbox_event_creation_and_persistence() -> None:
    """Verify outbox event is created within active transaction and staged as PENDING."""
    async with async_session_factory() as db:
        test_agg_id = uuid.uuid4()
        event = OutboxService.create_event(
            db=db,
            event_type="test.event",
            aggregate_type="test_entity",
            aggregate_id=test_agg_id,
            payload={"message": "hello world"},
        )
        await db.commit()
        await db.refresh(event)

        assert event.id is not None
        assert event.status == "PENDING"
        assert event.event_type == "test.event"
        assert event.aggregate_id == test_agg_id
        assert event.payload == {"message": "hello world"}
        assert event.retry_count == 0


@pytest.mark.asyncio
async def test_outbox_claiming_and_lease_management() -> None:
    """Verify outbox worker claims pending events and sets lease expiration."""
    async with async_session_factory() as db:
        test_agg_id = uuid.uuid4()
        event = OutboxService.create_event(
            db=db,
            event_type="test.lease",
            aggregate_type="test_entity",
            aggregate_id=test_agg_id,
            payload={"key": "val"},
        )
        await db.commit()

        # Claim event
        claimed_events = await OutboxService.claim_pending_events(
            db=db,
            batch_size=10,
            worker_id="test-worker-1",
            lease_seconds=60,
        )
        assert any(e.id == event.id for e in claimed_events)

        claimed = next(e for e in claimed_events if e.id == event.id)
        assert claimed.status == "CLAIMED"
        assert claimed.claimed_by == "test-worker-1"
        assert claimed.claim_expires_at is not None
        assert claimed.claim_expires_at > datetime.now(timezone.utc)

        # Mark published
        await OutboxService.mark_published(db=db, event_id=claimed.id)
        stmt = select(OutboxEvent).where(OutboxEvent.id == claimed.id)
        published = (await db.execute(stmt)).scalar_one()
        assert published.status == "PUBLISHED"
        assert published.published_at is not None


@pytest.mark.asyncio
async def test_outbox_retry_and_dead_letter_transition() -> None:
    """Verify failure increments retry count and moves to DEAD_LETTER after max attempts."""
    async with async_session_factory() as db:
        test_agg_id = uuid.uuid4()
        event = OutboxService.create_event(
            db=db,
            event_type="test.retry",
            aggregate_type="test_entity",
            aggregate_id=test_agg_id,
            payload={"attempt": 1},
        )
        await db.commit()

        # Fail 2 times
        await OutboxService.mark_failed(
            db=db,
            event_id=event.id,
            error_message="Network glitch",
            max_retries=3,
        )
        stmt = select(OutboxEvent).where(OutboxEvent.id == event.id)
        e1 = (await db.execute(stmt)).scalar_one()
        assert e1.retry_count == 1
        assert e1.status == "PENDING"

        await OutboxService.mark_failed(
            db=db,
            event_id=event.id,
            error_message="Network glitch 2",
            max_retries=3,
        )
        stmt = select(OutboxEvent).where(OutboxEvent.id == event.id)
        e2 = (await db.execute(stmt)).scalar_one()
        assert e2.retry_count == 2
        assert e2.status == "PENDING"

        # 3rd failure should trigger DEAD_LETTER
        await OutboxService.mark_failed(
            db=db,
            event_id=event.id,
            error_message="Permanent broker crash",
            max_retries=3,
        )
        stmt = select(OutboxEvent).where(OutboxEvent.id == event.id)
        e3 = (await db.execute(stmt)).scalar_one()
        assert e3.retry_count == 3
        assert e3.status == "DEAD_LETTER"


@pytest.mark.asyncio
async def test_outbox_poller_dispatches_batch() -> None:
    """Verify OutboxPoller claims and dispatches interview.completed events."""
    async with async_session_factory() as db:
        interview_id = uuid.uuid4()
        event = OutboxService.create_event(
            db=db,
            event_type="interview.completed",
            aggregate_type="interview",
            aggregate_id=interview_id,
            payload={"interview_id": str(interview_id)},
        )
        await db.commit()

        count = await OutboxPoller.poll_and_dispatch_batch(
            db=db,
            batch_size=10,
            worker_id="test-poller",
        )
        assert count >= 1

        stmt = select(OutboxEvent).where(OutboxEvent.id == event.id)
        refreshed = (await db.execute(stmt)).scalar_one()
        assert refreshed.status == "PUBLISHED"

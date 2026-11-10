"""Unit tests for WebSocket single-use ticket lifecycle and Redis GETDEL atomicity."""

import uuid

import pytest

from app.core.redis import get_redis_client
from app.services.ticket_service import TicketService


@pytest.mark.asyncio
async def test_ticket_creation_and_atomic_consumption() -> None:
    """Verify single-use resumption tickets are generated and consumed atomically."""
    redis = get_redis_client()
    try:
        interview_id = uuid.uuid4()
        user_id = uuid.uuid4()

        # 1. Create single-use ticket
        ticket = await TicketService.create_ticket(
            redis=redis,
            interview_id=interview_id,
            user_id=user_id,
            ttl_seconds=60,
        )
        assert ticket.startswith("v4.ticket.")

        # 2. Consume ticket first time -> Success
        payload = await TicketService.validate_and_consume_ticket(
            redis=redis,
            ticket=ticket,
            expected_interview_id=interview_id,
        )
        assert payload is not None
        assert payload["interview_id"] == str(interview_id)
        assert payload["user_id"] == str(user_id)

        # 3. Consume ticket second time -> Must be None (Single-use invariant)
        second_attempt = await TicketService.validate_and_consume_ticket(
            redis=redis,
            ticket=ticket,
            expected_interview_id=interview_id,
        )
        assert second_attempt is None
    finally:
        await redis.aclose()


@pytest.mark.asyncio
async def test_ticket_mismatched_interview_id_fails() -> None:
    """Consuming a ticket against a different interview ID fails and consumes the ticket."""
    redis = get_redis_client()
    try:
        interview_id = uuid.uuid4()
        wrong_id = uuid.uuid4()
        user_id = uuid.uuid4()

        ticket = await TicketService.create_ticket(
            redis=redis,
            interview_id=interview_id,
            user_id=user_id,
        )

        # Attempt consumption with wrong interview ID
        res = await TicketService.validate_and_consume_ticket(
            redis=redis,
            ticket=ticket,
            expected_interview_id=wrong_id,
        )
        assert res is None
    finally:
        await redis.aclose()


@pytest.mark.asyncio
async def test_nonexistent_ticket_returns_none() -> None:
    """Attempting to consume non-existent or expired ticket returns None."""
    redis = get_redis_client()
    try:
        res = await TicketService.validate_and_consume_ticket(
            redis=redis,
            ticket="v4.ticket.nonexistent",
            expected_interview_id=uuid.uuid4(),
        )
        assert res is None
    finally:
        await redis.aclose()

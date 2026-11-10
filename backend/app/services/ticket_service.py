"""Ephemeral single-use ticket management for WebSocket authentication via Redis GETDEL."""

import json
import uuid
from typing import Any

import redis.asyncio as aioredis


class TicketService:
    """Issues and atomically validates single-use WebSocket authorization tickets."""

    TICKET_PREFIX = "ws_ticket:"
    DEFAULT_TTL_SECONDS = 60

    @classmethod
    async def create_ticket(
        self,
        redis: aioredis.Redis,
        interview_id: uuid.UUID,
        user_id: uuid.UUID,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> str:
        """Create a cryptographically unique single-use ticket stored in Redis with 60s TTL."""
        ticket_id = f"v4.ticket.{uuid.uuid4().hex}"
        key = f"{self.TICKET_PREFIX}{ticket_id}"
        payload = {
            "interview_id": str(interview_id),
            "user_id": str(user_id),
        }
        await redis.set(key, json.dumps(payload), ex=ttl_seconds)
        return ticket_id

    @classmethod
    async def validate_and_consume_ticket(
        self,
        redis: aioredis.Redis,
        ticket: str,
        expected_interview_id: uuid.UUID,
    ) -> dict[str, Any] | None:
        """Atomically consume (GETDEL) and validate ticket against target interview ID."""
        key = f"{self.TICKET_PREFIX}{ticket}"
        # Atomically retrieve and delete in a single operation
        raw_val = await redis.getdel(key)
        if not raw_val:
            return None

        try:
            data: dict[str, Any] = json.loads(raw_val)
            if data.get("interview_id") != str(expected_interview_id):
                return None
            return data
        except (json.JSONDecodeError, TypeError):
            return None

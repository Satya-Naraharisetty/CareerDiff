"""Async Redis connection pool and client management."""

from collections.abc import AsyncGenerator

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()


def get_redis_client() -> aioredis.Redis:
    """Return an async Redis client for commands."""
    return aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
    )


_shared_client: aioredis.Redis | None = None


def get_shared_redis_client() -> aioredis.Redis | None:
    """Process-wide Redis client with a connection pool (avoid a new TLS handshake per request)."""
    global _shared_client
    if _shared_client is None:
        try:
            _shared_client = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_timeout=2,
                socket_connect_timeout=2,
                health_check_interval=30,
            )
        except Exception:
            return None
    return _shared_client


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """FastAPI dependency yielding an async Redis client with cleanup."""
    client = get_redis_client()
    try:
        yield client
    finally:
        await client.aclose()


async def check_redis_health() -> bool:
    """Verify active Redis connectivity via ping command."""
    client = get_redis_client()
    try:
        return bool(await client.ping())
    except Exception:
        return False
    finally:
        await client.aclose()

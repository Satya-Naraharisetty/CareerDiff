"""Token-bucket rate limiter with Redis and in-memory fallback for DDoS and abuse defense."""

import logging
import time
from collections.abc import Callable
from typing import Any

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.redis import get_redis_client
from app.core.security import get_client_ip

logger = logging.getLogger("CareerDiff.rate_limit")


async def check_redis_rate_limit(
    redis_client: Any,
    identifier: str,
    capacity: int = 60,
    window_seconds: int = 60,
) -> tuple[bool, int, float]:
    """Atomic fixed-window rate limiter via Redis INCR and EXPIRE."""
    key = f"rl:{identifier}"
    current = await redis_client.incr(key)
    if current == 1:
        await redis_client.expire(key, window_seconds)
    ttl = await redis_client.ttl(key)
    retry_after = float(max(1, ttl))
    if current > capacity:
        return False, 0, retry_after
    remaining = max(0, capacity - current)
    return True, remaining, 0.0


class TokenBucket:
    """Token-bucket algorithm maintaining burst capacity and continuous replenishment."""

    def __init__(self, capacity: int = 60, refill_rate: float = 20.0) -> None:
        self.capacity = capacity
        self.refill_rate = refill_rate
        # In-memory storage: {identifier: (tokens, last_updated)}
        self._memory_buckets: dict[str, tuple[float, float]] = {}

    def check(self, identifier: str) -> tuple[bool, int, float]:
        """Check if request is permitted under token bucket limits.

        Returns (allowed, remaining_tokens, retry_after_seconds).
        """
        now = time.time()
        tokens, last_updated = self._memory_buckets.get(identifier, (float(self.capacity), now))

        # Replenish tokens based on elapsed time
        elapsed = now - last_updated
        tokens = min(float(self.capacity), tokens + (elapsed * self.refill_rate))

        if tokens >= 1.0:
            remaining = int(tokens - 1.0)
            self._memory_buckets[identifier] = (tokens - 1.0, now)
            return True, remaining, 0.0
        else:
            needed = 1.0 - tokens
            retry_after = round(needed / self.refill_rate, 2)
            self._memory_buckets[identifier] = (tokens, now)
            return False, 0, max(0.1, retry_after)

    def reset(self, identifier: str | None = None) -> None:
        """Reset state for a specific identifier or clear all buckets."""
        if identifier:
            self._memory_buckets.pop(identifier, None)
        else:
            self._memory_buckets.clear()


default_limiter = TokenBucket(capacity=60, refill_rate=20.0)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware enforcing token-bucket rate limits per client IP or authenticated user."""

    def __init__(
        self,
        app: Any,
        limiter: TokenBucket | None = None,
        whitelist_paths: set[str] | None = None,
    ) -> None:
        super().__init__(app)
        self.limiter = limiter or default_limiter
        self.whitelist_paths = whitelist_paths or {
            "/",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/health",
            "/api/v1/health",
            "/api/v1/health/db",
            "/api/v1/health/redis",
            "/api/v1/health/storage",
            "/api/v1/health/gemini",
            "/api/v1/health/outbox",
        }

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Any],
    ) -> Response:
        """Evaluate client rate limits before request execution."""
        path = request.url.path
        if (
            path in self.whitelist_paths
            or path.startswith("/health")
            or path.startswith("/api/v1/health")
            or path.startswith("/docs")
            or path.startswith("/redoc")
        ):
            return await call_next(request)  # type: ignore[no-any-return]

        # Extract client identifier: authenticated Bearer token sub or client IP
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            identifier = f"token:{auth_header[7:27]}"
        else:
            identifier = f"ip:{get_client_ip(request)}"

        allowed = True
        remaining = self.limiter.capacity
        retry_after = 0.0

        # Attempt distributed Redis rate limiting first if available
        redis_checked = False
        try:
            redis_client = get_redis_client()
            try:
                allowed, remaining, retry_after = await check_redis_rate_limit(
                    redis_client=redis_client,
                    identifier=identifier,
                    capacity=self.limiter.capacity,
                )
                redis_checked = True
            finally:
                await redis_client.aclose()
        except Exception:
            redis_checked = False

        if not redis_checked:
            allowed, remaining, retry_after = self.limiter.check(identifier)

        if not allowed:
            logger.warning(
                "Rate limit exceeded for %s on %s (retry in %.2fs)",
                identifier,
                path,
                retry_after,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "type": "https://api.CareerDiff.com/errors/rate-limit-exceeded",
                    "title": "Too Many Requests",
                    "status": 429,
                    "detail": "Rate limit exceeded. Please wait before retrying.",
                },
                headers={
                    "Retry-After": str(int(retry_after) + 1),
                    "X-RateLimit-Limit": str(self.limiter.capacity),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response: Response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.limiter.capacity)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

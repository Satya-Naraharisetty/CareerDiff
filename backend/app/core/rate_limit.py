"""Token-bucket rate limiter with Redis and in-memory fallback for DDoS and abuse defense."""

import logging
import time
from collections.abc import Callable
from typing import Any

import jwt
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.redis import get_shared_redis_client
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
    async with redis_client.pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        pipe.ttl(key)
        current, _, ttl = await pipe.execute()
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
# Credential endpoints get a much tighter budget to slow down password / backup-code guessing.
auth_limiter = TokenBucket(capacity=10, refill_rate=10 / 60)
AUTH_SENSITIVE_PATHS = (
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/recover-password",
    "/api/v1/auth/google",
    "/api/v1/auth/change-password",
)
_MAX_MEMORY_BUCKETS = 50_000
# Circuit breaker: after a Redis failure, use the in-memory limiter for a while instead of
# paying a connection timeout on every single request.
_REDIS_RETRY_AFTER_SECONDS = 30.0
_redis_unavailable_until = 0.0


def _identify_client(request: Request) -> str:
    """Identify the caller by verified user id, falling back to client IP.

    The JWT must verify: an unverified token would let an attacker rotate fake
    identities to escape the limit.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            payload = jwt.decode(
                auth_header[7:],
                get_settings().jwt_secret_key,
                algorithms=[get_settings().jwt_algorithm],
            )
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except jwt.PyJWTError:
            pass
    return f"ip:{get_client_ip(request)}"


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

        # The integration suite registers many users from one test client; keep the strict
        # credential bucket for every real environment.
        is_auth_path = path in AUTH_SENSITIVE_PATHS and get_settings().environment != "testing"
        limiter = auth_limiter if is_auth_path else self.limiter
        identifier = _identify_client(request)
        if is_auth_path:
            # Always bucket credential endpoints per IP, regardless of any token sent.
            identifier = f"auth:ip:{get_client_ip(request)}"

        allowed = True
        remaining = limiter.capacity
        retry_after = 0.0

        # Attempt distributed Redis rate limiting first if available
        global _redis_unavailable_until
        redis_checked = False
        redis_client = get_shared_redis_client() if time.monotonic() >= _redis_unavailable_until else None
        if redis_client is not None:
            try:
                allowed, remaining, retry_after = await check_redis_rate_limit(
                    redis_client=redis_client,
                    identifier=identifier,
                    capacity=limiter.capacity,
                )
                redis_checked = True
            except Exception:
                redis_checked = False
                _redis_unavailable_until = time.monotonic() + _REDIS_RETRY_AFTER_SECONDS
                logger.warning(
                    "Redis rate limiter unavailable; using in-memory limiter for %ds",
                    int(_REDIS_RETRY_AFTER_SECONDS),
                )

        if not redis_checked:
            if len(limiter._memory_buckets) > _MAX_MEMORY_BUCKETS:
                limiter.reset()
            allowed, remaining, retry_after = limiter.check(identifier)

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
                    "X-RateLimit-Limit": str(limiter.capacity),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response: Response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limiter.capacity)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response

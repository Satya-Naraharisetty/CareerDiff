"""Distributed tracing, request correlation, and structured JSON observability."""

import json
import logging
import time
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Context variable storing active request correlation ID across async coroutines
correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="")


def get_correlation_id() -> str:
    """Retrieve current correlation ID for request tracing in background tasks and logs."""
    return correlation_id_ctx.get() or "system"


class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as structured JSON for log aggregation and OpenTelemetry collectors."""

    def format(self, record: logging.LogRecord) -> str:
        log_payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": get_correlation_id(),
        }
        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_payload)


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Extracts or generates X-Correlation-ID and tracks request turnaround latency."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Any],
    ) -> Response:
        cid = request.headers.get("X-Correlation-ID") or uuid.uuid4().hex[:16]
        token = correlation_id_ctx.set(cid)
        start_time = time.perf_counter()

        try:
            response: Response = await call_next(request)
            duration_ms = (time.perf_counter() - start_time) * 1000
            response.headers["X-Correlation-ID"] = cid
            response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
            return response
        finally:
            correlation_id_ctx.reset(token)

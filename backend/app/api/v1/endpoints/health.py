"""Health check endpoints for container, infrastructure, and third-party integration probes."""

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.database import async_session_factory, check_db_health
from app.core.llm import make_genai_client
from app.core.redis import check_redis_health
from app.models.outbox import OutboxEvent
from app.services.outbox_poller import OutboxPoller
from app.services.storage import UPLOAD_DIR

logger = logging.getLogger("CareerDiff.health")

router = APIRouter()


class ServiceHealthDetail(BaseModel):
    status: str
    latency_ms: float | None = None
    details: dict[str, Any] | None = None
    error: str | None = None


class SystemHealthResponse(BaseModel):
    status: str
    database: str
    redis: str
    storage: str = "connected"
    gemini: str = "not_configured"
    outbox: str = "active"
    version: str = "0.1.0"
    services: dict[str, ServiceHealthDetail] = Field(default_factory=dict)


class DatabaseHealthResponse(BaseModel):
    status: str
    database: str
    latency_ms: float | None = None


class RedisHealthResponse(BaseModel):
    status: str
    redis: str
    latency_ms: float | None = None


class StorageHealthResponse(BaseModel):
    status: str
    storage: str
    latency_ms: float | None = None
    error: str | None = None


class GeminiHealthResponse(BaseModel):
    status: str
    gemini: str
    latency_ms: float | None = None
    error: str | None = None


class OutboxHealthResponse(BaseModel):
    status: str
    outbox: str
    latency_ms: float | None = None
    details: dict[str, Any] | None = None


async def check_storage_health() -> tuple[bool, float, str | None]:
    """Verify local filesystem storage directory is mounted and writable."""
    start = time.perf_counter()
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        probe_file = UPLOAD_DIR / ".healthcheck"
        probe_file.write_text("healthcheck")
        probe_file.unlink(missing_ok=True)
        latency = round((time.perf_counter() - start) * 1000, 2)
        return True, latency, None
    except Exception as exc:
        latency = round((time.perf_counter() - start) * 1000, 2)
        logger.error("Storage health check failed: %s", exc)
        return False, latency, str(exc)


async def check_gemini_health() -> tuple[bool, float, str, str | None]:
    """Verify Google Gemini LLM API reachability without consuming token generation quota.

    Returns (healthy, latency_ms, status_label, error_message).
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return True, 0.0, "not_configured", None

    start = time.perf_counter()
    try:

        def _probe_model() -> None:
            client = make_genai_client(timeout_ms=8000)
            client.models.get(model=settings.gemini_turn_model)

        await asyncio.wait_for(asyncio.to_thread(_probe_model), timeout=5.0)
        latency = round((time.perf_counter() - start) * 1000, 2)
        return True, latency, "connected", None
    except Exception as exc:
        latency = round((time.perf_counter() - start) * 1000, 2)
        logger.warning("Gemini health probe failed: %s", exc)
        return False, latency, "error", str(exc)


async def check_outbox_health() -> tuple[bool, float, dict[str, Any]]:
    """Probe Transactional Outbox backlog and execute sweep of pending events."""
    start = time.perf_counter()
    try:
        async with async_session_factory() as session:
            pending_stmt = select(func.count(OutboxEvent.id)).where(OutboxEvent.status == "PENDING")
            dead_stmt = select(func.count(OutboxEvent.id)).where(OutboxEvent.status == "DEAD_LETTER")
            pending_count = (await session.execute(pending_stmt)).scalar() or 0
            dead_letter_count = (await session.execute(dead_stmt)).scalar() or 0

            dispatched_now = 0
            if pending_count > 0:
                dispatched_now = await OutboxPoller.poll_and_dispatch_batch(
                    db=session,
                    batch_size=5,
                    worker_id="health-cron-sweep",
                )

            latency = round((time.perf_counter() - start) * 1000, 2)
            return True, latency, {
                "pending_events": pending_count,
                "dead_letter_events": dead_letter_count,
                "dispatched_during_probe": dispatched_now,
            }
    except Exception as exc:
        latency = round((time.perf_counter() - start) * 1000, 2)
        logger.warning("Outbox health probe failed: %s", exc)
        return False, latency, {"error": str(exc)}


@router.api_route(
    "/health",
    methods=["GET", "HEAD"],
    response_model=SystemHealthResponse,
    operation_id="get_system_health_probe",
    summary="Comprehensive system & integration health check",
    description="Probes PostgreSQL (Supabase), Redis (Upstash), local storage, Gemini LLM, and Outbox backlog.",
)
async def get_system_health(response: Response) -> SystemHealthResponse:
    """Check overall system health across all integration dependencies."""
    # 1. Database Probe (Supabase keep-alive via SELECT 1)
    db_start = time.perf_counter()
    db_healthy = await check_db_health()
    db_latency = round((time.perf_counter() - db_start) * 1000, 2)

    # 2. Redis Probe (Upstash keep-alive via PING)
    redis_start = time.perf_counter()
    redis_healthy = await check_redis_health()
    redis_latency = round((time.perf_counter() - redis_start) * 1000, 2)

    # 3. Local Storage Probe
    storage_healthy, storage_latency, storage_err = await check_storage_health()

    # 4. Gemini AI Provider Probe
    gemini_healthy, gemini_latency, gemini_status, gemini_err = await check_gemini_health()

    # 5. Outbox Engine Probe & Sweep
    outbox_healthy, outbox_latency, outbox_details = await check_outbox_health()

    # Determine composite health: DB, Redis, and Storage are mission-critical.
    # If Gemini is configured, it must also be reachable.
    critical_healthy = db_healthy and redis_healthy and storage_healthy
    overall_healthy = critical_healthy and (gemini_healthy or gemini_status == "not_configured")

    if not overall_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    services_map: dict[str, ServiceHealthDetail] = {
        "database": ServiceHealthDetail(
            status="connected" if db_healthy else "disconnected",
            latency_ms=db_latency,
            details={"provider": "PostgreSQL"},
        ),
        "redis": ServiceHealthDetail(
            status="connected" if redis_healthy else "disconnected",
            latency_ms=redis_latency,
            details={"provider": "Redis"},
        ),
        "storage": ServiceHealthDetail(
            status="connected" if storage_healthy else "error",
            latency_ms=storage_latency,
            error=storage_err,
        ),
        "gemini": ServiceHealthDetail(
            status=gemini_status,
            latency_ms=gemini_latency,
            error=gemini_err,
        ),
        "outbox": ServiceHealthDetail(
            status="active" if outbox_healthy else "error",
            latency_ms=outbox_latency,
            details=outbox_details,
        ),
    }

    return SystemHealthResponse(
        status="healthy" if overall_healthy else "unhealthy",
        database="connected" if db_healthy else "disconnected",
        redis="connected" if redis_healthy else "disconnected",
        storage="connected" if storage_healthy else "error",
        gemini=gemini_status,
        outbox="active" if outbox_healthy else "error",
        version="0.1.0",
        services=services_map,
    )


@router.get(
    "/health/db",
    response_model=DatabaseHealthResponse,
    summary="Database connectivity probe",
    description="Executes a lightweight query on PostgreSQL via async SQLAlchemy.",
)
async def get_database_health(response: Response) -> DatabaseHealthResponse:
    """Probe PostgreSQL database connectivity."""
    start = time.perf_counter()
    db_healthy = await check_db_health()
    latency = round((time.perf_counter() - start) * 1000, 2)
    if not db_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return DatabaseHealthResponse(
        status="healthy" if db_healthy else "unhealthy",
        database="connected" if db_healthy else "disconnected",
        latency_ms=latency,
    )


@router.get(
    "/health/redis",
    response_model=RedisHealthResponse,
    summary="Redis cache connectivity probe",
    description="Sends a PING command to Redis.",
)
async def get_redis_health(response: Response) -> RedisHealthResponse:
    """Probe Redis cache connectivity."""
    start = time.perf_counter()
    redis_healthy = await check_redis_health()
    latency = round((time.perf_counter() - start) * 1000, 2)
    if not redis_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return RedisHealthResponse(
        status="healthy" if redis_healthy else "unhealthy",
        redis="connected" if redis_healthy else "disconnected",
        latency_ms=latency,
    )


@router.get(
    "/health/storage",
    response_model=StorageHealthResponse,
    summary="Storage filesystem probe",
    description="Verifies the local upload directory is writable.",
)
async def get_storage_health(response: Response) -> StorageHealthResponse:
    """Probe storage filesystem accessibility."""
    storage_healthy, latency, err = await check_storage_health()
    if not storage_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return StorageHealthResponse(
        status="healthy" if storage_healthy else "unhealthy",
        storage="connected" if storage_healthy else "error",
        latency_ms=latency,
        error=err,
    )


@router.get(
    "/health/gemini",
    response_model=GeminiHealthResponse,
    summary="Gemini AI provider probe",
    description="Probes Google Gemini API reachability using model metadata.",
)
async def get_gemini_health(response: Response) -> GeminiHealthResponse:
    """Probe Gemini API integration."""
    healthy, latency, gemini_status, err = await check_gemini_health()
    if not healthy and gemini_status != "not_configured":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return GeminiHealthResponse(
        status="healthy" if healthy or gemini_status == "not_configured" else "unhealthy",
        gemini=gemini_status,
        latency_ms=latency,
        error=err,
    )


@router.get(
    "/health/outbox",
    response_model=OutboxHealthResponse,
    summary="Transactional outbox queue probe",
    description="Inspects pending and dead-letter outbox backlog and runs a sweep.",
)
async def get_outbox_health(response: Response) -> OutboxHealthResponse:
    """Probe Outbox events backlog."""
    healthy, latency, details = await check_outbox_health()
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return OutboxHealthResponse(
        status="healthy" if healthy else "unhealthy",
        outbox="active" if healthy else "error",
        latency_ms=latency,
        details=details,
    )

"""Health check endpoints for container and infrastructure probes."""

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.core.database import check_db_health
from app.core.redis import check_redis_health

router = APIRouter()


class SystemHealthResponse(BaseModel):
    status: str
    database: str
    redis: str
    version: str = "0.1.0"


class DatabaseHealthResponse(BaseModel):
    status: str
    database: str


class RedisHealthResponse(BaseModel):
    status: str
    redis: str


@router.get(
    "/health",
    response_model=SystemHealthResponse,
    summary="Comprehensive system health check",
    description="Probes PostgreSQL database and Redis connectivity.",
)
async def get_system_health(response: Response) -> SystemHealthResponse:
    """Check overall system health including database and cache."""
    db_healthy = await check_db_health()
    redis_healthy = await check_redis_health()

    is_healthy = db_healthy and redis_healthy
    if not is_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return SystemHealthResponse(
        status="healthy" if is_healthy else "unhealthy",
        database="connected" if db_healthy else "disconnected",
        redis="connected" if redis_healthy else "disconnected",
        version="0.1.0",
    )


@router.get(
    "/health/db",
    response_model=DatabaseHealthResponse,
    summary="Database connectivity probe",
    description="Executes a lightweight query on PostgreSQL via async SQLAlchemy.",
)
async def get_database_health(response: Response) -> DatabaseHealthResponse:
    """Probe PostgreSQL database connectivity."""
    db_healthy = await check_db_health()
    if not db_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return DatabaseHealthResponse(
        status="healthy" if db_healthy else "unhealthy",
        database="connected" if db_healthy else "disconnected",
    )


@router.get(
    "/health/redis",
    response_model=RedisHealthResponse,
    summary="Redis cache connectivity probe",
    description="Sends a PING command to Redis.",
)
async def get_redis_health(response: Response) -> RedisHealthResponse:
    """Probe Redis cache connectivity."""
    redis_healthy = await check_redis_health()
    if not redis_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return RedisHealthResponse(
        status="healthy" if redis_healthy else "unhealthy",
        redis="connected" if redis_healthy else "disconnected",
    )

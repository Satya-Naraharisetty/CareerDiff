"""Integration tests for health probe endpoints and failure paths."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_endpoint(async_client: AsyncClient) -> None:
    """Verify root endpoint returns basic service metadata."""
    response = await async_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "CareerDiff API"
    assert data["status"] == "online"
    assert data["docs"] == "/docs"


@pytest.mark.asyncio
async def test_root_health_endpoint(async_client: AsyncClient) -> None:
    """Verify top-level /health endpoint routes to system integration health probe."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "database" in data
    assert "redis" in data
    assert "storage" in data
    assert "outbox" in data


@pytest.mark.asyncio
async def test_system_health_healthy(async_client: AsyncClient) -> None:
    """Verify system health reports 200 when database, Redis, and storage are reachable."""
    response = await async_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert data["redis"] == "connected"
    assert data["storage"] == "connected"
    assert "services" in data
    assert "database" in data["services"]
    assert "redis" in data["services"]
    assert "storage" in data["services"]
    assert "gemini" in data["services"]
    assert "outbox" in data["services"]
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_database_health_healthy(async_client: AsyncClient) -> None:
    """Verify database health probe returns 200 when connected."""
    response = await async_client.get("/api/v1/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


@pytest.mark.asyncio
async def test_redis_health_healthy(async_client: AsyncClient) -> None:
    """Verify Redis health probe returns 200 when connected."""
    response = await async_client.get("/api/v1/health/redis")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["redis"] == "connected"


@pytest.mark.asyncio
async def test_storage_health_probe(async_client: AsyncClient) -> None:
    """Verify storage filesystem health probe returns 200 when writable."""
    response = await async_client.get("/api/v1/health/storage")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["storage"] == "connected"


@pytest.mark.asyncio
async def test_gemini_health_probe(async_client: AsyncClient) -> None:
    """Verify Gemini AI probe returns 200 and reports configured status."""
    response = await async_client.get("/api/v1/health/gemini")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["gemini"] in ("connected", "not_configured")


@pytest.mark.asyncio
async def test_outbox_health_probe(async_client: AsyncClient) -> None:
    """Verify Outbox backlog probe returns 200 and reports queue metrics."""
    response = await async_client.get("/api/v1/health/outbox")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["outbox"] == "active"
    assert "details" in data


@pytest.mark.asyncio
async def test_system_health_db_failure(async_client: AsyncClient) -> None:
    """Verify system health reports 503 and degraded state when database is unreachable."""
    with patch(
        "app.api.v1.endpoints.health.check_db_health",
        new=AsyncMock(return_value=False),
    ):
        response = await async_client.get("/api/v1/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["database"] == "disconnected"


@pytest.mark.asyncio
async def test_system_health_redis_failure(async_client: AsyncClient) -> None:
    """Verify system health reports 503 when Redis is unreachable."""
    with patch(
        "app.api.v1.endpoints.health.check_redis_health",
        new=AsyncMock(return_value=False),
    ):
        response = await async_client.get("/api/v1/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["redis"] == "disconnected"


@pytest.mark.asyncio
async def test_system_health_storage_failure(async_client: AsyncClient) -> None:
    """Verify system health reports 503 when local storage directory is not writable."""
    with patch(
        "app.api.v1.endpoints.health.check_storage_health",
        new=AsyncMock(return_value=(False, 1.2, "Permission denied")),
    ):
        response = await async_client.get("/api/v1/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["storage"] == "error"


@pytest.mark.asyncio
async def test_database_health_failure(async_client: AsyncClient) -> None:
    """Verify /health/db reports 503 when database check fails."""
    with patch(
        "app.api.v1.endpoints.health.check_db_health",
        new=AsyncMock(return_value=False),
    ):
        response = await async_client.get("/api/v1/health/db")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["database"] == "disconnected"


@pytest.mark.asyncio
async def test_redis_health_failure(async_client: AsyncClient) -> None:
    """Verify /health/redis reports 503 when Redis check fails."""
    with patch(
        "app.api.v1.endpoints.health.check_redis_health",
        new=AsyncMock(return_value=False),
    ):
        response = await async_client.get("/api/v1/health/redis")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["redis"] == "disconnected"

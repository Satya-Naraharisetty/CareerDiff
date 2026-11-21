"""Pytest configuration and shared async test fixtures."""

import os
from collections.abc import AsyncGenerator

# Set testing environment before importing app modules
os.environ["ENVIRONMENT"] = "testing"
# Never let the test suite pick up production DATABASE_URL / REDIS_URL from backend/.env
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://careerdiff:postgres@localhost:5432/careerdiff_test"
)
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def settings() -> Settings:
    """Fixture providing current application configuration."""
    return get_settings()


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """Fixture providing an async HTTP client for FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

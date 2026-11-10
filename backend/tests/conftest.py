"""Pytest configuration and shared async test fixtures."""

import os
from collections.abc import AsyncGenerator

# Set testing environment before importing app modules
os.environ["ENVIRONMENT"] = "testing"

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

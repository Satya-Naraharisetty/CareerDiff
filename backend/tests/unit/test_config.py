"""Unit tests for configuration loading and validation."""

import os
from unittest.mock import patch

from app.core.config import Settings, get_settings


def test_default_settings() -> None:
    """Verify default configuration attributes align with environment spec."""
    cfg = Settings()
    assert cfg.environment in ("development", "testing", "production")
    assert "postgresql+asyncpg" in cfg.database_url
    assert "redis://" in cfg.redis_url
    assert cfg.jwt_algorithm == "HS256"
    assert cfg.jwt_access_token_expire_minutes == 15
    assert cfg.s3_endpoint_url == "http://localhost:9000"
    assert cfg.s3_bucket_name == "careerdiff-resumes"


def test_custom_environment_override() -> None:
    """Verify environment variables override default configuration values."""
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "testing",
            "LOG_LEVEL": "DEBUG",
            "DATABASE_URL": "postgresql+asyncpg://test_user:pass@localhost:5432/test_db",
            "JWT_ACCESS_TOKEN_EXPIRE_MINUTES": "60",
        },
    ):
        cfg = Settings()
        assert cfg.environment == "testing"
        assert cfg.log_level == "DEBUG"
        assert cfg.database_url == "postgresql+asyncpg://test_user:pass@localhost:5432/test_db"
        assert cfg.jwt_access_token_expire_minutes == 60


def test_database_url_normalization() -> None:
    """Verify standard postgres:// and postgresql:// URLs are normalized to postgresql+asyncpg://."""
    with patch.dict(
        os.environ,
        {"DATABASE_URL": "postgres://user:secret@roundhouse.proxy.rlwy.net:1234/railway"},
    ):
        cfg = Settings()
        assert (
            cfg.database_url
            == "postgresql+asyncpg://user:secret@roundhouse.proxy.rlwy.net:1234/railway"
        )

    with patch.dict(
        os.environ,
        {"DATABASE_URL": "postgresql://user:secret@roundhouse.proxy.rlwy.net:1234/railway"},
    ):
        cfg = Settings()
        assert (
            cfg.database_url
            == "postgresql+asyncpg://user:secret@roundhouse.proxy.rlwy.net:1234/railway"
        )


def test_get_settings_cache() -> None:
    """Verify get_settings returns a singleton instance."""
    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2

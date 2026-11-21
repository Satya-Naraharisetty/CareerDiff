"""Unit tests for configuration loading and validation."""

import os
from unittest.mock import patch

from app.core.config import Settings, get_settings


def test_default_settings() -> None:
    """Verify default configuration attributes align with environment spec."""
    cfg = Settings()
    assert cfg.environment in ("development", "testing", "production")
    assert "postgresql+asyncpg" in cfg.database_url
    assert "redis" in cfg.redis_url
    assert cfg.jwt_algorithm == "HS256"
    assert cfg.jwt_access_token_expire_minutes == int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    )


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


def test_production_jwt_secret_validation() -> None:
    """Verify that production environment strictly enforces high-entropy JWT_SECRET_KEY."""
    import pytest

    # Fails if default dev secret is used in production
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "production",
            "JWT_SECRET_KEY": "insecure_dev_secret_change_in_production_key_32bytes",
            "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/db",
        },
    ):
        with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR"):
            Settings()

    # Fails if secret is shorter than 32 characters
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "production",
            "JWT_SECRET_KEY": "short_secret_under_32_chars",
            "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/db",
        },
    ):
        with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR"):
            Settings()

    # Succeeds with a valid 32+ character high-entropy key
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "production",
            "JWT_SECRET_KEY": "0" * 32,
            "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/db",
        },
    ):
        cfg = Settings()
        assert cfg.environment == "production"
        assert cfg.jwt_secret_key == "0" * 32


def test_skip_auth_configuration() -> None:
    """Verify SKIP_AUTH can be enabled in development but is forbidden in production."""
    # Allowed in development
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "development",
            "SKIP_AUTH": "true",
        },
    ):
        cfg = Settings()
        assert cfg.skip_auth is True

    # Forbidden in production
    with patch.dict(
        os.environ,
        {
            "ENVIRONMENT": "production",
            "JWT_SECRET_KEY": "0" * 32,
            "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/db",
            "SKIP_AUTH": "true",
        },
    ):
        import pytest
        with pytest.raises(ValueError, match="SKIP_AUTH cannot be enabled in production"):
            Settings()


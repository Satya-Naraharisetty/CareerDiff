"""Application configuration management via Pydantic."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


def _load_env_file(env_path: Path) -> None:
    """Load key-value pairs from .env into os.environ if not already set."""
    if not env_path.is_file():
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, val = stripped.split("=", 1)
            key, val = key.strip(), val.strip()
            if key and key not in os.environ:
                os.environ[key] = val


def normalize_database_url(url: str) -> str:
    """Normalize database URL for asyncpg driver compatibility in production."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# Load backend/.env or root .env on import if present
for potential_path in [
    Path(__file__).resolve().parent.parent.parent / ".env",
    Path.cwd() / "backend" / ".env",
    Path.cwd() / ".env",
]:
    _load_env_file(potential_path)


class Settings(BaseModel):
    """IntervueX backend environment configuration schema."""

    environment: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "development"))
    log_level: str = Field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    database_url: str = Field(
        default_factory=lambda: normalize_database_url(
            os.getenv(
                "DATABASE_URL",
                "postgresql+asyncpg://intervuex:postgres@localhost:5432/intervuex_dev",
            )
        )
    )
    test_database_url: str = Field(
        default_factory=lambda: normalize_database_url(
            os.getenv(
                "TEST_DATABASE_URL",
                "postgresql+asyncpg://intervuex:postgres@localhost:5432/intervuex_test",
            )
        )
    )

    redis_url: str = Field(
        default_factory=lambda: os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )

    jwt_secret_key: str = Field(
        default_factory=lambda: os.getenv(
            "JWT_SECRET_KEY", "insecure_dev_secret_change_in_production_key_32bytes"
        )
    )
    jwt_algorithm: str = Field(default_factory=lambda: os.getenv("JWT_ALGORITHM", "HS256"))
    jwt_access_token_expire_minutes: int = Field(
        default_factory=lambda: int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    )

    s3_endpoint_url: str = Field(
        default_factory=lambda: os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")
    )
    s3_bucket_name: str = Field(
        default_factory=lambda: os.getenv("S3_BUCKET_NAME", "intervuex-resumes")
    )
    s3_access_key: str = Field(default_factory=lambda: os.getenv("S3_ACCESS_KEY", "minioadmin"))
    s3_secret_key: str = Field(default_factory=lambda: os.getenv("S3_SECRET_KEY", "minioadmin"))

    gemini_api_key: str | None = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY") or None)
    deepgram_api_key: str | None = Field(
        default_factory=lambda: os.getenv("DEEPGRAM_API_KEY") or None
    )
    cartesia_api_key: str | None = Field(
        default_factory=lambda: os.getenv("CARTESIA_API_KEY") or None
    )
    elevenlabs_api_key: str | None = Field(
        default_factory=lambda: os.getenv("ELEVENLABS_API_KEY") or None
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retrieve cached application settings instance."""
    return Settings()

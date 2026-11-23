"""Application configuration management via Pydantic."""

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, model_validator


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


def get_default_database_url() -> str:
    """Resolve and validate database URL based on environment."""
    raw = os.getenv("DATABASE_URL")
    if not raw:
        if os.getenv("ENVIRONMENT") == "production":
            raise ValueError(
                "CRITICAL: ENVIRONMENT='production' is set, but DATABASE_URL environment variable is missing. "
                "Please configure DATABASE_URL in your hosting provider's dashboard."
            )
        raw = "postgresql+asyncpg://careerdiff:postgres@localhost:5432/careerdiff_dev"
    return normalize_database_url(raw)


# Load backend/.env or root .env on import if present
for potential_path in [
    Path(__file__).resolve().parent.parent.parent / ".env",
    Path.cwd() / "backend" / ".env",
    Path.cwd() / ".env",
]:
    _load_env_file(potential_path)


class Settings(BaseModel):
    """CareerDiff backend environment configuration schema."""

    environment: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "development"))
    log_level: str = Field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    database_url: str = Field(default_factory=get_default_database_url)
    test_database_url: str = Field(
        default_factory=lambda: normalize_database_url(
            os.getenv(
                "TEST_DATABASE_URL",
                "postgresql+asyncpg://careerdiff:postgres@localhost:5432/careerdiff_test",
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
        default_factory=lambda: int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    )
    enable_docs: bool = Field(
        default_factory=lambda: os.getenv("ENABLE_DOCS", "false").lower() in ("1", "true", "yes")
        if os.getenv("ENVIRONMENT") == "production"
        else True
    )
    google_client_id: str | None = Field(
        default_factory=lambda: os.getenv("GOOGLE_CLIENT_ID") or None
    )
    google_client_secret: str | None = Field(
        default_factory=lambda: os.getenv("GOOGLE_CLIENT_SECRET") or None
    )
    github_client_id: str | None = Field(
        default_factory=lambda: os.getenv("GITHUB_CLIENT_ID") or None
    )
    github_client_secret: str | None = Field(
        default_factory=lambda: os.getenv("GITHUB_CLIENT_SECRET") or None
    )

    gemini_api_key: str | None = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY") or None)
    gemini_turn_model: str = Field(
        default_factory=lambda: os.getenv("GEMINI_TURN_MODEL", "gemini-3.8-flash")
    )
    gemini_live_model: str = Field(
        default_factory=lambda: os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live-extended-thinking")
    )
    gemini_live_voice: str = Field(
        default_factory=lambda: os.getenv("GEMINI_LIVE_VOICE", "Puck")
    )
    gemini_eval_model: str = Field(
        default_factory=lambda: os.getenv("GEMINI_EVAL_MODEL", "gemini-4-argon")
    )
    deepgram_api_key: str | None = Field(
        default_factory=lambda: os.getenv("DEEPGRAM_API_KEY") or None
    )
    cartesia_api_key: str | None = Field(
        default_factory=lambda: os.getenv("CARTESIA_API_KEY") or None
    )
    elevenlabs_api_key: str | None = Field(
        default_factory=lambda: os.getenv("ELEVENLABS_API_KEY") or None
    )

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            o.strip().rstrip("/")
            for o in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if o.strip()
        ]
    )
    # Number of trusted reverse proxies in front of the API (Render = 1). Used to read the
    # real client IP from the right-hand side of X-Forwarded-For, which clients cannot spoof.
    trusted_proxy_hops: int = Field(
        default_factory=lambda: int(os.getenv("TRUSTED_PROXY_HOPS", "1"))
    )

    @property
    def is_local_dev(self) -> bool:
        """True only for explicit local development/testing environments."""
        return self.environment.lower() in ("development", "testing", "local", "dev")

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        """Enforce strict cryptographic and configuration security standards in production."""
        if self.environment.lower() == "production":
            publicly_known_secrets = {
                "insecure_dev_secret_change_in_production_key_32bytes",
                "ProdSecretKeyMustBeSet32BytesLong",
            }
            if self.jwt_secret_key in publicly_known_secrets or len(self.jwt_secret_key) < 32:
                raise ValueError(
                    "CRITICAL SECURITY CONFIGURATION ERROR: In 'production' environment, "
                    "JWT_SECRET_KEY must be explicitly set with a high-entropy secret "
                    "of at least 32 characters (256-bit entropy)."
                )
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Retrieve cached application settings instance."""
    return Settings()

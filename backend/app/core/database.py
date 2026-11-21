"""Async SQLAlchemy 2.0 database engine, session factory, and base models."""

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy 2.0 models."""

    pass


def create_engine_and_session_factory(
    database_url: str,
    is_testing: bool = False,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Initialize async engine and sessionmaker for PostgreSQL with asyncpg."""
    # Transaction poolers (e.g. Supabase port 6543 / PgBouncer) require disabling statement cache
    connect_args: dict[str, int] = {}
    if ":6543" in database_url or "pooler.supabase.com" in database_url:
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_cache_size"] = 0

    if is_testing:
        engine = create_async_engine(
            database_url,
            poolclass=NullPool,
            connect_args=connect_args,
        )
    else:
        engine = create_async_engine(
            database_url,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            connect_args=connect_args,
        )
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return engine, session_factory


settings = get_settings()
engine, async_session_factory = create_engine_and_session_factory(
    settings.database_url,
    is_testing=(settings.environment == "testing"),
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session with auto-rollback on error."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def check_db_health() -> bool:
    """Verify active database connectivity with a lightweight ping query."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception:
        return False

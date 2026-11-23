"""CareerDiff FastAPI Application Entrypoint."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from app.api.v1.endpoints.websocket import router as ws_router
from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.database import async_session_factory, engine
from app.core.logging_config import setup_logging
from app.core.rate_limit import RateLimitMiddleware
from app.core.security import SecurityHeadersMiddleware
from app.core.tracing import CorrelationIdMiddleware
from app.services.outbox_poller import OutboxPoller

settings = get_settings()
setup_logging()
logger = logging.getLogger("CareerDiff.main")


async def run_outbox_loop(poll_interval_seconds: int = 15) -> None:
    """Lightweight in-process background poller processing queued outbox events."""
    logger.info("In-process Outbox background poller started (interval: %ds).", poll_interval_seconds)
    while True:
        try:
            async with async_session_factory() as db:
                await OutboxPoller.poll_and_dispatch_batch(db=db, worker_id="in-process-worker")
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Error in background outbox poller: %s", exc)
        await asyncio.sleep(poll_interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle hooks."""
    logger.info("Initializing CareerDiff backend services in %s mode...", settings.environment)

    outbox_task: asyncio.Task[None] | None = None
    if settings.environment != "testing":
        outbox_task = asyncio.create_task(run_outbox_loop())
        logger.info("In-process Outbox background worker task spawned.")

    yield

    logger.info("Shutting down CareerDiff backend services...")
    if outbox_task and not outbox_task.done():
        outbox_task.cancel()
        try:
            await outbox_task
        except asyncio.CancelledError:
            pass
        logger.info("In-process Outbox background worker cleanly terminated.")

    await engine.dispose()
    logger.info("Database engine connections cleanly closed.")


app = FastAPI(
    title="CareerDiff API",
    description="Adaptive AI-Powered Technical Interview Platform",
    version="0.1.0",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
    lifespan=lifespan,
)

# Middlewares
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(RateLimitMiddleware)

# CORS configuration for frontend dev server and production deployments
cors_origins = settings.cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(api_v1_router, prefix="/api/v1")
app.include_router(ws_router, prefix="/ws/v1")


@app.api_route("/", methods=["GET", "HEAD"], summary="Root health & metadata", tags=["Root"])
async def root() -> dict[str, str]:
    """Provide service identity and documentation pointers."""
    return {
        "service": "CareerDiff API",
        "version": "0.1.0",
        "status": "online",
        "docs": "/docs",
    }


@app.api_route("/health", methods=["GET", "HEAD"], summary="Top-level system health probe", tags=["Root"], include_in_schema=False)
async def root_health(response: Response) -> Any:
    """Convenience endpoint routing root /health to system integration health probe."""
    from app.api.v1.endpoints.health import get_system_health

    return await get_system_health(response)


@app.get("/robots.txt", response_class=PlainTextResponse, include_in_schema=False)
async def robots_txt() -> str:
    """Serve SEO robots exclusion standard for search crawlers."""
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /ws/\n\n"
        "Sitemap: https://CareerDiff.dev/sitemap.xml\n"
    )


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml() -> Response:
    """Serve XML sitemap for search engine indexing."""
    xml_content = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        "  <url>\n"
        "    <loc>https://CareerDiff.dev/</loc>\n"
        "    <lastmod>2026-11-10</lastmod>\n"
        "    <changefreq>weekly</changefreq>\n"
        "    <priority>1.0</priority>\n"
        "  </url>\n"
        "</urlset>"
    )
    return Response(content=xml_content, media_type="application/xml")

"""CareerDiff FastAPI Application Entrypoint."""

import asyncio
import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from app.api.v1.endpoints.websocket import router as ws_router
from app.api.v1.router import api_v1_router
from app.core.config import get_settings
from app.core.database import async_session_factory, engine
from app.core.rate_limit import RateLimitMiddleware
from app.core.tracing import CorrelationIdMiddleware
from app.services.outbox_poller import OutboxPoller

settings = get_settings()
logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("CareerDiff")


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
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Middlewares
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(RateLimitMiddleware)

# CORS configuration for frontend dev server and production deployments
default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
env_cors = os.getenv("CORS_ORIGINS")
cors_origins = (
    [o.strip() for o in env_cors.split(",") if o.strip()] if env_cors else default_origins
)

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


@app.get("/", summary="Root health & metadata", tags=["Root"])
async def root() -> dict[str, str]:
    """Provide service identity and documentation pointers."""
    return {
        "service": "CareerDiff API",
        "version": "0.1.0",
        "status": "online",
        "docs": "/docs",
    }


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

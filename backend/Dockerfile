# syntax=docker/dockerfile:1.4
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

# Install uv package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install dependencies in cached layer
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source code
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

# Security: Run as non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD python -c "import os, urllib.request; port = os.getenv('PORT', '8000'); urllib.request.urlopen(f'http://localhost:{port}/api/v1/health')" || exit 1

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]

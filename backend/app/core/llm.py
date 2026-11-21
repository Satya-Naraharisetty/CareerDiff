"""Shared Gemini client factory with bounded latency.

Every request-path LLM call must fail fast so callers can fall back to deterministic logic
instead of leaving the candidate waiting on a hung request (e.g. during 429/503 overload).
"""

from typing import Any

from app.core.config import get_settings

DEFAULT_TIMEOUT_MS = 20_000


def make_genai_client(timeout_ms: int = DEFAULT_TIMEOUT_MS) -> Any:
    """Return a google-genai client with a per-request timeout and at most one quick retry."""
    from google import genai
    from google.genai import types

    return genai.Client(
        api_key=get_settings().gemini_api_key,
        http_options=types.HttpOptions(
            timeout=timeout_ms,
            retry_options=types.HttpRetryOptions(attempts=2, initial_delay=0.5, max_delay=2.0),
        ),
    )

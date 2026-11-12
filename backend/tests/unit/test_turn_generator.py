"""Unit tests for TurnGenerator and preferred language question generation."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.adaptive import EngineAction
from app.services.turn_generator import TurnGenerator


def test_warmup_greeting_with_resume_claims() -> None:
    greeting = TurnGenerator.generate_warmup_greeting(
        candidate_name="Alex Rivera",
        target_seniority="SENIOR",
        primary_discipline="BACKEND",
        top_skills=["FastAPI", "PostgreSQL", "Kafka"],
        key_claim="Architected low-latency Kafka pipeline processing 50k events/sec",
    )
    assert "Alex Rivera" in greeting
    assert "Senior" in greeting
    assert "FastAPI" in greeting
    assert "Architected low-latency Kafka pipeline" in greeting


def test_generate_question_with_context_continuity() -> None:
    question = TurnGenerator.generate_question(
        action=EngineAction.PROBE_DEEPER,
        topic_name="Distributed Transactions",
        target_seniority="SENIOR",
        candidate_last_answer="We scaled by building an event streaming pipeline using Kafka and Redis.",
    )
    assert "Distributed Transactions" in question
    assert "concurrency" in question.lower() or "mechanics" in question.lower()


@pytest.mark.asyncio
async def test_generate_question_async_deterministic_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    # Set gemini_api_key empty to test deterministic generator
    from app.core import config

    settings = config.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "")

    question = await TurnGenerator.generate_question_async(
        action=EngineAction.CHALLENGE,
        topic_name="Database Performance & Indexing",
        target_seniority="STAFF",
        candidate_last_answer="I tuned MVCC vacuum and composite B-tree indexes.",
        preferred_language="Java",
    )
    assert len(question) > 20
    assert "Database Performance" in question or "fail" in question.lower()


@pytest.mark.asyncio
async def test_generate_question_async_with_gemini_client(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core import config

    settings = config.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")

    mock_response = MagicMock()
    mock_response.text = "In Java, how do Virtual Threads handle IO-bound blocking calls compared to reactive WebFlux?"

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("google.genai.Client", return_value=mock_client):
        question = await TurnGenerator.generate_question_async(
            action=EngineAction.PROBE_DEEPER,
            topic_name="Concurrency & Async Topologies",
            target_seniority="SENIOR",
            preferred_language="Java",
        )
        assert "Virtual Threads" in question

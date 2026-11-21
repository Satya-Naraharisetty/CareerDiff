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
    assert "Alex" in greeting
    assert "senior" in greeting.lower()
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
async def test_generate_question_async_deterministic_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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


def test_generate_warmup_transition_question_conversational() -> None:
    """Verify warmup transition produces natural dialogue bridging candidate focus into topic 0."""
    res = TurnGenerator.generate_warmup_transition_question(
        topic_name="Distributed Systems & Concurrency",
        candidate_warmup_answer="I have been building microservices and event pipelines using Kafka and PostgreSQL.",
        target_seniority="SENIOR",
        candidate_name="Dev Kumar",
        company_name="GlobalFinTech Corp",
    )
    assert "Dev" in res
    assert "Distributed Systems & Concurrency" in res
    assert "Kafka" in res or "systems" in res


@pytest.mark.asyncio
async def test_generate_warmup_transition_question_async_with_gemini(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify async warmup transition prompts Gemini with conversational active listening directives."""
    from app.core import config

    settings = config.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")

    captured_prompt = None

    async def fake_generate_content(*args, **kwargs):
        nonlocal captured_prompt
        captured_prompt = kwargs.get("contents")
        res = MagicMock()
        res.text = "Thanks for that overview, Dev! Your experience with Kafka event pipelines connects directly into our first topic: Distributed Systems. How did you handle partition rebalancing under peak traffic?"
        return res

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=fake_generate_content)

    with patch("google.genai.Client", return_value=mock_client):
        res = await TurnGenerator.generate_warmup_transition_question_async(
            topic_name="Distributed Systems & Concurrency",
            candidate_warmup_answer="I built Kafka pipelines handling 50k events per second.",
            target_seniority="SENIOR",
            candidate_name="Dev Patel",
            company_name="Stripe",
            interviewer_name="Maya",
        )
        assert "Dev" in res
        assert "Kafka" in res
        assert captured_prompt is not None
        assert "Conversational Realism Directives" in captured_prompt
        assert "Maya" in captured_prompt


@pytest.mark.asyncio
async def test_generate_question_async_conversational_peer_directives(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify technical turn generation passes previous turn continuity and active listening directives."""
    from app.core import config

    settings = config.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "test_key")

    captured_prompt = None

    async def fake_generate_content(*args, **kwargs):
        nonlocal captured_prompt
        captured_prompt = kwargs.get("contents")
        res = MagicMock()
        res.text = "Got it, that makes sense. By using an optimistic concurrency check on Redis, you avoided DB row contention. How do you handle retry storms if the key is hotly contended?"
        return res

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=fake_generate_content)

    with patch("google.genai.Client", return_value=mock_client):
        res = await TurnGenerator.generate_question_async(
            action=EngineAction.CHALLENGE,
            topic_name="Concurrency & Locking",
            target_seniority="STAFF",
            candidate_last_answer="We used Redis WATCH to implement optimistic locking for account balances.",
            candidate_name="Alex Rivera",
            interviewer_last_question="How did you prevent double-spending under concurrent traffic?",
            interviewer_name="Jordan",
            preferred_language="Python",
        )
        assert "Got it" in res
        assert captured_prompt is not None
        assert "Your previous question to Alex" in captured_prompt
        assert "How did you prevent double-spending" in captured_prompt
        assert "Active Listening & Acknowledgment" in captured_prompt
        assert "Jordan" in captured_prompt

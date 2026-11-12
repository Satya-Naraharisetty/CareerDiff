"""Unit tests for Company Interview Personas and turn generation."""

import pytest

from app.core import config
from app.schemas.adaptive import EngineAction
from app.services.turn_generator import TurnGenerator


@pytest.mark.asyncio
async def test_generate_question_async_with_personas(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify company persona parameters are accepted and generate appropriate technical questions."""
    settings = config.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "")

    for persona in ["STANDARD", "BIG_TECH", "SCALE_UP", "FINTECH"]:
        question = await TurnGenerator.generate_question_async(
            action=EngineAction.CHALLENGE,
            topic_name="Distributed Transactions & ACID",
            target_seniority="STAFF",
            claim_text="Scaled Kafka and PostgreSQL for payment ledger",
            candidate_last_answer="We relied on Two-Phase Commit across all services.",
            preferred_language="Go",
            company_persona=persona,
        )
        assert len(question) > 20
        assert "?" in question

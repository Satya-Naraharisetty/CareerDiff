"""Unit tests for the complete spectrum of technical interview question archetypes and reverse Q&A."""

import pytest

from app.core.config import get_settings
from app.schemas.adaptive import EngineAction, QuestionArchetype
from app.services.turn_generator import (
    SAMPLE_CODE_SNIPPETS,
    TurnGenerationResult,
    TurnGenerator,
)


def test_archetype_resolution_mapping() -> None:
    """Verify deterministic mapping from EngineAction and context to QuestionArchetype."""
    # Warmup and Concluding states
    assert TurnGenerator.resolve_archetype(EngineAction.PROBE_DEEPER, state="WARMUP") == QuestionArchetype.WARMUP_MOTIVATION
    assert TurnGenerator.resolve_archetype(EngineAction.CONCLUDE, state="CONCLUDING") == QuestionArchetype.REVERSE_QA

    # Technical Core mappings
    assert TurnGenerator.resolve_archetype(EngineAction.VERIFY_CLAIM) == QuestionArchetype.SKILL_FUNDAMENTALS
    assert TurnGenerator.resolve_archetype(EngineAction.PROBE_DEEPER, turn_index=2) == QuestionArchetype.SKILL_FUNDAMENTALS
    assert TurnGenerator.resolve_archetype(EngineAction.PROBE_DEEPER, turn_index=3) == QuestionArchetype.SCENARIO_DECISION
    assert TurnGenerator.resolve_archetype(EngineAction.CHALLENGE, turn_index=1) == QuestionArchetype.DEBUGGING_INCIDENT
    assert TurnGenerator.resolve_archetype(EngineAction.CHALLENGE, turn_index=2) == QuestionArchetype.SCENARIO_DECISION
    assert TurnGenerator.resolve_archetype(EngineAction.SCENARIO, turn_index=3) == QuestionArchetype.CODE_REVIEW
    assert TurnGenerator.resolve_archetype(EngineAction.SCENARIO, turn_index=4, company_name="Stripe") == QuestionArchetype.COMPANY_SPECIFIC
    assert TurnGenerator.resolve_archetype(EngineAction.CHANGE_TOPIC, turn_index=1, company_name="Stripe") == QuestionArchetype.COMPANY_SPECIFIC
    assert TurnGenerator.resolve_archetype(EngineAction.CHANGE_TOPIC, turn_index=2) == QuestionArchetype.ANALYZING_DESIGN


def test_code_review_sample_injection() -> None:
    """Verify code review questions supply real language code snippets."""
    res_py = TurnGenerator.generate_question(
        action=EngineAction.SCENARIO,
        topic_name="concurrency",
        preferred_language="Python",
        archetype=QuestionArchetype.CODE_REVIEW,
        code_sample=SAMPLE_CODE_SNIPPETS["Python"]["concurrency"],
    )
    assert res_py.archetype == QuestionArchetype.CODE_REVIEW
    assert res_py.code_sample is not None
    assert "process_account_debit" in res_py.code_sample
    assert "concurrency bug or performance bottleneck" in res_py.transcript

    res_ts = TurnGenerator.generate_question(
        action=EngineAction.SCENARIO,
        topic_name="caching",
        preferred_language="TypeScript",
        archetype=QuestionArchetype.CODE_REVIEW,
        code_sample=SAMPLE_CODE_SNIPPETS["TypeScript"]["concurrency"],
    )
    assert "TypeScript" in res_ts.transcript
    assert "getSessionToken" in str(res_ts.code_sample)


def test_debugging_incident_question_generation() -> None:
    """Verify debugging/troubleshooting questions introduce concrete production regressions."""
    res = TurnGenerator.generate_question(
        action=EngineAction.CHALLENGE,
        topic_name="database-architecture",
        company_name="Databricks",
        archetype=QuestionArchetype.DEBUGGING_INCIDENT,
    )
    assert res.archetype == QuestionArchetype.DEBUGGING_INCIDENT
    assert "P99 latency surges by 400%" in res.transcript
    assert "Databricks" in res.transcript


def test_company_specific_scenario_generation() -> None:
    """Verify company-specific questions ground problems in target company domain."""
    res = TurnGenerator.generate_question(
        action=EngineAction.CHANGE_TOPIC,
        topic_name="api-resilience",
        company_name="Stripe",
        archetype=QuestionArchetype.COMPANY_SPECIFIC,
    )
    assert res.archetype == QuestionArchetype.COMPANY_SPECIFIC
    assert "Stripe operates at global scale" in res.transcript
    assert "strict idempotency" in res.transcript


def test_scenario_decision_tradeoff_generation() -> None:
    """Verify scenario decision questions force explicit architectural trade-off evaluation."""
    res = TurnGenerator.generate_question(
        action=EngineAction.PROBE_DEEPER,
        topic_name="distributed-systems",
        archetype=QuestionArchetype.SCENARIO_DECISION,
    )
    assert res.archetype == QuestionArchetype.SCENARIO_DECISION
    assert "strong immediate consistency" in res.transcript
    assert "eventual consistency" in res.transcript


@pytest.mark.asyncio
async def test_reverse_qa_staff_engineer_response(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify reverse Q&A generates authentic Staff Engineer responses with company context."""
    # Ensure offline deterministic test
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "")

    resp = await TurnGenerator.generate_reverse_qa_response_async(
        candidate_question="How does your team manage schema migrations and zero-downtime rollouts?",
        company_name="Stripe",
        preferred_language="Python",
        target_seniority="STAFF",
    )
    assert "Stripe" in resp
    assert "canary rollouts" in resp
    assert "evaluation report" in resp


def test_turn_generation_result_string_compatibility() -> None:
    """Verify TurnGenerationResult behaves as a true str subclass for database and JSON serialization."""
    res = TurnGenerationResult(
        transcript="What concurrency primitives do you use?",
        archetype=QuestionArchetype.SKILL_FUNDAMENTALS,
        code_sample="x = 1",
    )
    assert isinstance(res, str)
    assert res == "What concurrency primitives do you use?"
    assert "concurrency" in res
    assert res.archetype == QuestionArchetype.SKILL_FUNDAMENTALS
    assert res.code_sample == "x = 1"

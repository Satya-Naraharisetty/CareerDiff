"""Unit tests for deterministic blueprint builder, time budgeting math, and claim matching."""

import uuid

import pytest

from app.models.resume import ResumeClaim
from app.services.blueprint_builder import (
    calculate_topic_time_budgets,
    match_claims_to_competency,
)


def test_time_budget_allocation_15_minutes() -> None:
    """Verify 15-minute interview time conservation and topic partition."""
    budget = calculate_topic_time_budgets(duration_minutes=15, num_topics=2)
    assert budget.total_seconds == 900
    assert budget.warmup_seconds == 120
    assert budget.conclusion_seconds == 180
    assert sum(budget.topic_budgets) == 600
    assert budget.topic_budgets == [300, 300]


def test_time_budget_allocation_30_minutes() -> None:
    """Verify 30-minute interview time conservation across 3 topics."""
    budget = calculate_topic_time_budgets(duration_minutes=30, num_topics=3)
    assert budget.total_seconds == 1800
    assert budget.warmup_seconds == 120
    assert budget.conclusion_seconds == 180
    assert sum(budget.topic_budgets) == 1500
    assert budget.topic_budgets == [500, 500, 500]


def test_time_budget_allocation_45_minutes() -> None:
    """Verify 45-minute interview time conservation across 3 topics."""
    budget = calculate_topic_time_budgets(duration_minutes=45, num_topics=3)
    assert budget.total_seconds == 2700
    assert sum(budget.topic_budgets) + budget.warmup_seconds + budget.conclusion_seconds == 2700
    assert budget.topic_budgets == [800, 800, 800]


def test_time_budget_allocation_with_remainder() -> None:
    """Verify that indivisible topic seconds are distributed without rounding loss."""
    budget = calculate_topic_time_budgets(duration_minutes=31, num_topics=3)
    assert budget.total_seconds == 1860
    assert sum(budget.topic_budgets) + 120 + 180 == 1860


def test_time_budget_invalid_parameters() -> None:
    """Verify that insufficient duration or non-positive topics raise ValueError."""
    with pytest.raises(ValueError):
        calculate_topic_time_budgets(duration_minutes=4, num_topics=2)
    with pytest.raises(ValueError):
        calculate_topic_time_budgets(duration_minutes=30, num_topics=0)


def test_match_claims_to_competency() -> None:
    """Verify domain keyword matching between candidate resume claims and competencies."""
    claim1 = ResumeClaim(
        id=uuid.uuid4(),
        resume_id=uuid.uuid4(),
        claim_text="Architected distributed Kafka pipeline processing 50k events/sec",
        category="EXPLICIT_FACT",
        source_section="Experience",
        start_offset=0,
        end_offset=64,
        technologies=["Kafka", "Distributed Systems"],
        confidence_score=0.95,
    )
    claim2 = ResumeClaim(
        id=uuid.uuid4(),
        resume_id=uuid.uuid4(),
        claim_text="Tuned PostgreSQL query planner and optimized B-Tree indexes",
        category="EXPLICIT_FACT",
        source_section="Experience",
        start_offset=0,
        end_offset=58,
        technologies=["PostgreSQL", "SQL"],
        confidence_score=0.95,
    )

    claims = [claim1, claim2]

    # Kafka claim matches distributed-systems
    ds_matches = match_claims_to_competency("distributed-systems", claims)
    assert str(claim1.id) in ds_matches
    assert str(claim2.id) not in ds_matches

    # Postgres claim matches database-architecture
    db_matches = match_claims_to_competency("database-architecture", claims)
    assert str(claim2.id) in db_matches
    assert str(claim1.id) not in db_matches

    # Unrelated competency gets no matches
    frontend_matches = match_claims_to_competency("web-performance", claims)
    assert len(frontend_matches) == 0

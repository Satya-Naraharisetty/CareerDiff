"""Unit tests for Turn Re-take schemas and rescore delta calculation."""

from app.schemas.interview import TurnRetakeRequest, TurnRetakeResponse


def test_turn_retake_request_validation() -> None:
    """Verify TurnRetakeRequest parses valid payload and validates minimum length."""
    req = TurnRetakeRequest(
        turn_index=3,
        new_transcript="We addressed concurrency by using PostgreSQL row-level locks and an idempotency key.",
        code_snippet="SELECT * FROM accounts WHERE id = :id FOR UPDATE;",
    )
    assert req.turn_index == 3
    assert "concurrency" in req.new_transcript
    assert req.code_snippet is not None


def test_turn_retake_response_delta() -> None:
    """Verify TurnRetakeResponse computes and structures score improvement correctly."""
    resp = TurnRetakeResponse(
        turn_index=2,
        previous_transcript="We just scaled Redis.",
        new_transcript=(
            "We migrated from an ephemeral Redis cache to an event-driven Transactional Outbox pattern "
            "with idempotent Kafka consumers partitioned on account_id, ensuring strict sequential processing."
        ),
        previous_estimated_score=2.0,
        new_score=3.7,
        score_delta=1.7,
        improved_tier="Expert (L4)",
        coaching_feedback="Exemplary shift to durable transactional semantics.",
        staff_model_answer="Establish high-throughput SLAs and propose an idempotent outbox.",
        key_strengths_improved=["Partitioning awareness", "Durable ACID consistency"],
    )
    assert resp.score_delta == 1.7
    assert resp.new_score > resp.previous_estimated_score
    assert len(resp.key_strengths_improved) == 2

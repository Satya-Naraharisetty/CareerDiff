"""Unit tests for the LiveAnswerInterpreter."""

from app.schemas.adaptive import AnswerDepth, EngineAction
from app.services.live_answer_interpreter import LiveAnswerInterpreter


def test_interpreter_detects_stuck_candidate() -> None:
    """Expressions like 'I don't know' trigger AnswerDepth.STUCK and EngineAction.SIMPLIFY."""
    res = LiveAnswerInterpreter.interpret(
        candidate_transcript="Honestly I don't know how that replication protocol works.",
        active_topic_name="Distributed Storage & Kafka",
    )
    assert res.observed_depth == AnswerDepth.STUCK
    assert res.recommended_action == EngineAction.SIMPLIFY


def test_interpreter_detects_shallow_answer() -> None:
    """Brief, high-level answers (< 15 words) trigger SHALLOW and PROBE_DEEPER."""
    res = LiveAnswerInterpreter.interpret(
        candidate_transcript="We just used Redis for caching to speed things up.",
        active_topic_name="Database Concurrency & Locking",
    )
    assert res.observed_depth == AnswerDepth.SHALLOW
    assert res.recommended_action == EngineAction.PROBE_DEEPER


def test_interpreter_detects_technical_depth_and_challenges() -> None:
    """Answers mentioning multiple core architecture concepts trigger DEEP and CHALLENGE."""
    res = LiveAnswerInterpreter.interpret(
        candidate_transcript=(
            "We used Kafka partition keys to preserve order, configured min.insync.replicas=2, "
            "and mitigated consumer group rebalance latency using cooperative sticky assignors."
        ),
        active_topic_name="Distributed Storage & Kafka",
    )
    assert res.observed_depth == AnswerDepth.DEEP
    assert res.recommended_action == EngineAction.CHALLENGE
    assert "partition" in res.entities_mentioned
    assert "replica" in res.entities_mentioned


def test_interpreter_recommends_verify_claim_when_available() -> None:
    """When a topic starts (probe 0) and unverified resume claims exist, recommend VERIFY_CLAIM."""
    res = LiveAnswerInterpreter.interpret(
        candidate_transcript="I led the distributed streaming architecture for billing.",
        active_topic_name="Distributed Storage & Kafka",
        consecutive_probes=0,
        mapped_claim_texts=["Architected low-latency Kafka pipeline processing 50k events/sec"],
    )
    assert res.recommended_action == EngineAction.VERIFY_CLAIM

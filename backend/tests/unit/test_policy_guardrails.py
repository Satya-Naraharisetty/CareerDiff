"""Unit tests for deterministic Policy Guardrails."""

from app.schemas.adaptive import EngineAction, InterviewState, SessionPolicy
from app.services.interview_state_machine import InterviewStateMachine
from app.services.policy_guardrails import PolicyGuardrails


def test_probe_saturation_overrides_to_change_topic() -> None:
    """When consecutive probes reach max limit, PROBE_DEEPER is overridden to CHANGE_TOPIC."""
    fsm = InterviewStateMachine(
        initial_state=InterviewState.TECHNICAL_CORE,
        current_topic_index=0,
        consecutive_probes=3,
    )
    policy = SessionPolicy(max_consecutive_probes=3, max_duration_seconds=1800)

    result = PolicyGuardrails.evaluate(
        proposed_action=EngineAction.PROBE_DEEPER,
        fsm=fsm,
        policy=policy,
        total_topics=3,
    )

    assert result.is_overridden is True
    assert result.approved_action == EngineAction.CHANGE_TOPIC
    assert "Exceeded max consecutive probes" in (result.override_reason or "")


def test_probe_saturation_on_last_topic_overrides_to_conclude() -> None:
    """When consecutive probes reach limit on the final topic, override to CONCLUDE."""
    fsm = InterviewStateMachine(
        initial_state=InterviewState.TECHNICAL_CORE,
        current_topic_index=2,  # Last topic (0-indexed for 3 total)
        consecutive_probes=3,
    )
    policy = SessionPolicy(max_consecutive_probes=3, max_duration_seconds=1800)

    result = PolicyGuardrails.evaluate(
        proposed_action=EngineAction.PROBE_DEEPER,
        fsm=fsm,
        policy=policy,
        total_topics=3,
    )

    assert result.is_overridden is True
    assert result.approved_action == EngineAction.CONCLUDE


def test_conclusion_buffer_forces_conclude() -> None:
    """When elapsed time leaves <= conclusion buffer seconds, force CONCLUDE."""
    fsm = InterviewStateMachine(
        initial_state=InterviewState.TECHNICAL_CORE,
        actual_duration_seconds=1650,  # 1800 - 1650 = 150s remaining <= buffer (180s)
    )
    policy = SessionPolicy(
        max_duration_seconds=1800,
        conclusion_buffer_seconds=180,
    )

    result = PolicyGuardrails.evaluate(
        proposed_action=EngineAction.PROBE_DEEPER,
        fsm=fsm,
        policy=policy,
        total_topics=3,
    )

    assert result.is_overridden is True
    assert result.approved_action == EngineAction.CONCLUDE
    assert "conclusion buffer" in (result.override_reason or "").lower()


def test_topic_budget_saturation_forces_change_topic() -> None:
    """When current topic elapsed seconds exceed allocated budget, force CHANGE_TOPIC."""
    fsm = InterviewStateMachine(
        initial_state=InterviewState.TECHNICAL_CORE,
        current_topic_index=0,
        topic_elapsed_seconds=600,
    )
    policy = SessionPolicy(max_duration_seconds=1800)

    result = PolicyGuardrails.evaluate(
        proposed_action=EngineAction.PROBE_DEEPER,
        fsm=fsm,
        policy=policy,
        total_topics=3,
        topic_allocated_seconds=600,
    )

    assert result.is_overridden is True
    assert result.approved_action == EngineAction.CHANGE_TOPIC


def test_premature_conclude_rejected_if_coverage_insufficient() -> None:
    """If proposed action is CONCLUDE but coverage < minimum ratio and time remains, override."""
    fsm = InterviewStateMachine(
        initial_state=InterviewState.TECHNICAL_CORE,
        current_topic_index=0,
        actual_duration_seconds=300,  # Plenty of time left
    )
    # 0 topics covered out of 3 -> 0% < 70%
    policy = SessionPolicy(
        max_duration_seconds=1800,
        conclusion_buffer_seconds=180,
        minimum_coverage_ratio=0.70,
    )

    result = PolicyGuardrails.evaluate(
        proposed_action=EngineAction.CONCLUDE,
        fsm=fsm,
        policy=policy,
        total_topics=3,
    )

    assert result.is_overridden is True
    assert result.approved_action == EngineAction.CHANGE_TOPIC


def test_valid_action_passes_unconstrained() -> None:
    """When action respects all bounds, it passes through untouched."""
    fsm = InterviewStateMachine(
        initial_state=InterviewState.TECHNICAL_CORE,
        current_topic_index=0,
        consecutive_probes=1,
        actual_duration_seconds=300,
        topic_elapsed_seconds=120,
    )
    policy = SessionPolicy(max_consecutive_probes=3, max_duration_seconds=1800)

    result = PolicyGuardrails.evaluate(
        proposed_action=EngineAction.CHALLENGE,
        fsm=fsm,
        policy=policy,
        total_topics=3,
        topic_allocated_seconds=600,
    )

    assert result.is_overridden is False
    assert result.approved_action == EngineAction.CHALLENGE

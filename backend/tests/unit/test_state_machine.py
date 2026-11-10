"""Unit tests for the InterviewStateMachine invariant enforcement."""

import pytest

from app.schemas.adaptive import EngineAction, InterviewState
from app.services.interview_state_machine import (
    InterviewStateMachine,
    InvalidStateTransitionError,
)


def test_state_machine_valid_full_lifecycle() -> None:
    """Verify normal progression: CREATED -> WARMUP -> TECHNICAL_CORE -> CONCLUDING -> COMPLETED."""
    fsm = InterviewStateMachine()
    assert fsm.state == InterviewState.CREATED
    assert not fsm.is_terminal

    fsm.transition(InterviewState.WARMUP)
    assert fsm.state == InterviewState.WARMUP

    fsm.transition(InterviewState.TECHNICAL_CORE)
    assert fsm.state == InterviewState.TECHNICAL_CORE

    fsm.transition(InterviewState.CONCLUDING)
    assert fsm.state == InterviewState.CONCLUDING

    fsm.transition(InterviewState.COMPLETED)
    assert fsm.state == InterviewState.COMPLETED
    assert fsm.is_terminal


def test_state_machine_pause_and_resume() -> None:
    """Verify pausing and resuming from TECHNICAL_CORE."""
    fsm = InterviewStateMachine(initial_state=InterviewState.TECHNICAL_CORE)
    fsm.transition(InterviewState.PAUSED)
    assert fsm.state == InterviewState.PAUSED

    fsm.transition(InterviewState.TECHNICAL_CORE)
    assert fsm.state == InterviewState.TECHNICAL_CORE


def test_state_machine_illegal_transitions() -> None:
    """Verify that jumping across states illegally raises InvalidStateTransitionError."""
    fsm = InterviewStateMachine(initial_state=InterviewState.CREATED)

    # CREATED cannot jump directly to COMPLETED or TECHNICAL_CORE
    with pytest.raises(InvalidStateTransitionError):
        fsm.transition(InterviewState.COMPLETED)

    with pytest.raises(InvalidStateTransitionError):
        fsm.transition(InterviewState.TECHNICAL_CORE)

    # Move to WARMUP
    fsm.transition(InterviewState.WARMUP)
    with pytest.raises(InvalidStateTransitionError):
        fsm.transition(InterviewState.COMPLETED)

    # Move to TERMINAL
    fsm_completed = InterviewStateMachine(initial_state=InterviewState.COMPLETED)
    with pytest.raises(InvalidStateTransitionError):
        fsm_completed.transition(InterviewState.TECHNICAL_CORE)


def test_consecutive_probe_tracking() -> None:
    """Verify consecutive probe counter increments on PROBE_DEEPER and resets on others."""
    fsm = InterviewStateMachine(initial_state=InterviewState.TECHNICAL_CORE)
    assert fsm.consecutive_probes == 0

    fsm.record_action(EngineAction.PROBE_DEEPER)
    assert fsm.consecutive_probes == 1

    fsm.record_action(EngineAction.PROBE_DEEPER)
    assert fsm.consecutive_probes == 2

    # Any non-probe action resets counter
    fsm.record_action(EngineAction.CHALLENGE)
    assert fsm.consecutive_probes == 0

    fsm.record_action(EngineAction.PROBE_DEEPER)
    assert fsm.consecutive_probes == 1

    fsm.record_action(EngineAction.CHANGE_TOPIC)
    assert fsm.consecutive_probes == 0


def test_topic_advancement() -> None:
    """Verify advance_topic advances index, records covered topics, and detects topic exhaustion."""
    fsm = InterviewStateMachine(initial_state=InterviewState.TECHNICAL_CORE)
    assert fsm.current_topic_index == 0

    # Advance from topic 0 to topic 1 (out of 3 total topics)
    has_more = fsm.advance_topic(total_topics=3)
    assert has_more is True
    assert fsm.current_topic_index == 1
    assert 0 in fsm.covered_topic_indices

    # Advance from topic 1 to topic 2
    has_more = fsm.advance_topic(total_topics=3)
    assert has_more is True
    assert fsm.current_topic_index == 2
    assert 1 in fsm.covered_topic_indices

    # Advance past last topic -> returns False
    has_more = fsm.advance_topic(total_topics=3)
    assert has_more is False
    assert fsm.current_topic_index == 3

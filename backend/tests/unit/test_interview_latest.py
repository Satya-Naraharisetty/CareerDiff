"""Unit tests for latest interview resolution and detail builder."""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.api.v1.endpoints.interviews import _build_interview_detail
from app.models.interview import BlueprintTopic, Interview, InterviewBlueprint, InterviewTurn
from app.schemas.adaptive import EngineAction
from app.schemas.interview import InterviewHistoryItemRead, InterviewHistoryResponse


def test_build_interview_detail_with_topics() -> None:
    """Verify _build_interview_detail accurately computes topic progression and probe counts."""
    mock_interview = MagicMock(spec=Interview)
    mock_interview.id = uuid.uuid4()
    mock_interview.state = "CONDUCTING"
    mock_interview.target_seniority = "SENIOR"
    mock_interview.scheduled_duration_minutes = 30
    mock_interview.actual_duration_seconds = 180
    mock_interview.created_at = datetime.now(timezone.utc)
    mock_interview.started_at = datetime.now(timezone.utc)
    mock_interview.finished_at = None

    t1 = MagicMock(spec=BlueprintTopic)
    t1.topic_name = "System Architecture"
    t1.display_order = 0

    t2 = MagicMock(spec=BlueprintTopic)
    t2.topic_name = "Concurrency & Locks"
    t2.display_order = 1

    blueprint = MagicMock(spec=InterviewBlueprint)
    blueprint.topics = [t1, t2]
    mock_interview.blueprint = blueprint

    turn0 = MagicMock(spec=InterviewTurn)
    turn0.speaker = "INTERVIEWER"
    turn0.action_taken = EngineAction.CLARIFY.value

    turn1 = MagicMock(spec=InterviewTurn)
    turn1.speaker = "CANDIDATE"
    turn1.action_taken = None

    turn2 = MagicMock(spec=InterviewTurn)
    turn2.speaker = "INTERVIEWER"
    turn2.action_taken = EngineAction.PROBE_DEEPER.value

    mock_interview.turns = [turn0, turn1, turn2]

    detail = _build_interview_detail(mock_interview)
    assert detail.id == mock_interview.id
    assert detail.state == "CONDUCTING"
    assert detail.current_topic == "System Architecture"
    assert detail.consecutive_probes == 1
    assert detail.total_turns == 3


def test_build_interview_detail_empty() -> None:
    """Verify _build_interview_detail handles session with no blueprint or turns gracefully."""
    mock_interview = MagicMock(spec=Interview)
    mock_interview.id = uuid.uuid4()
    mock_interview.state = "COMPLETED"
    mock_interview.target_seniority = "STAFF"
    mock_interview.scheduled_duration_minutes = 45
    mock_interview.actual_duration_seconds = 1200
    mock_interview.created_at = datetime.now(timezone.utc)
    mock_interview.started_at = datetime.now(timezone.utc)
    mock_interview.finished_at = datetime.now(timezone.utc)
    mock_interview.blueprint = None
    mock_interview.turns = []

    detail = _build_interview_detail(mock_interview)
    assert detail.current_topic is None
    assert detail.consecutive_probes == 0
    assert detail.total_turns == 0


def test_interview_history_response_aggregation() -> None:
    """Verify InterviewHistoryResponse aggregates delta, averages, and session list."""
    item1 = InterviewHistoryItemRead(
        id=uuid.uuid4(),
        state="COMPLETED",
        target_seniority="MID",
        role_title="Backend Engineer",
        scheduled_duration_minutes=30,
        actual_duration_seconds=1200,
        total_turns=8,
        overall_score=2.2,
        ats_score=68.0,
        communication_score=75.0,
        created_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        finished_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )
    item2 = InterviewHistoryItemRead(
        id=uuid.uuid4(),
        state="COMPLETED",
        target_seniority="SENIOR",
        role_title="Senior Concurrency Engineer",
        scheduled_duration_minutes=30,
        actual_duration_seconds=1450,
        total_turns=12,
        overall_score=3.4,
        ats_score=88.0,
        communication_score=85.0,
        created_at=datetime(2026, 11, 15, tzinfo=timezone.utc),
        finished_at=datetime(2026, 11, 15, tzinfo=timezone.utc),
    )

    history = InterviewHistoryResponse(
        items=[item2, item1],
        total_interviews=2,
        average_score=2.8,
        score_improvement_delta=1.2,
        latest_score=3.4,
    )

    assert history.total_interviews == 2
    assert history.average_score == 2.8
    assert history.score_improvement_delta == 1.2
    assert history.latest_score == 3.4
    assert history.items[0].target_seniority == "SENIOR"
    assert history.items[1].target_seniority == "MID"

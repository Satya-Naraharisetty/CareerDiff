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


import pytest
from unittest.mock import AsyncMock
from fastapi import HTTPException
from app.api.v1.endpoints.interviews import _fetch_assessment_report, get_latest_assessment_report
from app.models.user import User, CandidateProfile


@pytest.mark.asyncio
async def test_fetch_assessment_report_uncompleted_returns_404() -> None:
    """Verify that requesting a report for an uncompleted (e.g. WARMUP) interview returns 404, not 409."""
    mock_db = AsyncMock()
    mock_interview = MagicMock(spec=Interview)
    mock_interview.id = uuid.uuid4()
    mock_interview.state = "WARMUP"
    mock_interview.candidate_profile_id = uuid.uuid4()

    # DB execute return sequence:
    # 1. select(Interview) -> mock_interview
    # 2. select(AssessmentReport) -> None
    mock_result_interview = MagicMock()
    mock_result_interview.scalar_one_or_none.return_value = mock_interview

    mock_result_report = MagicMock()
    mock_result_report.scalars.return_value.first.return_value = None

    mock_db.execute.side_effect = [mock_result_interview, mock_result_report]

    with pytest.raises(HTTPException) as exc_info:
        await _fetch_assessment_report(db=mock_db, interview_id=mock_interview.id)

    assert exc_info.value.status_code == 404
    assert "not completed yet" in exc_info.value.detail


@pytest.mark.asyncio
async def test_fetch_assessment_report_completed_not_ready_returns_409() -> None:
    """Verify that requesting a report for a COMPLETED interview still being scored returns 409 REPORT_NOT_READY."""
    mock_db = AsyncMock()
    mock_interview = MagicMock(spec=Interview)
    mock_interview.id = uuid.uuid4()
    mock_interview.state = "COMPLETED"
    mock_interview.candidate_profile_id = uuid.uuid4()

    mock_result_interview = MagicMock()
    mock_result_interview.scalar_one_or_none.return_value = mock_interview

    mock_result_report = MagicMock()
    mock_result_report.scalars.return_value.first.return_value = None

    mock_db.execute.side_effect = [mock_result_interview, mock_result_report]

    with pytest.raises(HTTPException) as exc_info:
        await _fetch_assessment_report(db=mock_db, interview_id=mock_interview.id)

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "REPORT_NOT_READY"


@pytest.mark.asyncio
async def test_get_latest_assessment_report_returns_404_when_no_scored_or_completed() -> None:
    """Verify get_latest_assessment_report returns 404 when candidate only has uncompleted sessions and no reports."""
    mock_db = AsyncMock()
    mock_user = MagicMock(spec=User)
    mock_user.id = uuid.uuid4()

    mock_profile = MagicMock(spec=CandidateProfile)
    mock_profile.id = uuid.uuid4()
    mock_profile.user_id = mock_user.id

    # Sequence:
    # 1. select profile -> mock_profile
    # 2. select interview with report -> None
    # 3. select completed interview -> None
    mock_res_profile = MagicMock()
    mock_res_profile.scalar_one_or_none.return_value = mock_profile

    mock_res_scored = MagicMock()
    mock_res_scored.scalars.return_value.first.return_value = None

    mock_res_completed = MagicMock()
    mock_res_completed.scalars.return_value.first.return_value = None

    mock_db.execute.side_effect = [mock_res_profile, mock_res_scored, mock_res_completed]

    with pytest.raises(HTTPException) as exc_info:
        await get_latest_assessment_report(current_user=mock_user, db=mock_db)

    assert exc_info.value.status_code == 404
    assert "No completed interview reports found" in exc_info.value.detail



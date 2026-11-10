"""Interview lifecycle, turn execution, and session planning endpoints."""

import uuid
from pathlib import Path

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import get_current_user
from app.models.evaluation import (
    AssessmentReport,
    CompetencyScore,
    EvaluationEvidence,
    InterviewClaimVerification,
)
from app.models.interview import Interview, InterviewBlueprint, InterviewTurn
from app.models.role import JobRole
from app.models.user import CandidateProfile, User
from app.schemas.adaptive import (
    CandidateTurnRequest,
    EngineAction,
    InterviewDetailResponse,
    InterviewerTurnResponse,
    InterviewTurnRead,
)
from app.schemas.evaluation import (
    AssessmentReportRead,
    ClaimVerificationRead,
    CompetencyScoreRead,
    EvaluationEvidenceRead,
    EvaluationTriggerResponse,
)
from app.schemas.interview import (
    BlueprintTopicRead,
    InterviewBlueprintRead,
    InterviewCreateRequest,
    InterviewCreateResponse,
)
from app.schemas.voice import WsTicketResponse
from app.services.blueprint_builder import generate_interview_blueprint
from app.services.evaluator import AssessmentEvaluator
from app.services.ticket_service import TicketService
from app.services.turn_service import TurnService

router = APIRouter()


@router.post(
    "",
    response_model=InterviewCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule and plan an interview session",
)
async def create_interview(
    payload: InterviewCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewCreateResponse:
    """Initialize an interview session and generate the deterministic interview blueprint."""
    # 1. Verify job role exists
    stmt_role = select(JobRole).where(JobRole.id == payload.role_id, JobRole.is_active.is_(True))
    role = (await db.execute(stmt_role)).scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job role not found or inactive",
        )

    # 2. Retrieve or create candidate profile for current user
    stmt_profile = select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    profile = (await db.execute(stmt_profile)).scalar_one_or_none()
    if not profile:
        profile = CandidateProfile(
            user_id=current_user.id,
            target_seniority=payload.target_seniority,
            primary_discipline="BACKEND",
            years_experience=0,
            verified_skills=[],
        )
        db.add(profile)
        await db.flush()

    # 3. Create interview entity
    interview = Interview(
        candidate_profile_id=profile.id,
        role_id=role.id,
        target_seniority=payload.target_seniority,
        state="CREATED",
        mode=payload.mode,
        scheduled_duration_minutes=payload.duration_minutes,
        actual_duration_seconds=0,
        session_policy={},
    )
    db.add(interview)
    await db.flush()

    # 4. Generate deterministic blueprint
    blueprint = await generate_interview_blueprint(interview, db)
    await db.commit()

    # Eagerly load topics with selectinload to avoid lazy-loading MissingGreenlet
    stmt_bp = (
        select(InterviewBlueprint)
        .options(selectinload(InterviewBlueprint.topics))
        .where(InterviewBlueprint.id == blueprint.id)
    )
    loaded_bp = (await db.execute(stmt_bp)).scalar_one()

    topic_reads: list[BlueprintTopicRead] = [
        BlueprintTopicRead(
            topic_name=t.topic_name,
            allocated_seconds=t.allocated_seconds,
            mapped_claims_count=len(t.mapped_claim_ids),
        )
        for t in loaded_bp.topics
    ]

    blueprint_read = InterviewBlueprintRead(
        total_topics=loaded_bp.total_topics,
        total_allocated_seconds=loaded_bp.total_allocated_seconds,
        warmup_seconds=loaded_bp.warmup_seconds,
        conclusion_seconds=loaded_bp.conclusion_seconds,
        topics=topic_reads,
    )

    return InterviewCreateResponse(
        interview_id=interview.id,
        state=interview.state,
        scheduled_duration_minutes=interview.scheduled_duration_minutes,
        blueprint=blueprint_read,
    )


@router.get(
    "/{interview_id}",
    response_model=InterviewDetailResponse,
    summary="Get interview session details and progress",
)
async def get_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewDetailResponse:
    """Retrieve detailed state and metadata of an interview session."""
    stmt = (
        select(Interview)
        .options(
            selectinload(Interview.blueprint).selectinload(InterviewBlueprint.topics),
            selectinload(Interview.turns),
        )
        .where(Interview.id == interview_id)
    )
    interview = (await db.execute(stmt)).scalar_one_or_none()
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found.",
        )

    # Determine current topic and consecutive probes
    current_topic_name: str | None = None
    consecutive_probes = 0
    if interview.blueprint and interview.blueprint.topics:
        topics = sorted(interview.blueprint.topics, key=lambda t: t.display_order)
        curr_idx = 0
        for turn in interview.turns:
            if turn.speaker == "INTERVIEWER" and turn.action_taken:
                act = EngineAction(turn.action_taken)
                if act == EngineAction.CHANGE_TOPIC:
                    curr_idx = min(curr_idx + 1, len(topics) - 1)
                    consecutive_probes = 0
                elif act == EngineAction.PROBE_DEEPER:
                    consecutive_probes += 1
                else:
                    consecutive_probes = 0
        if curr_idx < len(topics):
            current_topic_name = topics[curr_idx].topic_name

    return InterviewDetailResponse(
        id=interview.id,
        state=interview.state,
        target_seniority=interview.target_seniority,
        scheduled_duration_minutes=interview.scheduled_duration_minutes,
        actual_duration_seconds=interview.actual_duration_seconds,
        current_topic=current_topic_name,
        consecutive_probes=consecutive_probes,
        total_turns=len(interview.turns),
        created_at=interview.created_at,
        started_at=interview.started_at,
        finished_at=interview.finished_at,
    )


@router.post(
    "/{interview_id}/start",
    response_model=InterviewTurnRead,
    status_code=status.HTTP_200_OK,
    summary="Start interview session and emit Turn 0 greeting",
)
async def start_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewTurnRead:
    """Transition session to WARMUP and generate the initial greeting question."""
    turn = await TurnService.start_interview(db, interview_id)
    return InterviewTurnRead.model_validate(turn)


@router.post(
    "/{interview_id}/turns",
    response_model=InterviewerTurnResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit candidate turn and receive adaptive interviewer response",
)
async def submit_turn(
    interview_id: uuid.UUID,
    payload: CandidateTurnRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InterviewerTurnResponse:
    """Submit a candidate transcript turn.

    Commits turn to PostgreSQL first, evaluates policy guardrails, and returns the next question.
    """
    return await TurnService.process_candidate_turn(db, interview_id, payload)


@router.get(
    "/{interview_id}/turns",
    response_model=list[InterviewTurnRead],
    summary="Get full immutable transcript timeline",
)
async def get_interview_turns(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[InterviewTurnRead]:
    """Retrieve all turns for the interview session ordered chronologically."""
    stmt = (
        select(InterviewTurn)
        .where(InterviewTurn.interview_id == interview_id)
        .order_by(InterviewTurn.turn_index.asc())
    )
    result = await db.execute(stmt)
    turns = result.scalars().all()
    return [InterviewTurnRead.model_validate(t) for t in turns]


@router.post(
    "/{interview_id}/ws-ticket",
    response_model=WsTicketResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate ephemeral single-use ticket for WebSocket authorization",
)
async def create_ws_ticket(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> WsTicketResponse:
    """Generate a single-use resumption ticket stored in Redis with 60s TTL."""
    # Verify interview exists
    stmt = select(Interview).where(Interview.id == interview_id)
    interview = (await db.execute(stmt)).scalar_one_or_none()
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found.",
        )

    ticket = await TicketService.create_ticket(
        redis=redis,
        interview_id=interview_id,
        user_id=current_user.id,
    )
    ws_url = f"/ws/v1/interviews/{interview_id}?ticket={ticket}"
    return WsTicketResponse(
        ticket=ticket,
        websocket_url=ws_url,
        expires_in_seconds=60,
    )


@router.get(
    "/{interview_id}/chat",
    response_class=HTMLResponse,
    summary="Interactive Text Interview Web Client",
)
async def get_chat_interface(
    interview_id: uuid.UUID,
    token: str | None = Query(default=None),
) -> HTMLResponse:
    """Serve a lightweight, responsive text interview interface for direct browser execution."""
    template_path = Path(__file__).resolve().parent.parent.parent.parent / "templates" / "chat.html"
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat interface template not found.",
        )
    html_content = template_path.read_text(encoding="utf-8")
    html_content = html_content.replace("{{interview_id}}", str(interview_id))
    html_content = html_content.replace("{{token}}", token or "")
    return HTMLResponse(content=html_content)


@router.post(
    "/{interview_id}/evaluate",
    response_model=EvaluationTriggerResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger rubric evaluation and evidence dossier compilation",
)
async def trigger_interview_evaluation(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EvaluationTriggerResponse:
    """Execute on-demand rubric scoring, evidence grounding, and claim verification."""
    stmt = select(Interview).where(Interview.id == interview_id)
    interview = (await db.execute(stmt)).scalar_one_or_none()
    if not interview:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview_id}' not found.",
        )

    report = await AssessmentEvaluator.evaluate_interview(
        db=db,
        interview_id=interview_id,
    )
    return EvaluationTriggerResponse(
        interview_id=interview_id,
        status="COMPLETED",
        message="Assessment evaluation successfully completed.",
        task_id=str(report.id),
    )


@router.get(
    "/{interview_id}/report",
    response_model=AssessmentReportRead,
    summary="Retrieve completed candidate assessment dossier and rubric grounding",
)
async def get_assessment_report(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AssessmentReportRead:
    """Retrieve completed evaluation report with normalized evidence citations and claim audit."""
    stmt_rep = (
        select(AssessmentReport)
        .options(
            selectinload(AssessmentReport.competency_scores)
            .selectinload(CompetencyScore.evidence_items)
            .selectinload(EvaluationEvidence.interview_turn),
            selectinload(AssessmentReport.competency_scores).selectinload(
                CompetencyScore.competency
            ),
        )
        .where(
            AssessmentReport.interview_id == interview_id,
            AssessmentReport.is_latest.is_(True),
        )
        .order_by(AssessmentReport.version.desc())
    )
    report = (await db.execute(stmt_rep)).scalars().first()

    if not report:
        stmt_int = select(Interview).where(Interview.id == interview_id)
        interview = (await db.execute(stmt_int)).scalar_one_or_none()
        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Interview '{interview_id}' not found.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No assessment report has been generated yet for interview '{interview_id}'.",
        )

    # Load claim verifications
    stmt_claims = (
        select(InterviewClaimVerification)
        .options(
            selectinload(InterviewClaimVerification.resume_claim),
            selectinload(InterviewClaimVerification.verified_turn),
        )
        .where(InterviewClaimVerification.interview_id == interview_id)
    )
    claim_verifs = list((await db.execute(stmt_claims)).scalars().all())

    comp_score_reads: list[CompetencyScoreRead] = []
    for cs in report.competency_scores:
        ev_reads: list[EvaluationEvidenceRead] = [
            EvaluationEvidenceRead(
                id=ev.id,
                interview_turn_id=ev.interview_turn_id,
                turn_index=ev.interview_turn.turn_index,
                evidence_type=ev.evidence_type,  # type: ignore[arg-type]
                assessment_impact=ev.assessment_impact,  # type: ignore[arg-type]
                transcript_excerpt=ev.transcript_excerpt,
                start_char_offset=ev.start_char_offset,
                end_char_offset=ev.end_char_offset,
                confidence=ev.confidence,
                rationale=ev.rationale,
            )
            for ev in cs.evidence_items
        ]
        comp_score_reads.append(
            CompetencyScoreRead(
                competency_id=cs.competency_id,
                competency_name=cs.competency.name if cs.competency else "Unknown",
                score=cs.score,
                status=cs.status,  # type: ignore[arg-type]
                rationale=cs.rationale,
                confidence=cs.confidence,
                evidence_items=ev_reads,
            )
        )

    claim_reads: list[ClaimVerificationRead] = [
        ClaimVerificationRead(
            claim_id=cv.resume_claim_id,
            claim_text=cv.resume_claim.claim_text if cv.resume_claim else "",
            category=cv.resume_claim.category if cv.resume_claim else "EXPLICIT_FACT",
            status=cv.status,  # type: ignore[arg-type]
            confidence=cv.confidence,
            auditor_notes=cv.auditor_notes,
            verified_turn_index=cv.verified_turn.turn_index if cv.verified_turn else None,
        )
        for cv in claim_verifs
    ]

    return AssessmentReportRead(
        report_id=report.id,
        interview_id=report.interview_id,
        version=report.version,
        is_latest=report.is_latest,
        model_used=report.model_used,
        overall_score=report.overall_score,
        summary=report.summary,
        strengths=report.strengths,
        knowledge_gaps=report.knowledge_gaps,
        study_recommendations=report.study_recommendations,
        competency_scores=comp_score_reads,
        claim_verifications=claim_reads,
        created_at=report.created_at,
    )


@router.get(
    "/{interview_id}/dossier",
    response_class=HTMLResponse,
    summary="Interactive Candidate Assessment Dossier & Visual Dashboard",
)
async def get_assessment_dossier_interface(
    interview_id: uuid.UUID,
    token: str | None = Query(default=None),
) -> HTMLResponse:
    """Serve the interactive candidate assessment dossier dashboard."""
    template_path = (
        Path(__file__).resolve().parent.parent.parent.parent / "templates" / "dossier.html"
    )
    if not template_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment dossier template not found.",
        )
    html_content = template_path.read_text(encoding="utf-8")
    html_content = html_content.replace("{{interview_id}}", str(interview_id))
    html_content = html_content.replace("{{token}}", token or "")
    return HTMLResponse(content=html_content)

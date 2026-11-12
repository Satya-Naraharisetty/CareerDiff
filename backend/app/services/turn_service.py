"""Turn orchestration service enforcing durability invariants and policy-controlled adaptation."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.interview import BlueprintTopic, Interview, InterviewBlueprint, InterviewTurn
from app.models.resume import Resume, ResumeClaim
from app.models.user import CandidateProfile, User
from app.schemas.adaptive import (
    CandidateTurnRequest,
    EngineAction,
    InterviewerTurnResponse,
    InterviewState,
    QuestionArchetype,
    SessionPolicy,
)
from app.services.interview_state_machine import InterviewStateMachine
from app.services.live_answer_interpreter import LiveAnswerInterpreter
from app.services.outbox_service import OutboxService
from app.services.policy_guardrails import PolicyGuardrails
from app.services.turn_generator import TurnGenerator


class TurnService:
    """Orchestrates candidate-interviewer turn transitions with PostgreSQL durability."""

    @staticmethod
    async def start_interview(
        db: AsyncSession,
        interview_id: uuid.UUID,
    ) -> InterviewTurn:
        """Start an interview session, transition to WARMUP, and commit initial turn 0."""
        stmt = (
            select(Interview)
            .options(
                selectinload(Interview.blueprint).selectinload(InterviewBlueprint.topics),
                selectinload(Interview.turns),
            )
            .where(Interview.id == interview_id)
        )
        result = await db.execute(stmt)
        interview = result.scalar_one_or_none()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Interview '{interview_id}' not found.",
            )

        if interview.state != InterviewState.CREATED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start interview in state '{interview.state}'. Expected 'CREATED'.",
            )

        # Transition state machine CREATED -> WARMUP
        fsm = InterviewStateMachine(initial_state=InterviewState.CREATED)
        fsm.transition(InterviewState.WARMUP)
        interview.state = fsm.state.value
        interview.started_at = datetime.now(timezone.utc)

        # Load candidate profile and latest resume for personalized greeting
        stmt_prof = (
            select(CandidateProfile)
            .options(
                selectinload(CandidateProfile.user),
                selectinload(CandidateProfile.resumes).selectinload(Resume.claims),
            )
            .where(CandidateProfile.id == interview.candidate_profile_id)
        )
        profile = (await db.execute(stmt_prof)).scalar_one_or_none()
        cand_name: str | None = None
        key_claim: str | None = None
        skills: list[str] = []
        if profile:
            cand_name = profile.user.full_name if profile.user else None
            skills = profile.verified_skills or []
            if profile.resumes:
                latest_resume = sorted(profile.resumes, key=lambda r: r.created_at, reverse=True)[0]
                if latest_resume.claims:
                    for c in latest_resume.claims:
                        if c.category == "EXPLICIT_FACT":
                            key_claim = c.claim_text
                            break
                    if not key_claim and latest_resume.claims:
                        key_claim = latest_resume.claims[0].claim_text

        # Generate Turn 0: WARMUP Greeting grounded in candidate resume & target company
        raw_pol = interview.session_policy or {}
        company_target: str | None = raw_pol.get("target_company") or raw_pol.get("company_name")
        greeting_text = TurnGenerator.generate_warmup_greeting(
            candidate_name=cand_name,
            target_seniority=interview.target_seniority,
            primary_discipline=profile.primary_discipline if profile else "BACKEND",
            top_skills=skills,
            key_claim=key_claim,
            company_name=company_target,
        )
        turn_0 = InterviewTurn(
            interview_id=interview.id,
            turn_index=0,
            speaker="INTERVIEWER",
            transcript=greeting_text,
            action_taken=None,
            question_archetype=QuestionArchetype.WARMUP_MOTIVATION.value,
        )
        db.add(turn_0)
        await db.commit()
        await db.refresh(turn_0)
        return turn_0

    @classmethod
    async def process_candidate_turn(
        self,
        db: AsyncSession,
        interview_id: uuid.UUID,
        request: CandidateTurnRequest,
    ) -> InterviewerTurnResponse:
        """Process candidate turn: commit first, evaluate policy, and generate next question."""
        # 1. Fetch interview with blueprint, topics, and existing turns
        stmt = (
            select(Interview)
            .options(
                selectinload(Interview.blueprint).selectinload(InterviewBlueprint.topics),
                selectinload(Interview.turns),
            )
            .where(Interview.id == interview_id)
        )
        result = await db.execute(stmt)
        interview = result.scalar_one_or_none()

        if not interview:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Interview '{interview_id}' not found.",
            )

        current_state = InterviewState(interview.state)
        if current_state in {InterviewState.COMPLETED, InterviewState.ABORTED}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Interview has already finished (state: {interview.state}).",
            )

        if not interview.blueprint or not interview.blueprint.topics:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Interview blueprint has no scheduled topics.",
            )

        topics: list[BlueprintTopic] = sorted(
            interview.blueprint.topics, key=lambda t: t.display_order
        )
        total_topics = len(topics)

        # 2. Durability Invariant: Commit candidate turn to PostgreSQL FIRST
        next_turn_index = len(interview.turns)
        full_transcript = request.transcript
        if request.code_snippet and request.code_snippet.strip():
            full_transcript = (
                f"{request.transcript}\n\n"
                f"[Attached Scratchpad / Diagram]:\n```\n{request.code_snippet.strip()}\n```"
            )

        candidate_turn = InterviewTurn(
            interview_id=interview.id,
            turn_index=next_turn_index,
            speaker="CANDIDATE",
            transcript=full_transcript,
            audio_duration_ms=request.duration_ms,
        )
        db.add(candidate_turn)
        await db.commit()
        await db.refresh(candidate_turn)

        # 3. Reconstruct session state and probe counts from historical turns
        current_topic_index = 0
        consecutive_probes = 0
        for past_turn in interview.turns:
            if past_turn.speaker == "INTERVIEWER" and past_turn.action_taken:
                act = EngineAction(past_turn.action_taken)
                if act == EngineAction.CHANGE_TOPIC:
                    current_topic_index = min(current_topic_index + 1, total_topics - 1)
                    consecutive_probes = 0
                elif act == EngineAction.PROBE_DEEPER:
                    consecutive_probes += 1
                else:
                    consecutive_probes = 0

        # Load policy
        raw_policy = interview.session_policy or {}
        policy = SessionPolicy(
            max_duration_seconds=raw_policy.get(
                "max_duration_seconds", interview.scheduled_duration_minutes * 60
            ),
            conclusion_buffer_seconds=raw_policy.get("conclusion_buffer_seconds", 180),
            max_consecutive_probes=raw_policy.get("max_consecutive_probes", 3),
            minimum_coverage_ratio=raw_policy.get("minimum_coverage_ratio", 0.70),
        )

        fsm = InterviewStateMachine(
            initial_state=current_state,
            current_topic_index=current_topic_index,
            consecutive_probes=consecutive_probes,
            actual_duration_seconds=interview.actual_duration_seconds,
        )

        active_topic = topics[fsm.current_topic_index]
        approved_action: EngineAction
        interviewer_text: str
        question_archetype: str | None = None
        code_sample: str | None = None

        # 4. Handle Phase Transitions
        if fsm.state == InterviewState.WARMUP:
            # Candidate answered warmup -> Advance to TECHNICAL_CORE and introduce first topic
            fsm.transition(InterviewState.TECHNICAL_CORE)
            approved_action = EngineAction.CHANGE_TOPIC

            # Fetch claims for this topic if available
            first_claim_text: str | None = None
            if active_topic.mapped_claim_ids:
                claim_id = active_topic.mapped_claim_ids[0]
                claim_res = await db.execute(
                    select(ResumeClaim.claim_text).where(ResumeClaim.id == uuid.UUID(claim_id))
                )
                first_claim_text = claim_res.scalar_one_or_none()

            stmt_user = (
                select(User.full_name)
                .join(CandidateProfile, CandidateProfile.user_id == User.id)
                .where(CandidateProfile.id == interview.candidate_profile_id)
            )
            candidate_name = (await db.execute(stmt_user)).scalar_one_or_none()
            company_name = raw_policy.get("target_company") or raw_policy.get("company_name")

            interviewer_text = TurnGenerator.generate_warmup_transition_question(
                topic_name=active_topic.topic_name,
                candidate_warmup_answer=request.transcript,
                target_seniority=interview.target_seniority,
                claim_text=first_claim_text,
                candidate_name=candidate_name,
                company_name=company_name,
            )
            question_archetype = (
                QuestionArchetype.COMPANY_SPECIFIC.value
                if company_name
                else QuestionArchetype.ANALYZING_DESIGN.value
            )

        elif fsm.state == InterviewState.TECHNICAL_CORE:
            # Fetch claims for this topic if available
            claim_text: str | None = None
            if active_topic.mapped_claim_ids:
                claim_id = active_topic.mapped_claim_ids[0]
                claim_res = await db.execute(
                    select(ResumeClaim.claim_text).where(ResumeClaim.id == uuid.UUID(claim_id))
                )
                claim_text = claim_res.scalar_one_or_none()

            # Live Semantic Interpretation (bounded context <= 600ms)
            interpreted = LiveAnswerInterpreter.interpret(
                candidate_transcript=request.transcript,
                active_topic_name=active_topic.topic_name,
                consecutive_probes=fsm.consecutive_probes,
                mapped_claim_texts=[claim_text] if claim_text else None,
            )

            # Evaluate Policy Guardrails
            guardrail_result = PolicyGuardrails.evaluate(
                proposed_action=interpreted.recommended_action,
                fsm=fsm,
                policy=policy,
                total_topics=total_topics,
                topic_allocated_seconds=active_topic.allocated_seconds,
            )
            approved_action = guardrail_result.approved_action

            # Update State Machine with approved action
            if approved_action == EngineAction.CHANGE_TOPIC:
                has_next = fsm.advance_topic(total_topics)
                if not has_next:
                    approved_action = EngineAction.CONCLUDE
                    fsm.transition(InterviewState.CONCLUDING)
                else:
                    active_topic = topics[fsm.current_topic_index]
            elif approved_action == EngineAction.CONCLUDE:
                fsm.transition(InterviewState.CONCLUDING)
            else:
                fsm.record_action(approved_action)

            # Generate phrasing with Gemini 3.8 Flash (falling back cleanly to deterministic rules)
            preferred_language = raw_policy.get("preferred_language", "Python")
            company_persona = raw_policy.get("company_persona", "STANDARD")
            company_name = raw_policy.get("target_company") or raw_policy.get("company_name")
            turn_result = await TurnGenerator.generate_question_async(
                action=approved_action,
                topic_name=active_topic.topic_name,
                target_seniority=interview.target_seniority,
                claim_text=claim_text,
                candidate_last_answer=request.transcript,
                preferred_language=preferred_language,
                company_persona=company_persona,
                company_name=company_name,
                turn_index=next_turn_index,
            )
            interviewer_text = turn_result.transcript
            question_archetype = (
                turn_result.archetype.value
                if hasattr(turn_result.archetype, "value")
                else str(turn_result.archetype)
            )
            code_sample = turn_result.code_sample

        elif fsm.state == InterviewState.CONCLUDING:
            # Candidate answered reverse Q&A -> Roleplay Staff Engineer response and complete session
            fsm.transition(InterviewState.COMPLETED)
            approved_action = EngineAction.CONCLUDE
            question_archetype = QuestionArchetype.REVERSE_QA.value
            company_name = raw_policy.get("target_company") or raw_policy.get("company_name")
            preferred_language = raw_policy.get("preferred_language", "Python")
            interviewer_text = await TurnGenerator.generate_reverse_qa_response_async(
                candidate_question=request.transcript,
                company_name=company_name,
                preferred_language=preferred_language,
                target_seniority=interview.target_seniority,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unhandled session state: {fsm.state}",
            )

        # 5. Commit Interviewer Turn to PostgreSQL
        interviewer_turn_index = candidate_turn.turn_index + 1
        interviewer_turn = InterviewTurn(
            interview_id=interview.id,
            turn_index=interviewer_turn_index,
            speaker="INTERVIEWER",
            transcript=interviewer_text,
            action_taken=approved_action.value,
            question_archetype=question_archetype,
            code_sample=code_sample,
        )
        db.add(interviewer_turn)

        # Update interview state & duration tracking
        interview.state = fsm.state.value
        # Estimate ~30 seconds elapsed per turn cycle
        interview.actual_duration_seconds += 30
        if interview.state == InterviewState.COMPLETED.value:
            interview.finished_at = datetime.now(timezone.utc)
            # ADR-005: Atomic Outbox insertion in the same ACID transaction
            OutboxService.create_event(
                db=db,
                event_type="interview.completed",
                aggregate_type="interview",
                aggregate_id=interview.id,
                payload={"interview_id": str(interview.id)},
            )

        await db.commit()
        await db.refresh(interviewer_turn)

        return InterviewerTurnResponse(
            turn_index=interviewer_turn.turn_index,
            speaker="INTERVIEWER",
            transcript=interviewer_turn.transcript,
            action_taken=approved_action,
            session_state=interview.state,
            active_topic=active_topic.topic_name if interview.state != InterviewState.COMPLETED.value else None,
            question_archetype=question_archetype,
            code_sample=code_sample,
            created_at=interviewer_turn.created_at,
        )

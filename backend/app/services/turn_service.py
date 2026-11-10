"""Turn orchestration service enforcing durability invariants and policy-controlled adaptation."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.interview import BlueprintTopic, Interview, InterviewBlueprint, InterviewTurn
from app.models.resume import ResumeClaim
from app.schemas.adaptive import (
    CandidateTurnRequest,
    EngineAction,
    InterviewerTurnResponse,
    InterviewState,
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

        # Generate Turn 0: WARMUP Greeting
        greeting_text = TurnGenerator.generate_warmup_greeting()
        turn_0 = InterviewTurn(
            interview_id=interview.id,
            turn_index=0,
            speaker="INTERVIEWER",
            transcript=greeting_text,
            action_taken=None,
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
        candidate_turn = InterviewTurn(
            interview_id=interview.id,
            turn_index=next_turn_index,
            speaker="CANDIDATE",
            transcript=request.transcript,
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

        # 4. Handle Phase Transitions
        if fsm.state == InterviewState.WARMUP:
            # Candidate answered warmup -> Advance to TECHNICAL_CORE and introduce first topic
            fsm.transition(InterviewState.TECHNICAL_CORE)
            approved_action = EngineAction.CHANGE_TOPIC
            interviewer_text = TurnGenerator.generate_question(
                action=approved_action,
                topic_name=active_topic.topic_name,
                target_seniority=interview.target_seniority,
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

            # Generate phrasing
            interviewer_text = TurnGenerator.generate_question(
                action=approved_action,
                topic_name=active_topic.topic_name,
                target_seniority=interview.target_seniority,
                claim_text=claim_text,
                candidate_last_answer=request.transcript,
            )

        elif fsm.state == InterviewState.CONCLUDING:
            # Candidate answered wrap-up -> Complete interview
            fsm.transition(InterviewState.COMPLETED)
            approved_action = EngineAction.CONCLUDE
            interviewer_text = (
                "Thank you so much! That concludes our technical interview session today. "
                "Your responses have been recorded and will now be evaluated against our "
                "role rubrics."
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
            active_topic=(
                active_topic.topic_name
                if interview.state != InterviewState.COMPLETED.value
                else None
            ),
            created_at=interviewer_turn.created_at,
        )

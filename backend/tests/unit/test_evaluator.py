"""Unit tests for Assessment Evaluator, rubric scoring, and evidence grounding."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import async_session_factory
from app.models.interview import BlueprintTopic, Interview, InterviewBlueprint, InterviewTurn
from app.models.role import JobRole
from app.models.user import CandidateProfile, User
from app.scripts.seed_roles import seed_job_roles
from app.services.evaluator import AssessmentEvaluator


@pytest.fixture(autouse=True)
async def ensure_roles_seeded() -> None:
    """Ensure catalog roles are seeded in the database before running tests."""
    async with async_session_factory() as session:
        await seed_job_roles(session)


@pytest.mark.asyncio
async def test_evaluator_rubric_scoring_and_evidence_grounding() -> None:
    """Verify evaluator scores competencies and asserts verbatim character offsets."""
    async with async_session_factory() as db:
        # 1. Create User and Candidate Profile
        user = User(
            email=f"eval_cand_{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="hashed_pw_test",
            full_name="Evaluation Candidate",
        )
        db.add(user)
        await db.flush()

        profile = CandidateProfile(
            user_id=user.id,
            target_seniority="SENIOR",
            primary_discipline="BACKEND",
            years_experience=5,
        )
        db.add(profile)
        await db.flush()

        # 2. Get Backend Engineering role and its competencies
        stmt_role = (
            select(JobRole)
            .options(selectinload(JobRole.competencies))
            .where(JobRole.slug == "backend-engineering")
        )
        role = (await db.execute(stmt_role)).scalar_one()
        assert len(role.competencies) >= 2
        comp1 = role.competencies[0]

        # 3. Create Interview and Blueprint with comp1 covered
        interview = Interview(
            candidate_profile_id=profile.id,
            role_id=role.id,
            target_seniority="SENIOR",
            state="COMPLETED",
            mode="TEXT",
            scheduled_duration_minutes=30,
            actual_duration_seconds=1800,
        )
        db.add(interview)
        await db.flush()

        blueprint = InterviewBlueprint(
            interview_id=interview.id,
            total_topics=1,
            total_allocated_seconds=1800,
            warmup_seconds=120,
            conclusion_seconds=180,
        )
        db.add(blueprint)
        await db.flush()

        topic = BlueprintTopic(
            blueprint_id=blueprint.id,
            competency_id=comp1.id,
            display_order=0,
            topic_name=comp1.name,
            allocated_seconds=1500,
            mapped_claim_ids=[],
        )
        db.add(topic)

        # 4. Create Interview Turns with technical depth
        candidate_speech = (
            "In our distributed architecture, we partitioned Kafka topics with consistent hashing "
            "to prevent partition skew. We configured min.insync.replicas=2 for durability "
            "and eliminate latency spikes under heavy concurrent write loads."
        )
        turn0 = InterviewTurn(
            interview_id=interview.id,
            turn_index=0,
            speaker="INTERVIEWER",
            transcript="Can you explain your approach to distributed partitioning?",
            action_taken="ASK_TOPIC_STARTER",
        )
        turn1 = InterviewTurn(
            interview_id=interview.id,
            turn_index=1,
            speaker="CANDIDATE",
            transcript=candidate_speech,
            audio_duration_ms=12000,
        )
        db.add_all([turn0, turn1])
        await db.commit()

        # 5. Run Evaluator
        report = await AssessmentEvaluator.evaluate_interview(
            db=db,
            interview_id=interview.id,
            idempotency_key=f"test-eval:{interview.id}:v1",
        )

        assert report is not None
        assert report.version == 1
        assert report.is_latest is True
        assert report.overall_score is not None
        assert report.overall_score >= 3.0

        # Verify Competency Scores
        scores = report.competency_scores
        assert len(scores) >= 2

        # Covered competency must be EVALUATED
        covered_score = next(s for s in scores if s.competency_id == comp1.id)
        assert covered_score.status == "EVALUATED"
        assert covered_score.score in (3, 4)
        assert len(covered_score.evidence_items) >= 1

        # Check Grounding Invariant on all evidence items
        for ev in covered_score.evidence_items:
            assert ev.transcript_excerpt != ""
            assert ev.start_char_offset >= 0
            assert ev.end_char_offset > ev.start_char_offset
            # CRITICAL INVARIANT: verbatim slice matches
            source_turn_text = ev.interview_turn.transcript
            slice_text = source_turn_text[ev.start_char_offset : ev.end_char_offset]
            assert slice_text == ev.transcript_excerpt

        # Unassessed competencies must be INSUFFICIENT_EVIDENCE with score=None
        unassessed = [s for s in scores if s.competency_id != comp1.id]
        for u in unassessed:
            assert u.status == "INSUFFICIENT_EVIDENCE"
            assert u.score is None


@pytest.mark.asyncio
async def test_evaluator_idempotency_avoids_duplicate_evaluation() -> None:
    """Verify that calling evaluate_interview multiple times with same key returns cached report."""
    async with async_session_factory() as db:
        user = User(
            email=f"idemp_cand_{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="hashed_pw_test",
            full_name="Idempotency Candidate",
        )
        db.add(user)
        await db.flush()

        profile = CandidateProfile(
            user_id=user.id,
            target_seniority="SENIOR",
            primary_discipline="BACKEND",
        )
        db.add(profile)
        await db.flush()

        stmt_role = select(JobRole).where(JobRole.slug == "backend-engineering")
        role = (await db.execute(stmt_role)).scalar_one()

        interview = Interview(
            candidate_profile_id=profile.id,
            role_id=role.id,
            target_seniority="SENIOR",
            state="COMPLETED",
            mode="TEXT",
            scheduled_duration_minutes=30,
        )
        db.add(interview)
        await db.flush()

        turn = InterviewTurn(
            interview_id=interview.id,
            turn_index=0,
            speaker="CANDIDATE",
            transcript="I have worked with distributed databases and sharding.",
        )
        db.add(turn)
        await db.commit()

        # First run
        key = f"idemp-test:{interview.id}"
        rep1 = await AssessmentEvaluator.evaluate_interview(
            db=db,
            interview_id=interview.id,
            idempotency_key=key,
        )

        # Second run with same key
        rep2 = await AssessmentEvaluator.evaluate_interview(
            db=db,
            interview_id=interview.id,
            idempotency_key=key,
        )

        assert rep1.id == rep2.id
        assert rep1.version == rep2.version

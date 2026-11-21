"""Unit tests for Gemini Live Session Bridge and System Instruction construction."""

import uuid

from app.models.interview import BlueprintTopic, Interview, InterviewBlueprint
from app.models.resume import Resume, ResumeClaim
from app.models.user import CandidateProfile, User
from app.services.gemini_live_session import (
    GeminiLiveBridge,
    GeminiLiveEvent,
    build_live_system_instruction,
)


def test_gemini_live_event_dataclass() -> None:
    """Verify GeminiLiveEvent stores event type, text, and audio bytes accurately."""
    event = GeminiLiveEvent(
        event_type="input_transcript",
        text="I designed a Kafka cluster",
        audio_bytes=None,
    )
    assert event.event_type == "input_transcript"
    assert event.text == "I designed a Kafka cluster"
    assert event.audio_bytes is None


def test_build_live_system_instruction() -> None:
    """Verify system instruction incorporates candidate claims, topics, and voice directives."""
    user = User(
        id=uuid.uuid4(),
        email="venkat@example.com",
        full_name="Venkat Raman",
    )
    profile = CandidateProfile(
        id=uuid.uuid4(),
        user_id=user.id,
        user=user,
        target_seniority="SENIOR",
    )
    claim = ResumeClaim(
        id=uuid.uuid4(),
        resume_id=uuid.uuid4(),
        claim_text="Architected distributed Kafka pipeline processing 50k events/sec",
        category="ARCHITECTURE",
        source_section="EXPERIENCE",
        start_offset=0,
        end_offset=68,
        technologies=["Kafka", "Python"],
        confidence_score=0.98,
    )
    resume = Resume(
        id=uuid.uuid4(),
        candidate_profile_id=profile.id,
        original_filename="resume.pdf",
        s3_key="resumes/resume.pdf",
        file_hash="hash123",
        claims=[claim],
    )
    profile.resumes = [resume]

    blueprint = InterviewBlueprint(
        id=uuid.uuid4(),
        total_allocated_seconds=1800,
    )
    topic = BlueprintTopic(
        id=uuid.uuid4(),
        blueprint_id=blueprint.id,
        competency_id=uuid.uuid4(),
        display_order=0,
        topic_name="Distributed Systems & Concurrency",
        allocated_seconds=900,
    )
    blueprint.topics = [topic]

    interview = Interview(
        id=uuid.uuid4(),
        candidate_profile_id=profile.id,
        role_id=uuid.uuid4(),
        target_seniority="SENIOR",
        session_policy={"target_company": "GlobalFinTech Corp"},
        candidate_profile=profile,
        blueprint=blueprint,
    )

    prompt = build_live_system_instruction(interview)

    assert "GlobalFinTech Corp" in prompt
    assert "SENIOR" in prompt
    assert "Venkat Raman" in prompt
    assert "Distributed Systems & Concurrency" in prompt
    assert "Kafka" in prompt
    assert "conversational fillers" in prompt
    assert "1 to 3 sentences maximum" in prompt


def test_gemini_live_bridge_initialization() -> None:
    """Verify GeminiLiveBridge initializes with target interview and settings."""
    interview = Interview(
        id=uuid.uuid4(),
        candidate_profile_id=uuid.uuid4(),
        role_id=uuid.uuid4(),
        target_seniority="STAFF",
        session_policy={"target_company": "Stripe"},
    )
    bridge = GeminiLiveBridge(interview)
    assert bridge.interview.target_seniority == "STAFF"
    assert bridge.interview.session_policy.get("target_company") == "Stripe"
    assert bridge._active is False
    assert bridge._session is None

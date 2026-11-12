"""Unit tests for Voice and Technical Communication Delivery Analytics."""

import uuid

from app.models.interview import InterviewTurn
from app.services.voice_analytics import analyze_voice_and_communication


def test_voice_analytics_empty_turns() -> None:
    """Verify safe fallback metrics when no candidate turns are present."""
    result = analyze_voice_and_communication([])
    assert result["communication_score"] == 80
    assert result["speaking_rate_wpm"] == 135
    assert result["pacing_grade"] == "OPTIMAL"
    assert result["filler_words_count"] == 0
    assert result["monologue_risk"] == "LOW"


def test_voice_analytics_optimal_pacing() -> None:
    """Verify pacing calculation with optimal technical delivery (120-165 WPM)."""
    # 70 words in 30,000 ms (0.5 min) = 140 WPM (OPTIMAL)
    turn_text = (
        "We designed a distributed event pipeline using Kafka to decouple our payment ingestion "
        "from the account ledger service. We used the transactional outbox pattern in PostgreSQL "
        "with short-lived row leases so that if the broker blips, our state remains consistent. "
        "We also partitioned the Kafka topic by account ID to ensure strict sequential ordering "
        "without race conditions or double-spend vulnerabilities."
    )
    words = len(turn_text.split())
    # 57 words in 24,000 ms -> 142.5 WPM
    turn = InterviewTurn(
        id=uuid.uuid4(),
        interview_id=uuid.uuid4(),
        turn_index=2,
        speaker="CANDIDATE",
        transcript=turn_text,
        audio_duration_ms=24000,
        latency_ms=1800,
    )

    result = analyze_voice_and_communication([turn])
    assert result["total_words"] == words
    assert result["pacing_grade"] == "OPTIMAL"
    assert result["avg_response_latency_sec"] == 1.8
    assert result["monologue_risk"] == "LOW"
    assert result["communication_score"] >= 85


def test_voice_analytics_detects_filler_words_and_monologues() -> None:
    """Verify filler words like 'um', 'like', 'actually' are detected and penalized objectively."""
    turn_text = (
        "Um, like, basically we sort of just actually put everything in Redis, you know? "
        "Like, I mean, we didn't really think about persistence, like, at all, um, basically."
    )
    turn = InterviewTurn(
        id=uuid.uuid4(),
        interview_id=uuid.uuid4(),
        turn_index=4,
        speaker="CANDIDATE",
        transcript=turn_text,
        audio_duration_ms=180000,  # 3 minutes (180s) monologue
        latency_ms=7500,  # 7.5s hesitation
    )

    result = analyze_voice_and_communication([turn])
    assert result["filler_words_count"] >= 5
    assert result["filler_word_percentage"] > 10.0
    assert result["monologue_risk"] == "HIGH"
    assert result["avg_response_latency_sec"] == 7.5
    assert result["communication_score"] < 70
    assert any("filler words" in f.lower() for f in result["delivery_feedback"])
    assert any("longest answer was 180" in f.lower() for f in result["delivery_feedback"])

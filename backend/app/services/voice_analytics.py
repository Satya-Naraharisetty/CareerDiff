"""Voice and Technical Communication Delivery Analytics.

Measures objective verbal delivery metrics: Words Per Minute (WPM),
response latency, filler word density, answer conciseness, and monologue risk.
Zero biometric or demographic evaluation.
"""

import re
from typing import Any

from app.models.interview import InterviewTurn

FILLER_WORDS_PATTERN = re.compile(
    r"\b(um|uh|er|ah|like|you know|basically|actually|sort of|kind of|literally|i mean)\b",
    re.IGNORECASE,
)


def analyze_voice_and_communication(
    candidate_turns: list[InterviewTurn],
) -> dict[str, Any]:
    """Calculate objective speech pacing (WPM), filler density, response latency, and communication score."""
    if not candidate_turns:
        return {
            "communication_score": 80,
            "speaking_rate_wpm": 135,
            "pacing_grade": "OPTIMAL",
            "total_words": 0,
            "total_speaking_time_sec": 0.0,
            "avg_response_latency_sec": 1.5,
            "filler_words_count": 0,
            "filler_word_percentage": 0.0,
            "longest_turn_sec": 0.0,
            "monologue_risk": "LOW",
            "delivery_feedback": [
                "No spoken candidate turns recorded in this session.",
            ],
        }

    total_words = 0
    total_audio_ms = 0
    total_latency_ms = 0
    valid_latency_count = 0
    filler_count = 0
    max_turn_ms = 0

    for turn in candidate_turns:
        text = turn.transcript.strip()
        words = len(text.split())
        total_words += words

        turn_duration = turn.audio_duration_ms or (
            # Fallback estimation if text mode: 130 WPM standard speech cadence
            round((words / 130.0) * 60000)
        )
        total_audio_ms += turn_duration
        if turn_duration > max_turn_ms:
            max_turn_ms = turn_duration

        if turn.latency_ms is not None and turn.latency_ms > 0:
            total_latency_ms += turn.latency_ms
            valid_latency_count += 1

        matches = FILLER_WORDS_PATTERN.findall(text)
        filler_count += len(matches)

    total_speaking_sec = round(total_audio_ms / 1000.0, 1)
    longest_turn_sec = round(max_turn_ms / 1000.0, 1)
    avg_latency_sec = (
        round((total_latency_ms / valid_latency_count) / 1000.0, 1)
        if valid_latency_count > 0
        else 1.8
    )

    # 1. Speaking Rate (WPM)
    speaking_minutes = total_audio_ms / 60000.0
    wpm = round(total_words / speaking_minutes) if speaking_minutes > 0.05 else 135

    if 120 <= wpm <= 165:
        pacing_grade = "OPTIMAL"
        wpm_score = 95
    elif 100 <= wpm < 120 or 165 < wpm <= 190:
        pacing_grade = "GOOD"
        wpm_score = 85
    elif wpm < 100:
        pacing_grade = "SLOW / DELIBERATE"
        wpm_score = 70
    else:
        pacing_grade = "FAST / RUSHED"
        wpm_score = 65

    # 2. Filler Word Density
    filler_pct = round((filler_count / max(total_words, 1)) * 100, 1)
    if filler_pct <= 2.0:
        filler_score = 95
    elif filler_pct <= 4.0:
        filler_score = 80
    elif filler_pct <= 7.0:
        filler_score = 65
    else:
        filler_score = 50

    # 3. Monologue & Turn Duration Risk
    if longest_turn_sec <= 90:
        monologue_risk = "LOW"
        conciseness_score = 95
    elif longest_turn_sec <= 150:
        monologue_risk = "MODERATE"
        conciseness_score = 85
    else:
        monologue_risk = "HIGH"
        conciseness_score = 60

    # 4. Response Latency Score
    if 0.8 <= avg_latency_sec <= 3.5:
        latency_score = 95  # Thoughtful, prompt pause
    elif avg_latency_sec < 0.8:
        latency_score = 85  # Instant reply without reflection
    elif avg_latency_sec <= 6.0:
        latency_score = 75  # Slightly hesitant
    else:
        latency_score = 60  # Dead air

    # Composite Communication Score (0-100)
    composite = (
        (wpm_score * 0.30)
        + (filler_score * 0.30)
        + (conciseness_score * 0.25)
        + (latency_score * 0.15)
    )
    final_score = min(98, max(30, round(composite)))

    # Feedback Generation
    feedback: list[str] = []
    if pacing_grade == "OPTIMAL":
        feedback.append(
            f"Excellent speech pacing at {wpm} WPM (ideal technical cadence is 120–165 WPM)."
        )
    elif pacing_grade == "FAST / RUSHED":
        feedback.append(
            f"Speaking rate is high ({wpm} WPM). Slow down slightly to give the interviewer time to absorb complex system trade-offs."
        )
    elif pacing_grade == "SLOW / DELIBERATE":
        feedback.append(
            f"Speaking rate is deliberate ({wpm} WPM). Increasing cadence slightly conveys greater familiarity with standard engineering primitives."
        )

    if filler_pct <= 2.5:
        feedback.append(f"Crisp verbal delivery with low filler word density ({filler_pct}%).")
    else:
        feedback.append(
            f"Identified {filler_count} filler words ({filler_pct}% of vocabulary, e.g., 'like', 'um'). Practice replacing fillers with a silent 1-second pause."
        )

    if monologue_risk == "HIGH":
        feedback.append(
            f"Your longest answer was {longest_turn_sec}s. Aim for 60–90 second structured answers, pausing to ask: 'Would you like me to dive deeper into the database schema or the network topology?'"
        )
    else:
        feedback.append(
            "Good interactive answer length; answers allowed collaborative dialogue without over-monologuing."
        )

    return {
        "communication_score": final_score,
        "speaking_rate_wpm": wpm,
        "pacing_grade": pacing_grade,
        "total_words": total_words,
        "total_speaking_time_sec": total_speaking_sec,
        "avg_response_latency_sec": avg_latency_sec,
        "filler_words_count": filler_count,
        "filler_word_percentage": filler_pct,
        "longest_turn_sec": longest_turn_sec,
        "monologue_risk": monologue_risk,
        "delivery_feedback": feedback,
    }

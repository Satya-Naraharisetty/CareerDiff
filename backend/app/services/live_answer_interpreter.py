"""Live turn semantic interpreter for rapid answer depth and action recommendation."""

import re

from app.schemas.adaptive import AnswerDepth, EngineAction, InterpretationResult


class LiveAnswerInterpreter:
    """Interprets candidate turn transcripts and recommends next actions within <= 600ms."""

    # Keywords indicating candidate confusion, hesitation, or stuckness
    _STUCK_PATTERNS = [
        r"\bi (don'?t|do not) know\b",
        r"\bnot sure\b",
        r"\bno idea\b",
        r"\bi'?m stuck\b",
        r"\bcan we skip\b",
        r"\bpass on this\b",
        r"\bcan you repeat\b",
    ]

    # Technical keywords indicating depth in systems and architecture
    _TECHNICAL_DEPTH_KEYWORDS = [
        "partition",
        "replica",
        "latency",
        "throughput",
        "concurrency",
        "mutex",
        "lock",
        "isolation",
        "index",
        "cache",
        "invalidation",
        "consensus",
        "saga",
        "eventual",
        "acid",
        "backpressure",
        "sharding",
        "leader",
        "failover",
        "trade-off",
        "benchmark",
        "profiling",
        "idempotency",
        "distributed",
    ]

    @classmethod
    def interpret(
        self,
        candidate_transcript: str,
        active_topic_name: str,
        consecutive_probes: int = 0,
        recent_turns: list[dict[str, str]] | None = None,
        mapped_claim_texts: list[str] | None = None,
    ) -> InterpretationResult:
        """Analyze candidate response semantics and recommend the next interviewer action."""
        cleaned = candidate_transcript.strip()
        word_count = len(cleaned.split())
        lower_text = cleaned.lower()

        # 1. Detect candidate stuckness or request for help
        for pattern in self._STUCK_PATTERNS:
            if re.search(pattern, lower_text):
                return InterpretationResult(
                    observed_depth=AnswerDepth.STUCK,
                    contradiction_detected=False,
                    recommended_action=EngineAction.SIMPLIFY,
                    rationale=(
                        "Candidate indicated uncertainty or requested problem simplification."
                    ),
                    entities_mentioned=[],
                )

        # 2. If claims exist and haven't been verified on this topic, recommend VERIFY_CLAIM
        if mapped_claim_texts and consecutive_probes == 0:
            matched_entities = [kw for kw in self._TECHNICAL_DEPTH_KEYWORDS if kw in lower_text]
            return InterpretationResult(
                observed_depth=AnswerDepth.ADEQUATE,
                contradiction_detected=False,
                recommended_action=EngineAction.VERIFY_CLAIM,
                rationale="Opportunity to verify specific technical resume claim against topic.",
                entities_mentioned=matched_entities,
            )

        # 3. Check for brief, superficial answers (< 15 words)
        if word_count < 15:
            return InterpretationResult(
                observed_depth=AnswerDepth.SHALLOW,
                contradiction_detected=False,
                recommended_action=EngineAction.PROBE_DEEPER,
                rationale="Candidate response was brief and lacked mechanical explanation.",
                entities_mentioned=[],
            )

        # 4. Detect technical depth via domain keywords
        matched_entities = [kw for kw in self._TECHNICAL_DEPTH_KEYWORDS if kw in lower_text]

        # 5. Deep response with substantive technical entities -> Challenge edge cases / scale
        if len(matched_entities) >= 2 or word_count >= 50:
            return InterpretationResult(
                observed_depth=AnswerDepth.DEEP,
                contradiction_detected=False,
                recommended_action=EngineAction.CHALLENGE,
                rationale=(
                    f"Candidate demonstrated technical depth mentioning {matched_entities[:3]}. "
                    "Challenging failure modes and trade-offs."
                ),
                entities_mentioned=matched_entities,
            )

        # 6. Default adequate answer -> Probe deeper for internal implementation details
        return InterpretationResult(
            observed_depth=AnswerDepth.ADEQUATE,
            contradiction_detected=False,
            recommended_action=EngineAction.PROBE_DEEPER,
            rationale="Candidate gave a coherent high-level answer. Probing deeper implementation.",
            entities_mentioned=matched_entities,
        )

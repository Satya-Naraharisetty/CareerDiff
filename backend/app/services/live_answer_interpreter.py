"""Live turn semantic interpreter for rapid answer depth and action recommendation."""

import json
import logging
import re
from typing import Any

from app.core.config import get_settings
from app.core.llm import make_genai_client
from app.schemas.adaptive import AnswerDepth, EngineAction, InterpretationResult

logger = logging.getLogger("CareerDiff.live_interpreter")


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
                rationale="Candidate demonstrated technical depth and addressed component trade-offs. Challenging failure modes.",
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

    @classmethod
    async def interpret_with_gemini(
        cls,
        candidate_transcript: str,
        active_topic_name: str,
        consecutive_probes: int = 0,
        mapped_claim_texts: list[str] | None = None,
    ) -> InterpretationResult:
        """Evaluate candidate response using Gemini AI semantic reasoning."""
        settings = get_settings()
        if not settings.gemini_api_key or settings.environment == "testing":
            return cls.interpret(
                candidate_transcript=candidate_transcript,
                active_topic_name=active_topic_name,
                consecutive_probes=consecutive_probes,
                mapped_claim_texts=mapped_claim_texts,
            )

        prompt = (
            f"You are a Staff Technical Interviewer evaluating a candidate's spoken answer.\n\n"
            f"Active Topic: {active_topic_name}\n"
            f"Candidate Transcript:\n\"{candidate_transcript.strip()}\"\n\n"
            f"Task: Evaluate technical accuracy, depth, and system reasoning.\n"
            f"Respond ONLY with valid JSON in this format:\n"
            f"{{\n"
            f'  "observed_depth": "DEEP" | "ADEQUATE" | "SHALLOW" | "STUCK",\n'
            f'  "recommended_action": "CHALLENGE" | "PROBE_DEEPER" | "SIMPLIFY" | "VERIFY_CLAIM" | "CHANGE_TOPIC",\n'
            f'  "rationale": "one concise sentence explaining your technical assessment",\n'
            f'  "entities_mentioned": ["architecture", "components"]\n'
            f"}}"
        )
        try:
            from google.genai import types

            client = make_genai_client(timeout_ms=10000)
            res = await client.aio.models.generate_content(
                model=settings.gemini_turn_model,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            if res and res.text:
                data = json.loads(res.text)
                depth_map = {
                    "DEEP": AnswerDepth.DEEP,
                    "ADEQUATE": AnswerDepth.ADEQUATE,
                    "SHALLOW": AnswerDepth.SHALLOW,
                    "STUCK": AnswerDepth.STUCK,
                }
                action_map = {
                    "CHALLENGE": EngineAction.CHALLENGE,
                    "PROBE_DEEPER": EngineAction.PROBE_DEEPER,
                    "SIMPLIFY": EngineAction.SIMPLIFY,
                    "VERIFY_CLAIM": EngineAction.VERIFY_CLAIM,
                    "CHANGE_TOPIC": EngineAction.CHANGE_TOPIC,
                }
                depth = depth_map.get(str(data.get("observed_depth", "")).upper(), AnswerDepth.ADEQUATE)
                action = action_map.get(str(data.get("recommended_action", "")).upper(), EngineAction.PROBE_DEEPER)
                return InterpretationResult(
                    observed_depth=depth,
                    contradiction_detected=bool(data.get("contradiction_detected", False)),
                    recommended_action=action,
                    rationale=str(data.get("rationale") or "Candidate response evaluated by Gemini AI."),
                    entities_mentioned=list(data.get("entities_mentioned", [])),
                )
        except Exception as exc:
            logger.warning("Gemini live answer interpretation fallback: %s", exc)

        return cls.interpret(
            candidate_transcript=candidate_transcript,
            active_topic_name=active_topic_name,
            consecutive_probes=consecutive_probes,
            mapped_claim_texts=mapped_claim_texts,
        )

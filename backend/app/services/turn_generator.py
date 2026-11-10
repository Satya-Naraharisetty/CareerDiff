"""Turn generation service producing conversational technical interview questions."""

from app.schemas.adaptive import EngineAction


class TurnGenerator:
    """Generates interviewer spoken/text questions aligned with the approved EngineAction."""

    @staticmethod
    def generate_warmup_greeting(candidate_name: str | None = None) -> str:
        """Generate welcoming opener for the WARMUP phase."""
        greeting = f"Hello {candidate_name}!" if candidate_name else "Hello!"
        return (
            f"{greeting} Welcome to your technical interview session. We'll be walking through "
            "a few core architectural and systems topics today. To get started, could you give a "
            "brief overview of your recent technical background and the types of systems you've "
            "been building?"
        )

    @staticmethod
    def generate_question(
        action: EngineAction,
        topic_name: str,
        target_seniority: str = "SENIOR",
        claim_text: str | None = None,
        candidate_last_answer: str | None = None,
    ) -> str:
        """Generate question phrasing strictly aligned with the selected action."""
        if action == EngineAction.VERIFY_CLAIM and claim_text:
            return (
                f"Your background highlights that you '{claim_text}'. "
                f"In the context of {topic_name}, could you walk me through the specific "
                "architecture, key technical trade-offs, and how you measured success?"
            )

        if action == EngineAction.PROBE_DEEPER:
            return (
                f"Could you dive deeper into the internal mechanics of that approach in "
                f"{topic_name}? Specifically, what underlying data structures, concurrency "
                "controls, or protocols did you choose, and why?"
            )

        if action == EngineAction.CHALLENGE:
            return (
                f"Let's look at failure modes in that {topic_name} design: what happens if a node "
                "crashes midway or a network partition occurs? What trade-offs did you make "
                "between consistency, availability, and latency?"
            )

        if action == EngineAction.CLARIFY:
            return (
                f"Could you clarify that specific mechanism in {topic_name}? How does it ensure "
                "state remains consistent and avoid race conditions under concurrent load?"
            )

        if action == EngineAction.SCENARIO:
            return (
                f"Consider a production scenario in {topic_name}: traffic suddenly surges 10x and "
                "P99 latency spikes drastically. What metrics do you inspect first, and how would "
                "you systematically isolate the bottleneck?"
            )

        if action == EngineAction.SIMPLIFY:
            return (
                f"Let's take a step back and simplify the problem in {topic_name}. Rather than a "
                "fully distributed setup, how would you design the minimal, single-node baseline "
                "first to guarantee correctness?"
            )

        if action == EngineAction.REVISIT:
            return (
                f"Earlier you touched upon trade-offs in {topic_name}. Let's revisit that point: "
                "how did your team monitor and mitigate operational overhead over time?"
            )

        if action == EngineAction.CHANGE_TOPIC:
            return (
                f"Thank you, that gives a clear picture. Let's shift our focus to {topic_name}. "
                "To start, could you explain your overall strategy and mental model when designing "
                "for scale and reliability in this domain?"
            )

        if action == EngineAction.CONCLUDE:
            return (
                "We have covered all of our planned technical topics for today! That wraps up the "
                "technical assessment portion. Thank you for walking through your systems with me. "
                "Before we conclude, do you have any questions for me about our architecture, "
                "tech stack, or engineering culture?"
            )

        # Fallback question
        return (
            f"Could you elaborate further on how you would design and operate {topic_name} "
            f"at a {target_seniority.lower()} level?"
        )

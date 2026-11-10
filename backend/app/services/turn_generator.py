"""Turn generation service producing conversational technical questions grounded in resume."""

import re

from app.schemas.adaptive import EngineAction


class TurnGenerator:
    """Generates interview questions aligned with EngineAction and candidate resume."""

    @staticmethod
    def _extract_key_focus(candidate_text: str | None) -> str | None:
        """Extract a prominent technical phrase, system type, or mechanism from candidate answer."""
        if not candidate_text or not candidate_text.strip():
            return None

        patterns = [
            (
                r"\b(?:building|architected|designing|scaling|migrating)\s+"
                r"([a-zA-Z0-9_\-\s]{4,30}?)(?:\b(?:with|using|in|for|to|,|\.))"
            ),
            (
                r"\b([a-zA-Z0-9_\-]+\s+"
                r"(?:pipeline|gateway|service|microservices|architecture|cluster|system|engine))\b"
            ),
            r"\b(?:using|with)\s+([a-zA-Z0-9_\-]+\s*(?:and\s+[a-zA-Z0-9_\-]+)?)\b",
        ]
        for pat in patterns:
            match = re.search(pat, candidate_text, re.IGNORECASE)
            if match:
                extracted = match.group(1).strip()
                if 3 < len(extracted) < 40:
                    return extracted

        tech_matches = re.findall(
            r"\b(Kafka|PostgreSQL|Postgres|Redis|FastAPI|Docker|Kubernetes|TypeScript|"
            r"React|GraphQL|gRPC|RabbitMQ)\b",
            candidate_text,
            re.IGNORECASE,
        )
        if tech_matches:
            return ", ".join(list(dict.fromkeys(tech_matches))[:2])

        return None

    @staticmethod
    def generate_warmup_greeting(
        candidate_name: str | None = None,
        target_seniority: str = "SENIOR",
        primary_discipline: str = "BACKEND",
        top_skills: list[str] | None = None,
        key_claim: str | None = None,
        resume_summary: str | None = None,
    ) -> str:
        """Generate welcoming opener for the WARMUP phase grounded in the candidate's resume."""
        name_str = f" {candidate_name}" if candidate_name else ""
        skills_str = ", ".join(top_skills[:3]) if top_skills and len(top_skills) > 0 else None

        if key_claim and skills_str:
            return (
                f"Hello{name_str}! Welcome to your technical interview session. I've reviewed your "
                f"resume and noticed your strong background as a {target_seniority.capitalize()} "
                f"{primary_discipline.capitalize()} Engineer, particularly your hands-on work with "
                f"{skills_str} and experience where you '{key_claim}'. "
                "To kick things off, could you give me an overview of your recent role, the scope "
                "of systems you've been designing, and what challenges you've been tackling lately?"
            )

        if skills_str:
            return (
                f"Hello{name_str}! Welcome to your technical interview session. Looking over your "
                f"resume, I see extensive experience across {skills_str} at the "
                f"{target_seniority.lower()} level. To get us started, could you walk me through "
                "your recent role, the primary systems you've been building, and your day-to-day "
                "architectural responsibilities?"
            )

        return (
            f"Hello{name_str}! Welcome to your technical interview session. We will cover "
            "a few core architectural and systems topics today. To get started, could you give a "
            "brief overview of your recent technical background and the types of systems you've "
            "been building?"
        )

    @staticmethod
    def generate_warmup_transition_question(
        topic_name: str,
        candidate_warmup_answer: str,
        target_seniority: str = "SENIOR",
        claim_text: str | None = None,
        candidate_name: str | None = None,
    ) -> str:
        """Bridge candidate's stated role & experience into the first technical core topic."""
        name_prefix = (
            f"Thanks for sharing that background, {candidate_name}. "
            if candidate_name
            else "Thank you for that background. "
        )
        key_focus = TurnGenerator._extract_key_focus(candidate_warmup_answer)

        if key_focus and claim_text:
            return (
                f"{name_prefix}Hearing about your work with {key_focus} leads directly into our "
                f"first focus area: {topic_name}. In your resume, you also noted that you "
                f"'{claim_text}'. Given that experience, how did you architect the data flow and "
                "concurrency boundaries for that system, and what key technical trade-offs did "
                "you make to guarantee reliability under load?"
            )

        if key_focus:
            return (
                f"{name_prefix}Your experience designing and operating {key_focus} connects "
                f"nicely into our first topic: {topic_name}. In your recent systems, how did you "
                "handle data consistency, failure isolation, and performance bottlenecks at a "
                f"{target_seniority.lower()} engineering level?"
            )

        if claim_text:
            return (
                f"{name_prefix}Let's transition directly into our first core area: {topic_name}. "
                f"Your background highlights that you '{claim_text}'. Could you walk me through "
                "the specific architecture you implemented, how you structured service boundaries, "
                "and how you validated correctness?"
            )

        return (
            f"{name_prefix}Let's dive into our first architectural topic: {topic_name}. "
            "Based on the systems you've been building, could you explain your overall strategy "
            "when designing for high availability and fault tolerance in this domain?"
        )

    @staticmethod
    def generate_question(
        action: EngineAction,
        topic_name: str,
        target_seniority: str = "SENIOR",
        claim_text: str | None = None,
        candidate_last_answer: str | None = None,
    ) -> str:
        """Generate question phrasing aligned with the selected action and recent context."""
        key_focus = TurnGenerator._extract_key_focus(candidate_last_answer)

        if action == EngineAction.VERIFY_CLAIM and claim_text:
            context_clause = (
                f"In your previous answer, you described your approach to {key_focus}. "
                if key_focus
                else ""
            )
            return (
                f"{context_clause}Your background specifically highlights that you '{claim_text}'. "
                f"In the context of {topic_name}, could you walk me through the internal "
                "architecture, how you handled failure recovery, and what specific metrics you "
                "tracked to verify its impact?"
            )

        if action == EngineAction.PROBE_DEEPER:
            context_clause = (
                f"Regarding the {key_focus} mechanism you just described"
                if key_focus
                else "Regarding that approach"
            )
            return (
                f"{context_clause} in {topic_name}: could you dive deeper into the internal "
                "implementation mechanics? Specifically, what underlying data structures, "
                "transaction isolation levels, or concurrency controls did you choose, and why?"
            )

        if action == EngineAction.CHALLENGE:
            context_clause = (
                f"Let's pressure-test that {key_focus} design in {topic_name}: "
                if key_focus
                else f"Let's look at failure modes in that {topic_name} design: "
            )
            return (
                f"{context_clause}what happens if an underlying node crashes midway through, "
                "or a network partition occurs between your replicas? What trade-offs did you "
                "make between consistency, availability, and latency?"
            )

        if action == EngineAction.CLARIFY:
            context_clause = (
                f"Could you clarify how your {key_focus} setup"
                if key_focus
                else "Could you clarify that specific mechanism"
            )
            return (
                f"{context_clause} in {topic_name} guarantees that state remains consistent "
                "without deadlock or race conditions when handling multiple concurrent requests?"
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
            context_clause = (
                f"Thank you, that gives a clear picture of how you handle {key_focus}. "
                if key_focus
                else "Thank you, that gives a clear picture. "
            )
            return (
                f"{context_clause}Let's shift our focus to our next topic: {topic_name}. "
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

        return (
            f"Could you elaborate further on how you would design and operate {topic_name} "
            f"at a {target_seniority.lower()} level?"
        )

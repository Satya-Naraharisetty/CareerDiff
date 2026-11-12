"""Turn generation service producing conversational technical questions grounded in resume and company context."""

import logging
import re

from app.core.config import get_settings
from app.schemas.adaptive import EngineAction, QuestionArchetype

logger = logging.getLogger("CareerDiff.turn_generator")


class TurnGenerationResult(str):
    """String subclass holding turn metadata (archetype, code sample) for complete backward compatibility."""

    transcript: str
    archetype: QuestionArchetype
    code_sample: str | None

    def __new__(
        cls,
        transcript: str,
        archetype: QuestionArchetype = QuestionArchetype.SYSTEM_ARCHITECTURE,
        code_sample: str | None = None,
    ) -> "TurnGenerationResult":
        instance = super().__new__(cls, transcript)
        instance.transcript = transcript
        instance.archetype = archetype
        instance.code_sample = code_sample
        return instance


# Production-grade code samples designed for CODE_REVIEW and DEBUGGING_INCIDENT archetypes
SAMPLE_CODE_SNIPPETS: dict[str, dict[str, str]] = {
    "Python": {
        "concurrency": (
            "# Production Issue: Race condition & lost update under high concurrent traffic\n"
            "async def process_account_debit(db: AsyncSession, account_id: int, amount: float):\n"
            "    # Read current balance without FOR UPDATE lock\n"
            "    account = await db.scalar(select(Account).where(Account.id == account_id))\n"
            "    if not account or account.balance < amount:\n"
            "        raise InsufficientFundsError()\n"
            "    \n"
            "    # Unprotected external settlement call before committing local balance\n"
            "    await payment_gateway.settle_charge(account_id, amount)\n"
            "    \n"
            "    account.balance -= amount\n"
            "    await db.commit()\n"
            "    return account.balance"
        ),
        "database": (
            "# Performance Defect: N+1 query and unindexed relation scan\n"
            "async def get_team_project_metrics(db: AsyncSession, team_ids: list[int]):\n"
            "    results = []\n"
            "    for tid in team_ids:\n"
            "        team = await db.scalar(select(Team).where(Team.id == tid))\n"
            "        for project in team.projects:\n"
            "            tasks = await db.scalars(select(Task).where(Task.project_id == project.id))\n"
            "            results.append({'team': team.name, 'tasks': len(tasks.all())})\n"
            "    return results"
        ),
    },
    "TypeScript": {
        "concurrency": (
            "// Production Issue: Cache Stampede & Race Condition under high RPS\n"
            "async function getSessionToken(userId: string): Promise<string> {\n"
            "  const cached = await redis.get(`token:${userId}`);\n"
            "  if (cached) return cached;\n"
            "  \n"
            "  // Stampede: 100 concurrent requests simultaneously miss cache and hit DB\n"
            "  const freshToken = await authDb.tokens.create({ data: { userId, token: crypto.randomUUID() } });\n"
            "  await redis.set(`token:${userId}`, freshToken.token, 'EX', 3600);\n"
            "  return freshToken.token;\n"
            "}"
        ),
        "database": (
            "// Memory Leak / Database Connection Pool Exhaustion\n"
            "export async function streamAuditLogs(req: Request, res: Response) {\n"
            "  const client = await pool.connect();\n"
            "  // Missing try/finally release: if client disconnects, DB connection is orphaned\n"
            "  const cursor = client.query(new Cursor('SELECT * FROM audit_logs ORDER BY id DESC'));\n"
            "  req.on('close', () => console.log('Client disconnected early'));\n"
            "  cursor.read(100, (err, rows) => res.json(rows));\n"
            "}"
        ),
    },
    "Go": {
        "concurrency": (
            "// Concurrency Bug: Goroutine Loop Variable Capture & Race on Shared State\n"
            "func DispatchWorkers(jobs []Job) {\n"
            "    var wg sync.WaitGroup\n"
            "    for _, job := range jobs {\n"
            "        wg.Add(1)\n"
            "        go func() {\n"
            "            defer wg.Done()\n"
            "            // Unsafe closure capture across concurrent loop iterations\n"
            "            Process(&job)\n"
            "        }()\n"
            "    }\n"
            "    wg.Wait()\n"
            "}"
        ),
    },
    "Java": {
        "concurrency": (
            "// Thread Deadlock under Concurrent Lock Inversion\n"
            "public class LedgerService {\n"
            "    public void transfer(Account from, Account to, BigDecimal amount) {\n"
            "        synchronized (from) {\n"
            "            synchronized (to) { // Lock inversion risk when transfer(to, from) is concurrent\n"
            "                from.debit(amount);\n"
            "                to.credit(amount);\n"
            "            }\n"
            "        }\n"
            "    }\n"
            "}"
        ),
    },
}


class TurnGenerator:
    """Generates interview questions across the full spectrum of technical archetypes."""

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
    def resolve_archetype(
        action: EngineAction,
        turn_index: int = 1,
        company_name: str | None = None,
        state: str = "TECHNICAL_CORE",
    ) -> QuestionArchetype:
        """Deterministically map session turn state and action to a rich QuestionArchetype."""
        if state == "WARMUP":
            return QuestionArchetype.WARMUP_MOTIVATION
        if state == "CONCLUDING":
            return QuestionArchetype.REVERSE_QA

        if action == EngineAction.VERIFY_CLAIM:
            return QuestionArchetype.SKILL_FUNDAMENTALS
        elif action == EngineAction.PROBE_DEEPER:
            return (
                QuestionArchetype.SKILL_FUNDAMENTALS
                if turn_index % 2 == 0
                else QuestionArchetype.SCENARIO_DECISION
            )
        elif action == EngineAction.CHALLENGE:
            return (
                QuestionArchetype.DEBUGGING_INCIDENT
                if turn_index % 2 == 1
                else QuestionArchetype.SCENARIO_DECISION
            )
        elif action == EngineAction.SCENARIO:
            if turn_index % 3 == 0:
                return QuestionArchetype.CODE_REVIEW
            elif company_name:
                return QuestionArchetype.COMPANY_SPECIFIC
            return QuestionArchetype.DEBUGGING_INCIDENT
        elif action == EngineAction.CHANGE_TOPIC:
            if company_name and turn_index % 2 == 1:
                return QuestionArchetype.COMPANY_SPECIFIC
            return QuestionArchetype.ANALYZING_DESIGN
        elif action == EngineAction.SIMPLIFY:
            return QuestionArchetype.SKILL_FUNDAMENTALS
        elif action == EngineAction.CLARIFY:
            return QuestionArchetype.ANALYZING_DESIGN
        elif action == EngineAction.CONCLUDE:
            return QuestionArchetype.REVERSE_QA

        return QuestionArchetype.SYSTEM_ARCHITECTURE

    @staticmethod
    def generate_warmup_greeting(
        candidate_name: str | None = None,
        target_seniority: str = "SENIOR",
        primary_discipline: str = "BACKEND",
        top_skills: list[str] | None = None,
        key_claim: str | None = None,
        resume_summary: str | None = None,
        company_name: str | None = None,
    ) -> str:
        """Generate welcoming opener for the WARMUP phase grounded in candidate resume & company motivation."""
        name_str = f" {candidate_name}" if candidate_name else ""
        skills_str = ", ".join(top_skills[:3]) if top_skills and len(top_skills) > 0 else None
        company_phrase = (
            f" for our {target_seniority.lower()} engineering team at {company_name}"
            if company_name
            else ""
        )
        motivation_probe = (
            f" Along with your recent work, what excites you about the engineering challenges here at {company_name}?"
            if company_name
            else " What technical problems have you been most excited about solving lately?"
        )

        if key_claim and skills_str:
            return (
                f"Hello{name_str}! Welcome to your technical interview session{company_phrase}. "
                f"I've reviewed your resume and noticed your strong background as a {target_seniority.capitalize()} "
                f"{primary_discipline.capitalize()} Engineer, particularly in {skills_str} "
                f"where you '{key_claim}'. To kick things off, could you walk me through your recent role, "
                f"the architecture of the systems you've been designing, and{motivation_probe}"
            )

        if skills_str:
            return (
                f"Hello{name_str}! Welcome to your technical interview session{company_phrase}. "
                f"Looking over your background, I see strong experience across {skills_str} at the "
                f"{target_seniority.lower()} level. To get us started, could you walk me through your recent role, "
                f"the primary systems you've been building, and{motivation_probe}"
            )

        return (
            f"Hello{name_str}! Welcome to your technical interview session{company_phrase}. "
            "We will cover a few core architectural and systems topics today. To get started, could you give an "
            f"overview of your technical background, the types of systems you've been building, and{motivation_probe}"
        )

    @staticmethod
    def generate_warmup_transition_question(
        topic_name: str,
        candidate_warmup_answer: str,
        target_seniority: str = "SENIOR",
        claim_text: str | None = None,
        candidate_name: str | None = None,
        company_name: str | None = None,
    ) -> str:
        """Bridge candidate's stated role & experience into the first technical core topic."""
        name_prefix = (
            f"Thanks for sharing that background, {candidate_name}. "
            if candidate_name
            else "Thank you for that background. "
        )
        key_focus = TurnGenerator._extract_key_focus(candidate_warmup_answer)
        company_prefix = f"Here at {company_name}, " if company_name else ""

        if key_focus and claim_text:
            return (
                f"{name_prefix}Hearing about your work with {key_focus} leads directly into our "
                f"first focus area: {topic_name}. In your resume, you also noted that you "
                f"'{claim_text}'. {company_prefix}Given that experience, how did you architect the data flow and "
                "concurrency boundaries for that system, and what key technical trade-offs did "
                "you make to guarantee reliability under load?"
            )

        if key_focus:
            return (
                f"{name_prefix}Your experience designing and operating {key_focus} connects "
                f"nicely into our first topic: {topic_name}. {company_prefix}In your recent systems, how did you "
                "handle data consistency, failure isolation, and performance bottlenecks at a "
                f"{target_seniority.lower()} engineering level?"
            )

        if claim_text:
            return (
                f"{name_prefix}Let's transition directly into our first core area: {topic_name}. "
                f"Your background highlights that you '{claim_text}'. {company_prefix}Could you walk me through "
                "the specific architecture you implemented, how you structured service boundaries, "
                "and how you validated correctness?"
            )

        return (
            f"{name_prefix}Let's dive into our first architectural topic: {topic_name}. "
            f"{company_prefix}Based on the systems you've been building, could you explain your overall strategy "
            "when designing for high availability and fault tolerance in this domain?"
        )

    @classmethod
    async def generate_question_async(
        cls,
        action: EngineAction,
        topic_name: str,
        target_seniority: str = "SENIOR",
        claim_text: str | None = None,
        candidate_last_answer: str | None = None,
        preferred_language: str = "Python",
        company_persona: str = "STANDARD",
        company_name: str | None = None,
        turn_index: int = 1,
        archetype: QuestionArchetype | None = None,
    ) -> TurnGenerationResult:
        """Generate question using Gemini (gemini-3.8-flash) if available, falling back safely to deterministic rules."""
        chosen_archetype = archetype or cls.resolve_archetype(
            action=action,
            turn_index=turn_index,
            company_name=company_name,
            state="TECHNICAL_CORE",
        )

        # Code review sample selection if applicable
        code_sample: str | None = None
        if chosen_archetype == QuestionArchetype.CODE_REVIEW:
            lang_snippets = (
                SAMPLE_CODE_SNIPPETS.get(preferred_language) or SAMPLE_CODE_SNIPPETS["Python"]
            )
            code_sample = lang_snippets.get("concurrency") or lang_snippets.get("database")

        settings = get_settings()
        if settings.gemini_api_key:
            try:
                from google import genai

                client = genai.Client(api_key=settings.gemini_api_key)

                persona_guidelines = {
                    "BIG_TECH": (
                        "Interviewer Persona: Hyperscale Big Tech Staff Engineer (Google/Meta/AWS style).\n"
                        "- Emphasize distributed systems scalability (millions of QPS), CAP theorem trade-offs, "
                        "multi-region consensus (Raft/Paxos), failure domains, replication topologies, "
                        "and strict 99.999% availability. Challenge single-point-of-failure assumptions."
                    ),
                    "SCALE_UP": (
                        "Interviewer Persona: High-Velocity Scale-Up Principal Engineer (Stripe/Uber style).\n"
                        "- Emphasize developer velocity, pragmatic trade-offs between tech debt and delivery, "
                        "idempotency keys, event-driven decoupling, observable failure recovery, and fast rollback paths under rapid growth."
                    ),
                    "FINTECH": (
                        "Interviewer Persona: Mission-Critical FinTech & Banking Systems Architect.\n"
                        "- Emphasize absolute data consistency, strict ACID transactions, double-entry audit ledgers, "
                        "idempotency, cryptographic verification, strict p99 latency SLA guardrails, and deterministic failure recovery."
                    ),
                    "STANDARD": (
                        "Interviewer Persona: Balanced Senior Engineering Evaluator.\n"
                        "- Probe fundamental systems architecture, clean interface boundaries, concurrency control, "
                        "caching layers, and database query optimization."
                    ),
                }.get(
                    company_persona.upper(),
                    "Interviewer Persona: Balanced Senior Engineering Evaluator.",
                )

                archetype_guidelines = {
                    QuestionArchetype.SKILL_FUNDAMENTALS: (
                        f"Archetype: Skill Fundamentals ({target_seniority} level).\n"
                        f"- Test idiomatic {preferred_language} concurrency primitives, memory management, data structures, "
                        f"and time/space complexity trade-offs."
                    ),
                    QuestionArchetype.SYSTEM_ARCHITECTURE: (
                        "Archetype: System Architecture & Distributed Systems.\n"
                        "- Focus on service boundaries, partitioned storage, consensus, message broker topologies, "
                        "and fault tolerance."
                    ),
                    QuestionArchetype.SCENARIO_DECISION: (
                        "Archetype: Scenario-Based Architectural Decision & Dilemma.\n"
                        "- Pose a concrete architectural fork in the road (e.g. strong consistency vs low latency, "
                        "push vs pull, event-driven vs synchronous RPC) and require candidate to defend their choice."
                    ),
                    QuestionArchetype.ANALYZING_DESIGN: (
                        "Archetype: Analyzing & System Design Problem Framing.\n"
                        "- Ask the candidate to decompose a complex problem, establish functional/non-functional requirements, "
                        "and estimate throughput/storage scale."
                    ),
                    QuestionArchetype.DEBUGGING_INCIDENT: (
                        "Archetype: Production Incident Troubleshooting & Debugging.\n"
                        "- Present an active production incident (e.g. p99 latency spike, connection starvation, thread deadlock, "
                        "or cache stampede) and ask how they would isolate, profile, and remediate the root cause."
                    ),
                    QuestionArchetype.CODE_REVIEW: (
                        f"Archetype: Code Review & Anti-Pattern Hunting.\n"
                        f"- The candidate is provided with an attached code snippet in {preferred_language}. Ask them to inspect it, "
                        f"identify subtle race conditions or memory/performance flaws under high concurrency, and explain how to fix it."
                    ),
                    QuestionArchetype.COMPANY_SPECIFIC: (
                        f"Archetype: Company-Specific Technical Challenge ({company_name or 'target enterprise'}).\n"
                        f"- Frame the scenario around the real-world engineering domain, architecture patterns, and scale constraints of {company_name or 'our company'} "
                        f"(e.g. payment idempotency, stream matching, or multi-region failover)."
                    ),
                    QuestionArchetype.REVERSE_QA: (
                        "Archetype: Reverse Q&A.\n"
                        "- Prompt candidate for any questions they have about our team or architecture."
                    ),
                    QuestionArchetype.WARMUP_MOTIVATION: (
                        "Archetype: Warmup & Role Motivation.\n"
                        "- Welcome candidate and probe systems background and motivation."
                    ),
                }.get(chosen_archetype, "Archetype: Deep Technical Systems Architecture.")

                company_context = f"Target Company: {company_name}\n" if company_name else ""
                code_context = (
                    f"\nAttached Code Sample:\n```\n{code_sample}\n```\n" if code_sample else ""
                )

                prompt = (
                    f"You are CareerDiff, a principal software engineering technical interviewer.\n"
                    f"{persona_guidelines}\n"
                    f"{archetype_guidelines}\n"
                    f"{company_context}"
                    f"Topic: {topic_name}\n"
                    f"Target Seniority: {target_seniority}\n"
                    f"Candidate's Preferred Language: {preferred_language}\n"
                    f"Company Interview Persona: {company_persona}\n"
                    f"Approved Interview Engine Action: {action.value}\n"
                    f"Candidate's previous response: {candidate_last_answer or 'None'}\n"
                    f"Candidate resume claim on this topic: {claim_text or 'None'}\n"
                    f"{code_context}\n"
                    f"Task: Generate the next spoken technical interview question strictly aligned with action {action.value} and archetype {chosen_archetype.value}.\n"
                    f"Guidelines:\n"
                    f"- Conversational, concise (2-3 sentences max).\n"
                    f"- Frame all code snippets, data structures, and concurrency mechanisms in {preferred_language} idioms.\n"
                    f"- Match the seniority depth of {target_seniority}.\n"
                    f"- Output ONLY the spoken question. No greetings, meta-commentary, or markdown."
                )
                response = await client.aio.models.generate_content(
                    model=settings.gemini_turn_model,
                    contents=prompt,
                )
                if response and response.text and response.text.strip():
                    return TurnGenerationResult(
                        transcript=response.text.strip(),
                        archetype=chosen_archetype,
                        code_sample=code_sample,
                    )
            except Exception as exc:
                logger.warning(
                    "Gemini turn generation failed (%s); falling back to deterministic template",
                    exc,
                )

        return cls.generate_question(
            action=action,
            topic_name=topic_name,
            target_seniority=target_seniority,
            claim_text=claim_text,
            candidate_last_answer=candidate_last_answer,
            preferred_language=preferred_language,
            company_name=company_name,
            archetype=chosen_archetype,
            code_sample=code_sample,
        )

    @staticmethod
    def generate_question(
        action: EngineAction,
        topic_name: str,
        target_seniority: str = "SENIOR",
        claim_text: str | None = None,
        candidate_last_answer: str | None = None,
        preferred_language: str = "Python",
        company_name: str | None = None,
        archetype: QuestionArchetype = QuestionArchetype.SYSTEM_ARCHITECTURE,
        code_sample: str | None = None,
    ) -> TurnGenerationResult:
        """Deterministic fallback question generation across all question archetypes and difficulty levels."""
        key_focus = TurnGenerator._extract_key_focus(candidate_last_answer)
        company_ref = f"at {company_name}" if company_name else "in our production environment"

        if archetype == QuestionArchetype.CODE_REVIEW:
            return TurnGenerationResult(
                transcript=(
                    f"Take a look at the attached {preferred_language} code snippet. "
                    "Under high concurrent production load, what subtle concurrency bug or performance "
                    "bottleneck exists here, and how would you refactor it to ensure safety?"
                ),
                archetype=QuestionArchetype.CODE_REVIEW,
                code_sample=code_sample,
            )

        if archetype == QuestionArchetype.DEBUGGING_INCIDENT:
            return TurnGenerationResult(
                transcript=(
                    f"Consider a critical production incident {company_ref} in {topic_name}: "
                    "immediately after a release, P99 latency surges by 400% and connection timeouts begin cascade-failing. "
                    "What telemetry metrics and profiles do you inspect first, and how do you isolate the root cause?"
                ),
                archetype=QuestionArchetype.DEBUGGING_INCIDENT,
            )

        if archetype == QuestionArchetype.COMPANY_SPECIFIC and company_name:
            return TurnGenerationResult(
                transcript=(
                    f"Given how {company_name} operates at global scale, consider {topic_name}: "
                    "how would you architect this system to guarantee zero data loss, strict idempotency, "
                    "and automatic recovery when downstream third-party dependencies experience network partitions?"
                ),
                archetype=QuestionArchetype.COMPANY_SPECIFIC,
            )

        if archetype == QuestionArchetype.SCENARIO_DECISION:
            return TurnGenerationResult(
                transcript=(
                    f"In designing {topic_name}, you face an architectural trade-off: strong immediate consistency "
                    "with distributed locking versus eventual consistency with asynchronous reconciliation. "
                    "Which strategy would you choose for this domain, and what failure modes does that introduce?"
                ),
                archetype=QuestionArchetype.SCENARIO_DECISION,
            )

        if archetype == QuestionArchetype.ANALYZING_DESIGN:
            return TurnGenerationResult(
                transcript=(
                    f"Let's break down the system design requirements for {topic_name}. "
                    "How would you scope the functional boundaries, estimate peak throughput and storage requirements, "
                    "and design the primary API contracts?"
                ),
                archetype=QuestionArchetype.ANALYZING_DESIGN,
            )

        if action == EngineAction.VERIFY_CLAIM and claim_text:
            context_clause = (
                f"In your previous answer, you described your approach to {key_focus}. "
                if key_focus
                else ""
            )
            return TurnGenerationResult(
                transcript=(
                    f"{context_clause}Your background specifically highlights that you '{claim_text}'. "
                    f"In the context of {topic_name}, could you walk me through the internal "
                    "architecture, how you handled failure recovery, and what specific metrics you "
                    "tracked to verify its impact?"
                ),
                archetype=QuestionArchetype.SKILL_FUNDAMENTALS,
            )

        if action == EngineAction.PROBE_DEEPER:
            context_clause = (
                f"Regarding the {key_focus} mechanism you just described"
                if key_focus
                else "Regarding that approach"
            )
            return TurnGenerationResult(
                transcript=(
                    f"{context_clause} in {topic_name}: could you dive deeper into the internal "
                    f"implementation mechanics in {preferred_language}? Specifically, what underlying data structures, "
                    "transaction isolation levels, or concurrency controls did you choose, and why?"
                ),
                archetype=QuestionArchetype.SKILL_FUNDAMENTALS,
            )

        if action == EngineAction.CHALLENGE:
            context_clause = (
                f"Let's pressure-test that {key_focus} design in {topic_name}: "
                if key_focus
                else f"Let's look at failure modes in that {topic_name} design: "
            )
            return TurnGenerationResult(
                transcript=(
                    f"{context_clause}what happens if an underlying node crashes midway through, "
                    "or a network partition occurs between your replicas? What trade-offs did you "
                    "make between consistency, availability, and latency?"
                ),
                archetype=QuestionArchetype.SCENARIO_DECISION,
            )

        if action == EngineAction.CLARIFY:
            context_clause = (
                f"Could you clarify how your {key_focus} setup"
                if key_focus
                else "Could you clarify that specific mechanism"
            )
            return TurnGenerationResult(
                transcript=(
                    f"{context_clause} in {topic_name} guarantees that state remains consistent "
                    f"in {preferred_language} without deadlock or race conditions under concurrent load?"
                ),
                archetype=QuestionArchetype.ANALYZING_DESIGN,
            )

        if action == EngineAction.SIMPLIFY:
            return TurnGenerationResult(
                transcript=(
                    f"Let's take a step back and simplify the problem in {topic_name}. Rather than a "
                    "fully distributed setup, how would you design the minimal, single-node baseline "
                    "first to guarantee correctness?"
                ),
                archetype=QuestionArchetype.SKILL_FUNDAMENTALS,
            )

        if action == EngineAction.CHANGE_TOPIC:
            context_clause = (
                f"Thank you, that gives a clear picture of how you handle {key_focus}. "
                if key_focus
                else "Thank you, that gives a clear picture. "
            )
            return TurnGenerationResult(
                transcript=(
                    f"{context_clause}Let's shift our focus to our next topic: {topic_name}. "
                    "To start, could you explain your overall strategy and mental model when designing "
                    "for scale and reliability in this domain?"
                ),
                archetype=QuestionArchetype.SYSTEM_ARCHITECTURE,
            )

        if action == EngineAction.CONCLUDE:
            return TurnGenerationResult(
                transcript=(
                    "We have covered all of our planned technical topics for today! That wraps up the "
                    "technical assessment portion. Thank you for walking through your systems with me. "
                    f"Before we conclude, what questions do you have for me about our architecture, "
                    f"tech stack, or engineering culture {company_ref}?"
                ),
                archetype=QuestionArchetype.REVERSE_QA,
            )

        return TurnGenerationResult(
            transcript=(
                f"Could you elaborate further on how you would design and operate {topic_name} "
                f"at a {target_seniority.lower()} level in {preferred_language}?"
            ),
            archetype=QuestionArchetype.SYSTEM_ARCHITECTURE,
        )

    @classmethod
    async def generate_reverse_qa_response_async(
        cls,
        candidate_question: str,
        company_name: str | None = None,
        preferred_language: str = "Python",
        target_seniority: str = "SENIOR",
    ) -> str:
        """Roleplay an authentic Staff Engineer at target company, answering candidate reverse questions."""
        company = company_name or "our engineering team"
        settings = get_settings()
        if settings.gemini_api_key:
            try:
                from google import genai

                client = genai.Client(api_key=settings.gemini_api_key)
                prompt = (
                    f"You are a Staff Software Engineer and interviewer at {company}.\n"
                    f"The candidate has just completed their {target_seniority.lower()} technical interview and asked you: "
                    f'"{candidate_question}"\n\n'
                    f"Task: Respond authentically and professionally as an engineering leader at {company}.\n"
                    f"Guidelines:\n"
                    f"- Answer their questions directly in 2-3 sentences based on realistic modern production engineering practices "
                    f"(e.g., CI/CD canary deployments, distributed tracing with OpenTelemetry, blameless post-mortems, microservice boundaries).\n"
                    f"- Warmly thank them for an engaging discussion and mention that recruiting will provide detailed evaluation feedback shortly.\n"
                    f"- Output ONLY the spoken response. No greetings, meta-tags, or markdown."
                )
                response = await client.aio.models.generate_content(
                    model=settings.gemini_turn_model,
                    contents=prompt,
                )
                if response and response.text and response.text.strip():
                    return response.text.strip()
            except Exception as exc:
                logger.warning("Gemini reverse QA generation failed (%s); using fallback", exc)

        # Deterministic fallback response
        return (
            f"That's a fantastic question. Here at {company}, our engineering culture emphasizes "
            "automated canary rollouts, comprehensive OpenTelemetry distributed tracing, and blameless post-mortems. "
            "We give engineers high autonomy to own services end-to-end from design to production observability. "
            "Thank you so much for the thoughtful discussion today—our team will follow up with your full evaluation report!"
        )

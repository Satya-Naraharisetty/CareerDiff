"""Deterministic Interview Blueprint Generator and Topic Time Budget Allocation."""

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.interview import BlueprintTopic, Interview, InterviewBlueprint
from app.models.resume import Resume, ResumeClaim
from app.models.role import JobRole

WARMUP_SECONDS_DEFAULT = 120  # 2 minutes
CONCLUSION_SECONDS_DEFAULT = 180  # 3 minutes

# Domain keywords for matching candidate resume claims to competencies
COMPETENCY_DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "distributed-systems": [
        "kafka",
        "rabbitmq",
        "distributed",
        "concurrency",
        "threading",
        "consensus",
        "raft",
        "paxos",
        "microservices",
        "streaming",
        "actor",
        "grpc",
        "lock",
    ],
    "database-architecture": [
        "postgres",
        "postgresql",
        "mysql",
        "redis",
        "database",
        "sql",
        "nosql",
        "mongodb",
        "cassandra",
        "elasticsearch",
        "indexing",
        "mvcc",
        "sharding",
        "replica",
        "sqlalchemy",
        "alembic",
    ],
    "api-resilience": [
        "rest",
        "api",
        "fastapi",
        "django",
        "flask",
        "rate limit",
        "circuit breaker",
        "idempotency",
        "resilience",
        "gateway",
        "backoff",
        "oauth",
        "jwt",
    ],
    "web-performance": [
        "performance",
        "web vitals",
        "lcp",
        "cls",
        "inp",
        "bundle",
        "splitting",
        "ssr",
        "render",
        "dom",
        "lighthouse",
    ],
    "state-management": [
        "state",
        "react",
        "tanstack",
        "query",
        "zustand",
        "redux",
        "cache",
        "store",
        "optimistic",
    ],
    "fullstack-api": [
        "api",
        "typescript",
        "fullstack",
        "contract",
        "pydantic",
        "schema",
        "serialization",
        "client",
        "graphql",
    ],
}


@dataclass(frozen=True)
class TimeBudget:
    """Mathematical allocation of interview session time."""

    total_seconds: int
    warmup_seconds: int
    conclusion_seconds: int
    topic_budgets: list[int]

    def validate_invariants(self) -> None:
        """Enforce exact time conservation: sum(budgets) + warmup + conclusion == total."""
        budget_sum = sum(self.topic_budgets) + self.warmup_seconds + self.conclusion_seconds
        assert budget_sum == self.total_seconds, (
            f"Time conservation violation: {budget_sum} != {self.total_seconds}"
        )


def calculate_topic_time_budgets(
    duration_minutes: int,
    num_topics: int,
    warmup_seconds: int = WARMUP_SECONDS_DEFAULT,
    conclusion_seconds: int = CONCLUSION_SECONDS_DEFAULT,
) -> TimeBudget:
    """Partition total interview time into warmup, conclusion, and equal topic budgets."""
    total_seconds = duration_minutes * 60
    overhead = warmup_seconds + conclusion_seconds
    available_core_seconds = total_seconds - overhead

    if available_core_seconds <= 0 or num_topics <= 0:
        raise ValueError("Duration insufficient to allocate topic budgets.")

    base_budget = available_core_seconds // num_topics
    remainder = available_core_seconds % num_topics

    budgets: list[int] = []
    for i in range(num_topics):
        # Distribute remainder seconds across initial topics
        extra = 1 if i < remainder else 0
        budgets.append(base_budget + extra)

    budget = TimeBudget(
        total_seconds=total_seconds,
        warmup_seconds=warmup_seconds,
        conclusion_seconds=conclusion_seconds,
        topic_budgets=budgets,
    )
    budget.validate_invariants()
    return budget


def match_claims_to_competency(
    competency_slug: str,
    claims: list[ResumeClaim],
) -> list[str]:
    """Identify resume claims matching a competency's domain keywords."""
    keywords = COMPETENCY_DOMAIN_KEYWORDS.get(competency_slug, [])
    matched_ids: list[str] = []

    for claim in claims:
        claim_content = f"{claim.claim_text} {' '.join(claim.technologies)}".lower()
        # Check if any domain keyword matches
        if any(re.search(r"\b" + re.escape(kw) + r"\b", claim_content) for kw in keywords):
            matched_ids.append(str(claim.id))

    return matched_ids


async def generate_interview_blueprint(
    interview: Interview,
    db: AsyncSession,
) -> InterviewBlueprint:
    """Construct deterministic InterviewBlueprint with topic budgets and mapped claims."""
    # 1. Fetch role with competencies
    stmt_role = (
        select(JobRole)
        .options(selectinload(JobRole.competencies))
        .where(JobRole.id == interview.role_id)
    )
    role = (await db.execute(stmt_role)).scalar_one_or_none()
    if not role or not role.competencies:
        raise ValueError(f"Job role {interview.role_id} has no configured competencies.")

    # Sort competencies by display order
    competencies = sorted(role.competencies, key=lambda c: c.display_order)

    # 2. Limit topics based on duration (15m: 2 topics; 30m+: up to 3-4 topics)
    max_topics = 2 if interview.scheduled_duration_minutes <= 15 else min(len(competencies), 4)
    selected_competencies = competencies[:max_topics]

    # 3. Calculate mathematical time budgets
    time_budget = calculate_topic_time_budgets(
        duration_minutes=interview.scheduled_duration_minutes,
        num_topics=len(selected_competencies),
    )

    # 4. Fetch candidate claims for claim-to-competency matching
    stmt_claims = (
        select(ResumeClaim)
        .join(Resume)
        .where(Resume.candidate_profile_id == interview.candidate_profile_id)
    )
    claims = list((await db.execute(stmt_claims)).scalars().all())

    # 5. Build Blueprint and Topics
    blueprint = InterviewBlueprint(
        interview_id=interview.id,
        total_topics=len(selected_competencies),
        total_allocated_seconds=time_budget.total_seconds,
        warmup_seconds=time_budget.warmup_seconds,
        conclusion_seconds=time_budget.conclusion_seconds,
    )
    db.add(blueprint)
    await db.flush()

    for idx, comp in enumerate(selected_competencies):
        allocated_secs = time_budget.topic_budgets[idx]
        mapped_claim_ids = match_claims_to_competency(comp.slug, claims)

        topic = BlueprintTopic(
            blueprint_id=blueprint.id,
            competency_id=comp.id,
            display_order=idx + 1,
            topic_name=comp.name,
            allocated_seconds=allocated_secs,
            mapped_claim_ids=mapped_claim_ids,
        )
        db.add(topic)

    await db.flush()
    return blueprint

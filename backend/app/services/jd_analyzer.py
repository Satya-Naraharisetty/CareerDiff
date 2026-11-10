"""Job Description (JD) analyzer extracting title, seniority, competencies, and requirements."""

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.role import Competency, JobRole, Rubric, RubricCriteria
from app.services.claim_extractor import KNOWN_TECHNOLOGIES


@dataclass
class JdProfileAnalysis:
    """Structured intelligence extracted from a Job Description."""

    extracted_title: str
    detected_seniority: str
    primary_discipline: str
    key_requirements: list[str] = field(default_factory=list)
    matched_technologies: list[str] = field(default_factory=list)
    competency_blueprints: list[dict[str, str]] = field(default_factory=list)


def analyze_job_description(
    jd_text: str,
    custom_title: str | None = None,
) -> JdProfileAnalysis:
    """Parse raw Job Description to extract role title, seniority, discipline, and competencies."""
    lower_text = jd_text.lower()
    lines = [line.strip() for line in jd_text.split("\n") if line.strip()]

    # 1. Extract Role Title
    extracted_title = custom_title
    if not extracted_title:
        title_patterns = [
            r"(?:job\s+title|title|position|role):\s*([^\n\r]+)",
            (
                r"\b((?:Senior|Lead|Staff|Principal|Junior|Mid)?\s*"
                r"(?:Backend|Frontend|Full[\s\-]*Stack|Distributed\s+Systems|Platform|"
                r"Infrastructure|Software)\s*(?:Engineer|Architect|Developer))\b"
            ),
        ]
        for pat in title_patterns:
            m = re.search(pat, jd_text, re.IGNORECASE)
            if m:
                extracted_title = m.group(1).strip()
                break

    if not extracted_title:
        extracted_title = lines[0] if len(lines[0]) < 60 else "Tailored Technical Role"

    # 2. Detect Seniority Level
    if re.search(r"\b(staff|principal|director|fellow|vp|head of)\b", lower_text):
        detected_seniority = "STAFF"
    elif re.search(r"\b(senior|lead|architect)\b", lower_text) or re.search(
        r"\b(?:[5-9]|\d{2})\+?\s*(?:years?|yrs?)\b", lower_text
    ):
        detected_seniority = "SENIOR"
    elif re.search(r"\b(mid|intermediate)\b", lower_text) or re.search(
        r"\b(?:[2-4])\+?\s*(?:years?|yrs?)\b", lower_text
    ):
        detected_seniority = "MID"
    else:
        detected_seniority = "JUNIOR"

    # 3. Detect Primary Discipline
    backend_keywords = [
        "python",
        "fastapi",
        "django",
        "flask",
        "postgresql",
        "postgres",
        "redis",
        "kafka",
        "rabbitmq",
        "sqlalchemy",
        "grpc",
        "microservices",
        "distributed",
        "database",
        "concurrency",
        "golang",
        "java",
        "nosql",
    ]
    frontend_keywords = [
        "react",
        "typescript",
        "javascript",
        "css",
        "html",
        "next.js",
        "vue",
        "zustand",
        "redux",
        "tailwind",
        "dom",
        "frontend",
        "web vitals",
    ]

    backend_score = sum(
        1 for kw in backend_keywords if re.search(r"\b" + re.escape(kw) + r"\b", lower_text)
    )
    frontend_score = sum(
        1 for kw in frontend_keywords if re.search(r"\b" + re.escape(kw) + r"\b", lower_text)
    )

    if frontend_score >= 3 and backend_score >= 3:
        primary_discipline = "FULLSTACK"
    elif frontend_score > backend_score:
        primary_discipline = "FRONTEND"
    else:
        primary_discipline = "BACKEND"

    # 4. Extract Matched Technologies
    matched_technologies: set[str] = set()
    for tech in KNOWN_TECHNOLOGIES:
        if re.search(r"\b" + re.escape(tech) + r"\b", jd_text, re.IGNORECASE):
            matched_technologies.add(tech)

    # 5. Extract Key Requirements
    key_requirements: list[str] = []
    is_in_req_section = False
    for line in lines:
        if re.search(
            r"^(requirements|qualifications|what you'?ll need|skills|responsibilities)\b",
            line,
            re.IGNORECASE,
        ):
            is_in_req_section = True
            continue
        if is_in_req_section:
            if re.search(r"^(benefits|about us|perks|company|compensation)\b", line, re.IGNORECASE):
                break
            if len(line) >= 20 and (
                line.startswith("•") or line.startswith("-") or line.startswith("*")
            ):
                cleaned = re.sub(r"^[\s*•\-\u2022\u2023\u25E6\d+\.]+\s*", "", line).strip()
                if cleaned:
                    key_requirements.append(cleaned)
                    if len(key_requirements) >= 6:
                        break

    if not key_requirements:
        for line in lines:
            if (line.startswith("•") or line.startswith("-")) and len(line) > 25:
                cleaned = re.sub(r"^[\s*•\-\u2022\u2023\u25E6\d+\.]+\s*", "", line).strip()
                key_requirements.append(cleaned)
                if len(key_requirements) >= 4:
                    break

    # 6. Build Tailored Competencies
    competency_blueprints: list[dict[str, str]] = []
    if primary_discipline == "BACKEND":
        competency_blueprints = [
            {
                "name": "Distributed Systems & Event Streaming",
                "slug": "distributed-systems",
                "description": (
                    "Consensus, partitioning, messaging pipelines (Kafka/RabbitMQ), and streaming."
                ),
            },
            {
                "name": "Database Architecture & Data Modeling",
                "slug": "database-architecture",
                "description": (
                    "Query optimization, indexing strategies, PostgreSQL MVCC, and migrations."
                ),
            },
            {
                "name": "API Resilience & Microservice Reliability",
                "slug": "api-resilience",
                "description": (
                    "Rate limiting, circuit breakers, idempotency keys, and graceful degradation."
                ),
            },
            {
                "name": "Concurrency & State Synchronization",
                "slug": "distributed-systems",
                "description": (
                    "Locking mechanisms, race conditions, atomic operations, and concurrency."
                ),
            },
        ]
    elif primary_discipline == "FRONTEND":
        competency_blueprints = [
            {
                "name": "Web Performance & Core Web Vitals",
                "slug": "web-performance",
                "description": (
                    "Rendering pipelines, bundle splitting, hydration, and Core Web Vitals."
                ),
            },
            {
                "name": "State Management & React Architecture",
                "slug": "state-management",
                "description": (
                    "Component boundaries, reactive stores, cache invalidation, and memory leaks."
                ),
            },
            {
                "name": "Frontend API Contracts & Data Fetching",
                "slug": "fullstack-api",
                "description": (
                    "Type-safe schemas, optimistic updates, WebSockets, and client error recovery."
                ),
            },
        ]
    else:  # FULLSTACK
        competency_blueprints = [
            {
                "name": "Full-Stack API Design & Schema Contracts",
                "slug": "fullstack-api",
                "description": (
                    "Shared models, TypeScript contracts, REST/GraphQL design, and serialization."
                ),
            },
            {
                "name": "Distributed State & Cache Management",
                "slug": "state-management",
                "description": (
                    "Multi-tier caching (Redis, HTTP), cache invalidation, and session state."
                ),
            },
            {
                "name": "Database Architecture & Query Optimization",
                "slug": "database-architecture",
                "description": (
                    "Data modeling, indexing, connection pooling, and transactional consistency."
                ),
            },
            {
                "name": "API Resilience & Security",
                "slug": "api-resilience",
                "description": (
                    "Authentication (JWT/OAuth), authorization, idempotency, and defense in depth."
                ),
            },
        ]

    return JdProfileAnalysis(
        extracted_title=extracted_title,
        detected_seniority=detected_seniority,
        primary_discipline=primary_discipline,
        key_requirements=key_requirements,
        matched_technologies=sorted(list(matched_technologies)),
        competency_blueprints=competency_blueprints,
    )


async def get_or_create_custom_role_from_jd(
    db: AsyncSession,
    analysis: JdProfileAnalysis,
) -> JobRole:
    """Persist or retrieve a JobRole entity matching the analyzed Job Description."""
    slug_base = re.sub(r"[^a-z0-9]+", "-", analysis.extracted_title.lower()).strip("-")
    slug = f"jd-{slug_base}"[:90]

    stmt = select(JobRole).options(selectinload(JobRole.competencies)).where(JobRole.slug == slug)
    existing_role = (await db.execute(stmt)).scalar_one_or_none()
    if existing_role:
        return existing_role

    desc = f"Tailored track for {analysis.extracted_title}."
    role = JobRole(
        name=analysis.extracted_title[:95],
        slug=slug,
        description=desc,
        is_active=True,
    )
    db.add(role)
    await db.flush()

    for idx, bp in enumerate(analysis.competency_blueprints):
        comp = Competency(
            role_id=role.id,
            name=bp["name"],
            slug=bp["slug"],
            description=bp["description"],
            display_order=idx + 1,
        )
        db.add(comp)
        await db.flush()

        rubric = Rubric(
            competency_id=comp.id,
            version=1,
            is_active=True,
        )
        db.add(rubric)
        await db.flush()

        tiers = [
            (1, "UNSATISFACTORY", f"Lacks foundational understanding of {bp['name']}."),
            (2, "BASIC", f"Explains basic syntax and high-level concepts in {bp['name']}."),
            (
                3,
                "PROFICIENT",
                f"Applies best practices and explains trade-offs in {bp['name']}.",
            ),
            (
                4,
                "ADVANCED",
                f"Expert design, fault recovery, and architectural mastery in {bp['name']}.",
            ),
        ]
        for score, tier_name, desc in tiers:
            crit = RubricCriteria(
                rubric_id=rubric.id,
                tier_level=score,
                tier_name=tier_name,
                observable_criteria=desc,
            )
            db.add(crit)

    await db.commit()

    stmt_reload = (
        select(JobRole).options(selectinload(JobRole.competencies)).where(JobRole.id == role.id)
    )
    return (await db.execute(stmt_reload)).scalar_one()

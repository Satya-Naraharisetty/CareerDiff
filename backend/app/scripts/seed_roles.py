"""Idempotent database seeding for job roles, competencies, and 4-tier rubrics."""

import asyncio
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.role import Competency, JobRole, Rubric, RubricCriteria

SEEDED_ROLES: list[dict[str, Any]] = [
    {
        "name": "Backend Engineering",
        "slug": "backend-engineering",
        "description": "Distributed systems, databases, caching, and API design.",
        "competencies": [
            {
                "name": "Distributed Systems & Concurrency",
                "slug": "distributed-systems",
                "description": (
                    "Consensus, partitioning, synchronization, and event-driven streaming."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Cannot explain race conditions, deadlocks, or state synchronization.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Explains mutual exclusion, in-memory queues, and basic threading models.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Applies partition tolerance, Kafka partitioning, and saga transactions.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Designs active-active replication, analyzes drift, and split-brain.",
                    ),
                ],
            },
            {
                "name": "Database Architecture & Data Modeling",
                "slug": "database-architecture",
                "description": (
                    "Relational design, indexing strategies, MVCC, and query optimization."
                ),
                "display_order": 2,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Unable to distinguish clustered vs non-clustered indexes or basic joins.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Designs normalized 3NF tables and uses basic foreign key constraints.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Explains PostgreSQL MVCC, isolation levels, and partial indexes.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Masters sharding, distributed deadlock resolution, and planner tuning.",
                    ),
                ],
            },
            {
                "name": "API Design & System Resilience",
                "slug": "api-resilience",
                "description": (
                    "REST/gRPC protocols, circuit breakers, rate limiters, and idempotency."
                ),
                "display_order": 3,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Lacks comprehension of HTTP status semantics or idempotent verbs.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Creates CRUD endpoints with basic request validation.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Implements sliding-window rate limiters, RFC 7807, and retry backoffs.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects zero-downtime expand/contract APIs and service mesh.",
                    ),
                ],
            },
        ],
    },
    {
        "name": "Frontend Engineering",
        "slug": "frontend-engineering",
        "description": (
            "Modern web architecture, rendering strategies, state management, and performance."
        ),
        "competencies": [
            {
                "name": "Modern Web Performance & Core Web Vitals",
                "slug": "web-performance",
                "description": (
                    "LCP, CLS, INP optimization, bundle splitting, and rendering pipelines."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Unaware of browser critical rendering path or bundle impact.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Uses standard image compression and code splitting.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Diagnoses main-thread blocking, layout shifts, and streaming SSR.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects custom memory managers, worker offloading, and low INP.",
                    ),
                ],
            },
            {
                "name": "State Management & Reactive Architecture",
                "slug": "state-management",
                "description": (
                    "Server cache synchronization, transient UI stores, and reactive graphs."
                ),
                "display_order": 2,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Misunderstands reactivity cycles, causing infinite render loops.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Uses basic local state hooks and prop drilling.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Decouples server cache (TanStack Query) from client stores (Zustand).",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Implements optimistic updates, conflict resolution, and memory safety.",
                    ),
                ],
            },
        ],
    },
    {
        "name": "Fullstack Engineering",
        "slug": "fullstack-engineering",
        "description": (
            "Holistic systems engineering spanning database layers, backend APIs, and web clients."
        ),
        "competencies": [
            {
                "name": "End-to-End API Architecture & Data Contracts",
                "slug": "fullstack-api",
                "description": (
                    "Strict type sharing, schema evolution, and end-to-end type safety."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Mismatches client and server types causing runtime serialization crashes.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Consumes REST endpoints with manual type declarations.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Generates TypeScript types from Pydantic schemas with strict validation.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Builds resilient contract-driven microfrontends and pipelines.",
                    ),
                ],
            },
        ],
    },
]


async def seed_job_roles(db: AsyncSession) -> None:
    """Seed default engineering roles, competencies, and rubrics idempotently."""
    for role_data in SEEDED_ROLES:
        stmt = select(JobRole).where(JobRole.slug == role_data["slug"])
        existing_role = (await db.execute(stmt)).scalar_one_or_none()

        if existing_role:
            role = existing_role
        else:
            role = JobRole(
                name=role_data["name"],
                slug=role_data["slug"],
                description=role_data["description"],
                is_active=True,
            )
            db.add(role)
            await db.flush()

        for comp_data in role_data["competencies"]:
            c_stmt = select(Competency).where(
                Competency.role_id == role.id,
                Competency.slug == comp_data["slug"],
            )
            existing_comp = (await db.execute(c_stmt)).scalar_one_or_none()

            if existing_comp:
                comp = existing_comp
            else:
                comp = Competency(
                    role_id=role.id,
                    name=comp_data["name"],
                    slug=comp_data["slug"],
                    description=comp_data["description"],
                    display_order=comp_data["display_order"],
                )
                db.add(comp)
                await db.flush()

            # Check rubric
            r_stmt = select(Rubric).where(
                Rubric.competency_id == comp.id,
                Rubric.version == 1,
            )
            existing_rubric = (await db.execute(r_stmt)).scalar_one_or_none()

            if not existing_rubric:
                rubric = Rubric(
                    competency_id=comp.id,
                    version=1,
                    is_active=True,
                )
                db.add(rubric)
                await db.flush()

                for tier_level, tier_name, criteria_text in comp_data["tiers"]:
                    criterion = RubricCriteria(
                        rubric_id=rubric.id,
                        tier_level=tier_level,
                        tier_name=tier_name,
                        observable_criteria=criteria_text,
                    )
                    db.add(criterion)

    await db.commit()


async def main() -> None:
    """CLI runner to seed database."""
    async with async_session_factory() as session:
        await seed_job_roles(session)
        print("Roles, competencies, and 4-tier rubrics successfully seeded!")


if __name__ == "__main__":
    asyncio.run(main())

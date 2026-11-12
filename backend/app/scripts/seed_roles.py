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
    {
        "name": "Generative AI & LLM Systems Engineer",
        "slug": "generative-ai-engineer",
        "description": (
            "RAG architectures, vector databases, LLM observability, prompt guardrails, and agentic workflows."
        ),
        "competencies": [
            {
                "name": "Hybrid Retrieval & Vector Search",
                "slug": "hybrid-retrieval-vector-search",
                "description": (
                    "Dense vector embeddings, sparse BM25, Reciprocal Rank Fusion, and HNSW indexing."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Cannot explain dense vs sparse vector search or distance metrics.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Builds basic vector search using cosine distance and naive top-k retrieval.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Applies hybrid dense + BM25 with Reciprocal Rank Fusion and MMR diversification.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Designs scalable HNSW vector indexing with payload filtering and quantization.",
                    ),
                ],
            },
            {
                "name": "RAG Architectures & Reranking",
                "slug": "rag-architectures-reranking",
                "description": (
                    "Chunking strategies, cross-encoder rerankers, context window management, and multi-hop reasoning."
                ),
                "display_order": 2,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Unaware of context window limits, chunk overlap, or hallucination causes.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Implements basic fixed-size text chunking with simple LLM context injection.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Integrates cross-encoder rerankers, semantic chunking, and sliding window contexts.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects agentic RAG with query rewriting, corrective RAG, and multi-hop reasoning.",
                    ),
                ],
            },
            {
                "name": "LLM Observability & Evaluation",
                "slug": "llm-observability-telemetry",
                "description": (
                    "Time to First Token (TTFT), streaming latency, DeepEval metrics, and regression testing."
                ),
                "display_order": 3,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Lacks telemetry for token consumption, latency, or model accuracy.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Logs total response time and basic prompt/completion character counts.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Measures streaming Time to First Token (TTFT) and automates DeepEval metrics.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Implements automated regression evaluation suites in CI/CD with trace sampling.",
                    ),
                ],
            },
            {
                "name": "Prompt Security & Deterministic Guardrails",
                "slug": "prompt-security-guardrails",
                "description": (
                    "Prompt injection defense, canary tokens, XML boundary fencing, and state machine guardrails."
                ),
                "display_order": 4,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Relies entirely on system prompt instructions to enforce behavioral safety.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Uses basic regex blocklists for forbidden keywords.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Implements XML boundary fencing, canary tokens, and Pydantic schema validation.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects deterministic dual-layer guardrails separating decision state from LLM authority.",
                    ),
                ],
            },
        ],
    },
    {
        "name": "DevOps & Site Reliability Engineer",
        "slug": "devops-sre",
        "description": (
            "CI/CD pipelines, Kubernetes, Infrastructure as Code, observability, and incident recovery."
        ),
        "competencies": [
            {
                "name": "CI/CD Automation & Release Engineering",
                "slug": "cicd-automation-release",
                "description": (
                    "Automated build/test pipelines, blue-green deployment, and regression testing."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Relies on manual deployment scripts and lacks automated test gates.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Configures basic GitHub Actions / Jenkins pipelines for build and deploy.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Implements blue-green and canary deployment strategies with automated rollbacks.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects enterprise GitOps pipelines with progressive delivery and policy-as-code.",
                    ),
                ],
            },
            {
                "name": "Container Orchestration & Kubernetes",
                "slug": "container-orchestration-k8s",
                "description": (
                    "Docker container optimization, Kubernetes resources, ingress, and cluster scaling."
                ),
                "display_order": 2,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Unfamiliar with Docker layers, multi-stage builds, or container networking.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Writes basic Dockerfiles and runs single-node docker compose environments.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Manages Kubernetes Deployments, StatefulSets, Ingress, and HPA autoscaling.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects multi-cluster service mesh, eBPF networking, and cluster upgrades.",
                    ),
                ],
            },
            {
                "name": "Infrastructure as Code & Cloud Reliability",
                "slug": "iac-cloud-reliability",
                "description": (
                    "Terraform provisioning, state management, disaster recovery, and cloud networking."
                ),
                "display_order": 3,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Provisions cloud resources manually via web console with no state management.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Writes basic Terraform / CloudFormation templates with hardcoded variables.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Designs modular Terraform with remote state locking and least privilege.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Implements multi-region failover, disaster recovery RTO/RPO budgets, and chaos testing.",
                    ),
                ],
            },
            {
                "name": "Observability, Telemetry & Incident Postmortems",
                "slug": "observability-telemetry-incident",
                "description": (
                    "Prometheus metrics, OpenTelemetry distributed tracing, alerting, and blameless postmortems."
                ),
                "display_order": 4,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Lacks structured logging or metrics; discovers outages from customer reports.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Sets up basic server CPU/memory alerts and standard access log aggregations.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Instruments OpenTelemetry distributed tracing, Prometheus metrics, and error budgets.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Defines mathematically sound SLOs/SLIs, leads blameless postmortems, and automates self-healing.",
                    ),
                ],
            },
        ],
    },
    {
        "name": "Data Engineer",
        "slug": "data-engineer",
        "description": (
            "Distributed data pipelines, stream processing, lakehouses, and data modeling."
        ),
        "competencies": [
            {
                "name": "Distributed Stream & Batch Processing",
                "slug": "distributed-stream-batch-processing",
                "description": (
                    "Spark, Flink, Kafka streaming, windowing, and distributed shuffle optimization."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Relies on single-node Python scripts for large dataset transformations.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Writes basic PySpark or SQL ETL jobs running on a scheduled cron.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Optimizes Spark shuffles, skewed partitions, and Kafka stream windowing.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects low-latency streaming pipelines with exactly-once event semantics.",
                    ),
                ],
            },
            {
                "name": "Data Warehousing & Lakehouse Architecture",
                "slug": "data-warehousing-lakehouse",
                "description": (
                    "Apache Iceberg, Delta Lake, Snowflake, BigQuery, and columnar storage."
                ),
                "display_order": 2,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Cannot explain differences between OLTP, OLAP, and columnar storage.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Creates standard star-schema data models in relational databases.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Designs Lakehouse tables using Apache Iceberg/Delta Lake with Parquet compaction.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Masters distributed storage query optimization, partition pruning, and Z-ordering.",
                    ),
                ],
            },
            {
                "name": "Data Modeling & Schema Evolution",
                "slug": "data-modeling-schema-evolution",
                "description": (
                    "Avro/Protobuf schema evolution, dimension modeling, and SCD Type 2 tracking."
                ),
                "display_order": 3,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Modifies live database tables with breaking schema changes.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Uses basic migrations for adding nullable columns to relational tables.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Designs Avro/Protobuf schema evolution with backward/forward compatibility rules.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects multi-tenant dimensional models with SCD Type 2 historical auditability.",
                    ),
                ],
            },
            {
                "name": "Data Quality, Lineage & Pipeline Resilience",
                "slug": "data-quality-pipeline-resilience",
                "description": (
                    "dbt tests, data contracts, lineage tracking, and dead-letter queue quarantining."
                ),
                "display_order": 4,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Lacks automated validation; data corruption flows undetected into dashboards.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Adds basic row count and null value checks at the end of ETL pipelines.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Implements Great Expectations / dbt test suites with automated lineage tracking.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Enforces automated quarantine dead-letter queues and data contract SLAs.",
                    ),
                ],
            },
        ],
    },
    {
        "name": "Cloud & Distributed Systems Architect",
        "slug": "cloud-architect",
        "description": (
            "High-availability system design, multi-region failover, consensus protocols, and networking."
        ),
        "competencies": [
            {
                "name": "Distributed Consensus & Coordination",
                "slug": "distributed-consensus-coordination",
                "description": (
                    "Raft/Paxos leader election, quorums, Redlock, and consistency models."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Unaware of CAP theorem, split-brain scenarios, or consensus algorithms.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Explains master-replica database failover and basic optimistic concurrency.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Analyzes Raft/Paxos leader election, quorums, and distributed locking.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Designs high-throughput consensus systems with CRDTs and causal consistency.",
                    ),
                ],
            },
            {
                "name": "High Availability & Multi-Region Resilience",
                "slug": "ha-disaster-recovery",
                "description": (
                    "Multi-AZ, active-active multi-region, RTO/RPO budgets, and disaster recovery."
                ),
                "display_order": 2,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Single point of failure (SPOF) designs that crash during local AZ outages.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Deploys multi-AZ redundant instances with automated health check failovers.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Implements active-passive and active-active multi-region replication architectures.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Engineers global traffic routing, geo-partitioning, and sub-second disaster recovery.",
                    ),
                ],
            },
            {
                "name": "Cloud Networking & Zero-Trust Security",
                "slug": "cloud-networking-security",
                "description": (
                    "VPC peering, transit gateways, private links, mTLS, and network microsegmentation."
                ),
                "display_order": 3,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Deploys instances in public subnets with unrestricted security groups.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Configures private subnets, NAT gateways, and basic VPC peering connections.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Implements transit gateways, VPC endpoints, and mutual TLS (mTLS) service auth.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects zero-trust microsegmentation, PrivateLink, and egress firewall filtering.",
                    ),
                ],
            },
            {
                "name": "Scalability, Caching & Performance Optimization",
                "slug": "scalability-caching-performance",
                "description": (
                    "Multi-tier caching, cache stampede mitigation, CDN edge compute, and P99 latency."
                ),
                "display_order": 4,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Approaches scale solely by vertically resizing expensive database instances.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Adds standard Redis read-through cache for slow database queries.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Designs multi-tier caching with cache stampede mitigation and read replicas.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Masters global CDN edge compute, distributed cache invalidation, and P99 latency SLAs.",
                    ),
                ],
            },
        ],
    },
    {
        "name": "Security & Application Security Engineer",
        "slug": "security-engineer",
        "description": (
            "Application security, authentication protocols, cryptography, threat modeling, and OWASP."
        ),
        "competencies": [
            {
                "name": "Authentication Protocols & Identity Federation",
                "slug": "auth-protocols-jwt",
                "description": (
                    "OAuth 2.1, OIDC, PKCE, JWT token rotation, and enterprise SSO federation."
                ),
                "display_order": 1,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Stores plain-text passwords or passes sensitive tokens in URL query params.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Implements basic session cookies and symmetric HMAC JWT authentication.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Architects OAuth 2.1 / OIDC flows with PKCE, asymmetric RS256, and token rotation.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Designs enterprise SSO federation (SAML/SCIM), passkeys (WebAuthn), and zero-trust IAM.",
                    ),
                ],
            },
            {
                "name": "Application Security & Threat Modeling (OWASP Top 10)",
                "slug": "appsec-threat-modeling",
                "description": (
                    "STRIDE threat modeling, SSRF, IDOR, SQL injection, and secure code review."
                ),
                "display_order": 2,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Unaware of SQL injection, cross-site scripting (XSS), or CSRF vulnerabilities.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Uses basic ORMs and HTML escaping to prevent common injection attacks.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Performs systematic STRIDE threat modeling and secures against SSRF and IDOR.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects end-to-end memory-safe sanitization, CSP headers, and automated SAST/DAST.",
                    ),
                ],
            },
            {
                "name": "Cryptographic Integrity & Key Management",
                "slug": "cryptography-key-management",
                "description": (
                    "KMS envelope encryption, key rotation, HMAC signing, and secrets vaults."
                ),
                "display_order": 3,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Hardcodes secrets and API keys in source code repositories.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Uses environment variables and standard AES symmetric encryption.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Manages envelope encryption with cloud KMS, automated key rotation, and secret vaults.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Designs zero-knowledge architectures, homomorphic encryption, and HSM integrations.",
                    ),
                ],
            },
            {
                "name": "API Security & Audit Logging",
                "slug": "api-security-audit-logging",
                "description": (
                    "Tamper-evident audit logs, WAF configuration, rate limiting, and anomaly detection."
                ),
                "display_order": 4,
                "tiers": [
                    (
                        1,
                        "UNSATISFACTORY",
                        "Lacks rate limiting; APIs are vulnerable to scraping and credential stuffing.",
                    ),
                    (
                        2,
                        "BASIC",
                        "Implements basic IP-based rate limiting on sensitive login routes.",
                    ),
                    (
                        3,
                        "PROFICIENT",
                        "Builds tamper-evident audit logs with cryptographic hash chaining and WAF rules.",
                    ),
                    (
                        4,
                        "ADVANCED",
                        "Architects zero-trust API gateways with automated behavioral anomaly detection.",
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

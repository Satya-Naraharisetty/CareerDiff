"""Company Intelligence & Engineering Archetype Classifier.

Analyzes company names and Job Descriptions to classify engineering scale,
culture, and architectural focus into one of 4 interview personas:
STANDARD, BIG_TECH, SCALE_UP, or FINTECH.
"""

import json
import logging
import re
from typing import Any, Literal

from app.core.config import get_settings

logger = logging.getLogger("CareerDiff.company_analyzer")

CompanyPersonaType = Literal["STANDARD", "BIG_TECH", "SCALE_UP", "FINTECH"]

# Fast in-memory curated knowledge base for major global tech companies
KNOWN_COMPANIES: dict[str, dict[str, Any]] = {
    # 🏢 Hyperscale Big Tech
    "google": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Global Infrastructure",
        "rationale": (
            "Google operates at planet scale with billions of daily active users; "
            "engineering emphasizes distributed consensus (Spanner/Paxos), failure domain isolation, "
            "and five-nines (99.999%) availability."
        ),
        "focus": [
            "Distributed Consensus (Raft/Paxos)",
            "Multi-Region Replication",
            "Failure Domain Isolation",
            "CAP Theorem Trade-Offs",
        ],
    },
    "alphabet": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Global Infrastructure",
        "rationale": "Parent company of Google, maintaining global planet-scale distributed infrastructure.",
        "focus": [
            "Multi-Region Replication",
            "Distributed Consensus",
            "High Availability (99.999%)",
        ],
    },
    "meta": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Distributed Systems",
        "rationale": (
            "Meta handles billions of concurrent social graph mutations; engineering evaluates "
            "massive caching tiers (Memcached), distributed key-value stores (RocksDB), and horizontal sharding."
        ),
        "focus": ["Massive Read/Write Caching", "Graph Data Sharding", "Eventual Consistency"],
    },
    "facebook": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Distributed Systems",
        "rationale": "High-volume distributed social graph platform requiring multi-region data replication.",
        "focus": ["Cache Invalidation at Scale", "Horizontal Sharding", "Asynchronous Replication"],
    },
    "amazon": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Cloud & E-Commerce",
        "rationale": (
            "Amazon and AWS set the benchmark for service-oriented architecture (SOA), cell-based "
            "isolation, extreme multi-tenant security, and autonomous microservices."
        ),
        "focus": [
            "Cell-Based Architecture",
            "Backpressure & Circuit Breakers",
            "Distributed Queues (SQS)",
        ],
    },
    "aws": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Cloud Provider",
        "rationale": "World's leading cloud platform; emphasizes multi-tenant isolation, regional fault tolerance, and API stability.",
        "focus": ["Zero Downtime Deployments", "Fault Domain Isolation", "Consensus Topologies"],
    },
    "microsoft": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Enterprise & Cloud",
        "rationale": "Operates Azure and global enterprise clouds; focuses on distributed consensus, security boundaries, and SLA governance.",
        "focus": ["Distributed Consensus", "Hybrid Cloud Networking", "Scalable Enterprise APIs"],
    },
    "apple": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Consumer Ecosystem",
        "rationale": "Operates iCloud and media backends with hundreds of millions of client devices and strict security protocols.",
        "focus": [
            "Zero-Knowledge Cryptography",
            "Global CDN Distribution",
            "Massive Event Ingestion",
        ],
    },
    "netflix": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Streaming & Chaos Engineering",
        "rationale": (
            "Pioneered chaos engineering and resilient cloud microservices; engineering emphasizes "
            "active-active multi-region failover, circuit breakers, and client-side load balancing."
        ),
        "focus": [
            "Active-Active Multi-Region",
            "Circuit Breakers",
            "Chaos Engineering & Resilience",
        ],
    },
    "uber": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Real-Time Marketplace",
        "rationale": "Real-time geospatial dispatch and pricing systems handling millions of concurrent trips.",
        "focus": ["Geospatial Indexing (H3)", "Real-Time Streaming", "Event-Driven Sagas"],
    },
    "bytedance": {
        "persona": "BIG_TECH",
        "scale_tier": "Hyperscale Recommendation & Media",
        "rationale": "Operates TikTok with massive video streaming and recommendation engine compute at millions of QPS.",
        "focus": ["Massive Throughput Streaming", "Low-Latency Sharding", "Distributed Caching"],
    },
    # ⚡ High-Velocity Scale-Ups & Unicorns
    "stripe": {
        "persona": "SCALE_UP",
        "scale_tier": "High-Velocity Unicorn & Payments Infrastructure",
        "rationale": (
            "Stripe balances rapid API evolution with absolute financial accuracy; engineering emphasizes "
            "idempotency keys, distributed transaction outboxes, and backwards-compatible schema migrations."
        ),
        "focus": [
            "Idempotency Keys",
            "Transactional Outbox Pattern",
            "Zero Double-Spend Semantics",
            "Zero-Downtime Database Migrations",
        ],
    },
    "airbnb": {
        "persona": "SCALE_UP",
        "scale_tier": "High-Growth Two-Sided Marketplace",
        "rationale": "Migrated from monolithic Rails to event-driven SOA; evaluates search indexing, booking locks, and availability.",
        "focus": ["Event-Driven Microservices", "Distributed Locking", "Search Index Replication"],
    },
    "databricks": {
        "persona": "SCALE_UP",
        "scale_tier": "Distributed Data Lakehouse Scale-Up",
        "rationale": "Builds Spark and Delta Lake engines; probes distributed query planning, worker concurrency, and columnar formats.",
        "focus": [
            "Distributed Query Planning",
            "Worker Concurrency & Backpressure",
            "Storage Layer Sharding",
        ],
    },
    "snowflake": {
        "persona": "SCALE_UP",
        "scale_tier": "Cloud Data Warehouse Scale-Up",
        "rationale": "Pioneered separation of compute and storage in cloud databases; probes multi-tenant query scheduling.",
        "focus": [
            "Compute/Storage Separation",
            "Multi-Tenant Resource Allocation",
            "Query Optimization",
        ],
    },
    "doordash": {
        "persona": "SCALE_UP",
        "scale_tier": "High-Velocity Delivery Marketplace",
        "rationale": "High-concurrency order dispatch and logistics; emphasizes fast rollback paths, Kafka event buses, and redis caching.",
        "focus": [
            "Kafka Partitioning",
            "Redis Caching Strategies",
            "Idempotent Order State Transitions",
        ],
    },
    "vercel": {
        "persona": "SCALE_UP",
        "scale_tier": "Developer Cloud & Edge Scale-Up",
        "rationale": "Builds Next.js and global edge computing; probes serverless execution, CDN caching, and low-latency proxies.",
        "focus": [
            "Edge Computing & Proxies",
            "Incremental Static Regeneration",
            "Zero-Cold-Start Runtimes",
        ],
    },
    "supabase": {
        "persona": "SCALE_UP",
        "scale_tier": "Open-Source Cloud Backend Scale-Up",
        "rationale": "Scales multi-tenant PostgreSQL clusters and real-time CDC engines; probes WAL replication and connection pooling.",
        "focus": [
            "PostgreSQL WAL Streaming",
            "Connection Pooling (PgBouncer)",
            "Realtime WebSockets",
        ],
    },
    "openai": {
        "persona": "SCALE_UP",
        "scale_tier": "Hypergrowth AI Frontier Lab",
        "rationale": "High-throughput model inference serving and cluster orchestration; probes GPU utilization, queuing, and streaming SSE.",
        "focus": [
            "Streaming Response Delivery",
            "Distributed Request Queues",
            "Inference Concurrency Control",
        ],
    },
    "anthropic": {
        "persona": "SCALE_UP",
        "scale_tier": "Hypergrowth AI Safety & Model Scaling",
        "rationale": "Operates Claude inference clusters; probes rate limiting, distributed inference queuing, and token streaming.",
        "focus": ["Rate Limiting Algorithms", "SSE Streaming", "Cluster Autoscaling"],
    },
    "figma": {
        "persona": "SCALE_UP",
        "scale_tier": "Real-Time Collaborative Web Scale-Up",
        "rationale": "Pioneered browser WebAssembly and multiplayer CRDT-like syncing; evaluates real-time collaborative state reconciliation.",
        "focus": [
            "Conflict-Free Replicated Data",
            "WebSocket Synchronization",
            "WebAssembly Compute",
        ],
    },
    "canva": {
        "persona": "SCALE_UP",
        "scale_tier": "High-Growth Visual Suite Scale-Up",
        "rationale": "High-volume visual rendering and asset pipeline; probes distributed asset processing, workers, and caching.",
        "focus": ["Asynchronous Job Queues", "CDN Asset Caching", "Horizontally Scaled Renderers"],
    },
    # 🛡️ Mission-Critical FinTech & Banking
    "jpmorgan": {
        "persona": "FINTECH",
        "scale_tier": "Tier-1 Global Investment Bank",
        "rationale": (
            "Operates global financial settlement and high-frequency trading networks; engineering strictly "
            "enforces ACID guarantees, double-entry audit ledgers, cryptographic signing, and sub-millisecond p99 latencies."
        ),
        "focus": [
            "Strict ACID Guarantees",
            "Double-Entry Audit Ledgers",
            "Cryptographic Verification",
            "Sub-Millisecond p99 Latency SLAs",
        ],
    },
    "jp morgan": {
        "persona": "FINTECH",
        "scale_tier": "Tier-1 Global Investment Bank",
        "rationale": "Global banking leader enforcing strict transaction consistency, ledgers, and deterministic failover.",
        "focus": ["Strict ACID Transactions", "Audit Logging", "Deterministic State Recovery"],
    },
    "goldman sachs": {
        "persona": "FINTECH",
        "scale_tier": "Tier-1 Global Investment Bank",
        "rationale": "High-stakes algorithmic trading and transaction banking; probes strict latency SLAs, auditability, and data security.",
        "focus": [
            "Low-Latency In-Memory Processing",
            "Audit Compliance & Ledgers",
            "Deterministic Concurrency",
        ],
    },
    "morgan stanley": {
        "persona": "FINTECH",
        "scale_tier": "Tier-1 Global Investment Bank & Wealth",
        "rationale": "High-reliability transactional systems requiring zero data loss and strict regulatory compliance.",
        "focus": ["ACID Compliance", "Distributed Data Integrity", "Failover Topologies"],
    },
    "citadel": {
        "persona": "FINTECH",
        "scale_tier": "Market Maker & Quantitative Hedge Fund",
        "rationale": "Ultra-low-latency market making; evaluates microsecond networking, lockless concurrency, and cache locality.",
        "focus": [
            "Lock-Free Ring Buffers",
            "Zero-Allocation Caching",
            "Microsecond p99/p99.9 Latency",
        ],
    },
    "jane street": {
        "persona": "FINTECH",
        "scale_tier": "Proprietary Quantitative Trading",
        "rationale": "High-throughput quantitative trading; probes functional correctness, deterministic concurrency, and low latency.",
        "focus": [
            "Deterministic Concurrency",
            "Zero-Copy Data Pipelines",
            "Type-Driven Correctness",
        ],
    },
    "bloomberg": {
        "persona": "FINTECH",
        "scale_tier": "Financial Data & Analytics Terminal",
        "rationale": "Global financial telemetry backbone; evaluates real-time market data dissemination and high-availability database engines.",
        "focus": [
            "Real-Time Market Data Pub/Sub",
            "High-Throughput Timeseries",
            "Database Sharding",
        ],
    },
    "coinbase": {
        "persona": "FINTECH",
        "scale_tier": "Crypto Asset Exchange & Custody",
        "rationale": "Digital asset exchange requiring strict cold/hot wallet cryptography, deterministic order matching, and zero double-spend.",
        "focus": [
            "Cryptographic Key Signing",
            "Deterministic Matching Engine",
            "High-Throughput Order Books",
        ],
    },
    "robinhood": {
        "persona": "FINTECH",
        "scale_tier": "Retail Brokerage & Clearing",
        "rationale": "High-concurrency order routing and clearing house integration; emphasizes market order validation and regulatory audit trails.",
        "focus": ["Transactional Ledgers", "Real-Time Market Feeds", "Order Routing Correctness"],
    },
    "plaid": {
        "persona": "FINTECH",
        "scale_tier": "Open Banking & API Infrastructure",
        "rationale": "Connects thousands of financial institutions; probes bank protocol adapters, credential security, and tokenized APIs.",
        "focus": ["API Security & OAuth", "Resilient Webhook Delivery", "Rate Limiting & Backoff"],
    },
    "revolut": {
        "persona": "FINTECH",
        "scale_tier": "Global Digital Banking Neobank",
        "rationale": "High-speed multi-currency ledgers and payments; probes strict debit/credit balance consistency and card processing.",
        "focus": [
            "Double-Entry Accounting Ledgers",
            "Multi-Currency Balance Consistency",
            "Fraud Detection Pipelines",
        ],
    },
}


def _normalize_name(name: str) -> str:
    """Normalize company name string for resilient matching."""
    cleaned = name.strip().lower()
    cleaned = re.sub(
        r"\b(inc|corp|corporation|ltd|limited|co|llc|technologies|systems|labs)\b", "", cleaned
    )
    return re.sub(r"[^a-z0-9]", "", cleaned)


def classify_company_from_catalog(company_name: str) -> dict[str, Any] | None:
    """Check known in-memory corporate catalog for instant zero-latency match."""
    norm = _normalize_name(company_name)
    if not norm:
        return None

    for key, data in KNOWN_COMPANIES.items():
        if norm == _normalize_name(key):
            return {
                "company_name": company_name.strip(),
                "detected_persona": data["persona"],
                "scale_tier": data["scale_tier"],
                "rationale": data["rationale"],
                "architectural_focus": data["focus"],
                "confidence": 0.98,
            }

    # Partial substring match (e.g. "Google Cloud" -> "Google", "Stripe Payments" -> "Stripe")
    for key, data in KNOWN_COMPANIES.items():
        clean_key = _normalize_name(key)
        if len(clean_key) >= 4 and (clean_key in norm or norm in clean_key):
            return {
                "company_name": company_name.strip(),
                "detected_persona": data["persona"],
                "scale_tier": data["scale_tier"],
                "rationale": data["rationale"],
                "architectural_focus": data["focus"],
                "confidence": 0.92,
            }

    return None


def heuristic_company_classification(
    company_name: str, jd_text: str | None = None
) -> dict[str, Any]:
    """Fallback heuristic analysis using domain keyword triggers."""
    combined = f"{company_name} {jd_text or ''}".lower()

    # FinTech check
    fintech_keywords = [
        "bank",
        "capital",
        "trading",
        "hedge",
        "crypto",
        "exchange",
        "securities",
        "asset",
        "fund",
        "fintech",
        "wealth",
        "payment",
        "ledger",
        "insurance",
        "clearing",
        "brokerage",
        "currency",
    ]
    if any(re.search(rf"\b{kw}\b", combined) for kw in fintech_keywords):
        return {
            "company_name": company_name.strip(),
            "detected_persona": "FINTECH",
            "scale_tier": "Mission-Critical Financial Services",
            "rationale": (
                f"{company_name} operates in the financial or transaction domain. Technical evaluation "
                "prioritizes strict ACID consistency, double-entry audit ledgers, idempotency, and predictable latency."
            ),
            "architectural_focus": [
                "Strict ACID Guarantees",
                "Double-Entry Audit Ledgers",
                "Idempotency Keys",
                "High Availability & Low Latency",
            ],
            "confidence": 0.82,
        }

    # Big Tech check
    big_tech_keywords = [
        "hyperscale",
        "planet-scale",
        "millions of qps",
        "billions of users",
        "global infrastructure",
        "cloud platform",
        "multi-datacenter",
    ]
    if any(kw in combined for kw in big_tech_keywords):
        return {
            "company_name": company_name.strip(),
            "detected_persona": "BIG_TECH",
            "scale_tier": "Hyperscale Distributed Systems",
            "rationale": (
                f"{company_name} operates at extreme scale with high throughput demands; evaluation probes "
                "multi-region consensus, CAP theorem trade-offs, and failure domain containment."
            ),
            "architectural_focus": [
                "Multi-Region Replication",
                "Distributed Consensus",
                "Fault Domain Isolation",
                "High Availability (99.999%)",
            ],
            "confidence": 0.80,
        }

    # Scale-Up check
    scale_up_keywords = [
        "scale-up",
        "scaleup",
        "unicorn",
        "series b",
        "series c",
        "series d",
        "hypergrowth",
        "fast-growing",
        "developer velocity",
        "saas platform",
    ]
    if any(kw in combined for kw in scale_up_keywords):
        return {
            "company_name": company_name.strip(),
            "detected_persona": "SCALE_UP",
            "scale_tier": "High-Velocity Tech Scale-Up",
            "rationale": (
                f"{company_name} represents a high-growth product organization balancing feature velocity with architectural "
                "stability; evaluation probes idempotency, event-driven decoupling, and fast rollbacks."
            ),
            "architectural_focus": [
                "Developer Velocity & Modularization",
                "Event-Driven Architecture",
                "Idempotency & Retry Strategies",
                "Observability & Fast Rollbacks",
            ],
            "confidence": 0.78,
        }

    # Standard Senior Engineering baseline
    return {
        "company_name": company_name.strip(),
        "detected_persona": "STANDARD",
        "scale_tier": "Balanced Engineering Organization",
        "rationale": (
            f"{company_name} follows balanced senior engineering practices. Technical evaluation covers "
            "clean modular interface boundaries, concurrency control, caching layers, and database performance."
        ),
        "architectural_focus": [
            "Modular Interface Design",
            "Concurrency & Thread Safety",
            "Caching & Performance Optimization",
            "Database Schema Design & Indexing",
        ],
        "confidence": 0.70,
    }


async def classify_company_persona(
    company_name: str,
    jd_text: str | None = None,
) -> dict[str, Any]:
    """Classify company into BIG_TECH, SCALE_UP, FINTECH, or STANDARD with full architectural reasoning."""
    if not company_name or not company_name.strip():
        return heuristic_company_classification("Unknown Enterprise", jd_text)

    # 1. Fast catalog lookup (<1ms)
    catalog_match = classify_company_from_catalog(company_name)
    if catalog_match:
        return catalog_match

    # 2. Use Gemini 3.8 Flash for intelligent classification of any company
    settings = get_settings()
    if settings.gemini_api_key:
        try:
            from google import genai

            client = genai.Client(api_key=settings.gemini_api_key)
            jd_snippet = jd_text[:2000] if jd_text else "None provided"
            prompt = (
                f"You are CareerDiff Corporate Engineering Archetype Classifier.\n\n"
                f"Company Name: <company_name>{company_name}</company_name>\n"
                f"Job Description Context: <jd_context>{jd_snippet}</jd_context>\n\n"
                f"Task: Classify this company into exactly ONE of these four technical interview personas:\n"
                f"- BIG_TECH: Hyperscale distributed systems, millions of QPS, CAP theorem, multi-region consensus (e.g. Google, Meta, AWS, Netflix).\n"
                f"- SCALE_UP: High-velocity growth company, unicorn, rapid product delivery, idempotency, event queues, fast rollbacks (e.g. Stripe, Airbnb, Databricks, Vercel).\n"
                f"- FINTECH: Banking, trading, or financial infrastructure with strict ACID transactions, double-entry audit ledgers, cryptographic signing, strict p99 SLAs (e.g. JPMorgan, Citadel, Coinbase, Plaid).\n"
                f"- STANDARD: General enterprise software, consulting, mid-size SaaS, or balanced senior engineering.\n\n"
                f"Output strictly valid JSON with this exact schema:\n"
                f'{{"detected_persona": "BIG_TECH" | "SCALE_UP" | "FINTECH" | "STANDARD", '
                f'"scale_tier": "string", '
                f'"rationale": "1-2 sentence engineering reason why this persona applies", '
                f'"architectural_focus": ["Topic 1", "Topic 2", "Topic 3"]}}'
            )

            response = await client.aio.models.generate_content(
                model=settings.gemini_turn_model,
                contents=prompt,
            )
            if response and response.text:
                text = response.text.strip()
                if "```" in text:
                    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
                    if m:
                        text = m.group(1).strip()
                data = json.loads(text)
                detected = str(data.get("detected_persona", "STANDARD")).upper()
                if detected not in {"BIG_TECH", "SCALE_UP", "FINTECH", "STANDARD"}:
                    detected = "STANDARD"

                focus = data.get("architectural_focus")
                focus_list = [str(item) for item in focus[:4]] if isinstance(focus, list) else []

                return {
                    "company_name": company_name.strip(),
                    "detected_persona": detected,
                    "scale_tier": str(data.get("scale_tier", "Specialized Technology Enterprise")),
                    "rationale": str(
                        data.get("rationale", f"Calibrated for {company_name} engineering scope.")
                    ),
                    "architectural_focus": focus_list,
                    "confidence": 0.90,
                }
        except Exception as exc:
            logger.warning(
                "Gemini company classification failed (%s); using heuristic fallback", exc
            )

    # 3. Fallback heuristic
    return heuristic_company_classification(company_name, jd_text)

# Architecture Decision Records (ADRs) — CareerDiff

This document records the foundational architectural decisions made for the CareerDiff platform, following the standard Architecture Decision Record (ADR) format.

---

## ADR-001: Architectural Pattern — Modular Monolith over Microservices

### Status: Accepted
### Context
We need to architect an early-stage, voice-first technical interviewing platform. The system has multiple logical domains (Resume Parsing, Role Management, Adaptive Engine, Voice Pipeline, Evaluation). A common anti-pattern in modern software engineering is premature decomposition into distributed microservices, introducing network latency, deployment complexity, distributed transaction failure modes, and developer friction.

### Decision
We will build CareerDiff as a **Modular Monolith** running within a single FastAPI repository, supplemented by asynchronous worker processes (Taskiq). Domain boundaries will be enforced strictly via Python package separation, typed protocols, and clear interface abstractions.

### Consequences
- **Positive**: Single repository deployment, local development runs cleanly via simple `docker compose up`, fast in-memory function calls between modules, zero distributed transaction overhead, ACID transactions across domains.
- **Negative**: Long-term code discipline required to prevent cross-module spaghetti imports.
- **Mitigation**: Enforce architectural linting via import linter or Ruff boundary rules.

---

## ADR-002: Backend Framework — Python FastAPI + SQLAlchemy 2.0 (Async) + PostgreSQL

### Status: Accepted
### Context
The backend requires native asynchronous I/O to handle concurrent WebSocket connections, integration with modern AI and data science libraries, robust schema validation, and high developer ergonomics.

### Decision
Adopt **Python 3.12+**, **FastAPI**, **Pydantic v2**, and **SQLAlchemy 2.0** with `asyncpg` on **PostgreSQL 16**.

### Consequences
- **Positive**: First-class async/await concurrency for WebSockets and streaming AI APIs; seamless integration with ONNX VAD models and Python ML tooling; Pydantic v2 written in Rust delivers 5-20x faster serialization; SQLAlchemy 2.0 provides strict type checking and modern async query syntax.
- **Negative**: Python async coroutines can block if CPU-bound tasks are executed on the main event loop.
- **Mitigation**: Heavy CPU tasks (e.g. PDF OCR, large audio processing) are offloaded to background worker processes.

---

## ADR-003: Frontend Architecture — React 18, TypeScript, Vite, TanStack Query, Zustand

### Status: Accepted
### Context
The frontend must manage real-time Web Audio API streams, WebSocket lifecycle events, interactive radar charts, transcript playback, and high-performance DOM updates without UI jank.

### Decision
Adopt **React 18** with **TypeScript 5**, **Vite**, **Tailwind CSS**, **TanStack Query v5** (server state), and **Zustand** (client/UI state).

### Consequences
- **Positive**: Strict type safety end-to-end; TanStack Query eliminates manual fetching boilerplate and handles caching, polling, and cache invalidation automatically; Zustand provides minimal, unopinionated local state (e.g., mic mute, audio volume meters) without Redux boilerplate; Vite provides instantaneous HMR.
- **Negative**: Web Audio API requires careful memory management to prevent audio node leaks.

---

## ADR-004: Background Worker Architecture — Taskiq Framework & Decoupled Broker Selection

### Status: Accepted (Supersedes previous ARQ selection)
### Context
In our initial design, ARQ was selected as the asynchronous task queue. However, ARQ has officially transitioned to **maintenance-only status** by its maintainer. We re-evaluated modern distributed task queue alternatives for Python `asyncio`. Furthermore, we must strictly decouple background task scheduling from database outbox polling, separate worker execution from HTTP request contexts, and formalize broker selection.

### Candidate Comparison Matrix

| Evaluation Criterion | Taskiq | SAQ | Celery | Procrastinate (PostgreSQL) |
| :--- | :--- | :--- | :--- | :--- |
| **Active Maintenance & Community** | **High** (Active releases, vibrant ecosystem) | Moderate (Small, stable, but niche) | High (Legacy enterprise standard) | Moderate (Active, niche) |
| **Native `asyncio` Architecture** | **High** (Async-first from ground up) | High (Async-first) | Poor (Sync-first; thread/billiard fork heritage) | High (Async-first) |
| **FastAPI Dependency Injection** | **First-class** (`taskiq-fastapi` shares DI) | None (Manual wiring required) | None (Manual wiring required) | None |
| **Broker Flexibility** | **High** (Redis, RabbitMQ, PostgreSQL) | Redis only | Redis, RabbitMQ, SQS | PostgreSQL only |
| **Operational Overhead** | **Low** (Lightweight coroutine workers) | Low | High (Heavy dependencies & billiard) | Lowest (No Redis needed) |

### Decision
1. **Taskiq as Worker Framework**: We select **Taskiq** (`taskiq`) for asynchronous background execution.
2. **Broker Selection Decoupled**:
   - **Primary MVP Broker**: Redis (`taskiq-redis`) is selected for low-latency task handoff and minimal dispatch overhead during MVP development.
   - **Evaluated Alternative (PostgreSQL Broker)**: Taskiq natively supports database brokers (`taskiq-pg`). If operational policy demands eliminating Redis infrastructure in single-node or low-cost deployments, switching to a PostgreSQL broker is an isolated configuration decision that requires zero changes to task signatures.
3. **Architectural Separation of OutboxPoller from TaskiqScheduler**:
   - `TaskiqScheduler` is strictly for cron-like time-based schedules (e.g. daily metric rollups).
   - The custom **PostgreSQL OutboxPoller** is an independent, event-driven polling coroutine/service that reads `outbox_events` and dispatches messages to the Taskiq broker. It is completely separate from Taskiq's scheduler.
4. **No Assumption of FastAPI Request Context**:
   - Worker processes run in decoupled execution contexts. Workers **must never assume the original FastAPI HTTP request, request headers, client IP, or request-scoped dependencies are available**.
   - `taskiq-fastapi` shares application-level state (engine connection pool, global config), but tasks must be fully self-contained.
5. **Explicit Task Inputs & Worker-Managed Resource Lifecycles**:
   - Tasks must accept strictly primitive, serializable parameters (`session_id: str`, `idempotency_key: str`, `correlation_id: str`).
   - The worker task explicitly manages its own resource lifecycle: opening its own `AsyncSession` from the session factory, instantiating required LLM clients, and executing clean teardown within `finally` blocks.

### Consequences
- **Positive**: Actively maintained async-native framework; tasks can share app-level dependencies via `taskiq-fastapi`; pluggable broker design allows switching from Redis to PostgreSQL broker without rewriting tasks; clean resource isolation prevents dangling connections.
- **Negative**: Requires explicit task argument serialization and manual database session management inside worker coroutines.

---

## ADR-005: State Durability & Transactional Outbox Pattern

### Status: Accepted
### Context
We must store active session state, turn transcripts, evaluation scores, and queue background evaluation tasks. A critical failure mode in distributed architectures is the **Dual-Write Problem**: committing state to PostgreSQL and then calling an external message broker. If the process crashes or the network blips between the DB commit and broker enqueue, the background job is lost forever.

### Decision
1. **PostgreSQL 16 is the sole authoritative source of truth**. Every candidate turn, blueprint, rubric score, and claim verification must be committed to PostgreSQL before advancing the interview state.
2. **At-Least-Once Delivery, Not Exactly-Once Execution**:
   - The Transactional Outbox pattern guarantees **At-Least-Once Delivery** of events to the message broker.
   - It **does not guarantee exactly-once execution**. Network retries, broker retransmissions, or worker crashes mean a task may be delivered multiple times. Exactly-once semantics must be enforced via durable consumer idempotency in PostgreSQL.
3. **Atomic Outbox Insertion**:
   - State mutations that trigger background jobs (e.g. `interview.completed` $\rightarrow$ `evaluate_interview`) write an event record to `outbox_events` **inside the exact same ACID database transaction** as the state change.
4. **Short-Lived Row Leases (No Open Transactions During Broker I/O)**:
   - The OutboxPoller queries unhandled rows using short-lived row claims/leases:
     ```sql
     SELECT id, payload FROM outbox_events 
     WHERE (status = 'PENDING') OR (status = 'CLAIMED' AND claim_expires_at < NOW())
     ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT :batch_size;
     ```
   - It marks rows `status = 'CLAIMED'`, `claimed_by = :worker_id`, `claimed_at = NOW()`, `claim_expires_at = NOW() + INTERVAL '30 seconds'`, and **COMMITS THE DATABASE TRANSACTION IMMEDIATELY**.
   - **Critical Invariant**: Database transactions and row locks are **never held open during broker network calls**.
5. **Definition of Successful Broker Publication**:
   - Publication is considered successful **only when the broker driver explicitly acknowledges receipt** (e.g. Redis `LPUSH`/`XADD` command returns an acknowledged integer, or AMQP broker returns `Basic.Ack`).
   - Only after receiving explicit broker acknowledgment does the poller open a new short transaction to set `status = 'PUBLISHED'` and `published_at = NOW()`.
   - If the broker call times out, fails, or raises an exception, the status remains `CLAIMED` until lease expiration allows reclamation.
6. **Durable Worker Idempotency via PostgreSQL**:
   - Worker idempotency **must not rely on Redis alone** (Redis is ephemeral and vulnerable to key eviction or restart).
   - Idempotency is enforced durably in PostgreSQL via a dedicated `worker_executions` record table and database unique constraints (`UNIQUE (session_id, version)` on `assessment_reports`).
7. **Redis 7 as Ephemeral Accelerator**:
   - Redis 7 is strictly an **ephemeral operational accelerator** for active WebSocket heartbeat tracking, single-use tickets, and task routing buffers.

### Consequences
- **Positive**: Zero lost jobs across broker or server crashes; elimination of dual-write inconsistencies; no lock contention on PostgreSQL during slow broker calls; durable idempotency survives Redis restarts.
- **Negative**: Poller adds a small polling delay (500 ms) and requires a reconciliation sweeper for stale leases.

---

## ADR-006: AI Abstraction Strategy — Native Provider Abstractions over LangChain/LangGraph

### Status: Accepted
### Context
Many AI projects adopt LangChain or LangGraph. However, these libraries suffer from rapid deprecation cycles, leaky abstractions, difficult debugging, performance overhead, and opaque prompt formatting.

### Decision
CareerDiff will **not** use LangChain, LangGraph, CrewAI, or similar heavy agent frameworks. We implement clean, native provider interfaces using **vanilla Python, Pydantic v2 schemas, and official provider SDKs** (or direct HTTP clients).

### Consequences
- **Positive**: 100% control over prompt engineering, transparent latency and token tracking, effortless debugging, zero dependency lock-in, zero framework bloat.
- **Negative**: We write lightweight internal wrapper classes (~150 LOC per provider) for LLM, STT, and TTS services.

---

## ADR-007: Evidence Grounding — Normalized Relational Evidence Model over String Arrays

### Status: Accepted
### Context
Initially, competency scores stored evidence as a simple string array (`verbatim_quotes TEXT[]`) directly on the `competency_scores` table. This model failed to track source turn references, transcript character offsets, evidence categorization, or assessment impact.

### Decision
We adopt a **Normalized Evidence Model** centered around a dedicated `evaluation_evidence` relation:
- Every piece of evidence references a specific `interview_turns(id)` and `competency_scores(id)`.
- It records exact `start_char_offset` and `end_char_offset` in the source transcript (Unicode codepoint indexing).
- It categorizes evidence by `evidence_type` (`POSITIVE_MASTERY`, `KNOWLEDGE_GAP`, etc.) and `assessment_impact` (`UPWEIGHT`, `DOWNWEIGHT`, etc.).
- Structural integrity is enforced via database FKs and offset check constraints; exact substring matching is enforced via Pydantic semantic validation at the application layer.

### Consequences
- **Positive**: Granular auditability, support for multi-turn evidence synthesis, transparent UI highlighting of transcript excerpts.
- **Negative**: Requires joining `evaluation_evidence` when fetching report dossiers.

---

## ADR-008: Audio Streaming Protocol — WebSocket Audio Streaming over WebRTC

### Status: Accepted
### Context
We evaluated WebSocket audio streaming vs WebRTC for real-time bidirectional audio streaming between candidate browser and server.

### Trade-off Comparison
- **WebRTC**: Peer-to-peer optimized, UDP-based, excellent for 2-way human calls with jitter buffers. However, terminating WebRTC on a server requires complex media servers (Janus, Mediasoup), ICE/STUN/TURN infrastructure, and complicates feeding raw PCM audio into cloud STT/VAD engines.
- **WebSocket (WSS) Audio Streaming**: TCP-based, reliable delivery, universally supported across all modern browsers and proxies, trivial to terminate in FastAPI, straightforward to inspect and test.

### Decision
We select **WebSocket Audio Streaming with Binary Linear PCM Frames (16kHz 16-bit Mono)** in both directions for the Phase 5 voice implementation. WebRTC is documented as a possible future transport if network benchmarking reveals unacceptable TCP jitter under lossy network conditions.

### Consequences
- **Positive**: Drastically simpler operational footprint; zero STUN/TURN server requirements; seamless integration with Silero VAD and streaming STT APIs; lower architectural complexity.
- **Negative**: TCP retransmission could theoretically introduce slight jitter on severely lossy networks (mitigated by our text fallback mode).

---

## ADR-009: AI Provider Evaluation Criteria & Configurable Model Selection

### Status: Accepted
### Context
Hardcoding specific model names into core application logic creates brittle dependencies and prevents benchmarking emerging models.

### Decision
We decouple model identifiers from application logic. The engine interacts with an abstract `LLMProviderProtocol`. Providers and models are evaluated and selected based on 8 standardized criteria:
1. **Structured output support**: Native JSON schema enforcement.
2. **Technical reasoning quality**: Systems design and trade-off evaluation.
3. **Latency**: TTFT (Time to First Token) and completion speed.
4. **Cost**: Input and output token pricing.
5. **Reliability & SLA**: Uptime and regional availability.
6. **Rate limits**: TPM and RPM concurrency headroom.
7. **Data handling & privacy**: Contractual guarantee of zero training on candidate data.
8. **SDK maturity**: Native Python `asyncio` support.

### Failover Privacy Restriction
When primary provider failure occurs, fallback is **only permitted to secondary providers that meet the exact same enterprise data protection level** (zero training on customer prompts, zero prompt retention). If no compliant provider is reachable, the engine falls back to deterministic rule-based dialogue.

---

## ADR-010: Adaptive Interview Policy — Three-Tier Control Architecture

### Status: Accepted
### Context
Treating parameters like 70% coverage, 3 probes, and 3-minute wrap-up as universal constants prevents customizing interviews for different roles, durations, or seniority levels.

### Decision
We structure interview control into a **Three-Tier Architecture**:
1. **Deterministic Constraints (Hard Invariants)**: Session hard stop, atomic turn persistence, closed 9-action space, non-penalizing `INSUFFICIENT_EVIDENCE`.
2. **Configurable Session Policy (`InterviewPolicy`)**: Minimum coverage ratios, max probes per topic, conclusion buffers, topic budgets, and competency weights.
3. **Probabilistic LLM Recommendations**: Semantic answer evaluation and question phrasing.

---

## ADR-011: Outbox Event Reliability, Durable Idempotency & Concurrent Evaluation Safety

### Status: Accepted
### Context
Background workers evaluate completed interviews and generate reports. In the event of transient broker disconnects, network partitions, worker crashes, or concurrent executions, tasks must not be lost, executed multiple times in an uncoordinated manner, or corrupt report version history.

### Decision
1. **At-Least-Once Delivery via Outbox Leases**:
   - The outbox explicitly provides **At-Least-Once Delivery**, never exactly-once execution.
   - The `outbox_events` table enforces state transitions: `PENDING` $\rightarrow$ `CLAIMED` $\rightarrow$ `PUBLISHED` $\rightarrow$ `FAILED` / `DEAD_LETTER`.
   - Polling workers claim rows by setting `status = 'CLAIMED'`, `claimed_by = :worker_id`, `claimed_at = NOW()`, and `claim_expires_at = NOW() + INTERVAL '30 seconds'`, then immediately committing the database transaction before calling the broker.
2. **Definition of Successful Broker Publication**:
   - A row transitions to `PUBLISHED` **only after the broker driver returns an explicit acknowledgment** (e.g. Redis integer queue length returned, AMQP ACK).
   - If broker enqueue fails or times out, the claim is NOT marked `PUBLISHED`. It remains `CLAIMED` until lease expiration allows another worker to reclaim it.
3. **Durable Worker Idempotency via PostgreSQL**:
   - Workers **do not rely on Redis for idempotency**. Idempotency is enforced durably in PostgreSQL via a dedicated `worker_executions` table with a unique constraint on `(task_name, idempotency_key)`.
   - On task execution, the worker attempts an atomic insert into `worker_executions` with `status = 'RUNNING'`. If an entry already exists with `status = 'SUCCESS'`, the worker skips redundant execution immediately.
4. **Recovery & Reconciliation for Published but Unfinished Evaluations**:
   - A periodic **Reconciliation Sweeper Job** (running every 2 minutes) queries for:
     - Outbox events stuck in `CLAIMED` where `NOW() > claim_expires_at` (resets to `PENDING`).
     - Published evaluation events where `assessment_reports` has not been created and `worker_executions` has been `RUNNING` for longer than the maximum execution window (10 minutes).
     - The sweeper re-enqueues the evaluation task with an incremented attempt count, routing to `DEAD_LETTER` if max attempts (5) are exceeded.
5. **Safe Report Version Creation Under Concurrent Execution**:
   - To make report versioning safe when multiple workers execute concurrently for the same session:
     - The evaluation worker wraps report insertion inside a PostgreSQL transaction and acquires an exclusive row-level lock on the parent session: `SELECT id FROM interview_sessions WHERE id = :session_id FOR UPDATE` (or `pg_advisory_xact_lock(hashtext('report:' || session_id::text))`).
     - It computes the next version deterministically: `SELECT COALESCE(MAX(version), 0) + 1 FROM assessment_reports WHERE session_id = :session_id`.
     - It flips prior active versions: `UPDATE assessment_reports SET is_latest = FALSE WHERE session_id = :session_id AND is_latest = TRUE`.
     - A database unique constraint on `(session_id, version)` and a partial unique index on `(session_id) WHERE is_latest = TRUE` structurally prevent duplicate or conflicting versions.

### Consequences
- **Positive**: Complete fault tolerance against broker, poller, and worker crashes; guarantees single durable report version even under concurrent worker executions; zero reliance on ephemeral Redis state for mission-critical idempotency.
- **Negative**: Requires maintaining the `worker_executions` table and executing a lightweight periodic sweeper job.

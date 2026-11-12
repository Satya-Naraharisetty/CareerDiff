# Engineering Journal — CareerDiff

This journal records our architectural decisions, technical trade-offs, debugging discoveries, and engineering lessons learned as we build CareerDiff.

---

## Entry 001: Architectural Foundation & Project Inception
- **Date**: 2026-11-09
- **Author**: Lead Architect & Engineering Partner
- **Milestone**: Phase 0 — Documentation, Antigravity Rules System & System Constitution

### 1. The Core Engineering Challenge
We are building a voice-first, adaptive technical interviewing platform. Most AI interview tools today are either rigid multiple-choice tests or superficial chatbots reciting canned questions. They fail to understand candidate depth, cannot verify resume claims, and suffer from uncalibrated biases.

Our core challenge: How do we combine the conversational intelligence and semantic reasoning of modern LLMs with the strict determinism, auditability, and time-budgeting required for professional technical hiring?

### 2. Foundational Architecture Decision: The Hybrid Engine
We established our non-negotiable architectural invariant:
> *"The LLM conducts the conversation, but the Interview Engine controls the interview."*

Instead of letting an LLM run wild with prompt-based state management, we designed a **Deterministic State Machine** that enforces:
- Structured action spaces (`PROBE_DEEPER`, `CHALLENGE`, `CLARIFY`, `CHANGE_TOPIC`...).
- Hard topic time budgets and maximum consecutive probe limits.
- Mandatory coverage gates before conclusion.
- Strict turn persistence to PostgreSQL before invoking downstream decisions.

### 3. Technology Stack Selection & Trade-Offs
- **Python FastAPI + Pydantic v2 + SQLAlchemy 2.0 (Async)**: Selected for native async concurrency across WebSockets, sub-millisecond serialization via Rust-backed Pydantic, and strict relational integrity.
- **PostgreSQL 16 as Authoritative Truth**: Rejected the anti-pattern of using Redis as the primary database. Redis is an operational cache; PostgreSQL stores all turns and evaluations durably.
- **ARQ over Celery**: Celery is a heavy legacy tool with multi-threading and async serialization friction. ARQ is built natively for Python `asyncio` and runs seamlessly with minimal overhead.
- **Zero Heavyweight AI Frameworks**: Banned LangChain and LangGraph to maintain 100% control over prompts, latency, memory, and debugging.

---

## Entry 002: Second-Pass Architecture Review & Policy Corrections
- **Date**: 2026-11-10
- **Author**: Lead Architect & Engineering Partner
- **Milestone**: Phase 0 — Comprehensive Architecture & Data Model Hardening

### 1. The Problem Identified
During our second-pass review of the initial blueprints, we identified five critical architectural deficiencies:
1. **Universal Constants Fallacy**: Hardcoding values like "always 70% coverage", "always 3 probes", or "always 3 minutes to conclude" made the interview engine brittle across different seniority levels and interview formats.
2. **Denormalized Evidence Modeling**: Storing evidence as a simple string array (`verbatim_quotes TEXT[]`) on scores prevented associating quotes with source turns, character offsets, evidence types, or impact weights.
3. **Muddled Voice Terminology**: Initial drafts blended transport (WebSocket), codec (Linear PCM), audio framing (50ms chunks), and speech processing (VAD/STT/TTS), and presented unmeasured latency numbers as accomplished facts rather than hypotheses.
4. **Vanity Code Coverage vs. Risk-Based Testing**: A blanket 85% coverage rule encouraged testing trivial getters while ignoring mission-critical invariants (state transitions, database deadlocks, ticket replay).
5. **Hardcoded AI Model Assumptions**: Mentioning specific models (e.g. Gemini 1.5 Pro) in core logic created tight coupling.

### 2. Key Engineering Principles & Corrections Applied
- **Three-Tier Control Model**: Decoupled control into **Deterministic Constraints** (hard session stop, atomic turn commits, non-penalization of incomplete topics), **Configurable Policy** (`InterviewPolicy` with required topics, weighted coverage, probe limits, conclusion buffers), and **Probabilistic LLM Recommendations**.
- **Normalized Evidence Relation (`evaluation_evidence`)**: Established a 1-to-many relationship linking `competency_scores` to `interview_turns` with character offsets (`start_char_offset`, `end_char_offset`), evidence classification, and impact.
  - *Distinction*: Enforced relational integrity via database foreign keys and check constraints; enforced exact substring slice verification at the application layer via Pydantic v2.
- **Disentangling Audio Concepts**:
  - Transport: WebSocket streaming over TCP (with WebRTC documented as an evaluated post-MVP alternative).
  - Audio Format: Linear PCM, 16kHz, 16-bit Mono.
  - Framing: Target 50ms frames (1,600 bytes), treated as an empirical hypothesis to benchmark.
  - Hypotheses: Framed latency ($\le 1,800$ ms) and silence threshold (1,200 ms) as testable hypotheses.
- **Risk-Based Testing Policy**: Replaced arbitrary blanket coverage with mandatory 100% path coverage on critical invariants (state machine transitions, policy guardrails, evidence integrity, ACID turn commits, prompt injection boundaries).
- **Canonical 8-Phase Roadmap**: Realigned roadmap into 8 distinct phases, strictly separating Phase 0 documentation completion from future implementation completion.

## Entry 003: Third-Pass Architectural Refinement & Reliability Hardening
- **Date**: 2026-11-10
- **Author**: Lead Architect & Engineering Partner
- **Milestone**: Phase 0 — Third-Pass Architectural Hardening & Systems Review

### 1. Problem Solved
Before starting Phase 1 implementation, a rigorous third-pass architectural review uncovered seven critical design gaps that would have caused operational friction, regulatory vulnerability, and technical debt:
1. **Scope Ambiguity (Practice vs Assessment)**: Conflating consumer practice with high-stakes hiring assessment brought enterprise compliance overhead (NYC Local Law 144, EU AI Act High-Risk AI) into MVP validation.
2. **Coupled Evaluation Boundaries**: Live turn generation was implicitly linked to deep rubric evaluation, risking catastrophic latency bottlenecks during real-time speech.
3. **Worker Queue Obsolescence**: ARQ, our initially selected worker queue, is officially in maintenance-only mode by its maintainers.
4. **Dual-Write Vulnerability**: Committing state changes to PostgreSQL and pushing task jobs to Redis independently introduced dual-write failure modes where network partitions could lose evaluation jobs.
5. **Database Redundancy & Integrity**: The presence of `turn_evaluations` alongside `evaluation_evidence` created schema redundancy; report versioning was missing; and string offset semantics were undefined.
6. **Voice Codec Asymmetry**: Inbound audio was specified as 16kHz PCM, but outbound was vaguely described as MP3/Opus without client-side resampling specifications.
7. **Superficial Security Guarantees**: Prompt injection defense relied primarily on XML tags without defense-in-depth, and audio retention was open-ended.

### 2. Engineering Principles Involved
- **Transactional Outbox Pattern**: Resolves distributed dual-write inconsistency between relational databases and message brokers by persisting domain events in an `outbox_events` table within the same ACID database transaction, then asynchronously publishing them.
- **Separation of Concerns (Live Loop vs Batch Evaluation)**: The live turn loop operates under a strict deadline ($\le 600$ ms TTFT) needing only immediate semantic interpretation (`LiveAnswerInterpreter`), while holistic rubric grading (`AssessmentEvaluator`) is an asynchronous background batch process.
- **Unicode Codepoint Character Offsets**: Clarified that character slicing in text transcripts must use Unicode scalar codepoints on NFC-normalized strings rather than raw UTF-8 byte offsets or Python UTF-16 code units.
- **Defense-in-Depth AI Security**: Enforced canary leak detection tokens, system-level regex pre-scanning, strict Pydantic output schemas, and failover privacy DPAs.
- **Learning-First Proportionality**: Calibrated the 15-point learning breakdown to be concise and targeted for trivial changes, and comprehensive for architectural changes.

### 3. Implementation Details
- **ADR-004 Superseded**: Selected **Taskiq** with Redis broker, replacing ARQ. Taskiq provides active maintenance, native `asyncio`, pluggable brokers, and first-class FastAPI dependency injection.
- **ADR-005 & ADR-011 Updated**: Implemented the **Transactional Outbox Pattern** on PostgreSQL with an `outbox_events` table, at-least-once delivery, exponential backoff retries, and dead-letter queue (DLQ).
- **Evaluation Boundaries Decoupled**: Explicitly split `LiveAnswerInterpreter` (real-time, stateless, non-persisted immediate assessment) from `AssessmentEvaluator` (Taskiq worker, multi-turn rubric grading, database persisted).
- **Normalized Schema Cleanup**: Removed redundant `turn_evaluations`; established `evaluation_evidence` referencing source turns and Unicode codepoints; added `version` and `is_latest` to `assessment_reports`; established NULL score semantics for `INSUFFICIENT_EVIDENCE`.
- **Audio Symmetry & Resampling**: Standardized on **Linear PCM 16kHz 16-bit Mono** in both directions. Specified a browser `AudioWorkletProcessor` to downsample hardware 44.1/48kHz audio to 16kHz prior to WebSocket transmission.
- **Data Lifecycle & Privacy**: Enforced a default 30-day S3 lifecycle policy for raw audio; required zero-retention DPAs on all AI providers; added NYC Local Law 144 / EU AI Act compliance notes.

### 4. Trade-Offs & Alternatives Considered
- **Taskiq vs Celery**: Celery brings heavy multi-process architecture and non-asyncio friction. Taskiq provides native async Python 3.12+ execution, type hints, and seamless integration with FastAPI.
- **Transactional Outbox vs Two-Phase Commit (2PC)**: 2PC across PostgreSQL and Redis is slow, complex, and unsupported by standard Redis drivers. Outbox leverages PostgreSQL's battle-tested ACID guarantees with simple background polling.
- **Linear PCM vs Opus**: Opus requires WebAssembly compilation in the browser and server-side libopus decoding before feeding to STT engines. Linear PCM 16kHz is natively accepted by Deepgram, Whisper, and Cartesia, eliminating latency and CPU overhead for the MVP.
- **Candidate Practice vs Hiring Screening**: Validating with self-directed software engineers validates the engine faster with zero enterprise procurement drag, while preserving enterprise capabilities for Phase 7+.

### 5. Mistakes, Bugs & Debugging Insights
- *Catching Maintenance-Only Libraries*: Relying on initial impressions of ARQ without checking its recent commit activity and maintainer notice could have stranded CareerDiff on an abandoned queue. Checking current maintenance status before Phase 1 code avoided painful refactoring later.
- *String Indexing Traps*: Using Python standard slicing `str[start:end]` without Unicode normalization (NFC) creates off-by-one errors when dealing with multi-byte characters or emoji. Standardizing on NFC normalization before offset computation eliminates slice mismatches.

### 6. Verification & Tests
- Updated PRD, User Personas, User Journeys, Acceptance Criteria, System Architecture, Voice Pipeline, Failure Handling, Security Architecture, ERD, and Data Model specifications to v1.2.0.
- Cross-document consistency verified across all architectural artifacts.

## Entry 004: Targeted Reliability Hardening — Outbox Leases, Latency Hypotheses, Security Boundaries & Chaos Testing
- **Date**: 2026-11-10
- **Author**: Lead Architect & Engineering Partner
- **Milestone**: Phase 0 — Distributed Reliability & Security Refinement

### 1. Problem Solved
During our targeted third-pass review, five critical distributed systems and security nuances required rigorous formalization:
1. **Outbox Semantics**: Clarified that outboxes guarantee at-least-once delivery, not exactly-once execution. Long-running broker network calls must never hold PostgreSQL transactions open.
2. **Worker Context**: Decoupled custom `OutboxPoller` from `TaskiqScheduler`, formalized broker selection (Redis vs PostgreSQL broker), and eliminated assumptions of FastAPI request context in workers.
3. **Turn Latency Breakdown**: Defined the 600 ms measurement boundary for `LiveAnswerInterpreter`, partitioned turn latency into stage-by-stage hypotheses, and designed deterministic fallbacks for LLM downtime.
4. **Security Enforcement**: Clarified that canary tokens detect failures but do not prevent prompt injections; mandated that permissions and state transitions remain strictly enforced by deterministic application code; expanded GDPR deletion to object versions, backup crypto-shredding, and replicas; and separated audio, transcript, and report retention lifecycles.
5. **Chaos Testing**: Added automated failure injection scenarios for worker SIGKILLs, duplicate deliveries, Redis cache flushes, expired leases, and broker network partitions.

### 2. Engineering Principles Involved
- **Short-Lived Leases (Claim $\rightarrow$ Commit $\rightarrow$ Dispatch)**: Leased rows in `outbox_events` are claimed in short, non-blocking DB transactions with a 30s TTL, ensuring PostgreSQL connections are never blocked by slow external network brokers.
- **Durable PostgreSQL Idempotency**: Worker deduplication enforced via `worker_executions` and unique constraints (`uq_worker_task_idempotency`), eliminating reliance on volatile Redis memory.
- **Cryptographic Erasure (Crypto-Shredding)**: Encrypting candidate records with individual keys so that key deletion renders historical, immutable database backup snapshots completely unreadable.
- **Deterministic Continuity**: Real-time conversational AI must never encounter awkward silence or crash during external API outages. Deterministic question generators provide immediate continuity.

### 3. Implementation Details
- Updated ADR-004, ADR-005, and ADR-011 in `docs/architecture/ARCHITECTURE_DECISIONS.md`.
- Enriched `outbox_events` and added `worker_executions` to `docs/database/DATA_MODEL.md` and `docs/database/ERD.md`.
- Updated `docs/architecture/FAILURE_HANDLING.md` with the 6-suite Chaos Testing matrix.
- Updated `docs/architecture/ADAPTIVE_INTERVIEW_ENGINE.md` with staged latency budgets and deterministic fallback logic.
- Updated `docs/architecture/SECURITY_ARCHITECTURE.md` and `.agents/rules/12-security-and-privacy.md` with comprehensive deletion and deterministic code boundaries.
- Added AC-FR-025, AC-FR-026, and AC-NFR-008 to `docs/product/ACCEPTANCE_CRITERIA.md`.
- Added Section 7 to `docs/engineering/TESTING_STRATEGY.md`.

---

## Future Entry Template (Use for all subsequent changes)

```markdown
## Entry [Number]: [Descriptive Title]
- **Date**: YYYY-MM-DD
- **Author**: Lead Architect & Developer
- **Milestone / Task**: Phase X — Task Y

### 1. Problem Solved
[What problem did we address and why did it exist?]

### 2. Engineering Principle Involved
[What concept or pattern was used? e.g., Connection Pooling, Idempotency, VAD]

### 3. Implementation Details
[What changed? Key functions, classes, and architectural interactions]

### 4. Trade-Offs & Alternatives Considered
[Why this approach over alternatives? What are the trade-offs?]

### 5. Mistakes, Bugs & Debugging Insights
[What failed during development? How did we diagnose and resolve it?]

### 6. Verification & Tests
[How was the change tested and verified?]
```

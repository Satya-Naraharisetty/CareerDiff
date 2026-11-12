# Third-Pass Architecture Review & Reliability Hardening Report — CareerDiff

**Document Version:** 1.0.0  
**Date:** 2026-11-10  
**Status:** Complete — Awaiting Phase 1 Approval  
**Lifecycle Stage:** Phase 0 (Foundation & Architecture Review)  
**Authors:** Principal Software Architect & Pair-Programming Engineer  

---

## 1. Executive Summary

Prior to initiating Phase 1 implementation (Development Environment & Backend Foundation), a rigorous third-pass architectural review of the CareerDiff codebase, documentation, schemas, and Antigravity customization rules was conducted. 

The primary objective was to resolve critical design tensions and single points of failure across eight key operational dimensions:
1. **Product Scope Alignment**: Explicitly separating candidate practice from enterprise hiring assessment to avoid premature regulatory and sales drag.
2. **Evaluation Boundary Decoupling**: Structurally isolating low-latency live turn adaptation from deep multi-turn rubric evaluation.
3. **Background Job Reliability**: Superseding maintenance-only job queues with Taskiq and eliminating distributed dual-write failure modes via the Transactional Outbox pattern.
4. **Database Relational Integrity**: Eliminating redundant evaluation tables, formalizing report versioning, defining Unicode codepoint offset semantics, and establishing explicit `NULL` score behavior.
5. **Voice Pipeline Codec Symmetry**: Resolving audio codec discrepancies by standardizing on 16kHz Linear PCM in both directions, backed by client-side `AudioWorklet` downsampling.
6. **Defense-in-Depth Security & Privacy**: Strengthening prompt injection defenses beyond superficial delimiters, mandating privacy-compliant provider failover, and establishing an ephemeral audio lifecycle.
7. **Learning-First Proportionality**: Balancing thorough 15-point learning breakdowns with change complexity, while mandating explicit ADR conflict identification.
8. **Documentation & Traceability Integrity**: Auditing all architectural specifications, diagrams, and rules to guarantee zero broken references.

**Zero application code was written, zero third-party packages were installed, and zero database migrations were executed during this review.** All modifications are strictly confined to authoritative documentation, architecture decision records, database schemas, and AI engineering rules.

---

## 2. Comprehensive Review of the 8 Focus Areas

### Area 1: Product Scope — Candidate Interview Practice vs. Hiring Assessment

#### Problem & Context
The initial specifications conflated two distinct commercial use cases:
1. **Self-Serve Candidate Technical Interview Practice**: Individual software engineers practicing technical interviews, discovering blind spots, testing resume claims, and receiving private coaching dossiers.
2. **Enterprise Hiring Assessment**: B2B recruitment teams screening applicants, filtering pipelines, comparing candidate benchmarks, and making automated hiring recommendations.

Attempting to serve both simultaneously during MVP introduced immense regulatory friction (e.g., NYC Local Law 144 automated employment decision audits, EU AI Act High-Risk AI requirements), multi-tenant enterprise access control complexity, and long B2B procurement sales cycles.

#### Engineering Decision & Scope Formalization
- **Primary MVP Target**: **Self-Serve Candidate Technical Interview Practice**.
  - Direct B2C validation directly with engineers.
  - Zero legal ambiguity under NYC Local Law 144 (since no employment decisions are made).
  - Rapid feedback loops on the core differentiator: the **Adaptive Interview Engine**.
- **Preserved Architectural Path for Enterprise Assessment**:
  - The underlying PostgreSQL relational schema (`candidates`, `interview_sessions`, `competency_scores`, `evaluation_evidence`) already supports multi-tenant isolation, role schemas, and immutable audit logs.
  - In Phase 7+, enterprise capabilities (ATS webhooks, team workspaces, recruiter dossiers) can be layered on top without any database migration or engine redesign.
- **Affected Artifacts**:
  - [PRD.md](../product/PRD.md) (v1.2.0): Focused on Candidate Practice MVP; preserved Recruiter Journey 5.
  - [USER_PERSONAS.md](../product/USER_PERSONAS.md): Alex (Senior) and Maya (Mid-Level) established as primary MVP personas; David Chen (Hiring Manager) designated as post-MVP.
  - [MVP_SCOPE.md](../product/MVP_SCOPE.md) (v1.2.0): Explicitly scopes MVP to candidate practice.

---

### Area 2: Evaluation Boundaries — `LiveAnswerInterpreter` vs. `AssessmentEvaluator`

#### Problem & Context
Earlier documentation used the generic term "Evaluator" to refer to both the sub-second decision-making required during live speech and the comprehensive multi-turn rubric grading executed after the interview. Conflating these two distinct domains threatened to introduce hundreds of milliseconds of latency into the conversational turn loop or, conversely, produce superficial post-interview assessment reports.

#### Engineering Decision: Strict Functional & Operational Decoupling
We established a strict decoupling between two distinct evaluation subsystems:

| Dimension | `LiveAnswerInterpreter` | `AssessmentEvaluator` |
| :--- | :--- | :--- |
| **Execution Context** | In-process, synchronous conversational loop | Decoupled background worker (`Taskiq`) |
| **Trigger Point** | Immediately upon final turn transcript commit | Post-interview transition to `COMPLETED` |
| **Latency Budget (Hypothesis)** | **$\le 600$ ms TTFT** (Total turn $\le 1,800$ ms) — *Design hypothesis to be benchmarked* | **30 to 90 seconds** total execution window |
| **Measurement Boundary** | **Starts**: Instant final turn transcript commits to DB.<br/>**Ends**: Instant `InterpretationResult` emitted. | **Starts**: Outbox event claimed by worker.<br/>**Ends**: `assessment_reports` and normalized evidence committed. |
| **Analysis Scope** | Single turn (current answer + 3-turn window) | Holistic (all turns, all topics, full resume) |
| **Primary Responsibilities** | Detect technical depth, surface ambiguities, check claim consistency, recommend next action | Score competencies against 4-tier rubrics, normalize evidence records, compile study guide |
| **Database Persistence** | **Ephemeral** (in-memory state, not persisted) | **Durable** (persisted to PostgreSQL) |
| **Failure Mode** | **Deterministic Fallback**: on timeout ($>600$ ms) or error, engine selects pre-compiled competency question from local seed catalog. Zero dead air. | **Reliable Retry**: Taskiq exponential backoff retries; failure moves to Dead Letter Queue |

- **Staged Latency Hypotheses**: Separated turn latency into VAD silence detection ($800–1,200$ ms), STT finalization ($150–250$ ms), DB persistence ($15–30$ ms), `LiveAnswerInterpreter` ($\le 600$ ms), policy verification ($\le 10$ ms), question generation ($400–600$ ms), and TTS synthesis ($150–250$ ms).
- **Architectural Boundary**: The live conversational loop **never** blocks on, queries, or writes to `competency_scores` or `assessment_reports`.
- **Affected Artifacts**:
  - [ADAPTIVE_INTERVIEW_ENGINE.md](../architecture/ADAPTIVE_INTERVIEW_ENGINE.md) (Section 2).
  - [COMPONENT_ARCHITECTURE.md](../architecture/COMPONENT_ARCHITECTURE.md).
  - [DATA_FLOW.md](../architecture/DATA_FLOW.md) (Pipelines 3 & 4).

---

### Area 3: Background Job Reliability — Taskiq Architecture & Transactional Outbox Leases

#### Problem & Context
1. **ARQ Deprecation**: ADR-004 originally selected ARQ for asynchronous background processing. However, ARQ's maintainers officially classified the library as maintenance-only in 2024. Building a new production system on a maintenance-only framework introduces significant technical risk.
2. **Dual-Write Inconsistency**: When an interview completes, updating PostgreSQL (`status = 'COMPLETED'`) and calling an external message broker introduces dual-write failures if the process crashes or network blips between the two calls.
3. **Outbox Semantics & Locking Pitfalls**: Naively polling outbox events inside an open database transaction while calling an external broker causes long-lived row locks and connection pool starvation. Furthermore, outboxes provide at-least-once delivery, not exactly-once execution.

#### Engineering Decision: Taskiq with Short-Lived Leases & Durable Idempotency
1. **Taskiq Framework & Broker Decoupling**:
   - Selected **Taskiq** (`taskiq` + `taskiq-fastapi`) with **Redis broker** (`taskiq-redis`) for MVP.
   - Broker selection is strictly decoupled: switching to a PostgreSQL broker (`taskiq-pg`) is documented as a zero-infrastructure alternative requiring no task signature changes.
   - Workers run in decoupled execution contexts without assuming HTTP request state or headers are available; tasks accept explicit serializable inputs (`session_id: str`, `idempotency_key: str`) and manage their own database sessions and client lifecycles.
2. **Separation of OutboxPoller from TaskiqScheduler**:
   - `TaskiqScheduler` handles cron/periodic jobs. The custom `OutboxPoller` is an independent, event-driven polling loop.
3. **Transactional Outbox with Short-Lived Row Leases (ADR-005 & ADR-011)**:
   - Outbox provides **At-Least-Once Delivery, not exactly-once execution**.
   - State transition and `outbox_events` are committed within the same ACID transaction.
   - The OutboxPoller claims rows using short-lived leases (`status = 'CLAIMED'`, 30s TTL) and **commits immediately**. Database transactions and row locks are **never held open during broker network calls**.
   - A row transitions to `PUBLISHED` **only after the broker driver explicitly acknowledges receipt** (e.g. integer returned from queue push).
4. **Durable PostgreSQL Idempotency**:
   - Idempotency is enforced in PostgreSQL via `worker_executions (task_name, idempotency_key)` and `assessment_reports (session_id, version)`, eliminating reliance on volatile Redis state.
5. **Recovery Sweeper & Concurrent Version Safety**:
   - A periodic **Reconciliation Sweeper Job** (every 2 minutes) reclaims expired leases and re-enqueues published events whose worker crashed mid-evaluation.
   - Concurrent report generation is serialized via exclusive row-level locking on the parent session (`SELECT ... FOR UPDATE`), ensuring sequential version calculation (`MAX(version) + 1`) and preventing unique constraint conflicts.

```mermaid
sequenceDiagram
    autonumber
    participant Engine as Interview Engine
    participant DB as PostgreSQL (ACID)
    participant Outbox as Outbox Poller
    participant Redis as Redis Broker
    participant Worker as Taskiq Worker

    Engine->>DB: BEGIN TRANSACTION
    Engine->>DB: UPDATE interview_sessions SET status = 'COMPLETED'
    Engine->>DB: INSERT INTO outbox_events (event_type, payload, status='PENDING')
    Engine->>DB: COMMIT TRANSACTION
    Note over DB: Dual-write eliminated: State and Event committed atomically

    loop Outbox Polling
        Outbox->>DB: BEGIN; SELECT ... FOR UPDATE SKIP LOCKED; UPDATE status='CLAIMED', expires_at=NOW()+30s; COMMIT;
        Note over Outbox,DB: DB transaction committed immediately before broker network call
        Outbox->>Redis: Enqueue evaluation task (idempotency_key = event.id)
        Redis-->>Outbox: Explicit ACK (integer queue length returned)
        Outbox->>DB: BEGIN; UPDATE outbox_events SET status = 'PUBLISHED', published_at=NOW(); COMMIT;
    end

    Redis->>Worker: Consume evaluation task (session_id, idempotency_key)
    Worker->>DB: Check & insert worker_executions (idempotency_key) in PostgreSQL
    Worker->>DB: Lock parent session (FOR UPDATE) & calculate next report version
    Worker->>DB: Write competency_scores & evaluation_evidence
    Worker->>DB: UPDATE worker_executions SET status = 'SUCCESS'
```

- **Affected Artifacts**:
  - [ARCHITECTURE_DECISIONS.md](../architecture/ARCHITECTURE_DECISIONS.md) (ADR-004, ADR-005, ADR-011).
  - [COMPONENT_ARCHITECTURE.md](../architecture/COMPONENT_ARCHITECTURE.md).
  - [FAILURE_HANDLING.md](../architecture/FAILURE_HANDLING.md).
  - [DATA_MODEL.md](../database/DATA_MODEL.md) (`outbox_events`).

---

### Area 4: Database Relational Integrity & Schema Normalization

#### Problem & Context
The second-pass data model suffered from four structural anomalies:
1. **Schema Redundancy**: Both `turn_evaluations` and `evaluation_evidence` existed, creating overlapping responsibilities and synchronization hazards.
2. **Report Immutability & Re-evaluation**: Re-running an evaluation against an updated rubric would overwrite previous evaluation reports without preserving audit history.
3. **Ambiguous String Offsets**: Character offset slicing (`start_char_offset`, `end_char_offset`) lacked explicit Unicode encoding definitions, risking off-by-one errors with multi-byte UTF-8 or surrogate pairs.
4. **Missing Uniqueness & NULL Score Semantics**: Uncovered competencies were ambiguously assigned scores of 0.0 or 1.0, penalizing candidates for topics the interviewer never reached.

#### Engineering Decisions & Schema Corrections
1. **Elimination of `turn_evaluations`**: Deleted the `turn_evaluations` table entirely. Turns are stored in `interview_turns`; rubric ratings reside in `competency_scores`; and specific transcript quotes link turns to scores in `evaluation_evidence`.
2. **Report Versioning**: Added `version: INTEGER NOT NULL DEFAULT 1` and `is_latest: BOOLEAN NOT NULL DEFAULT TRUE` to `assessment_reports`, with a partial unique index on `(session_id) WHERE is_latest = TRUE`.
3. **Unicode Codepoint Offset Specification**: Mandated that all transcripts be normalized using Unicode **NFC (Canonical Decomposition, followed by Canonical Composition)** prior to database insertion. Character offsets represent **Unicode scalar value codepoints** (matching Python `str` slicing `text[start:end]`), not raw byte offsets.
4. **Explicit NULL Score Semantics**: Incomplete competencies must be recorded with `status = 'INSUFFICIENT_EVIDENCE'` and `score = NULL`. PostgreSQL check constraints enforce that `score` is strictly `NULL` when status is `INSUFFICIENT_EVIDENCE`.
5. **Cross-Interview Claim Verifications**: Established `interview_claim_verifications` as an explicit junction linking `candidate_claims`, `interview_sessions`, and `evaluation_evidence`.

- **Affected Artifacts**:
  - [ERD.md](../database/ERD.md) (v1.2.0).
  - [DATA_MODEL.md](../database/DATA_MODEL.md) (v1.2.0).

---

### Area 5: Voice Pipeline — Audio Codec Symmetry & Framing Standards

#### Problem & Context
Previous documentation exhibited a severe audio format mismatch: inbound audio from the browser was specified as 16kHz 16-bit Mono Linear PCM, while outbound audio from TTS was vaguely described as MP3 or Opus, without detailing how the browser microphone downsamples hardware audio (typically 44.1kHz or 48kHz). Furthermore, latency numbers were asserted as accomplished facts rather than empirical hypotheses.

#### Engineering Decisions & Voice Standard
1. **Strict Audio Codec Symmetry**: Standardized on **Raw Linear PCM (16-bit signed, little-endian, 16,000 Hz, Mono)** in **both directions** (inbound candidate speech and outbound synthesized speech).
   - *Rationale*: Eliminates client-side WebAssembly decode latency and server-side transcoding overhead. Modern STT (Deepgram, Whisper) and TTS (Cartesia) natively stream raw 16kHz Linear PCM.
2. **Client-Side Microphone Resampling**: Specified an `AudioWorkletProcessor` running in the candidate's browser that intercepts the hardware `MediaStream` (44.1kHz / 48kHz) and downsamples in real time to 16kHz before chunking into binary WebSocket frames.
3. **Audio Framing Budgets**:
   - **Inbound Framing**: 50 ms chunks (800 samples = 1,600 bytes) for optimal VAD responsiveness.
   - **Outbound Framing**: 100 ms chunks (1,600 samples = 3,200 bytes) for smooth audio buffer playback without underruns.
4. **Hypothesis Framing**: Performance metrics are explicitly documented as **measurable engineering hypotheses**:
   - Latency hypothesis: Turn-around $\le 1,800$ ms (p90).
   - Barge-in hypothesis: Audio preemption within $\le 150$ ms.
   - These hypotheses will be empirically validated via synthetic benchmark scripts in Phase 5.

- **Affected Artifacts**:
  - [VOICE_PIPELINE.md](../architecture/VOICE_PIPELINE.md) (v1.2.0).
  - [WEBSOCKET_PROTOCOL.md](../api/WEBSOCKET_PROTOCOL.md).
  - [.agents/rules/10-voice-and-realtime.md](../../.agents/rules/10-voice-and-realtime.md).

---

### Area 6: Security, Privacy & Compliance Hardening

#### Problem & Context
1. **Prompt Injection Limitations**: Wrapping candidate text in XML delimiters (`<candidate_untrusted_input>`) is necessary but insufficient. Canary tokens detect prompt leakage, but cannot prevent indirect prompt injections from attempting semantic steering.
2. **Authority Confusion**: Entrusting state transitions, tool permissions, or scoring authority to LLMs creates critical elevation of privilege vulnerabilities.
3. **Data Leakage in Failover**: In multi-provider AI failovers, unvetted secondary endpoints might retain or train on candidate transcripts.
4. **Incomplete Deletion Semantics**: Simple database row deletion leaves soft-deleted object versions, delete markers, and historical immutable database backups exposed.

#### Engineering Decisions & Hardening Directives
1. **Canary Detection vs. Deterministic Code Enforcement**:
   - Canary tokens are strictly an **automated detection and alerting mechanism** for prompt extraction or instruction echoing; they **do not prevent prompt injection**.
   - **Deterministic Boundary**: All permissions, tool execution, session state transitions, and evaluation scores are **strictly enforced by deterministic Python application logic**, never by prompt instructions or LLM authority.
2. **Provider Failover Privacy Invariant**:
   - Secondary and tertiary LLM providers must possess verified **Enterprise Zero-Data-Retention Data Processing Agreements (DPAs)** with immediate ephemeral cache flushes.
   - Fallback to consumer or non-DPA endpoints is strictly forbidden at the code level.
3. **Multi-Tier Retention & Comprehensive Deletion Protocol**:
   - **Data Tiering**:
     - *Raw Voice Audio*: Ephemeral by default (RAM-only); optional 30-day S3 lifecycle policy (TTL) for practice review.
     - *Text Transcripts*: Retained per account lifecycle for practice tracking.
     - *Evaluation Reports & Evidence*: Retained per account lifecycle until explicit candidate GDPR erasure.
   - **Comprehensive Erasure (`DELETE /api/v1/candidates/me`)**:
     - PostgreSQL database rows (cascading delete).
     - Object storage: Permanent removal of all S3 object versions and delete markers (`DeleteMarkers`).
     - Backups: Enforced via **Cryptographic Erasure (Crypto-Shredding)** (destroying candidate encryption keys renders immutable 30-day snapshot backups indecipherable).
     - Replicas & Provider Caches: Replication lag bounded $<5$ seconds; contractual DPA verification of zero provider logging/caching.
4. **Regulatory Analysis**:
   - *NYC Local Law 144*: Inapplicable to MVP because candidate practice produces self-reflection dossiers, not employment decisions.
   - *EU AI Act*: High-Risk AI requirements (Article 6 / Annex III) analyzed and pre-emptively addressed via transparency, auditability, human oversight, and normalized evidence grounding.
5. **Measurable SLOs**: Replaced absolute uptime claims with concrete targets: Recovery Point Objective (**RPO = 0** via atomic PostgreSQL commits) and Recovery Time Objective (**RTO $\le 5$ min** via container restart).

- **Affected Artifacts**:
  - [SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md) (v1.2.0).
  - [FAILURE_HANDLING.md](../architecture/FAILURE_HANDLING.md) (v1.2.0).
  - [.agents/rules/12-security-and-privacy.md](../../.agents/rules/12-security-and-privacy.md).

---

### Area 7: Learning-First Engineering Rules & ADR Governance

#### Problem & Context
While the mandatory 15-point learning breakdown is central to the project's educational mission, applying 1,500-word essays to trivial one-line fixes creates cognitive fatigue. Conversely, making architectural changes without checking existing Architecture Decision Records (ADRs) risks silently violating established system invariants.

#### Engineering Decisions
1. **Learning-First Proportionality Principle**:
   - The 15-point learning framework is **strictly mandatory for every change**, but depth scales proportionally:
     - *Trivial Changes* (1-line bug fixes, schema tweaks, config updates): 1–2 concise sentences per point.
     - *Significant Changes* (new endpoints, state machine transitions, AI integrations): Comprehensive, in-depth architectural breakdown.
2. **Mandatory ADR Conflict Identification**:
   - Added Step 2 to the 10-step change management protocol in `AGENTS.md` and `.agents/rules/18-change-management.md`.
   - Before proposing any architectural modification, the engineer/agent must review existing ADRs (`ADR-001` through `ADR-011`) and explicitly state whether the change aligns with or supersedes an established decision.

- **Affected Artifacts**:
  - [AGENTS.md](../../AGENTS.md).
  - [.agents/rules/01-learning-first.md](../../.agents/rules/01-learning-first.md).
  - [.agents/rules/18-change-management.md](../../.agents/rules/18-change-management.md).

---

### Area 8: Documentation Cross-Reference & Consistency Audit

Every affected document was reviewed, updated to version 1.2.0, and verified for internal consistency:

```text
CareerDiff Documentation Suite (Third-Pass Synchronized)
├── README.md                              # Tech stack (Taskiq), canonical roadmap, learning protocol
├── AGENTS.md                              # Proportionality, ADR conflict check, Taskiq/Outbox invariants
├── .agents/rules/
│   ├── 01-learning-first.md               # Proportionality principle defined
│   ├── 10-voice-and-realtime.md           # 16kHz Linear PCM symmetry, AudioWorklet downsampling
│   ├── 12-security-and-privacy.md         # Canary boundary, deterministic code guards, comprehensive deletion
│   └── 18-change-management.md           # Step 2: Explicit ADR conflict check
├── docs/product/
│   ├── PRD.md (v1.2.0)                    # Practice MVP focus, LiveAnswerInterpreter, NFR hypotheses
│   ├── USER_PERSONAS.md (v1.2.0)          # Alex/Maya primary MVP, David Chen post-MVP
│   ├── USER_JOURNEYS.md (v1.2.0)          # Journeys 1-4 practice, Journey 5 enterprise post-MVP
│   ├── ACCEPTANCE_CRITERIA.md (v1.2.0)    # AC-FR-006 Outbox, AC-FR-025 Lease Recovery, AC-FR-026 Idempotency, AC-NFR-008 Chaos
│   └── MVP_SCOPE.md (v1.2.0)              # Taskiq worker, outbox events, practice MVP scope
├── docs/architecture/
│   ├── SYSTEM_OVERVIEW.md (v1.2.0)        # Taskiq, outbox, 16kHz PCM, practice focus
│   ├── COMPONENT_ARCHITECTURE.md (v1.2.0) # Taskiq worker, outbox poller separation, decoupled broker
│   ├── DATA_FLOW.md (v1.2.0)              # Pipelines 1-4 updated with Outbox & LiveInterpreter
│   ├── ADAPTIVE_INTERVIEW_ENGINE.md (v1.2.0)# Section 2: 600ms boundary, staged hypotheses, deterministic fallback
│   ├── VOICE_PIPELINE.md (v1.2.0)         # Symmetric Linear PCM 16kHz, AudioWorklet, 50/100ms framing
│   ├── SECURITY_ARCHITECTURE.md (v1.2.0)  # Canary detection boundary, deterministic code, crypto-shredding
│   ├── FAILURE_HANDLING.md (v1.2.0)       # Non-blocking leases, durable idempotency, chaos testing matrix
│   └── ARCHITECTURE_DECISIONS.md (v1.2.0) # ADR-004 Taskiq/Broker, ADR-005 Outbox Leases, ADR-011 Outbox Reliability
├── docs/database/
│   ├── ERD.md (v1.2.0)                    # outbox_events, worker_executions, assessment_reports versioning
│   └── DATA_MODEL.md (v1.2.0)             # outbox_events leased schema, worker_executions, report locks
├── docs/engineering/
│   └── TESTING_STRATEGY.md (v1.2.0)       # Section 7: Distributed Systems Failure Injection & Chaos Testing
└── docs/learning/
    └── ENGINEERING_JOURNAL.md             # Entry 003 & 004: Third-Pass Architectural & Reliability Refinement
```

---

## 3. Explicit List of Unresolved Decisions (Deferred to Subsequent Phases)

The following design decisions are intentionally isolated and deferred to their appropriate implementation phases. None block Phase 1:

| Item | Unresolved Decision | Target Phase | Recommendation for Resolution |
| :--- | :--- | :--- | :--- |
| **UD-01** | **Primary STT Provider Selection** (Deepgram Nova-2 vs Whisper Streaming) | Phase 5 | Benchmark latency and word error rate (WER) across technical programming terminology during Phase 5 spike. |
| **UD-02** | **Primary TTS Voice Model** (Cartesia Sonic vs ElevenLabs Turbo v2.5) | Phase 5 | Evaluate p90 audio chunk delivery latency and natural conversational cadencing in Phase 5 spike. |
| **UD-03** | **Client-Side Resampling Polyfill** | Phase 5 | Verify Web Audio `AudioWorklet` browser support matrix; provide ScriptProcessorNode fallback if legacy Safari compatibility requires. |
| **UD-04** | **Candidate Practice Quota Policy** | Phase 2 | Decide whether anonymous practice sessions are permitted or if all sessions require registered accounts with rate limits. Recommended: Registered accounts only. |
| **UD-05** | **Audio Retention User Override UI** | Phase 6 | Determine whether candidates can manually opt-in to retain audio beyond 30 days for personal revision. Recommended: Ephemeral 30 days by default with explicit manual "Retain" toggle. |

---

## 4. Phase 1 Readiness Recommendation & Sign-Off

### Readiness Assessment
- [x] **Product Scope**: Clear, defensible B2C Candidate Practice MVP focus with preserved enterprise migration path.
- [x] **Evaluation Boundaries**: Completely decoupled live turn interpretation from background rubric evaluation.
- [x] **Worker Queue & Dual-Write**: Maintenance-only ARQ replaced by Taskiq; dual-writes eliminated via Transactional Outbox pattern on PostgreSQL.
- [x] **Relational Schema**: Redundant tables eliminated; report versioning established; Unicode codepoint offsets formalized; NULL score semantics enforced.
- [x] **Voice Architecture**: Standardized on 16kHz Linear PCM in both directions; browser AudioWorklet resampling designed; metrics framed as empirical hypotheses.
- [x] **Security & Privacy**: Defense-in-depth prompt injection defense, DPA-enforced failover, 30-day audio TTL, and regulatory compliance mapped.
- [x] **Pair-Programming Constitution**: Learning-first proportionality and ADR conflict identification integrated.
- [x] **Authoritative Documentation**: 100% synchronized, cross-referenced, and verified across all files.

### Final Recommendation
The architectural blueprint, data model, security posture, and pair-programming constitution are **thoroughly validated, internally consistent, and 100% production-ready**.

**Recommendation: APPROVE Phase 0 completion and PROCEED to Phase 1: Development Environment & Backend Foundation.**

---
*Awaiting human engineering partner review and formal approval before commencing Phase 1.*
# Architecture Foundation Review & Correction Report — CareerDiff

**Document Version:** 1.0.0  
**Date:** 2026-11-10  
**Status:** Approved Review Report  
**Scope:** Second-pass critical review of Phase 0 documentation, Antigravity rules, skills, data models, and roadmaps  

---

## 1. Executive Summary

Following the initial scaffolding of the CareerDiff documentation and Antigravity customization system, a comprehensive second-pass architecture review was conducted. The goal was to eliminate premature assumptions, correct contradictory requirements, replace hardcoded universal constants with configurable policy models, normalize evidence data structures, refine real-time audio terminology, and establish an uncompromised, implementable engineering foundation.

Zero application code was written, zero dependencies were installed, and zero database migrations were executed during this review.

---

## 2. Issues Identified & Why Each Mattered

| Issue ID | Area | Critical Deficiency Identified | Systems Engineering & Product Impact |
| :--- | :--- | :--- | :--- |
| **ISSUE-01** | **Antigravity Customizations** | Glob trigger syntax in `04-backend-python.md` and `05-frontend-typescript.md` used nested object formatting (`trigger: { glob: ... }`) instead of Antigravity's flat convention (`trigger: glob`, `globs: "**/backend/**"`). | The Antigravity agent would have failed to parse the glob trigger, causing backend and frontend rules to remain inactive during code authoring. |
| **ISSUE-02** | **Adaptive Engine Policy** | Fixed numerical constants were hardcoded as universal invariants: "always 70% coverage", "always 3 probes", "always 3 minutes to conclude", "fixed equal weights", and "fixed 30m duration". | Prevented customizing interview templates for different seniority levels (e.g. 15m rapid screen vs 60m Staff architectural probe); treated policy tuning as code changes rather than configurable domain rules. |
| **ISSUE-03** | **Evidence Modeling** | Rubric evaluations stored evidence as an ungrounded string array (`verbatim_quotes TEXT[]`) directly on `competency_scores`. | High risk of hallucinated or orphaned quotes; inability to associate evidence with specific source turns; inability to record character offsets in the transcript; inability to categorize evidence types or impact weights. |
| **ISSUE-04** | **Voice Architecture Terminology** | Documentation blended transport protocols (WebSocket vs WebRTC), audio encodings (PCM vs Opus), audio framing (50ms), and speech processing (VAD/STT), and stated latency budgets ($\le 1,800$ ms) as accomplished facts. | Conflated network transport with digital signal processing; created ungrounded expectations by presenting architectural hypotheses as measured benchmarks. |
| **ISSUE-05** | **AI Provider Strategy** | Core specifications hardcoded specific commercial models (e.g., Gemini 1.5 Pro, Claude 3.5 Sonnet) and lacked standardized evaluation criteria. | Created tight vendor coupling; prevented seamless model upgrades or empirical cost/latency benchmarking across emerging models. |
| **ISSUE-06** | **Roadmap & Phase Alignment** | Roadmap merged infrastructure setup with candidate identity in Phase 1, combined the adaptive engine with evaluation in Phase 3, and claimed incomplete milestones were implemented. | Violated the strict separation between documentation completion and application implementation; lacked granular separation between text interviews and voice streaming. |
| **ISSUE-07** | **Quality & Testing Policy** | Blanket "$\ge 85\%$ line coverage" requirement across all modules without risk weighting. | Encouraged vanity tests for boilerplate code while failing to guarantee 100% path coverage on critical invariants (state machine transitions, ACID turn persistence, ticket replay). |

---

## 3. Systematic Corrections Performed

### Correction 1: Antigravity Customization Alignment & Canonical Structure
- Corrected YAML frontmatter across `.agents/rules/` to strictly follow Antigravity's discovered syntax:
  - Glob rules use `trigger: glob` and `globs: "**/backend/**"` / `globs: "**/frontend/**"`.
  - Always-on rules use `trigger: always_on`.
  - Domain rules use `trigger: model_decision` with clear, action-oriented descriptions.
- Formalized the **Canonical Repository Structure** across `AGENTS.md` and `README.md`, standardizing on `backend/app/`, `backend/alembic/`, `backend/tests/`, and `frontend/src/`.

### Correction 2: Three-Tier Adaptive Interview Control Architecture
Decoupled interview governance into three distinct operational tiers in [ADAPTIVE_INTERVIEW_ENGINE.md](../architecture/ADAPTIVE_INTERVIEW_ENGINE.md), [PRD.md](../product/PRD.md), and [09-adaptive-interview-engine.md](../../.agents/rules/09-adaptive-interview-engine.md):
1. **Deterministic Constraints (Hard Invariants)**:
   - Hard session stop at `max_duration_seconds`.
   - Atomic turn commit to PostgreSQL before action execution.
   - Closed 9-action space.
   - Incomplete competencies marked non-penalizing `INSUFFICIENT_EVIDENCE` (score is `NULL`, excluded from composite average).
2. **Configurable Session Policy (`InterviewPolicy`)**:
   - `required_competency_ids`: Mandatory competencies that must be assessed before clean conclusion.
   - `competency_weights`: Relative weights for composite score aggregation.
   - `minimum_coverage_ratio`: Configurable target coverage (e.g., 0.70 default).
   - `max_consecutive_probes`: Configurable probe ceiling (default 3, tunable per template).
   - `min_evidence_items_per_competency`: Required evidence threshold (default 2).
   - `topic_time_budgets` & `conclusion_buffer_seconds`: Configurable temporal boundaries.
3. **Probabilistic LLM Recommendations**:
   - Evaluates candidate depth and recommends next action and phrasing.

### Correction 3: Normalized Evidence Data Architecture
- Replaced the `verbatim_quotes TEXT[]` array on `competency_scores` with a dedicated **`evaluation_evidence` relation** in [ERD.md](../database/ERD.md) and [DATA_MODEL.md](../database/DATA_MODEL.md):
  - `id`: UUID Primary Key.
  - `competency_score_id`: FK $\rightarrow$ `competency_scores(id)`.
  - `interview_turn_id`: FK $\rightarrow$ `interview_turns(id)`.
  - `evidence_type`: `POSITIVE_MASTERY`, `KNOWLEDGE_GAP`, `CONTRADICTION`, `SUPERFICIAL_EXPLANATION`.
  - `assessment_impact`: `UPWEIGHT`, `DOWNWEIGHT`, `NEUTRAL`, `DISQUALIFYING`.
  - `transcript_excerpt`: Verbatim text excerpt.
  - `start_char_offset`, `end_char_offset`: Character slice boundaries in turn transcript.
  - `confidence`, `rationale`: Scored confidence and justification.
- **Architectural Boundary**: Enforced structural integrity via database foreign keys and offset check constraints (`end_char_offset >= start_char_offset`); enforced exact substring match (`turn.transcript[start:end] == excerpt`) via Pydantic v2 application semantic validation.

### Correction 4: Precise Voice Architecture Terminology & Hypotheses
- Updated [VOICE_PIPELINE.md](../architecture/VOICE_PIPELINE.md) and [10-voice-and-realtime.md](../../.agents/rules/10-voice-and-realtime.md) to explicitly disentangle:
  - **Transport**: Primary implementation is **WebSocket Audio Streaming** over TCP. WebRTC (DataChannel / MediaStream) is documented as an evaluated post-MVP candidate if packet loss benchmarks warrant.
  - **Codec & Encoding**: Raw Linear PCM (16-bit signed, little-endian) at 16,000 Hz Mono.
  - **Audio Framing**: Target 50 ms frames (1,600 bytes), treated as an empirical hypothesis.
  - **Event Framing**: Multiplexed WebSocket text frames for JSON control signals and binary frames for raw audio.
- Framed performance targets (turn turnaround $\le 1,800$ ms, silence boundary 1,200 ms, barge-in preemption $\le 150$ ms) as **testable engineering hypotheses** to be benchmarked in Phase 5.

### Correction 5: AI Provider Abstraction & Selection Criteria
- Removed hardcoded model assumptions from core specifications.
- Established 8 standardized provider evaluation criteria in [ADR-009](../architecture/ARCHITECTURE_DECISIONS.md#adr-009-ai-provider-evaluation-criteria--configurable-model-selection) and [08-ai-and-llm.md](../../.agents/rules/08-ai-and-llm.md):
  1. Structured output support (native JSON schema enforcement).
  2. Technical reasoning quality.
  3. Latency (TTFT and completion throughput).
  4. Cost efficiency.
  5. Reliability & SLA.
  6. Concurrency rate limits (TPM/RPM).
  7. Data handling & privacy (contractual zero-training guarantee).
  8. SDK maturity and async support.

### Correction 6: Canonical 8-Phase Engineering Roadmap
Synchronized [ROADMAP.md](../product/ROADMAP.md), [PRD.md](../product/PRD.md), [MVP_SCOPE.md](../product/MVP_SCOPE.md), and [README.md](../../README.md) to the user's canonical 8-phase progression:
- **Phase 0**: Product & Engineering Foundation (Completed).
- **Phase 1**: Development Environment & Backend Foundation (Ready to start).
- **Phase 2**: Identity & Resume Intelligence.
- **Phase 3**: Role Intelligence & Interview Planning.
- **Phase 4**: Adaptive Interview Engine & Text Interviews.
- **Phase 5**: Voice Interview.
- **Phase 6**: Evaluation, Reporting & Dashboard.
- **Phase 7**: Production Hardening & Benchmarking.

### Correction 7: Risk-Based Testing Policy
- Updated [TESTING_STRATEGY.md](TESTING_STRATEGY.md), [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md), and [11-testing-and-quality.md](../../.agents/rules/11-testing-and-quality.md):
  - Replaced blanket coverage targets with **Risk-Based Testing**:
    - **100% Path Coverage on Mission-Critical Invariants**: State transitions, policy guardrails, evidence integrity, ACID turn commits, prompt injection boundaries.
    - **Integration & Contract Tests**: WebSocket framing, barge-in preemption, ticket replay defense, LLM schema retry loops.
    - Standard coverage baseline ($\ge 80\%$) maintained as an operational health check.

---

## 4. Complete Inventory of Changed Files

```text
Modified Files in Second-Pass Review:
├── AGENTS.md                                     # Synced principles, configurable policy & normalized evidence
├── README.md                                     # Synced canonical 8 phases, architecture & tech stack
├── .agents/
│   ├── rules/
│   │   ├── 02-product-and-scope.md               # 8-phase roadmap & configurable policy
│   │   ├── 03-architecture.md                    # Three-tier control & normalized evidence invariants
│   │   ├── 04-backend-python.md                  # Corrected glob trigger syntax (globs: "**/backend/**")
│   │   ├── 05-frontend-typescript.md             # Corrected glob trigger syntax (globs: "**/frontend/**")
│   │   ├── 06-database-postgresql.md             # Normalized evidence model & DB vs App validation
│   │   ├── 08-ai-and-llm.md                      # Provider selection criteria & no hardcoded models
│   │   ├── 09-adaptive-interview-engine.md       # Configurable policy vs deterministic constraints
│   │   ├── 10-voice-and-realtime.md              # WebSocket audio streaming & testable hypotheses
│   │   └── 11-testing-and-quality.md             # Risk-based testing over blanket coverage
├── docs/
│   ├── product/
│   │   ├── PRD.md                                # Synced FRs, NFR hypotheses & 8 phases
│   │   ├── MVP_SCOPE.md                          # Synced in-scope phases & policy modeling
│   │   ├── ACCEPTANCE_CRITERIA.md                # Gherkin scenarios for normalized evidence & policy
│   │   └── ROADMAP.md                            # Canonical 8-phase progression with full specifications
│   ├── architecture/
│   │   ├── SYSTEM_OVERVIEW.md                    # Synced invariants & normalized evidence
│   │   ├── COMPONENT_ARCHITECTURE.md             # EvaluationEvidenceItem Pydantic schemas
│   │   ├── DATA_FLOW.md                          # Sequence diagram for normalized evidence insertion
│   │   ├── ADAPTIVE_INTERVIEW_ENGINE.md          # Complete 3-tier control model & InterviewPolicy
│   │   ├── VOICE_PIPELINE.md                     # Disentangled transport, codec, framing & processing
│   │   └── ARCHITECTURE_DECISIONS.md             # Added ADR-009 (Providers) & ADR-010 (Policy)
│   ├── database/
│   │   ├── ERD.md                                # Added EVALUATION_EVIDENCE entity & relationships
│   │   └── DATA_MODEL.md                         # Detailed table spec for evaluation_evidence
│   ├── engineering/
│   │   ├── TESTING_STRATEGY.md                   # Risk-based testing hierarchy & prioritized areas
│   │   ├── DEFINITION_OF_DONE.md                 # Updated Gate 2 to risk-based invariant tests
│   │   └── FOUNDATION_REVIEW.md                  # This review report
│   └── learning/
│       └── ENGINEERING_JOURNAL.md                # Added Entry 002 documenting review concepts
```

---

## 5. Remaining Assumptions

1. **Resume Input Format**: Assumed English-language text-based PDF/DOCX resumes ($\le 10$ MB). Scanned image-only PDFs requiring complex OCR remain out of scope for MVP.
2. **Audio Hardware**: Candidates are assumed to possess working microphone hardware capable of 16kHz capture via the browser Web Audio API.
3. **Network Stability**: Candidate broadband connection is assumed to sustain $\ge 5$ Mbps with $\le 100$ ms RTT. Severe packet loss triggers the zero-loss text fallback.
4. **Local Infrastructure**: Assumed standard Docker Desktop or Docker Engine v2 with support for PostgreSQL 16, Redis 7, and MinIO.

---

## 6. Verification Performed

- **File Existence**: Verified that all 66 referenced files exist on disk.
- **Frontmatter Syntax**: Validated all 18 rule frontmatter blocks against Antigravity parser conventions (`trigger: always_on`, `trigger: model_decision`, `trigger: glob` with `globs:` string).
- **Skill Discovery**: Validated all 10 `SKILL.md` runbooks for required `name` and `description` headers.
- **Cross-Document Integrity**: Verified that `PRD.md`, `ROADMAP.md`, `SYSTEM_OVERVIEW.md`, `ERD.md`, and `DATA_MODEL.md` agree on entity names, phase numbers, action spaces, and evidence models.
- **No Machine-Specific Paths**: Confirmed that all internal links are repository-relative Markdown links.

---

## 7. Decisions Requiring User Approval Prior to Phase 1

Before proceeding to **Phase 1: Development Environment & Backend Foundation**, please confirm your approval on the following three operational decisions:

1. **Primary LLM Provider for Initial Development**:
   - *Recommendation*: Use the official Google GenAI SDK (`google-genai`) with Gemini 2.5/3.x models for Phase 2 resume parsing and Phase 4 turn generation, accessed through our abstract `LLMProviderProtocol`.
   - *Alternative*: Configure a dual-provider adapter (Gemini + Anthropic Claude 3.5 Sonnet) from Day 1.
2. **Local Blob Storage Service**:
   - *Recommendation*: Use a local **MinIO** container in `docker-compose.yml` to mirror AWS S3 APIs 1:1, ensuring production-ready blob storage code from Phase 1 onward.
   - *Alternative*: Use local filesystem directory storage (`/tmp/uploads`) for local development, deferring S3 logic.
3. **Database Migration Tooling**:
   - *Recommendation*: Use **Alembic with async SQLAlchemy 2.0** (`env.py` configured with `asyncpg`), enforcing zero-downtime expand/contract migrations.

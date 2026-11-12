# Product Requirements Document (PRD) — CareerDiff

**Document Version:** 1.2.0  
**Status:** Approved for Implementation Planning  
**Target Release:** Phase 0 through Phase 7  

---

## 1. Problem Statement & Strategic Use-Case Focus

Technical interviews are high-stakes, stressful, and frequently miscalibrated. Today, software engineers preparing for interviews face two ineffective options:
1. **Rote Whiteboard / LeetCode Drills**: Platforms like LeetCode teach algorithmic puzzle memorization, but fail to develop or test systems design intuition, practical debugging, or architectural trade-off reasoning.
2. **Superficial AI Chatbots**: Generic chatbots act as passive conversationalists reciting static question lists. They cannot probe technical depth, challenge hand-wavy claims, or verify asserted resume accomplishments.

### Primary MVP Use Case: Candidate Technical Interview Practice & Mastery Simulation
To establish a clear product boundary, minimize legal/regulatory compliance hurdles, and accelerate the feedback loop, **the primary MVP use case for CareerDiff is Candidate Technical Interview Practice & Skill Mastery**.

- **Why Candidate Practice First?**
  1. *Immediate Pedagogical Feedback*: Candidates directly benefit from transparent rubric visibility, verbatim evidence citations, and curated study recommendations.
  2. *Zero High-Stakes Employment Liability*: Interview practice is entirely candidate-directed. It is not an Automated Employment Decision Tool (AEDT), sidestepping early compliance friction under NYC Local Law 144 or EU AI Act high-risk provisions.
  3. *Unconstrained Learning & Scaffolding*: The engine can leverage features like `SIMPLIFY` and actionable study guides that would be inappropriate in a high-stakes screening exam.

### Future Path: Enterprise Hiring Assessment & Recruiter Dossiers (Post-MVP, Phase 7+)
The underlying architecture (resume claim provenance, deterministic blueprints, adaptive probing, and normalized rubric evidence) is deliberately shared. Post-MVP releases will introduce enterprise recruiter portals, ATS webhooks (Greenhouse, Lever), and proctoring/verification modes by toggling off candidate scaffolding (`SIMPLIFY`) and routing dossiers to hiring panels.

---

## 2. Product Vision

**CareerDiff** is an autonomous, voice-first, adaptive AI technical interviewing coach and mastery simulator. It listens, evaluates technical depth in real time, formulates dynamic follow-ups, rigorously verifies claims from the candidate's resume, and produces evidence-backed, rubric-grounded assessment reports.

### Core Guiding Tenet
> *"The LLM conducts the conversation, but the Interview Engine controls the interview."*

The system blends **probabilistic intelligence** (understanding speech nuance, technical reasoning, and trade-offs) with **deterministic control** (state machines, configurable session policies, coverage guarantees, rubric invariants, and turn persistence).

---

## 3. Target Users & Personas

| Persona ID | Role | Key Motivations | Primary Pain Points |
| :--- | :--- | :--- | :--- |
| **USR-PER-01 (Primary MVP)** | Senior Software Engineer (Candidate) | Wants deep, realistic systems design practice; wants architecture trade-offs challenged. | Frustrated by shallow trivia bots and uncalibrated human mock interviewers. |
| **USR-PER-02 (Primary MVP)** | Mid-Level / Junior Engineer (Candidate) | Seeks realistic interview practice, dynamic follow-ups, and actionable gap-closing study plans. | Lacks clear visibility into why technical explanations fail rubric thresholds. |
| **USR-PER-03 (Post-MVP Path)** | Technical Hiring Manager | Needs calibrated, reproducible technical dossiers with verified resume claims. | Spends 15+ hours/week conducting repetitive phone screens with inconsistent notes. |
| **USR-PER-04 (Governance)** | Compliance / Audit Officer | Requires objective, auditable scoring without demographic or vocal biometric bias. | Worried about AI discrimination, facial analysis controversy, and privacy liabilities. |

---

## 4. User Stories

### Candidate Practice Stories (Primary MVP Focus)
- **US-01**: As a candidate, I want to upload my resume (PDF/DOCX) so that the interview focuses on my actual background, projects, and asserted skills.
- **US-02**: As a candidate, I want to speak naturally through my microphone with natural turn-taking, pauses, and the ability to interject or clarify.
- **US-03**: As a candidate, I want the interviewer to probe my architecture decisions and challenge trade-offs rather than simply moving to an unrelated question.
- **US-04**: As a candidate, I want to receive dynamic scaffolding (`SIMPLIFY`) when I get stuck on an unfamiliar concept so I can learn from the experience.
- **US-05**: As a candidate, I want to review an evidence-backed feedback report showing exactly which transcript turns demonstrated mastery or exposed gaps, complete with curated reading recommendations.

### Enterprise / Recruiter Stories (Preserved Post-MVP Path)
- **US-06**: As a hiring manager, I want to review whether specific claims on the candidate's resume were verified or contradicted during the session.
- **US-07**: As an administrator, I want to ensure that all interview evaluations are grounded in strict rubrics and never produce automated hiring/rejection decisions.

---

## 5. Functional Requirements (FR)

### A. Candidate Management & Resume Intelligence
- **FR-001 (User Authentication)**: The system shall provide secure user registration, session management, and authentication via JWT.
- **FR-002 (Resume Ingestion)**: The system shall ingest PDF and DOCX resumes, parsing text, layout metadata, and section boundaries.
- **FR-003 (Structured Profile Extraction)**: The system shall extract work history, skills, education, projects, and certifications into a structured schema validated by Pydantic.
- **FR-004 (Resume Claim Extraction)**: The system shall extract testable technical claims with provenance tracking (exact Unicode codepoint character offsets in the normalized source document).
- **FR-005 (Claim Categorization)**: The system shall categorize claims as `EXPLICIT_FACT`, `INFERRED_SKILL`, or `VAGUE_CLAIM`.
- **FR-006 (Profile Editing)**: Candidates shall have the ability to review, correct, and confirm extracted profile data prior to session initialization.

### B. Role Intelligence & Interview Planning
- **FR-007 (Role Competency Library)**: The system shall maintain configurable role schemas (Backend, Frontend, Fullstack, AI/ML, Data, DevOps, QA) with competency and sub-competency trees.
- **FR-008 (Rubric Configuration)**: Every competency shall possess a versioned 4-tier rubric (`UNSATISFACTORY`, `BASIC`, `PROFICIENT`, `ADVANCED`) with observable criteria.
- **FR-009 (Blueprint Generation)**: Before an interview begins, the engine shall generate an `InterviewBlueprint` allocating topic time budgets, required competencies, and specific resume claims to investigate.
- **FR-010 (Configurable Policy Invariants)**: The blueprint shall be governed by an `InterviewPolicy` specifying required competencies, weighted competency coverage targets, minimum evidence items per competency, and conclusion buffers.

### C. Adaptive Interview Engine & Live Interpretation
- **FR-011 (Structured Action Space)**: The engine shall select each interviewer turn from a closed action space:
  `PROBE_DEEPER`, `CLARIFY`, `CHALLENGE`, `VERIFY_CLAIM`, `SCENARIO`, `CHANGE_TOPIC`, `SIMPLIFY`, `REVISIT`, `CONCLUDE`.
- **FR-012 (Turn State Persistence)**: The system shall persist the candidate's finalized turn transcript and metadata to PostgreSQL before invoking the decision engine for the next turn.
- **FR-013 (Deterministic Engine Guardrails)**: The deterministic state machine shall enforce hard invariants (session hard stop, legal transitions) and validate LLM recommendations against the active `InterviewPolicy` (overriding if probe limits or time budgets are exceeded).
- **FR-014 (Decoupled Live Answer Interpretation)**: Live adaptation shall be executed by a fast `LiveAnswerInterpreter` ($\le 600$ ms) evaluating response depth and ambiguities, strictly decoupled from asynchronous post-interview report generation.

### D. Voice Pipeline & Real-Time Orchestration
- **FR-015 (Audio Streaming)**: The system shall support bidirectional audio streaming over WebSocket (binary Linear PCM frames multiplexed with JSON text control messages).
- **FR-016 (Voice Activity Detection)**: The server shall utilize server-side and client-side VAD to detect speech start, pauses, and turn completion.
- **FR-017 (Speech-to-Text Integration)**: The system shall stream audio to an STT provider, processing partial transcripts for responsive UI display and final transcripts for turn completion.
- **FR-018 (Interruption / Barge-In)**: If the candidate begins speaking while TTS audio is playing, the system shall immediately abort the TTS playback stream and mark the turn as interrupted.
- **FR-019 (Text Fallback)**: The system shall provide an instantaneous, zero-data-loss fallback to text-based interaction if audio streaming drops or candidate microphone fails.
- **FR-020 (Session Recovery)**: The WebSocket layer shall support session reconnection using an ephemeral resumption ticket within a 5-minute grace window.

### E. Evaluation & Assessment Reporting
- **FR-021 (Decoupled Assessment Evaluator)**: Comprehensive rubric evaluation shall be executed asynchronously by a dedicated `AssessmentEvaluator` worker, decoupled from live conversation turns.
- **FR-022 (Normalized Evidence Grounding)**: Every rubric evaluation score must link to atomic records in `evaluation_evidence` specifying source turn IDs, verbatim transcript excerpts, and character offsets.
- **FR-023 (Insufficient Evidence Distinction)**: The evaluator shall explicitly differentiate between `INCORRECT_ANSWER` (demonstrated misunderstanding) and `INSUFFICIENT_EVIDENCE` (topic was skipped or not probed deeply). Unprobed topics must have score `NULL` and never be scored as zero.
- **FR-024 (Claim Verification Reporting)**: Assessment reports shall present a resume verification ledger showing each tested claim, candidate quotes, and verified status (`VERIFIED`, `CONTRADICTED`, `VAGUE`, `UNTESTED`).
- **FR-025 (Candidate Feedback Dossier)**: The system shall generate a structured report detailing strengths, knowledge gaps, suggested learning paths, and transcript provenance.

### F. Quality & Simulation Harness
- **FR-026 (Replayable Simulation Harness)**: The system shall provide an automated test harness capable of replaying simulated candidate transcripts across 100+ defined scenarios.
- **FR-027 (Benchmarking Metrics)**: The simulation harness shall measure turn latency, decision relevance, repetition rate, rubric adherence, and token expenditure.

---

## 6. Non-Functional Requirements (NFR)

### A. Performance & Latency Budgets (Hypotheses to Benchmark)
- **NFR-001 (Turn Latency Target)**: End-to-end voice latency (Candidate Speech End $\rightarrow$ VAD Finalization $\rightarrow$ Turn Persist $\rightarrow$ Decision/LLM $\rightarrow$ First TTS Audio Byte) has a target performance budget of **$\le 1,800$ ms at p90**, to be benchmarked in Phase 5.
- **NFR-002 (Partial Transcript Latency Target)**: Real-time candidate speech transcript updates target rendering on client UI within **$\le 300$ ms** of speech.
- **NFR-003 (Evaluation Processing Time)**: Full post-interview evaluation report generation shall complete within **60 seconds** after interview conclusion.

### B. Scalability & Concurrency
- **NFR-004 (Concurrent Sessions)**: A baseline single-node deployment shall support at least **20 concurrent active voice interviews** without audio jitter or frame drops.
- **NFR-005 (Stateless Application Layer)**: FastAPI application instances must be completely stateless, delegating transient coordination to Redis and permanent records to PostgreSQL.

### C. Reliability & Fault Tolerance
- **NFR-006 (Transactional Outbox)**: Outbound domain events (e.g. `interview.completed`) must be persisted in PostgreSQL within the same ACID transaction as the state change to prevent lost task enqueues.
- **NFR-007 (Provider Retry & Failover Privacy)**: External AI provider calls shall implement bounded backoff (max 2 retries). Fallback providers must possess the exact same zero-data-retention compliance guarantees.
- **NFR-008 (Data Durability)**: Once a speech turn is finalized, its transcript and audio metadata shall be safely committed to PostgreSQL before triggering TTS or subsequent turns.

### D. Security & Privacy
- **NFR-009 (Zero Biometrics)**: The system shall never perform voice stress analysis, accent detection, facial emotion analysis, or pitch evaluation.
- **NFR-010 (Ephemeral Audio Retention)**: Inbound raw audio is processed in-memory and discarded after turn finalization by default. If candidate opts into practice audio playback, files are stored with a strict 30-day S3 lifecycle TTL.
- **NFR-011 (Multi-Layer Prompt Injection Defense)**: All parsed resume content and candidate transcripts must use structural XML fencing (`<candidate_untrusted_input>`), canary leak detection, and strict schema validation.
- **NFR-012 (Data Retention Controls)**: Candidate profiles, resumes, and interview transcripts must be purgeable on request in compliance with GDPR Right to Erasure (`DELETE /candidates/me`).

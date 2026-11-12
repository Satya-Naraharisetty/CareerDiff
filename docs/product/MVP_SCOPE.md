# MVP Scope Specification — CareerDiff

**Document Version:** 1.2.0  
**Status:** Approved  
**Lifecycle Target:** Phase 0 through Phase 6  

---

## 1. Executive Summary & Purpose

The objective of the CareerDiff Minimum Viable Product (MVP) is to prove the core thesis:
> **An AI system with deterministic state machine control, configurable session policy, and adaptive LLM reasoning can conduct a technical interview that feels authentic, adapts intelligently to depth, rigorously tests resume claims, and provides transparent, evidence-backed evaluation.**

### Primary MVP Focus: Candidate Technical Interview Practice
As established in the third-pass architecture review, the primary MVP product focus is **Self-Serve Candidate Technical Interview Practice**.
- **Why**: Allows rapid direct validation with software engineers preparing for technical rounds, eliminating the extended procurement, legal compliance (NYC Local Law 144, EU AI Act High-Risk AI), and multi-tenant enterprise complexities of employment screening during MVP validation.
- **Preserved Architectural Path**: The data model, deterministic engine, and normalized evaluation schemas are architected from day one to support **Enterprise Hiring Assessment** in Phase 7+ without schema redesign.

To achieve this without falling into the trap of over-engineering, the MVP strictly adheres to the **Canonical 8-Phase Progression** and a **Text-First, Voice-Next** phased execution strategy:
1. Build and verify the complete Resume Intelligence, Blueprint Generator, Adaptive Decision Engine, and Rubric Evaluator in **Text Mode** first (Phase 4).
2. Layer the **Real-Time Voice Streaming Pipeline** (VAD, STT, TTS, Interruption handling with consistent 16kHz Linear PCM) on top of the already-stable deterministic engine in Phase 5.
3. Deliver the **Evaluation Dossier & Dashboard** in Phase 6 via Taskiq asynchronous background workers driven by the Transactional Outbox pattern.

---

## 2. In-Scope for MVP

### A. Candidate Management & Identity (Phase 2)
- Secure candidate email/password registration and authentication using JWT.
- Candidate profile storage (name, email, target seniority).
- Past interview session history and status viewing.
- Basic GDPR-compliant profile and data purge capability.

### B. Resume Intelligence (Phase 2)
- PDF resume file upload (up to 10 MB).
- Deterministic text and layout extraction via PyMuPDF.
- Structured LLM-assisted parsing into Pydantic models (work experience, education, skills, projects).
- Testable claim extraction with document character offsets (provenance).
- Categorization into `EXPLICIT_FACT`, `INFERRED_SKILL`, and `VAGUE_CLAIM`.
- Editable web interface for candidates to confirm extracted data before the interview.

### C. Role Intelligence & Blueprinting (Phase 3)
- Pre-configured role competency schemas for **3 primary disciplines**:
  1. **Backend Engineering** (Distributed Systems, Databases, Concurrency, API Design).
  2. **Frontend Engineering** (State Management, Browser Performance, React Architecture, Web Security).
  3. **Full-Stack Engineering** (System Integration, End-to-End Data Flow, Performance Bottlenecks).
- 3 Seniority tiers: Junior, Mid-Level, Senior.
- Versioned 4-tier rubrics (`UNSATISFACTORY`, `BASIC`, `PROFICIENT`, `ADVANCED`).
- Deterministic `InterviewBlueprint` generator allocating time budgets and linking candidate resume claims to target competencies based on active `InterviewPolicy`.

### D. Adaptive Interview Engine (Phase 4)
- Deterministic turn-taking state machine:
  - `WARMUP` $\rightarrow$ `TECHNICAL_CORE` $\rightarrow$ `CONCLUDING` $\rightarrow$ `COMPLETED`.
- Structured 9-action decision space:
  - `PROBE_DEEPER`, `CLARIFY`, `CHALLENGE`, `VERIFY_CLAIM`, `SCENARIO`, `CHANGE_TOPIC`, `SIMPLIFY`, `REVISIT`, `CONCLUDE`.
- Policy guardrails:
  - Configurable probe limits per competency (default 3).
  - Configurable topic time budgets and conclusion buffers.
  - Required competencies enforcement.
  - Incomplete coverage marked non-penalizing `INSUFFICIENT_EVIDENCE`.
- Bounded sliding-window prompt context to guarantee predictable LLM cost and latency.

### E. Real-Time Voice Pipeline (Phase 5)
- Bidirectional audio streaming over WebSocket (16kHz 16-bit PCM).
- Web Audio API worklet for candidate browser microphone capture.
- Server-side Voice Activity Detection (VAD) for speech start and pause detection.
- Streaming Speech-to-Text (partial and final transcripts).
- Streaming Text-to-Speech.
- Barge-in / interruption handling: instant TTS playback abort when candidate speaks.
- Instant, zero-loss fallback to text chat upon audio hardware or network drop.
- 5-minute session reconnection grace window using resumption tickets.

### F. Rubric Evaluation & Reporting (Phase 6)
- Asynchronous background evaluation executed via Taskiq worker dispatched through the PostgreSQL Transactional Outbox pattern (`outbox_events`).
- Decoupled `LiveAnswerInterpreter` (fast turn-taking $\le 600$ ms) and `AssessmentEvaluator` (deep multi-turn background grading).
- Normalized `evaluation_evidence` relation storing source turn references, Unicode codepoint character offsets (NFC normalized), transcript excerpts, and impact.
- Semantic validation asserting that evidence excerpts match actual transcript codepoint slices.
- Explicit distinction between `INCORRECT_ANSWER` (numerical score 1.0–4.0) and `INSUFFICIENT_EVIDENCE` (`score IS NULL`, status `INSUFFICIENT_EVIDENCE`).
- Report versioning (`version`, `is_latest`) preserving evaluation history upon re-grading.
- Resume Claim Verification Ledger detailing tested vs untested claims.
- Interactive web report with radar charts, strength highlights, knowledge gaps, and curated reading recommendations.

---

## 3. Explicitly Out-of-Scope for MVP (Deferred to Phase 7+)

| Category | Out-of-Scope Capability | Target Phase | Rationale for Deferral |
| :--- | :--- | :--- | :--- |
| **Roles** | AI/ML, DevOps/SRE, Data Engineering, QA Automation | Phase 7+ | Establish deep calibration on core 3 roles before expanding breadth. |
| **Coding** | In-browser collaborative code editor & execution sandbox | Phase 7+ | Voice architectural and systems evaluation is the core differentiator; avoid competing with LeetCode initially. |
| **Whiteboard** | Multimodal image input / architecture diagram drawing | Phase 7+ | High technical complexity; text and voice adequately convey architecture trade-offs. |
| **Integrations**| ATS Integrations (Greenhouse, Lever, Workday) | Phase 7+ | Enterprise sales features distract from core consumer engine validation. |
| **Transport** | WebRTC MediaStream & SFU infrastructure | Phase 7+ | WebSocket audio streaming is simpler and reliable; WebRTC evaluated only if benchmarks demand it. |
| **Biometrics** | Facial emotion analysis, eye tracking, vocal pitch | **PERMANENT NON-GOAL** | Ethically hazardous, scientifically ungrounded, legal liability. |
| **Hiring** | Automated hire / no-hire decisions | **PERMANENT NON-GOAL** | The system produces evidence; humans make employment decisions. |

---

## 4. MVP Release Criteria & Quality Thresholds

| Metric | Target Threshold (Hypothesis) | Verification Method |
| :--- | :--- | :--- |
| **Voice Turn Latency (p90)** | $\le 1,800$ ms | Measured from candidate silence to first TTS audio chunk received. |
| **Barge-in Abort Latency** | $\le 150$ ms | Time from client speech energy to audio output silence. |
| **Evaluation Grounding** | 100% of rubric scores | Automated assertion: every score has non-empty normalized evidence records. |
| **Resume Claim Provenance** | 100% of extracted claims | Assertion: start/end character offsets match source text slice. |
| **Crash-Free Session Rate** | $\ge 98\%$ | Percentage of started interviews that cleanly reach `COMPLETED`. |
| **Risk-Based Quality** | 100% path coverage on critical invariants | Automated unit and integration test suite across core engine. |

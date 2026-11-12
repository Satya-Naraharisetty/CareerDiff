# Feature Catalog — CareerDiff

This document establishes the comprehensive feature catalog for CareerDiff across all modules. Each feature is tracked with an immutable identifier, functional module, release phase, complexity tier, input/output contracts, and dependencies.

---

## Module 1: Candidate Management & Identity (CM)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-CM-01** | User Registration & Auth | MVP | Low | Email, Password, Name | JWT Tokens, User Entity | FastAPI, PostgreSQL | Secure user sign-up, login, and session refresh via JWT and HTTP-only cookies. |
| **FEAT-CM-02** | Candidate Profile Store | MVP | Low | User ID, Profile Data | CandidateProfile Record | FEAT-CM-01 | CRUD operations for managing candidate educational and contact metadata. |
| **FEAT-CM-03** | Interview History | MVP | Low | Candidate ID | List of Past Interviews | PostgreSQL | View summary cards of past completed, paused, or scheduled interview sessions. |
| **FEAT-CM-04** | Candidate Privacy & GDPR Purge | MVP | Medium | Candidate ID, Purge Request | Confirmation, Audit Log | PostgreSQL, S3 | Complete erasure of candidate profile, uploaded resumes, audio files, and transcripts. |

---

## Module 2: Resume Intelligence (RI)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-RI-01** | Resume File Ingestion | MVP | Medium | PDF / DOCX byte stream | Extracted Text, Section Spans | PyMuPDF / python-docx | Ingests binary resume documents, sanitizes content, and preserves layout boundaries. |
| **FEAT-RI-02** | Structured Profile Parsing | MVP | Medium | Raw Resume Text | Pydantic Parsed Resume Profile | FEAT-RI-01, LLM | Extracts categorized work experience, skills, projects, and education into schema. |
| **FEAT-RI-03** | Resume Claim Extraction | MVP | High | Work Experience Text | List of `ResumeClaim` entities | FEAT-RI-02, LLM | Identifies testable technical assertions with provenance (character offsets). |
| **FEAT-RI-04** | Claim Classification | MVP | Medium | Extracted Claims | Tagged Claims (`EXPLICIT_FACT`, `VAGUE`) | FEAT-RI-03 | Categorizes claims into verifiable facts vs vague assertions for targeted probing. |
| **FEAT-RI-05** | Candidate Claim Editor | MVP | Low | Candidate Edits | Updated Verified Claims | FEAT-RI-04 | Web interface allowing candidates to review and correct parsed skills before interview. |

---

## Module 3: Role Intelligence & Configuration (RC)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-RC-01** | Role & Competency Registry | MVP | Low | Role Schemas (JSON/YAML) | Seeded DB Competency Trees | PostgreSQL | Seeded catalog for Backend, Frontend, and Fullstack roles with sub-competencies. |
| **FEAT-RC-02** | 4-Tier Rubric Definitions | MVP | Medium | Competency ID | Versioned Rubric Criteria | FEAT-RC-01 | Observable criteria across `UNSATISFACTORY`, `BASIC`, `PROFICIENT`, and `ADVANCED`. |
| **FEAT-RC-03** | Seniority Calibration | MVP | Medium | Target Level (Junior, Mid, Senior) | Calibrated Rubric Thresholds | FEAT-RC-02 | Adjusts expected depth, autonomy, and system architecture criteria per seniority. |
| **FEAT-RC-04** | Extended Role Library | Post-MVP | Medium | Schemas for AI/ML, DevOps, Data | Seeded DB Records | FEAT-RC-01 | Broadens role registry to encompass specialized infrastructure and AI disciplines. |

---

## Module 4: Interview Planning & Blueprinting (IP)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-IP-01** | Claim-to-Competency Mapping | MVP | Medium | Resume Claims, Role Competencies | Candidate Competency Graph | FEAT-RI-03, FEAT-RC-01 | Maps candidate asserted experience directly to target interview competencies. |
| **FEAT-IP-02** | Blueprint Generator | MVP | Medium | Role, Duration, Claims | `InterviewBlueprint` Entity | FEAT-IP-01 | Formulates topic sequence, time budget allocations, and focus questions. |
| **FEAT-IP-03** | Coverage Invariant Definition | MVP | Low | Blueprint Config | Mandatory Coverage Rules | FEAT-IP-02 | Establishes deterministic coverage gates (e.g., must cover at least 3 core areas). |

---

## Module 5: Adaptive Interview Engine (AE)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-AE-01** | Deterministic State Machine | MVP | High | Current Turn, Session State | State Transition, Legal Actions | PostgreSQL, Redis | Enforces state progression (`WARMUP` $\rightarrow$ `TECHNICAL_CORE` $\rightarrow$ `CONCLUDING`). |
| **FEAT-AE-02** | Structured Action Selector | MVP | High | Turn Transcript, Blueprint, History | Next Engine Action (enum) | FEAT-AE-01, LLM | Chooses from 9 actions (`PROBE_DEEPER`, `CHALLENGE`, `CLARIFY`, `CHANGE_TOPIC`...). |
| **FEAT-AE-03** | Guardrail Invariant Validator | MVP | Medium | Engine Action, Session Budget | Validated Action or Override | FEAT-AE-01 | Overrides LLM if topic time expired or probe loops occur (e.g., >3 probes). |
| **FEAT-AE-04** | Turn Generator | MVP | Medium | Validated Action, Context Summary | Natural Interviewer Question | FEAT-AE-02, LLM | Generates conversational interviewer response aligned strictly to selected action. |
| **FEAT-AE-05** | Bounded Context Manager | MVP | Medium | Full Turn History | Sliding Window + Compact Summary | Redis, LLM | Constrains prompt tokens to maintain fast LLM turnaround and avoid memory drift. |

---

## Module 6: Voice & Real-Time Pipeline (VP)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-VP-01** | WebSocket Stream Handler | MVP | Medium | Client WebSocket Connection | Bidirectional Audio/JSON frames | FastAPI WebSocket | Manages resilient connection lifecycle, tickets, and heartbeat telemetry. |
| **FEAT-VP-02** | Client Audio Capture Worklet | MVP | Medium | Microphone Stream | Binary PCM Chunks (16kHz) | Web Audio API | Low-latency audio streaming from browser to backend WebSocket. |
| **FEAT-VP-03** | Server-Side VAD & Chunking | MVP | High | Audio Byte Stream | Speech Events (Start, Pause, End) | Silero VAD / WebRTC VAD | Detects when candidate starts speaking, pauses, or finishes a thought. |
| **FEAT-VP-04** | STT Provider Streaming | MVP | High | Audio Chunks | Partial & Final Transcripts | Deepgram / Whisper | Real-time speech transcription with word-level timestamps. |
| **FEAT-VP-05** | TTS Provider Streaming | MVP | High | Interviewer Question Text | Audio Byte Stream | ElevenLabs / Cartesia | Low-latency streaming text-to-speech sent directly to candidate. |
| **FEAT-VP-06** | Barge-In Interruption | MVP | High | Client Speech Detection during TTS | Abort Signal, Audio Flush | FEAT-VP-03, FEAT-VP-05 | Instantly cuts off playing TTS audio when candidate begins speaking. |
| **FEAT-VP-07** | Text Fallback Mode | MVP | Low | Network Degradation Event | Text Chat Interface | UI, FastAPI | Seamlessly switches candidate to keyboard chat if audio streaming fails. |
| **FEAT-VP-08** | Session Reconnect Recovery | MVP | Medium | Disconnect Event, Resume Ticket | Restored Session State | Redis, PostgreSQL | Re-establishes dropped connections within 5 minutes without losing state. |

---

## Module 7: Rubric & Evaluation Engine (EE)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-EE-01** | Decoupled Turn Evaluator | MVP | Medium | Finalized Turn Records | Asynchronous Evaluation Jobs | ARQ Worker, DB | Scores turns in background worker so live interview latency is unaffected. |
| **FEAT-EE-02** | Rubric Grounding & Scoring | MVP | High | Transcript Turns, Rubric Criteria | Score (1-4) + Verbatim Evidence | LLM, Pydantic | Assesses technical mastery; strictly requires verbatim transcript citations. |
| **FEAT-EE-03** | Insufficient Evidence Flagging | MVP | Low | Unprobed Competencies | `INSUFFICIENT_EVIDENCE` status | FEAT-EE-02 | Prevents unprobed topics from skewing overall candidate ratings. |
| **FEAT-EE-04** | Claim Verification Auditing | MVP | Medium | Resume Claims, Relevant Turns | Verification Ledger Entries | FEAT-EE-02 | Cross-examines resume assertions against actual candidate performance. |

---

## Module 8: Reporting & Candidate Insights (RP)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-RP-01** | Assessment Report Aggregator | MVP | Medium | Competency Scores, Claim Ledger | `AssessmentReport` Record | PostgreSQL | Compiles holistic candidate evaluation report with strengths and gaps. |
| **FEAT-RP-02** | Candidate Interactive Dossier | MVP | Medium | Assessment Report ID | Responsive React Dashboard | TanStack Query, UI | Visual dashboard with radar charts, evidence quotes, and audio snippets. |
| **FEAT-RP-03** | Personalized Study Guide | MVP | Low | Identified Knowledge Gaps | Recommended Curated Topics | FEAT-RP-01 | Generates structured learning path and reading materials for missed topics. |
| **FEAT-RP-04** | PDF Report Export | Post-MVP | Medium | Assessment Report | Formatted PDF Document | WeasyPrint / Playwright | Generates downloadable, printable executive summary for hiring panels. |

---

## Module 9: Quality & Intelligence Benchmarking (QB)

| Feature ID | Feature Name | Phase | Complexity | Inputs | Outputs | Dependencies | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FEAT-QB-01** | Synthetic Replay Harness | Post-MVP | High | 100 Scenario Fixture Files | Benchmark Evaluation Metrics | Pytest, TestClient | Automated simulation replaying diverse candidate personas against the engine. |
| **FEAT-QB-02** | Quality Telemetry Dashboard | Post-MVP | Medium | Benchmark Test Runs | Drift & Latency Reports | PostgreSQL | Tracks follow-up relevance, repetition rate, and cost drift across LLM models. |

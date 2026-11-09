# Non-Goals & Prohibited Capabilities — IntervueX

**Document Version:** 1.0.0  
**Status:** Authoritative & Binding  
**Scope:** Universal across all phases and design iterations  

This document defines what IntervueX **explicitly is not** and **what it will never do**. In software engineering, defining non-goals is as critical as defining features: it prevents scope creep, eliminates pseudo-scientific bloat, defends candidate civil liberties, and keeps the engineering architecture focused on technical substance.

---

## 1. Ethical & Regulatory Anti-Goals

### 🚫 Non-Goal 1: Automated Hiring or Rejection Decisions
- **Statement**: IntervueX **never** renders automated employment decisions, generates binary "Hire / Do Not Hire" commands, or filters candidates out of an ATS pipeline without human intervention.
- **Rationale**: Fully automated hiring systems infringe upon labor regulations (e.g., EU AI Act high-risk AI provisions, NYC Local Law 144) and strip candidates of human dignity.
- **Architectural Guardrail**: The database model contains **no** `is_hired`, `recommended_for_hire`, or `rejection_reason` fields. Output reports are structured as **Evaluative Dossiers** (evidence, rubrics, strengths, gaps) meant strictly to assist human hiring panels.

### 🚫 Non-Goal 2: Facial Emotion, Video, Gaze, or Micro-Expression Analysis
- **Statement**: IntervueX **never** records or analyzes video, webcam streams, eye tracking, blinking frequency, facial muscle micro-movements, or posture.
- **Rationale**: Facial emotion recognition in hiring has been widely debunked by computer science and cognitive psychology researchers as pseudo-scientific phrenology. It discriminates against neurodivergent individuals and introduces rampant racial and gender bias.
- **Architectural Guardrail**: The platform is **voice-and-text only**. No video capture code, WebRTC video tracks, or computer vision dependencies will ever be added to the codebase.

### 🚫 Non-Goal 3: Vocal Pitch, Accent, Fluency, or Stress Biometrics
- **Statement**: IntervueX **never** scores or analyzes candidate vocal pitch, cadence, accents, regional dialects, speech impediments, acoustic acoustic energy, or alleged "stress biomarkers".
- **Rationale**: Voice tone and accent have zero correlation with distributed systems engineering competency or coding skill. Evaluating accents severely penalizes non-native English speakers.
- **Architectural Guardrail**: Audio streams are utilized strictly for Speech-to-Text (STT) transcription and Voice Activity Detection (silence detection). Raw audio is discarded or stored ephemerally solely for user playback; acoustic features are never fed into the evaluation engine.

---

## 2. Product & Feature Anti-Goals

### 🚫 Non-Goal 4: Unconstrained Chatbot Freeform Conversation
- **Statement**: IntervueX is **not** a general-purpose AI chatbot (like ChatGPT or Claude) masquerading as an interviewer.
- **Rationale**: An unconstrained LLM wanders off-topic, loses track of time, fails to cover mandatory competencies, easily falls prey to user gaslighting, and produces uncalibrated assessments.
- **Architectural Guardrail**: The conversation is governed by a **Deterministic Finite State Machine**. Every interviewer utterance must be authorized by the Adaptive Decision Engine and mapped to a discrete action (`PROBE_DEEPER`, `CHALLENGE`, `VERIFY_CLAIM`, etc.).

### 🚫 Non-Goal 5: Black-Box, Unexplainable Scoring
- **Statement**: The system **never** outputs a floating-point score (e.g., "78/100") without full evidence grounding.
- **Rationale**: Black-box scores provide zero pedagogical value to candidates and zero defensible auditability to hiring managers.
- **Architectural Guardrail**: The Pydantic evaluation schema strictly enforces that every rubric dimension score is accompanied by verbatim transcript quotes and line references. Scores missing transcript provenance fail validation and cannot be committed to PostgreSQL.

### 🚫 Non-Goal 6: Monopolizing Live Coding / LeetCode Whiteboarding
- **Statement**: In the MVP, IntervueX does **not** attempt to replicate LeetCode, HackerRank, or heavy in-browser IDE sandboxes.
- **Rationale**: Automated unit-test-based coding platforms already exist in abundance. IntervueX's unique value proposition is **verbal architectural reasoning, systems design intuition, practical debugging experience, and resume claim verification**.
- **Scope Boundary**: Real-time coding environments are deferred to Phase 6 and will only be introduced once the core voice adaptive engine is proven.

---

## 3. Architectural & Engineering Anti-Goals

### 🚫 Non-Goal 7: Third-Party Agent Framework Dependency Bloat
- **Statement**: We will **not** incorporate bloated external agent orchestration libraries such as LangChain, LangGraph, CrewAI, or AutoGen.
- **Rationale**: These frameworks introduce excessive abstractions, obscure prompt control, make debugging difficult, leak memory, and introduce breaking changes across minor releases.
- **Architectural Guardrail**: All LLM interactions, prompts, structured output schemas, and state transitions are written using **vanilla Python, Pydantic v2, and direct provider SDKs** (or clean HTTP clients).

### 🚫 Non-Goal 8: Microservice Premature Decomposition
- **Statement**: We will **not** build a distributed mesh of 10 microservices, Kubernetes clusters, or service meshes for the initial phases.
- **Rationale**: Microservices introduce distributed transaction overhead, network latency, and operational misery for an early-stage product.
- **Architectural Guardrail**: IntervueX is architected as a clean **Modular Monolith** with an asynchronous worker (FastAPI + ARQ + PostgreSQL + Redis) capable of running seamlessly via a single `docker compose up`.

### 🚫 Non-Goal 9: Treating Redis as Authoritative Truth
- **Statement**: Redis is **never** the primary source of record for completed interview turns, transcripts, scores, or candidate data.
- **Rationale**: Redis is an in-memory data store. If a Redis node restarts or memory eviction occurs under heavy load, data loss must not destroy interview records.
- **Architectural Guardrail**: Every speech turn is committed to PostgreSQL in an ACID transaction before the session orchestrator advances to the next turn. Redis is strictly for transient session state, Pub/Sub, and caching.

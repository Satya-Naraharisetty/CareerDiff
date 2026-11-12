# System Overview Architecture — CareerDiff

**Document Version:** 1.2.0  
**Status:** Approved Architecture Blueprint  

---

## 1. High-Level Architectural Pattern: The Modular Monolith

CareerDiff is designed as a **Modular Monolith with Asynchronous Background Processing**.

Rather than introducing the operational complexity, network latency, and distributed transaction challenges of microservices, CareerDiff enforces strict logical boundaries within a single unified Python backend codebase. Heavy, non-blocking tasks (resume extraction, post-interview rubric evaluation) are offloaded to an asynchronous task queue (**Taskiq**) backed by Redis, governed by a **Transactional Outbox** in PostgreSQL to eliminate dual-write race conditions.

```mermaid
graph TB
    subgraph Client Layer
        WebClient[React 18 + TypeScript Client<br/>Vite + Tailwind + Web Audio Worklet]
    end

    subgraph Edge & Gateway
        Caddy[Reverse Proxy / SSL Termination<br/>Caddy / Nginx]
    end

    subgraph Application Server [FastAPI Modular Monolith]
        REST[REST API Endpoints<br/>Auth, Resumes, Profiles, Reports]
        WSH[WebSocket Session Gateway<br/>/ws/v1/interviews/{id}]
        
        subgraph Core Modules
            RM[Resume & Claim Module]
            RC[Role & Blueprint Module]
            SM[Session State Machine]
            LAI[LiveAnswerInterpreter]
            ADE[Adaptive Decision Engine]
            VP[Voice Pipeline Coordinator]
        end
    end

    subgraph Distributed State & Queue
        OutboxTable[(PostgreSQL Outbox Events Table)]
        OutboxPub[Outbox Publisher Task]
        Redis[(Redis 7<br/>Session Cache, Pub/Sub, Audio Buffers)]
        TQ[Taskiq Background Workers<br/>Asyncio Task Execution]
    end

    subgraph Persistent Storage
        Postgres[(PostgreSQL 16<br/>Authoritative Relational DB)]
        S3[S3-Compatible Object Store<br/>MinIO / AWS S3 - Resumes & Optional Audio]
    end

    subgraph External AI Services
        STT[STT: Deepgram / Whisper]
        TTS[TTS: Cartesia / ElevenLabs]
        LLM[LLM: Gemini / Anthropic / OpenAI]
    end

    WebClient <-->|HTTPS REST| Caddy
    WebClient <-->|WSS Binary Audio/JSON| Caddy
    Caddy <--> REST
    Caddy <--> WSH

    REST --> RM
    REST --> RC
    WSH <--> VP
    VP <--> SM
    SM <--> LAI
    LAI <--> ADE

    SM -->|Transient State| Redis
    SM -->|ACID Turns & Outbox| Postgres
    OutboxTable --> OutboxPub
    OutboxPub --> Redis
    Redis --> TQ
    TQ --> Postgres
    TQ --> LLM
    REST --> Postgres
    REST --> S3

    VP <--> STT
    VP <--> TTS
    LAI <--> LLM
    ADE <--> LLM
    RM <--> LLM
```

---

## 2. Core Architectural Invariants

The entire system is governed by eight non-negotiable architectural invariants:

1. **Deterministic Engine Invariant**: The Large Language Model (LLM) never commands the interview flow directly. The deterministic state machine validates every state transition and enforces configurable session policies (`InterviewPolicy`).
2. **Durability-First Turn Persistence**: Before the interviewer responds to a candidate or transitions state, the candidate's finalized speech transcript turn must be committed to PostgreSQL with a monotonic sequence index.
3. **Transactional Outbox for Event Dispatch**: State changes that trigger background tasks (such as interview completion) write an outbox event in the same ACID transaction, guaranteeing at-least-once delivery without dual-write loss.
4. **Redis Is Not Authoritative Truth**: Redis is strictly an ephemeral acceleration and caching layer. If Redis is flushed mid-session, all interview turns, blueprints, and profiles remain intact in PostgreSQL.
5. **Decoupled Evaluation**: Live turn interpretation (`LiveAnswerInterpreter` $\le 600$ ms) and rubric evaluation (`AssessmentEvaluator` in Taskiq worker) are strictly decoupled across separate processes.
6. **Normalized Evidence Grounding**: Every rubric evaluation score must link to atomic records in `evaluation_evidence` referencing source turns, transcript excerpts, character offsets, evidence types, and rationale.
7. **Consistent Linear PCM Audio Streaming**: Inbound microphone audio (downsampled to 16kHz in the browser) and outbound TTS audio use identical Linear PCM (16-bit signed, little-endian, 16kHz Mono) over WebSocket binary frames.
8. **Incomplete Coverage Non-Penalization**: If an interview reaches its duration limit before all scheduled competencies can be probed, unassessed competencies are recorded as `INSUFFICIENT_EVIDENCE` with a `NULL` score, excluded from composite averages.

---

## 3. Subsystem Breakdown

### A. Client Presentation Layer (Frontend)
- **Framework**: React 18, TypeScript 5, Vite, Tailwind CSS.
- **State Management**: TanStack Query v5 for server data synchronization; Zustand for transient UI state (mic muting, connection status, audio levels).
- **Audio Worklet**: Custom `AudioWorkletProcessor` downsampling hardware audio to 16kHz 16-bit mono PCM chunks and streaming directly over WebSocket.

### B. Application Server (FastAPI)
- **ASGI Framework**: FastAPI over Uvicorn with `asyncio`.
- **Validation**: Strict Pydantic v2 schemas for all request/response models and LLM structured outputs.
- **Database Access**: SQLAlchemy 2.0 with asynchronous engine (`asyncpg` driver), enforcing relational integrity and explicit connection pooling.

### C. Background Task Processing (Taskiq)
- **Technology**: Taskiq with Redis broker and `taskiq-fastapi`.
- **Rationale**: Actively maintained, built natively for Python `asyncio`, shares FastAPI dependency injection, and executes decoupled evaluations reliably via the Transactional Outbox pattern.

### D. Storage & Data Persistence
- **PostgreSQL 16**: Normalized relational schema storing candidates, resumes, extracted claims, role competencies, rubrics, blueprints, interview sessions, turns, scores, evaluation evidence, and outbox events.
- **S3 Object Store (MinIO in local dev)**: Stores original uploaded resume PDFs and optional ephemeral audio recordings (with 30-day lifecycle expiration).
- **Redis 7**: Fast session state cache, WebSocket heartbeat tracking, active turn audio buffers, and Taskiq task queues.

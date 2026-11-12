# User Journeys — CareerDiff

This document traces the comprehensive end-to-end user journeys through the CareerDiff platform. Journeys 1 through 4 represent the **Primary MVP Candidate Practice Experience**, while Journey 5 represents the **Preserved Post-MVP Enterprise Assessment Flow**.

---

## Journey 1: Candidate Sign-Up, Resume Upload & Claim Verification (MVP)

### Objective

A candidate registers, uploads their resume, verifies extracted claims, and prepares for an interview.

```mermaid
sequenceDiagram
    autonumber
    actor C as Candidate
    participant UI as Web Client
    participant API as FastAPI Backend
    participant Worker as Background Task
    participant LLM as LLM Extractor
    participant DB as PostgreSQL

    C->>UI: Visits /register, submits credentials
    UI->>API: POST /api/v1/auth/register
    API->>DB: Create User (hashed password)
    API-->>UI: JWT Auth Token + Session Cookie
    C->>UI: Drags & drops Resume (PDF)
    UI->>API: POST /api/v1/resumes (multipart/form-data)
    API->>DB: Save raw resume metadata & file
    API->>Worker: Enqueue resume_parsing_task(resume_id)
    API-->>UI: 202 Accepted (processing)
    Worker->>Worker: Extract text, structure & layout
    Worker->>LLM: Parse claims via Pydantic schema
    LLM-->>Worker: Structured profile + claims with source offsets
    Worker->>DB: Persist CandidateProfile & ResumeClaims
    UI->>API: Poll GET /api/v1/resumes/{id}/status (or WebSocket update)
    API-->>UI: Status COMPLETED
    UI->>C: Displays Extracted Profile & Claims for review
    C->>UI: Edits a misclassified skill and confirms profile
    UI->>API: PUT /api/v1/candidates/profile
    API->>DB: Update confirmed profile
```

---

## Journey 2: Configuring the Technical Practice Session (MVP)

### Objective

The candidate configures the target job role, seniority level, and duration, triggering the creation of an interview blueprint with a customizable `InterviewPolicy`.

```mermaid
flowchart TD
    Start([Candidate on /interviews/new]) --> SelectRole[Select Role: e.g., Senior Backend Engineer]
    SelectRole --> SelectFocus[Choose Focus Areas: Distributed Systems, Databases, Concurrency]
    SelectRole --> ConfigPolicy[Review Practice Policy: Hints Allowed, 3 Max Probes]
    ConfigPolicy --> SelectDuration[Select Duration: 30 mins / 45 mins]
    SelectDuration --> SelectMode[Select Mode: Voice Streaming or Text Fallback]
    SelectMode --> Consent[Acknowledge Microphone & Audio Retention Consent]
    Consent --> Submit[Click 'Generate Practice Plan']
    Submit --> EngineBlueprint[Deterministic Engine: Builds Interview Blueprint]
    EngineBlueprint --> MatchClaims[Map Resume Claims to Competency Rubrics]
    MatchClaims --> AllocateBudgets[Allocate Time Budgets per Topic]
    AllocateBudgets --> SessionReady[Persist Session & Return Ephemeral Ticket]
```

---

## Journey 3: The Live Adaptive Practice Interview (MVP)

### Objective

Conduct an interactive, real-time voice practice session where `LiveAnswerInterpreter` evaluates depth and triggers follow-up actions with $\le 600$ ms turnaround, decoupled from final reporting.

```mermaid
sequenceDiagram
    autonumber
    actor C as Candidate
    participant Client as Browser Audio Worklet
    participant WS as WebSocket Handler
    participant VAD as VAD & Audio Buffer
    participant STT as STT Streaming
    participant SO as Session Orchestrator
    participant LAI as LiveAnswerInterpreter
    participant ADE as Adaptive Decision Engine
    participant DB as PostgreSQL
    participant TTS as TTS Streamer

    C->>Client: "In my last role, we partitioned Kafka by customer ID..."
    Client->>WS: Stream Binary PCM Audio Frames (16kHz, 16-bit, 50ms)
    WS->>VAD: Buffer audio & evaluate speech energy
    WS->>STT: Stream audio chunks
    STT-->>WS: Partial Transcripts ("In my last role...")
    WS-->>Client: Send transcript_partial (renders on screen)
    C->>Client: "...which prevented hot-spotting." [Silence ensues]
    VAD->>SO: Speech Pause Detected (>= 1,200 ms silence)
    STT-->>SO: Final Transcript Confirmed
    SO->>DB: Persist Candidate Turn (turn_index: 4, text, timestamps)
    SO->>LAI: Interpret Answer (depth, ambiguity, contradictions)
    LAI-->>ADE: InterpretationResult (Depth: SHALLOW, Key: Kafka Partitioning)
    ADE->>ADE: Evaluate Policy & Action Space -> Action: CHALLENGE
    ADE-->>SO: Next Question Text: "What happens if a single enterprise customer generates 80% of your traffic? How do you prevent broker imbalance?"
    SO->>DB: Persist Interviewer Turn (turn_index: 5, action: CHALLENGE)
    SO->>TTS: Stream Question Text
    TTS-->>SO: Audio Byte Stream (PCM 16kHz)
    SO-->>Client: Stream binary audio frames
    Client->>C: Plays audio through candidate headphones
```

---

## Journey 4: Post-Interview Feedback & Evidence-Backed Gap Analysis (MVP)

### Objective

The candidate reviews their personal performance dossier, viewing normalized evidence rows, clickable transcript excerpts, and curated reading recommendations.

```mermaid
flowchart TD
    Complete([Interview Concludes]) --> Enqueue[Orchestrator Commits Outbox Event]
    Enqueue --> WorkerRun[Taskiq Worker Runs AssessmentEvaluator]
    WorkerRun --> ScoreCalc[Evaluate Competencies & Ground in Normalized Evidence]
    ScoreCalc --> PersistReport[Persist AssessmentReport & EvaluationEvidence]
    PersistReport --> NotifyUser[Client Displays: 'Report Ready']
    NotifyUser --> ViewDashboard[Candidate Opens /interviews/{id}/report]
  
    subgraph Report Sections
        Summary[Overall Technical Readiness Score & Summary]
        Strengths[Key Demonstrated Strengths with Excerpts]
        Gaps[Identified Knowledge Gaps with Character Offsets]
        ClaimLedger[Resume Claim Verification Ledger]
        TranscriptView[Interactive Transcript with Audio Playback Snippets]
        LearningPath[Curated Reading & Concepts to Review]
    end
  
    ViewDashboard --> Summary
    Summary --> Strengths
    Summary --> Gaps
    Summary --> ClaimLedger
    Summary --> TranscriptView
    Summary --> LearningPath
```

---

## Journey 5: Recruiter Reviewing Candidate Dossier (Preserved Post-MVP Path)

### Objective

A hiring manager reviews a candidate's completed technical dossier to determine whether to invite them for final-round team matching.

```mermaid
flowchart LR
    A[Recruiter Dashboard] --> B[Filter by Role: Senior Backend]
    B --> C[Candidate Profile: Alex Rivera]
    C --> D{Review Verification Ledger}
    D -->|Claim 1: Scaled Kafka to 1M events/sec| E1[Status: VERIFIED<br/>Depth: Discussed zero-copy, batching, page cache]
    D -->|Claim 2: Architected Multi-Region DB| E2[Status: PARTIALLY_VERIFIED<br/>Depth: Understood async replication, missed conflict resolution]
    C --> F[Rubric Radar Chart: 85% Proficient / Advanced]
    C --> G[Audio Snapshot: Listen to 45s turn on Distributed Locking]
    C --> H[Human Decision: Advance to Team Match]
```

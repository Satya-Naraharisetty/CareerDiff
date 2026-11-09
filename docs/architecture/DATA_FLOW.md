# End-to-End Data Flow — IntervueX

**Document Version:** 1.2.0  
**Status:** Approved Technical Architecture  

---

## 1. Pipeline 1: Resume Ingestion & Claim Extraction

```mermaid
sequenceDiagram
    autonumber
    actor Candidate
    participant Browser
    participant API as FastAPI REST Gateway
    participant S3 as MinIO / S3 Storage
    participant Outbox as PostgreSQL Outbox
    participant TQ as Taskiq Queue (Redis)
    participant Worker as Background Worker
    participant LLM as LLM Structured Provider
    participant DB as PostgreSQL 16

    Candidate->>Browser: Selects "resume.pdf" (< 10 MB)
    Browser->>API: POST /api/v1/resumes (multipart/form-data)
    API->>API: Validate MIME type (application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document)
    API->>S3: Upload raw file bytes (s3://resumes/{candidate_id}/{uuid}.pdf)
    API->>DB: BEGIN TRANSACTION
    API->>DB: INSERT INTO resumes (id, candidate_id, s3_key, status='PENDING')
    API->>Outbox: INSERT INTO outbox_events (event_type='resume.uploaded', payload={resume_id})
    API->>DB: COMMIT TRANSACTION
    API-->>Browser: 202 Accepted { resume_id, status: "PENDING" }
    
    Outbox->>TQ: Outbox Publisher dispatches to Taskiq
    Worker->>TQ: Dequeue "process_resume" task
    Worker->>S3: Fetch raw PDF bytes
    Worker->>Worker: PyMuPDF: Unicode NFC normalize, extract text spans & codepoint offsets
    Worker->>LLM: Structured JSON prompt (Pydantic schema: ResumeExtractionOutput)
    LLM-->>Worker: Validated JSON: CandidateProfile + list[ResumeClaim]
    
    Worker->>DB: BEGIN TRANSACTION
    Worker->>DB: INSERT INTO candidate_profiles (candidate_id, summary, experience, education, skills)
    Worker->>DB: INSERT INTO resume_claims (resume_id, claim_text, category, start_offset, end_offset, technologies)
    Worker->>DB: UPDATE resumes SET status='PROCESSED'
    Worker->>DB: COMMIT TRANSACTION
    Worker-->>Browser: Pub/Sub WebSocket event: "resume_processed"
```

---

## 2. Pipeline 2: Blueprint & Session Initialization

```mermaid
sequenceDiagram
    autonumber
    actor Candidate
    participant Browser
    participant API as FastAPI REST Gateway
    participant BlueprintBuilder as Blueprint Engine
    participant DB as PostgreSQL 16
    participant Redis as Redis 7 Cache

    Candidate->>Browser: Configures session: Role="Senior Backend", Duration=30m
    Browser->>API: POST /api/v1/interviews { role_id, seniority, duration_minutes }
    API->>DB: Fetch CandidateProfile, Verified Claims, and Role Competencies
    API->>BlueprintBuilder: Build blueprint(profile, claims, competencies, duration, policy)
    
    BlueprintBuilder->>BlueprintBuilder: 1. Calculate time allocations per policy topic budgets
    BlueprintBuilder->>BlueprintBuilder: 2. Match highest-impact claims to competencies
    BlueprintBuilder->>BlueprintBuilder: 3. Formulate topic blueprints and inquiry objectives
    
    API->>DB: BEGIN TRANSACTION
    API->>DB: INSERT INTO interviews (id, candidate_id, role_id, state='CREATED', session_policy)
    API->>DB: INSERT INTO interview_blueprints (interview_id, total_topics, coverage_threshold)
    API->>DB: INSERT INTO blueprint_topics (blueprint_id, competency_id, allocated_seconds, order_index)
    API->>DB: COMMIT TRANSACTION
    
    API->>Redis: Generate Ephemeral Ticket: SET ticket:{token} '{"interview_id": "...", "candidate_id": "..."}' EX 60
    API-->>Browser: 201 Created { interview_id, websocket_url, ticket: token }
```

---

## 3. Pipeline 3: Real-Time Adaptive Voice Turn Loop

```mermaid
sequenceDiagram
    autonumber
    actor Candidate
    participant AudioWorklet as Browser AudioWorklet (16kHz Downsampler)
    participant WS as FastAPI WebSocket Gateway
    participant VAD as Silero VAD Buffer
    participant STT as Streaming STT (Deepgram)
    participant Orchestrator as Session Orchestrator
    participant LAI as LiveAnswerInterpreter
    participant ADE as Adaptive Decision Engine
    participant LLM as Turn Generator (LLM)
    participant DB as PostgreSQL 16
    participant TTS as Streaming TTS (Cartesia/ElevenLabs)

    Candidate->>AudioWorklet: Speaks: "We used Raft consensus to synchronize nodes..."
    AudioWorklet->>WS: Stream binary Linear PCM frames (16kHz, 16-bit Mono, 50ms chunks)
    WS->>VAD: Buffer PCM bytes & evaluate speech probability
    WS->>STT: Forward PCM chunk
    STT-->>WS: Emit partial transcript ("We used Raft...")
    WS-->>AudioWorklet: JSON { type: "transcript_partial", text: "We used Raft..." }

    Candidate->>AudioWorklet: "...which prevented split-brain." [Silence ensues]
    VAD->>VAD: Silence threshold exceeded (1,200 ms with probability < 0.3)
    VAD->>Orchestrator: Emit event: SPEECH_PAUSE_DETECTED
    STT-->>Orchestrator: Emit final transcript ("We used Raft consensus to synchronize nodes, which prevented split-brain.")

    critical Persist Candidate Turn Before State Mutation
        Orchestrator->>DB: INSERT INTO interview_turns (interview_id, turn_index, speaker='CANDIDATE', transcript, audio_duration_ms)
    end

    Orchestrator->>LAI: Interpret Answer Depth & Contradictions (budget <= 600ms)
    LAI-->>ADE: InterpretationResult: { depth: "ADEQUATE", recommended_action: "CHALLENGE" }
    
    ADE->>ADE: Evaluate deterministic guardrails (Probe count <= max? Topic budget?)
    ADE->>LLM: Generate Spoken Turn Text for CHALLENGE action
    LLM-->>ADE: Question: "What happens if the leader loses network connectivity to a minority of nodes? How does Raft handle that partition?"

    critical Persist Interviewer Turn
        Orchestrator->>DB: INSERT INTO interview_turns (interview_id, turn_index, speaker='INTERVIEWER', transcript, action_taken='CHALLENGE')
    end

    Orchestrator->>TTS: POST /stream (text: Question)
    TTS-->>WS: Binary audio stream (Linear PCM 16kHz, 100ms chunks)
    WS-->>AudioWorklet: Binary PCM chunks + JSON { type: "interviewer_speaking" }
    AudioWorklet->>Candidate: Plays synthesized interviewer question
```

---

## 4. Pipeline 4: Decoupled Outbox Evaluation & Dossier Generation

```mermaid
sequenceDiagram
    autonumber
    participant Orchestrator as Session Orchestrator
    participant DB as PostgreSQL 16
    participant Outbox as Outbox Events Table
    participant TQ as Taskiq Queue (Redis)
    participant Worker as Taskiq Worker (AssessmentEvaluator)
    participant LLM as Evaluator Agent
    participant Browser as Web Client

    critical Atomic State Change & Outbox Commit
        Orchestrator->>DB: BEGIN TRANSACTION
        Orchestrator->>DB: UPDATE interviews SET state='COMPLETED', finished_at=NOW()
        Orchestrator->>Outbox: INSERT INTO outbox_events (event_type='interview.completed', aggregate_id=id, payload={interview_id, version: 1})
        Orchestrator->>DB: COMMIT TRANSACTION
    end
    
    Outbox->>TQ: Outbox Publisher dispatches task to Taskiq
    Worker->>TQ: Dequeue "evaluate_interview" (idempotency_key: interview_id:v1)
    Worker->>DB: Check if assessment_reports (interview_id, version=1) exists (Idempotency)
    Worker->>DB: Fetch all finalized turns, blueprint, rubrics, and resume claims
    
    loop For each evaluated competency
        Worker->>LLM: Evaluate turns against 4-tier rubric criteria
        LLM-->>Worker: Validated RubricEvaluation { score, evidence_items: [ {turn_id, excerpt, codepoint_offsets, type, impact} ] }
        Worker->>Worker: Application Semantic Validation: turn.transcript[start:end] == excerpt
        Worker->>DB: INSERT INTO competency_scores (id, assessment_report_id, competency_id, score, status, rationale)
        loop For each evidence item
            Worker->>DB: INSERT INTO evaluation_evidence (competency_score_id, interview_turn_id, evidence_type, assessment_impact, transcript_excerpt, start_char_offset, end_char_offset)
        end
    end

    loop For each resume claim probed
        Worker->>LLM: Audit candidate responses vs claim assertion
        LLM-->>Worker: Validated ClaimVerification { status: "VERIFIED", confidence: 0.9, notes: "..." }
        Worker->>DB: INSERT INTO interview_claim_verifications (interview_id, resume_claim_id, verified_turn_id, status, auditor_notes)
    end

    Worker->>DB: INSERT INTO assessment_reports (interview_id, version=1, is_latest=TRUE, overall_score, summary, strengths, gaps)
    Worker->>Outbox: UPDATE outbox_events SET status='DISPATCHED', processed_at=NOW()
    Worker->>DB: COMMIT
    
    Browser->>DB: GET /api/v1/interviews/{id}/report
    DB-->>Browser: Full Dossier (Scores, Normalized Evidence rows, Verification Ledger, Gaps)
```

# Acceptance Criteria — CareerDiff

**Document Version:** 1.2.0  
**Status:** Approved Acceptance Criteria  

---

## 1. Candidate Management & Resume Intelligence

### AC-FR-001: User Authentication & Token Generation
```gherkin
Scenario: Successful user registration and login
  Given a candidate provides a valid email "alex@example.com" and a secure password
  When the client sends POST /api/v1/auth/register
  Then the response status must be 201 Created
  And the response body must contain a valid JWT access token and refresh token
  And the password must be stored as an argon2/bcrypt hash in the database.

Scenario: Registration with duplicate email
  Given an existing user with email "alex@example.com"
  When another registration request is sent with the same email
  Then the response status must be 409 Conflict
  And the error code must be "USER_ALREADY_EXISTS".
```

### AC-FR-002: Resume Ingestion & Validation
```gherkin
Scenario: Uploading a valid PDF resume
  Given an authenticated candidate
  When the candidate uploads a valid PDF file "resume.pdf" (< 10 MB) via POST /api/v1/resumes
  Then the response status must be 202 Accepted
  And a resume entity must be created with status "PENDING"
  And an outbox_event of type "resume.uploaded" must be committed in the same database transaction.

Scenario: Uploading an oversized or invalid file
  Given an authenticated candidate
  When the candidate uploads an executable file "resume.exe" or a file > 10 MB
  Then the response status must be 422 Unprocessable Entity
  And the error message must indicate unsupported media type or file size limit.
```

### AC-FR-004: Resume Claim Extraction with Unicode Provenance
```gherkin
Scenario: Extracting technical claims from work history
  Given a parsed resume containing text: "Migrated monolith to microservices using Kafka, handling 50k events/sec"
  When the LLM claim extractor processes the resume
  Then a ResumeClaim record must be persisted
  And the claim must contain exact Unicode codepoint character offsets (start_offset, end_offset) mapping to raw_extracted_text
  And the slice raw_extracted_text[start_offset:end_offset] must match the claim citation text
  And the claim must be classified as "EXPLICIT_FACT"
  And the claim must link to technologies ["Kafka", "microservices"].
```

---

## 2. Role Intelligence & Interview Planning

### AC-FR-009 & AC-FR-010: Blueprint Generation & Policy Configuration
```gherkin
Scenario: Generating a blueprint with configurable session policy
  Given an authenticated candidate with confirmed resume claims
  And a selected role "Backend Engineering" with Seniority "Senior" and duration 30 minutes
  And a configured InterviewPolicy with required_competency_ids = ["comp-distributed-systems"]
  When the candidate requests POST /api/v1/interviews
  Then the system must generate an InterviewBlueprint entity
  And the blueprint must allocate topic time budgets summing to exactly 30 minutes
  And "comp-distributed-systems" must be scheduled in the blueprint topics
  And the session_policy JSONB must store the active policy parameters.
```

---

## 3. Adaptive Interview Engine & Live Interpretation

### AC-FR-011: Structured Action Selection
```gherkin
Scenario: Candidate provides a shallow buzzword answer
  Given an active interview turn in the "TECHNICAL_CORE" state
  And the interviewer asked: "How did you guarantee order in your Kafka consumer?"
  When the candidate answers vaguely: "We just used consumer groups and it handled everything automatically"
  Then the LiveAnswerInterpreter must classify depth as "SHALLOW"
  And the Adaptive Decision Engine must NOT select CHANGE_TOPIC
  And the engine must select either "PROBE_DEEPER" or "CHALLENGE"
  And the resulting interviewer prompt must ask specifically about partition assignment or consumer rebalancing.
```

### AC-FR-014: Live Answer Interpreter Latency Budget, Boundary & Deterministic Fallback
```gherkin
Scenario: LiveAnswerInterpreter boundary and latency budget
  Given an active candidate turn where final transcript has been committed to PostgreSQL
  When LiveAnswerInterpreter executes
  Then the measurement starts at the moment the turn transcript is committed
  And the structured InterpretationResult must be produced within <= 600 ms TTFT (hypothesis)
  And it must not initiate rubric scoring or report generation
  And the conversation must proceed immediately to the next question.

Scenario: Deterministic fallback upon LLM timeout or 5xx outage
  Given an active candidate turn
  When the primary LLM provider times out after 600 ms or returns HTTP 429/503
  Then the engine must immediately abort the LLM call
  And the engine must select a pre-compiled question from the seeded role competency catalog for the current topic
  And the question must be delivered to TTS without dead air or stalling the interview session.
```

### AC-FR-013: Deterministic Policy Enforcement (Probe Saturation)
```gherkin
Scenario: Enforcing configurable maximum consecutive probes
  Given an active interview session with policy.max_consecutive_probes = 3
  And the engine has executed 3 consecutive "PROBE_DEEPER" actions on "Kafka Partitioning"
  When the candidate submits their next response
  Even if the LLM recommends "PROBE_DEEPER"
  Then the Policy Guardrail must override the LLM recommendation
  And the engine must force the action to "CHANGE_TOPIC" or "SCENARIO"
  And the session state must advance to the next planned blueprint competency.
```

### AC-FR-012: Turn Persistence Before State Advancement
```gherkin
Scenario: Durability invariant on speech turn finalization
  Given an active voice or text turn
  When candidate speech completes and the final transcript is verified
  Then the transcript turn must be committed to PostgreSQL with a monotonic turn_index
  Before the Adaptive Engine is invoked for next-action calculation
  And before any TTS synthesis is triggered.
```

---

## 4. Voice Pipeline & Real-Time Orchestration

### AC-FR-015 & AC-FR-016: WebSocket Connection & Linear PCM Streaming
```gherkin
Scenario: Connecting to the live interview WebSocket
  Given an interview session in "CREATED" or "PAUSED" state
  When the client connects to /ws/v1/interviews/{id} with a valid single-use ticket
  Then the server must consume and delete the ticket from Redis atomically (GETDEL)
  And the server must emit a "session_ready" JSON message
  And the server must accept inbound 50ms Linear PCM frames (16kHz 16-bit Mono)
  And the server must emit outbound 100ms Linear PCM frames (16kHz 16-bit Mono).
```

### AC-FR-018: Barge-In Interruption Preemption
```gherkin
Scenario: Candidate interrupts the interviewer during playback
  Given the server is streaming TTS audio frames to the client
  And the interviewer turn is actively playing through client speakers
  When the candidate begins speaking and client VAD detects voice energy
  Then the client must send a "speech_started" event over the WebSocket
  And the server must abort TTS synthesis
  And the server must send an "interviewer_interrupted" event to flush client audio buffers
  And the preemption must occur within the benchmark target budget (<= 150 ms).
```

---

## 5. Normalized Evaluation, Outbox & Reporting

### AC-FR-006: Transactional Outbox Job Enqueue & Short-Lived Leases
```gherkin
Scenario: Reliable background job creation and lease-based publishing
  Given an active interview session reaching conclusion
  When the orchestrator marks interview state as "COMPLETED"
  Then an outbox_event with event_type="interview.completed" must be committed in the exact same ACID database transaction
  And the outbox poller must claim rows using short-lived row leases (status = "CLAIMED", 30s TTL)
  And the poller must commit the claim transaction immediately before invoking broker network I/O
  And the outbox row must only transition to "PUBLISHED" upon explicit protocol-level acknowledgment from the broker
  And if the broker is unreachable or times out, the row must remain "CLAIMED" until lease expiry allows reclamation.
```

### AC-FR-022: Normalized Evidence Grounding & Codepoint Slice Validation
```gherkin
Scenario: Evaluator generating a competency score with normalized evidence
  Given a completed interview with 15 recorded turns
  When the background evaluation worker runs
  Then for every CompetencyScore generated:
    At least one EvaluationEvidence row must be persisted referencing an interview_turn_id
    And evaluation_evidence.transcript_excerpt must NOT be empty
    And the application-level semantic validator must verify that:
      turn.transcript[evidence.start_char_offset:evidence.end_char_offset] == evidence.transcript_excerpt
    And scores lacking verified evidence records must raise a ValidationError and be rejected from persistence.
```

### AC-FR-023: Differentiating Insufficient Evidence from Poor Performance
```gherkin
Scenario: Handling an unprobed competency
  Given an interview session where "Security & Authentication" was planned but could not be probed before session conclusion
  When the evaluation report is generated
  Then the CompetencyScore status must be recorded as "INSUFFICIENT_EVIDENCE"
  And the score column must be NULL (not 0 or 1)
  And the overall score calculation must exclude this competency from the weighted average.
```

### AC-FR-024: Resume Claim Verification Ledger
```gherkin
Scenario: Auditing verified vs contradicted resume claims
  Given a candidate resume claim: "Led migration to PostgreSQL 15, optimizing write latency by 40%"
  And in Turn 8 the candidate demonstrated detailed knowledge of WAL configuration and connection pooling
  When the claim auditor runs
  Then an interview_claim_verifications record must be created with status "VERIFIED"
  And the verification record must link directly to Turn 8
  And the confidence score must be >= 0.85.
```

### AC-FR-025: Outbox Lease Reclamation & Reconciliation Sweeper
```gherkin
Scenario: Reclaiming expired leases and reconciling orphaned evaluations
  Given an outbox event marked "CLAIMED" whose worker process terminated abnormally
  When 30 seconds elapse without publication acknowledgment
  Then claim_expires_at is exceeded
  And the next OutboxPoller run or Reconciliation Sweeper must reclaim the row and reset it to "PENDING"
  And if an evaluation event was marked "PUBLISHED" but no assessment report is generated within 10 minutes
  Then the Reconciliation Sweeper must re-enqueue the evaluation task with an incremented attempt count.
```

### AC-FR-026: Durable Worker Idempotency & Concurrent Report Serialization
```gherkin
Scenario: Enforcing durable idempotency across duplicate task deliveries
  Given an evaluation task delivered twice due to broker redelivery
  When the second worker execution starts
  Then the worker must check the durable PostgreSQL "worker_executions" table
  And seeing status "SUCCESS" for the idempotency key, it must exit immediately without invoking LLM calls.

Scenario: Safe report version generation under concurrent worker runs
  Given two concurrent worker runs attempting to compile a report for the same interview session
  When both workers execute report persistence
  Then an exclusive row-level lock on the parent interview session must serialize report creation
  And the second worker must generate version = 2 or exit via idempotency check
  And database unique constraints (uq_interview_report_version and uq_reports_latest) must prevent duplicate version conflicts.
```

---

## 6. Non-Functional Failure Injection & Resilience Criteria

### AC-NFR-008: Fault Injection & Distributed Resilience Matrix
```gherkin
Scenario Outline: Automated failure injection across distributed infrastructure
  Given a running local test cluster with PostgreSQL, Redis, OutboxPoller, and Taskiq workers
  When <failure_event> is injected during active interview evaluation
  Then <system_behavior> must be observed
  And <recovery_outcome> must be guaranteed.

  Examples:
    | failure_event | system_behavior | recovery_outcome |
    | Duplicate Event Enqueue | Worker checks worker_executions table | Exactly 1 report created, 0 duplicate LLM calls |
    | SIGKILL on Worker mid-LLM | Database transaction rolls back cleanly | Reconciliation Sweeper re-dispatches after 10m |
    | Redis FLUSHALL while idle | Redis queue empty, outbox records intact | OutboxPoller re-publishes pending/unACKed rows |
    | Broker Network Disconnect | OutboxPoller broker publish call times out | DB transaction not held open; lease expires safely |
    | Concurrent Report Generation | Two workers invoke report aggregation simultaneously | Parent row lock serializes versions 1 & 2 without collision |
```

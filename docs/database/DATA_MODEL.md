# Data Model & Schema Specification — CareerDiff

**Document Version:** 1.2.0  
**Status:** Approved Schema Specification  
**Database Engine:** PostgreSQL 16  
**ORM:** SQLAlchemy 2.0 (Async)  

---

## 1. Relational Modeling & Integrity Principles

1. **Normalized Evidence Modeling**: Rubric ratings are grounded in a normalized `evaluation_evidence` relation linking competency ratings to exact source turns, character offsets, evidence types, and impact classifications. Redundant per-turn evaluation tables (`turn_evaluations`) are eliminated.
2. **Transactional Outbox for Background Jobs**: State changes that trigger background processing (e.g. `interview.completed`) write to an `outbox_events` table in the exact same ACID transaction, eliminating dual-write inconsistencies.
3. **Report Versioning & Historical Immutability**:
   - Re-running an evaluation creates a new `assessment_reports` row with an incremented `version` and `is_latest = TRUE`, while demoting previous versions to `is_latest = FALSE`.
   - Historical evaluations, scores, and evidence rows are strictly append-only and never mutated.
4. **Character Offset Semantics**:
   - `resume_claims` (`start_offset`, `end_offset`) and `evaluation_evidence` (`start_char_offset`, `end_char_offset`) are defined as **0-indexed Unicode codepoints** (character offsets, not raw byte offsets).
   - Offsets are calculated against text normalized using **Unicode Normalization Form C (NFC)** with standardized Unix `\n` line endings.
5. **Database Constraints vs. Application-Level Semantic Validation**:
   - **Database Constraints**: Structural and relational invariants: UUID PKs, FK cascades/restricts, NOT NULL, CHECK constraints on enums, and offset boundaries `end_char_offset >= start_char_offset`.
   - **Application-Level Semantic Validation**: Pydantic v2 services verify that `transcript_excerpt` verbatim matches `turn.transcript[start_char_offset:end_char_offset]` before database write transactions.

---

## 2. Table Specifications

### 2.1 Identity & Candidate Module

#### `users`
Stores system accounts for candidates, recruiters, and platform administrators.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `email` | `VARCHAR(255)` | No | | Unique, Case-insensitive index |
| `hashed_password` | `VARCHAR(255)` | No | | Argon2 / Bcrypt password hash |
| `full_name` | `VARCHAR(100)` | No | | Candidate's legal name |
| `role` | `VARCHAR(20)` | No | `'CANDIDATE'` | Check: `IN ('CANDIDATE', 'RECRUITER', 'ADMIN')` |
| `is_active` | `BOOLEAN` | No | `TRUE` | Account active flag |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Modification timestamp |

**Indexes**:
- `CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));`

---

#### `candidate_profiles`
Maintains candidate-specific metadata, asserted seniority, and verified skill tags.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | No | | FK $\rightarrow$ `users(id)` ON DELETE CASCADE |
| `target_seniority` | `VARCHAR(20)` | No | `'MID'` | Check: `IN ('JUNIOR', 'MID', 'SENIOR', 'STAFF')` |
| `primary_discipline`| `VARCHAR(50)` | No | `'BACKEND'` | Check: `IN ('BACKEND', 'FRONTEND', 'FULLSTACK')` |
| `years_experience` | `INT` | Yes | `0` | Reported total years of experience |
| `verified_skills` | `JSONB` | No | `'[]'::jsonb` | Extracted confirmed skill list `["python", "kafka"]` |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | Modification timestamp |

---

### 2.2 Resume Intelligence Module

#### `resumes`
Metadata for uploaded resume documents.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `candidate_profile_id`| `UUID` | No | | FK $\rightarrow$ `candidate_profiles(id)` ON DELETE CASCADE |
| `original_filename`| `VARCHAR(255)` | No | | File name uploaded by candidate |
| `s3_key` | `VARCHAR(512)` | No | | Path in S3/MinIO bucket |
| `file_hash` | `CHAR(64)` | No | | SHA-256 hash of file content for dedup |
| `status` | `VARCHAR(20)` | No | `'PENDING'` | Check: `IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')` |
| `extraction_version`| `INT` | No | `1` | Incrementing version of extraction parser |
| `raw_extracted_text`| `TEXT` | Yes | | Full Unicode NFC normalized text extracted via PyMuPDF |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Upload timestamp |

---

#### `resume_claims`
Atomic, testable assertions extracted from the candidate's resume with precise provenance.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `resume_id` | `UUID` | No | | FK $\rightarrow$ `resumes(id)` ON DELETE CASCADE |
| `claim_text` | `TEXT` | No | | Extracted claim sentence |
| `category` | `VARCHAR(30)` | No | | Check: `IN ('EXPLICIT_FACT', 'INFERRED_SKILL', 'VAGUE_CLAIM')` |
| `source_section` | `VARCHAR(50)` | No | | e.g., `'Experience: Stripe 2021-2023'` |
| `start_offset` | `INT` | No | | Unicode codepoint start index in raw_extracted_text |
| `end_offset` | `INT` | No | | Unicode codepoint end index in raw_extracted_text |
| `technologies` | `TEXT[]` | No | `'{}'` | Array of mentioned tech: `{"Kafka", "Postgres"}` |
| `confidence_score`| `REAL` | No | `1.0` | Extractor confidence (0.0 – 1.0) |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Extraction timestamp |

**Constraints & Indexes**:
- `CONSTRAINT chk_claim_offsets CHECK (end_offset >= start_offset)`
- `CREATE INDEX idx_resume_claims_resume ON resume_claims (resume_id);`

---

### 2.3 Role & Rubric Library

#### `job_roles`
Defines available engineering tracks.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `name` | `VARCHAR(100)` | No | | Unique role name (`'Backend Engineering'`) |
| `slug` | `VARCHAR(100)` | No | | URL slug (`'backend-engineering'`) |
| `description` | `TEXT` | Yes | | Role definition summary |
| `is_active` | `BOOLEAN` | No | `TRUE` | Active flag |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp |

---

#### `competencies`
High-level technical domains associated with a job role.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `role_id` | `UUID` | No | | FK $\rightarrow$ `job_roles(id)` ON DELETE RESTRICT |
| `name` | `VARCHAR(100)` | No | | e.g., `'Distributed Systems & Concurrency'` |
| `slug` | `VARCHAR(100)` | No | | e.g., `'distributed-systems'` |
| `description` | `TEXT` | Yes | | Competency description |
| `display_order` | `INT` | No | `0` | Sequencing order |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp |

---

#### `rubrics` & `rubric_criteria`
Immutable, versioned evaluation rubrics.

```sql
CREATE TABLE rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rubric_competency_version UNIQUE (competency_id, version)
);

CREATE TABLE rubric_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    tier_level INT NOT NULL CHECK (tier_level BETWEEN 1 AND 4),
    tier_name VARCHAR(30) NOT NULL CHECK (tier_name IN ('UNSATISFACTORY', 'BASIC', 'PROFICIENT', 'ADVANCED')),
    observable_criteria TEXT NOT NULL,
    sample_answer_gist TEXT,
    CONSTRAINT uq_rubric_tier UNIQUE (rubric_id, tier_level)
);
```

---

### 2.4 Interview Session & Turn Loop

#### `interviews`
Represents an individual scheduled, active, or completed interview session with configurable policy.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `candidate_profile_id`| `UUID` | No | | FK $\rightarrow$ `candidate_profiles(id)` |
| `role_id` | `UUID` | No | | FK $\rightarrow$ `job_roles(id)` |
| `target_seniority` | `VARCHAR(20)` | No | `'SENIOR'` | Seniority tier |
| `state` | `VARCHAR(30)` | No | `'CREATED'` | Check: `IN ('CREATED', 'INITIALIZING', 'WARMUP', 'TECHNICAL_CORE', 'CONCLUDING', 'COMPLETED', 'PAUSED', 'ABORTED')` |
| `mode` | `VARCHAR(20)` | No | `'VOICE'` | Check: `IN ('VOICE', 'TEXT')` |
| `scheduled_duration_minutes`| `INT` | No | `30` | Target duration |
| `actual_duration_seconds`| `INT` | No | `0` | Cumulative elapsed time |
| `session_policy` | `JSONB` | No | `'{}'::jsonb` | Configurable policy object |
| `started_at` | `TIMESTAMPTZ` | Yes | | Session start |
| `finished_at` | `TIMESTAMPTZ` | Yes | | Session finish |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp |

---

#### `interview_turns`
Immutable sequence of candidate and interviewer utterances.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `interview_id` | `UUID` | No | | FK $\rightarrow$ `interviews(id)` ON DELETE CASCADE |
| `turn_index` | `INT` | No | | Monotonic sequential counter (0, 1, 2...) |
| `speaker` | `VARCHAR(20)` | No | | Check: `IN ('CANDIDATE', 'INTERVIEWER', 'SYSTEM')` |
| `transcript` | `TEXT` | No | | Verbatim text transcript |
| `action_taken` | `VARCHAR(30)` | Yes | | EngineAction enum (for interviewer turns) |
| `interrupted` | `BOOLEAN` | No | `FALSE` | Flag indicating barge-in cutoff |
| `audio_duration_ms`| `INT` | Yes | | Duration of speech in ms |
| `latency_ms` | `INT` | Yes | | Turnaround latency in ms |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp |

**Constraints & Indexes**:
- `CONSTRAINT uq_turn_sequence UNIQUE (interview_id, turn_index)`
- `CREATE INDEX idx_turns_interview ON interview_turns (interview_id, turn_index);`

---

### 2.5 Normalized Evaluation & Reporting Module

#### `assessment_reports`
Versioned evaluation dossier compiled after interview completion.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `interview_id` | `UUID` | No | | FK $\rightarrow$ `interviews(id)` ON DELETE CASCADE |
| `version` | `INT` | No | `1` | Incrementing report version (1, 2...) |
| `is_latest` | `BOOLEAN` | No | `TRUE` | Indicates active report version |
| `prompt_version` | `INT` | No | `1` | Auditable prompt version |
| `rubric_version` | `INT` | No | `1` | Auditable rubric version |
| `model_used` | `VARCHAR(100)` | No | | Model identifier string from configuration |
| `overall_score` | `REAL` | Yes | | Weighted composite score (1.0 – 4.0) |
| `summary` | `TEXT` | No | | Executive technical overview |
| `strengths` | `JSONB` | No | `'[]'::jsonb` | List of demonstrated strengths |
| `knowledge_gaps` | `JSONB` | No | `'[]'::jsonb` | List of unverified or missed concepts |
| `study_recommendations`| `JSONB` | No | `'[]'::jsonb` | Curated reading list |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp |

**Constraints & Indexes**:
- `CONSTRAINT uq_interview_report_version UNIQUE (interview_id, version)`
- `CREATE UNIQUE INDEX uq_reports_latest ON assessment_reports (interview_id) WHERE is_latest = TRUE;`
- **Concurrency Safety Invariant**: Workers creating new report versions must acquire an exclusive row-level lock on the parent interview (`SELECT id FROM interviews WHERE id = :id FOR UPDATE`) or transactional advisory lock prior to version calculation (`MAX(version) + 1`), ensuring safe serialized execution under concurrent worker runs.

---

#### `competency_scores`
Individual dimension ratings representing aggregate performance on a competency for a specific report version.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `assessment_report_id`| `UUID` | No | | FK $\rightarrow$ `assessment_reports(id)` ON DELETE CASCADE |
| `competency_id` | `UUID` | No | | FK $\rightarrow$ `competencies(id)` |
| `score` | `INT` | Yes | | Score 1 – 4 (NULL if INSUFFICIENT_EVIDENCE) |
| `status` | `VARCHAR(30)` | No | | Check: `IN ('EVALUATED', 'INSUFFICIENT_EVIDENCE')` |
| `rationale` | `TEXT` | No | | Detailed scoring rationale |
| `confidence` | `REAL` | No | `1.0` | Confidence rating (0.0 – 1.0) |

**Constraints & Indexes**:
- `CONSTRAINT uq_report_competency UNIQUE (assessment_report_id, competency_id)`
- `CONSTRAINT chk_score_status_semantics CHECK ((status = 'INSUFFICIENT_EVIDENCE' AND score IS NULL) OR (status = 'EVALUATED' AND score BETWEEN 1 AND 4))`

---

#### `evaluation_evidence`
Normalized relation storing verbatim evidence items grounding each competency score in specific turns.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `competency_score_id`| `UUID` | No | | FK $\rightarrow$ `competency_scores(id)` ON DELETE CASCADE |
| `interview_turn_id` | `UUID` | No | | FK $\rightarrow$ `interview_turns(id)` ON DELETE RESTRICT |
| `evidence_type` | `VARCHAR(30)` | No | | Check: `IN ('POSITIVE_MASTERY', 'KNOWLEDGE_GAP', 'CONTRADICTION', 'SUPERFICIAL_EXPLANATION')` |
| `assessment_impact` | `VARCHAR(30)` | No | | Check: `IN ('UPWEIGHT', 'DOWNWEIGHT', 'NEUTRAL', 'DISQUALIFYING')` |
| `transcript_excerpt`| `TEXT` | No | | Verbatim text excerpt from the candidate turn |
| `start_char_offset` | `INT` | No | | Unicode codepoint start offset in turn transcript |
| `end_char_offset` | `INT` | No | | Unicode codepoint end offset in turn transcript |
| `evaluation_version`| `INT` | No | `1` | Version of the evaluation run |
| `confidence` | `REAL` | No | `1.0` | Evidence confidence score (0.0 – 1.0) |
| `rationale` | `TEXT` | No | | Explains why this excerpt justifies the impact |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp |

**Constraints & Indexes**:
- `CONSTRAINT chk_evidence_offsets CHECK (end_char_offset >= start_char_offset)`
- `CREATE INDEX idx_eval_evidence_score ON evaluation_evidence (competency_score_id);`
- `CREATE INDEX idx_eval_evidence_turn ON evaluation_evidence (interview_turn_id);`

---

#### `interview_claim_verifications`
The session-scoped ledger validating candidate resume claims against spoken answers in a specific interview.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `interview_id` | `UUID` | No | | FK $\rightarrow$ `interviews(id)` ON DELETE CASCADE |
| `resume_claim_id`| `UUID` | No | | FK $\rightarrow$ `resume_claims(id)` |
| `verified_turn_id`| `UUID` | Yes | | FK $\rightarrow$ `interview_turns(id)` |
| `status` | `VARCHAR(30)` | No | | Check: `IN ('VERIFIED', 'CONTRADICTED', 'VAGUE', 'UNTESTED')` |
| `confidence` | `REAL` | No | `1.0` | Verification confidence |
| `auditor_notes` | `TEXT` | Yes | | Agent audit commentary |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Timestamp |

**Constraints & Indexes**:
- `CONSTRAINT uq_interview_claim UNIQUE (interview_id, resume_claim_id)`

---

#### `outbox_events`
Transactional outbox ensuring at-least-once delivery of background jobs without holding transactions open during broker network calls.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `event_type` | `VARCHAR(100)` | No | | e.g. `'interview.completed'`, `'resume.uploaded'` |
| `aggregate_type` | `VARCHAR(50)` | No | | `'interview'`, `'resume'` |
| `aggregate_id` | `UUID` | No | | ID of target entity |
| `payload` | `JSONB` | No | | Full serializable event payload for worker consumer |
| `status` | `VARCHAR(20)` | No | `'PENDING'` | Check: `IN ('PENDING', 'CLAIMED', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')` |
| `retry_count` | `INT` | No | `0` | Number of dispatch attempts |
| `claimed_by` | `VARCHAR(100)` | Yes | | Worker/Poller instance ID holding active lease |
| `claimed_at` | `TIMESTAMPTZ` | Yes | | Timestamp when row was leased |
| `claim_expires_at`| `TIMESTAMPTZ` | Yes | | Lease expiration timestamp (`claimed_at + 30s`) |
| `published_at` | `TIMESTAMPTZ` | Yes | | Confirmed receipt timestamp from message broker |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Creation timestamp |

**Indexes**:
- `CREATE INDEX idx_outbox_claimable ON outbox_events (created_at) WHERE status IN ('PENDING', 'CLAIMED');`

---

#### `worker_executions`
Durable idempotency ledger in PostgreSQL preventing duplicate worker execution across broker redeliveries and Redis restarts.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `task_name` | `VARCHAR(100)` | No | | e.g. `'evaluate_interview'` |
| `idempotency_key` | `VARCHAR(255)` | No | | Unique composite key (e.g. `task:session_id:version`) |
| `aggregate_id` | `UUID` | No | | Reference to target entity (e.g. `interview_id`) |
| `status` | `VARCHAR(30)` | No | `'RUNNING'` | Check: `IN ('RUNNING', 'SUCCESS', 'FAILED')` |
| `started_at` | `TIMESTAMPTZ` | No | `NOW()` | Task execution start time |
| `completed_at` | `TIMESTAMPTZ` | Yes | | Task completion time |
| `result_reference`| `VARCHAR(255)`| Yes | | UUID or URI of produced entity (e.g. `report_id`) |
| `error_message` | `TEXT` | Yes | | Error message on failure |

**Constraints & Indexes**:
- `CONSTRAINT uq_worker_task_idempotency UNIQUE (task_name, idempotency_key)`
- `CREATE INDEX idx_worker_exec_running ON worker_executions (started_at) WHERE status = 'RUNNING';`

---

#### `audit_logs`
Immutable compliance and security ledger.

| Column | Type | Nullable | Default | Constraints & Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key |
| `user_id` | `UUID` | Yes | | FK $\rightarrow$ `users(id)` ON DELETE SET NULL |
| `action` | `VARCHAR(50)` | No | | e.g. `'CONSENT_GRANTED'`, `'REPORT_GENERATED'` |
| `resource_type` | `VARCHAR(50)` | No | | `'INTERVIEW'`, `'CANDIDATE_PROFILE'` |
| `resource_id` | `UUID` | Yes | | Target resource UUID |
| `details` | `JSONB` | No | `'{}'::jsonb` | Metadata payload |
| `ip_address` | `INET` | Yes | | Client IP address |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | Log timestamp |

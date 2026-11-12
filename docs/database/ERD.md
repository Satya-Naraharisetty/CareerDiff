# Entity Relationship Diagram (ERD) — CareerDiff

**Document Version:** 1.2.0  
**Status:** Approved Database Architecture  
**Database Engine:** PostgreSQL 16  

---

## 1. Visual Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ CANDIDATE_PROFILES : "has"
    USERS ||--o{ AUDIT_LOGS : "triggers"
    CANDIDATE_PROFILES ||--o{ RESUMES : "uploads"
    CANDIDATE_PROFILES ||--o{ INTERVIEWS : "attends"
    
    RESUMES ||--o{ RESUME_CLAIMS : "contains"
    
    JOB_ROLES ||--o{ COMPETENCIES : "defines"
    JOB_ROLES ||--o{ INTERVIEW_TEMPLATES : "structures"
    
    COMPETENCIES ||--o{ SUB_COMPETENCIES : "contains"
    COMPETENCIES ||--o{ RUBRICS : "evaluated_by"
    RUBRICS ||--o{ RUBRIC_CRITERIA : "contains"
    
    INTERVIEWS ||--o{ INTERVIEW_BLUEPRINTS : "guided_by"
    INTERVIEWS ||--o{ INTERVIEW_TURNS : "records"
    INTERVIEWS ||--o{ ASSESSMENT_REPORTS : "produces"
    INTERVIEWS ||--o{ INTERVIEW_CLAIM_VERIFICATIONS : "validates"
    INTERVIEWS ||--o{ OUTBOX_EVENTS : "emits"
    
    INTERVIEW_BLUEPRINTS ||--o{ BLUEPRINT_TOPICS : "partitions"
    BLUEPRINT_TOPICS }o--|| COMPETENCIES : "targets"
    
    ASSESSMENT_REPORTS ||--o{ COMPETENCY_SCORES : "aggregates"
    COMPETENCY_SCORES }o--|| COMPETENCIES : "rates"
    COMPETENCY_SCORES ||--o{ EVALUATION_EVIDENCE : "grounded_in"
    
    EVALUATION_EVIDENCE }o--|| INTERVIEW_TURNS : "cites"
    
    INTERVIEW_CLAIM_VERIFICATIONS }o--|| RESUME_CLAIMS : "references"
    INTERVIEW_CLAIM_VERIFICATIONS }o--o| INTERVIEW_TURNS : "evidenced_by"

    USERS {
        uuid id PK
        string email UK
        string hashed_password
        string full_name
        string role
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    CANDIDATE_PROFILES {
        uuid id PK
        uuid user_id FK
        string target_seniority
        string primary_discipline
        jsonb verified_skills
        timestamp created_at
        timestamp updated_at
    }

    RESUMES {
        uuid id PK
        uuid candidate_profile_id FK
        string original_filename
        string s3_key
        string file_hash
        string status
        int extraction_version
        text raw_extracted_text
        timestamp created_at
    }

    RESUME_CLAIMS {
        uuid id PK
        uuid resume_id FK
        text claim_text
        string category
        string source_section
        int start_offset
        int end_offset
        string[] technologies
        float confidence_score
        timestamp created_at
    }

    JOB_ROLES {
        uuid id PK
        string name UK
        string slug UK
        string description
        boolean is_active
        timestamp created_at
    }

    COMPETENCIES {
        uuid id PK
        uuid role_id FK
        string name
        string slug
        string description
        int display_order
        timestamp created_at
    }

    SUB_COMPETENCIES {
        uuid id PK
        uuid competency_id FK
        string name
        string description
        int display_order
    }

    RUBRICS {
        uuid id PK
        uuid competency_id FK
        int version
        boolean is_active
        timestamp created_at
    }

    RUBRIC_CRITERIA {
        uuid id PK
        uuid rubric_id FK
        int tier_level
        string tier_name
        text observable_criteria
        text sample_answer_gist
    }

    INTERVIEWS {
        uuid id PK
        uuid candidate_profile_id FK
        uuid role_id FK
        string target_seniority
        string state
        string mode
        int scheduled_duration_minutes
        int actual_duration_seconds
        jsonb session_policy
        timestamp started_at
        timestamp finished_at
        timestamp created_at
    }

    INTERVIEW_BLUEPRINTS {
        uuid id PK
        uuid interview_id FK, UK
        int total_topics
        float target_coverage_ratio
        timestamp created_at
    }

    BLUEPRINT_TOPICS {
        uuid id PK
        uuid blueprint_id FK
        uuid competency_id FK
        int allocated_seconds
        int order_index
        text planned_focus
        boolean was_covered
    }

    INTERVIEW_TURNS {
        uuid id PK
        uuid interview_id FK
        int turn_index
        string speaker
        text transcript
        string action_taken
        boolean interrupted
        int audio_duration_ms
        int latency_ms
        timestamp created_at
    }

    ASSESSMENT_REPORTS {
        uuid id PK
        uuid interview_id FK
        int version
        boolean is_latest
        int prompt_version
        int rubric_version
        string model_used
        float overall_score
        text summary
        jsonb strengths
        jsonb knowledge_gaps
        jsonb study_recommendations
        timestamp created_at
    }

    COMPETENCY_SCORES {
        uuid id PK
        uuid assessment_report_id FK
        uuid competency_id FK
        int score
        string status
        text rationale
        float confidence
    }

    EVALUATION_EVIDENCE {
        uuid id PK
        uuid competency_score_id FK
        uuid interview_turn_id FK
        string evidence_type
        string assessment_impact
        text transcript_excerpt
        int start_char_offset
        int end_char_offset
        int evaluation_version
        float confidence
        text rationale
        timestamp created_at
    }

    INTERVIEW_CLAIM_VERIFICATIONS {
        uuid id PK
        uuid interview_id FK
        uuid resume_claim_id FK
        uuid verified_turn_id FK
        string status
        float confidence
        text auditor_notes
        timestamp created_at
    }

    OUTBOX_EVENTS {
        uuid id PK
        string event_type
        string aggregate_type
        uuid aggregate_id
        jsonb payload
        string status
        int retry_count
        string claimed_by
        timestamp claimed_at
        timestamp claim_expires_at
        timestamp published_at
        timestamp created_at
    }

    WORKER_EXECUTIONS {
        uuid id PK
        string task_name
        string idempotency_key UK
        uuid aggregate_id
        string status
        timestamp started_at
        timestamp completed_at
        string result_reference
        text error_message
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        string action
        string resource_type
        uuid resource_id
        jsonb details
        string ip_address
        timestamp created_at
    }
```

---

## 2. Relational Integrity Architecture

1. **Clarification of Evaluation Modeling**:
   - `TURN_EVALUATIONS` has been removed. Single turns are not graded in isolation.
   - Live turns (`INTERVIEW_TURNS`) record the immediate conversation.
   - Post-interview evaluation produces an immutable, versioned `ASSESSMENT_REPORTS` row (`UNIQUE (interview_id, version)` and `UNIQUE (interview_id) WHERE is_latest = TRUE`).
   - `COMPETENCY_SCORES` represents the aggregate rating per competency for that report version (`UNIQUE (assessment_report_id, competency_id)`).
   - `EVALUATION_EVIDENCE` normalizes verbatim excerpts, character offsets, evidence types, and impacts linking back to specific turns.
2. **Cross-Interview Isolation**:
   - Claim verifications are scoped per session in `INTERVIEW_CLAIM_VERIFICATIONS (interview_id, resume_claim_id)`.
   - Evidence records must belong to turns within the same interview as the report.
3. **Transactional Outbox (`OUTBOX_EVENTS`) & Worker Idempotency (`WORKER_EXECUTIONS`)**:
   - Guaranteed **At-Least-Once Delivery** of background evaluation jobs without dual-write race conditions.
   - Rows are claimed using short-lived row leases (`claim_expires_at`) committing immediately to avoid holding open DB transactions during broker network calls.
   - Consumer idempotency is durably enforced in PostgreSQL via `WORKER_EXECUTIONS (task_name, idempotency_key)`.
   - Concurrent report version creation is safely serialized via exclusive row-level locking on the parent session.

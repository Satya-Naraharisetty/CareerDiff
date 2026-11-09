# REST API Specification — IntervueX

**Document Version:** 1.0.0  
**Status:** Approved OpenAPI / REST Specification  
**Base URL:** `https://api.intervuex.com/api/v1`  

---

## 1. Authentication & User Management

### `POST /auth/register`
Creates a new candidate or recruiter account.
- **Request Body**:
  ```json
  {
    "email": "alex.rivera@example.com",
    "password": "SecurePassword123!",
    "full_name": "Alex Rivera"
  }
  ```
- **Responses**:
  - `201 Created`: `{ "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", "email": "alex.rivera@example.com" }`
  - `409 Conflict`: Email already exists.

### `POST /auth/login`
Authenticates credentials and returns a short-lived JWT access token and HTTP-only refresh cookie.
- **Request Body**:
  ```json
  {
    "email": "alex.rivera@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Responses**:
  - `200 OK`:
    ```json
    {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
      "token_type": "bearer",
      "expires_in": 900
    }
    ```

---

## 2. Candidate & Resume Intelligence

### `POST /resumes`
Uploads a candidate resume (PDF/DOCX) for asynchronous extraction.
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Form Data**: `file` (binary PDF/DOCX, max 10MB)
- **Responses**:
  - `202 Accepted`:
    ```json
    {
      "resume_id": "4a72d3e1-7788-4444-9999-123456789abc",
      "status": "PENDING",
      "filename": "Alex_Rivera_Staff_Backend.pdf"
    }
    ```

### `GET /resumes/{id}`
Retrieves extracted structured profile and testable claims with source character offsets.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "resume_id": "4a72d3e1-7788-4444-9999-123456789abc",
      "status": "PROCESSED",
      "claims": [
        {
          "id": "c1f7a284-90aa-4333-8888-abcdef123456",
          "claim_text": "Architected low-latency Kafka pipeline processing 50k events/sec",
          "category": "EXPLICIT_FACT",
          "source_section": "Experience: Stripe",
          "start_offset": 450,
          "end_offset": 515,
          "technologies": ["Kafka", "Distributed Systems"]
        }
      ]
    }
    ```

---

## 3. Role & Competency Intelligence

### `GET /roles`
Lists all available target engineering roles.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "items": [
        {
          "id": "e3b0c442-98fc-1c14-9afbf4c8996fb924",
          "name": "Backend Engineering",
          "slug": "backend-engineering",
          "description": "Distributed systems, databases, caching, and API design"
        }
      ]
    }
    ```

---

## 4. Interview Session Management

### `POST /interviews`
Initializes a new interview session and generates the deterministic interview blueprint.
- **Request Body**:
  ```json
  {
    "role_id": "e3b0c442-98fc-1c14-9afbf4c8996fb924",
    "target_seniority": "SENIOR",
    "duration_minutes": 30,
    "mode": "VOICE"
  }
  ```
- **Responses**:
  - `201 Created`:
    ```json
    {
      "interview_id": "8f8b34e5-9c22-4411-aaee-567890abcdef",
      "state": "CREATED",
      "scheduled_duration_minutes": 30,
      "blueprint": {
        "total_topics": 3,
        "topics": [
          { "name": "Distributed Storage & Kafka", "allocated_seconds": 600 },
          { "name": "Database Concurrency & Locking", "allocated_seconds": 600 },
          { "name": "API Architecture & Resilience", "allocated_seconds": 360 }
        ]
      }
    }
    ```

### `POST /interviews/{id}/ws-ticket`
Generates a short-lived (60s) single-use authorization ticket to initiate the WebSocket stream.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "ticket": "v4.ticket.3g7H8K9L...",
      "websocket_url": "wss://api.intervuex.com/ws/v1/interviews/8f8b34e5-9c22-4411-aaee-567890abcdef?ticket=v4.ticket.3g7H8K9L...",
      "expires_in_seconds": 60
    }
    ```

---

## 5. Turns, Evaluation & Assessment Dossiers

### `GET /interviews/{id}/turns`
Retrieves the complete immutable transcript timeline for an interview.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "interview_id": "8f8b34e5-9c22-4411-aaee-567890abcdef",
      "turns": [
        {
          "turn_index": 0,
          "speaker": "INTERVIEWER",
          "transcript": "Hello Alex! To kick things off, could you tell me about the Kafka architecture you led at Stripe?",
          "action_taken": "VERIFY_CLAIM",
          "created_at": "2026-06-01T10:00:05Z"
        },
        {
          "turn_index": 1,
          "speaker": "CANDIDATE",
          "transcript": "Sure. We were experiencing severe partition hot-spotting because of skewed customer IDs...",
          "audio_duration_ms": 14200,
          "created_at": "2026-06-01T10:00:20Z"
        }
      ]
    }
    ```

### `GET /interviews/{id}/report`
Retrieves the completed evaluation report with rubric grounding and claim verification.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "report_id": "1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
      "overall_score": 3.4,
      "summary": "Candidate demonstrated Staff-level intuition regarding distributed systems and Kafka internals...",
      "competency_scores": [
        {
          "competency": "Distributed Systems & Streaming",
          "score": 4,
          "status": "EVALUATED",
          "verbatim_quotes": [
            "We configured min.insync.replicas=2 and handled partition skew via salt keys."
          ],
          "rationale": "Demonstrated deep mastery of Kafka broker replication semantics and hot partition mitigation."
        }
      ],
      "claim_verifications": [
        {
          "claim_text": "Architected low-latency Kafka pipeline processing 50k events/sec",
          "status": "VERIFIED",
          "confidence": 0.95
        }
      ]
    }
    ```

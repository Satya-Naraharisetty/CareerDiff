# Error Handling & Problem Details — IntervueX

**Document Version:** 1.0.0  
**Status:** Approved Standard  
**Format Standard:** RFC 7807 Problem Details  

---

## 1. Standard Error Envelope (RFC 7807)

Every non-2xx HTTP error returned by the IntervueX REST API follows the standardized RFC 7807 Problem Details envelope with `Content-Type: application/problem+json`:

```json
{
  "type": "https://api.intervuex.com/errors/interview-state-conflict",
  "title": "Interview State Conflict",
  "status": 409,
  "detail": "Cannot transition interview to TECHNICAL_CORE before warmup is completed.",
  "instance": "/api/v1/interviews/8f8b34e5-9c22-4411-aaee-567890abcdef/transition",
  "code": "INTERVIEW_STATE_CONFLICT",
  "timestamp": "2026-06-01T12:00:00Z",
  "invalid_fields": null
}
```

---

## 2. Validation Error Envelope (422 Unprocessable Entity)

When client input fails Pydantic schema validation, the envelope includes field-level violations:

```json
{
  "type": "https://api.intervuex.com/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "Request payload contains 2 invalid fields.",
  "instance": "/api/v1/interviews",
  "code": "VALIDATION_ERROR",
  "timestamp": "2026-06-01T12:00:00Z",
  "invalid_fields": [
    {
      "field": "duration_minutes",
      "issue": "Input must be greater than or equal to 15."
    },
    {
      "field": "target_seniority",
      "issue": "Input must be one of: 'JUNIOR', 'MID', 'SENIOR', 'STAFF'."
    }
  ]
}
```

---

## 3. Standard System Error Codes

| Error Code | HTTP Status | Meaning & Recommended Client Action |
| :--- | :--- | :--- |
| `UNAUTHORIZED` | 401 | Missing or expired JWT. Redirect to `/login`. |
| `FORBIDDEN` | 403 | Authenticated user lacks permission to view resource. |
| `RESOURCE_NOT_FOUND` | 404 | Requested entity ID does not exist. |
| `USER_ALREADY_EXISTS` | 409 | Attempting to register with an existing email. |
| `INTERVIEW_STATE_CONFLICT`| 409 | Illegal state transition requested (e.g. starting an already completed session). |
| `FILE_TOO_LARGE` | 413 | Uploaded resume exceeds 10MB limit. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | File format is not valid PDF or DOCX. |
| `VALIDATION_ERROR` | 422 | Pydantic payload validation failure. |
| `RATE_LIMITED` | 429 | Redis token bucket exhausted. Back off and retry. |
| `PROVIDER_UNAVAILABLE` | 503 | External AI API is down. UI will retry or use fallback mode. |

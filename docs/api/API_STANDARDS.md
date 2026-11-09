# API Design Standards & Conventions — IntervueX

**Document Version:** 1.0.0  
**Status:** Approved Standard  
**Base URL:** `/api/v1`  

---

## 1. RESTful Design Principles

1. **Resource-Oriented URIs**: Use plural nouns representing entities (`/api/v1/interviews`, `/api/v1/candidates`, `/api/v1/resumes`). Avoid verbs in endpoints (use HTTP methods: `GET`, `POST`, `PUT`, `DELETE`).
2. **Predictable Case Conventions**:
   - URL Paths: Lowercase kebab-case (e.g. `/api/v1/candidate-profiles`).
   - JSON Request & Response Bodies: Strict `snake_case` across all API payloads to maintain consistency with Python backend conventions:
     ```json
     {
       "candidate_profile_id": "c1f7a2...",
       "target_seniority": "SENIOR"
     }
     ```
3. **Idempotency Keys for State Mutations**:
   - State-altering `POST` endpoints (e.g. initiating an interview or creating a session) support the `Idempotency-Key: <UUID>` header.
   - If a network retry occurs with the same key within 24 hours, the server returns the cached response without creating duplicate sessions.

---

## 2. Standard HTTP Methods & Status Codes

| HTTP Method | Usage | Expected Status Codes |
| :--- | :--- | :--- |
| `GET` | Retrieve resource(s) | `200 OK`, `404 Not Found` |
| `POST` | Create resource or execute non-idempotent action | `201 Created`, `202 Accepted` (for async jobs), `400 Bad Request`, `422 Unprocessable Entity` |
| `PUT` | Complete replacement or state mutation | `200 OK`, `404 Not Found`, `409 Conflict` |
| `PATCH` | Partial resource update | `200 OK`, `404 Not Found` |
| `DELETE` | Remove resource (hard or soft) | `204 No Content`, `404 Not Found` |

---

## 3. Pagination & Cursor Standards

List endpoints returning collections use cursor-based pagination for high performance and stability:

```text
GET /api/v1/interviews?limit=20&cursor=eyJjcmVhdGVkX2F0IjoxNzE4...
```

### Standard Paginated Envelope:
```json
{
  "items": [ ... ],
  "meta": {
    "limit": 20,
    "has_more": true,
    "next_cursor": "eyJjcmVhdGVkX2F0IjoxNzE4..."
  }
}
```

---

## 4. Rate Limiting Headers

Every API response includes standard IETF rate-limiting headers powered by Redis token buckets:
- `X-RateLimit-Limit`: Maximum requests permitted per window (e.g. `60`).
- `X-RateLimit-Remaining`: Remaining request quota in current window (e.g. `45`).
- `X-RateLimit-Reset`: UTC epoch seconds when the quota resets (e.g. `1718000060`).
- If exceeded, the server returns `429 Too Many Requests` with a `Retry-After: <seconds>` header.

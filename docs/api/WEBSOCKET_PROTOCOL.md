# WebSocket Protocol Specification — IntervueX

**Document Version:** 1.0.0  
**Status:** Approved Real-Time Protocol Specification  
**Endpoint:** `/ws/v1/interviews/{interview_id}`  

---

## 1. Connection Handshake & Authentication

To prevent token leakage in server logs, clients do not pass JWTs directly in query parameters. Connections require an ephemeral **Resumption Ticket** obtained via `POST /api/v1/interviews/{id}/ws-ticket`.

### Handshake URL
```text
wss://api.intervuex.com/ws/v1/interviews/8f8b34e5-9c22-4411-aaee-567890abcdef?ticket=v4.ticket.3g7H8K9L...
```

### Handshake Invariants:
1. The server atomically validates and deletes the ticket from Redis (`GETDEL`).
2. If invalid or expired ($>60$ seconds), the server immediately closes the connection with code `4401 Unauthorized`.
3. Upon successful validation, the server emits `session_ready`.

---

## 2. Frame Framing Strategy: Binary vs. JSON

The WebSocket multiplexes two frame types:
1. **Binary Frames (`opcode 0x02`)**: Used exclusively for raw PCM audio chunks to minimize protocol overhead.
   - Inbound (Client $\rightarrow$ Server): 50 ms 16kHz 16-bit Mono PCM chunks (1,600 bytes).
   - Outbound (Server $\rightarrow$ Client): Streaming synthesized audio chunks (PCM / MP3 chunks).
2. **Text Frames (`opcode 0x01`)**: Used for structured control messages, partial transcripts, state changes, and heartbeat telemetry (UTF-8 encoded JSON).

---

## 3. Client-to-Server Message Contracts (Text JSON)

### 3.1 Speech Started (Interruption Signal)
Dispatched immediately when the client-side VAD detects candidate voice energy during interviewer playback.
```json
{
  "type": "speech_started",
  "client_timestamp_ms": 1718000005120
}
```

### 3.2 Speech Stopped
Dispatched when client detects trailing silence.
```json
{
  "type": "speech_stopped",
  "client_timestamp_ms": 1718000012450
}
```

### 3.3 Text Input (Fallback Mode)
Used when candidate is in keyboard fallback mode or submitting code snippets.
```json
{
  "type": "text_input",
  "turn_index": 4,
  "text": "We solved cache thundering herd using singleflight request coalescing."
}
```

### 3.4 Client Heartbeat / Ping
Dispatched every 10 seconds to maintain NAT keepalive.
```json
{
  "type": "ping",
  "timestamp": 1718000010000
}
```

---

## 4. Server-to-Client Message Contracts (Text JSON)

### 4.1 Session Ready
Emitted immediately upon successful connection establishment.
```json
{
  "type": "session_ready",
  "interview_id": "8f8b34e5-9c22-4411-aaee-567890abcdef",
  "current_turn_index": 0,
  "state": "WARMUP",
  "remaining_seconds": 1800
}
```

### 4.2 Partial Transcript
Emitted in real-time as the candidate speaks so the UI can display live speech feedback.
```json
{
  "type": "transcript_partial",
  "turn_index": 3,
  "text": "We used Kafka consumer groups to..."
}
```

### 4.3 Final Transcript Confirmed
Emitted when turn silence is finalized and the turn is committed to PostgreSQL.
```json
{
  "type": "transcript_final",
  "turn_index": 3,
  "speaker": "CANDIDATE",
  "text": "We used Kafka consumer groups to distribute partition processing across worker nodes.",
  "duration_ms": 6400
}
```

### 4.4 Interviewer Speaking
Notifies the client that the interviewer is formulating/speaking a question.
```json
{
  "type": "interviewer_speaking",
  "turn_index": 4,
  "action": "CHALLENGE",
  "question_text": "What happens if a worker crashes during consumer rebalance?"
}
```

### 4.5 Interviewer Interrupted
Emitted when candidate barge-in has successfully aborted server TTS generation.
```json
{
  "type": "interviewer_interrupted",
  "turn_index": 4,
  "cutoff_timestamp_ms": 1718000014200
}
```

### 4.6 State Change Event
Notifies client of macro-level interview transitions.
```json
{
  "type": "state_change",
  "previous_state": "WARMUP",
  "new_state": "TECHNICAL_CORE",
  "active_competency": "Distributed Systems"
}
```

### 4.7 Session Error
```json
{
  "type": "error",
  "code": "PROVIDER_TIMEOUT",
  "message": "AI speech provider encountered transient latency. Switched to fallback mode.",
  "fatal": false
}
```

---

## 5. WebSocket Close Codes

| Close Code | Reason | Reconnect Allowed? |
| :--- | :--- | :--- |
| `1000` | Normal session conclusion (`COMPLETED`). | No |
| `4401` | Unauthorized (Invalid or expired ticket). | Yes (after fetching new ticket) |
| `4409` | Concurrent session conflict (Already connected elsewhere). | No |
| `4429` | Audio bandwidth rate limit exceeded. | No |
| `4500` | Unrecoverable internal orchestrator error. | Yes (with resumption token) |

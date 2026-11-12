# CareerDiff Engineering Curriculum & Learning Path

**Document Version:** 1.0.0  
**Status:** Active Learning Curriculum  

---

## 1. Educational Mission & Philosophy

The primary objective of CareerDiff is not merely to build a commercial software product. It is to transform you into a **self-sufficient, production-grade systems engineer and AI architect** who deeply understands:
- How asynchronous event loops handle thousands of concurrent streaming connections.
- How deterministic state machines constrain probabilistic AI models.
- How audio buffers, Voice Activity Detection, and WebSockets interact in real-time browser engineering.
- How relational databases ensure auditability and transactional integrity.
- How to systematically diagnose, benchmark, and debug complex distributed systems.

---

## 2. Phase-by-Phase Learning Modules

### Module 0: Foundation & Developer Environment
- **Core Concepts**: Asynchronous Python (`asyncio`, Event Loops, Coroutines vs Threads), Modern Package Management with `uv`, Docker Compose networking.
- **Mental Model**: An async event loop is like a single highly organized chef who puts water to boil, immediately chops onions while waiting, and returns to the pot the millisecond it boils—never standing idle.
- **Self-Check Questions**:
  1. What happens if you call `time.sleep(5)` inside an `async def` route in FastAPI? (Hint: It blocks the entire thread, halting all concurrent requests!).
  2. How does `asyncio.gather()` differ from running sequential `await` statements?

---

### Module 1: Identity, Relational Modeling & Resume Intelligence
- **Core Concepts**: Relational DB Normalization, Composite Unique Constraints, GIN Indexes for Array/JSONB columns, Schema-Constrained LLM Parsing with Pydantic v2.
- **Mental Model**: Treat LLMs as untrusted, stochastic text generators. Never accept raw strings; force them to emit JSON conforming to strict Pydantic models with automated schema validation.
- **Self-Check Questions**:
  1. Why do we store resume character offsets (`start_offset`, `end_offset`) for extracted claims? (Provenance: we can prove to the user exactly where the text came from).
  2. Why shouldn't we just store the entire extracted resume as a raw JSON blob in PostgreSQL?

---

### Module 2: Deterministic State Machines & Interview Blueprinting
- **Core Concepts**: Finite State Machines (FSM), State Transition Tables, Time-Partitioning Algorithms, Guardrail Invariants.
- **Mental Model**: Think of the interview engine as a train on a track. The LLM can decide what scenery to describe, but the deterministic state machine switches the tracks and stops the train when time is up.
- **Self-Check Questions**:
  1. What is an illegal state transition, and how do we prevent it in code?
  2. Why must the engine enforce a maximum of 3 consecutive probes on a single sub-competency?

---

### Module 3: Adaptive Decision Engine & Asynchronous Evaluation
- **Core Concepts**: Closed Action Spaces, Prompt Delimiter Fencing, Decoupled Background Workers (ARQ vs Celery), Evidence-Grounded Rubrics.
- **Mental Model**: The Interviewer asks questions with sub-second latency; the Evaluator grades answers in the background. An interviewer who grades every question during the live conversation causes awkward silence.
- **Self-Check Questions**:
  1. Why do we require verbatim transcript quotes in the evaluation schema?
  2. What is the difference between `INCORRECT_ANSWER` and `INSUFFICIENT_EVIDENCE`?

---

### Module 4: Real-Time Audio Streaming, VAD & WebSockets
- **Core Concepts**: PCM Audio Chunks, Sampling Rates (16kHz 16-bit Mono), Voice Activity Detection (Energy & Machine Learning VAD), WebSocket Frame Multiplexing, Barge-in Preemption.
- **Mental Model**: Streaming audio is like a conveyor belt of small water buckets (50ms frames). VAD looks at each bucket to see if it contains sound energy or silence.
- **Self-Check Questions**:
  1. Why do we use Linear PCM instead of MP3 for streaming microphone audio to VAD and STT?
  2. How does client-side VAD achieve $\le 150$ ms barge-in cutoff?

---

### Module 5: Observability, Hardening & Benchmarking
- **Core Concepts**: Token-Bucket Rate Limiting, STRIDE Threat Modeling, Circuit Breakers, Synthetic Replay Benchmarking.
- **Mental Model**: Reliability is not about hoping third-party APIs never fail; it is about designing the system so that when they do fail, the user barely notices.

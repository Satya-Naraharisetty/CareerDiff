# Debugging & Operational Troubleshooting Guide — CareerDiff

**Document Version:** 1.0.0  
**Status:** Approved Engineering Playbook  

---

## 1. Playbook 1: Debugging WebSocket Audio Latency & Jitter

### Symptoms
Candidate reports voice delays $> 2,500$ ms, choppy audio playback, or delayed transcription.

### Step-by-Step Diagnostic Sequence
1. **Inspect Network Round-Trip Time**:
   - Check WebSocket `ping` / `pong` latency in browser DevTools Network tab. If RTT $> 150$ ms, the bottleneck is candidate network latency.
2. **Inspect Server VAD Trigger Offsets**:
   - Check server logs for `[VAD_SPEECH_PAUSE]` timestamps. Verify that silence threshold is calibrated to 1,200 ms (not 2,500 ms).
3. **Inspect STT Provider Turnaround**:
   - Log timestamp delta: `t_stt_final - t_vad_pause`. Should be $< 300$ ms.
4. **Inspect LLM Time-To-First-Token (TTFT)**:
   - Check `turn_latency_ms` in `interview_turns`. If TTFT $> 1,200$ ms, verify that prompt context tokens are strictly $< 1,800$ tokens and not sending full unbounded history.
5. **Inspect TTS Streaming**:
   - Verify that TTS client uses chunked streaming playback rather than waiting for full audio generation before sending frames.

---

## 2. Playbook 2: Debugging LLM Schema Validation Failures

### Symptoms
Server logs `PydanticValidationError` or unexpected fallback actions (`CHANGE_TOPIC` triggered prematurely).

### Diagnostic Sequence
1. Enable debug logging: `LOG_LEVEL=DEBUG`.
2. Inspect the raw text output from the LLM before Pydantic parsing:
   ```python
   logger.debug("Raw LLM Response: %s", raw_completion)
   ```
3. Common Root Causes:
   - **Markdown code blocks**: Some models enclose JSON in ` ```json ... ``` `. Ensure the JSON sanitizer strips markdown delimiters before calling `model_validate_json()`.
   - **Missing Required Evidence**: The model scored a competency but omitted the `verbatim_evidence` array. Ensure the system prompt emphasizes that ungrounded scores fail validation.
   - **Prompt drift**: Check that the model temperature is set to $\le 0.2$ for deterministic structured outputs.

---

## 3. Playbook 3: Debugging Database Pool Exhaustion

### Symptoms
FastAPI coroutines raise `asyncpg.exceptions.TooManyConnectionsError` or `TimeoutError: QueuePool limit of size 20 overflow 10 reached`.

### Diagnostic Sequence
1. Check active PostgreSQL connections:
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```
2. Inspect connection leaks in FastAPI handlers:
   - Ensure every database session dependency uses context-managed async generators:
     ```python
     async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
         async with async_session_factory() as session:
             yield session
     ```
   - Never create unbounded background coroutines that hold onto a database session without releasing it back to the pool.

---

## 4. Playbook 4: Inspecting Redis Session Cache & Task Queues

### Useful Diagnostic CLI Commands
```bash
# Connect to Redis container
docker compose exec redis redis-cli

# Check active session ticket keys
KEYS "ticket:*"

# Check pending ARQ background evaluation jobs
LLEN "arq:queue"

# Monitor real-time Redis commands
MONITOR
```

# Debugging Lessons & Post-Mortem Ledger — CareerDiff

This document serves as our knowledge base of debugging discoveries, unexpected failure modes, and permanent engineering lessons learned across development.

---

## Lesson 001: Blocking the Async Event Loop with Synchronous Calls
- **Symptom**: During high-concurrency WebSocket testing, latency across all connected clients suddenly spikes from 200 ms to 5,000+ ms.
- **Root Cause**: Calling a synchronous blocking function (e.g. `time.sleep()`, standard `requests.get()`, or unthreaded file I/O like `open().read()`) inside an `async def` route handler. Because Python `asyncio` runs on a single OS thread by default, a blocking call stalls all other concurrent coroutines.
- **Diagnostic Step**: Run Python in debug mode (`PYTHONASYNCIODEBUG=1`) or use `asyncio.get_event_loop().slow_callback_duration = 0.1` to log callbacks taking longer than 100 ms.
- **Resolution**: Use non-blocking async libraries (`asyncio.sleep()`, `httpx.AsyncClient()`, `aiofiles`) or offload CPU-heavy blocking work to an executor:
  ```python
  loop = asyncio.get_running_loop()
  result = await loop.run_in_executor(None, synchronous_blocking_function, arg)
  ```

---

## Lesson 002: Leaking Audio Context Nodes in Web Audio API
- **Symptom**: Browser tab memory continuously grows by ~50 MB every minute during active voice interviews, eventually crashing the tab.
- **Root Cause**: Creating new `AudioBufferSourceNode` or `ScriptProcessorNode` instances on every incoming PCM chunk without calling `.disconnect()` when playback finishes.
- **Diagnostic Step**: Open Chrome DevTools $\rightarrow$ Memory tab $\rightarrow$ Take Heap Snapshot $\rightarrow$ Filter by `AudioNode`.
- **Resolution**: Listen to the `onended` event of every audio buffer source node and explicitly call `source.disconnect()` to release Web Audio resources:
  ```typescript
  source.onended = () => {
    source.disconnect();
  };
  ```

---

## Lesson 003: Database Deadlocks from Unordered Lock Acquisition
- **Symptom**: Background evaluation worker raises `asyncpg.exceptions.DeadlockDetectedError` when updating competency scores and claim verifications simultaneously.
- **Root Cause**: Two concurrent tasks acquired row locks in opposite order (Task A: Competencies $\rightarrow$ Claims; Task B: Claims $\rightarrow$ Competencies).
- **Diagnostic Step**: Inspect PostgreSQL deadlock log in `/var/log/postgresql/` or run `SELECT * FROM pg_stat_database_conflicts;`.
- **Resolution**: Standardize lock acquisition order globally across the application. When updating collections of entities, always sort by primary key UUID first:
  ```python
  # Always sort IDs to acquire locks in deterministic ascending order
  sorted_claim_ids = sorted(claim_ids)
  ```

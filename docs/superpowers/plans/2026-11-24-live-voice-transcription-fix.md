# Live Voice Transcription and Turn Finalization Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure candidate spoken words stream in real-time in the live speech bubble and cleanly commit as conversation turns when the candidate finishes speaking.

**Architecture:** 
1. Fix `AudioVadProcessor` to evaluate trailing silence strictly on elapsed millisecond duration (`trailing_silence_ms >= 1500.0` and `speech_duration_ms >= 400.0`), eliminating frame-count-based premature cutoffs that were wiping the audio buffer every 80ms on small audio frames.
2. In `websocket.py`, prevent cancelling in-flight partial transcription tasks upon speech finalization, pass `allow_mock_fallback` in local development to prevent long stalls, and log turn finalization events with exact text.
3. In `speechRecognition.ts` and `interviewStore.ts`, handle Web Speech API network failures gracefully and ensure incoming WebSocket partial/final transcripts immediately update the UI state.

**Tech Stack:** FastAPI (WebSockets, AsyncIO), Python (struct, math), Google GenAI SDK, React 18, TypeScript, Zustand.

## Global Constraints
- Audio format is 16kHz 16-bit Mono Linear PCM (32 bytes per millisecond).
- Trailing silence threshold for turn finalization is 1,500ms (1.5s).
- Minimum speech required before a turn can be finalized is 400ms (to reject accidental clicks/breaths).
- No new external runtime dependencies.
- Changes must be minimal, targeted, and pass all existing unit tests.

## Review Focus
1. Frame size invariance: VAD must behave identically whether frames arrive in 86-byte, 320-byte, or 1600-byte packets.
2. Syllable pause resilience: Candidate pausing for 200-400ms between words must NOT trigger speech finalization.
3. Zero audio loss: The accumulated PCM audio buffer must never be reset until it has been sent to STT.
4. UI reactivity: `partialTranscript` must display in `InterviewRoom.tsx` as soon as partial text arrives from WebSocket.
5. Turn advancement: On finalization, `transcript_final` must trigger `handle_turn_finalization`, generating the interviewer's next question.

---

### Task 1: Fix VAD Trailing Silence & Speech Duration Logic to be Frame-Size Invariant

**Files:**
- Modify: `backend/app/services/audio_vad.py:65-115`
- Test: `backend/tests/unit/test_audio_vad.py`

**Interfaces:**
- Consumes: `pcm_bytes: bytes`
- Produces: `VadFrameResult(is_speech, rms_energy, speech_started, speech_finalized)`

- [x] **Step 1: Write test in `backend/tests/unit/test_audio_vad.py` for small-frame variable rate streams**

Verify that an audio stream composed of 86-byte chunks with 200ms pauses between speech segments does NOT trigger premature finalization, and that finalization triggers only after >= 1500ms of continuous silence.

- [x] **Step 2: Run test to verify it fails with current logic**

Run: `.venv\Scripts\pytest backend/tests/unit/test_audio_vad.py::test_small_chunk_variable_rate_vad -v`
Expected: FAIL (triggers premature finalization due to `trailing_silence_frames >= 30` matching 30 * 2.68ms = 80ms).

- [x] **Step 3: Update `audio_vad.py` to rely strictly on wall-clock milliseconds**

In `backend/app/services/audio_vad.py`:
Change:
```python
if (
    self.trailing_silence_ms >= 1500.0
    and self.speech_duration_ms >= 400.0
):
    speech_finalized = True
```
Remove `self.trailing_silence_frames >= self.trailing_silence_frames_required` and `self.speech_frames_count >= self.MIN_SPEECH_FRAMES_REQUIRED`.

- [x] **Step 4: Run test to verify it passes**

Run: `.venv\Scripts\pytest backend/tests/unit/test_audio_vad.py -v`
Expected: PASS (all 6 tests passing).

---

### Task 2: Fix WebSocket Streaming Partial & Final STT Dispatch

**Files:**
- Modify: `backend/app/api/v1/endpoints/websocket.py:500-570`
- Test: Manual verification with WebSocket / FastAPI test client

**Interfaces:**
- Consumes: `websocket.receive()`, `vad.process_frame(pcm_bytes)`
- Produces: `websocket.send_json({"type": "transcript_partial", ...})`, `websocket.send_json({"type": "transcript_final", ...})`

- [ ] **Step 1: Update `websocket.py` to preserve in-flight STT tasks and pass fallback flag**

In `backend/app/api/v1/endpoints/websocket.py`:
1. In `_stream_interim_partial`: pass `allow_mock_fallback=(settings.environment in ("development", "testing", "local"))`.
2. Do not immediately `.cancel()` `partial_stt_task` on `speech_finalized` if it is about to finish.
3. In `vad_result.speech_finalized`: Ensure `STTService.transcribe_final` correctly retrieves the full collected audio, logs chars recognized, sends `transcript_final`, and advances the interview turn via `handle_turn_finalization`.

- [ ] **Step 2: Run unit and integration tests**

Run: `.venv\Scripts\pytest backend/tests/unit/test_audio_vad.py backend/tests/unit/test_gemini_live.py`
Expected: PASS

---

### Task 3: Ensure Frontend Displays Live Transcripts and Commits Turns

**Files:**
- Modify: `frontend/src/lib/speechRecognition.ts:100-140`
- Modify: `frontend/src/stores/interviewStore.ts:375-410`
- Modify: `frontend/src/components/InterviewRoom.tsx:1530-1555`

**Interfaces:**
- Consumes: WebSocket `transcript_partial` and `transcript_final` messages, Web Speech API results
- Produces: Reactive `partialTranscript` updates and turn list additions in UI

- [ ] **Step 1: Improve speech recognition resilience in `speechRecognition.ts`**

When Web Speech API encounters a `network` error, do not crash permanently; log cleanly and allow WebSocket `transcript_partial` to drive the live transcript UI without interference.

- [ ] **Step 2: Verify `InterviewRoom.tsx` UI bubble state**

Ensure the `partialTranscript` is immediately displayed in the candidate's speech bubble, with graceful fallback to `Listening: voice detected...` when speaking before STT text arrives.

- [ ] **Step 3: Run frontend build to verify TypeScript and build cleanliness**

Run: `npm run build` in `frontend/`
Expected: Build passes with 0 errors.

---

### Task 4: Verification and End-to-End Validation

- [ ] **Step 1: Test with simulated microphone stream**
- [ ] **Step 2: Verify candidate turn commits cleanly to conversation history**
- [ ] **Step 3: Verify interviewer Alex responds to candidate's spoken turn**

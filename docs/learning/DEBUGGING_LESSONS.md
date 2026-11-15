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

---

## Lesson 004: Windows Trampoline Path Canonicalization Failure After Directory Rename
- **Symptom**: Running `uv run <command>` (e.g., `uv run uvicorn`, `uv run pytest`) on Windows fails with `error: uv trampoline failed to canonicalize script path`.
- **Root Cause**: On Windows, `uv` installs entrypoint launcher executables (`uv-trampoline`) into `.venv\Scripts\<tool>.exe`. These binaries contain an embedded shebang/target path pointing to the virtual environment's `python.exe` (e.g. `#!D:\fun\IntervueX\.venv\Scripts\python.exe`). When the project directory is moved or renamed (e.g. from `IntervueX` to `CareerDiff`), the embedded target path points to a non-existent directory. Windows fails to canonicalize the stale path (`GetFullPathNameW`), throwing the trampoline error.
- **Diagnostic Step**: Inspect strings in `.venv\Scripts\<tool>.exe` for obsolete paths, or test if invoking via module syntax (`uv run python -m <tool>`) succeeds while direct launcher invocation fails.
- **Resolution**: Reinstall the packages to force `uv` to regenerate the launcher binaries with the correct directory path, or clean and recreate `.venv`:
  ```powershell
  uv sync --reinstall
  ```

---

## Lesson 005: React `<video>` Stream Binding Lifecycle & Black Camera Previews
- **Symptom**: In the hardware check modal and live room, camera permissions were granted, the webcam hardware indicator lit up, and status showed "Active" with the camera device name, but the preview viewport remained completely black.
- **Root Cause**: Unlike image tags (`<img src="...">`), HTML `<video>` elements cannot take a `MediaStream` object directly via a standard JSX attribute. The stream must be imperatively assigned via `videoElement.srcObject = mediaStream`. In conditionally rendered preview containers (`{cameraStatus === 'granted' && isCameraEnabled ? <video ref={videoRef} /> : ...}`), `<video>` is not yet in the DOM when `getUserMedia()` resolves. Without a callback ref or an effect synchronizing `srcObject` when the node mounts, `videoRef.current.srcObject` was never assigned.
- **Diagnostic Step**: Inspect `ref` references to `<video>` across the component tree. Check if `srcObject` is assigned anywhere, and verify whether the assignment occurs before or after the DOM node mounts.
- **Resolution**: Implement a dual-safety pattern:
  1. A **callback ref** (`ref={setVideoRef}`) that immediately binds `node.srcObject = streamRef.current` and invokes `.play()` the instant React mounts the DOM node.
  2. A **reactive `useEffect`** tracking `[cameraStream, isCameraEnabled]` to re-bind and play whenever stream state or toggle state transitions.

---

## Lesson 006: Web Audio API Autoplay Suspension, FFT Frequency Averaging Dilution, and Virtual Audio Device Traps
- **Symptom**: In the hardware readiness check, microphone permission was granted and status showed "Ready", but the input volume level remained permanently stuck at 0%.
- **Root Cause**:
  1. *AudioContext Autoplay Suspension*: When an `AudioContext` is created without an active, direct user interaction gesture (e.g. inside an automated effect on modal mount), modern browsers initialize it in the `'suspended'` state. In this state, the Web Audio graph does not pull audio samples, causing analyzer buffers to remain all zeros.
  2. *FFT Frequency Averaging Dilution*: The previous calculation used `analyser.getByteFrequencyData()` and averaged all 128 frequency bins (`sum / pcmData.length`). Because human speech occupies only low frequencies (~100–1500 Hz, bins 0–8), averaging across high-frequency silence diluted the signal by over 90%, yielding an effective volume below the 2% noise threshold.
  3. *Virtual Device Trap*: Windows laptops (e.g. ASUS ROG/TUF) often register virtual audio mixer endpoints (e.g. "System Virtual Line") as the default device. If no device switcher is provided, users are locked to an inactive virtual loopback device while their actual physical microphone is on a different endpoint.
- **Resolution**:
  1. Calculate time-domain **Root Mean Square (RMS)** using `analyser.getFloatTimeDomainData()`, which mathematically captures the true physical energy of the waveform.
  2. Apply an envelope follower with **fast attack** and **smooth decay** plus a 2% noise gate.
  3. Route the analyzer output through a zero-gain (`gain.value = 0`) node to `ctx.destination` to prevent browser audio graph tree pruning.
  4. Auto-resume the `AudioContext` if `state === 'suspended'`.
  5. Enumerate all connected audio/video hardware devices via `navigator.mediaDevices.enumerateDevices()` and provide clean dropdown selectors so users can switch to their physical headset or microphone array. Persist user preferences in `localStorage` for seamless use across the interview room.

---

## Lesson 007: Short-Lived JWT Expiry Without Refresh Tokens, Multi-Key Migration, and View State Desynchronization on Refresh
- **Symptom**: Refreshing the browser while on the application caused the user to be logged out or redirected to the home landing page.
- **Root Cause**:
  1. *15-Minute Token Expiration*: The backend `.env` configured `JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15`. Without an automated refresh token pipeline, any practice session lasting over 15 minutes caused the JWT signature to expire, yielding 401 Unauthorized errors on subsequent requests.
  2. *Single Storage Key Inflexibility*: `authStore.ts` only inspected `CareerDiff_auth_storage`. Sessions stored under previous/alternative keys (e.g. `intervuex_auth_storage`, `careerdiff_auth_storage`) or flat JSON structures failed to rehydrate on reload.
  3. *Unpersisted Route/View State*: `currentView` in `App.tsx` defaulted to `'setup' : 'home'` on every cold reload without consulting stored route state, forcing the user away from their active view.
- **Resolution**:
  1. Increased token validity to 7 days (`10080` minutes) for practice sessions.
  2. Upgraded `loadPersistedAuth` to check all legacy and variant storage keys and auto-migrate to canonical storage.
  3. Added JWT expiry detection (`isTokenExpired`) to discard stale tokens cleanly.
  4. Added `rehydrateProfile` to fetch the real candidate profile (`Venkat Naraharisetty`) from `/api/v1/auth/me`.
  5. Persisted `currentView` in `localStorage` and derived `activeView` to prevent unintended redirects to the homepage.

---

## Lesson 008: Real-Time Synchronized Speech Synthesis and Typewriter Telemetry
- **Symptom**: Interview questions appeared as sudden full text blocks without acoustic voice reading, leading to cognitive overload and unnatural interview cadence.
- **Root Cause**: The application lacked a client-side SpeechSynthesis driver to audibly voice the question. Without real-time word boundary synchronization, text had to be either statically displayed all at once or guessed via arbitrary timers.
- **Resolution**:
  1. Built `BrowserSpeechSynthesizer` using native Web Speech API `SpeechSynthesisUtterance`.
  2. Dynamically prioritized high-fidelity natural/neural system voices (e.g. Microsoft Jenny/Guy, Google US English).
  3. Linked speech boundary events (`utterance.onboundary` with `event.name === 'word'`) to progressively type words onto the screen at the exact acoustic cadence of the speech, coupled with an active pulsating emerald cursor.
  4. Engineered instant preemption (`BrowserSpeechSynthesizer.stop()`) on candidate barge-in (Speech VAD, Space key, Esc key, or Mic toggle), immediately terminating audio playback and resolving text to 100% completion so the candidate never loses question context.
  5. Added an Interviewer Voice toggle button (`Volume2` / `VolumeX`) in the room navigation header to give candidates full acoustic volume control.

---

## Lesson 009: `element.scrollIntoView()` Ancestor Viewport Pull vs. Container `scrollTo()`
- **Symptom**: When entering the live interview room or opening the interview panel, the entire browser window automatically scrolled down to the bottom, hiding the top navigation bar and session status header.
- **Root Cause**: `element.scrollIntoView()` default behavior traverses all scrollable ancestors (including `window`, `document.body`, and `html`) and scrolls them so the target element is visible in the browser viewport. In `InterviewRoom.tsx`, `chatEndRef.current?.scrollIntoView()` was triggered inside a `useEffect` whenever turns or speaking states changed. Because `useEffect` runs immediately upon component mount, `scrollIntoView()` executed as soon as the panel opened, pulling the entire browser window down to the bottom anchor tag `<div ref={chatEndRef} />`.
- **Diagnostic Step**: Search the codebase for `scrollIntoView`. Check whether the auto-scroll effect executes on initial mount, and whether it targets an inner element rather than scrolling the dedicated scroll container directly.
- **Resolution**:
  1. Ensure the browser window is anchored to the top upon mount via `window.scrollTo({ top: 0, left: 0, behavior: 'instant' })`.
  2. Guard against initial mount scrolling using an `isInitialMountRef` flag.
  3. Replace ancestor-scrolling `element.scrollIntoView()` with container-scoped `chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' })`. This strictly scrolls the chat message overflow container without moving the browser viewport.
  4. For the real-time typewriter effect, check proximity (`scrollHeight - scrollTop - clientHeight < 120`) to smoothly follow new words as they stream in without disorienting candidates reviewing earlier turns.

---

## Lesson 010: Hands-Free Conversational Voice Pipeline, Neural Voice Quality Tuning, and Elimination of Manual Push-to-Talk
- **Symptom**: In voice mode, candidates were forced to manually click a "Speak" button to begin answering questions; the interviewer voice sounded robotic (defaulting to legacy desktop voices like Microsoft David); initial warmup questions were over 80 words long with literal resume claim quotes resembling an exam proctor; and speech transcription did not display in real time while speaking.
- **Root Cause**:
  1. *Manual Voice Activation Friction*: Speech recognition was only started upon manual button interaction (`handleToggleVoiceRecording`). No automated trigger existed on question completion.
  2. *Robotic TTS Voice Fallback*: `getBestVoice()` included `Microsoft David` in its prioritized list. In Windows Chrome, asynchronous `speechSynthesis.getVoices()` initial empty returns or generic matchers caused the browser to assign the 2001 legacy SAPI desktop voice.
  3. *Lengthy Warmup Prompting*: `generate_warmup_greeting` generated multi-clause paragraphs quoting literal resume claims and compounding multiple technical questions into turn 0.
  4. *Delayed Transcript Display*: The live candidate transcription UI only rendered once intermediate or final transcripts were populated, with no visual state confirming active microphone capture before the first syllable was pronounced.
- **Resolution**:
  1. Automated hands-free mic activation: As soon as the interviewer's speech synthesis completes (`onEnd`), the candidate microphone starts automatically (`startVoiceRecording()`).
  2. The manual "Click to Speak" button was eliminated. During the interviewer's turn, only the **Barge-In / Interrupt** button (`Esc`) is shown. During the candidate's turn, an active listening indicator and **Done Speaking** (`Enter`) are shown, complemented by an automatic 2.2-second trailing silence auto-submit detector.
  3. Upgraded `BrowserSpeechSynthesizer`: Penalized robotic desktop voices (`David`, `Mark`, `eSpeak`) and prioritized natural neural voices (`Natural`, `Neural`, `Online`, `Google US English`, `Jenny`, `Guy`, `Aria`, `Zira`). Added a top-bar voice dropdown selector allowing candidates to switch and persist their favorite voice. Relaxed speech rate to `0.96` for human conversational cadence.
  4. Streamlined `TurnGenerator.generate_warmup_greeting`: Reduced warmup questions to ~25 conversational words using candidate first names (e.g. *"Hi Venkat, great to meet you! Welcome to the interview..."*).
  5. Real-time visual feedback: Rendered an active candidate speaking card with real-time transcription, blinking cursor, and immediate `"Microphone active... speak naturally"` status.

---

## Lesson 011: Web Speech API Instance Lifecycle, Backend STT Fallback, and Candidate Turn Conclusion Handshake
- **Symptom**: The candidate spoke into the microphone, but speech was not transcribed in real time on screen; furthermore, the session did not conclude the candidate's answer to transition to the interviewer's followup question.
- **Root Cause**:
  1. *SpeechRecognition Instance Reuse Bug*: In Chromium, calling `.start()` on an existing `SpeechRecognition` instance after previous abort/stop operations throws an internal `InvalidStateError` or enters an unrecoverable state, causing `onresult` to never fire.
  2. *Server STT Drop on Missing Cloud Key*: In `websocket.py`, when candidate audio or `speech_stopped` was received without a paid Deepgram key in development, `STTService.transcribe_final` returned `""`. Because `if not transcript.strip(): continue` was triggered, the backend dropped the turn completely and sent `"No speech detected"`, halting the interview state machine.
  3. *Unclear Turn Conclusion Handshake*: The UI did not clearly communicate how the candidate signals answer completion to prompt the interviewer's followup question.
- **Resolution**:
  1. Instantiated a fresh `SpeechRecognition` instance on every `start()` invocation in `BrowserSpeechRecognizer`, ensuring pristine state and real-time `onresult` streaming.
  2. Updated backend `STTService` and WebSocket handlers to allow conversational fallback when in development/testing without cloud STT, guaranteeing that candidate audio is never dropped and the interview state machine always progresses to the followup question.
  3. Added dual turn conclusion pathways:
     - **Hands-Free Trailing Silence Detection**: When candidate pauses for 2.2 seconds after speaking, the turn automatically finalizes.
     - **Explicit Submit Action**: Added **"Submit Answer & Get Followup"** (`Enter`) in both the candidate turn card and bottom console, with clear user guidance.

---

## Lesson 012: Browser Hardware Media Release, HTMLMediaElement Sink Detachment, and Event-Listener-Safe Speech Teardown
- **Symptom**: After concluding an interview and navigating to the Technical Assessment Dossier (or Setup/Home views), Chrome continued to show active camera and microphone indicators in the browser tab and operating system status area.
- **Root Cause**:
  1. *Asynchronous Hardware Teardown Lag*: `handleConclude` in `InterviewRoom.tsx` awaited the network evaluation call (`await concludeSession()`) before invoking `onConclude()`. During the 1–3 second backend roundtrip, `InterviewRoom` remained mounted with active camera streams. If the network call failed, navigation never occurred and hardware was never stopped.
  2. *HTMLMediaElement DirectShow/MediaFoundation Sink Retention*: Merely calling `MediaStreamTrack.stop()` without setting `videoElement.srcObject = null` and `videoElement.pause()` leaves the browser's internal decoding sink attached to the hardware device, preventing Chromium from immediately releasing the physical webcam.
  3. *Dangling Web Speech API Recognition Handlers*: In `speechRecognition.ts`, `abort()` and `stop()` called the underlying recognition methods without detaching event handlers (`onresult`, `onend`, `onerror`). In Chromium, asynchronous `onend` triggers could attempt restarts, and retaining the recognition reference held an internal microphone capture lock.
  4. *Scoped vs Global Media Track Lifecycle*: Media streams initiated in `DeviceCheckModal` and `InterviewRoom` lacked an unconditional unmount cleanup and a global tracking registry, permitting unstopped tracks to leak across route transitions.
- **Resolution**:
  1. *Immediate Hardware Teardown*: Created `cleanupHardwareMedia()` in `InterviewRoom.tsx`, which executes synchronously the instant "Conclude & Score" is clicked—stopping all camera tracks, microphone recorders, speech recognizers, and speech synthesizers before initiating the backend network request.
  2. *DOM Video Sink Detachment*: Added explicit `video.pause()` and `video.srcObject = null` in `InterviewRoom`, `DeviceCheckModal`, and global media teardown, immediately releasing the operating system's webcam lock.
  3. *Pristine Recognition Teardown*: In `BrowserSpeechRecognizer.stop()` and `abort()`, explicitly detached all event listeners (`onresult = null`, `onerror = null`, `onend = null`, `onspeechstart = null`, `onspeechend = null`, `onaudiostart = null`, `onaudioend = null`), aborted the instance, and set `this.recognition = null`.
  4. *Global Hardware Registry (`stopAllMediaHardware`)*: Introduced an active media stream registry in `frontend/src/lib/audio.ts` tracking all `getUserMedia` streams application-wide. Wired `stopAllMediaHardware()` into `App.tsx` on navigation to any non-interview view (`dossier`, `setup`, `home`, `rewriter`) and on session reset.
  5. *Unconditional Modal Teardown*: Added an unconditional unmount effect to `DeviceCheckModal` to ensure device preview streams never linger across modal or page closures.

---

## Lesson 013: Ephemeral In-Memory Session Loss on Page Refresh, Dossier View Rehydration, and Candidate Latest Report Fallback
- **Symptom**: Refreshing the browser (`F5` / reload) after completing an interview while on the Technical Assessment Dossier displayed a blank screen with "No report found. [Start New Session]".
- **Root Cause**:
  1. *Ephemeral Zustand Memory Loss*: In `frontend/src/stores/interviewStore.ts`, `interviewId` was stored strictly in transient JavaScript memory (`interviewId: null`). On page reload, the Zustand store reset to initial state, wiping `interviewId`.
  2. *Single-Key View Rehydration Without Identity Continuity*: `App.tsx` persisted the active view name (`careerdiff_active_view: 'dossier'`) to `localStorage`, so `DossierView` correctly mounted on refresh. However, `DossierView` read `const { interviewId } = useInterviewStore()`. Because `interviewId` was `null`, the component aborted its query (`if (!interviewId) { setIsLoading(false); return; }`) and rendered the empty "No report found" fallback state.
  3. *Missing API Query Semantics for Recent Sessions*: The backend only provided `GET /api/v1/interviews/{interview_id}/report`, with no path to fetch a candidate's most recent session when client memory is lost.
- **Resolution**:
  1. *Persistent Active Session Key*: In `interviewStore.ts`, persisted `careerdiff_active_interview_id` to `localStorage` on `setInterview` and restored it on initial store definition. Cleared only on explicit user `reset()`.
  2. *Triple-Layer Dossier Resolution in `DossierView.tsx`*:
     - Layer 1: Check in-memory `interviewId`.
     - Layer 2: Check `localStorage.getItem('careerdiff_active_interview_id')`.
     - Layer 3: Query new backend endpoint `GET /api/v1/interviews/latest/report` to fetch the authenticated candidate's latest evaluation report directly.
  3. *Backend Session Continuity Endpoints*:
     - Added `GET /api/v1/interviews/latest` returning `InterviewDetailResponse` for candidate's latest session.
     - Added `GET /api/v1/interviews/latest/report` returning `AssessmentReportRead` directly without requiring the client to remember the interview UUID.

---

## Lesson 014: Candidate Longitudinal Performance History, Progression Aggregation, and Multi-Session Switching
- **Symptom**: Candidates had no historical overview to review past practice sessions, track competency score trends (Novice L1 to Expert L4), analyze score improvement deltas, or switch between prior interview dossiers.
- **Root Cause**: While interviews and rubric reports were durably stored in PostgreSQL, the backend API lacked an endpoint listing historical interviews for the authenticated user, and the frontend lacked a UI dashboard visualizing longitudinal progress across practice interviews.
- **Resolution**:
  1. *Backend History Listing Endpoint*: Created `GET /api/v1/interviews` in `backend/app/api/v1/endpoints/interviews.py` returning `InterviewHistoryResponse` containing chronological sessions with role title, target seniority, durations, turns count, rubric score, ATS alignment %, and verbal delivery scores.
  2. *Progress & Delta Aggregation*: Computed overall mean score across sessions, latest score, and the net score delta (`latest_score - earliest_score`) showing exact candidate progress over time.
  3. *Frontend Performance History Modal (`PerformanceHistoryModal.tsx`)*:
     - Top KPI cards showing Total Sessions, Average Rubric, Latest Rubric, and Score Improvement Delta (e.g. `+1.2 pts`).
     - SVG Multi-Session Progression Graph plotting rubric scores across consecutive sessions.
     - Chronological session cards with role titles, date/time, turns, and score tags.
     - One-click **"View Dossier →"** action that switches the active session and renders any historical report with zero friction.
  4. *Dossier Header Integration*: Placed a prominent **"Performance Trends & Past Sessions"** trigger button in `DossierView.tsx`.







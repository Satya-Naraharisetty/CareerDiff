"""WebSocket gateway for real-time bidirectional voice streaming, VAD, and barge-in."""

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import async_session_factory
from app.core.redis import get_redis_client
from app.models.interview import Interview, InterviewBlueprint
from app.models.resume import Resume
from app.models.user import CandidateProfile
from app.schemas.adaptive import CandidateTurnRequest, InterviewState
from app.services.audio_vad import AudioVadProcessor
from app.services.gemini_live_session import GeminiLiveBridge
from app.services.speech_service import STTService, TTSService
from app.services.ticket_service import TicketService
from app.services.turn_service import TurnService

router = APIRouter()
logger = logging.getLogger("CareerDiff.voice")


@router.websocket("/interviews/{interview_id}")
async def interview_voice_gateway(
    websocket: WebSocket,
    interview_id: uuid.UUID,
    ticket: str | None = Query(default=None),
    voice: str | None = Query(default=None),
) -> None:
    """Real-time voice streaming endpoint multiplexing 16kHz PCM audio and JSON control frames."""
    redis = get_redis_client()
    settings = get_settings()
    current_tts_task: asyncio.Task[None] | None = None
    tts_abort_event = asyncio.Event()
    live_bridge: GeminiLiveBridge | None = None
    gemini_live_task: asyncio.Task[None] | None = None
    logger.info("WebSocket connection request received for interview %s (ticket: %s)", interview_id, bool(ticket))
    try:
        # 1. Ticket Handshake Authentication
        if not ticket:
            logger.warning("WebSocket rejected: missing ticket token for interview %s", interview_id)
            await websocket.close(code=4401, reason="Missing ticket")
            return

        ticket_data = await TicketService.validate_and_consume_ticket(
            redis=redis,
            ticket=ticket,
            expected_interview_id=interview_id,
        )
        if not ticket_data:
            logger.warning("WebSocket rejected: unauthorized or expired ticket for interview %s", interview_id)
            await websocket.close(code=4401, reason="Unauthorized: invalid or expired ticket")
            return

        ticket_user_id = ticket_data.get("user_id")
        logger.info("Ticket consumed successfully for user %s on interview %s", ticket_user_id, interview_id)

        # 2. Connection Accepted
        await websocket.accept()
        logger.info("WebSocket connection accepted for interview %s", interview_id)

        # 3. Load Session from PostgreSQL and verify ticket ownership
        cand_name = "Candidate"
        initial_tts_text: str | None = None
        async with async_session_factory() as db:
            stmt = (
                select(Interview)
                .options(
                    selectinload(Interview.role),
                    selectinload(Interview.blueprint).selectinload(InterviewBlueprint.topics),
                    selectinload(Interview.turns),
                    selectinload(Interview.candidate_profile).selectinload(CandidateProfile.user),
                    selectinload(Interview.candidate_profile)
                    .selectinload(CandidateProfile.resumes)
                    .selectinload(Resume.claims),
                )
                .where(Interview.id == interview_id)
            )
            interview = (await db.execute(stmt)).scalar_one_or_none()
            if not interview:
                logger.error("Interview session %s not found in database", interview_id)
                await websocket.close(code=4500, reason="Interview session not found")
                return

            # Broken Object-Level Authorization (BOLA) verification
            if interview.candidate_profile and str(interview.candidate_profile.user_id) != str(ticket_user_id):
                logger.warning(
                    "BOLA mismatch: ticket user %s does not own interview %s (owner: %s)",
                    ticket_user_id,
                    interview_id,
                    interview.candidate_profile.user_id,
                )
                await websocket.close(code=4403, reason="Forbidden: ticket user does not own this interview")
                return

            # Safely extract candidate name while DB session is open
            if interview.candidate_profile and interview.candidate_profile.user and interview.candidate_profile.user.full_name:
                cand_name = interview.candidate_profile.user.full_name

            remaining_sec = max(
                0, interview.scheduled_duration_minutes * 60 - interview.actual_duration_seconds
            )
            logger.info(
                "Interview %s loaded (state: %s, turns: %d, remaining: %ds, candidate: %s)",
                interview_id,
                interview.state,
                len(interview.turns),
                remaining_sec,
                cand_name,
            )

            # Emit session_ready confirmation
            await websocket.send_json(
                {
                    "type": "session_ready",
                    "interview_id": str(interview_id),
                    "current_turn_index": len(interview.turns),
                    "state": interview.state,
                    "remaining_seconds": remaining_sec,
                }
            )

            # If interview is newly created or in WARMUP, prepare Turn 0
            if interview.state == InterviewState.CREATED.value:
                turn_0 = await TurnService.start_interview(db, interview_id)
                initial_tts_text = turn_0.transcript
                await websocket.send_json(
                    {
                        "type": "state_change",
                        "previous_state": "CREATED",
                        "new_state": "WARMUP",
                        "active_competency": None,
                    }
                )
                logger.info("[VOICE GATEWAY] Initialized Turn 0 WARMUP greeting for interview %s", interview_id)
            elif interview.state == InterviewState.WARMUP.value and len(interview.turns) >= 1:
                # Reconnection / refresh sync: emit existing Turn 0 text for UI sync, and stream prewarmed audio if Turn 0
                turn_0 = interview.turns[0]
                if len(interview.turns) == 1:
                    initial_tts_text = turn_0.transcript
                else:
                    # Mid-session reconnect: restore current turn display
                    await websocket.send_json(
                        {
                            "type": "interviewer_speaking",
                            "turn_index": turn_0.turn_index,
                            "action": "WARMUP",
                            "question_text": turn_0.transcript,
                        }
                    )
                logger.info("[VOICE GATEWAY] Resumed and synchronized Turn 0 WARMUP greeting for interview %s", interview_id)
            elif interview.state == InterviewState.WARMUP.value and len(interview.turns) == 0:
                turn_0 = await TurnService.start_interview(db, interview_id)
                initial_tts_text = turn_0.transcript
                logger.info("[VOICE GATEWAY] Initialized initial Turn 0 WARMUP greeting for interview %s", interview_id)

        # 4. Initialize Stream Handlers
        vad = AudioVadProcessor()
        # Restore active interviewer turn index from loaded turns to prevent DB collisions on reconnection
        interviewer_turns = [t for t in interview.turns if t.speaker == "INTERVIEWER"]
        active_interviewer_turn_index: int = (
            max(t.turn_index for t in interviewer_turns) if interviewer_turns else 0
        )

        # Enable Gemini Live API (gemini-3.8-live-extended-thinking) ONLY when explicitly configured
        if settings.enable_gemini_live and settings.gemini_api_key and settings.environment != "testing":
            try:
                live_bridge = GeminiLiveBridge(interview, voice_name=voice)
            except Exception as exc:
                logger.warning("Could not initialize GeminiLiveBridge, using fallback: %s", exc)
                live_bridge = None

        async def pump_gemini_live_events() -> None:
            nonlocal active_interviewer_turn_index
            if not live_bridge:
                return
            last_cand_transcript = ""
            last_interviewer_transcript = ""
            try:
                async for event in live_bridge.connect():
                    if event.event_type == "input_transcript":
                        if event.text:
                            last_cand_transcript = event.text
                            await websocket.send_json(
                                {
                                    "type": "transcript_partial",
                                    "turn_index": active_interviewer_turn_index + 1,
                                    "text": event.text,
                                }
                            )
                    elif event.event_type == "output_transcript":
                        if event.text:
                            last_interviewer_transcript = event.text
                            await websocket.send_json(
                                {
                                    "type": "interviewer_speaking",
                                    "turn_index": active_interviewer_turn_index,
                                    "action": "QUESTION",
                                    "question_text": event.text,
                                }
                            )
                    elif event.event_type == "audio_chunk":
                        if event.audio_bytes:
                            await websocket.send_bytes(event.audio_bytes)
                    elif event.event_type == "interrupted":
                        cutoff_ms = int(time.time() * 1000)
                        await websocket.send_json(
                            {
                                "type": "interviewer_interrupted",
                                "turn_index": active_interviewer_turn_index,
                                "cutoff_timestamp_ms": cutoff_ms,
                            }
                        )
                    elif event.event_type == "turn_complete":
                        # Finalize candidate turn in UI if transcript exists
                        if last_cand_transcript:
                            await websocket.send_json(
                                {
                                    "type": "transcript_final",
                                    "turn_index": active_interviewer_turn_index + 1,
                                    "speaker": "CANDIDATE",
                                    "text": last_cand_transcript,
                                }
                            )
                        # Notify client that interviewer finished speaking so mic auto-activates
                        await websocket.send_json(
                            {
                                "type": "interviewer_audio_done",
                                "turn_index": active_interviewer_turn_index,
                            }
                        )
                        # Persist turns to PostgreSQL
                        try:
                            from app.models.interview import InterviewTurn
                            async with async_session_factory() as db:
                                if last_cand_transcript:
                                    db.add(InterviewTurn(
                                        interview_id=interview_id,
                                        turn_index=active_interviewer_turn_index + 1,
                                        speaker="CANDIDATE",
                                        transcript=last_cand_transcript,
                                    ))
                                if last_interviewer_transcript or event.text:
                                    db.add(InterviewTurn(
                                        interview_id=interview_id,
                                        turn_index=active_interviewer_turn_index + 2,
                                        speaker="INTERVIEWER",
                                        transcript=event.text or last_interviewer_transcript,
                                        action_taken="QUESTION",
                                    ))
                                await db.commit()
                        except Exception as persist_err:
                            logger.warning("Error persisting Gemini Live turns: %s", persist_err)

                        active_interviewer_turn_index += 2
                        last_cand_transcript = ""
                        last_interviewer_transcript = ""
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.warning("Gemini Live event consumer ended: %s", exc)

        if live_bridge:
            gemini_live_task = asyncio.create_task(pump_gemini_live_events())

        # Spawn initial Turn 0 TTS streaming in background with preemption support
        if initial_tts_text:
            tts_text = initial_tts_text

            async def stream_initial_pcm() -> None:
                try:
                    logger.info("Synthesizing and streaming Turn 0 ElevenLabs-quality neural audio for interview %s...", interview_id)
                    pcm_raw = await TTSService.prewarm(tts_text, voice_name=voice)
                    if tts_abort_event.is_set():
                        return
                    if pcm_raw:
                        duration_ms = int(len(pcm_raw) / (TTSService.SAMPLE_RATE * TTSService.BYTES_PER_SAMPLE) * 1000)
                        # Synchronized dispatch: emit interviewer_speaking together with exact audio duration
                        await websocket.send_json(
                            {
                                "type": "interviewer_speaking",
                                "turn_index": active_interviewer_turn_index,
                                "action": "WARMUP",
                                "question_text": tts_text,
                                "duration_ms": duration_ms,
                            }
                        )
                        chunk_size = TTSService.CHUNK_SIZE_BYTES
                        for offset in range(0, len(pcm_raw), chunk_size):
                            if tts_abort_event.is_set():
                                break
                            await websocket.send_bytes(pcm_raw[offset : offset + chunk_size])
                        if not tts_abort_event.is_set():
                            await websocket.send_json(
                                {
                                    "type": "interviewer_audio_done",
                                    "turn_index": active_interviewer_turn_index,
                                }
                            )
                    else:
                        logger.info("[VOICE GATEWAY] No server PCM audio available; signaling browser TTS fallback for Turn 0")
                        await websocket.send_json(
                            {
                                "type": "interviewer_speaking",
                                "turn_index": active_interviewer_turn_index,
                                "action": "WARMUP",
                                "question_text": tts_text,
                            }
                        )
                        await websocket.send_json(
                            {
                                "type": "tts_fallback_browser",
                                "turn_index": active_interviewer_turn_index,
                                "question_text": tts_text,
                            }
                        )
                except asyncio.CancelledError:
                    pass

            current_tts_task = asyncio.create_task(stream_initial_pcm())

        # Helper to cancel active TTS task upon candidate interruption
        async def cancel_active_tts() -> None:
            nonlocal current_tts_task
            if current_tts_task and not current_tts_task.done():
                logger.info("Preempting active TTS audio playback (<150ms barge-in)")
                tts_abort_event.set()
                current_tts_task.cancel()
                current_tts_task = None
                cutoff_ms = int(time.time() * 1000)
                await websocket.send_json(
                    {
                        "type": "interviewer_interrupted",
                        "turn_index": active_interviewer_turn_index,
                        "cutoff_timestamp_ms": cutoff_ms,
                    }
                )

        # Helper to execute downstream turn transition and stream audio response
        # Wrapped with defensive error handling to prevent gateway disconnections
        async def handle_turn_finalization(candidate_text: str, duration_ms: int) -> None:
            nonlocal current_tts_task, active_interviewer_turn_index
            try:
                logger.info(
                    "[TURN FINALIZATION] Finalizing turn for interview %s (%d chars, duration: %sms)",
                    interview_id,
                    len(candidate_text or ""),
                    duration_ms,
                )
                await cancel_active_tts()

                async with async_session_factory() as db:
                    interviewer_reply = await TurnService.process_candidate_turn(
                        db=db,
                        interview_id=interview_id,
                        request=CandidateTurnRequest(
                            transcript=candidate_text, duration_ms=duration_ms
                        ),
                    )

                active_interviewer_turn_index = interviewer_reply.turn_index
                logger.info(
                    "[TURN SERVICE] Response ready: Turn #%d (%s)",
                    interviewer_reply.turn_index,
                    interviewer_reply.action_taken.value,
                )

                # Stream outbound 100ms PCM chunks with preemption support
                tts_abort_event.clear()

                async def stream_response_pcm() -> None:
                    try:
                        logger.info("[TTS] Synthesizing and streaming neural audio for Turn #%d...", interviewer_reply.turn_index)
                        pcm_raw = await TTSService.prewarm(interviewer_reply.transcript, voice_name=voice)
                        if tts_abort_event.is_set():
                            return
                        if pcm_raw:
                            duration_ms = int(len(pcm_raw) / (TTSService.SAMPLE_RATE * TTSService.BYTES_PER_SAMPLE) * 1000)
                            await websocket.send_json(
                                {
                                    "type": "interviewer_speaking",
                                    "turn_index": interviewer_reply.turn_index,
                                    "action": interviewer_reply.action_taken.value,
                                    "question_text": interviewer_reply.transcript,
                                    "duration_ms": duration_ms,
                                }
                            )
                            chunk_size = TTSService.CHUNK_SIZE_BYTES
                            for offset in range(0, len(pcm_raw), chunk_size):
                                if tts_abort_event.is_set():
                                    break
                                await websocket.send_bytes(pcm_raw[offset : offset + chunk_size])
                            if not tts_abort_event.is_set():
                                await websocket.send_json(
                                    {
                                        "type": "interviewer_audio_done",
                                        "turn_index": interviewer_reply.turn_index,
                                    }
                                )
                        else:
                            logger.info("[TTS] No server PCM audio available; signaling browser TTS fallback for Turn #%d", interviewer_reply.turn_index)
                            await websocket.send_json(
                                {
                                    "type": "interviewer_speaking",
                                    "turn_index": interviewer_reply.turn_index,
                                    "action": interviewer_reply.action_taken.value,
                                    "question_text": interviewer_reply.transcript,
                                }
                            )
                            await websocket.send_json(
                                {
                                    "type": "tts_fallback_browser",
                                    "turn_index": interviewer_reply.turn_index,
                                    "question_text": interviewer_reply.transcript,
                                }
                            )
                    except asyncio.CancelledError:
                        pass

                current_tts_task = asyncio.create_task(stream_response_pcm())

                # If interview completed, notify UI and close session
                if interviewer_reply.session_state == InterviewState.COMPLETED.value:
                    logger.info("[INTERVIEW ENGINE] Interview %s reached COMPLETED state", interview_id)
                    await websocket.send_json(
                        {
                            "type": "state_change",
                            "previous_state": "CONCLUDING",
                            "new_state": "COMPLETED",
                            "active_competency": None,
                        }
                    )
            except Exception as exc:
                logger.exception("[ERROR] Error in turn finalization for %s: %s", interview_id, exc)
                try:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "code": "TURN_PROCESSING_ERROR",
                            "message": f"Turn processing issue: {type(exc).__name__}: {exc}",
                            "fatal": False,
                        }
                    )
                except Exception:
                    pass

        # 5. Continuous Frame Multiplexing Loop
        audio_chunks_received = 0
        partial_stt_task: asyncio.Task | None = None
        last_partial_time = 0.0
        last_finalized_turn_index = -1
        while True:
            message = await websocket.receive()
            msg_type = message.get("type")

            if msg_type == "websocket.disconnect":
                logger.info("Received websocket.disconnect for interview %s", interview_id)
                break

            # Handle Binary PCM Audio Frames (50ms chunks = 1600 bytes)
            if "bytes" in message and message["bytes"]:
                pcm_bytes: bytes = message["bytes"]
                if len(pcm_bytes) > 8192:
                    logger.warning("Closing WebSocket: binary frame exceeds 8KB limit (%d bytes)", len(pcm_bytes))
                    await websocket.close(code=1009, reason="Binary frame exceeds maximum size limit (8KB)")
                    break

                audio_chunks_received += 1

                # Always process local VAD to monitor audio energy and detect speech onset/silence
                vad_result = vad.process_frame(pcm_bytes)

                if audio_chunks_received % 50 == 1:
                    logger.info(
                        "Candidate audio chunk #%d: %d bytes | RMS=%.1f (threshold=%.1f) | speaking=%s (speech_frames=%d, trailing_silence=%d, buf=%d bytes)",
                        audio_chunks_received,
                        len(pcm_bytes),
                        vad_result.rms_energy,
                        vad.energy_threshold_rms,
                        vad.is_candidate_speaking,
                        vad.speech_frames_count,
                        vad.trailing_silence_frames,
                        len(vad.audio_buffer),
                    )

                # Preempt interviewer on speech onset (Barge-in invariant <= 150ms)
                if vad_result.speech_started:
                    logger.info("[VAD] Candidate speech onset detected (<150ms barge-in, RMS=%.1f)", vad_result.rms_energy)
                    await cancel_active_tts()
                    last_partial_time = 0.0

                if live_bridge and live_bridge.is_active:
                    # Stream raw 16kHz audio frame directly to Gemini Live API
                    await live_bridge.send_audio_frame(pcm_bytes)

                    # When candidate pauses for trailing silence, signal audio_stream_end so Gemini Live knows candidate finished
                    if vad_result.speech_finalized:
                        vad.reset()
                        logger.info("[VAD] Local VAD detected trailing silence; signaling audio_stream_end to Gemini Live")
                        await live_bridge.send_audio_stream_end()
                else:

                    # Emit periodic streaming partial transcripts whenever candidate is speaking
                    now_ts = time.time()
                    if (
                        vad.is_candidate_speaking
                        and len(vad.audio_buffer) >= 9600
                        and (now_ts - last_partial_time >= 1.5)
                        and (partial_stt_task is None or partial_stt_task.done())
                    ):
                        last_partial_time = now_ts
                        audio_snapshot = bytes(vad.audio_buffer)
                        target_turn_idx = active_interviewer_turn_index + 1

                        async def _stream_interim_partial(buf: bytes, tidx: int) -> None:
                            try:
                                interim = await STTService.transcribe_final(
                                    buf,
                                    allow_mock_fallback=(settings.environment in ("development", "testing", "local")),
                                )
                                if tidx <= last_finalized_turn_index:
                                    logger.debug("[STT] Discarding interim partial for finalized turn %d", tidx)
                                    return
                                if interim and interim.strip():
                                    clean_text = interim.strip()
                                    logger.info("[STT] Candidate interim partial transcript: '%s'", clean_text)
                                    await websocket.send_json(
                                        {
                                            "type": "transcript_partial",
                                            "turn_index": tidx,
                                            "text": clean_text,
                                        }
                                    )
                            except asyncio.CancelledError:
                                pass
                            except Exception as err:
                                logger.debug("Interim partial STT background notice: %s", err)

                        partial_stt_task = asyncio.create_task(_stream_interim_partial(audio_snapshot, target_turn_idx))

                    # Finalize turn on trailing silence
                    if vad_result.speech_finalized:
                        # Do not abruptly cancel in-flight partial STT task; allow pending partial to complete safely
                        raw_audio = vad.get_and_reset_buffer()
                        logger.info("Local VAD speech finalized (%d bytes audio buffer, ~%.2fs)", len(raw_audio), len(raw_audio) / 32000)
                        transcript = await STTService.transcribe_final(
                            raw_audio,
                            allow_mock_fallback=(settings.environment in ("development", "testing", "local")),
                        )
                        dur_ms = int((len(raw_audio) / 32000) * 1000)

                        if not transcript or not transcript.strip():
                            logger.info("[VAD] Finalized speech produced no transcript, resuming listening")
                            continue

                        logger.info("[STT] Candidate recognized final transcript (%d chars): '%s'", len(transcript), transcript[:100])
                        turn_idx = active_interviewer_turn_index + 1
                        last_finalized_turn_index = turn_idx
                        logger.info("Candidate turn finalized via VAD (%d chars, %dms): '%s'", len(transcript), dur_ms, transcript[:80])
                        await websocket.send_json(
                            {
                                "type": "transcript_final",
                                "turn_index": turn_idx,
                                "speaker": "CANDIDATE",
                                "text": transcript,
                                "duration_ms": dur_ms,
                            }
                        )
                        await handle_turn_finalization(transcript, dur_ms)

            # Handle Text Control Messages (JSON)
            elif "text" in message and message["text"]:
                raw_text_msg: str = message["text"]
                if len(raw_text_msg) > 65536:
                    logger.warning("Closing WebSocket: text frame exceeds 64KB limit")
                    await websocket.close(code=1009, reason="Text frame exceeds maximum size limit (64KB)")
                    break
                try:
                    payload: dict[str, Any] = json.loads(raw_text_msg)
                except json.JSONDecodeError:
                    continue

                event_type = payload.get("type")

                if event_type == "speech_started":
                    logger.info("Client event 'speech_started' received (candidate started speaking)")
                    await cancel_active_tts()
                    last_partial_time = 0.0

                elif event_type == "speech_stopped":
                    # Allow in-flight partial task to finish safely without abrupt cancellation
                    client_transcript = payload.get("transcript")
                    logger.info("Client event 'speech_stopped' received (client transcript: %d chars)", len(str(client_transcript or "")))
                    if live_bridge and live_bridge.is_active:
                        await live_bridge.send_audio_stream_end()
                    else:
                        raw_audio = vad.force_finalize()
                        if audio_chunks_received > 0 and len(raw_audio) == 0:
                            logger.info("Ignoring trailing speech_stopped: audio buffer already finalized via VAD")
                            continue

                        logger.info("Finalizing audio buffer on speech_stopped: %d bytes (%.2fs)", len(raw_audio), len(raw_audio) / 32000)
                        transcript = await STTService.transcribe_final(
                            raw_audio,
                            simulated_transcript=client_transcript,
                            allow_mock_fallback=(settings.environment in ("development", "testing", "local")),
                        )
                        dur_ms = int((len(raw_audio) / 32000) * 1000) if raw_audio else 1000

                        if not transcript.strip() and client_transcript:
                            transcript = str(client_transcript).strip()

                        if not transcript.strip():
                            logger.info("speech_stopped resulted in empty transcript, ready for next candidate speech")
                            continue

                        logger.info("[STT] Candidate recognized final transcript from speech_stopped (%d chars): '%s'", len(transcript), transcript[:100])
                        turn_idx = active_interviewer_turn_index + 1
                        last_finalized_turn_index = turn_idx
                        logger.info("Finalizing turn from speech_stopped event (%d chars, %dms): '%s'", len(transcript), dur_ms, transcript[:80])
                        await websocket.send_json(
                            {
                                "type": "transcript_final",
                                "turn_index": turn_idx,
                                "speaker": "CANDIDATE",
                                "text": transcript,
                                "duration_ms": dur_ms,
                            }
                        )
                        await handle_turn_finalization(transcript, dur_ms)

                elif event_type == "text_input":
                    # Text fallback mode: process text input over WebSocket
                    candidate_text = payload.get("text", "").strip()
                    logger.info("Client event 'text_input' received over voice gateway (%d chars)", len(str(candidate_text or "")))
                    if candidate_text:
                        await cancel_active_tts()
                        if live_bridge and live_bridge.is_active:
                            await live_bridge.send_text_input(candidate_text)
                        else:
                            turn_idx = active_interviewer_turn_index + 1
                            last_finalized_turn_index = turn_idx
                            await websocket.send_json(
                                {
                                    "type": "transcript_final",
                                    "turn_index": turn_idx,
                                    "speaker": "CANDIDATE",
                                    "text": candidate_text,
                                    "duration_ms": 0,
                                }
                            )
                            await handle_turn_finalization(candidate_text, 0)

                elif event_type == "ping":
                    await websocket.send_json(
                        {
                            "type": "pong",
                            "timestamp": payload.get("timestamp"),
                        }
                    )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for interview %s", interview_id)
    except Exception as exc:
        logger.exception("[VOICE GATEWAY ERROR] Gateway failure for interview %s: %s", interview_id, exc)
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "SERVER_ERROR",
                    "message": f"Voice streaming gateway issue: {type(exc).__name__}: {exc}",
                    "fatal": True,
                }
            )
            await websocket.close(code=4500, reason=f"Gateway error: {type(exc).__name__}")
        except Exception:
            pass
    finally:
        if gemini_live_task and not gemini_live_task.done():
            gemini_live_task.cancel()
        if live_bridge:
            await live_bridge.close()
        if current_tts_task and not current_tts_task.done():
            tts_abort_event.set()
            current_tts_task.cancel()
        await redis.aclose()

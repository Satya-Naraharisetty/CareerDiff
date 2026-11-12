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

from app.core.database import async_session_factory
from app.core.redis import get_redis_client
from app.models.interview import Interview, InterviewBlueprint
from app.schemas.adaptive import CandidateTurnRequest, InterviewState
from app.services.audio_vad import AudioVadProcessor
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
) -> None:
    """Real-time voice streaming endpoint multiplexing 16kHz PCM audio and JSON control frames."""
    redis = get_redis_client()
    current_tts_task: asyncio.Task[None] | None = None
    tts_abort_event = asyncio.Event()
    try:
        # 1. Ticket Handshake Authentication
        if not ticket:
            await websocket.close(code=4401, reason="Missing ticket")
            return

        ticket_data = await TicketService.validate_and_consume_ticket(
            redis=redis,
            ticket=ticket,
            expected_interview_id=interview_id,
        )
        if not ticket_data:
            await websocket.close(code=4401, reason="Unauthorized: invalid or expired ticket")
            return

        # 2. Connection Accepted
        await websocket.accept()

        # 3. Load Session from PostgreSQL
        async with async_session_factory() as db:
            stmt = (
                select(Interview)
                .options(
                    selectinload(Interview.blueprint).selectinload(InterviewBlueprint.topics),
                    selectinload(Interview.turns),
                )
                .where(Interview.id == interview_id)
            )
            interview = (await db.execute(stmt)).scalar_one_or_none()
            if not interview:
                await websocket.close(code=4500, reason="Interview session not found")
                return

            remaining_sec = max(
                0, interview.scheduled_duration_minutes * 60 - interview.actual_duration_seconds
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

            initial_tts_text: str | None = None
            # If interview is newly created, start WARMUP and emit Turn 0
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
                await websocket.send_json(
                    {
                        "type": "interviewer_speaking",
                        "turn_index": 0,
                        "action": "WARMUP",
                        "question_text": turn_0.transcript,
                    }
                )

        # 4. Initialize Stream Handlers
        vad = AudioVadProcessor()
        active_interviewer_turn_index: int = 0

        # Spawn initial Turn 0 TTS streaming in background with preemption support
        if initial_tts_text:
            tts_text = initial_tts_text

            async def stream_initial_pcm() -> None:
                try:
                    async for chunk in TTSService.synthesize_pcm_stream(
                        tts_text, realtime_delay=True
                    ):
                        if tts_abort_event.is_set():
                            break
                        await websocket.send_bytes(chunk)
                except asyncio.CancelledError:
                    pass

            current_tts_task = asyncio.create_task(stream_initial_pcm())

        # Helper to cancel active TTS task upon candidate interruption
        async def cancel_active_tts() -> None:
            nonlocal current_tts_task
            if current_tts_task and not current_tts_task.done():
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
        async def handle_turn_finalization(candidate_text: str, duration_ms: int) -> None:
            nonlocal current_tts_task, active_interviewer_turn_index
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

            # Notify UI interviewer is speaking
            await websocket.send_json(
                {
                    "type": "interviewer_speaking",
                    "turn_index": interviewer_reply.turn_index,
                    "action": interviewer_reply.action_taken.value,
                    "question_text": interviewer_reply.transcript,
                }
            )

            # Stream outbound 100ms PCM chunks with preemption support
            tts_abort_event.clear()

            async def stream_response_pcm() -> None:
                try:
                    async for chunk in TTSService.synthesize_pcm_stream(
                        interviewer_reply.transcript, realtime_delay=False
                    ):
                        if tts_abort_event.is_set():
                            break
                        await websocket.send_bytes(chunk)
                except asyncio.CancelledError:
                    pass

            current_tts_task = asyncio.create_task(stream_response_pcm())

            # If interview completed, notify UI and close session
            if interviewer_reply.session_state == InterviewState.COMPLETED.value:
                await websocket.send_json(
                    {
                        "type": "state_change",
                        "previous_state": "CONCLUDING",
                        "new_state": "COMPLETED",
                        "active_competency": None,
                    }
                )

        # 5. Continuous Frame Multiplexing Loop
        while True:
            message = await websocket.receive()
            msg_type = message.get("type")

            if msg_type == "websocket.disconnect":
                break

            # Handle Binary PCM Audio Frames (50ms chunks = 1600 bytes)
            if "bytes" in message and message["bytes"]:
                pcm_bytes: bytes = message["bytes"]
                vad_result = vad.process_frame(pcm_bytes)

                # Preempt interviewer on speech onset (Barge-in invariant <= 150ms)
                if vad_result.speech_started:
                    await cancel_active_tts()

                # Emit periodic streaming partial transcripts
                if vad.is_candidate_speaking and vad.speech_frames_count % 4 == 0:
                    partial = STTService.transcribe_partial(bytes(vad.audio_buffer))
                    if partial:
                        await websocket.send_json(
                            {
                                "type": "transcript_partial",
                                "turn_index": active_interviewer_turn_index + 1,
                                "text": partial,
                            }
                        )

                # Finalize turn on 1,200ms trailing silence
                if vad_result.speech_finalized:
                    raw_audio = vad.get_and_reset_buffer()
                    transcript = await STTService.transcribe_final(raw_audio)
                    dur_ms = int((len(raw_audio) / 32000) * 1000)

                    await websocket.send_json(
                        {
                            "type": "transcript_final",
                            "turn_index": active_interviewer_turn_index + 1,
                            "speaker": "CANDIDATE",
                            "text": transcript,
                            "duration_ms": dur_ms,
                        }
                    )
                    await handle_turn_finalization(transcript, dur_ms)

            # Handle Text Control Messages (JSON)
            elif "text" in message and message["text"]:
                try:
                    payload: dict[str, Any] = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                event_type = payload.get("type")

                if event_type == "speech_started":
                    # Instant client-detected speech onset (barge-in)
                    await cancel_active_tts()

                elif event_type == "speech_stopped":
                    # Instant client silence detection
                    if len(vad.audio_buffer) > 0:
                        raw_audio = vad.force_finalize()
                        transcript = await STTService.transcribe_final(raw_audio)
                        dur_ms = int((len(raw_audio) / 32000) * 1000)
                        await websocket.send_json(
                            {
                                "type": "transcript_final",
                                "turn_index": active_interviewer_turn_index + 1,
                                "speaker": "CANDIDATE",
                                "text": transcript,
                                "duration_ms": dur_ms,
                            }
                        )
                        await handle_turn_finalization(transcript, dur_ms)

                elif event_type == "text_input":
                    # Text fallback mode: process text input over WebSocket
                    candidate_text = payload.get("text", "").strip()
                    if candidate_text:
                        await cancel_active_tts()
                        await websocket.send_json(
                            {
                                "type": "transcript_final",
                                "turn_index": active_interviewer_turn_index + 1,
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
        logger.exception("Unexpected error in voice gateway for %s: %s", interview_id, exc)
        try:
            await websocket.send_json(
                {
                    "type": "error",
                    "code": "SERVER_ERROR",
                    "message": "Internal error in voice streaming gateway",
                    "fatal": True,
                }
            )
            await websocket.close(code=4500, reason="Internal error")
        except Exception:
            pass
    finally:
        if current_tts_task and not current_tts_task.done():
            tts_abort_event.set()
            current_tts_task.cancel()
        await redis.aclose()

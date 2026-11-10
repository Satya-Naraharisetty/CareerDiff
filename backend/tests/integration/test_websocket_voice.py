"""Integration tests for real-time WebSocket voice pipeline, VAD, barge-in, and text fallback."""

import json
import math
import struct
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.database import async_session_factory
from app.main import app
from app.scripts.seed_roles import seed_job_roles


@pytest.fixture(autouse=True)
async def ensure_roles_seeded() -> None:
    """Ensure catalog roles are seeded in the database before running tests."""
    async with async_session_factory() as session:
        await seed_job_roles(session)


async def setup_voice_interview(async_client: AsyncClient) -> tuple[str, str, str]:
    """Helper registering candidate, creating interview, and obtaining a single-use ws-ticket."""
    email = f"voice_cand_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "SecurePassword123!",
            "full_name": "Voice Candidate",
        },
    )
    assert reg_res.status_code == 201
    token: str = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch backend role
    roles_res = await async_client.get("/api/v1/roles", headers=headers)
    roles = roles_res.json()["items"]
    backend_role = next(r for r in roles if r["slug"] == "backend-engineering")

    # Create interview
    create_res = await async_client.post(
        "/api/v1/interviews",
        json={
            "role_id": backend_role["id"],
            "target_seniority": "SENIOR",
            "duration_minutes": 30,
            "mode": "VOICE",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    interview_id: str = create_res.json()["interview_id"]

    # Request ws-ticket
    ticket_res = await async_client.post(
        f"/api/v1/interviews/{interview_id}/ws-ticket",
        headers=headers,
    )
    assert ticket_res.status_code == 200
    ticket: str = ticket_res.json()["ticket"]

    return token, interview_id, ticket


def generate_pcm_frame(amplitude: int = 0, num_samples: int = 800) -> bytes:
    """Generate 50ms 16kHz 16-bit Mono Linear PCM frame."""
    if amplitude == 0:
        return b"\x00" * (num_samples * 2)

    samples = [
        int(amplitude * math.sin(2 * math.pi * 440.0 * (i / 16000))) for i in range(num_samples)
    ]
    return struct.pack(f"<{num_samples}h", *samples)


def receive_json_message(ws: Any) -> dict[str, Any]:
    """Helper receiving WebSocket messages while ignoring interleaved binary audio chunks."""
    while True:
        raw = ws.receive()
        if "text" in raw and raw["text"]:
            result: dict[str, Any] = json.loads(raw["text"])
            return result


@pytest.mark.asyncio
async def test_websocket_ticket_auth_failures(async_client: AsyncClient) -> None:
    """Connecting without a ticket or with an invalid ticket must be rejected with code 4401."""
    _, interview_id, _ = await setup_voice_interview(async_client)

    client = TestClient(app)

    # 1. No ticket provided -> 4401
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/ws/v1/interviews/{interview_id}"):
            pass
    assert exc_info.value.code == 4401

    # 2. Invalid/expired ticket provided -> 4401
    with pytest.raises(WebSocketDisconnect) as exc_info2:
        with client.websocket_connect(f"/ws/v1/interviews/{interview_id}?ticket=v4.ticket.invalid"):
            pass
    assert exc_info2.value.code == 4401


@pytest.mark.asyncio
async def test_websocket_successful_handshake_and_warmup(async_client: AsyncClient) -> None:
    """Verify successful connection handshake, session_ready event, and Turn 0 emission."""
    _, interview_id, ticket = await setup_voice_interview(async_client)

    client = TestClient(app)
    with client.websocket_connect(f"/ws/v1/interviews/{interview_id}?ticket={ticket}") as ws:
        # 1. Server emits session_ready
        ready_msg = receive_json_message(ws)
        assert ready_msg["type"] == "session_ready"
        assert ready_msg["interview_id"] == str(interview_id)

        # 2. Server transitions CREATED -> WARMUP and emits Turn 0
        state_msg = receive_json_message(ws)
        assert state_msg["type"] == "state_change"
        assert state_msg["new_state"] == "WARMUP"

        speaking_msg = receive_json_message(ws)
        assert speaking_msg["type"] == "interviewer_speaking"
        assert speaking_msg["turn_index"] == 0
        assert speaking_msg["action"] == "WARMUP"

        # 3. Server streams binary PCM audio frames for Turn 0
        binary_chunk = ws.receive_bytes()
        assert len(binary_chunk) > 0


@pytest.mark.asyncio
async def test_websocket_ping_pong_keepalive(async_client: AsyncClient) -> None:
    """Verify client ping text frame receives pong response."""
    _, interview_id, ticket = await setup_voice_interview(async_client)

    client = TestClient(app)
    with client.websocket_connect(f"/ws/v1/interviews/{interview_id}?ticket={ticket}") as ws:
        # Drain initial handshake messages
        receive_json_message(ws)  # session_ready
        receive_json_message(ws)  # state_change
        receive_json_message(ws)  # interviewer_speaking

        # Send ping
        ws.send_json({"type": "ping", "timestamp": 123456789})
        pong = receive_json_message(ws)
        assert pong["type"] == "pong"
        assert pong["timestamp"] == 123456789


@pytest.mark.asyncio
async def test_websocket_text_fallback_mode(async_client: AsyncClient) -> None:
    """Verify zero-loss text fallback mode over WebSocket."""
    _, interview_id, ticket = await setup_voice_interview(async_client)

    client = TestClient(app)
    with client.websocket_connect(f"/ws/v1/interviews/{interview_id}?ticket={ticket}") as ws:
        # Drain handshake
        receive_json_message(ws)
        receive_json_message(ws)
        receive_json_message(ws)

        # Candidate submits text turn via WebSocket (fallback mode)
        ws.send_json(
            {
                "type": "text_input",
                "text": "I'm a senior backend engineer with deep distributed systems experience.",
            }
        )

        # Server emits transcript_final confirming candidate turn (interrupting Turn 0 if active)
        t_final = receive_json_message(ws)
        if t_final["type"] == "interviewer_interrupted":
            t_final = receive_json_message(ws)

        assert t_final["type"] == "transcript_final"
        assert t_final["speaker"] == "CANDIDATE"

        # Server emits interviewer_speaking for next question
        i_speaking = receive_json_message(ws)
        assert i_speaking["type"] == "interviewer_speaking"
        assert i_speaking["turn_index"] == 2
        assert i_speaking["action"] == "CHANGE_TOPIC"


@pytest.mark.asyncio
async def test_websocket_barge_in_interruption(async_client: AsyncClient) -> None:
    """Candidate speech_started event immediately aborts interviewer playback."""
    _, interview_id, ticket = await setup_voice_interview(async_client)

    client = TestClient(app)
    with client.websocket_connect(f"/ws/v1/interviews/{interview_id}?ticket={ticket}") as ws:
        # Drain initial handshake
        receive_json_message(ws)
        receive_json_message(ws)
        receive_json_message(ws)

        # Candidate sends speech_started (barge-in signal)
        ws.send_json({"type": "speech_started", "client_timestamp_ms": 1718000000000})

        # Interviewer interruption confirmation must be received
        interrupted = receive_json_message(ws)
        assert interrupted["type"] == "interviewer_interrupted"
        assert "cutoff_timestamp_ms" in interrupted


@pytest.mark.asyncio
async def test_websocket_pcm_speech_turn_and_vad_finalization(async_client: AsyncClient) -> None:
    """Streaming 5 loud PCM frames followed by 24 silence frames finalizes turn via server VAD."""
    _, interview_id, ticket = await setup_voice_interview(async_client)

    client = TestClient(app)
    with client.websocket_connect(f"/ws/v1/interviews/{interview_id}?ticket={ticket}") as ws:
        # Drain initial handshake
        receive_json_message(ws)
        receive_json_message(ws)
        receive_json_message(ws)

        loud_frame = generate_pcm_frame(amplitude=4000)
        silence_frame = generate_pcm_frame(amplitude=0)

        # Send 8 loud speech frames (400ms speech)
        for _ in range(8):
            ws.send_bytes(loud_frame)

        # Receive partial transcript (or interruption confirmation then partial)
        partial_msg = receive_json_message(ws)
        if partial_msg["type"] == "interviewer_interrupted":
            partial_msg = receive_json_message(ws)

        assert partial_msg["type"] == "transcript_partial"

        # Send 24 trailing silence frames (1,200 ms) to trigger turn finalization
        for _ in range(24):
            ws.send_bytes(silence_frame)

        # Drain any remaining partial transcripts until transcript_final is confirmed
        final_msg = receive_json_message(ws)
        while final_msg["type"] == "transcript_partial":
            final_msg = receive_json_message(ws)

        assert final_msg["type"] == "transcript_final"
        assert final_msg["speaker"] == "CANDIDATE"

        # Server emits next question
        i_speaking = receive_json_message(ws)
        assert i_speaking["type"] == "interviewer_speaking"

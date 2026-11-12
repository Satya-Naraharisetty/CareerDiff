"""Pydantic v2 schemas for real-time WebSocket protocol and voice streaming."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class WsTicketResponse(BaseModel):
    """Ephemeral single-use ticket response for WebSocket connection handshake."""

    ticket: str
    websocket_url: str
    expires_in_seconds: int = 60


# ---------------------------------------------------------------------------
# Client -> Server Text JSON Messages
# ---------------------------------------------------------------------------


class SpeechStartedMessage(BaseModel):
    """Emitted immediately when client VAD detects speech energy (barge-in signal)."""

    type: Literal["speech_started"] = "speech_started"
    client_timestamp_ms: int = Field(default=0)


class SpeechStoppedMessage(BaseModel):
    """Emitted when client observes trailing silence or user stops speaking."""

    type: Literal["speech_stopped"] = "speech_stopped"
    client_timestamp_ms: int = Field(default=0)
    transcript: str | None = Field(default=None, description="Client-side transcribed speech text if available")


class TextInputMessage(BaseModel):
    """Emitted when candidate submits text fallback input over WebSocket."""

    type: Literal["text_input"] = "text_input"
    turn_index: int | None = None
    text: str = Field(min_length=1, max_length=10000)


class PingMessage(BaseModel):
    """Client keepalive ping message."""

    type: Literal["ping"] = "ping"
    timestamp: int | None = None


# ---------------------------------------------------------------------------
# Server -> Client Text JSON Messages
# ---------------------------------------------------------------------------


class SessionReadyMessage(BaseModel):
    """Server handshake confirmation."""

    type: Literal["session_ready"] = "session_ready"
    interview_id: str
    current_turn_index: int
    state: str
    remaining_seconds: int


class TranscriptPartialMessage(BaseModel):
    """Real-time streaming speech feedback."""

    type: Literal["transcript_partial"] = "transcript_partial"
    turn_index: int
    text: str


class TranscriptFinalMessage(BaseModel):
    """Finalized and committed speech turn."""

    type: Literal["transcript_final"] = "transcript_final"
    turn_index: int
    speaker: str = "CANDIDATE"
    text: str
    duration_ms: int = 0


class InterviewerSpeakingMessage(BaseModel):
    """Notification of interviewer response generation and speech streaming."""

    type: Literal["interviewer_speaking"] = "interviewer_speaking"
    turn_index: int
    action: str
    question_text: str


class InterviewerInterruptedMessage(BaseModel):
    """Confirmation of server-side TTS preemption upon candidate barge-in."""

    type: Literal["interviewer_interrupted"] = "interviewer_interrupted"
    turn_index: int
    cutoff_timestamp_ms: int


class StateChangeMessage(BaseModel):
    """Notification of macro-level interview state transitions."""

    type: Literal["state_change"] = "state_change"
    previous_state: str
    new_state: str
    active_competency: str | None = None


class SessionErrorMessage(BaseModel):
    """Real-time error notifications."""

    type: Literal["error"] = "error"
    code: str
    message: str
    fatal: bool = False
    details: dict[str, Any] | None = None

    model_config = ConfigDict(extra="ignore")

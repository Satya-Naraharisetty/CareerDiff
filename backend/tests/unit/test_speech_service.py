"""Unit tests for STT and TTS services."""

import pytest

from app.services.speech_service import STTService, TTSService


def test_stt_partial_transcription() -> None:
    """Verify STT generates progressively longer partial transcripts based on audio duration."""
    # 0.2s of audio (6400 bytes at 32k bytes/sec) -> too short for partial
    assert STTService.transcribe_partial(b"\x00" * 6400) == ""

    # 1.0s of audio (32000 bytes) -> returns partial text with ellipsis
    partial = STTService.transcribe_partial(b"\x00" * 32000)
    assert partial.endswith("...")
    assert len(partial.split()) >= 2


@pytest.mark.asyncio
async def test_stt_final_transcription() -> None:
    """Verify STT final transcription output."""
    # Simulated transcript override
    res = await STTService.transcribe_final(b"\x00" * 16000, simulated_transcript="Hello systems")
    assert res == "Hello systems"

    # Default speech transcription for substantial audio
    res_default = await STTService.transcribe_final(b"\x00" * 32000)
    assert "Kafka" in res_default


@pytest.mark.asyncio
async def test_tts_pcm_stream_generation() -> None:
    """Verify TTS streaming yields 100ms (3,200 bytes) 16kHz PCM chunks."""
    text = "Could you explain how Kafka partitions guarantee total ordering per key?"
    chunks: list[bytes] = []

    async for chunk in TTSService.synthesize_pcm_stream(text, chunk_duration_ms=100):
        chunks.append(chunk)
        assert len(chunk) == 3200  # 1600 samples * 2 bytes = 3200 bytes

    assert len(chunks) > 0


def test_tts_generate_silence() -> None:
    """Verify silence chunk length."""
    silence = TTSService.generate_silence(duration_ms=100)
    assert len(silence) == 3200
    assert all(b == 0 for b in silence)

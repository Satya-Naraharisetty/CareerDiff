"""Unit tests for STT and TTS services."""

import pytest

from app.services.speech_service import STTService, TTSService


def test_stt_partial_transcription() -> None:
    """Verify STT generates progressively longer partial transcripts based on audio duration."""
    # 0.2s of audio (6400 bytes at 32k bytes/sec) -> too short for partial
    assert STTService.transcribe_partial(b"\x00" * 6400) == ""

    # 1.0s of audio (32000 bytes) with hint -> returns partial text with ellipsis
    partial = STTService.transcribe_partial(b"\x00" * 32000, word_hint="explaining system architecture")
    assert partial.endswith("...")
    assert len(partial.split()) >= 2


@pytest.mark.asyncio
async def test_stt_final_transcription() -> None:
    """Verify STT final transcription output."""
    # Simulated transcript override
    res = await STTService.transcribe_final(b"\x00" * 16000, simulated_transcript="Hello systems")
    assert res == "Hello systems"

    # Audio without transcription returns empty string (no hardcoded buzzwords)
    res_empty = await STTService.transcribe_final(b"\x00" * 6400)
    assert res_empty == ""


@pytest.mark.asyncio
async def test_tts_pcm_stream_generation() -> None:
    """Verify TTS streaming yields 100ms (4,800 bytes) 24kHz studio PCM chunks."""
    text = "Could you explain how Kafka partitions guarantee total ordering per key?"
    chunks: list[bytes] = []

    async for chunk in TTSService.synthesize_pcm_stream(text, chunk_duration_ms=100):
        chunks.append(chunk)
        assert len(chunk) <= TTSService.CHUNK_SIZE_BYTES
        assert len(chunk) > 0

    assert len(chunks) > 0
    assert len(chunks[0]) == TTSService.CHUNK_SIZE_BYTES


def test_tts_generate_silence() -> None:
    """Verify silence chunk length at 24kHz."""
    silence = TTSService.generate_silence(duration_ms=100)
    assert len(silence) == TTSService.CHUNK_SIZE_BYTES  # 4800 bytes @ 24kHz
    assert all(b == 0 for b in silence)


@pytest.mark.asyncio
async def test_stt_gemini_model_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify STTService falls back to gemini-3.5-flash if gemini_turn_model fails."""
    from unittest.mock import AsyncMock, MagicMock

    mock_settings = MagicMock()
    mock_settings.deepgram_api_key = None
    mock_settings.gemini_api_key = "fake_key"
    mock_settings.gemini_turn_model = "gemini-3.8-flash"
    monkeypatch.setattr("app.services.speech_service.get_settings", lambda: mock_settings)

    mock_client = MagicMock()
    generate_mock = AsyncMock()

    resp_success = MagicMock()
    resp_success.text = "I have built high-throughput microservices in Go."
    generate_mock.side_effect = [
        Exception("Model quota or not supported"),
        resp_success,
    ]
    mock_client.aio.models.generate_content = generate_mock
    monkeypatch.setattr("app.core.llm.make_genai_client", lambda timeout_ms=10_000: mock_client)

    # 1.0s of audio = 32000 bytes
    audio_bytes = b"\x01\x00" * 16000
    res = await STTService.transcribe_final(audio_bytes)

    assert res == "I have built high-throughput microservices in Go."
    assert generate_mock.call_count == 2
    assert generate_mock.call_args_list[0].kwargs["model"] == "gemini-3.5-flash"
    assert generate_mock.call_args_list[1].kwargs["model"] == "gemini-3.8-flash"


@pytest.mark.asyncio
async def test_stt_gemini_none_text_handling(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify STTService handles None resp.text gracefully without throwing AttributeError."""
    from unittest.mock import AsyncMock, MagicMock

    mock_settings = MagicMock()
    mock_settings.deepgram_api_key = None
    mock_settings.gemini_api_key = "fake_key"
    mock_settings.gemini_turn_model = "gemini-3.8-flash"
    monkeypatch.setattr("app.services.speech_service.get_settings", lambda: mock_settings)

    mock_client = MagicMock()
    generate_mock = AsyncMock()
    resp_none = MagicMock()
    resp_none.text = None
    generate_mock.return_value = resp_none
    mock_client.aio.models.generate_content = generate_mock
    monkeypatch.setattr("app.core.llm.make_genai_client", lambda timeout_ms=10_000: mock_client)

    audio_bytes = b"\x01\x00" * 16000
    res = await STTService.transcribe_final(audio_bytes, allow_mock_fallback=False)
    assert res == ""


@pytest.mark.asyncio
async def test_stt_gemini_silence_tokens_handling(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify STTService filters out Gemini silence tokens such as [silence] or empty string."""
    from unittest.mock import AsyncMock, MagicMock

    mock_settings = MagicMock()
    mock_settings.deepgram_api_key = None
    mock_settings.gemini_api_key = "fake_key"
    mock_settings.gemini_turn_model = "gemini-3.8-flash"
    monkeypatch.setattr("app.services.speech_service.get_settings", lambda: mock_settings)

    mock_client = MagicMock()
    generate_mock = AsyncMock()
    resp_silence = MagicMock()
    resp_silence.text = "[silence]"
    generate_mock.return_value = resp_silence
    mock_client.aio.models.generate_content = generate_mock
    monkeypatch.setattr("app.core.llm.make_genai_client", lambda timeout_ms=10_000: mock_client)

    audio_bytes = b"\x01\x00" * 16000
    res = await STTService.transcribe_final(audio_bytes, allow_mock_fallback=False)
    assert res == ""

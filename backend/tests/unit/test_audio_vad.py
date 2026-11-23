"""Unit tests for 16kHz PCM audio frame processing and trailing silence VAD."""

import math
import struct
import pytest

from app.services.audio_vad import AudioVadProcessor


def generate_pcm_frame(amplitude: int = 0, num_samples: int = 800) -> bytes:
    """Generate a 50ms (800 samples) 16-bit Mono Linear PCM frame."""
    if amplitude == 0:
        return b"\x00" * (num_samples * 2)

    samples = [
        int(amplitude * math.sin(2 * math.pi * 440.0 * (i / 16000))) for i in range(num_samples)
    ]
    return struct.pack(f"<{num_samples}h", *samples)


def generate_pcm_chunk(amplitude: int = 0, num_bytes: int = 86) -> bytes:
    """Generate a variable-sized 16-bit Mono Linear PCM chunk (default 86 bytes = ~2.69ms)."""
    num_samples = num_bytes // 2
    if amplitude == 0:
        return b"\x00" * num_bytes

    samples = [
        int(amplitude * math.sin(2 * math.pi * 440.0 * (i / 16000))) for i in range(num_samples)
    ]
    return struct.pack(f"<{num_samples}h", *samples)


def test_rms_calculation() -> None:
    """Verify Root-Mean-Square (RMS) amplitude calculation."""
    silence = generate_pcm_frame(amplitude=0)
    assert AudioVadProcessor.compute_rms(silence) == 0.0

    loud_pcm = generate_pcm_frame(amplitude=5000)
    rms = AudioVadProcessor.compute_rms(loud_pcm)
    assert rms > 3000.0  # Sine wave RMS is amplitude / sqrt(2) ~ 3535


def test_speech_onset_and_trailing_silence_finalization() -> None:
    """Verify that speech energy triggers speech onset and 1500ms (30 frames) silence triggers completion."""
    vad = AudioVadProcessor(energy_threshold_rms=400.0)
    loud_frame = generate_pcm_frame(amplitude=4000)
    silence_frame = generate_pcm_frame(amplitude=0)

    # 1. Initially silent
    res0 = vad.process_frame(silence_frame)
    assert not res0.is_speech
    assert not res0.speech_started
    assert not res0.speech_finalized

    # 2. First loud frame -> speech_started = True
    res1 = vad.process_frame(loud_frame)
    assert res1.is_speech
    assert res1.speech_started
    assert vad.is_candidate_speaking is True

    # 3. Candidate speaks for 9 more frames (total 10 frames = 500ms >= 400ms required)
    for _ in range(9):
        res = vad.process_frame(loud_frame)
        assert res.is_speech
        assert not res.speech_started

    # 4. Trailing silence begins: send 29 frames of silence (1450ms < 1500ms required)
    for _ in range(29):
        res = vad.process_frame(silence_frame)
        assert not res.is_speech
        assert not res.speech_finalized
        assert vad.is_candidate_speaking is True

    # 5. The 30th silence frame (1,500 ms total silence) triggers speech_finalized!
    res_final = vad.process_frame(silence_frame)
    assert res_final.speech_finalized is True
    assert vad.is_candidate_speaking is False

    # 6. Retrieve buffer
    buffer = vad.get_and_reset_buffer()
    assert len(buffer) > 0


def test_small_chunk_variable_rate_vad() -> None:
    """Verify that 86-byte chunks with 200ms pauses do not finalize early, only after >= 1500ms silence."""
    vad = AudioVadProcessor()
    chunk_loud = generate_pcm_chunk(amplitude=3000, num_bytes=86)
    chunk_silent = generate_pcm_chunk(amplitude=0, num_bytes=86)
    chunk_duration_ms = 86 / 32.0  # 2.6875 ms

    # Phase 1: Candidate speaks for 500ms (~186 chunks)
    speech_chunks = int(500.0 / chunk_duration_ms)
    for i in range(speech_chunks):
        res = vad.process_frame(chunk_loud)
        assert res.is_speech is True
        assert res.speech_finalized is False
        if i == 0:
            assert res.speech_started is True
        else:
            assert res.speech_started is False

    assert vad.is_candidate_speaking is True
    assert vad.speech_duration_ms >= 400.0

    # Phase 2: Candidate pauses for 200ms (~74 chunks) between syllables/words
    pause_chunks = int(200.0 / chunk_duration_ms)
    for _ in range(pause_chunks):
        res = vad.process_frame(chunk_silent)
        assert res.is_speech is False
        # Premature finalization should NOT happen here!
        assert res.speech_finalized is False, (
            f"Premature finalization triggered during 200ms pause! "
            f"trailing_silence_ms={vad.trailing_silence_ms:.1f}, "
            f"trailing_silence_frames={vad.trailing_silence_frames}"
        )
        assert vad.is_candidate_speaking is True

    # Phase 3: Candidate speaks again for another 500ms (~186 chunks)
    for _ in range(speech_chunks):
        res = vad.process_frame(chunk_loud)
        assert res.is_speech is True
        assert res.speech_finalized is False
        assert vad.is_candidate_speaking is True

    # Phase 4: Candidate stops speaking. Send silence up to 1400ms (~520 chunks)
    silence_chunks_1400ms = int(1400.0 / chunk_duration_ms)
    for _ in range(silence_chunks_1400ms):
        res = vad.process_frame(chunk_silent)
        assert res.is_speech is False
        assert res.speech_finalized is False
        assert vad.is_candidate_speaking is True

    # Phase 5: Continue silence until total continuous silence >= 1500ms
    finalized = False
    for _ in range(100):  # send more silence chunks
        res = vad.process_frame(chunk_silent)
        if res.speech_finalized:
            finalized = True
            break

    assert finalized is True
    assert vad.is_candidate_speaking is False
    assert vad.trailing_silence_ms == 0.0  # Reset upon finalization
    buffer = vad.get_and_reset_buffer()
    assert len(buffer) > 0


def test_force_finalize() -> None:
    """Verify force_finalize clears accumulator and returns collected audio."""
    vad = AudioVadProcessor()
    loud_frame = generate_pcm_frame(amplitude=3000)

    vad.process_frame(loud_frame)
    vad.process_frame(loud_frame)

    assert len(vad.audio_buffer) == 3200
    audio = vad.force_finalize()
    assert len(audio) == 3200
    assert len(vad.audio_buffer) == 0


def test_conversational_rms_speech_detection() -> None:
    """Verify that natural speaking amplitude (RMS ~70) is detected by default threshold 60.0."""
    vad = AudioVadProcessor()
    # Amplitude 100 on sine wave gives RMS = 100 / sqrt(2) ~ 70.7
    normal_frame = generate_pcm_frame(amplitude=100)
    res = vad.process_frame(normal_frame)
    assert res.is_speech is True
    assert res.speech_started is True
    assert vad.is_candidate_speaking is True
    assert len(vad.audio_buffer) == 1600


@pytest.mark.asyncio
async def test_stt_transcribe_final_mock_fallback() -> None:
    """Verify STTService returns mock fallback for >=1.0s audio in development/testing."""
    from app.services.speech_service import STTService

    # 1.5 seconds of 16kHz audio = 48000 bytes
    dummy_audio = generate_pcm_frame(amplitude=500, num_samples=24000)
    transcript = await STTService.transcribe_final(
        dummy_audio,
        allow_mock_fallback=True,
    )
    assert transcript != ""
    assert "distributed backend systems" in transcript

"""Unit tests for 16kHz PCM audio frame processing and trailing silence VAD."""

import math
import struct

from app.services.audio_vad import AudioVadProcessor


def generate_pcm_frame(amplitude: int = 0, num_samples: int = 800) -> bytes:
    """Generate a 50ms (800 samples) 16-bit Mono Linear PCM frame."""
    if amplitude == 0:
        return b"\x00" * (num_samples * 2)

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
    """Verify that speech energy triggers speech onset and 24 silence frames trigger completion."""
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

    # 3. Candidate speaks for 4 more frames (total 5 frames > MIN_SPEECH_FRAMES_REQUIRED)
    for _ in range(4):
        res = vad.process_frame(loud_frame)
        assert res.is_speech
        assert not res.speech_started

    # 4. Trailing silence begins: send 23 frames of silence (< 24 required)
    for _ in range(23):
        res = vad.process_frame(silence_frame)
        assert not res.is_speech
        assert not res.speech_finalized
        assert vad.is_candidate_speaking is True

    # 5. The 24th silence frame (1,200 ms total silence) triggers speech_finalized!
    res_final = vad.process_frame(silence_frame)
    assert res_final.speech_finalized is True
    assert vad.is_candidate_speaking is False

    # 6. Retrieve buffer
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

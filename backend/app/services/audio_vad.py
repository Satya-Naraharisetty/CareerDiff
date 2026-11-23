"""Voice Activity Detection (VAD) and audio frame processing for 16kHz Linear PCM."""

import math
import struct
from dataclasses import dataclass


@dataclass
class VadFrameResult:
    """Result of analyzing an individual audio frame for voice energy and turn state."""

    is_speech: bool
    rms_energy: float
    speech_started: bool = False
    speech_finalized: bool = False


class AudioVadProcessor:
    """Processes 16kHz 16-bit Mono Linear PCM frames and tracks speech turn boundaries."""

    SAMPLE_RATE: int = 16000
    BYTES_PER_SAMPLE: int = 2
    CHANNELS: int = 1
    FRAME_DURATION_MS: int = 50
    FRAME_SIZE_BYTES: int = 1600  # 800 samples * 2 bytes = 1600 bytes

    # Silence threshold: 1,500 ms of trailing silence (natural conversation cadence)
    TRAILING_SILENCE_MS: float = 1500.0
    MIN_SPEECH_DURATION_MS: float = 400.0  # At least 400ms of speech before finalization
    MAX_CONTINUOUS_SPEECH_MS: float = 60000.0  # 60s max continuous speech cap before auto-finalization
    TRAILING_SILENCE_FRAMES_REQUIRED: int = 30  # Preserved for backward compatibility
    MIN_SPEECH_FRAMES_REQUIRED: int = 3
    MAX_CONTINUOUS_SPEECH_FRAMES: int = 1200
    DEFAULT_ENERGY_THRESHOLD_RMS: float = 60.0

    def __init__(
        self,
        energy_threshold_rms: float = DEFAULT_ENERGY_THRESHOLD_RMS,
        trailing_silence_frames: int = TRAILING_SILENCE_FRAMES_REQUIRED,
    ) -> None:
        self.energy_threshold_rms = energy_threshold_rms
        self.trailing_silence_frames_required = trailing_silence_frames
        self.is_candidate_speaking: bool = False
        self.speech_frames_count: int = 0
        self.speech_duration_ms: float = 0.0
        self.trailing_silence_frames: int = 0
        self.trailing_silence_ms: float = 0.0
        self.audio_buffer: bytearray = bytearray()

    @staticmethod
    def compute_rms(pcm_bytes: bytes) -> float:
        """Calculate Root-Mean-Square (RMS) amplitude of 16-bit signed PCM samples."""
        num_samples = len(pcm_bytes) // 2
        if num_samples == 0:
            return 0.0

        # Unpack signed 16-bit little-endian samples
        format_str = f"<{num_samples}h"
        try:
            samples = struct.unpack(format_str, pcm_bytes[: num_samples * 2])
        except struct.error:
            return 0.0

        sum_squares = sum(s * s for s in samples)
        return math.sqrt(sum_squares / num_samples)

    def process_frame(self, pcm_bytes: bytes) -> VadFrameResult:
        """Analyze a PCM chunk and evaluate turn boundaries based on RMS and wall-clock duration."""
        rms = self.compute_rms(pcm_bytes)
        is_speech = rms >= self.energy_threshold_rms
        speech_started = False
        speech_finalized = False
        chunk_ms = len(pcm_bytes) / 32.0 if pcm_bytes else 0.0

        if is_speech:
            self.audio_buffer.extend(pcm_bytes)
            self.trailing_silence_frames = 0
            self.trailing_silence_ms = 0.0
            self.speech_frames_count += 1
            self.speech_duration_ms += chunk_ms

            if not self.is_candidate_speaking:
                self.is_candidate_speaking = True
                speech_started = True

            # Safety cap: force finalization if candidate speaks continuously for >= 60 seconds
            if self.speech_duration_ms >= self.MAX_CONTINUOUS_SPEECH_MS:
                speech_finalized = True
                self.is_candidate_speaking = False
                self.speech_frames_count = 0
                self.speech_duration_ms = 0.0
                self.trailing_silence_frames = 0
                self.trailing_silence_ms = 0.0

        else:
            if self.is_candidate_speaking:
                self.audio_buffer.extend(pcm_bytes)
                self.trailing_silence_frames += 1
                self.trailing_silence_ms += chunk_ms

                # Trailing silence reached
                if self.trailing_silence_ms >= self.TRAILING_SILENCE_MS:
                    if self.speech_duration_ms >= self.MIN_SPEECH_DURATION_MS:
                        speech_finalized = True
                        self.is_candidate_speaking = False
                        self.speech_frames_count = 0
                        self.speech_duration_ms = 0.0
                        self.trailing_silence_frames = 0
                        self.trailing_silence_ms = 0.0
                    else:
                        # Accidental noise/click < 400ms followed by silence: reject noise and reset state
                        self.reset()

        return VadFrameResult(
            is_speech=is_speech,
            rms_energy=rms,
            speech_started=speech_started,
            speech_finalized=speech_finalized,
        )

    def force_finalize(self) -> bytes:
        """Force turn finalization (e.g. upon client speech_stopped text frame)."""
        buffer = bytes(self.audio_buffer)
        self.reset()
        return buffer

    def get_and_reset_buffer(self) -> bytes:
        """Retrieve collected turn audio and clear internal accumulator."""
        buffer = bytes(self.audio_buffer)
        self.reset()
        return buffer

    def reset(self) -> None:
        """Reset internal accumulator and VAD state."""
        self.audio_buffer.clear()
        self.is_candidate_speaking = False
        self.speech_frames_count = 0
        self.speech_duration_ms = 0.0
        self.trailing_silence_frames = 0
        self.trailing_silence_ms = 0.0

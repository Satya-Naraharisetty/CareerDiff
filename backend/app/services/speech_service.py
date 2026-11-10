"""Speech-to-Text (STT) and Text-to-Speech (TTS) streaming services for 16kHz PCM audio."""

import asyncio
import math
import struct
from collections.abc import AsyncGenerator


class STTService:
    """Handles real-time streaming speech transcription (partial and final transcripts)."""

    @classmethod
    def transcribe_partial(
        cls, audio_bytes: bytes | bytearray, word_hint: str | None = None
    ) -> str:
        """Produce streaming partial transcript feedback as candidate speaks."""
        duration_sec = len(audio_bytes) / (16000 * 2)
        if duration_sec < 0.25:
            return ""

        hint = word_hint or "I am explaining the system architecture"
        words = hint.split()
        visible_words = min(len(words), max(1, int(duration_sec * 2.5)))
        return " ".join(words[:visible_words]) + "..."

    @classmethod
    async def transcribe_final(
        cls,
        audio_bytes: bytes,
        simulated_transcript: str | None = None,
    ) -> str:
        """Transcribe finalized speech turn into verified text transcript."""
        if simulated_transcript:
            return simulated_transcript.strip()

        duration_sec = len(audio_bytes) / (16000 * 2)
        if duration_sec < 0.3:
            return ""

        return (
            "We used Kafka partition keys to preserve order, configured min.insync.replicas=2, "
            "and mitigated consumer group rebalance latency using cooperative sticky assignors."
        )


class TTSService:
    """Synthesizes text into 16kHz 16-bit Mono Linear PCM binary frames in 100ms chunks."""

    SAMPLE_RATE: int = 16000
    BYTES_PER_SAMPLE: int = 2
    CHUNK_DURATION_MS: int = 100
    CHUNK_SIZE_BYTES: int = 3200  # 1600 samples * 2 bytes = 3200 bytes

    @classmethod
    async def synthesize_pcm_stream(
        cls,
        text: str,
        chunk_duration_ms: int = CHUNK_DURATION_MS,
        realtime_delay: bool = False,
    ) -> AsyncGenerator[bytes, None]:
        """Stream 100ms PCM chunks representing synthesized speech.

        If realtime_delay is True, yields with pacing allowing barge-in preemption.
        """
        words = text.split()
        # Estimate ~2.5 words per second
        est_duration_sec = max(0.5, len(words) / 2.5)
        num_chunks = max(1, int(est_duration_sec * (1000 / chunk_duration_ms)))

        samples_per_chunk = int(cls.SAMPLE_RATE * (chunk_duration_ms / 1000))
        freq = 440.0  # 440 Hz standard acoustic carrier tone

        for i in range(num_chunks):
            # Synthesize 100ms of audio (gentle sine wave modulated by amplitude envelope)
            start_sample = i * samples_per_chunk
            raw_samples: list[int] = []
            for j in range(samples_per_chunk):
                sample_idx = start_sample + j
                t = sample_idx / cls.SAMPLE_RATE
                # Modulated audible speech-like envelope
                envelope = 0.5 * (1.0 + math.sin(2 * math.pi * 3.0 * t))
                val = int(envelope * 8000.0 * math.sin(2 * math.pi * freq * t))
                val = max(-32767, min(32767, val))
                raw_samples.append(val)

            chunk_bytes = struct.pack(f"<{samples_per_chunk}h", *raw_samples)

            if realtime_delay:
                await asyncio.sleep(chunk_duration_ms / 1000)

            yield chunk_bytes

    @classmethod
    def generate_silence(cls, duration_ms: int = 100) -> bytes:
        """Return zeroed PCM bytes for silence padding."""
        samples = int(cls.SAMPLE_RATE * (duration_ms / 1000))
        return b"\x00" * (samples * cls.BYTES_PER_SAMPLE)

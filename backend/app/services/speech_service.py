"""Speech-to-Text (STT) and Text-to-Speech (TTS) streaming services for 16kHz PCM audio."""

import asyncio
import logging
import math
import struct
from collections.abc import AsyncGenerator

import httpx

from app.core.config import get_settings

logger = logging.getLogger("CareerDiff.speech")


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

        if word_hint:
            words = word_hint.split()
            visible_words = min(len(words), max(1, int(duration_sec * 2.5)))
            return " ".join(words[:visible_words]) + "..."
        return ""

    @classmethod
    async def transcribe_final(
        cls,
        audio_bytes: bytes,
        simulated_transcript: str | None = None,
        allow_mock_fallback: bool = False,
    ) -> str:
        """Transcribe finalized speech turn into verified text transcript."""
        if simulated_transcript is not None and simulated_transcript.strip():
            logger.info("STT transcribe_final: using client-provided transcript (%d chars)", len(simulated_transcript.strip()))
            return simulated_transcript.strip()

        duration_sec = len(audio_bytes) / (16000 * 2) if audio_bytes else 0.0
        if duration_sec < 0.3 and not simulated_transcript:
            logger.info("STT transcribe_final: audio duration too short (%.2fs), returning empty", duration_sec)
            return ""

        settings = get_settings()

        # Attempt Deepgram transcription if configured
        if settings.deepgram_api_key and audio_bytes:
            try:
                logger.info("STT transcribe_final: dispatching %d audio bytes (%.2fs) to Deepgram Nova-2...", len(audio_bytes), duration_sec)
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.post(
                        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&encoding=linear16&sample_rate=16000&channels=1",
                        headers={
                            "Authorization": f"Token {settings.deepgram_api_key}",
                            "Content-Type": "audio/raw",
                        },
                        content=audio_bytes,
                    )
                    if response.status_code == 200:
                        data = response.json()
                        channels = data.get("results", {}).get("channels", [])
                        if channels and channels[0].get("alternatives"):
                            transcript = str(channels[0]["alternatives"][0].get("transcript", "")).strip()
                            if transcript:
                                logger.info("STT transcribe_final: Deepgram recognized %d chars", len(transcript))
                                return transcript
            except Exception as exc:
                logger.warning("Deepgram transcription call encountered exception: %s", exc)

        return ""



class TTSService:
    """Synthesizes text into studio-grade 24kHz 16-bit Mono Linear PCM audio streams (ElevenLabs-level naturalness)."""

    SAMPLE_RATE: int = 24000
    BYTES_PER_SAMPLE: int = 2
    CHUNK_DURATION_MS: int = 100
    CHUNK_SIZE_BYTES: int = 4800  # 2400 samples * 2 bytes = 4800 bytes @ 24kHz

    VOICE_MAP: dict[str, str] = {
        "Puck": "en-US-AndrewNeural",
        "Alex": "en-US-AndrewNeural",
        "Aoede": "en-US-AvaNeural",
        "Maya": "en-US-AvaNeural",
    }

    FALLBACK_VOICES_MALE: list[str] = [
        "en-US-AndrewNeural",
        "en-US-GuyNeural",
        "en-US-BrianNeural",
        "en-US-ChristopherNeural",
    ]

    FALLBACK_VOICES_FEMALE: list[str] = [
        "en-US-AvaNeural",
        "en-US-JennyNeural",
        "en-US-AriaNeural",
        "en-US-EmmaNeural",
    ]

    _PCM_CACHE: dict[str, bytes] = {}

    @classmethod
    def get_candidate_voices(cls, voice_name: str | None = None) -> list[str]:
        """Resolve primary and fallback neural voices for high reliability."""
        primary = cls.VOICE_MAP.get(voice_name or "Puck", "en-US-AndrewNeural")
        is_female = (
            (voice_name and voice_name.lower() in ("aoede", "maya", "female", "jenny", "ava"))
            or "ava" in primary.lower()
            or "jenny" in primary.lower()
        )
        pool = cls.FALLBACK_VOICES_FEMALE if is_female else cls.FALLBACK_VOICES_MALE
        candidates = [primary] + [v for v in pool if v != primary]
        return candidates

    @classmethod
    async def prewarm(cls, text: str, voice_name: str | None = None) -> bytes | None:
        """Asynchronously pre-synthesize neural speech and cache raw PCM bytes for instant zero-latency playback."""
        clean_text = text.strip()
        if not clean_text:
            return None

        candidates = cls.get_candidate_voices(voice_name)
        for neural_voice in candidates:
            cache_key = f"{neural_voice}:{clean_text}"
            if cache_key in cls._PCM_CACHE:
                return cls._PCM_CACHE[cache_key]

            try:
                import edge_tts
                import miniaudio

                communicate = edge_tts.Communicate(clean_text, neural_voice)
                audio_chunks: list[bytes] = []
                async for chunk in communicate.stream():
                    if chunk.get("type") == "audio" and chunk.get("data"):
                        audio_chunks.append(chunk["data"])

                if audio_chunks:
                    mp3_bytes = b"".join(audio_chunks)
                    decoded = miniaudio.decode(mp3_bytes, nchannels=1, sample_rate=cls.SAMPLE_RATE)
                    pcm_raw = decoded.samples.tobytes()
                    cls._PCM_CACHE[cache_key] = pcm_raw
                    logger.info(
                        "[TTS] Prewarmed and cached %d neural PCM bytes for voice '%s'",
                        len(pcm_raw),
                        neural_voice,
                    )
                    return pcm_raw
            except Exception as exc:
                logger.warning("[TTS] Prewarm error for voice '%s': %s", neural_voice, exc)

        return None

    @classmethod
    async def synthesize_pcm_stream(
        cls,
        text: str,
        voice_name: str | None = None,
        chunk_duration_ms: int = CHUNK_DURATION_MS,
        realtime_delay: bool = False,
    ) -> AsyncGenerator[bytes, None]:
        """Stream studio-quality neural PCM chunks representing lifelike synthesized speech.

        Uses Microsoft Neural Edge TTS (Andrew/Ava) decoded via miniaudio to 24kHz Linear PCM.
        Serves instantly from in-memory cache when prewarmed to eliminate startup latency.
        """
        clean_text = text.strip()
        if not clean_text:
            return

        candidates = cls.get_candidate_voices(voice_name)

        # 1. Check instant in-memory cache across candidates
        for neural_voice in candidates:
            cache_key = f"{neural_voice}:{clean_text}"
            if cache_key in cls._PCM_CACHE:
                pcm_raw = cls._PCM_CACHE[cache_key]
                chunk_size = int(cls.SAMPLE_RATE * (chunk_duration_ms / 1000) * cls.BYTES_PER_SAMPLE)
                total_len = len(pcm_raw)
                logger.info(
                    "[TTS] Instant cache hit: streaming %d neural PCM bytes (~%.1fs audio) for voice '%s'",
                    total_len,
                    total_len / (cls.SAMPLE_RATE * cls.BYTES_PER_SAMPLE),
                    neural_voice,
                )
                for offset in range(0, total_len, chunk_size):
                    if realtime_delay:
                        await asyncio.sleep(chunk_duration_ms / 1000)
                    yield pcm_raw[offset : offset + chunk_size]
                return

        # 2. Synthesize using candidate voices in order of fidelity
        for neural_voice in candidates:
            cache_key = f"{neural_voice}:{clean_text}"
            logger.info(
                "[TTS] Synthesizing neural speech with voice '%s' (%d chars)",
                neural_voice,
                len(clean_text),
            )

            try:
                import edge_tts
                import miniaudio

                communicate = edge_tts.Communicate(clean_text, neural_voice)
                audio_chunks: list[bytes] = []
                async for chunk in communicate.stream():
                    if chunk.get("type") == "audio" and chunk.get("data"):
                        audio_chunks.append(chunk["data"])

                if audio_chunks:
                    mp3_bytes = b"".join(audio_chunks)
                    decoded = miniaudio.decode(mp3_bytes, nchannels=1, sample_rate=cls.SAMPLE_RATE)
                    pcm_raw = decoded.samples.tobytes()
                    cls._PCM_CACHE[cache_key] = pcm_raw

                    chunk_size = int(cls.SAMPLE_RATE * (chunk_duration_ms / 1000) * cls.BYTES_PER_SAMPLE)
                    total_len = len(pcm_raw)
                    logger.info(
                        "[TTS] Successfully decoded %d neural PCM bytes (~%.1fs audio) with '%s'",
                        total_len,
                        total_len / (cls.SAMPLE_RATE * cls.BYTES_PER_SAMPLE),
                        neural_voice,
                    )

                    for offset in range(0, total_len, chunk_size):
                        chunk_bytes = pcm_raw[offset : offset + chunk_size]
                        if realtime_delay:
                            await asyncio.sleep(chunk_duration_ms / 1000)
                        yield chunk_bytes
                    return
            except Exception as exc:
                logger.warning("[TTS] edge-tts error with voice '%s': %s", neural_voice, exc)

        logger.warning(
            "[TTS] All edge-tts neural voices exhausted for text: '%s'. Yielding empty to trigger browser Web Speech API fallback.",
            clean_text[:50],
        )

    @classmethod
    def generate_silence(cls, duration_ms: int = 100) -> bytes:
        """Return zeroed PCM bytes for silence padding."""
        samples = int(cls.SAMPLE_RATE * (duration_ms / 1000))
        return b"\x00" * (samples * cls.BYTES_PER_SAMPLE)

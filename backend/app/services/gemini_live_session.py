"""Gemini Live Multimodal API Bridge for real-time bidirectional voice interviews.

Connects to gemini-3.8-live-extended-thinking over WebSockets (v1alpha), multiplexing
inbound 16kHz PCM audio, real-time candidate transcription (input_audio_transcription),
real-time interviewer 24kHz audio synthesis, spoken conversational fillers, and native barge-in.
"""

import asyncio
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import types

from app.core.config import get_settings
from app.models.interview import Interview

logger = logging.getLogger("CareerDiff.gemini_live")


@dataclass
class GeminiLiveEvent:
    """Event emitted from Gemini Live WebSocket stream."""

    event_type: str  # "input_transcript", "output_transcript", "audio_chunk", "interrupted", "turn_complete"
    text: str | None = None
    audio_bytes: bytes | None = None


SUPPORTED_VOICES = {"Puck", "Aoede"}

VOICE_PERSONAS: dict[str, dict[str, str]] = {
    "Puck": {
        "interviewer_name": "Alex",
        "gender": "Male",
        "style": "warm, conversational, engaging, and collaborative—like a friendly senior peer engineer having a whiteboard discussion",
    },
    "Aoede": {
        "interviewer_name": "Maya",
        "gender": "Female",
        "style": "rich, articulate, dynamic, and expressive—like an insightful Staff Engineer exploring architecture trade-offs",
    },
}

VOICE_FALLBACK_MAP: dict[str, str] = {
    "Puck": "Puck",
    "Charon": "Puck",
    "Fenrir": "Puck",
    "Aoede": "Aoede",
    "Kore": "Aoede",
}


def build_live_system_instruction(interview: Interview, voice_name: str = "Puck") -> str:
    """Build detailed interviewer system prompt based on candidate resume, blueprint, and voice persona."""
    seniority = getattr(interview, "target_seniority", None) or "SENIOR"

    policy = getattr(interview, "session_policy", {}) or {}
    company = "GlobalFinTech Corp"
    if isinstance(policy, dict) and policy.get("target_company"):
        company = policy["target_company"]
    else:
        try:
            role = getattr(interview, "role", None)
            if role and getattr(role, "name", None):
                company = role.name
        except Exception:
            pass

    candidate_name = "Candidate"
    try:
        profile = getattr(interview, "candidate_profile", None)
        if profile and getattr(profile, "user", None):
            candidate_name = profile.user.full_name or "Candidate"
    except Exception:
        pass

    persona = VOICE_PERSONAS.get(voice_name, VOICE_PERSONAS["Puck"])
    interviewer_name = persona["interviewer_name"]
    interviewer_style = persona["style"]

    topics_summary = ""
    try:
        blueprint = getattr(interview, "blueprint", None)
        if blueprint is not None and getattr(blueprint, "topics", None):
            topic_lines = [
                f"- {t.topic_name} (Allocated: {getattr(t, 'allocated_seconds', 0) // 60} min)"
                for t in blueprint.topics
            ]
            topics_summary = "\n".join(topic_lines)
    except Exception:
        pass

    claims_summary = ""
    try:
        profile = getattr(interview, "candidate_profile", None)
        if profile and getattr(profile, "resumes", None):
            all_claims = []
            for r in profile.resumes:
                if getattr(r, "claims", None):
                    all_claims.extend(r.claims)
            if all_claims:
                claim_lines = [
                    f"- Claimed: {c.claim_text} ({', '.join(c.technologies) if getattr(c, 'technologies', None) else ''})"
                    for c in all_claims[:5]
                ]
                claims_summary = "\n".join(claim_lines)
    except Exception:
        pass

    return (
        f"You are {interviewer_name}, Lead Technical Interviewer at {company}, conducting an interactive, live {seniority} engineering interview "
        f"with {candidate_name}.\n"
        f"Your vocal style is {interviewer_style}.\n\n"
        f"Interview Blueprint & Competencies:\n"
        f"{topics_summary or '- Distributed Systems, Concurrency, and System Architecture'}\n\n"
        f"Candidate Resume Claims (Verify and explore these during relevant topics):\n"
        f"{claims_summary or '- Senior Software Engineer background'}\n\n"
        f"Human Vocal Delivery & Conversational Directives:\n"
        f"1. Spoken Conversational Realism: You are speaking live over an audio voice call. Speak with an authentic, "
        f"warm, natural human tone—just like a real engineer having an engaging whiteboard discussion over Zoom or coffee.\n"
        f"2. Prosody & Inflection: Never sound robotic, flat, or scripted. Vary your pitch contours, pacing, and vocal inflection "
        f"dynamically as a human speaker does. Emphasize key architectural concepts with natural spoken emphasis.\n"
        f"3. Spoken Fillers & Active Listening: When the candidate answers, briefly acknowledge their point before asking the next question "
        f"(e.g., 'Got it...', 'Hmm, interesting trade-off—', 'Right, that makes total sense.', 'Understood, let's look closer at that...'). "
        f"Use natural human conversational rhythm with occasional micro-pauses for thought.\n"
        f"4. Concise Spoken Turns: Keep your spoken output to 1 to 2 crisp, focused sentences per turn. Do not give speeches or monologues. "
        f"Ask exactly ONE clear, technically probing question at a time.\n"
        f"5. Conversational Contractions: Always use natural spoken contractions ('I'd', 'we've', 'that's', 'let's', 'it's', 'you're') "
        f"instead of stiff, formal written phrases ('I would', 'let us', 'that is').\n"
        f"6. Natural Dialogue Transitions: Never announce administrative states (e.g., do not say 'Moving to Topic 2' or 'Question 3:'). "
        f"Seamlessly weave transitions into the conversation: 'Nice. Building on that, how would this handle a network partition between data centers?'\n"
        f"7. Professional & Encouraging Rigor: Maintain high technical standards for a {seniority} role at {company}, "
        f"while being respectful, curious, and collaborative.\n"
        f"8. Never reveal solutions or evaluate yourself; continuously challenge the candidate to justify their technical decisions."
    )


class GeminiLiveBridge:
    """Bidirectional streaming bridge connecting CareerDiff voice gateway to Gemini Live API."""

    def __init__(self, interview: Interview, voice_name: str | None = None) -> None:
        self.interview = interview
        self.settings = get_settings()
        self._session: Any = None
        self._active = False
        self._input_transcript_buffer: list[str] = []
        self._output_transcript_buffer: list[str] = []

        policy = getattr(interview, "session_policy", {}) or {}
        policy_voice = policy.get("interviewer_voice") if isinstance(policy, dict) else None
        cand_voice = voice_name or policy_voice or self.settings.gemini_live_voice or "Puck"
        resolved_voice = VOICE_FALLBACK_MAP.get(cand_voice, cand_voice if cand_voice in SUPPORTED_VOICES else "Puck")
        self.voice_name = resolved_voice
        logger.info(
            "Created GeminiLiveBridge for interview %s (persona voice: %s)",
            getattr(interview, "id", "unknown"),
            self.voice_name,
        )

    @property
    def is_active(self) -> bool:
        """Return True if Gemini Live WebSocket session is active and healthy."""
        return self._active and self._session is not None

    async def connect(self) -> AsyncGenerator[GeminiLiveEvent, None]:
        """Establish Gemini Live WebSocket connection and yield live events continuously."""
        if not self.settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not configured for Gemini Live session")

        client = genai.Client(
            api_key=self.settings.gemini_api_key,
            http_options=types.HttpOptions(api_version="v1alpha"),
        )

        system_instruction = build_live_system_instruction(self.interview, voice_name=self.voice_name)

        # Attempt gemini-3.8-live-extended-thinking first, with fallback to gemini-3.8-live
        model_candidates = [
            self.settings.gemini_live_model,
            "gemini-3.8-live-extended-thinking",
            "gemini-3.8-live",
        ]
        # Deduplicate while preserving order
        unique_models = list(dict.fromkeys(model_candidates))

        connected_session = None
        for model_name in unique_models:
            is_extended_thinking = "extended-thinking" in model_name
            config_args: dict[str, Any] = {
                "response_modalities": [types.Modality.AUDIO],
                "speech_config": types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=self.voice_name)
                    )
                ),
                "system_instruction": types.Content(parts=[types.Part(text=system_instruction)]),
                "input_audio_transcription": types.AudioTranscriptionConfig(),
                "output_audio_transcription": types.AudioTranscriptionConfig(),
            }
            if is_extended_thinking:
                config_args["thinking_config"] = types.ThinkingConfig(
                    thinking_level=types.ThinkingLevel.LOW
                )

            config = types.LiveConnectConfig(**config_args)
            try:
                logger.info("Attempting Gemini Live connection with model: %s", model_name)
                session_cm = client.aio.live.connect(model=model_name, config=config)
                connected_session = await session_cm.__aenter__()
                self._session = connected_session
                self._active = True
                logger.info("Successfully established Gemini Live session with %s", model_name)
                break
            except Exception as exc:
                logger.warning("Failed Gemini Live connection with %s: %s", model_name, exc)
                continue

        if not connected_session:
            raise RuntimeError("Unable to connect to any Gemini Live model")

        try:
            async for response in connected_session.receive():
                if not self._active:
                    break

                server_content = response.server_content
                if not server_content:
                    continue

                # 1. Native Interruption / Barge-In
                if getattr(server_content, "interrupted", False):
                    logger.info("Gemini Live: Native barge-in detected (interviewer interrupted)")
                    self._output_transcript_buffer.clear()
                    yield GeminiLiveEvent(event_type="interrupted")
                    continue

                # 2. Live Candidate Speech Transcription (Input Audio Transcription)
                interim = getattr(server_content, "interim_input_transcription", None)
                if interim and getattr(interim, "text", None):
                    interim_text = interim.text
                    full_interim = "".join(self._input_transcript_buffer) + interim_text
                    logger.debug("[GEMINI LIVE] Candidate interim transcript (%d chars)", len(full_interim))
                    yield GeminiLiveEvent(
                        event_type="input_transcript",
                        text=full_interim,
                    )

                final_in = getattr(server_content, "input_transcription", None)
                if final_in and getattr(final_in, "text", None):
                    input_text = final_in.text
                    self._input_transcript_buffer.append(input_text)
                    full_in = "".join(self._input_transcript_buffer)
                    logger.info("[GEMINI LIVE] Candidate finalized transcript (%d chars)", len(full_in))
                    yield GeminiLiveEvent(
                        event_type="input_transcript",
                        text=full_in,
                    )

                # 3. Live Interviewer Audio & Transcription Output
                if server_content.output_transcription and server_content.output_transcription.text:
                    out_text = server_content.output_transcription.text
                    self._output_transcript_buffer.append(out_text)
                    logger.info("Gemini Live [Interviewer Speaking]: %s", out_text)
                    yield GeminiLiveEvent(
                        event_type="output_transcript",
                        text="".join(self._output_transcript_buffer),
                    )

                if server_content.model_turn and server_content.model_turn.parts:
                    for part in server_content.model_turn.parts:
                        if part.inline_data and part.inline_data.data:
                            yield GeminiLiveEvent(
                                event_type="audio_chunk",
                                audio_bytes=part.inline_data.data,
                            )

                # 4. Turn Completion
                if getattr(server_content, "turn_complete", False):
                    full_output = "".join(self._output_transcript_buffer).strip()
                    logger.info("Gemini Live: Turn completed (%d chars)", len(full_output))
                    self._input_transcript_buffer.clear()
                    self._output_transcript_buffer.clear()
                    yield GeminiLiveEvent(
                        event_type="turn_complete",
                        text=full_output,
                    )

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Error during Gemini Live receive loop: %s", exc)
        finally:
            self._active = False
            if connected_session:
                try:
                    await session_cm.__aexit__(None, None, None)
                except Exception:
                    pass
                self._session = None

    async def send_audio_frame(self, pcm16_bytes: bytes) -> None:
        """Stream raw 16kHz Linear PCM mono audio frame to Gemini Live."""
        if not self._session or not self._active:
            return
        try:
            await self._session.send_realtime_input(
                audio=types.Blob(data=pcm16_bytes, mime_type="audio/pcm;rate=16000")
            )
        except Exception as exc:
            logger.warning("Failed sending audio frame to Gemini Live: %s", exc)

    async def send_audio_stream_end(self) -> None:
        """Signal candidate speech pause or turn completion to Gemini Live."""
        if not self._session or not self._active:
            return
        try:
            await self._session.send_realtime_input(audio_stream_end=True)
        except Exception as exc:
            logger.warning("Failed sending audio_stream_end: %s", exc)

    async def send_initial_greeting_prompt(self, candidate_name: str) -> None:
        """Trigger initial turn 0 warmup greeting from Gemini Live."""
        if not self._session or not self._active:
            return
        try:
            prompt = (
                f"Begin the technical interview. Give a warm, concise 1-2 sentence greeting to {candidate_name} "
                f"and ask them to briefly introduce their background."
            )
            await self._session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part(text=prompt)]),
                turn_complete=True,
            )
        except Exception as exc:
            logger.warning("Failed triggering Gemini Live initial greeting: %s", exc)

    async def send_text_input(self, text: str) -> None:
        """Send explicit text input from candidate to Gemini Live."""
        if not self._session or not self._active:
            return
        try:
            await self._session.send_client_content(
                turns=types.Content(role="user", parts=[types.Part(text=text)]),
                turn_complete=True,
            )
        except Exception as exc:
            logger.warning("Failed sending text input to Gemini Live: %s", exc)

    async def close(self) -> None:
        """Close active Gemini Live session."""
        self._active = False

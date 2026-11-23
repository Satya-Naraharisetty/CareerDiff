import { create } from 'zustand';
import { interviewsApi } from '../lib/api';
import { PcmPlayer, PcmRecorder } from '../lib/audio';
import { BrowserSpeechRecognizer } from '../lib/speechRecognition';
import { BrowserSpeechSynthesizer } from '../lib/speechSynthesis';
import type {
  EngineAction,
  InterviewBlueprintRead,
  InterviewMode,
  InterviewState,
  InterviewTurnRead,
  SeniorityLevel,
  WsServerMessage,
} from '../types';

interface InterviewStoreState {
  interviewId: string | null;
  state: InterviewState;
  mode: InterviewMode;
  targetSeniority: SeniorityLevel;
  blueprint: InterviewBlueprintRead | null;
  turns: InterviewTurnRead[];
  partialTranscript: string;
  isSubmitting: boolean;
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  isRecording: boolean;
  audioLevel: number;
  isInterviewerSpeaking: boolean;
  currentTopic: string | null;
  remainingSeconds: number;
  preferredLanguage: string;
  error: string | null;
  isMicMuted: boolean;
  isCameraOn: boolean;
  isVoiceMuted: boolean;
  /** True once the server has streamed interviewer audio (Gemini Live / server TTS) this session. */
  serverAudioActive: boolean;
  /** Non-fatal notice, e.g. live captions unsupported in this browser. */
  notice: string | null;

  setInterview: (
    id: string,
    state: InterviewState,
    mode: InterviewMode,
    seniority: SeniorityLevel,
    blueprint: InterviewBlueprintRead,
    preferredLanguage?: string
  ) => void;
  setMode: (mode: InterviewMode) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleVoiceMute: () => void;
  rehydrateSession: (interviewId: string) => Promise<void>;
  loadTurns: (interviewId: string) => Promise<void>;
  startInterview: () => Promise<void>;
  submitTextTurn: (text: string, codeSnippet?: string) => Promise<void>;
  /** Typed answer: over the live voice socket when connected, otherwise via REST. */
  sendTypedAnswer: (text: string, codeSnippet?: string) => Promise<void>;
  initVoiceSession: () => Promise<void>;
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;
  bargeIn: () => void;
  disconnectVoiceSession: () => void;
  concludeSession: () => Promise<string | null>;
  reset: () => void;
}

const ACTIVE_INTERVIEW_ID_KEY = 'careerdiff_active_interview_id';

let activeWs: WebSocket | null = null;
let pcmPlayer: PcmPlayer | null = null;
let pcmRecorder: PcmRecorder | null = null;
let speechRecognizer: BrowserSpeechRecognizer | null = null;
let intentionalClose = false;
let reconnectAttempts = 0;
let reconnectTimer: number | null = null;
const MAX_RECONNECT_ATTEMPTS = 3;

export const useInterviewStore = create<InterviewStoreState>((set, get) => ({
  interviewId: typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_INTERVIEW_ID_KEY) : null,
  state: 'CREATED',
  mode: 'VOICE',
  targetSeniority: 'SENIOR',
  blueprint: null,
  turns: [],
  partialTranscript: '',
  isSubmitting: false,
  wsStatus: 'disconnected',
  isRecording: false,
  audioLevel: 0,
  isInterviewerSpeaking: false,
  currentTopic: null,
  remainingSeconds: 1800,
  preferredLanguage: 'Python',
  error: null,
  isMicMuted: false,
  isCameraOn: false,
  isVoiceMuted: false,
  serverAudioActive: false,
  notice: null,

  toggleMic: () => {
    const next = !get().isMicMuted;
    set({ isMicMuted: next, audioLevel: next ? 0 : get().audioLevel });
  },

  toggleCamera: () => {
    set((s) => ({ isCameraOn: !s.isCameraOn }));
  },

  toggleVoiceMute: () => {
    const next = !get().isVoiceMuted;
    if (next && pcmPlayer) {
      pcmPlayer.stopAll();
    }
    set({ isVoiceMuted: next });
  },

  setInterview: (id, state, mode, seniority, blueprint, preferredLanguage) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ACTIVE_INTERVIEW_ID_KEY, id);
      }
    } catch {}
    set({
      interviewId: id,
      state,
      mode,
      targetSeniority: seniority,
      blueprint,
      preferredLanguage: preferredLanguage || 'Python',
      turns: [],
      partialTranscript: '',
      serverAudioActive: false,
      notice: null,
      remainingSeconds: (blueprint.total_allocated_seconds || 1800),
      currentTopic: blueprint.topics?.[0]?.topic_name || null,
      error: null,
    });
  },

  setMode: (mode) => {
    set({ mode });
  },

  rehydrateSession: async (interviewId: string) => {
    try {
      const detail = await interviewsApi.get(interviewId);
      const turns = await interviewsApi.getTurns(interviewId);
      const remaining = Math.max(
        0,
        (detail.scheduled_duration_minutes || 30) * 60 - (detail.actual_duration_seconds || 0)
      );
      set({
        interviewId: detail.id,
        state: detail.state,
        targetSeniority: detail.target_seniority,
        turns: turns || [],
        remainingSeconds: remaining,
        currentTopic: detail.current_topic || null,
        error: null,
      });
    } catch (err: unknown) {
      console.warn('Failed to rehydrate session:', err);
    }
  },

  loadTurns: async (interviewId: string) => {
    try {
      const turns = await interviewsApi.getTurns(interviewId);
      set({ turns });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load turns';
      set({ error: message });
    }
  },

  startInterview: async () => {
    const { interviewId } = get();
    if (!interviewId) return;

    set({ isSubmitting: true, error: null });
    try {
      const firstTurn = await interviewsApi.start(interviewId);
      set({
        turns: [firstTurn],
        state: 'WARMUP',
        isSubmitting: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start interview';
      set({ error: message, isSubmitting: false });
    }
  },

  submitTextTurn: async (text: string, codeSnippet?: string) => {
    const { interviewId, turns } = get();
    if (!interviewId || !text.trim()) return;

    const displayedTranscript = codeSnippet && codeSnippet.trim()
      ? `${text.trim()}\n\n[Attached Scratchpad Snippet]:\n\`\`\`\n${codeSnippet.trim()}\n\`\`\``
      : text.trim();

    const candidateTurn: InterviewTurnRead = {
      turn_index: turns.length,
      speaker: 'CANDIDATE',
      transcript: displayedTranscript,
      created_at: new Date().toISOString(),
    };

    set({
      turns: [...turns, candidateTurn],
      isSubmitting: true,
      error: null,
    });

    try {
      const res = await interviewsApi.submitTurn(interviewId, {
        transcript: text.trim(),
        code_snippet: codeSnippet?.trim() || null,
      });

      const interviewerTurn: InterviewTurnRead = {
        turn_index: res.turn_index,
        speaker: 'INTERVIEWER',
        transcript: res.transcript,
        action_taken: res.action_taken,
        question_archetype: res.question_archetype,
        code_sample: res.code_sample,
        created_at: res.created_at,
      };

      set((state) => ({
        turns: [...state.turns, interviewerTurn],
        state: res.session_state,
        currentTopic: res.active_topic || state.currentTopic,
        isSubmitting: false,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit response';
      set({ error: message, isSubmitting: false });
    }
  },

  sendTypedAnswer: async (text: string, codeSnippet?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (get().mode === 'VOICE' && activeWs && activeWs.readyState === WebSocket.OPEN) {
      const combined = codeSnippet && codeSnippet.trim()
        ? `${trimmed}\n\n[Attached Scratchpad Snippet]:\n\`\`\`\n${codeSnippet.trim()}\n\`\`\``
        : trimmed;
      activeWs.send(JSON.stringify({ type: 'text_input', text: combined, client_timestamp_ms: Date.now() }));
      return;
    }
    await get().submitTextTurn(trimmed, codeSnippet);
  },

  initVoiceSession: async () => {
    const { interviewId } = get();
    if (!interviewId) return;

    set({ wsStatus: 'connecting', error: null });

    try {
      // 1. Get single-use ephemeral ticket from Redis
      const ticketRes = await interviewsApi.getWsTicket(interviewId);

      // 2. Build full WebSocket URL with dynamic host support
      let wsBase = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
      const configuredApi = import.meta.env.VITE_API_URL as string | undefined;
      if (configuredApi) {
        try {
          const parsed = new URL(configuredApi);
          const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
          wsBase = `${wsProtocol}//${parsed.host}`;
        } catch {
          // Keep default location host
        }
      }
      let selectedVoice = 'Puck';
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('careerdiff_gemini_voice');
        selectedVoice = stored === 'Aoede' || stored === 'Kore' ? 'Aoede' : 'Puck';
      }
      const separator = ticketRes.websocket_url.includes('?') ? '&' : '?';
      const wsUrl = `${wsBase}${ticketRes.websocket_url}${separator}voice=${encodeURIComponent(selectedVoice)}`;

      if (activeWs) {
        intentionalClose = true;
        activeWs.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (pcmPlayer) pcmPlayer.close();
      pcmPlayer = new PcmPlayer();
      pcmPlayer.onAllEnded = () => {
        set({ isInterviewerSpeaking: false });
        if (get().mode === 'VOICE' && !get().isRecording) {
          get().startVoiceRecording().catch(() => {});
        }
      };
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      activeWs = ws;
      intentionalClose = false;

      ws.onopen = () => {
        reconnectAttempts = 0;
        set({ wsStatus: 'connected', error: null });
        // Race-condition prevention: If interviewer is already done speaking and candidate mic is not active, auto-start
        const { isInterviewerSpeaking, isRecording, turns, mode } = get();
        if (
          mode === 'VOICE' &&
          !isInterviewerSpeaking &&
          !isRecording &&
          turns.length > 0 &&
          turns[turns.length - 1].speaker === 'INTERVIEWER'
        ) {
          get().startVoiceRecording().catch(() => {});
        }
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Play server binary PCM audio (from Gemini Live 24kHz or server TTS)
          if (pcmPlayer && !get().isVoiceMuted) {
            if (!get().serverAudioActive) {
              // Server voice is available: silence the browser TTS fallback so the
              // interviewer is never heard twice. Flag first so its onEnd won't start the mic.
              set({ serverAudioActive: true, isInterviewerSpeaking: true });
              BrowserSpeechSynthesizer.stop();
            } else {
              set({ isInterviewerSpeaking: true });
            }
            pcmPlayer.feed(event.data);
          }
        } else if (typeof event.data === 'string') {
          try {
            const msg: WsServerMessage = JSON.parse(event.data);
            switch (msg.type) {
              case 'session_ready':
                // Server is authoritative for the remaining time budget (also after a reconnect).
                set({
                  state: msg.state as InterviewState,
                  remainingSeconds: msg.remaining_seconds,
                });
                break;
              case 'interviewer_audio_done':
                setTimeout(() => {
                  if (pcmPlayer && pcmPlayer.activeSourcesCount() === 0) {
                    set({ isInterviewerSpeaking: false });
                    if (get().mode === 'VOICE' && !get().isRecording) {
                      get().startVoiceRecording().catch(() => {});
                    }
                  }
                }, 350);
                break;
              case 'tts_fallback_browser':
                // Server TTS has no audio; speak question via native browser speech synthesis
                if (!get().isVoiceMuted) {
                  set({ isInterviewerSpeaking: true, serverAudioActive: false });
                  BrowserSpeechSynthesizer.speak(msg.question_text || '', {
                    onEnd: () => {
                      set({ isInterviewerSpeaking: false });
                      if (get().mode === 'VOICE' && !get().isRecording) {
                        get().startVoiceRecording().catch(() => {});
                      }
                    },
                    onError: () => {
                      set({ isInterviewerSpeaking: false });
                      if (get().mode === 'VOICE' && !get().isRecording) {
                        get().startVoiceRecording().catch(() => {});
                      }
                    },
                  });
                }
                break;
              case 'transcript_partial':
                if (msg.text) {
                  set({ partialTranscript: msg.text });
                }
                break;
              case 'transcript_final':
                set((s) => {
                  const existingIdx = s.turns.findIndex(
                    (t) => t.turn_index === msg.turn_index && t.speaker === 'CANDIDATE'
                  );
                  if (existingIdx !== -1) {
                    const updatedTurns = [...s.turns];
                    updatedTurns[existingIdx] = {
                      ...updatedTurns[existingIdx],
                      transcript: msg.text,
                    };
                    return { turns: updatedTurns, partialTranscript: '' };
                  }
                  return {
                    turns: [
                      ...s.turns,
                      {
                        turn_index: msg.turn_index,
                        speaker: msg.speaker as 'CANDIDATE',
                        transcript: msg.text,
                        created_at: new Date().toISOString(),
                      },
                    ],
                    partialTranscript: '',
                  };
                });
                break;
              case 'interviewer_speaking':
                set((s) => {
                  const existingIdx = s.turns.findIndex(
                    (t) => t.turn_index === msg.turn_index && t.speaker === 'INTERVIEWER'
                  );
                  if (existingIdx !== -1) {
                    const updatedTurns = [...s.turns];
                    updatedTurns[existingIdx] = {
                      ...updatedTurns[existingIdx],
                      transcript: msg.question_text,
                      action_taken: (msg.action as EngineAction) || updatedTurns[existingIdx].action_taken,
                    };
                    return { isInterviewerSpeaking: true, turns: updatedTurns };
                  }
                  return {
                    isInterviewerSpeaking: true,
                    turns: [
                      ...s.turns,
                      {
                        turn_index: msg.turn_index,
                        speaker: 'INTERVIEWER',
                        transcript: msg.question_text,
                        action_taken: msg.action as EngineAction,
                        created_at: new Date().toISOString(),
                      },
                    ],
                  };
                });
                break;
              case 'interviewer_interrupted':
                BrowserSpeechSynthesizer.stop();
                if (pcmPlayer) {
                  pcmPlayer.stopAll();
                }
                set({ isInterviewerSpeaking: false });
                break;
              case 'state_change':
                set({
                  state: msg.new_state as InterviewState,
                  currentTopic: msg.active_competency || null,
                });
                break;
              case 'error':
                set({ error: msg.message });
                break;
            }
          } catch {
            // Json parse error on non-json message
          }
        }
      };

      ws.onerror = () => {
        // onclose follows and decides whether to reconnect
        set({ wsStatus: 'error' });
      };

      ws.onclose = () => {
        if (activeWs !== ws) return; // superseded by a newer connection
        activeWs = null;
        const { state, mode } = get();
        const sessionLive = state !== 'COMPLETED' && mode === 'VOICE';
        if (!intentionalClose && sessionLive && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts += 1;
          const delay = 1000 * 2 ** (reconnectAttempts - 1);
          set({ wsStatus: 'connecting', error: `Connection lost — reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…` });
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            get().initVoiceSession().catch(() => {});
          }, delay);
          return;
        }
        set({
          wsStatus: 'disconnected',
          ...(sessionLive && !intentionalClose
            ? { error: 'Voice connection lost. You can keep answering by typing, or reload to reconnect.' }
            : {}),
        });
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to establish voice connection';
      set({ wsStatus: 'error', error: message });
    }
  },

  startVoiceRecording: async () => {
    if (get().isRecording) return;

    // If interviewer is speaking, cut off playback immediately
    if (get().isInterviewerSpeaking) {
      BrowserSpeechSynthesizer.stop();
      if (pcmPlayer) {
        pcmPlayer.stopAll();
      }
      set({ isInterviewerSpeaking: false });
      if (activeWs && activeWs.readyState === WebSocket.OPEN) {
        activeWs.send(
          JSON.stringify({
            type: 'speech_started',
            client_timestamp_ms: Date.now(),
          })
        );
      }
    }

    try {
      let micCaptureOk = true;
      // 1. Initialize PCM Recorder for raw audio streaming & volume metering (if mic permission is granted)
      try {
        if (!pcmRecorder) {
          pcmRecorder = new PcmRecorder();
        }

        await pcmRecorder.start(
          (chunk) => {
            if (activeWs && activeWs.readyState === WebSocket.OPEN && !get().isMicMuted) {
              activeWs.send(chunk);
            }
          },
          (level) => {
            set({ audioLevel: get().isMicMuted ? 0 : level });
          }
        );
      } catch (audioErr) {
        console.warn('PcmRecorder capture notice:', audioErr);
        micCaptureOk = false;
      }

      if (!micCaptureOk) {
        set({
          isRecording: false,
          audioLevel: 0,
          error:
            'Microphone unavailable. Allow microphone access in your browser settings, or type your answer instead.',
        });
        return;
      }

      if (!BrowserSpeechRecognizer.isSupported()) {
        // Audio still streams to the server; only the in-browser live caption is unavailable.
        set({ notice: 'Live captions are not supported in this browser (use Chrome or Edge). Your voice is still sent to the interviewer.' });
      }

      // 2. Start browser-native speech recognition to capture actual words candidate speaks in real time
      if (!speechRecognizer) {
        speechRecognizer = new BrowserSpeechRecognizer();
      }

      speechRecognizer.start(
        (liveTranscript) => {
          if (!get().isMicMuted) {
            set({ partialTranscript: liveTranscript });
          }
        },
        undefined,
        () => {
          // Automatic 2.2s silence detection -> hands-free auto-commit candidate turn (only if not muted)
          if (!get().isMicMuted) {
            get().stopVoiceRecording();
          }
        },
        (errorMsg) => {
          // Only show fatal permission errors in banner, not transient background status
          if (!errorMsg.includes('no-speech') && !errorMsg.includes('aborted')) {
            set({ error: errorMsg });
          }
        },
        () => get().isMicMuted
      );

      set({ isRecording: true, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Microphone access denied';
      set({ isRecording: false, error: message });
    }
  },

  stopVoiceRecording: () => {
    if (pcmRecorder) {
      pcmRecorder.stop();
    }

    let spokenTranscript: string | undefined = undefined;
    if (speechRecognizer) {
      const recognized = speechRecognizer.stop();
      if (recognized && recognized.trim()) {
        spokenTranscript = recognized.trim();
      }
    }

    const currentPartial = get().partialTranscript?.trim();
    const trimmed = (spokenTranscript && spokenTranscript.trim()) || currentPartial || undefined;

    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(
        JSON.stringify({
          type: 'speech_stopped',
          transcript: trimmed || null,
          client_timestamp_ms: Date.now(),
        })
      );
    } else if (trimmed) {
      // Zero-Loss Fallback: If WebSocket dropped or is disconnected, commit candidate turn via REST
      get().submitTextTurn(trimmed).catch((err) => {
        console.warn('Fallback turn submission failed:', err);
      });
    }
    set({ isRecording: false, audioLevel: 0 });
  },

  bargeIn: () => {
    // 1. Instant local playback cutoff (<150ms preemption)
    BrowserSpeechSynthesizer.stop();
    if (pcmPlayer) {
      pcmPlayer.stopAll();
    }
    set({ isInterviewerSpeaking: false });

    // 2. Notify backend of barge-in
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(
        JSON.stringify({
          type: 'speech_started',
          client_timestamp_ms: Date.now(),
        })
      );
    }

    // 3. Immediately activate candidate microphone for prompt response
    if (!get().isRecording) {
      get().startVoiceRecording().catch(() => {});
    }
  },

  disconnectVoiceSession: () => {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    BrowserSpeechSynthesizer.stop();
    if (speechRecognizer) {
      speechRecognizer.abort();
      speechRecognizer = null;
    }
    if (pcmRecorder) {
      pcmRecorder.stop();
      pcmRecorder = null;
    }
    if (pcmPlayer) {
      pcmPlayer.close();
      pcmPlayer = null;
    }
    if (activeWs) {
      activeWs.close();
      activeWs = null;
    }
    set({
      wsStatus: 'disconnected',
      isRecording: false,
      isInterviewerSpeaking: false,
      audioLevel: 0,
    });
  },

  concludeSession: async () => {
    const { interviewId, disconnectVoiceSession } = get();
    if (!interviewId) return null;

    disconnectVoiceSession();
    set({ isSubmitting: true, state: 'COMPLETED' });

    try {
      const res = await interviewsApi.triggerEvaluation(interviewId);
      set({ isSubmitting: false });
      return res.task_id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to trigger evaluation';
      set({ isSubmitting: false, error: message });
      return null;
    }
  },

  reset: () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(ACTIVE_INTERVIEW_ID_KEY);
      }
    } catch {}
    BrowserSpeechSynthesizer.stop();
    get().disconnectVoiceSession();
    set({
      interviewId: null,
      state: 'CREATED',
      mode: 'VOICE',
      targetSeniority: 'SENIOR',
      blueprint: null,
      turns: [],
      partialTranscript: '',
      isSubmitting: false,
      wsStatus: 'disconnected',
      isRecording: false,
      audioLevel: 0,
      isInterviewerSpeaking: false,
      currentTopic: null,
      remainingSeconds: 1800,
      error: null,
      notice: null,
      serverAudioActive: false,
      isCameraOn: false,
    });
  },
}));

if (typeof window !== 'undefined') {
  // Never leak one user's interview into the next session on a shared browser.
  window.addEventListener('careerdiff:logout', () => {
    useInterviewStore.getState().reset();
  });
}

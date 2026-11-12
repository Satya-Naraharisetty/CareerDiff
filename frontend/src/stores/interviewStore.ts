import { create } from 'zustand';
import { interviewsApi } from '../lib/api';
import { PcmPlayer, PcmRecorder } from '../lib/audio';
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

  setInterview: (
    id: string,
    state: InterviewState,
    mode: InterviewMode,
    seniority: SeniorityLevel,
    blueprint: InterviewBlueprintRead,
    preferredLanguage?: string
  ) => void;
  setMode: (mode: InterviewMode) => void;
  loadTurns: (interviewId: string) => Promise<void>;
  startInterview: () => Promise<void>;
  submitTextTurn: (text: string, codeSnippet?: string) => Promise<void>;
  initVoiceSession: () => Promise<void>;
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => void;
  bargeIn: () => void;
  disconnectVoiceSession: () => void;
  concludeSession: () => Promise<string | null>;
  reset: () => void;
}

let activeWs: WebSocket | null = null;
let pcmPlayer: PcmPlayer | null = null;
let pcmRecorder: PcmRecorder | null = null;
let countdownTimer: number | null = null;

export const useInterviewStore = create<InterviewStoreState>((set, get) => ({
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
  preferredLanguage: 'Python',
  error: null,

  setInterview: (id, state, mode, seniority, blueprint, preferredLanguage) => {
    set({
      interviewId: id,
      state,
      mode,
      targetSeniority: seniority,
      blueprint,
      preferredLanguage: preferredLanguage || 'Python',
      turns: [],
      partialTranscript: '',
      remainingSeconds: (blueprint.total_allocated_seconds || 1800),
      currentTopic: blueprint.topics?.[0]?.topic_name || null,
      error: null,
    });
  },

  setMode: (mode) => {
    set({ mode });
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

      // Start countdown timer
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = window.setInterval(() => {
        set((s) => ({
          remainingSeconds: Math.max(0, s.remainingSeconds - 1),
        }));
      }, 1000);
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
      const wsUrl = `${wsBase}${ticketRes.websocket_url}`;

      if (activeWs) {
        activeWs.close();
      }

      pcmPlayer = new PcmPlayer();
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      activeWs = ws;

      ws.onopen = () => {
        set({ wsStatus: 'connected' });
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Inbound binary PCM audio from server TTS!
          if (pcmPlayer) {
            set({ isInterviewerSpeaking: true });
            pcmPlayer.feed(event.data);
          }
        } else if (typeof event.data === 'string') {
          try {
            const msg: WsServerMessage = JSON.parse(event.data);
            switch (msg.type) {
              case 'session_ready':
                set({
                  state: msg.state as InterviewState,
                  remainingSeconds: msg.remaining_seconds,
                });
                break;
              case 'transcript_partial':
                set({ partialTranscript: msg.text });
                break;
              case 'transcript_final':
                set((s) => ({
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
                }));
                break;
              case 'interviewer_speaking':
                set((s) => ({
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
                }));
                break;
              case 'interviewer_interrupted':
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
        set({ wsStatus: 'error', error: 'WebSocket connection encountered an error' });
      };

      ws.onclose = () => {
        set({ wsStatus: 'disconnected' });
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to establish voice connection';
      set({ wsStatus: 'error', error: message });
    }
  },

  startVoiceRecording: async () => {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) {
      set({ error: 'Cannot record audio: WebSocket is not connected' });
      return;
    }

    // Candidate begins speaking -> trigger instant barge-in if interviewer is speaking
    get().bargeIn();

    try {
      if (!pcmRecorder) {
        pcmRecorder = new PcmRecorder();
      }

      await pcmRecorder.start(
        (chunk) => {
          if (activeWs && activeWs.readyState === WebSocket.OPEN) {
            activeWs.send(chunk);
          }
        },
        (level) => {
          set({ audioLevel: level });
        }
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
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(
        JSON.stringify({
          type: 'speech_stopped',
          client_timestamp_ms: Date.now(),
        })
      );
    }
    set({ isRecording: false, audioLevel: 0 });
  },

  bargeIn: () => {
    // 1. Instant local playback cutoff (<150ms preemption)
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
  },

  disconnectVoiceSession: () => {
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
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
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
    });
  },
}));

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Clock,
  Hand,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Send,
  User,
  Volume2,
} from 'lucide-react';
import { useInterviewStore } from '../stores/interviewStore';

interface InterviewRoomProps {
  onConclude: () => void;
}

export const InterviewRoom: React.FC<InterviewRoomProps> = ({ onConclude }) => {
  const {
    state: sessionState,
    mode,
    targetSeniority,
    blueprint,
    turns,
    partialTranscript,
    isSubmitting,
    wsStatus,
    isRecording,
    audioLevel,
    isInterviewerSpeaking,
    currentTopic,
    remainingSeconds,
    error,
    startInterview,
    submitTextTurn,
    initVoiceSession,
    startVoiceRecording,
    stopVoiceRecording,
    bargeIn,
    concludeSession,
  } = useInterviewStore();

  const [textInput, setTextInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const hasStartedRef = useRef(false);
  const hasVoiceInitedRef = useRef(false);

  // Auto-scroll on turns or partial text updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, partialTranscript, isInterviewerSpeaking]);

  // Initialize session on mount
  useEffect(() => {
    if (sessionState === 'CREATED' && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startInterview();
    }
    if (mode === 'VOICE' && wsStatus === 'disconnected' && !hasVoiceInitedRef.current) {
      hasVoiceInitedRef.current = true;
      initVoiceSession();
    }
  }, [sessionState, mode, wsStatus, startInterview, initVoiceSession]);

  // Cleanup on unmount: guarantee hardware microphone is stopped when leaving room
  useEffect(() => {
    return () => {
      stopVoiceRecording();
    };
  }, [stopVoiceRecording]);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || isSubmitting) return;

    const msg = textInput;
    setTextInput('');
    await submitTextTurn(msg);
  };

  const handleConclude = async () => {
    const taskId = await concludeSession();
    if (taskId !== null) {
      onConclude();
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl flex-col px-4 py-4 sm:px-6">
      {/* Session Top Status Bar */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/90 px-4 py-3 backdrop-blur-md shadow-sm">
        {/* Left: Active topic & state */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 font-mono">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                sessionState === 'COMPLETED' ? 'bg-zinc-500' : 'bg-emerald-400 animate-ping'
              }`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                sessionState === 'COMPLETED' ? 'bg-zinc-500' : 'bg-emerald-500'
              }`} />
            </span>
            <span className="font-semibold text-xs sm:text-sm text-zinc-100">{targetSeniority} Track</span>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span>Topic:</span>
            <span className="font-medium text-zinc-200 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 max-w-[150px] sm:max-w-none truncate">
              {currentTopic || 'Session Warmup'}
            </span>
            {blueprint?.topics?.find((t) => t.topic_name === currentTopic && t.mapped_claims_count > 0) && (
              <span className="hidden lg:inline-flex items-center gap-1 rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-800/40">
                <CheckCircle className="h-3 w-3 text-emerald-400" />
                Claim Grounded
              </span>
            )}
          </div>

          <span className="hidden md:inline-flex rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[11px] font-mono text-zinc-400">
            {sessionState}
          </span>
        </div>

        {/* Right Section: Countdown Timer & Conclude Action */}
        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Countdown timer */}
          <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-1.5 border border-zinc-800">
            <Clock className={`h-3.5 w-3.5 ${remainingSeconds < 300 ? 'text-amber-400 animate-pulse' : 'text-zinc-400'}`} />
            <span className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-zinc-100">
              {formatTimer(remainingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {mode === 'VOICE' && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 mr-2 font-mono">
                <Radio className={`h-3.5 w-3.5 ${wsStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className="capitalize">{wsStatus}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleConclude}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-sm hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Compiling...
                </>
              ) : (
                <>
                  <CheckCircle className="h-3.5 w-3.5" />
                  Conclude &amp; Score
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-300 font-mono">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6 space-y-4 backdrop-blur-sm shadow-inner">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-zinc-500 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mb-3" />
            <p className="text-sm font-medium text-zinc-300 font-mono">Initiating interview state machine...</p>
            <p className="text-xs text-zinc-500 mt-1 font-mono">Generating initial warmup greeting.</p>
          </div>
        )}

        {turns.map((turn, idx) => {
          const isInterviewer = turn.speaker === 'INTERVIEWER';
          return (
            <div
              key={idx}
              className={`flex gap-3 sm:gap-4 ${isInterviewer ? 'justify-start' : 'justify-end'}`}
            >
              {isInterviewer && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
                  <Bot className="h-4 w-4 text-zinc-300" />
                </div>
              )}

              <div
                className={`max-w-[90%] sm:max-w-[75%] rounded-xl p-4 shadow-sm ${
                  isInterviewer
                    ? 'rounded-tl-none border border-zinc-800 bg-zinc-950 text-zinc-200'
                    : 'rounded-tr-none border border-zinc-700 bg-zinc-800 text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1.5 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-tight">
                      {isInterviewer ? 'IntervueX Evaluator' : 'Candidate'}
                    </span>
                    {turn.action_taken && (
                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 border border-zinc-800">
                        {turn.action_taken}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500">Turn #{turn.turn_index}</span>
                </div>

                <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">{turn.transcript}</p>
              </div>

              {!isInterviewer && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300">
                  <User className="h-4 w-4 text-zinc-300" />
                </div>
              )}
            </div>
          );
        })}

        {/* Live Partial Speech Feedback (Candidate speaking) */}
        {partialTranscript && (
          <div className="flex justify-end gap-3 sm:gap-4 animate-in fade-in duration-150">
            <div className="max-w-[75%] rounded-xl rounded-tr-none bg-zinc-900 border border-zinc-700 p-4 text-white shadow-sm font-mono">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-zinc-300">Live Transcription</span>
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <p className="text-xs sm:text-sm text-zinc-200">{partialTranscript}...</p>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700">
              <User className="h-4 w-4 text-zinc-300" />
            </div>
          </div>
        )}

        {/* Interviewer Speaking Notification Indicator */}
        {isInterviewerSpeaking && (
          <div className="flex items-center gap-2.5 text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 w-fit font-mono">
            <Volume2 className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
            <span>Interviewer audio streaming in progress...</span>
          </div>
        )}

        {isSubmitting && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
            Analyzing technical turn and selecting adaptive action...
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Bottom Interaction Console */}
      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 backdrop-blur-md shadow-sm">
        {mode === 'VOICE' ? (
          /* Voice Mode Controls */
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Mic Button & State */}
            <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-4">
              <button
                type="button"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                disabled={wsStatus !== 'connected'}
                className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 sm:px-6 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-rose-600/20 hover:bg-rose-500'
                    : 'bg-white text-zinc-950 hover:bg-zinc-200 shadow-sm'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4" />
                    <span>Stop Recording</span>
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    <span>Speak</span>
                  </>
                )}
              </button>

              {/* Instant Barge-In Preemption Button */}
              <button
                type="button"
                onClick={bargeIn}
                title="Interrupt Interviewer Speech (<150ms preemption)"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 sm:px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition-all active:scale-[0.98]"
              >
                <Hand className="h-3.5 w-3.5 text-amber-400" />
                <span>Barge-In</span>
              </button>
            </div>

            {/* Audio VU-Meter Visualizer Bar */}
            <div className="flex items-center gap-3 w-full sm:w-64 font-mono">
              <span className="text-[11px] text-zinc-400 shrink-0">Mic VU</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.round(audioLevel * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Text Mode Controls */
          <form onSubmit={handleSendText} className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your technical response here (e.g. architecture tradeoffs, failure modes)..."
              disabled={isSubmitting || sessionState === 'COMPLETED'}
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 sm:px-4 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50 transition-all font-sans"
            />
            <button
              type="submit"
              disabled={isSubmitting || !textInput.trim() || sessionState === 'COMPLETED'}
              className="shrink-0 flex items-center justify-center gap-2 rounded-lg bg-white px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Submit Turn</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

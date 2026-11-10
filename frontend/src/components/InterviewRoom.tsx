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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3 backdrop-blur-md shadow-lg">
        {/* Left: Active topic & state */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                sessionState === 'COMPLETED' ? 'bg-slate-400' : 'bg-emerald-400 animate-ping'
              }`} />
              <span className={`relative inline-flex h-3 w-3 rounded-full ${
                sessionState === 'COMPLETED' ? 'bg-slate-400' : 'bg-emerald-500'
              }`} />
            </span>
            <span className="font-semibold text-sm text-slate-100">{targetSeniority} Track</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Topic:</span>
            <span className="font-medium text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
              {currentTopic || 'Session Warmup'}
            </span>
            {blueprint?.topics?.find((t) => t.topic_name === currentTopic && t.mapped_claims_count > 0) && (
              <span className="hidden lg:inline-flex items-center gap-1 rounded bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-800/60">
                <CheckCircle className="h-3 w-3 text-emerald-400" />
                Resume Claim Grounded
              </span>
            )}
          </div>

          <span className="hidden sm:inline-flex rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-300 border border-slate-700">
            {sessionState}
          </span>
        </div>

        {/* Center: Countdown timer */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-1.5 border border-slate-800">
          <Clock className={`h-4 w-4 ${remainingSeconds < 300 ? 'text-amber-400 animate-pulse' : 'text-indigo-400'}`} />
          <span className="font-mono text-sm font-bold tracking-wider text-slate-100">
            {formatTimer(remainingSeconds)}
          </span>
        </div>

        {/* Right: Actions (Conclude interview) */}
        <div className="flex items-center gap-2">
          {mode === 'VOICE' && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 mr-2">
              <Radio className={`h-3.5 w-3.5 ${wsStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="capitalize">{wsStatus}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleConclude}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 transition-all active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Compiling...
              </>
            ) : (
              <>
                <CheckCircle className="h-3.5 w-3.5" />
                Conclude & Score
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-800/60 bg-rose-950/60 p-3 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6 space-y-4 backdrop-blur-sm shadow-inner">
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-3" />
            <p className="text-sm font-medium text-slate-400">Initiating interview state machine...</p>
            <p className="text-xs text-slate-600 mt-1">Generating initial warmup greeting.</p>
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-600/30">
                  <Bot className="h-5 w-5 text-white" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm ${
                  isInterviewer
                    ? 'rounded-tl-none border border-slate-800 bg-slate-900 text-slate-200'
                    : 'rounded-tr-none bg-gradient-to-tr from-indigo-700 to-indigo-600 text-white shadow-indigo-600/10'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-tight">
                      {isInterviewer ? 'IntervueX Evaluator' : 'Candidate'}
                    </span>
                    {turn.action_taken && (
                      <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-indigo-300 border border-indigo-800/60">
                        {turn.action_taken}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-60">Turn #{turn.turn_index}</span>
                </div>

                <p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.transcript}</p>
              </div>

              {!isInterviewer && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 border border-slate-700">
                  <User className="h-5 w-5 text-slate-300" />
                </div>
              )}
            </div>
          );
        })}

        {/* Live Partial Speech Feedback (Candidate speaking) */}
        {partialTranscript && (
          <div className="flex justify-end gap-3 sm:gap-4 animate-in fade-in duration-150">
            <div className="max-w-[75%] rounded-2xl rounded-tr-none bg-indigo-950/60 border border-indigo-800/60 p-4 text-white shadow-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-indigo-300">Live Transcription</span>
                <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
              </div>
              <p className="text-sm italic text-indigo-100">{partialTranscript}...</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800">
              <User className="h-5 w-5 text-slate-300" />
            </div>
          </div>
        )}

        {/* Interviewer Speaking Notification Indicator */}
        {isInterviewerSpeaking && (
          <div className="flex items-center gap-3 text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3 w-fit">
            <Volume2 className="h-4 w-4 animate-bounce text-indigo-400" />
            <span>Interviewer audio streaming in progress...</span>
          </div>
        )}

        {isSubmitting && (
          <div className="flex items-center gap-2 text-xs text-slate-400 italic">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
            Analyzing technical turn and selecting adaptive action...
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Bottom Interaction Console */}
      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 backdrop-blur-md shadow-xl">
        {mode === 'VOICE' ? (
          /* Voice Mode Controls */
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Mic Button & State */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <button
                type="button"
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                disabled={wsStatus !== 'connected'}
                className={`flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-sm font-bold shadow-lg transition-all active:scale-95 ${
                  isRecording
                    ? 'bg-rose-600 text-white shadow-rose-600/30 pulsing-recording hover:bg-rose-500'
                    : 'bg-indigo-600 text-white shadow-indigo-600/30 hover:bg-indigo-500'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-5 w-5" />
                    Stop Speaking
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    Speak (16kHz PCM)
                  </>
                )}
              </button>

              {/* Instant Barge-In Preemption Button */}
              <button
                type="button"
                onClick={bargeIn}
                title="Interrupt Interviewer Speech (<150ms preemption)"
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all active:scale-95"
              >
                <Hand className="h-4 w-4 text-amber-400" />
                Barge-In / Interrupt
              </button>
            </div>

            {/* Audio VU-Meter Visualizer Bar */}
            <div className="flex items-center gap-3 w-full sm:w-64">
              <span className="text-[11px] font-medium text-slate-400 shrink-0">Mic VU</span>
              <div className="h-3 flex-1 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-indigo-500 to-rose-500 transition-all duration-75"
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
              placeholder="Type your technical response here (e.g. explain architecture, tradeoffs, failure modes)..."
              disabled={isSubmitting || sessionState === 'COMPLETED'}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={isSubmitting || !textInput.trim() || sessionState === 'COMPLETED'}
              className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <Send className="h-4 w-4" />
              Submit
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Clock,
  Code2,
  Copy,
  Hand,
  Loader2,
  Mic,
  MicOff,
  Radio,
  Send,
  Trash2,
  User,
  Volume2,
} from 'lucide-react';
import { useInterviewStore } from '../stores/interviewStore';

interface InterviewRoomProps {
  onConclude: () => void;
}

const SCRATCHPAD_TEMPLATES = [
  {
    name: 'SQL Ledger',
    snippet: `-- Idempotent Financial Ledger Table
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    account_id UUID NOT NULL,
    amount_cents BIGINT NOT NULL,
    direction VARCHAR(6) CHECK (direction IN ('DEBIT', 'CREDIT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_account_created ON ledger_entries (account_id, created_at DESC);`,
  },
  {
    name: 'Redlock Concurrency',
    snippet: `# Distributed Lock with Lease TTL
async def acquire_lock(redis, resource_id: str, ttl_ms: int = 5000):
    token = str(uuid.uuid4())
    acquired = await redis.set(f"lock:{resource_id}", token, px=ttl_ms, nx=True)
    if not acquired:
        raise LockContentionError(f"Resource {resource_id} is locked by another worker")
    return token`,
  },
  {
    name: 'Kafka Partitioning',
    snippet: `[Payment Producer] 
       | (Partition Key: account_id)
       v
[Kafka Topic: payment-events]
   |---> [Partition 0] ---> [Consumer Worker A (Strict In-Order)]
   |---> [Partition 1] ---> [Consumer Worker B (Strict In-Order)]`,
  },
];

const AudioEqualizer: React.FC<{
  audioLevel: number;
  isRecording: boolean;
  isInterviewerSpeaking: boolean;
}> = ({ audioLevel, isRecording, isInterviewerSpeaking }) => {
  const bars = 16;
  return (
    <div className="flex items-center gap-2.5 h-9 px-3 py-1 rounded-lg bg-zinc-950 border border-zinc-800 shrink-0">
      <div className="flex items-end gap-[3px] h-5 w-24 sm:w-28">
        {Array.from({ length: bars }).map((_, i) => {
          let heightPercent = 15;
          if (isRecording) {
            const factor = Math.sin((i / (bars - 1)) * Math.PI) * 0.7 + 0.3;
            heightPercent = Math.min(100, Math.max(15, Math.round(audioLevel * 100 * factor + (i % 3) * 10)));
          } else if (isInterviewerSpeaking) {
            heightPercent = Math.min(100, Math.max(20, Math.round(50 + Math.sin(i * 1.5) * 35)));
          }

          return (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-75 ${
                isRecording
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-500/20'
                  : isInterviewerSpeaking
                  ? 'bg-indigo-400 animate-pulse'
                  : 'bg-zinc-800'
              }`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>
      <div className="flex flex-col text-[10px] font-mono leading-tight">
        <span
          className={
            isRecording
              ? 'text-emerald-400 font-semibold'
              : isInterviewerSpeaking
              ? 'text-indigo-400 font-semibold'
              : 'text-zinc-500'
          }
        >
          {isRecording ? 'PCM STREAM' : isInterviewerSpeaking ? 'INTERVIEWER' : 'STANDBY'}
        </span>
        <span className="text-zinc-600 hidden sm:inline text-[9px]">16kHz Mono</span>
      </div>
    </div>
  );
};

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
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [scratchpadCode, setScratchpadCode] = useState('');
  const [attachScratchpad, setAttachScratchpad] = useState(true);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
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

  // Global ergonomics keyboard listeners (Space = Mic, Esc = Barge-In, S = Scratchpad)
  useEffect(() => {
    const handleRoomKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space' && mode === 'VOICE' && wsStatus === 'connected') {
        e.preventDefault();
        if (isRecording) {
          stopVoiceRecording();
        } else {
          startVoiceRecording();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        bargeIn();
      } else if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowScratchpad((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleRoomKeyDown);
    return () => window.removeEventListener('keydown', handleRoomKeyDown);
  }, [mode, wsStatus, isRecording, stopVoiceRecording, startVoiceRecording, bargeIn]);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || isSubmitting) return;

    const msg = textInput;
    const snippet = attachScratchpad && scratchpadCode.trim() ? scratchpadCode.trim() : undefined;
    setTextInput('');
    await submitTextTurn(msg, snippet);
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
            {/* Scratchpad Toggle Button */}
            <button
              type="button"
              onClick={() => setShowScratchpad((prev) => !prev)}
              title="Toggle Architecture & Code Scratchpad (Key: S)"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium border transition-colors ${
                showScratchpad
                  ? 'border-zinc-500 bg-zinc-800 text-white shadow-sm'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Scratchpad</span>
              <kbd className="hidden md:inline-block px-1 py-0.5 text-[9px] font-mono bg-zinc-900 text-zinc-400 rounded border border-zinc-800">S</kbd>
              {scratchpadCode.trim() && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

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

      {/* Middle Work Area: Split Screen when Scratchpad is open */}
      <div className={`flex-1 min-h-0 ${showScratchpad ? 'grid grid-cols-1 lg:grid-cols-12 gap-4' : 'flex flex-col'}`}>
        {/* Main Conversation Stream & Input Column */}
        <div className={`flex flex-col min-h-0 ${showScratchpad ? 'lg:col-span-7' : 'flex-1'}`}>
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
                    className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 sm:px-5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                      isRecording
                        ? 'bg-rose-600 text-white shadow-rose-600/20 hover:bg-rose-500'
                        : 'bg-white text-zinc-950 hover:bg-zinc-200 shadow-sm'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="h-4 w-4" />
                        <span>Stop Recording</span>
                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-rose-700 text-white rounded border border-rose-500/50">Space</kbd>
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4" />
                        <span>Speak</span>
                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 text-zinc-800 rounded border border-zinc-300">Space</kbd>
                      </>
                    )}
                  </button>

                  {/* Instant Barge-In Preemption Button */}
                  <button
                    type="button"
                    onClick={bargeIn}
                    title="Interrupt Interviewer Speech (<150ms preemption, Key: Esc)"
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 sm:px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 hover:text-white transition-all active:scale-[0.98]"
                  >
                    <Hand className="h-3.5 w-3.5 text-amber-400" />
                    <span>Barge-In</span>
                    <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-900 text-zinc-400 rounded border border-zinc-700">Esc</kbd>
                  </button>
                </div>

                {/* 16-Bar Responsive Equalizer */}
                <AudioEqualizer
                  audioLevel={audioLevel}
                  isRecording={isRecording}
                  isInterviewerSpeaking={isInterviewerSpeaking}
                />
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
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-zinc-100 text-zinc-800 rounded border border-zinc-300">↵</kbd>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Scratchpad Panel */}
        {showScratchpad && (
          <div className="lg:col-span-5 flex flex-col min-h-0 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 backdrop-blur-sm shadow-sm font-mono space-y-3">
            {/* Scratchpad Header */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-zinc-300" />
                <span className="text-xs font-semibold text-zinc-200">Architecture Scratchpad</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(scratchpadCode);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                  disabled={!scratchpadCode.trim()}
                  title="Copy code to clipboard"
                  className="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setScratchpadCode('')}
                  disabled={!scratchpadCode.trim()}
                  title="Clear scratchpad"
                  className="rounded p-1 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Template Inserters */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="text-zinc-500">Presets:</span>
              {SCRATCHPAD_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  type="button"
                  onClick={() => setScratchpadCode(tmpl.snippet)}
                  className="rounded bg-zinc-950 px-2 py-0.5 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 border border-zinc-800 transition-colors"
                >
                  {tmpl.name}
                </button>
              ))}
            </div>

            {/* Monospace Code Editor Area */}
            <div className="flex-1 min-h-[220px] flex flex-col">
              <textarea
                value={scratchpadCode}
                onChange={(e) => setScratchpadCode(e.target.value)}
                placeholder="Draft SQL schemas, distributed lock algorithms, or ASCII system flow topologies here..."
                className="w-full flex-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none leading-relaxed"
              />
            </div>

            {/* Attach to Turn Checkbox */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachScratchpad}
                  onChange={(e) => setAttachScratchpad(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950 text-white focus:ring-0 focus:ring-offset-0"
                />
                <span>Attach to next turn submission</span>
              </label>
              {copiedSnippet && (
                <span className="text-emerald-400 font-semibold">Copied!</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

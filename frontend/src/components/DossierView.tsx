import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Loader2,
  Mic,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { interviewsApi } from '../lib/api';
import { useInterviewStore } from '../stores/interviewStore';
import type {
  AssessmentReportRead,
  AtsBreakdown,
  ClaimVerificationRead,
  ClaimVerificationStatus,
  CommunicationBreakdown,
  CompetencyScoreRead,
  EvidenceType,
  TurnRetakeResponse,
} from '../types';

interface DossierViewProps {
  onReset: () => void;
}

const RationaleCoachingView: React.FC<{ rationale: string }> = ({ rationale }) => {
  const parts = rationale.split('\n\n');
  const basePart = parts[0] || rationale;
  const modelPart = parts.find((p) => p.includes('Staff-Level Model Answer'));
  const levelUpPart = parts.find((p) => p.includes('How to Level Up'));

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-300 leading-relaxed font-sans">{basePart}</p>

      {modelPart && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs font-mono space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-[11px] tracking-wide">
            <Zap className="h-3.5 w-3.5 text-emerald-400" />
            <span>Staff-Level Model Answer</span>
          </div>
          <p className="text-zinc-300 text-xs leading-relaxed font-sans pl-5">
            {modelPart.replace(/🎯\s*\*\*Staff-Level Model Answer\*\*:\s*/, '')}
          </p>
        </div>
      )}

      {levelUpPart && (
        <div className="rounded-lg border border-indigo-900/60 bg-indigo-950/20 p-3 text-xs font-mono space-y-1 shadow-sm">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-400 text-[11px] tracking-wide">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
            <span>How to Level Up to Tier 4</span>
          </div>
          <p className="text-zinc-300 text-xs leading-relaxed font-sans pl-5">
            {levelUpPart.replace(/💡\s*\*\*How to Level Up to Tier 4\*\*:\s*/, '')}
          </p>
        </div>
      )}
    </div>
  );
};

const ScoreRingGauge: React.FC<{ score: number; maxScore?: number; tier: string }> = ({
  score,
  maxScore = 4.0,
  tier,
}) => {
  const size = 110;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.min(maxScore, Math.max(0, score));
  const progressPercent = normalizedScore / maxScore;
  const strokeDashoffset = circumference - progressPercent * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0 min-w-[160px] font-mono shadow-sm">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Background Track Circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#27272a"
            strokeWidth={strokeWidth}
          />
          {/* Animated Progress Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#34d399"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Score Numbers */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight text-white font-mono leading-none">
            {score.toFixed(1)}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono mt-0.5">/ {maxScore.toFixed(1)}</span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-zinc-800">
          {tier}
        </span>
        <span className="block text-[10px] text-zinc-500 mt-1">Rubric Index</span>
      </div>
    </div>
  );
};

const AtsScoreRingGauge: React.FC<{ score: number }> = ({ score }) => {
  const size = 110;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.min(100, Math.max(0, score));
  const progressPercent = normalizedScore / 100;
  const strokeDashoffset = circumference - progressPercent * circumference;

  const tier =
    normalizedScore >= 80
      ? 'Strong Match'
      : normalizedScore >= 65
      ? 'Moderate Match'
      : 'Needs Work';

  const strokeColor =
    normalizedScore >= 80 ? '#34d399' : normalizedScore >= 65 ? '#fbbf24' : '#f87171';

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0 min-w-[160px] font-mono shadow-sm">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#27272a"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight text-white font-mono leading-none">
            {Math.round(score)}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono mt-0.5">/ 100 ATS</span>
        </div>
      </div>

      <div className="mt-2 text-center">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold border ${
            normalizedScore >= 80
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
              : normalizedScore >= 65
              ? 'bg-amber-950/60 text-amber-400 border-amber-800/40'
              : 'bg-rose-950/60 text-rose-400 border-rose-800/40'
          }`}
        >
          {tier}
        </span>
        <span className="block text-[10px] text-zinc-500 mt-1">JD Alignment</span>
      </div>
    </div>
  );
};

const CommunicationScoreRingGauge: React.FC<{ score: number }> = ({ score }) => {
  const size = 110;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.min(100, Math.max(0, score));
  const progressPercent = normalizedScore / 100;
  const strokeDashoffset = circumference - progressPercent * circumference;

  const tier =
    normalizedScore >= 85
      ? 'Articulate'
      : normalizedScore >= 70
      ? 'Clear & Direct'
      : 'Developing';

  const strokeColor =
    normalizedScore >= 85 ? '#38bdf8' : normalizedScore >= 70 ? '#818cf8' : '#fbbf24';

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0 min-w-[160px] font-mono shadow-sm">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="#27272a"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight text-white font-mono leading-none">
            {Math.round(score)}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono mt-0.5">/ 100 COMMS</span>
        </div>
      </div>

      <div className="mt-2 text-center">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold border ${
            normalizedScore >= 85
              ? 'bg-sky-950/60 text-sky-400 border-sky-800/40'
              : normalizedScore >= 70
              ? 'bg-indigo-950/60 text-indigo-400 border-indigo-800/40'
              : 'bg-amber-950/60 text-amber-400 border-amber-800/40'
          }`}
        >
          {tier}
        </span>
        <span className="block text-[10px] text-zinc-500 mt-1">Verbal Delivery</span>
      </div>
    </div>
  );
};

const CommunicationDeliveryCard: React.FC<{
  breakdown: CommunicationBreakdown;
  commScore: number;
}> = ({ breakdown, commScore }) => {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 shadow-sm backdrop-blur-md space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-sky-400" />
          <h2 className="text-sm sm:text-base font-bold text-white font-sans">
            Objective Verbal Delivery &amp; Technical Communication
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 border border-zinc-800 px-2.5 py-0.5 text-[11px] font-mono text-zinc-400">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            Zero-Biometrics (NYC LL144 &amp; EU AI Act Compliant)
          </span>
          <span className="rounded-full bg-sky-950/70 border border-sky-800/80 px-3 py-1 text-xs font-mono font-bold text-sky-400">
            {commScore} / 100 Verbal Score
          </span>
        </div>
      </div>

      {/* 4 Delivery Dimensions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">Speech Rate</span>
            <span className="text-sky-400 font-bold">{breakdown.speaking_rate_wpm} WPM</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Ideal: 120–165 WPM</span>
            <span className="text-emerald-400 font-medium">{breakdown.pacing_grade}</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">Response Latency</span>
            <span className="text-sky-400 font-bold">{breakdown.avg_response_latency_sec}s avg</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Ideal: 1.0–3.0s</span>
            <span className="text-emerald-400 font-medium">Deliberate</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">Filler Word Density</span>
            <span className="text-sky-400 font-bold">{breakdown.filler_word_percentage}%</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>{breakdown.filler_words_count} fillers found</span>
            <span className="text-zinc-400">&lt; 3% optimal</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">Monologue Risk</span>
            <span className="text-sky-400 font-bold">{breakdown.monologue_risk}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Max turn: {breakdown.longest_turn_sec}s</span>
            <span>Total: {breakdown.total_speaking_time_sec}s</span>
          </div>
        </div>
      </div>

      {/* Actionable Delivery Feedback */}
      {breakdown.delivery_feedback.length > 0 && (
        <div className="rounded-lg border border-sky-900/60 bg-sky-950/20 p-4 space-y-2 shadow-sm font-sans">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-sky-400 uppercase tracking-wide">
            <Sparkles className="h-4 w-4 text-sky-400" />
            <span>Verbal Pacing &amp; Delivery Coaching</span>
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300 pl-6 list-disc">
            {breakdown.delivery_feedback.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const TurnRetakeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  interviewId: string;
  turnIndex: number;
  originalExcerpt: string;
  competencyName: string;
}> = ({ isOpen, onClose, interviewId, turnIndex, originalExcerpt, competencyName }) => {
  const [newTranscript, setNewTranscript] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<TurnRetakeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmitRetake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTranscript.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await interviewsApi.retakeTurn(interviewId, {
        turn_index: turnIndex,
        new_transcript: newTranscript.trim(),
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Turn re-take evaluation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                Flight Recorder Turn Re-take (Turn #{turnIndex})
              </h2>
              <span className="text-xs text-zinc-400 font-mono">
                Target Competency: <span className="text-emerald-400 font-semibold">{competencyName}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Original Weakness Excerpt */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-semibold text-amber-400">Recorded Answer Excerpt:</span>
            <span className="text-[10px] text-zinc-500">Historical Turn #{turnIndex}</span>
          </div>
          <p className="text-zinc-300 italic bg-zinc-950/80 p-2.5 rounded border border-zinc-800/80">
            "{originalExcerpt}"
          </p>
        </div>

        {!result ? (
          <form onSubmit={handleSubmitRetake} className="space-y-4 font-sans">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 font-mono mb-1.5">
                Draft Upgraded Response (Senior/Staff Level):
              </label>
              <textarea
                value={newTranscript}
                onChange={(e) => setNewTranscript(e.target.value)}
                placeholder="State your technical trade-offs immediately (e.g. latency vs consistency), propose explicit patterns (Transactional Outbox, Redlock, idempotent consumer), and explain edge-case failure recovery..."
                rows={5}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 font-sans leading-relaxed resize-none"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newTranscript.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                <span>{isSubmitting ? 'Evaluating Re-take...' : 'Submit Re-take for Instant Rescore'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 font-sans animate-in fade-in duration-300">
            {/* Score Delta Card */}
            <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <h3 className="text-sm font-bold text-white font-mono">Re-take Rescoring Completed</h3>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-xs text-zinc-400">{result.previous_estimated_score.toFixed(1)} / 4.0</span>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="rounded bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-xs font-bold text-emerald-400">
                    {result.new_score.toFixed(1)} / 4.0
                  </span>
                  <span className="rounded-full bg-emerald-500 text-zinc-950 font-bold px-2 py-0.5 text-[11px]">
                    {result.score_delta >= 0 ? '+' : ''}{result.score_delta.toFixed(1)} Delta
                  </span>
                </div>
              </div>

              <div className="text-xs text-emerald-300 font-mono font-medium">
                Upgraded Classification: <span className="underline">{result.improved_tier}</span>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed font-sans pt-1">
                {result.coaching_feedback}
              </p>

              {result.key_strengths_improved.length > 0 && (
                <div className="pt-2 border-t border-emerald-900/40">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-400 block mb-1">
                    Demonstrated Improvements:
                  </span>
                  <ul className="space-y-1 text-xs text-zinc-300 pl-4 list-disc">
                    {result.key_strengths_improved.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Staff Model Answer Benchmark */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-2 font-mono text-xs">
              <div className="flex items-center gap-2 font-semibold text-indigo-400">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span>Staff Engineer Gold-Standard Benchmark:</span>
              </div>
              <p className="text-zinc-300 text-xs leading-relaxed font-sans pl-5">
                {result.staff_model_answer}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setNewTranscript('');
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-mono font-medium text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                Try Another Re-take
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AtsAuditCard: React.FC<{ breakdown: AtsBreakdown; atsScore: number }> = ({
  breakdown,
  atsScore,
}) => {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 shadow-sm backdrop-blur-md space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm sm:text-base font-bold text-white font-sans">
            ATS Resume vs. Job Description Compatibility Audit
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-950/70 border border-emerald-800/80 px-3 py-1 text-xs font-mono font-bold text-emerald-400">
            {atsScore} / 100 ATS Score
          </span>
        </div>
      </div>

      {/* 4 Dimension Progress Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Keyword Density</span>
            <span className="text-emerald-400 font-bold">{breakdown.keyword_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.keyword_score}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Experience &amp; Seniority</span>
            <span className="text-emerald-400 font-bold">{breakdown.experience_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.experience_score}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Quantified Impact</span>
            <span className="text-emerald-400 font-bold">{breakdown.quantified_impact_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.quantified_impact_score}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Section Formatting</span>
            <span className="text-emerald-400 font-bold">{breakdown.section_structure_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${breakdown.section_structure_score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Keywords Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Matched Keywords */}
        <div className="rounded-lg bg-zinc-950/80 border border-zinc-800 p-3.5 space-y-2">
          <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Matched ATS Keywords ({breakdown.matched_keywords.length})
          </span>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {breakdown.matched_keywords.map((kw) => (
              <span
                key={kw}
                className="rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 text-xs font-mono"
              >
                ✓ {kw}
              </span>
            ))}
          </div>
        </div>

        {/* Missing Keywords */}
        <div className="rounded-lg bg-zinc-950/80 border border-zinc-800 p-3.5 space-y-2">
          <span className="text-xs font-mono font-semibold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
            <AlertTriangle className="h-3.5 w-3.5" />
            Missing Critical Keywords ({breakdown.missing_critical_keywords.length})
          </span>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {breakdown.missing_critical_keywords.length > 0 ? (
              breakdown.missing_critical_keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded bg-amber-950/30 text-amber-300 border border-amber-800/50 px-2 py-0.5 text-xs font-mono"
                >
                  ⚠️ {kw}
                </span>
              ))
            ) : (
              <span className="text-xs text-zinc-500 font-mono">
                Zero critical keywords missing for this Job Description!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actionable Optimization Tips */}
      {breakdown.optimization_tips.length > 0 && (
        <div className="rounded-lg border border-indigo-900/60 bg-indigo-950/20 p-4 space-y-2 shadow-sm font-sans">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-indigo-400 uppercase tracking-wide">
            <Zap className="h-4 w-4 text-indigo-400" />
            <span>ATS Resume Optimization Advice</span>
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300 pl-6 list-disc">
            {breakdown.optimization_tips.map((tip, idx) => (
              <li key={idx} className="leading-relaxed">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const CompetencyLevelMeter: React.FC<{ score: number | null }> = ({ score }) => {
  const currentLevel = score ?? 1;
  const levels = [
    { lvl: 1, label: 'L1' },
    { lvl: 2, label: 'L2' },
    { lvl: 3, label: 'L3' },
    { lvl: 4, label: 'L4' },
  ];

  return (
    <div className="flex items-center gap-1.5 w-24">
      {levels.map((item) => {
        const isActive = item.lvl <= currentLevel;
        return (
          <div key={item.lvl} className="flex-1 flex flex-col gap-0.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isActive
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-500/20'
                  : 'bg-zinc-800'
              }`}
            />
            <span
              className={`text-[8px] font-mono text-center ${
                isActive ? 'text-zinc-300 font-semibold' : 'text-zinc-600'
              }`}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const DossierView: React.FC<DossierViewProps> = ({ onReset }) => {
  const { interviewId } = useInterviewStore();
  const [report, setReport] = useState<AssessmentReportRead | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCompId, setExpandedCompId] = useState<string | null>(null);
  const [copiedExcerptId, setCopiedExcerptId] = useState<string | null>(null);
  const [retakeModalState, setRetakeModalState] = useState<{
    isOpen: boolean;
    turnIndex: number;
    originalExcerpt: string;
    competencyName: string;
  }>({
    isOpen: false,
    turnIndex: 0,
    originalExcerpt: '',
    competencyName: '',
  });

  useEffect(() => {
    let isMounted = true;
    let pollCount = 0;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

    async function fetchOrPollReport() {
      if (!interviewId) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await interviewsApi.getReport(interviewId);
        if (isMounted) {
          setReport(data);
          setIsLoading(false);
        }
      } catch {
        // If report is still compiling in background, poll every 2.5s for up to 30s
        if (pollCount < 12 && isMounted) {
          pollCount++;
          pollTimeoutId = setTimeout(fetchOrPollReport, 2500);
        } else if (isMounted) {
          setError('Evaluation report compilation is still pending. Please refresh in a moment.');
          setIsLoading(false);
        }
      }
    }

    fetchOrPollReport();
    return () => {
      isMounted = false;
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
    };
  }, [interviewId]);

  const renderRadarChart = (scores: CompetencyScoreRead[]) => {
    if (!scores || scores.length === 0) return null;

    const size = 260;
    const center = size / 2;
    const radius = 90;
    const totalPoints = scores.length;
    const angleStep = (Math.PI * 2) / totalPoints;

    // Calculate polygon points (normalized to 1.0 - 4.0 scale)
    const polygonPoints = scores
      .map((item, idx) => {
        const value = item.score ? item.score / 4.0 : 0.25;
        const currentRadius = radius * value;
        const angle = idx * angleStep - Math.PI / 2;
        const x = center + currentRadius * Math.cos(angle);
        const y = center + currentRadius * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <div className="flex flex-col items-center justify-center p-4 w-full">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[260px] h-auto overflow-visible"
        >
          {/* Background concentric reference rings (4 levels) */}
          {[0.25, 0.5, 0.75, 1.0].map((ringLevel, rIdx) => (
            <circle
              key={rIdx}
              cx={center}
              cy={center}
              r={radius * ringLevel}
              fill="none"
              stroke="#27272a"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          ))}

          {/* Radial axis lines */}
          {scores.map((_, idx) => {
            const angle = idx * angleStep - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            return (
              <line
                key={idx}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="#27272a"
                strokeWidth="1"
              />
            );
          })}

          {/* Filled Candidate Competency Shape */}
          <polygon
            points={polygonPoints}
            fill="rgba(52, 211, 153, 0.12)"
            stroke="#34d399"
            strokeWidth="2"
          />

          {/* Competency labels */}
          {scores.map((item, idx) => {
            const angle = idx * angleStep - Math.PI / 2;
            const labelRadius = radius + 22;
            const x = center + labelRadius * Math.cos(angle);
            const y = center + labelRadius * Math.sin(angle);
            return (
              <text
                key={idx}
                x={x}
                y={y}
                fill="#a1a1aa"
                fontSize="10"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="central"
                className="font-mono"
              >
                {item.competency_name.length > 14
                  ? `${item.competency_name.slice(0, 12)}…`
                  : item.competency_name}
              </text>
            );
          })}
        </svg>
        <span className="mt-3 text-[10px] text-zinc-500 font-mono">Competency Mastery Distribution (L1 - L4)</span>
      </div>
    );
  };

  const getEvidenceBadge = (type: EvidenceType) => {
    switch (type) {
      case 'POSITIVE_MASTERY':
        return <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-800/40">Positive Mastery</span>;
      case 'KNOWLEDGE_GAP':
        return <span className="rounded bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-400 border border-amber-800/40">Knowledge Gap</span>;
      case 'CONTRADICTION':
        return <span className="rounded bg-rose-950/60 px-2 py-0.5 text-[10px] font-mono font-medium text-rose-400 border border-rose-800/40">Contradiction</span>;
      case 'SUPERFICIAL_EXPLANATION':
        return <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-medium text-zinc-300 border border-zinc-700">Superficial</span>;
    }
  };

  const getClaimStatusBadge = (status: ClaimVerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return <span className="rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-400 border border-emerald-800/40">VERIFIED</span>;
      case 'CONTRADICTED':
        return <span className="rounded-full bg-rose-950/60 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-rose-400 border border-rose-800/40">CONTRADICTED</span>;
      case 'VAGUE':
        return <span className="rounded-full bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-amber-400 border border-amber-800/40">VAGUE</span>;
      case 'UNTESTED':
        return <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-400 border border-zinc-800">UNTESTED</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mb-4" />
        <h2 className="text-lg font-bold text-white font-sans">Synthesizing Assessment Dossier</h2>
        <p className="mt-1.5 text-xs text-zinc-400 max-w-md font-mono">
          Grounding scores with character-offset transcript evidence citations and auditing resume claims...
        </p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-xl py-16 px-4 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-400 mb-4" />
        <h2 className="text-base font-bold text-white">{error || 'No report found.'}</h2>
        <button
          onClick={onReset}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-sm"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start New Session
        </button>
      </div>
    );
  }

  const overallRating = report.overall_score || 0;
  const ratingTier =
    overallRating >= 3.5
      ? 'Expert (L4)'
      : overallRating >= 2.8
      ? 'Competent (L3)'
      : overallRating >= 2.0
      ? 'Developing (L2)'
      : 'Novice (L1)';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* Top Banner: Overall Score & Synthesis */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 shadow-sm backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs font-mono text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Technical Assessment Dossier (v{report.version})
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans">
              Candidate Competency Grounding
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans">{report.summary}</p>
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-mono font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-sm"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
                Export / Print Dossier (PDF)
              </button>
            </div>
          </div>

          {/* Circular Score Ring Gauges: Interview Rubric, ATS JD Match, and Verbal Delivery */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <ScoreRingGauge score={overallRating} tier={ratingTier} />
            {report.ats_score !== undefined && report.ats_score !== null && (
              <AtsScoreRingGauge score={report.ats_score} />
            )}
            {report.communication_score !== undefined && report.communication_score !== null && (
              <CommunicationScoreRingGauge score={report.communication_score} />
            )}
          </div>
        </div>
      </div>

      {/* ATS Compatibility & Optimization Section */}
      {report.ats_breakdown && (
        <AtsAuditCard
          breakdown={report.ats_breakdown}
          atsScore={report.ats_score ?? 85}
        />
      )}

      {/* Verbal Delivery & Communication Analysis Section */}
      {report.communication_breakdown && (
        <CommunicationDeliveryCard
          breakdown={report.communication_breakdown}
          commScore={report.communication_score ?? 85}
        />
      )}

      {/* Middle Grid: Radar Chart + Strengths & Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Visualization */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm shadow-sm flex flex-col items-center justify-center">
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 mb-2 flex items-center gap-1.5 self-start">
            <TrendingUp className="h-3.5 w-3.5 text-zinc-400" /> Competency Topology
          </h3>
          {renderRadarChart(report.competency_scores)}
        </div>

        {/* Strengths & Knowledge Gaps */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Observed Technical Strengths
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-zinc-300 font-sans">
              {report.strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1 font-mono">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 mb-3 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              Technical Gaps &amp; Targeted Practice
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-zinc-300 font-sans">
              {report.knowledge_gaps.map((g, idx) => (
                <li
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-500 mt-0.5 font-mono">•</span>
                    <span>{g}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onReset}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold px-2.5 py-1 text-[11px] transition-colors shadow-sm self-start sm:self-auto font-sans"
                  >
                    <Zap className="h-3 w-3 text-zinc-400" />
                    Practice Gap
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-zinc-400" /> Targeted Study Plan
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-zinc-300 font-sans">
              {report.study_recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-zinc-500 mt-1 font-mono">→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Competency Evidence Grounding Cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-400" />
          Rubric Competency Grounding &amp; Normalized Citations
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {report.competency_scores.map((cs) => {
            const isExpanded = expandedCompId === cs.competency_id;
            return (
              <div
                key={cs.competency_id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm transition-all hover:border-zinc-700"
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedCompId(isExpanded ? null : cs.competency_id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-1 font-mono font-semibold text-xs text-zinc-200">
                      {cs.score ? `L${cs.score}` : 'N/A'}
                    </span>
                    <div>
                      <h4 className="font-semibold text-zinc-100 text-xs sm:text-sm font-sans">{cs.competency_name}</h4>
                      <p className="text-xs text-zinc-400 line-clamp-1 font-sans">{cs.rationale}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-4 shrink-0 font-mono">
                    <div className="hidden sm:flex items-center">
                      <CompetencyLevelMeter score={cs.score} />
                    </div>
                    <span className="hidden sm:inline text-xs text-zinc-500">
                      {cs.evidence_items.length} Excerpt{cs.evidence_items.length === 1 ? '' : 's'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Verbatim Citations */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3 animate-in fade-in duration-200">
                    <RationaleCoachingView rationale={cs.rationale} />

                    <div className="space-y-2">
                      <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                        Normalized Evidence Records (Turn &amp; Offset Anchors)
                      </span>
                      {cs.evidence_items.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2 text-xs font-mono"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {getEvidenceBadge(ev.evidence_type)}
                              <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300 border border-zinc-800">
                                Turn #{ev.turn_index} [Offset {ev.start_char_offset}:{ev.end_char_offset}]
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setRetakeModalState({
                                    isOpen: true,
                                    turnIndex: ev.turn_index,
                                    originalExcerpt: ev.transcript_excerpt,
                                    competencyName: cs.competency_name,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 px-2.5 py-1 text-[11px] font-mono font-medium transition-all active:scale-[0.98] shadow-sm"
                              >
                                <RotateCcw className="h-3 w-3 text-amber-400" />
                                <span>Re-take Turn #{ev.turn_index}</span>
                              </button>
                              <span className="text-[10px] text-zinc-500">
                                Confidence: {Math.round(ev.confidence * 100)}%
                              </span>
                            </div>
                          </div>

                          <div className="relative group rounded bg-zinc-900 p-2.5 pr-8 border border-zinc-800 text-xs text-zinc-200 italic font-mono">
                            "{ev.transcript_excerpt}"
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(ev.transcript_excerpt);
                                setCopiedExcerptId(ev.id);
                                setTimeout(() => setCopiedExcerptId(null), 2000);
                              }}
                              title="Copy quote"
                              className="absolute top-2 right-2 p-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-opacity opacity-75 group-hover:opacity-100 focus:opacity-100"
                            >
                              {copiedExcerptId === ev.id ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>

                          <p className="text-zinc-400 text-[11px] font-sans">{ev.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Resume Claim Verification Table */}
      {report.claim_verifications && report.claim_verifications.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Resume Claim Audit &amp; Spoken Verification
          </h2>

          {/* Mobile Card View (< sm) */}
          <div className="space-y-3 sm:hidden">
            {report.claim_verifications.map((cl: ClaimVerificationRead) => (
              <div key={cl.claim_id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {cl.category}
                  </span>
                  {getClaimStatusBadge(cl.status)}
                </div>
                <p className="text-xs font-medium text-zinc-200 font-sans">{cl.claim_text}</p>
                {cl.auditor_notes && (
                  <p className="text-[11px] text-zinc-400 italic bg-zinc-900/60 p-2.5 rounded border border-zinc-800 font-mono">
                    {cl.auditor_notes}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table View (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="border-b border-zinc-800 text-zinc-400 font-mono text-[11px]">
                <tr>
                  <th className="pb-3 font-semibold">Claim Statement</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Outcome</th>
                  <th className="pb-3 font-semibold">Auditor Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {report.claim_verifications.map((cl: ClaimVerificationRead) => (
                  <tr key={cl.claim_id}>
                    <td className="py-3 pr-4 font-medium text-zinc-200 max-w-xs">{cl.claim_text}</td>
                    <td className="py-3 pr-4 text-zinc-400 uppercase font-mono text-[10px]">{cl.category}</td>
                    <td className="py-3 pr-4">{getClaimStatusBadge(cl.status)}</td>
                    <td className="py-3 text-zinc-400 max-w-sm font-mono text-[11px]">{cl.auditor_notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom Action Footer */}
      <div className="flex justify-center pt-4 pb-8">
        <button
          onClick={onReset}
          className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all active:scale-[0.98] shadow-sm"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Start Another Technical Practice Session
        </button>
      </div>

      {/* Flight Recorder Turn Re-take Modal */}
      {report && (
        <TurnRetakeModal
          isOpen={retakeModalState.isOpen}
          onClose={() => setRetakeModalState((prev) => ({ ...prev, isOpen: false }))}
          interviewId={report.interview_id}
          turnIndex={retakeModalState.turnIndex}
          originalExcerpt={retakeModalState.originalExcerpt}
          competencyName={retakeModalState.competencyName}
        />
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  Cpu,
  Download,
  FileText,
  History,
  Loader2,
  Mic,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { ApiError, interviewsApi } from '../lib/api';
import { getScoreTheme } from '../lib/scoring';
import { useInterviewStore } from '../stores/interviewStore';
import { PerformanceHistoryModal } from './PerformanceHistoryModal';
import type {
  AssessmentReportRead,
  AtsBreakdown,
  ClaimVerificationRead,
  ClaimVerificationStatus,
  CommunicationBreakdown,
  CompetencyScoreRead,
  EvidenceType,
  InterviewHistoryItemRead,
  InterviewHistoryResponse,
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
          <span className="text-[11px] text-zinc-500 font-mono mt-0.5">/ {maxScore.toFixed(1)}</span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-zinc-800">
          {tier}
        </span>
        <span className="block text-[11px] text-zinc-500 mt-1">Rubric Index</span>
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

  const { tier, stroke: strokeColor, badge: badgeClass } = getScoreTheme(normalizedScore);

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
          <span className="text-[11px] text-zinc-500 font-mono mt-0.5">/ 100 ATS</span>
        </div>
      </div>

      <div className="mt-2 text-center">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold border ${badgeClass}`}>
          {tier}
        </span>
        <span className="block text-[11px] text-zinc-500 mt-1">JD Alignment</span>
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
          <span className="text-[11px] text-zinc-500 font-mono mt-0.5">/ 100 COMMS</span>
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
        <span className="block text-[11px] text-zinc-500 mt-1">Verbal Delivery</span>
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
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Ideal: 120–165 WPM</span>
            <span className="text-emerald-400 font-medium">{breakdown.pacing_grade}</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">Response Latency</span>
            <span className="text-sky-400 font-bold">{breakdown.avg_response_latency_sec}s avg</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Ideal: 1.0–3.0s</span>
            <span className="text-emerald-400 font-medium">Deliberate</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">Filler Word Density</span>
            <span className="text-sky-400 font-bold">{breakdown.filler_word_percentage}%</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>{breakdown.filler_words_count} fillers found</span>
            <span className="text-zinc-400">&lt; 3% optimal</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 text-[11px]">Monologue Risk</span>
            <span className="text-sky-400 font-bold">{breakdown.monologue_risk}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
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
            <span className="text-[11px] text-zinc-500">Historical Turn #{turnIndex}</span>
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
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-400 block mb-1">
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
  const atsTheme = getScoreTheme(atsScore);
  const keywordTheme = getScoreTheme(breakdown.keyword_score);
  const expTheme = getScoreTheme(breakdown.experience_score);
  const impactTheme = getScoreTheme(breakdown.quantified_impact_score);
  const sectionTheme = getScoreTheme(breakdown.section_structure_score);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 shadow-sm backdrop-blur-md space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <FileText className={`h-4 w-4 ${atsTheme.text}`} />
          <h2 className="text-sm sm:text-base font-bold text-white font-sans">
            ATS Resume vs. Job Description Compatibility Audit
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-mono font-bold border ${atsTheme.badge}`}>
            {atsScore} / 100 ATS Score
          </span>
        </div>
      </div>

      {/* 4 Dimension Progress Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Keyword Density</span>
            <span className={`${keywordTheme.text} font-bold`}>{breakdown.keyword_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full ${keywordTheme.bg} rounded-full transition-all duration-500`}
              style={{ width: `${breakdown.keyword_score}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Experience &amp; Seniority</span>
            <span className={`${expTheme.text} font-bold`}>{breakdown.experience_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full ${expTheme.bg} rounded-full transition-all duration-500`}
              style={{ width: `${breakdown.experience_score}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Quantified Impact</span>
            <span className={`${impactTheme.text} font-bold`}>{breakdown.quantified_impact_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full ${impactTheme.bg} rounded-full transition-all duration-500`}
              style={{ width: `${breakdown.quantified_impact_score}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-1.5 font-mono">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400 text-[11px]">Section Formatting</span>
            <span className={`${sectionTheme.text} font-bold`}>{breakdown.section_structure_score}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full ${sectionTheme.bg} rounded-full transition-all duration-500`}
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
  // Not assessed = no pips lit (never render a missing score as L1).
  const currentLevel = score ?? 0;
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
              className={`text-[11px] font-mono text-center ${
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
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'dossier'>('overview');
  const [historyData, setHistoryData] = useState<InterviewHistoryResponse | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'scored' | 'in_progress'>('all');

  const [report, setReport] = useState<AssessmentReportRead | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState<boolean>(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isReportEmpty, setIsReportEmpty] = useState<boolean>(false);
  const [pendingSeconds, setPendingSeconds] = useState<number>(0);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const [chartDimension, setChartDimension] = useState<'rubric' | 'ats' | 'verbal' | 'composite'>('rubric');
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
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  // Fetch History Progression
  useEffect(() => {
    let isMounted = true;
    setIsLoadingHistory(true);
    interviewsApi
      .listHistory()
      .then((data) => {
        if (!isMounted) return;
        setHistoryData(data);
        setIsLoadingHistory(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Failed to load interview history:', err);
        setIsLoadingHistory(false);
      });
    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  // Handle switching to a specific historical session dossier
  const handleSelectHistoricalSession = (selectedId: string) => {
    setSelectedSessionId(selectedId);
    setDashboardTab('dossier');
  };

  // Fetch or poll the target report
  useEffect(() => {
    let isMounted = true;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const POLL_INTERVAL_MS = 3000;
    const MAX_WAIT_MS = 5 * 60 * 1000;
    setIsLoadingReport(true);
    setReportError(null);
    setIsReportEmpty(false);
    setPendingSeconds(0);

    // Only target the active interview from store if the user hasn't explicitly chosen
    // a session AND the active interview was actually completed (i.e. waiting to be scored).
    // If the active interview is in WARMUP, CREATED, or paused, it has no report.
    const activeState = useInterviewStore.getState().state;
    let targetId: string | null = selectedSessionId;
    if (!targetId && activeState === 'COMPLETED' && interviewId) {
      targetId = interviewId;
    }

    async function fetchOrPollReport() {
      try {
        const data = targetId
          ? await interviewsApi.getReport(targetId)
          : await interviewsApi.getLatestReport();
        if (!isMounted) return;
        setReport(data);
        setIsLoadingReport(false);
        if (data?.interview_id) {
          setSelectedSessionId(data.interview_id);
        }
      } catch (err) {
        if (!isMounted) return;
        const status = err instanceof ApiError ? err.status : 0;

        // Check if the target session in history is incomplete/unscored
        const sessionInHistory = historyData?.items?.find((s) => s.id === targetId);
        const isNotCompleted = sessionInHistory
          ? sessionInHistory.state !== 'COMPLETED'
          : !selectedSessionId && useInterviewStore.getState().state !== 'COMPLETED';

        // Report is still being scored: keep polling with visible progress only if genuinely COMPLETED
        if (status === 409) {
          if (isNotCompleted) {
            // Uncompleted/abandoned session will never have a report. Do not poll!
            try {
              localStorage.removeItem('careerdiff_active_interview_id');
            } catch {}
            useInterviewStore.setState({ interviewId: null });
            if (!selectedSessionId) {
              targetId = null;
              pollTimeoutId = setTimeout(fetchOrPollReport, 0);
              return;
            }
            setIsReportEmpty(true);
            setIsLoadingReport(false);
            return;
          }

          const elapsed = Date.now() - startedAt;
          setPendingSeconds(Math.round(elapsed / 1000));
          if (elapsed < MAX_WAIT_MS) {
            pollTimeoutId = setTimeout(fetchOrPollReport, POLL_INTERVAL_MS);
          } else {
            setReportError('Scoring is taking longer than usual. Your interview is saved — check back in a few minutes.');
            setIsLoadingReport(false);
          }
          return;
        }

        if (status === 404) {
          if (targetId && !selectedSessionId) {
            // Stale id from store/localStorage: clear and fall back to latest report
            try {
              localStorage.removeItem('careerdiff_active_interview_id');
            } catch {}
            useInterviewStore.setState({ interviewId: null });
            targetId = null;
            pollTimeoutId = setTimeout(fetchOrPollReport, 0);
            return;
          }
          setIsReportEmpty(true);
          setIsLoadingReport(false);
          return;
        }

        setReportError(err instanceof Error ? err.message : 'Could not load your report.');
        setIsLoadingReport(false);
      }
    }

    fetchOrPollReport();
    return () => {
      isMounted = false;
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
    };
  }, [interviewId, selectedSessionId, reloadKey, historyData]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const renderRadarChart = (scores: CompetencyScoreRead[]) => {
    if (!scores || scores.length < 3) return null;

    const size = 260;
    const center = size / 2;
    const radius = 90;
    const totalPoints = scores.length;
    const angleStep = (Math.PI * 2) / totalPoints;

    const polygonPoints = scores
      .map((item, idx) => {
        const value = item.score ? item.score / 4.0 : 0;
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
          role="img"
          aria-label={`Competency scores: ${scores
            .map((sc) => `${sc.competency_name} ${sc.score ? `level ${sc.score} of 4` : 'not assessed'}`)
            .join('; ')}`}
          viewBox={`0 0 ${size} ${size}`}
          className="w-full max-w-[260px] h-auto overflow-visible"
        >
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

          <polygon
            points={polygonPoints}
            fill="rgba(52, 211, 153, 0.12)"
            stroke="#34d399"
            strokeWidth="2"
          />

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
                <title>{`${item.competency_name}: ${item.score ? `L${item.score}` : 'not assessed'}`}</title>
                {item.competency_name.length > 14
                  ? `${item.competency_name.slice(0, 12)}…`
                  : item.competency_name}
              </text>
            );
          })}
        </svg>
        <span className="mt-3 text-[11px] text-zinc-500 font-mono">Competency Mastery Distribution (L1 - L4)</span>
      </div>
    );
  };

  const getEvidenceBadge = (type: EvidenceType) => {
    switch (type) {
      case 'POSITIVE_MASTERY':
        return <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-[11px] font-mono font-medium text-emerald-400 border border-emerald-800/40">Positive Mastery</span>;
      case 'KNOWLEDGE_GAP':
        return <span className="rounded bg-amber-950/60 px-2 py-0.5 text-[11px] font-mono font-medium text-amber-400 border border-amber-800/40">Knowledge Gap</span>;
      case 'CONTRADICTION':
        return <span className="rounded bg-rose-950/60 px-2 py-0.5 text-[11px] font-mono font-medium text-rose-400 border border-rose-800/40">Contradiction</span>;
      case 'SUPERFICIAL_EXPLANATION':
        return <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono font-medium text-zinc-300 border border-zinc-700">Superficial</span>;
    }
  };

  const getClaimStatusBadge = (status: ClaimVerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return <span className="rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-emerald-400 border border-emerald-800/40">VERIFIED</span>;
      case 'CONTRADICTED':
        return <span className="rounded-full bg-rose-950/60 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-rose-400 border border-rose-800/40">CONTRADICTED</span>;
      case 'VAGUE':
        return <span className="rounded-full bg-amber-950/60 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-amber-400 border border-amber-800/40">VAGUE</span>;
      case 'UNTESTED':
        return <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-zinc-400 border border-zinc-800">UNTESTED</span>;
    }
  };

  // Render Multi-Dimensional SVG Trend Progression Chart across sessions
  const renderTrendChart = (items: InterviewHistoryItemRead[]) => {
    // Sort scored sessions chronologically: oldest to newest
    const scoredSessions = [...items]
      .filter((item) => item.overall_score !== null && item.overall_score !== undefined)
      .reverse();

    const width = 680;
    const height = 175;
    const padX = 45;
    const padY = 28;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    // Helper to compute points for any dimension
    const getDimensionPoints = (type: 'rubric' | 'ats' | 'verbal') => {
      return scoredSessions.map((session, idx) => {
        const x =
          scoredSessions.length === 1
            ? width / 2
            : padX + (idx / Math.max(1, scoredSessions.length - 1)) * chartW;

        let rawVal = 0;
        let normalized = 0; // 0.0 to 1.0

        if (type === 'rubric') {
          rawVal = session.overall_score || 0;
          normalized = Math.max(0, Math.min(1, (rawVal - 1.0) / 3.0));
        } else if (type === 'ats') {
          rawVal = session.ats_score || 0;
          normalized = Math.max(0, Math.min(1, rawVal / 100));
        } else {
          rawVal = session.communication_score || 0;
          normalized = Math.max(0, Math.min(1, rawVal / 100));
        }

        const y = padY + chartH - normalized * chartH;
        return { x, y, rawVal, session, idx };
      });
    };

    const rubricPoints = getDimensionPoints('rubric');
    const atsPoints = getDimensionPoints('ats');
    const verbalPoints = getDimensionPoints('verbal');

    const rubricPolyline = rubricPoints.map((p) => `${p.x},${p.y}`).join(' ');
    const atsPolyline = atsPoints.map((p) => `${p.x},${p.y}`).join(' ');
    const verbalPolyline = verbalPoints.map((p) => `${p.x},${p.y}`).join(' ');

    const currentPoints =
      chartDimension === 'ats'
        ? atsPoints
        : chartDimension === 'verbal'
        ? verbalPoints
        : rubricPoints;

    const currentPolyline =
      chartDimension === 'ats'
        ? atsPolyline
        : chartDimension === 'verbal'
        ? verbalPolyline
        : rubricPolyline;

    const themeColor =
      chartDimension === 'ats'
        ? '#38bdf8'
        : chartDimension === 'verbal'
        ? '#818cf8'
        : '#10b981';

    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4 font-mono shadow-sm">
        {/* Header with Title and Dimension Toggle Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: themeColor }} />
            <div>
              <span className="text-xs font-semibold text-zinc-100 font-sans">
                Longitudinal Growth Trajectory &amp; Telemetry
              </span>
              <span className="text-[11px] text-zinc-500 block font-mono">
                {scoredSessions.length} Assessed Interviews Over Time
              </span>
            </div>
          </div>

          {/* Metric Dimension Selector Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-[11px]">
            <button
              type="button"
              onClick={() => setChartDimension('rubric')}
              className={`px-2.5 py-1 rounded transition-colors ${
                chartDimension === 'rubric'
                  ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Rubric (1.0–4.0)
            </button>
            <button
              type="button"
              onClick={() => setChartDimension('ats')}
              className={`px-2.5 py-1 rounded transition-colors ${
                chartDimension === 'ats'
                  ? 'bg-zinc-800 text-sky-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Resume &amp; ATS (%)
            </button>
            <button
              type="button"
              onClick={() => setChartDimension('verbal')}
              className={`px-2.5 py-1 rounded transition-colors ${
                chartDimension === 'verbal'
                  ? 'bg-zinc-800 text-indigo-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Verbal Delivery
            </button>
            <button
              type="button"
              onClick={() => setChartDimension('composite')}
              className={`px-2.5 py-1 rounded transition-colors ${
                chartDimension === 'composite'
                  ? 'bg-zinc-800 text-amber-400 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Multi-Metric Overlay
            </button>
          </div>
        </div>

        {/* Legend Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 font-sans pt-0.5">
          {chartDimension === 'rubric' && (
            <div className="flex items-center gap-3 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Senior Target (L3.0)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-400" /> Staff Level (L3.5)
              </span>
              <span className="text-zinc-500">Evaluated on Standard 4-Tier Rubric</span>
            </div>
          )}
          {chartDimension === 'ats' && (
            <div className="flex items-center gap-3 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> Strong Fit (80%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Verified Claims (90%)
              </span>
              <span className="text-zinc-500">Grounding across JD Requirements</span>
            </div>
          )}
          {chartDimension === 'verbal' && (
            <div className="flex items-center gap-3 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-400" /> Articulate (85)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> Clear &amp; Direct (70)
              </span>
              <span className="text-zinc-500">Zero-Biometrics (NYC LL144 &amp; EU AI Act)</span>
            </div>
          )}
          {chartDimension === 'composite' && (
            <div className="flex items-center gap-3 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Rubric Index
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> Resume &amp; ATS Match
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-400" /> Verbal Fluency
              </span>
            </div>
          )}
          <span className="text-zinc-500 font-mono text-[10px]">
            Click points to inspect dossier
          </span>
        </div>

        {/* SVG Graph Canvas */}
        <div className="w-full overflow-x-auto relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[540px]">
            <defs>
              <linearGradient id="rubricAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="atsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="verbalAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines & Thresholds based on selected metric */}
            {chartDimension === 'rubric' &&
              [1.0, 2.0, 3.0, 3.5, 4.0].map((level) => {
                const y = padY + chartH - ((level - 1.0) / 3.0) * chartH;
                const isStaff = level === 3.5;
                const isSenior = level === 3.0;
                return (
                  <g key={level}>
                    <line
                      x1={padX}
                      y1={y}
                      x2={width - padX}
                      y2={y}
                      stroke={isStaff ? '#818cf8' : isSenior ? '#34d399' : '#27272a'}
                      strokeDasharray={isStaff || isSenior ? '4 4' : '2 2'}
                      strokeWidth={isStaff || isSenior ? '1.2' : '1'}
                      opacity={isStaff || isSenior ? '0.5' : '0.25'}
                    />
                    <text
                      x={padX - 8}
                      y={y + 3}
                      fill={isStaff ? '#a5b4fc' : isSenior ? '#6ee7b7' : '#71717a'}
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {isStaff ? 'Staff 3.5' : isSenior ? 'Sr 3.0' : level.toFixed(1)}
                    </text>
                  </g>
                );
              })}

            {(chartDimension === 'ats' || chartDimension === 'verbal' || chartDimension === 'composite') &&
              [25, 50, 75, 85, 100].map((pct) => {
                const y = padY + chartH - (pct / 100) * chartH;
                const isTarget = pct === 85 || pct === 75;
                return (
                  <g key={pct}>
                    <line
                      x1={padX}
                      y1={y}
                      x2={width - padX}
                      y2={y}
                      stroke={isTarget ? '#38bdf8' : '#27272a'}
                      strokeDasharray={isTarget ? '4 4' : '2 2'}
                      strokeWidth={isTarget ? '1.2' : '1'}
                      opacity={isTarget ? '0.45' : '0.25'}
                    />
                    <text
                      x={padX - 8}
                      y={y + 3}
                      fill={isTarget ? '#38bdf8' : '#71717a'}
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

            {scoredSessions.length === 0 && (
              <text
                x={width / 2}
                y={height / 2}
                fill="#71717a"
                fontSize="11"
                fontFamily="sans-serif"
                textAnchor="middle"
              >
                Awaiting first scored interview • Benchmarked against Senior &amp; Staff industry standards
              </text>
            )}

            {/* Single Dimension Rendering */}
            {chartDimension !== 'composite' && scoredSessions.length >= 2 && (
              <>
                <polygon
                  points={`${padX},${padY + chartH} ${currentPolyline} ${
                    currentPoints[currentPoints.length - 1].x
                  },${padY + chartH}`}
                  fill={
                    chartDimension === 'ats'
                      ? 'url(#atsAreaGrad)'
                      : chartDimension === 'verbal'
                      ? 'url(#verbalAreaGrad)'
                      : 'url(#rubricAreaGrad)'
                  }
                />
                <polyline
                  points={currentPolyline}
                  fill="none"
                  stroke={themeColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Composite Overlay Mode: Render all 3 polylines */}
            {chartDimension === 'composite' && scoredSessions.length >= 2 && (
              <>
                <polyline
                  points={rubricPolyline}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={atsPolyline}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={verbalPolyline}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="2"
                  strokeDasharray="2 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {/* Points Rendering */}
            {currentPoints.map((p) => {
              const isSelected = p.session.id === (selectedSessionId || report?.interview_id);
              const labelText =
                chartDimension === 'rubric'
                  ? p.rawVal.toFixed(1)
                  : `${Math.round(p.rawVal)}${chartDimension === 'ats' ? '%' : ''}`;

              return (
                <g
                  key={p.session.id}
                  className="cursor-pointer group"
                  onClick={() => handleSelectHistoricalSession(p.session.id)}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 6.5 : 5}
                    fill={isSelected ? '#34d399' : themeColor}
                    stroke="#09090b"
                    strokeWidth="2"
                    className="transition-all hover:scale-125"
                  />
                  <text
                    x={p.x}
                    y={p.y - 10}
                    fill={isSelected ? '#34d399' : '#e4e4e7'}
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {labelText}
                  </text>
                  <text
                    x={p.x}
                    y={padY + chartH + 16}
                    fill="#71717a"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    #{p.idx + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom Trajectory Telemetry Summary */}
        {scoredSessions.length >= 2 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80 text-[11px] font-sans text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-semibold font-mono">
                {historyData?.score_improvement_delta && historyData.score_improvement_delta > 0
                  ? `+${historyData.score_improvement_delta.toFixed(2)} Score Delta`
                  : 'Upward Progression Active'}
              </span>
              <span>•</span>
              <span>Consistent trajectory towards Staff (L3.5) calibration</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
              <span>Oldest: L{scoredSessions[0].overall_score?.toFixed(1)}</span>
              <span>→</span>
              <span className="text-white font-bold">
                Latest: L{scoredSessions[scoredSessions.length - 1].overall_score?.toFixed(1)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Aggregated performance statistics
  const totalInterviews = historyData?.total_interviews ?? (report ? 1 : 0);
  const scoredItems = (historyData?.items || []).filter(
    (item) => item.overall_score !== null && item.overall_score !== undefined
  );
  const inProgressItems = (historyData?.items || []).filter((item) => item.state !== 'COMPLETED');

  // Filtered session list for ledger
  const filteredSessions = (historyData?.items || []).filter((item) => {
    if (historyFilter === 'scored') {
      return item.overall_score !== null && item.overall_score !== undefined;
    }
    if (historyFilter === 'in_progress') {
      return item.state !== 'COMPLETED';
    }
    return true;
  });

  const latestScore = historyData?.latest_score ?? report?.overall_score ?? null;
  const averageScore = historyData?.average_score ?? report?.overall_score ?? null;
  const primaryScore = latestScore ?? averageScore ?? 3.0;

  // Average ATS Score
  const atsScores = (historyData?.items || [])
    .map((i) => i.ats_score)
    .filter((s): s is number => s !== null && s !== undefined);
  if (report?.ats_score !== undefined && report?.ats_score !== null && atsScores.length === 0) {
    atsScores.push(report.ats_score);
  }
  const avgAtsScore =
    atsScores.length > 0 ? Math.round(atsScores.reduce((a, b) => a + b, 0) / atsScores.length) : (report?.ats_score ?? 82);

  // Average Communication Score
  const commScores = (historyData?.items || [])
    .map((i) => i.communication_score)
    .filter((s): s is number => s !== null && s !== undefined);
  if (report?.communication_score !== undefined && report?.communication_score !== null && commScores.length === 0) {
    commScores.push(report.communication_score);
  }
  const avgCommScore =
    commScores.length > 0
      ? Math.round(commScores.reduce((a, b) => a + b, 0) / commScores.length)
      : (report?.communication_score ?? 84);

  // Total Practice Time & Fielded Turns
  const totalSeconds = (historyData?.items || []).reduce(
    (acc, it) => acc + (it.actual_duration_seconds || 0),
    0
  );
  const totalFieldedTurns = (historyData?.items || []).reduce((acc, it) => acc + (it.total_turns || 0), 0);

  // Readiness Index
  const readinessPercent = Math.min(100, Math.round((primaryScore / 4.0) * 100));
  const readinessTier =
    primaryScore >= 3.5
      ? 'Staff / Principal Calibrated'
      : primaryScore >= 2.8
      ? 'Senior Engineer Calibrated'
      : primaryScore >= 2.0
      ? 'Mid-Level Engineer Calibrated'
      : 'Novice / Developing Track';

  const targetSeniorityDisplay =
    historyData?.items[0]?.target_seniority || (report ? 'SENIOR' : 'SENIOR');

  const isNewAccount =
    !isLoadingHistory &&
    (!historyData || historyData.total_interviews === 0) &&
    !report;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* Top Cockpit Header & Navigation Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700 text-emerald-400 shadow-sm">
              <BarChart3 className="h-4 w-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-sans">
              Engineering Intelligence &amp; Performance
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-sans">
            Longitudinal rubric calibration, ATS profile matching, and technical delivery telemetry across your interview history.
          </p>
        </div>

        {/* Segmented View Switcher & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-zinc-900/90 border border-zinc-800 p-1 rounded-xl font-mono text-xs shadow-inner">
            <button
              type="button"
              onClick={() => setDashboardTab('overview')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                dashboardTab === 'overview'
                  ? 'bg-zinc-800 text-white font-semibold shadow-sm border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Overview &amp; Trends</span>
            </button>
            <button
              type="button"
              onClick={() => setDashboardTab('dossier')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all ${
                dashboardTab === 'dossier'
                  ? 'bg-zinc-800 text-white font-semibold shadow-sm border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-sky-400" />
              <span>Assessment Dossier</span>
              {report?.overall_score && (
                <span className="rounded bg-emerald-950/70 border border-emerald-800/60 px-1.5 py-0.2 text-[10px] text-emerald-400 font-bold">
                  L{report.overall_score.toFixed(1)}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 hover:bg-zinc-900 px-3.5 py-2 text-xs font-mono font-medium text-zinc-200 hover:text-white transition-colors shadow-sm"
          >
            <Zap className="h-3.5 w-3.5 text-emerald-400" />
            <span>+ New Practice</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: EXECUTIVE OVERVIEW & LONGITUDINAL ANALYTICS
          ===================================================================== */}
      {dashboardTab === 'overview' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Hero Executive Readiness Banner */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 shadow-sm backdrop-blur-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-900/60 bg-emerald-950/50 px-3 py-1 text-xs font-mono font-semibold text-emerald-400">
                    <Award className="h-3.5 w-3.5 text-emerald-400" />
                    {readinessTier}
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-[11px] font-mono text-zinc-400">
                    Target: {targetSeniorityDisplay}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-sans">
                  Technical Readiness &amp; Performance Profile
                </h2>
                <p className="text-xs sm:text-sm text-zinc-300 font-sans leading-relaxed">
                  Based on {totalInterviews} simulated engineering interviews, you are tracking at{' '}
                  <span className="text-emerald-400 font-semibold font-mono">{primaryScore.toFixed(1)} / 4.0</span> on the standardized technical rubric with an average ATS JD match of{' '}
                  <span className="text-sky-400 font-semibold font-mono">{avgAtsScore}%</span>. Your architectural reasoning around distributed failure domains and concurrency is strongly aligned with senior industry benchmarks.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onReset}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-sm active:scale-[0.98]"
                  >
                    <Zap className="h-3.5 w-3.5 text-zinc-950" />
                    Start Calibration Session
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardTab('dossier')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-mono font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors shadow-sm"
                  >
                    <span>Inspect Latest Dossier</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
                  </button>
                </div>
              </div>

              {/* Readiness Index Circular Telemetry Gauge */}
              <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 shrink-0 min-w-[200px] font-mono shadow-inner">
                <div className="relative flex items-center justify-center w-28 h-28">
                  <svg width="112" height="112" className="rotate-[-90deg]">
                    <circle
                      cx="56"
                      cy="56"
                      r="46"
                      fill="transparent"
                      stroke="#27272a"
                      strokeWidth="8"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r="46"
                      fill="transparent"
                      stroke="#34d399"
                      strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 46}
                      strokeDashoffset={2 * Math.PI * 46 * (1 - readinessPercent / 100)}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold text-white font-mono leading-none">
                      {readinessPercent}%
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono mt-1">READINESS</span>
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-zinc-800">
                    L{primaryScore.toFixed(1)} / 4.0
                  </span>
                  <span className="block text-[11px] text-zinc-500 mt-1">Calibrated Level</span>
                </div>
              </div>
            </div>
          </div>

          {/* New Account Calibration Roadmap Banner */}
          {isNewAccount && (
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-5 space-y-3 font-sans">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-semibold">
                <Compass className="h-4 w-4" />
                <span>Quick-Start Engineering Calibration Roadmap</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                You are currently viewing your initial baseline. To populate your longitudinal progression trajectory, ATS keyword analysis, and objective verbal delivery scores, launch your first practice interview session.
              </p>
            </div>
          )}

          {/* 4 Core Executive Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Rubric Technical Index */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2 font-mono shadow-sm">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-sans font-semibold text-zinc-300">
                  <Award className="h-3.5 w-3.5 text-emerald-400" /> Rubric Index
                </span>
                {historyData?.score_improvement_delta ? (
                  <span className="text-emerald-400 font-semibold text-[11px] flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" />
                    +{historyData.score_improvement_delta.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-zinc-500 text-[11px]">Baseline</span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{primaryScore.toFixed(1)}</span>
                <span className="text-xs text-zinc-500">/ 4.0 Scale</span>
              </div>
              {/* Level tick bar */}
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-700"
                    style={{ width: `${(primaryScore / 4.0) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>L1 Novice</span>
                  <span>L3 Senior</span>
                  <span>L4 Staff</span>
                </div>
              </div>
            </div>

            {/* 2. Longitudinal ATS JD Fit */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2 font-mono shadow-sm">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-sans font-semibold text-zinc-300">
                  <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" /> ATS JD Fit
                </span>
                <span className="text-sky-400 font-semibold text-[11px]">
                  {avgAtsScore >= 80 ? 'Strong Match' : 'Moderate'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{avgAtsScore}%</span>
                <span className="text-xs text-zinc-500">Avg Alignment</span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-400 transition-all duration-700"
                    style={{ width: `${avgAtsScore}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Keywords Grounded</span>
                  <span>Verified Claims</span>
                </div>
              </div>
            </div>

            {/* 3. Objective Verbal Delivery */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2 font-mono shadow-sm">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-sans font-semibold text-zinc-300">
                  <Mic className="h-3.5 w-3.5 text-indigo-400" /> Verbal Delivery
                </span>
                <span className="text-indigo-400 font-semibold text-[11px]">
                  {avgCommScore >= 80 ? 'Articulate' : 'Clear'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{avgCommScore}</span>
                <span className="text-xs text-zinc-500">/ 100 Delivery</span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 transition-all duration-700"
                    style={{ width: `${avgCommScore}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>~140 WPM Pacing</span>
                  <span>Zero-Biometrics</span>
                </div>
              </div>
            </div>

            {/* 4. Flight Time & Interview Velocity */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2 font-mono shadow-sm">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-sans font-semibold text-zinc-300">
                  <Clock className="h-3.5 w-3.5 text-amber-400" /> Flight Time
                </span>
                <span className="text-amber-400 font-semibold text-[11px]">
                  {totalInterviews} Sessions
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">
                  {totalSeconds > 0 ? formatDuration(totalSeconds) : `${totalInterviews * 15}m est`}
                </span>
                <span className="text-xs text-zinc-500">Simulated</span>
              </div>
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-700"
                    style={{ width: `${Math.min(100, totalInterviews * 20)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>{totalFieldedTurns || totalInterviews * 6} Turns Fielded</span>
                  <span>Active Cadence</span>
                </div>
              </div>
            </div>
          </div>

          {/* Longitudinal Trajectory Progression Chart */}
          {renderTrendChart(historyData?.items || [])}

          {/* Competency Mastery & Immediate Focus Areas Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Competency Topology Radar or Meters */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                  Competency Mastery Topology
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">Rubric L1–L4</span>
              </div>

              {report?.competency_scores && report.competency_scores.length >= 3 ? (
                <div>{renderRadarChart(report.competency_scores)}</div>
              ) : (
                <div className="space-y-3 font-mono text-xs">
                  {[
                    { name: 'System Architecture & Boundaries', score: 3.8, level: 'Staff' },
                    { name: 'Concurrency & Race Isolation', score: 3.5, level: 'Staff' },
                    { name: 'Storage Engines & ACID Isolation', score: 3.2, level: 'Senior' },
                    { name: 'Operational Failure Recovery & DLQ', score: 3.0, level: 'Senior' },
                    { name: 'Technical Trade-off Articulation', score: 3.6, level: 'Staff' },
                  ].map((comp, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-200 font-sans text-xs">{comp.name}</span>
                        <span className="text-emerald-400 font-bold">{comp.level} (L{comp.score})</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${(comp.score / 4.0) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Actionable High-Impact Gaps & Recommended Practice */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                  <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-amber-400" />
                    Targeted Knowledge Gaps &amp; Practice Vectors
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-400">High Leverage</span>
                </div>

                {report?.knowledge_gaps && report.knowledge_gaps.length > 0 ? (
                  <ul className="space-y-2.5">
                    {report.knowledge_gaps.slice(0, 4).map((gap, idx) => (
                      <li
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800/80"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-amber-400 mt-0.5 font-mono">•</span>
                          <span className="text-xs sm:text-sm text-zinc-300 font-sans leading-relaxed">
                            {gap}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={onReset}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-amber-900/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-mono font-semibold px-3 py-1.5 text-xs transition-colors shadow-sm self-start sm:self-auto"
                        >
                          <Zap className="h-3 w-3 text-amber-400" />
                          <span>Practice Gap</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-2.5">
                    {[
                      {
                        title: 'Distributed Concurrency & Idempotency',
                        desc: 'Deepen explicit articulation of the Transactional Outbox pattern, consumer deduplication keys, and distributed locking edge cases.',
                      },
                      {
                        title: 'High-Throughput Backpressure & Queue Saturation',
                        desc: 'Formulate reactive streaming backpressure, consumer group lag monitoring, and partition scaling strategies.',
                      },
                      {
                        title: 'Database Storage Engine Trade-offs',
                        desc: 'Contrast write amplification in LSM-tree engines (RocksDB) vs read performance in B+ Trees under mixed transactional workloads.',
                      },
                    ].map((item, idx) => (
                      <li
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800/80"
                      >
                        <div className="space-y-1">
                          <h4 className="text-xs font-semibold text-zinc-200 font-sans">{item.title}</h4>
                          <p className="text-xs text-zinc-400 font-sans leading-relaxed">{item.desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={onReset}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono font-semibold px-3 py-1.5 text-xs transition-colors shadow-sm self-start sm:self-auto"
                        >
                          <Zap className="h-3 w-3 text-zinc-400" />
                          <span>Practice Topic</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Observed Strengths Snapshot */}
              {report?.strengths && report.strengths.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      Observed Technical Strengths
                    </h3>
                    <span className="text-[11px] font-mono text-zinc-500">Verified</span>
                  </div>
                  <ul className="space-y-2 text-xs sm:text-sm text-zinc-300 font-sans">
                    {report.strengths.slice(0, 3).map((s, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-mono">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Comprehensive Session History Ledger */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-7 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white font-sans flex items-center gap-2">
                  <History className="h-4 w-4 text-emerald-400" />
                  Practice Session History &amp; Dossier Ledger
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Complete ledger of your conducted practice interviews, duration, turns, and assessment outcomes.
                </p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('all')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    historyFilter === 'all'
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  All ({historyData?.items.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('scored')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    historyFilter === 'scored'
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Scored ({scoredItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('in_progress')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    historyFilter === 'in_progress'
                      ? 'bg-zinc-800 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  In Progress ({inProgressItems.length})
                </button>
              </div>
            </div>

            {/* Table */}
            {filteredSessions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="border-b border-zinc-800 text-zinc-400 font-mono text-[11px]">
                    <tr>
                      <th className="pb-3 font-semibold">Date &amp; Time</th>
                      <th className="pb-3 font-semibold">Role &amp; Seniority</th>
                      <th className="pb-3 font-semibold">Duration &amp; Turns</th>
                      <th className="pb-3 font-semibold">Rubric Score</th>
                      <th className="pb-3 font-semibold">ATS Fit</th>
                      <th className="pb-3 font-semibold">Verbal</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {filteredSessions.map((session) => {
                      const isSelected =
                        session.id === (selectedSessionId || report?.interview_id);
                      return (
                        <tr
                          key={session.id}
                          className={`group hover:bg-zinc-800/40 transition-colors ${
                            isSelected ? 'bg-zinc-800/20' : ''
                          }`}
                        >
                          <td className="py-3.5 pr-3 text-zinc-300 font-mono text-xs whitespace-nowrap">
                            {formatDate(session.created_at)}
                          </td>
                          <td className="py-3.5 pr-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-zinc-100">
                                {session.role_title || 'Engineering Session'}
                              </span>
                              <span className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400">
                                {session.target_seniority}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 pr-3 text-zinc-400 font-mono text-xs whitespace-nowrap">
                            {formatDuration(session.actual_duration_seconds)} • {session.total_turns} turns
                          </td>
                          <td className="py-3.5 pr-3 whitespace-nowrap">
                            {session.overall_score !== null && session.overall_score !== undefined ? (
                              <span className="rounded-lg bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 text-xs font-mono font-bold text-emerald-400">
                                {session.overall_score.toFixed(1)} / 4.0
                              </span>
                            ) : (
                              <span className="text-zinc-500 font-mono text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3.5 pr-3 whitespace-nowrap">
                            {session.ats_score !== null && session.ats_score !== undefined ? (
                              <span className="rounded-lg bg-sky-950/70 border border-sky-800/80 px-2 py-0.5 text-xs font-mono font-semibold text-sky-400">
                                {session.ats_score}%
                              </span>
                            ) : (
                              <span className="text-zinc-500 font-mono text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3.5 pr-3 whitespace-nowrap">
                            {session.communication_score !== null &&
                            session.communication_score !== undefined ? (
                              <span className="rounded-lg bg-indigo-950/70 border border-indigo-800/80 px-2 py-0.5 text-xs font-mono font-semibold text-indigo-400">
                                {session.communication_score}
                              </span>
                            ) : (
                              <span className="text-zinc-500 font-mono text-xs">—</span>
                            )}
                          </td>
                          <td className="py-3.5 pr-3 whitespace-nowrap">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold border ${
                                session.state === 'COMPLETED'
                                  ? 'bg-zinc-950 text-zinc-300 border-zinc-800'
                                  : 'bg-amber-950/50 text-amber-400 border-amber-800/60'
                              }`}
                            >
                              {session.state}
                            </span>
                          </td>
                          <td className="py-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleSelectHistoricalSession(session.id)}
                              className="inline-flex items-center gap-1 text-xs font-mono font-medium text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                            >
                              <span>View Dossier</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                No sessions match the selected filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: TECHNICAL ASSESSMENT DOSSIER (DEEP DIVE REPORT)
          ===================================================================== */}
      {dashboardTab === 'dossier' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Active Session Switcher Toolbar */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDashboardTab('overview')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-mono font-medium text-zinc-300 hover:text-white transition-colors"
              >
                <span>← Back to Overview</span>
              </button>

              {historyData && historyData.items.length > 0 && (
                <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
                  <span className="hidden sm:inline text-zinc-500">Session:</span>
                  <select
                    value={selectedSessionId || report?.interview_id || ''}
                    onChange={(e) => handleSelectHistoricalSession(e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-mono text-zinc-200 focus:border-zinc-600 focus:outline-none"
                  >
                    {historyData.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatDate(item.created_at)} — {item.target_seniority}{' '}
                        {item.role_title ? `(${item.role_title})` : ''}{' '}
                        {item.overall_score ? `• L${item.overall_score.toFixed(1)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-mono font-medium text-zinc-300 hover:text-white transition-colors shadow-sm"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
                <span>Export / Print PDF</span>
              </button>
            </div>
          </div>

          {/* In-Flight Report Polling / Loading */}
          {isLoadingReport && (
            <div className="flex h-64 flex-col items-center justify-center p-6 text-center rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400 mb-4" />
              <h2 className="text-base font-bold text-white font-sans">
                {pendingSeconds > 0 ? 'Scoring your technical interview…' : 'Loading assessment dossier…'}
              </h2>
              <p className="mt-1.5 text-xs text-zinc-400 max-w-md font-sans" role="status" aria-live="polite">
                {pendingSeconds > 0
                  ? `Synthesizing rubric scoring, claim verification, and NYC LL144 delivery metrics (${pendingSeconds}s so far). You can browse Overview while scoring completes.`
                  : 'Fetching normalized turn records and evaluations.'}
              </p>
            </div>
          )}

          {/* Report Load Error */}
          {!isLoadingReport && (reportError || isReportEmpty || !report) && (
            <div className="mx-auto max-w-xl py-12 px-4 text-center rounded-2xl border border-zinc-800 bg-zinc-900/40 space-y-4">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
              <h2 className="text-base font-bold text-white">
                {reportError || (isReportEmpty ? 'No report generated yet for this session.' : 'No report found for this session.')}
              </h2>
              <p className="text-xs text-zinc-400 font-sans">
                This session may still be in progress or was not yet scored by the evaluator.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition-all font-mono"
                >
                  Retry Loading
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardTab('overview')}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white transition-all font-mono"
                >
                  Return to Overview
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-sm font-sans"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Start New Session
                </button>
              </div>
            </div>
          )}

          {/* Comprehensive Report Content */}
          {!isLoadingReport && report && (
            <>
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
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDashboardTab('overview')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-1.5 text-xs font-mono font-medium text-emerald-400 hover:bg-emerald-900/50 hover:border-emerald-700 transition-colors shadow-sm"
                      >
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        Longitudinal Trends &amp; Progression
                      </button>
                    </div>
                  </div>

                  {/* Circular Score Ring Gauges: Interview Rubric, ATS JD Match, and Verbal Delivery */}
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    <ScoreRingGauge
                      score={report.overall_score || 0}
                      tier={
                        (report.overall_score || 0) >= 3.5
                          ? 'Expert (L4)'
                          : (report.overall_score || 0) >= 2.8
                          ? 'Competent (L3)'
                          : (report.overall_score || 0) >= 2.0
                          ? 'Developing (L2)'
                          : 'Novice (L1)'
                      }
                    />
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
                              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
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
                                      <span className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300 border border-zinc-800">
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
                                      <span className="text-[11px] text-zinc-500">
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

                  {/* Mobile Card View */}
                  <div className="space-y-3 sm:hidden">
                    {report.claim_verifications.map((cl: ClaimVerificationRead) => (
                      <div key={cl.claim_id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] uppercase font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
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

                  {/* Desktop Table View */}
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
                            <td className="py-3 pr-4 text-zinc-400 uppercase font-mono text-[11px]">{cl.category}</td>
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
                  className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all active:scale-[0.98] shadow-sm font-sans"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Start Another Technical Practice Session
                </button>
              </div>
            </>
          )}
        </div>
      )}

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

      {/* Candidate Performance Trends & Longitudinal History Modal (Optional Fallback) */}
      <PerformanceHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        currentInterviewId={report?.interview_id || interviewId}
        onSelectSession={handleSelectHistoricalSession}
        onStartNewSession={onReset}
      />
    </div>
  );
};

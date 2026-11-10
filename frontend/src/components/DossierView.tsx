import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  ShieldAlert,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { interviewsApi } from '../lib/api';
import { useInterviewStore } from '../stores/interviewStore';
import type {
  AssessmentReportRead,
  ClaimVerificationRead,
  ClaimVerificationStatus,
  CompetencyScoreRead,
  EvidenceType,
} from '../types';

interface DossierViewProps {
  onReset: () => void;
}

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
              stroke="#334155"
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
                stroke="#334155"
                strokeWidth="1"
              />
            );
          })}

          {/* Filled Candidate Competency Shape */}
          <polygon
            points={polygonPoints}
            fill="rgba(99, 102, 241, 0.35)"
            stroke="#818cf8"
            strokeWidth="2.5"
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
                fill="#cbd5e1"
                fontSize="10"
                fontWeight="600"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {item.competency_name.length > 14
                  ? `${item.competency_name.slice(0, 12)}…`
                  : item.competency_name}
              </text>
            );
          })}
        </svg>
        <span className="mt-3 text-[11px] text-slate-400">Competency Mastery Distribution (L1 - L4)</span>
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

          {/* Circular Score Ring Gauge */}
          <ScoreRingGauge score={overallRating} tier={ratingTier} />
        </div>
      </div>

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
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-5 shadow-sm">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Observed Technical Strengths
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-emerald-200 font-sans">
              {report.strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1 font-mono">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-5 shadow-sm">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" /> Technical Gaps &amp; Targeted Practice
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-amber-200 font-sans">
              {report.knowledge_gaps.map((g, idx) => (
                <li
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-900/40"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5 font-mono">•</span>
                    <span>{g}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onReset}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-zinc-950 font-semibold px-2.5 py-1 text-[11px] transition-colors shadow-sm self-start sm:self-auto"
                  >
                    <Zap className="h-3 w-3" />
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
                    <p className="text-xs text-zinc-300 leading-relaxed font-sans">{cs.rationale}</p>

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
                            <span className="text-[10px] text-zinc-500">
                              Confidence: {Math.round(ev.confidence * 100)}%
                            </span>
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
    </div>
  );
};

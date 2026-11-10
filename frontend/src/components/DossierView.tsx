import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
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

export const DossierView: React.FC<DossierViewProps> = ({ onReset }) => {
  const { interviewId } = useInterviewStore();
  const [report, setReport] = useState<AssessmentReportRead | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCompId, setExpandedCompId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let pollCount = 0;

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
          setTimeout(fetchOrPollReport, 2500);
        } else if (isMounted) {
          setError('Evaluation report compilation is still pending. Please refresh in a moment.');
          setIsLoading(false);
        }
      }
    }

    fetchOrPollReport();
    return () => {
      isMounted = false;
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
      <div className="flex flex-col items-center justify-center p-4">
        <svg width={size} height={size} className="overflow-visible">
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
        return <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-800">Positive Mastery</span>;
      case 'KNOWLEDGE_GAP':
        return <span className="rounded bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-800">Knowledge Gap</span>;
      case 'CONTRADICTION':
        return <span className="rounded bg-rose-950 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-800">Contradiction</span>;
      case 'SUPERFICIAL_EXPLANATION':
        return <span className="rounded bg-indigo-950 px-2 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-800">Superficial</span>;
    }
  };

  const getClaimStatusBadge = (status: ClaimVerificationStatus) => {
    switch (status) {
      case 'VERIFIED':
        return <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-800">VERIFIED</span>;
      case 'CONTRADICTED':
        return <span className="rounded-full bg-rose-950 px-2.5 py-0.5 text-xs font-bold text-rose-400 border border-rose-800">CONTRADICTED</span>;
      case 'VAGUE':
        return <span className="rounded-full bg-amber-950 px-2.5 py-0.5 text-xs font-bold text-amber-400 border border-amber-800">VAGUE</span>;
      case 'UNTESTED':
        return <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-400 border border-slate-700">UNTESTED</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-500 mb-4" />
        <h2 className="text-xl font-bold text-white">Synthesizing Assessment Dossier</h2>
        <p className="mt-2 text-sm text-slate-400 max-w-md">
          Grounding scores with character-offset transcript evidence citations and auditing resume claims...
        </p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="mx-auto max-w-xl py-16 px-4 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-amber-400 mb-4" />
        <h2 className="text-lg font-bold text-white">{error || 'No report found.'}</h2>
        <button
          onClick={onReset}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-500"
        >
          <RotateCcw className="h-4 w-4" /> Start New Session
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
      <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/40 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-950/80 border border-indigo-800/60 px-3 py-1 text-xs font-semibold text-indigo-300">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              Technical Assessment Dossier (v{report.version})
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Candidate Competency Grounding
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
          </div>

          {/* Rating Badge */}
          <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-950/80 border border-slate-800 px-6 py-4 shadow-inner shrink-0 min-w-[180px]">
            <Award className="h-8 w-8 text-indigo-400 mb-1" />
            <div className="text-3xl font-black text-white">{overallRating.toFixed(1)} / 4.0</div>
            <span className="text-xs font-bold text-indigo-300 mt-0.5">{ratingTier}</span>
            <span className="text-[10px] text-slate-500 mt-1">Decoupled Rubric Engine</span>
          </div>
        </div>
      </div>

      {/* Middle Grid: Radar Chart + Strengths & Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Visualization */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-sm shadow-xl flex flex-col items-center justify-center">
          <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400 mb-2 flex items-center gap-1.5 self-start">
            <TrendingUp className="h-4 w-4" /> Competency Topology
          </h3>
          {renderRadarChart(report.competency_scores)}
        </div>

        {/* Strengths & Knowledge Gaps */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/20 p-5 shadow-lg">
            <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Observed Technical Strengths
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-emerald-100">
              {report.strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-amber-900/40 bg-amber-950/20 p-5 shadow-lg">
            <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" /> Technical Gaps & Risks
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-amber-100">
              {report.knowledge_gaps.map((g, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-400 mt-1">•</span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-5 shadow-lg">
            <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" /> Targeted Study Plan
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-indigo-100">
              {report.study_recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-1">→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Competency Evidence Grounding Cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-400" />
          Rubric Competency Grounding & Normalized Citations
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {report.competency_scores.map((cs) => {
            const isExpanded = expandedCompId === cs.competency_id;
            return (
              <div
                key={cs.competency_id}
                className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-md transition-all"
              >
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedCompId(isExpanded ? null : cs.competency_id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-indigo-950 border border-indigo-800/60 px-3 py-1 font-mono font-bold text-sm text-indigo-300">
                      {cs.score ? `L${cs.score}` : 'N/A'}
                    </span>
                    <div>
                      <h4 className="font-semibold text-slate-100 text-sm">{cs.competency_name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-1">{cs.rationale}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {cs.evidence_items.length} Grounded Excerpt{cs.evidence_items.length === 1 ? '' : 's'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Verbatim Citations */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-3 animate-in fade-in duration-200">
                    <p className="text-xs text-slate-300 leading-relaxed">{cs.rationale}</p>

                    <div className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Normalized Evidence Records (Turn & Offset Anchors)
                      </span>
                      {cs.evidence_items.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {getEvidenceBadge(ev.evidence_type)}
                              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 font-mono">
                                Turn #{ev.turn_index} [Offset {ev.start_char_offset}:{ev.end_char_offset}]
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500">
                              Confidence: {Math.round(ev.confidence * 100)}%
                            </span>
                          </div>

                          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5 font-mono text-[11px] text-indigo-200 italic">
                            "{ev.transcript_excerpt}"
                          </div>

                          <p className="text-slate-400 text-[11px]">{ev.rationale}</p>
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            Resume Claim Audit & Spoken Verification
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-3 font-semibold">Claim Statement</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Outcome</th>
                  <th className="pb-3 font-semibold">Auditor Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {report.claim_verifications.map((cl: ClaimVerificationRead) => (
                  <tr key={cl.claim_id}>
                    <td className="py-3 pr-4 font-medium text-slate-200 max-w-xs">{cl.claim_text}</td>
                    <td className="py-3 pr-4 text-slate-400 uppercase font-mono text-[10px]">{cl.category}</td>
                    <td className="py-3 pr-4">{getClaimStatusBadge(cl.status)}</td>
                    <td className="py-3 text-slate-400 max-w-sm">{cl.auditor_notes || '—'}</td>
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
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all active:scale-95"
        >
          <RotateCcw className="h-4 w-4" /> Start Another Technical Practice Session
        </button>
      </div>
    </div>
  );
};

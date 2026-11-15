import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Layers,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { interviewsApi } from '../lib/api';
import type { InterviewHistoryItemRead, InterviewHistoryResponse } from '../types';

interface PerformanceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInterviewId: string | null;
  onSelectSession: (interviewId: string) => void;
  onStartNewSession?: () => void;
}

export const PerformanceHistoryModal: React.FC<PerformanceHistoryModalProps> = ({
  isOpen,
  onClose,
  currentInterviewId,
  onSelectSession,
  onStartNewSession,
}) => {
  const [history, setHistory] = useState<InterviewHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    interviewsApi
      .listHistory()
      .then((data) => {
        if (isMounted) {
          setHistory(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Failed to load interview history:', err);
          setError('Could not retrieve interview progression history. Please try again.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsLoading(true);
    setError(null);
    onClose();
  };

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatDate = (isoString: string) => {
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
    if (!seconds) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Render SVG Trend Progression Chart for scored sessions
  const renderTrendChart = (items: InterviewHistoryItemRead[]) => {
    const scoredSessions = [...items]
      .filter((item) => item.overall_score !== null && item.overall_score !== undefined)
      .reverse(); // Chronological: oldest to newest

    if (scoredSessions.length < 2) {
      return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center text-xs font-mono text-zinc-400">
          Complete at least 2 practice sessions to activate your multi-session score trend analysis.
        </div>
      );
    }

    const width = 580;
    const height = 140;
    const padX = 40;
    const padY = 24;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    const points = scoredSessions.map((session, idx) => {
      const x = padX + (idx / (scoredSessions.length - 1)) * chartW;
      const score = session.overall_score || 0;
      // Scale: 1.0 (bottom) to 4.0 (top)
      const normalizedScore = Math.max(0, Math.min(3, score - 1.0));
      const y = padY + chartH - (normalizedScore / 3.0) * chartH;
      return { x, y, score, session, idx };
    });

    const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');

    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <TrendingUp className="h-3.5 w-3.5" /> Rubric Score Progression (1.0 → 4.0 Scale)
          </span>
          <span className="text-[11px] text-zinc-500">
            {scoredSessions.length} Assessed Sessions
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[500px]">
            {/* Horizontal Grid lines */}
            {[1.0, 2.0, 3.0, 4.0].map((level) => {
              const y = padY + chartH - ((level - 1.0) / 3.0) * chartH;
              return (
                <g key={level}>
                  <line
                    x1={padX}
                    y1={y}
                    x2={width - padX}
                    y2={y}
                    stroke="#27272a"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={padX - 8}
                    y={y + 3}
                    fill="#71717a"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {level.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* Area gradient under line */}
            <defs>
              <linearGradient id="scoreTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <polygon
              points={`${padX},${padY + chartH} ${polylineStr} ${points[points.length - 1].x},${padY + chartH}`}
              fill="url(#scoreTrendGrad)"
            />

            {/* Line */}
            <polyline
              points={polylineStr}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Points */}
            {points.map((p) => {
              const isSelected = p.session.id === currentInterviewId;
              return (
                <g key={p.session.id} className="cursor-pointer">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 6 : 4.5}
                    fill={isSelected ? '#34d399' : '#10b981'}
                    stroke="#09090b"
                    strokeWidth="2"
                  />
                  <text
                    x={p.x}
                    y={p.y - 10}
                    fill="#e4e4e7"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {p.score.toFixed(1)}
                  </text>
                  <text
                    x={p.x}
                    y={padY + chartH + 15}
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
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
    >
      <div className="relative w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-emerald-400 shadow-inner">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 id="history-modal-title" className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                Candidate Longitudinal Performance &amp; History
              </h2>
              <p className="text-xs text-zinc-400">
                Track your rubric scores, ATS alignment, and practice progression across sessions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            aria-label="Close history modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1">
          {isLoading && (
            <div className="flex h-48 flex-col items-center justify-center space-y-3">
              <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
              <p className="text-xs text-zinc-400 font-mono">Loading your interview track record...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-center space-y-2">
              <AlertCircle className="mx-auto h-6 w-6 text-amber-400" />
              <p className="text-xs text-amber-300 font-sans">{error}</p>
            </div>
          )}

          {!isLoading && !error && history && (
            <>
              {/* Top Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1 font-mono">
                  <span className="text-[11px] text-zinc-400">Total Sessions</span>
                  <div className="text-xl font-bold text-white flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-zinc-400" />
                    <span>{history.total_interviews}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 block">Dossiers Stored</span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1 font-mono">
                  <span className="text-[11px] text-zinc-400">Average Rubric</span>
                  <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-emerald-400" />
                    <span>{history.average_score !== null ? `${history.average_score} / 4.0` : '—'}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 block">Mean Across Sessions</span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1 font-mono">
                  <span className="text-[11px] text-zinc-400">Latest Rubric</span>
                  <div className="text-xl font-bold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-sky-400" />
                    <span>{history.latest_score !== null ? `${history.latest_score} / 4.0` : '—'}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 block">Most Recent Score</span>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1 font-mono">
                  <span className="text-[11px] text-zinc-400">Score Improvement</span>
                  <div className="text-xl font-bold flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <span
                      className={
                        (history.score_improvement_delta ?? 0) >= 0
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }
                    >
                      {history.score_improvement_delta !== null && history.score_improvement_delta !== undefined
                        ? `${history.score_improvement_delta >= 0 ? '+' : ''}${history.score_improvement_delta}`
                        : '—'}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 block">First vs Latest Delta</span>
                </div>
              </div>

              {/* Score Trend Visualizer */}
              {renderTrendChart(history.items)}

              {/* Historical Sessions List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-zinc-400" />
                    All Recorded Interview Dossiers ({history.items.length})
                  </h3>
                  {onStartNewSession && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onStartNewSession();
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" /> New Session
                    </button>
                  )}
                </div>

                {history.items.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 p-8 text-center text-xs text-zinc-500 font-mono">
                    No past interview sessions recorded yet. Complete an interview to see your reports here!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {history.items.map((item) => {
                      const isCurrentlyActive = item.id === currentInterviewId;
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                            isCurrentlyActive
                              ? 'border-emerald-800/80 bg-emerald-950/20 shadow-sm'
                              : 'border-zinc-800/90 bg-zinc-900/40 hover:border-zinc-700'
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-300">
                                {item.target_seniority}
                              </span>
                              <span className="font-semibold text-sm text-white font-sans">
                                {item.role_title || 'General Engineering'}
                              </span>
                              {isCurrentlyActive && (
                                <span className="rounded-full bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-[10px] font-mono text-emerald-400 font-semibold">
                                  Currently Viewing
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono text-[11px]">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-zinc-500" />
                                {formatDate(item.created_at)}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-zinc-500" />
                                {formatDuration(item.actual_duration_seconds)}
                              </span>
                              <span>•</span>
                              <span>{item.total_turns} Turns</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            {/* Score pills */}
                            <div className="flex items-center gap-2">
                              {item.overall_score !== null && item.overall_score !== undefined ? (
                                <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1 text-right font-mono">
                                  <div className="text-xs font-bold text-emerald-400">
                                    {item.overall_score.toFixed(1)} / 4.0
                                  </div>
                                  <div className="text-[9px] text-zinc-500">Rubric</div>
                                </div>
                              ) : (
                                <span className="rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-[10px] font-mono text-zinc-500">
                                  In Progress
                                </span>
                              )}

                              {item.ats_score !== null && item.ats_score !== undefined && (
                                <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1 text-right font-mono hidden md:block">
                                  <div className="text-xs font-bold text-indigo-400">
                                    {Math.round(item.ats_score)}%
                                  </div>
                                  <div className="text-[9px] text-zinc-500">ATS</div>
                                </div>
                              )}
                            </div>

                            {/* Select button */}
                            <button
                              type="button"
                              onClick={() => {
                                onSelectSession(item.id);
                                onClose();
                              }}
                              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
                                isCurrentlyActive
                                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                  : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold'
                              }`}
                            >
                              <span>{isCurrentlyActive ? 'Viewing' : 'View Dossier'}</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-4 text-xs font-mono text-zinc-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Zero-Biometrics &amp; Durably Grounded
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

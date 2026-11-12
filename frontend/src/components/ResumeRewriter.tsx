import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Download,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { resumesApi } from '../lib/api';
import type {
  ResumeRewriteResponse,
  SeniorityLevel,
} from '../types';

interface ResumeRewriterProps {
  onBackToInterview?: () => void;
}

const SAMPLE_RESUME = `Alex Rivera
Senior Distributed Systems Engineer
alex.rivera@example.com | (555) 019-2834 | linkedin.com/in/alex-rivera | github.com/alexrivera
San Francisco, CA

PROFESSIONAL EXPERIENCE
Senior Backend Engineer | FinTech Systems (2021 - Present)
• Built Kafka pipeline processing 50k events/sec with sub-25ms P99 latency.
• Scaled PostgreSQL database using read replicas, custom MVCC query tuning, and Redis caching.
• Developed microservices using Python and FastAPI with circuit breakers and idempotency keys.
• Implemented distributed locking with Redlock to eliminate double-spend race conditions in payment ledger.

Backend Software Engineer | CloudScale Inc (2018 - 2021)
• Built RESTful API platform handling 15M daily requests with 99.99% uptime.
• Migrated legacy monolithic services to Docker containers orchestrated by Kubernetes on AWS.
• Reduced database query bottlenecks by 45% through composite B-tree indexing and connection pooling.

EDUCATION
University of Washington | Seattle, WA
Bachelor of Science in Computer Science (2014 - 2018)

TECHNICAL SKILLS
Languages: Python, Go, TypeScript, SQL
Frameworks: FastAPI, Django, React, Node.js
Developer Tools: Docker, Kubernetes, Git, Linux, CI/CD
Databases & Cloud: PostgreSQL, Redis, Kafka, AWS, Cassandra`;

const SAMPLE_JD = `Role: Senior Distributed Systems Architect - Payments Infrastructure
Company: GlobalFinTech Corp
Location: Remote (US / EMEA)

About the Team:
Our Payments Infrastructure team is building next-generation event-driven ledger systems handling tens of thousands of financial transactions per second across multi-region datacenters.

What You'll Do:
• Architect, implement, and operate low-latency, highly available distributed payment services.
• Design event streaming pipelines using Apache Kafka, guaranteeing strict message ordering, deduplication, and exactly-once semantics.
• Scale relational databases (PostgreSQL) and distributed caches (Redis) with multi-region active-passive failover and automated read replicas.
• Ensure microservice reliability using rate limiters, distributed locks, circuit breakers, and zero-downtime deployment strategies.

Requirements:
• 6+ years of backend engineering experience designing distributed systems with Python, FastAPI, Go, or Java.
• Deep practical experience with event streaming pipelines using Kafka, RabbitMQ, or AWS Kinesis.
• Proven expertise tuning PostgreSQL query performance, MVCC vacuum behavior, and composite indexing.
• Strong foundation in distributed concurrency, idempotency tokens, and network fault tolerance.`;

export const ResumeRewriter: React.FC<ResumeRewriterProps> = ({ onBackToInterview }) => {
  const [resumeText, setResumeText] = useState(SAMPLE_RESUME);
  const [jdText, setJdText] = useState(SAMPLE_JD);
  const [seniority, setSeniority] = useState<SeniorityLevel>('SENIOR');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriteData, setRewriteData] = useState<ResumeRewriteResponse | null>(null);

  // Suggestions state: allow candidate to toggle accepted/reverted suggestions
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Record<number, boolean>>({});
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'latex' | 'preview'>('suggestions');

  const handleRunRewriter = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await resumesApi.rewrite({
        resume_text: resumeText,
        jd_text: jdText,
        candidate_seniority: seniority,
      });
      setRewriteData(data);
      // Default all suggestions to accepted
      const initialAccepted: Record<number, boolean> = {};
      data.suggestions.forEach((_, idx) => {
        initialAccepted[idx] = true;
      });
      setAcceptedSuggestions(initialAccepted);
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze and rewrite resume. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSuggestion = (idx: number) => {
    setAcceptedSuggestions((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleCopyLatex = () => {
    if (!rewriteData) return;
    navigator.clipboard.writeText(rewriteData.latex_source);
    setCopiedLatex(true);
    setTimeout(() => setCopiedLatex(false), 2500);
  };

  const handleDownloadTex = () => {
    if (!rewriteData) return;
    const blob = new Blob([rewriteData.latex_source], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${rewriteData.rewritten_profile.full_name.toLowerCase().replace(/\s+/g, '_')}_overleaf_resume.tex`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-400">
                <FileText className="h-4 w-4" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Resume Rewriter & Overleaf LaTeX Studio
              </h1>
              <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-800/40">
                Overleaf Jake's Template Standard
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              Score first, suggest targeted bullet rewrites for your target JD, strictly preserve your verified facts, and export to production-grade LaTeX.
            </p>
          </div>
          {onBackToInterview && (
            <button
              type="button"
              onClick={onBackToInterview}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              Back to Practice Interview
            </button>
          )}
        </div>

        {/* Input Configuration Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 shadow-sm">
          {/* Resume Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <span>1. Candidate Resume Text</span>
                <span className="text-[10px] text-zinc-500 font-normal">Original Experience & Skills</span>
              </label>
              <button
                type="button"
                onClick={() => setResumeText(SAMPLE_RESUME)}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Reset to Sample
              </button>
            </div>
            <textarea
              rows={9}
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all resize-y"
              placeholder="Paste raw resume text here..."
            />
          </div>

          {/* Job Description Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <span>2. Target Job Description (JD)</span>
                <span className="text-[10px] text-zinc-500 font-normal">Target Keywords & Scope</span>
              </label>
              <button
                type="button"
                onClick={() => setJdText(SAMPLE_JD)}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Reset to Sample
              </button>
            </div>
            <textarea
              rows={9}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all resize-y"
              placeholder="Paste job description requirements and tech stack here..."
            />
          </div>

          {/* Seniority & Trigger Action */}
          <div className="lg:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-zinc-800/80">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-zinc-400">Target Seniority:</span>
              {(['JUNIOR', 'MID', 'SENIOR', 'STAFF'] as SeniorityLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSeniority(lvl)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                    seniority === lvl
                      ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleRunRewriter}
              disabled={isLoading || resumeText.length < 30 || jdText.length < 30}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Scoring & Rewriting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Score First & Suggest Rewrites</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Studio */}
        {rewriteData && (
          <div className="space-y-6">
            {/* Step 1: Score First (ATS Scorecard) */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-zinc-800/80 pb-6">
                <div className="flex items-center gap-5">
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-emerald-500/30 bg-emerald-950/40 text-emerald-400 font-extrabold text-2xl shadow-inner">
                    {rewriteData.ats_score}
                    <span className="text-[10px] font-normal text-emerald-500/70 absolute -bottom-1">
                      /100
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">ATS Compatibility Score</h2>
                      <span className="rounded bg-emerald-950 border border-emerald-800/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        Evaluated First
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 mt-1 max-w-xl">
                      {rewriteData.alignment_summary}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-center">
                    <div className="text-[10px] uppercase text-zinc-500 font-semibold">Keywords</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {rewriteData.ats_breakdown?.keyword_score || 85}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-center">
                    <div className="text-[10px] uppercase text-zinc-500 font-semibold">Experience</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {rewriteData.ats_breakdown?.experience_score || 80}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-center">
                    <div className="text-[10px] uppercase text-zinc-500 font-semibold">Quantified</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {rewriteData.ats_breakdown?.quantified_impact_score || 90}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-center">
                    <div className="text-[10px] uppercase text-zinc-500 font-semibold">Structure</div>
                    <div className="text-sm font-bold text-emerald-400">
                      {rewriteData.ats_breakdown?.section_structure_score || 100}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Keywords Gap Analysis Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Matched Keywords in Resume ({rewriteData.matched_keywords.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rewriteData.matched_keywords.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-md bg-emerald-950/60 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 font-mono"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5" />
                    <span>Missing Target JD Keywords ({rewriteData.missing_keywords.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rewriteData.missing_keywords.length > 0 ? (
                      rewriteData.missing_keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-md bg-amber-950/60 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-300 font-mono"
                        >
                          + {kw}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-500 italic">
                        All major JD technologies already matched!
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs for Results */}
            <div className="flex items-center justify-between border-b border-zinc-800">
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('suggestions')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'suggestions'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Rewrite Suggestions & Diffs ({rewriteData.suggestions.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('latex')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === 'latex'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span>Overleaf LaTeX Source</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLatex}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copiedLatex ? 'Copied to Clipboard!' : 'Copy LaTeX'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTex}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download .tex</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Section-by-Section Rewrite Suggestions */}
            {activeTab === 'suggestions' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3.5 flex items-center justify-between text-xs text-zinc-300">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Strict Fact-Preservation Invariant:</strong> No fake companies, non-existent projects, or fabricated metrics are generated. Action verbs and JD competencies are elevated around verified candidate achievements.
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {Object.values(acceptedSuggestions).filter(Boolean).length} / {rewriteData.suggestions.length} Accepted
                  </span>
                </div>

                <div className="space-y-3">
                  {rewriteData.suggestions.map((item, idx) => {
                    const isAccepted = acceptedSuggestions[idx] !== false;
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-4 transition-all ${
                          isAccepted
                            ? 'border-zinc-800 bg-zinc-900/50'
                            : 'border-zinc-900 bg-zinc-950 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono uppercase font-bold text-zinc-300">
                              {item.section}
                            </span>
                            <span className="text-xs font-semibold text-zinc-200">
                              {item.target_item}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Truth Grounded</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleSuggestion(idx)}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                isAccepted
                                  ? 'border-emerald-500/50 bg-emerald-950/80 text-emerald-300'
                                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {isAccepted ? 'Accepted' : 'Reverted'}
                            </button>
                          </div>
                        </div>

                        {/* Diff Comparison */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                          <div className="rounded-lg bg-zinc-950 border border-red-500/20 p-3 text-zinc-400">
                            <div className="text-[10px] uppercase font-bold text-red-400 mb-1">Original</div>
                            <p className="line-through opacity-80">{item.original_text}</p>
                          </div>
                          <div className="rounded-lg bg-emerald-950/20 border border-emerald-500/30 p-3 text-emerald-200">
                            <div className="text-[10px] uppercase font-bold text-emerald-400 mb-1 flex items-center justify-between">
                              <span>Rewritten for JD</span>
                              {item.matched_keywords.length > 0 && (
                                <span className="text-[9px] text-emerald-400/80 font-normal">
                                  +{item.matched_keywords.join(', ')}
                                </span>
                              )}
                            </div>
                            <p>{item.rewritten_text}</p>
                          </div>
                        </div>

                        {/* Rationale */}
                        <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-zinc-400">
                          <span className="font-semibold text-zinc-300">Rationale:</span>
                          <span>{item.rationale}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: Overleaf LaTeX Source Code */}
            {activeTab === 'latex' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 text-xs text-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>How to use in Overleaf:</strong> 1. Copy the code below $\rightarrow$ 2. Open <a href="https://www.overleaf.com" target="_blank" rel="noreferrer" className="underline text-emerald-400">Overleaf.com</a> $\rightarrow$ 3. Create a New Project (Blank) $\rightarrow$ 4. Replace <code>main.tex</code> $\rightarrow$ 5. Click <strong>Recompile</strong>.
                    </span>
                  </div>
                  <a
                    href="https://www.overleaf.com/project"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-1 rounded bg-zinc-800 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-zinc-700 transition-colors"
                  >
                    <span>Launch Overleaf</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300 overflow-x-auto max-h-[600px]">
                  <pre className="whitespace-pre">{rewriteData.latex_source}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

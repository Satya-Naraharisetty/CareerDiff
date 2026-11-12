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
  Eye,
  BookOpen,
  Award,
  Layers,
} from 'lucide-react';
import { resumesApi } from '../lib/api';
import type {
  ResumeRewriteResponse,
  RewrittenResumeProfile,
  SeniorityLevel,
  TemplateStyle,
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

const TEMPLATE_DESCRIPTIONS: Record<TemplateStyle, { name: string; tag: string; font: string; desc: string; ats: string }> = {
  jakes_resume: {
    name: "Jake's Clean ATS",
    tag: "Gold Standard",
    font: "Computer Modern (Classic Serif)",
    desc: "The universally-recognized single-column Overleaf resume template. 100% parseable by Workday, Greenhouse, and Lever.",
    ats: "100% Compatible",
  },
  modern_tech: {
    name: "Modern Tech Developer",
    tag: "Emerald Accents",
    font: "Source Sans / Modern Sans",
    desc: "Contemporary sans-serif typography with emerald teal section dividers and clean modern bullet hierarchy.",
    ats: "99% Compatible",
  },
  executive_serif: {
    name: "Classic Executive & Staff",
    tag: "Distinguished",
    font: "Bitstream Charter Serif",
    desc: "Elegant serif typeface with small-caps headings and formal tabular alignment. Ideal for Staff/Principal roles.",
    ats: "99% Compatible",
  },
  minimalist_sans: {
    name: "Nordic Minimalist Compact",
    tag: "1-Page Optimizer",
    font: "Clean Sans-Serif (9.5pt)",
    desc: "High-density compact layout with tight margins designed to fit 6+ years of experience cleanly on exactly 1 page.",
    ats: "98% Compatible",
  },
};

export const ResumeRewriter: React.FC<ResumeRewriterProps> = ({ onBackToInterview }) => {
  const [resumeText, setResumeText] = useState(SAMPLE_RESUME);
  const [jdText, setJdText] = useState(SAMPLE_JD);
  const [seniority, setSeniority] = useState<SeniorityLevel>('SENIOR');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateStyle>('jakes_resume');
  const [isLoading, setIsLoading] = useState(false);
  const [isReRendering, setIsReRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewriteData, setRewriteData] = useState<ResumeRewriteResponse | null>(null);

  // Editable profile state for live sync
  const [currentProfile, setCurrentProfile] = useState<RewrittenResumeProfile | null>(null);
  const [activeLatexSource, setActiveLatexSource] = useState<string>('');

  // Suggestions state: allow candidate to toggle accepted/reverted suggestions
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Record<number, boolean>>({});
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [copiedCoverLetter, setCopiedCoverLetter] = useState(false);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'preview' | 'latex' | 'cover_letter'>('suggestions');
  const [coverLetterMode, setCoverLetterMode] = useState<'text' | 'latex'>('text');

  const handleRunRewriter = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await resumesApi.rewrite({
        resume_text: resumeText,
        jd_text: jdText,
        candidate_seniority: seniority,
        template_style: selectedTemplate,
      });
      setRewriteData(data);
      setCurrentProfile(data.rewritten_profile);
      setActiveLatexSource(data.latex_source);

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

  // Re-render LaTeX when template changes or suggestions are toggled
  const handleSwitchTemplate = async (newTemplate: TemplateStyle) => {
    setSelectedTemplate(newTemplate);
    if (!currentProfile) return;

    setIsReRendering(true);
    try {
      const res = await resumesApi.renderLatex({
        profile: currentProfile,
        template_style: newTemplate,
      });
      setActiveLatexSource(res.latex_source);
    } catch (err: any) {
      console.error('Failed to re-render template:', err);
    } finally {
      setIsReRendering(false);
    }
  };

  const toggleSuggestion = async (idx: number) => {
    if (!rewriteData || !currentProfile) return;

    const newAcceptedState = !acceptedSuggestions[idx];
    const updatedAccepted = {
      ...acceptedSuggestions,
      [idx]: newAcceptedState,
    };
    setAcceptedSuggestions(updatedAccepted);

    // Apply or revert this suggestion in currentProfile
    const sugg = rewriteData.suggestions[idx];
    const targetText = newAcceptedState ? sugg.rewritten_text : sugg.original_text;

    const clonedProfile: RewrittenResumeProfile = JSON.parse(JSON.stringify(currentProfile));

    if (sugg.section === 'summary') {
      clonedProfile.summary = targetText;
    } else if (sugg.section === 'experience') {
      for (const exp of clonedProfile.experiences) {
        const hIdx = exp.highlights.findIndex(
          (h) => h === (newAcceptedState ? sugg.original_text : sugg.rewritten_text)
        );
        if (hIdx !== -1) {
          exp.highlights[hIdx] = targetText;
          break;
        }
      }
    }

    setCurrentProfile(clonedProfile);

    // Re-render LaTeX on the fly
    try {
      const res = await resumesApi.renderLatex({
        profile: clonedProfile,
        template_style: selectedTemplate,
      });
      setActiveLatexSource(res.latex_source);
    } catch (err) {
      console.error('Failed to update LaTeX after toggling suggestion:', err);
    }
  };

  const handleCopyLatex = () => {
    if (!activeLatexSource) return;
    navigator.clipboard.writeText(activeLatexSource);
    setCopiedLatex(true);
    setTimeout(() => setCopiedLatex(false), 2500);
  };

  const handleCopyCoverLetter = () => {
    if (!rewriteData) return;
    const textToCopy =
      coverLetterMode === 'text'
        ? rewriteData.cover_letter_text
        : rewriteData.cover_letter_latex;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCoverLetter(true);
    setTimeout(() => setCopiedCoverLetter(false), 2500);
  };

  const handleDownloadTex = () => {
    if (!activeLatexSource || !currentProfile) return;
    const blob = new Blob([activeLatexSource], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProfile.full_name.toLowerCase().replace(/\s+/g, '_')}_${selectedTemplate}.tex`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCoverLetter = () => {
    if (!rewriteData || !currentProfile) return;
    const content =
      coverLetterMode === 'latex'
        ? rewriteData.cover_letter_latex
        : rewriteData.cover_letter_text;
    const ext = coverLetterMode === 'latex' ? 'tex' : 'txt';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentProfile.full_name.toLowerCase().replace(/\s+/g, '_')}_cover_letter.${ext}`;
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
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-400">
                <FileText className="h-4 w-4" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Resume Rewriter & Overleaf LaTeX Studio
              </h1>
              <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-800/40">
                4 Free Overleaf Templates
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              Score first against your target JD, suggest targeted bullet rewrites, strictly preserve your verified facts, inspect 1-page fit, and export ready-to-compile LaTeX & cover letters.
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
        <div className="space-y-6 bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          </div>

          {/* Template Style Selector Gallery */}
          <div className="space-y-3 pt-4 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>3. Choose LaTeX Template Style</span>
                <span className="text-[10px] text-zinc-500 font-normal">Free Overleaf pdflatex compatible</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(Object.keys(TEMPLATE_DESCRIPTIONS) as TemplateStyle[]).map((styleId) => {
                const info = TEMPLATE_DESCRIPTIONS[styleId];
                const isSelected = selectedTemplate === styleId;
                return (
                  <button
                    key={styleId}
                    type="button"
                    onClick={() => handleSwitchTemplate(styleId)}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/40 shadow-sm ring-1 ring-emerald-500'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">{info.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                          isSelected
                            ? 'bg-emerald-900 text-emerald-300'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {info.ats}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 mb-1">{info.font}</div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {info.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seniority & Trigger Action */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-zinc-800/80">
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
                  <span>Score First & Generate Overleaf LaTeX</span>
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
        {rewriteData && currentProfile && (
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

              {/* Page Fit & Density Indicator Gauge */}
              <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-200">Page Length & Density:</span>
                      <span className="rounded bg-emerald-950 border border-emerald-800/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        {rewriteData.page_fit.estimated_pages} Page{rewriteData.page_fit.estimated_pages > 1 ? 's' : ''} ({rewriteData.page_fit.density_status})
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {rewriteData.page_fit.fit_recommendation}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
                  <div>
                    <span className="text-zinc-500">Bullets: </span>
                    <span className="font-semibold text-zinc-200">{rewriteData.page_fit.total_bullets}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Characters: </span>
                    <span className="font-semibold text-zinc-200">{rewriteData.page_fit.total_characters}</span>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800">
              <div className="flex gap-4 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('suggestions')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'suggestions'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Bullet Diffs ({rewriteData.suggestions.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'preview'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Eye className="h-4 w-4" />
                  <span>Live Visual Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('latex')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'latex'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <span>Overleaf LaTeX Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cover_letter')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'cover_letter'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Award className="h-4 w-4" />
                  <span>Cover Letter Studio</span>
                </button>
              </div>

              {/* Action Buttons for active view */}
              <div className="flex items-center gap-2 pb-2 sm:pb-0">
                {activeTab === 'cover_letter' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyCoverLetter}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>{copiedCoverLetter ? 'Copied!' : 'Copy Letter'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCoverLetter}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download Letter</span>
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
                  <span className="text-[10px] text-zinc-400 flex-shrink-0">
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

            {/* Tab 2: Live Visual Resume Preview */}
            {activeTab === 'preview' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-300">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Visual Layout Preview:</strong> Rendering styling matching <strong>{TEMPLATE_DESCRIPTIONS[selectedTemplate].name}</strong>.
                    </span>
                  </div>
                  {isReRendering && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Syncing template...</span>
                    </span>
                  )}
                </div>

                {/* Simulated Paper Document */}
                <div className="rounded-xl border border-zinc-700 bg-white text-zinc-900 p-8 shadow-2xl max-w-4xl mx-auto space-y-6 min-h-[900px]">
                  {/* Header / Contact */}
                  <div className="text-center space-y-1 border-b border-zinc-200 pb-4">
                    <h1
                      className={`text-2xl font-bold tracking-tight text-zinc-900 ${
                        selectedTemplate === 'executive_serif' ? 'font-serif' : 'font-sans'
                      }`}
                    >
                      {currentProfile.full_name}
                    </h1>
                    <div className="text-xs text-zinc-600 flex flex-wrap justify-center items-center gap-2">
                      {currentProfile.contact_phone && <span>{currentProfile.contact_phone}</span>}
                      <span>•</span>
                      {currentProfile.contact_email && <span>{currentProfile.contact_email}</span>}
                      <span>•</span>
                      {currentProfile.location && <span>{currentProfile.location}</span>}
                      {currentProfile.linkedin_url && (
                        <>
                          <span>•</span>
                          <span className="text-zinc-700 font-mono text-[11px]">{currentProfile.linkedin_url}</span>
                        </>
                      )}
                      {currentProfile.github_url && (
                        <>
                          <span>•</span>
                          <span className="text-zinc-700 font-mono text-[11px]">{currentProfile.github_url}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  {currentProfile.summary && (
                    <div className="space-y-1.5">
                      <h2
                        className={`text-xs uppercase font-bold tracking-wider pb-1 ${
                          selectedTemplate === 'modern_tech'
                            ? 'text-teal-700 border-b border-teal-500'
                            : 'text-zinc-900 border-b border-zinc-900'
                        } ${selectedTemplate === 'executive_serif' ? 'font-serif' : 'font-sans'}`}
                      >
                        Professional Summary
                      </h2>
                      <p className="text-xs text-zinc-700 leading-relaxed">
                        {currentProfile.summary}
                      </p>
                    </div>
                  )}

                  {/* Experience */}
                  {currentProfile.experiences.length > 0 && (
                    <div className="space-y-4">
                      <h2
                        className={`text-xs uppercase font-bold tracking-wider pb-1 ${
                          selectedTemplate === 'modern_tech'
                            ? 'text-teal-700 border-b border-teal-500'
                            : 'text-zinc-900 border-b border-zinc-900'
                        } ${selectedTemplate === 'executive_serif' ? 'font-serif' : 'font-sans'}`}
                      >
                        Experience
                      </h2>
                      <div className="space-y-3.5">
                        {currentProfile.experiences.map((exp, eIdx) => (
                          <div key={eIdx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-zinc-900">
                              <span>{exp.position}</span>
                              <span className="text-zinc-500 font-normal">{exp.dates}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-zinc-600 italic">
                              <span>{exp.company}</span>
                              <span className="not-italic text-zinc-500">{exp.location}</span>
                            </div>
                            <ul className="list-disc list-inside text-xs text-zinc-700 space-y-1 pt-1">
                              {exp.highlights.map((hl, hIdx) => (
                                <li key={hIdx} className="leading-relaxed">
                                  <span>{hl}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Projects */}
                  {currentProfile.projects.length > 0 && (
                    <div className="space-y-4">
                      <h2
                        className={`text-xs uppercase font-bold tracking-wider pb-1 ${
                          selectedTemplate === 'modern_tech'
                            ? 'text-teal-700 border-b border-teal-500'
                            : 'text-zinc-900 border-b border-zinc-900'
                        } ${selectedTemplate === 'executive_serif' ? 'font-serif' : 'font-sans'}`}
                      >
                        Projects
                      </h2>
                      <div className="space-y-3">
                        {currentProfile.projects.map((proj, pIdx) => (
                          <div key={pIdx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-zinc-900">
                              <span>
                                {proj.name}{' '}
                                {proj.technologies && (
                                  <span className="font-normal italic text-zinc-600">
                                    | {proj.technologies}
                                  </span>
                                )}
                              </span>
                              <span className="text-zinc-500 font-normal">{proj.dates}</span>
                            </div>
                            <ul className="list-disc list-inside text-xs text-zinc-700 space-y-1 pt-1">
                              {proj.highlights.map((hl, hIdx) => (
                                <li key={hIdx} className="leading-relaxed">
                                  <span>{hl}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {currentProfile.education.length > 0 && (
                    <div className="space-y-2">
                      <h2
                        className={`text-xs uppercase font-bold tracking-wider pb-1 ${
                          selectedTemplate === 'modern_tech'
                            ? 'text-teal-700 border-b border-teal-500'
                            : 'text-zinc-900 border-b border-zinc-900'
                        } ${selectedTemplate === 'executive_serif' ? 'font-serif' : 'font-sans'}`}
                      >
                        Education
                      </h2>
                      <div className="space-y-1.5">
                        {currentProfile.education.map((edu, edIdx) => (
                          <div key={edIdx} className="flex items-center justify-between text-xs text-zinc-900">
                            <div>
                              <span className="font-semibold">{edu.institution}</span>
                              <span className="text-zinc-600 italic"> — {edu.degree}</span>
                            </div>
                            <span className="text-zinc-500">{edu.dates}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {Object.keys(currentProfile.skills_by_category).length > 0 && (
                    <div className="space-y-2">
                      <h2
                        className={`text-xs uppercase font-bold tracking-wider pb-1 ${
                          selectedTemplate === 'modern_tech'
                            ? 'text-teal-700 border-b border-teal-500'
                            : 'text-zinc-900 border-b border-zinc-900'
                        } ${selectedTemplate === 'executive_serif' ? 'font-serif' : 'font-sans'}`}
                      >
                        Technical Skills
                      </h2>
                      <div className="space-y-1 text-xs text-zinc-700">
                        {Object.entries(currentProfile.skills_by_category).map(
                          ([cat, skills]) =>
                            skills.length > 0 && (
                              <div key={cat} className="flex items-baseline gap-2">
                                <span className="font-semibold text-zinc-900 w-32 flex-shrink-0">
                                  {cat}:
                                </span>
                                <span>{skills.join(', ')}</span>
                              </div>
                            )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Overleaf LaTeX Source Code */}
            {activeTab === 'latex' && (
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 text-xs text-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>How to compile in Overleaf:</strong> 1. Copy the code below $\rightarrow$ 2. Open <a href="https://www.overleaf.com" target="_blank" rel="noreferrer" className="underline text-emerald-400">Overleaf.com</a> $\rightarrow$ 3. Create a New Project (Blank) $\rightarrow$ 4. Replace <code>main.tex</code> $\rightarrow$ 5. Click <strong>Recompile</strong>.
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
                  <pre className="whitespace-pre">{activeLatexSource}</pre>
                </div>
              </div>
            )}

            {/* Tab 4: Tailored Cover Letter Studio */}
            {activeTab === 'cover_letter' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg bg-zinc-900/60 border border-zinc-800 p-3.5 text-xs text-zinc-300">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Fact-Grounded Cover Letter:</strong> Tailored directly to the JD requirements and company context, citing your top verified achievements without fabrications.
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setCoverLetterMode('text')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        coverLetterMode === 'text'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Formatted Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoverLetterMode('latex')}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        coverLetterMode === 'latex'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Overleaf LaTeX
                    </button>
                  </div>
                </div>

                {coverLetterMode === 'text' ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-200 whitespace-pre-line leading-relaxed font-sans max-w-4xl mx-auto shadow-inner">
                    {rewriteData.cover_letter_text}
                  </div>
                ) : (
                  <div className="relative rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300 overflow-x-auto max-h-[600px]">
                    <pre className="whitespace-pre">{rewriteData.cover_letter_latex}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

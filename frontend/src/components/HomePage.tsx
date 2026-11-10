import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileCheck,
  GitBranch,
  Lock,
  Scale,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface HomePageProps {
  onGetStarted: () => void;
  onOpenAuth: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onGetStarted, onOpenAuth }) => {
  const { isAuthenticated } = useAuthStore();
  const [activePreviewTab, setActivePreviewTab] = useState<'interview' | 'provenance' | 'dossier'>('interview');
  const [wrapPreviewText, setWrapPreviewText] = useState(true);

  const handleAction = () => {
    if (isAuthenticated) {
      onGetStarted();
    } else {
      onOpenAuth();
    }
  };

  return (
    <div className="relative min-h-screen bg-zinc-950 text-zinc-100 selection:bg-zinc-800 selection:text-white">
      {/* Subtle Technical Dot Grid Background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-60" />

      <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:px-8 space-y-28">
        {/* Hero Section */}
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-xs font-mono text-zinc-300 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Engine v1.0 • Grounded Senior Practice</span>
          </div>

          {/* Clean High-Contrast Headline (No AI Gradient Slop) */}
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.12]">
            Technical interview practice,{' '}
            <span className="text-zinc-400">grounded in your real experience.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-zinc-400 leading-relaxed font-normal max-w-2xl mx-auto">
            Zero generic trivia. IntervueX indexes verified claims from your resume, calibrates against your target Job Description, and executes adaptive interviews controlled by deterministic state machine guardrails.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={handleAction}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-sm active:scale-[0.98]"
            >
              {isAuthenticated ? 'Enter Practice Workspace' : 'Start Technical Practice'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <a
              href="#architecture"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-5 py-3 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-all"
            >
              <Terminal className="h-3.5 w-3.5 text-zinc-400" />
              Engine Architecture
            </a>
          </div>

          {/* Trust Invariants */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Zero Biometrics Invariant
            </span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-zinc-400" /> GDPR Right to Erasure
            </span>
            <span className="text-zinc-600">•</span>
            <span className="flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-zinc-400" /> 4-Tier Normalized Rubrics
            </span>
          </div>
        </div>

        {/* Live Interactive Developer Workbench Preview */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-2xl backdrop-blur-sm overflow-hidden">
          {/* Workbench Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-zinc-800 px-3.5 sm:px-4 py-2.5 bg-zinc-950/80">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                </div>
                <span className="text-[11px] sm:text-xs font-mono text-zinc-400 truncate">
                  intervuex-session // alex-rivera-sr-backend
                </span>
              </div>

              {/* Mobile text wrap toggle button */}
              {(activePreviewTab === 'dossier' || activePreviewTab === 'provenance') && (
                <button
                  type="button"
                  onClick={() => setWrapPreviewText((prev) => !prev)}
                  title={wrapPreviewText ? 'Switch to horizontal scroll view' : 'Switch to wrapped text view'}
                  className="sm:hidden shrink-0 ml-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-white transition-colors"
                >
                  {wrapPreviewText ? 'Wrap: On' : 'Scroll: On'}
                </button>
              )}
            </div>

            {/* View Selector Tabs - Fully responsive on all mobile viewports */}
            <div className="w-full sm:w-auto touch-scroll-x no-scrollbar pb-0.5 sm:pb-0">
              <div className="flex sm:inline-flex items-center justify-between sm:justify-start gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('interview')}
                  className={`flex-1 sm:flex-initial text-center whitespace-nowrap px-2 sm:px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                    activePreviewTab === 'interview'
                      ? 'bg-zinc-800 text-white font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="sm:hidden">session.log</span>
                  <span className="hidden sm:inline">live_session.log</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('provenance')}
                  className={`flex-1 sm:flex-initial text-center whitespace-nowrap px-2 sm:px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                    activePreviewTab === 'provenance'
                      ? 'bg-zinc-800 text-white font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="sm:hidden">claims.json</span>
                  <span className="hidden sm:inline">claim_provenance.json</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewTab('dossier')}
                  className={`flex-1 sm:flex-initial text-center whitespace-nowrap px-2 sm:px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                    activePreviewTab === 'dossier'
                      ? 'bg-zinc-800 text-white font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="sm:hidden">dossier.yaml</span>
                  <span className="hidden sm:inline">rubric_dossier.yaml</span>
                </button>
              </div>
            </div>
          </div>

          {/* Workbench Body */}
          <div className="p-3.5 sm:p-6 font-mono text-xs">
            {activePreviewTab === 'interview' && (
              <div className="space-y-4">
                {/* State Machine Status Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80 text-[11px] text-zinc-400">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      FSM: IN_INTERVIEW
                    </span>
                    <span className="text-zinc-600 hidden sm:inline">|</span>
                    <span className="text-zinc-400">Track: Senior Distributed Systems</span>
                    <span className="text-zinc-600 hidden sm:inline">|</span>
                    <span className="text-zinc-300">Topic: Kafka Concurrency</span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="rounded bg-zinc-800/80 px-2 py-0.5 text-zinc-300 border border-zinc-700/60 text-[10px]">
                      Probe 2/3
                    </span>
                    <span className="text-zinc-400 text-[10px]">Latency: 412ms</span>
                  </div>
                </div>

                {/* Turn Stream */}
                <div className="space-y-3">
                  {/* Interviewer Turn */}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-indigo-400 font-semibold">[INTERVIEWER] Adaptive Action: DEEP_PROBE</span>
                      <span className="text-zinc-500">Turn #3</span>
                    </div>
                    <p className="text-zinc-200 leading-relaxed font-sans text-xs">
                      "Alex, on your resume you noted designing a Kafka pipeline handling 50k events/sec. When a consumer group rebalance occurs during a network partition, how did you prevent duplicate financial ledger writes before the rebalance completed?"
                    </p>
                  </div>

                  {/* Candidate Response */}
                  <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300 font-semibold">[CANDIDATE] Spoken PCM Audio (16kHz)</span>
                      <span className="text-zinc-500">Offset: 01:24</span>
                    </div>
                    <p className="text-zinc-300 leading-relaxed font-sans text-xs">
                      "We decoupled offset commits from database writes using transactional idempotency tokens in PostgreSQL. Each message carried a unique idempotency token stored in an outbox table with unique constraints, ensuring that replayed events during consumer rebalances were safely deduplicated at the storage layer rather than relying purely on Kafka consumer auto-commit."
                    </p>
                  </div>

                  {/* Grounded Evidence Tag */}
                  <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Verified Claim: "Kafka pipeline 50k events/sec with idempotency"</span>
                    </span>
                    <span className="text-zinc-400">
                      Evaluator Citation: Pos Mastery (Offset 48:192)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activePreviewTab === 'provenance' && (
              <div className="space-y-2 text-zinc-300">
                <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                  <span>// Extracted Character-Offset Provenance from Candidate Resume</span>
                  <button
                    type="button"
                    onClick={() => setWrapPreviewText((prev) => !prev)}
                    className="hidden sm:inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 font-mono transition-colors"
                  >
                    {wrapPreviewText ? 'Wrap: On' : 'Scroll: On'}
                  </button>
                </div>
                <div className={`rounded-lg bg-zinc-950/80 p-3 sm:p-4 border border-zinc-800/80 ${wrapPreviewText ? '' : 'touch-scroll-x'}`}>
                  <pre className={`text-[11px] leading-relaxed text-zinc-300 font-mono ${wrapPreviewText ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
{`{
  "provenance_id": "prov_89fa2bc",
  "document": "alex_rivera_resume.pdf",
  "detected_seniority": "SENIOR",
  "indexed_claims": [
    {
      "claim_id": "clm_01",
      "text": "Architected low-latency Kafka pipeline processing 50k events/sec with sub-25ms P99 latency",
      "character_offsets": { "start": 1420, "end": 1515 },
      "category": "DISTRIBUTED_SYSTEMS",
      "verification_priority": "CRITICAL"
    },
    {
      "claim_id": "clm_02",
      "text": "Scaled PostgreSQL database using read replicas, custom MVCC query tuning, and connection pooling",
      "character_offsets": { "start": 1520, "end": 1618 },
      "category": "DATABASE_STORAGE",
      "verification_priority": "HIGH"
    }
  ]
}`}
                  </pre>
                </div>
              </div>
            )}

            {activePreviewTab === 'dossier' && (
              <div className="space-y-2 text-zinc-300">
                <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                  <span>// Decoupled 4-Tier Rubric Evaluation Output (Post-Interview Worker)</span>
                  <button
                    type="button"
                    onClick={() => setWrapPreviewText((prev) => !prev)}
                    className="hidden sm:inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 font-mono transition-colors"
                  >
                    {wrapPreviewText ? 'Wrap: On' : 'Scroll: On'}
                  </button>
                </div>
                <div className={`rounded-lg bg-zinc-950/80 p-3 sm:p-4 border border-zinc-800/80 ${wrapPreviewText ? '' : 'touch-scroll-x'}`}>
                  <pre className={`text-[11px] leading-relaxed text-zinc-300 font-mono ${wrapPreviewText ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>
{`evaluation_report:
  overall_score: 3.8 / 4.0 (Staff / Senior Specialist)
  competency_scores:
    - name: "Distributed Systems & Event Streaming"
      rating: "L4_EXPERT"
      rationale: "Demonstrated deep understanding of Kafka consumer rebalance hazards and distributed idempotency tokens."
      evidence_citations:
        - turn: 3
          excerpt: "Each message carried a unique idempotency token stored in an outbox table..."
          evidence_type: "POSITIVE_MASTERY"
          confidence: 0.96
    - name: "Database Concurrency & Storage Architecture"
      rating: "L3_COMPETENT"
      rationale: "Articulated MVCC snapshot isolation and connection pooling tradeoffs clearly."`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The 4 Architectural Pillars (Bento Grid) */}
        <div id="architecture" className="space-y-8">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Architectural Invariants
            </h2>
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Built on deterministic systems engineering.
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400">
              How IntervueX eliminates hallucination and conversational drift.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pillar 1 */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-3 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
                <GitBranch className="h-4 w-4 text-zinc-400" />
                Deterministic State Machine Guardrails
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                The LLM conducts conversational turns, but the Python State Machine controls the interview. Probe saturation limits, topic transitions, and time budgets are deterministically enforced — eliminating chatbot drift.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 border-t border-zinc-800/80 pt-2">
                Turn Budget Enforcement • Max 3 Probes / Competency
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-3 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
                <FileCheck className="h-4 w-4 text-zinc-400" />
                Normalized Character-Offset Provenance
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Resumes are parsed and mapped into verified technical claims linked to exact character byte-offsets in the source document. Every deep inquiry is anchored directly in your real engineering history.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 border-t border-zinc-800/80 pt-2">
                Zero AI Fabrication • Verbatim Claim Cross-Examination
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-3 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
                <Cpu className="h-4 w-4 text-zinc-400" />
                Decoupled Assessment Evaluator
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Live speech turn interpretation (&le; 600ms) and rubric scoring are strictly decoupled. When the session concludes, a PostgreSQL transactional outbox worker scores competencies with normalized transcript citations.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 border-t border-zinc-800/80 pt-2">
                Transactional Outbox • Normalized Evidence Records
              </div>
            </div>

            {/* Pillar 4 */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-3 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
                <ShieldCheck className="h-4 w-4 text-zinc-400" />
                Strict Zero Biometrics Invariant
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                IntervueX strictly rejects video capture, gaze tracking, micro-expressions, vocal pitch, tone, or accents as proxies for competence. Candidates are evaluated exclusively on architectural reasoning and code depth.
              </p>
              <div className="text-[11px] font-mono text-zinc-500 border-t border-zinc-800/80 pt-2">
                Audio RAM-Only • Right to Erasure Cascade
              </div>
            </div>
          </div>
        </div>

        {/* Structured Comparison Ledger */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">System Comparison</h3>
            <p className="text-xs text-zinc-400">
              Why senior engineers practice with IntervueX instead of unstructured chat prompts.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 font-mono text-zinc-400 uppercase text-[11px]">
                  <th className="py-2.5 pr-4">Dimension</th>
                  <th className="py-2.5 pr-4 text-zinc-500">Generic Chatbots</th>
                  <th className="py-2.5 text-zinc-200">IntervueX Engine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                <tr>
                  <td className="py-3 pr-4 font-mono text-zinc-400">Session Guardrails</td>
                  <td className="py-3 pr-4 text-zinc-500">Unconstrained LLM loop; drifts off-topic and ends abruptly</td>
                  <td className="py-3 text-white font-medium">Deterministic state machine with probe budgets &amp; phase transitions</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-mono text-zinc-400">Resume Context</td>
                  <td className="py-3 pr-4 text-zinc-500">Superficial name-dropping or hallucinated work experience</td>
                  <td className="py-3 text-white font-medium">Character-offset claim index with targeted verification inquiries</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-mono text-zinc-400">Scoring Integrity</td>
                  <td className="py-3 pr-4 text-zinc-500">Subjective summary ("Good job, 8/10")</td>
                  <td className="py-3 text-white font-medium">Decoupled outbox worker linking scores to verbatim turn excerpts</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-mono text-zinc-400">Biometrics &amp; Bias</td>
                  <td className="py-3 pr-4 text-zinc-500">Facial tracking, gaze tracking, pitch/sentiment surveillance</td>
                  <td className="py-3 text-emerald-400 font-medium">Strict Zero Biometrics standard — architectural competence only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Minimalist Action Callout */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 sm:p-10 text-center space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Ready to test your distributed systems architecture?
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
            Ingest your real resume, paste a target Job Description, and start an adaptive practice session.
          </p>
          <div className="pt-2">
            <button
              onClick={handleAction}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-sm active:scale-[0.98]"
            >
              {isAuthenticated ? 'Enter Practice Workspace' : 'Get Started Free'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

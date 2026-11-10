import React from 'react';
import {
  ArrowRight,
  Code2,
  Compass,
  FileText,
  Lock,
  Radio,
  Scale,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface HomePageProps {
  onGetStarted: () => void;
  onOpenAuth: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onGetStarted, onOpenAuth }) => {
  const { isAuthenticated } = useAuthStore();

  const handleAction = () => {
    if (isAuthenticated) {
      onGetStarted();
    } else {
      onOpenAuth();
    }
  };

  return (
    <div className="relative overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* Background Decorative Gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[550px] w-[900px] rounded-full bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-transparent blur-3xl" />
        <div className="absolute top-1/2 right-[-100px] h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-10 left-[-100px] h-[450px] w-[450px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8 space-y-24">
        {/* Hero Section */}
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-950/80 border border-indigo-700/50 px-3.5 py-1 text-xs font-semibold text-indigo-300 shadow-inner">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Autonomous Technical Interview Simulator &amp; Decoupled Rubric Engine</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-[1.15]">
            Practice Senior Engineering Interviews{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-teal-300 bg-clip-text text-transparent">
              Tailored to Your Real Background.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal">
            No more generic chatbot questions. IntervueX parses your resume claims, calibrates against your target Job Description, and conducts adaptive voice &amp; text interviews governed by deterministic state machine guardrails.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={handleAction}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-indigo-600/25 hover:from-indigo-500 hover:to-purple-500 transition-all active:scale-[0.98]"
            >
              {isAuthenticated ? 'Enter Practice Workspace' : 'Start Free Technical Practice'}
              <ArrowRight className="h-4 w-4" />
            </button>

            <a
              href="#how-it-works"
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-6 py-3.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 hover:text-white transition-all"
            >
              <Compass className="h-4 w-4 text-indigo-400" />
              How It Works
            </a>
          </div>

          {/* Trust Guarantees */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Zero Biometrics Policy</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-indigo-400" />
              <span>Full Data Minimization &amp; GDPR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Scale className="h-4 w-4 text-teal-400" />
              <span>Decoupled 4-Tier Rubrics</span>
            </div>
          </div>
        </div>

        {/* 4-Step Interactive Pipeline Showcase */}
        <div id="how-it-works" className="space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              The IntervueX Engine
            </h2>
            <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              From Resume &amp; JD to High-Fidelity Simulation
            </h3>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Our 4-stage pipeline guarantees every probe and rating is grounded in your verified experience and role competencies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 hover:border-slate-700 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/40">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">Step 1</span>
                  <h4 className="text-base font-bold text-white">Resume Intelligence &amp; Claim Indexing</h4>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Upload your PDF, DOCX, or text resume. IntervueX extracts verified skills, seniority signals, and technical claims with exact character-offset provenance to prevent AI hallucinations.
              </p>
              <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 p-3 text-xs font-mono text-slate-400 space-y-1">
                <div className="text-emerald-400">✓ Parsed 13 Technical Claims with Offset Provenance</div>
                <div className="text-slate-400">• Claim #4: "Architected Kafka pipeline processing 50k events/sec"</div>
                <div className="text-slate-500">• Technology Grounding: Kafka, PostgreSQL, Redis, FastAPI</div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 hover:border-slate-700 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-950 text-purple-400 border border-purple-800/40">
                  <Code2 className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Step 2</span>
                  <h4 className="text-base font-bold text-white">Target Job Description Calibration</h4>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Paste any job description or select an engineering discipline. IntervueX analyzes requirements and synthesizes 4 tailored competencies with durable 4-tier rubric evaluation criteria in PostgreSQL.
              </p>
              <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 p-3 text-xs font-mono text-slate-400 space-y-1">
                <div className="text-purple-400">✓ Inferred Senior Distributed Systems Track</div>
                <div className="text-slate-400">• Competency 1: Distributed Systems &amp; Event Streaming (L1-L4)</div>
                <div className="text-slate-400">• Competency 2: Database Architecture &amp; MVCC Tuning (L1-L4)</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 hover:border-slate-700 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-950 text-teal-400 border border-teal-800/40">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider">Step 3</span>
                  <h4 className="text-base font-bold text-white">Adaptive Real-Time Interview Simulation</h4>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Choose Live Voice (16kHz PCM streaming) or Low-Latency Text Turn mode. The interview starts with a warm greeting acknowledging your role and experience, bridging into deep technical inquiry and claim verification.
              </p>
              <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 p-3 text-xs font-mono text-slate-400 space-y-1">
                <div className="text-teal-400">⚡ Engine Latency &le; 600ms • Dynamic Topic Advancement</div>
                <div className="text-slate-400">• Probing: Explores trade-offs, concurrency bugs, and scale limits</div>
                <div className="text-slate-500">• Claim Verification: Directly tests experiences claimed on resume</div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 hover:border-slate-700 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-950 text-amber-400 border border-amber-800/40">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Step 4</span>
                  <h4 className="text-base font-bold text-white">Decoupled Dossier &amp; Radar Scoring</h4>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                After concluding, a decoupled background evaluator scores each competency against the 4-tier rubrics, generating verbatim citations, a radar topology chart, and a prioritized study plan.
              </p>
              <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 p-3 text-xs font-mono text-slate-400 space-y-1">
                <div className="text-amber-400">📊 Full Evaluation Dossier with Verbatim Citations</div>
                <div className="text-slate-400">• Competency Topology: Radar Chart (L1 - L4 Rating)</div>
                <div className="text-slate-500">• Claim Audit: Verified vs. Untested Claim Ledger</div>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Section */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 sm:p-10 space-y-8">
          <div className="text-center space-y-2">
            <h3 className="text-xl sm:text-2xl font-bold text-white">
              Why Engineers Choose IntervueX Over Generic AI Bots
            </h3>
            <p className="text-xs sm:text-sm text-slate-400">
              Built on deterministic systems engineering principles, not unconstrained chatbot loops.
            </p>
          </div>

          {/* Mobile Comparison Cards (< sm) */}
          <div className="space-y-4 sm:hidden">
            {[
              {
                capability: 'Interview Control',
                engine: 'Deterministic state machine with time & probe guardrails',
                generic: 'Unconstrained LLM hallucinates topics and ends randomly',
              },
              {
                capability: 'Target Calibration',
                engine: 'Custom competencies and 4-tier rubrics synthesized from your JD',
                generic: 'Generic textbook questions (e.g. "Explain OOP")',
              },
              {
                capability: 'Resume Grounding',
                engine: 'Character-offset claim indexing with verbatim verification turns',
                generic: 'Ignored or superficial token mention',
              },
              {
                capability: 'Evaluation Integrity',
                engine: 'Decoupled outbox worker with normalized verbatim transcript citations',
                generic: 'Vague subjective summary ("Good job, 8/10")',
              },
              {
                capability: 'Privacy & Biometrics',
                engine: 'Strict Zero Biometrics Invariant — technical merit only',
                generic: 'Face tracking, pitch analysis, emotional scanning',
              },
            ].map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="text-xs font-bold text-white uppercase tracking-wider">{item.capability}</div>
                <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 p-3 text-xs space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">IntervueX Engine</span>
                  <p className="text-emerald-200">{item.engine}</p>
                </div>
                <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 text-xs space-y-1">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">Generic Chatbots</span>
                  <p className="text-slate-400">{item.generic}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Comparison Table (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Capability</th>
                  <th className="py-3 px-4 text-rose-400">Generic Chatbots</th>
                  <th className="py-3 px-4 text-emerald-400">IntervueX Engine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-3 px-4 font-medium text-white">Interview Control</td>
                  <td className="py-3 px-4 text-slate-400">Unconstrained LLM hallucinates topics and ends randomly</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Deterministic state machine with time &amp; probe guardrails</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-white">Target Calibration</td>
                  <td className="py-3 px-4 text-slate-400">Generic textbook questions (e.g. "Explain OOP")</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Custom competencies and 4-tier rubrics synthesized from your JD</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-white">Resume Grounding</td>
                  <td className="py-3 px-4 text-slate-400">Ignored or superficial token mention</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Character-offset claim indexing with verbatim verification turns</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-white">Evaluation Integrity</td>
                  <td className="py-3 px-4 text-slate-400">Vague subjective summary ("Good job, 8/10")</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Decoupled outbox worker with normalized verbatim transcript citations</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-white">Privacy &amp; Biometrics</td>
                  <td className="py-3 px-4 text-slate-400">Face tracking, pitch analysis, emotional scanning</td>
                  <td className="py-3 px-4 text-emerald-300 font-semibold">Strict Zero Biometrics Invariant — technical merit only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA Bottom Banner */}
        <div className="rounded-3xl border border-indigo-900/50 bg-gradient-to-b from-indigo-950/60 to-slate-950 p-8 sm:p-12 text-center space-y-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-900/60 border border-indigo-700/40 px-3 py-1 text-xs font-semibold text-indigo-300">
            <Zap className="h-3.5 w-3.5 text-indigo-400" />
            <span>Ready to Calibrate Your Next Interview?</span>
          </div>

          <h2 className="text-3xl font-extrabold text-white sm:text-4xl max-w-xl mx-auto">
            Experience Production-Grade Technical Interview Practice.
          </h2>

          <p className="text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
            Upload your resume, paste your target role, and enter a realistic interview session tailored to your engineering level.
          </p>

          <div className="pt-2">
            <button
              onClick={handleAction}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 px-8 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-600/30 hover:from-indigo-500 hover:to-purple-500 transition-all active:scale-[0.98]"
            >
              {isAuthenticated ? 'Go to Practice Workspace' : 'Create Free Account & Start'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

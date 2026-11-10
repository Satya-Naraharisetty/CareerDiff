import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { HomePage } from './components/HomePage';
import { InterviewSetup } from './components/InterviewSetup';
import { InterviewRoom } from './components/InterviewRoom';
import { DossierView } from './components/DossierView';
import { useAuthStore } from './stores/authStore';
import { useInterviewStore } from './stores/interviewStore';
import { Layers, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const [currentView, setCurrentView] = useState<'home' | 'setup' | 'interview' | 'dossier'>(
    isAuthenticated ? 'setup' : 'home'
  );
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const { reset: resetInterview } = useInterviewStore();

  const handleAuthSuccess = () => {
    setIsAuthOpen(false);
    if (currentView === 'home') {
      setCurrentView('setup');
    }
  };

  // Dynamic SEO Page Title & Meta Updates per state
  useEffect(() => {
    switch (currentView) {
      case 'home':
        document.title = 'IntervueX — Autonomous Technical Interview Simulator & Rubric Engine';
        break;
      case 'setup':
        document.title = 'Session Calibration & Resume Analysis — IntervueX';
        break;
      case 'interview':
        document.title = 'Live Technical Interview Simulation — IntervueX';
        break;
      case 'dossier':
        document.title = 'Assessment Dossier & Rubric Grounding — IntervueX';
        break;
      default:
        document.title = 'IntervueX — Autonomous Technical Interview Simulator & Rubric Engine';
    }
  }, [currentView]);

  const handleStartInterview = () => {
    setCurrentView('interview');
  };

  const handleConcludeInterview = () => {
    setCurrentView('dossier');
  };

  const handleReset = () => {
    resetInterview();
    setCurrentView('setup');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <Navbar
        onOpenAuth={() => setIsAuthOpen(true)}
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
      />

      <main className="flex-1" id="main-content" role="main">
        {currentView === 'home' && (
          <HomePage
            onGetStarted={() => {
              if (isAuthenticated) {
                setCurrentView('setup');
              } else {
                setIsAuthOpen(true);
              }
            }}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {currentView === 'setup' && (
          <InterviewSetup
            onStartInterview={handleStartInterview}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {currentView === 'interview' && (
          <InterviewRoom onConclude={handleConcludeInterview} />
        )}

        {currentView === 'dossier' && (
          <DossierView onReset={handleReset} />
        )}
      </main>

      {/* Semantic SEO & Accessibility Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-4 py-8 text-xs text-slate-500 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* Brand column */}
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm tracking-tight">Intervue<span className="text-indigo-400">X</span></span>
                <span className="rounded bg-indigo-950 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-800/40">AI Engine</span>
              </div>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Autonomous technical interview practice platform for software engineers. Calibrated directly to candidate resumes and target job descriptions.
              </p>
              <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-medium">
                <ShieldCheck className="h-3.5 w-3.5" /> Zero Biometrics • Strict Rubrics
              </div>
            </div>

            {/* Architecture Capabilities */}
            <div>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-3 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-indigo-400" /> Capabilities
              </h4>
              <ul className="space-y-2 text-[11px]">
                <li><span className="text-slate-400 hover:text-slate-200 cursor-pointer" onClick={() => setCurrentView('setup')}>Resume Claim Grounding</span></li>
                <li><span className="text-slate-400 hover:text-slate-200 cursor-pointer" onClick={() => setCurrentView('setup')}>Job Description Calibration</span></li>
                <li><span className="text-slate-400 hover:text-slate-200 cursor-pointer" onClick={() => setCurrentView('interview')}>Adaptive State Machine Probing</span></li>
                <li><span className="text-slate-400 hover:text-slate-200 cursor-pointer" onClick={() => setCurrentView('dossier')}>Decoupled Rubric Scoring</span></li>
              </ul>
            </div>

            {/* Target Disciplines */}
            <div>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-3 flex items-center gap-1.5">
                <Terminal className="h-3 w-3 text-indigo-400" /> Disciplines
              </h4>
              <ul className="space-y-2 text-[11px] text-slate-400">
                <li>Distributed Systems Architecture</li>
                <li>Backend Engineering &amp; Concurrency</li>
                <li>Database Modeling &amp; MVCC Tuning</li>
                <li>Event Streaming &amp; Message Ledgers</li>
              </ul>
            </div>

            {/* Invariants & Compliance */}
            <div>
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-3 flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-indigo-400" /> System Invariants
              </h4>
              <ul className="space-y-2 text-[11px] text-slate-400">
                <li>Normalized Character-Offset Citations</li>
                <li>Deterministic Guardrails &amp; FSM</li>
                <li>PostgreSQL Transactional Outbox</li>
                <li>GDPR Comprehensive Right to Erasure</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© 2026 IntervueX. Autonomous Technical Interview Simulator &amp; Decoupled Rubric Engine.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-slate-400 cursor-pointer">Privacy &amp; Data Minimization</span>
              <span>•</span>
              <span className="hover:text-slate-400 cursor-pointer">Security Standards</span>
              <span>•</span>
              <span className="hover:text-slate-400 cursor-pointer">API v1 Protocol</span>
            </div>
          </div>
        </div>
      </footer>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

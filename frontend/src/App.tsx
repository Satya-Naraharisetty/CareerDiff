import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navbar } from './components/Navbar';
import { CommandPalette } from './components/CommandPalette';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { HomePage } from './components/HomePage';
import { InterviewSetup } from './components/InterviewSetup';
import { InterviewRoom } from './components/InterviewRoom';
import { DossierView } from './components/DossierView';
import { useAuthStore } from './stores/authStore';
import { useInterviewStore } from './stores/interviewStore';
import { Cpu, Layers, ShieldCheck, Terminal } from 'lucide-react';
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
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { reset: resetInterview } = useInterviewStore();

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
      <Navbar
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
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

      {/* Semantic High-Craft Developer Footer */}
      <footer className="border-t border-zinc-850/80 bg-zinc-950 px-4 py-10 text-xs text-zinc-500 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* Brand column */}
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm tracking-tight font-mono">IntervueX</span>
                <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                  Engine v1.0
                </span>
              </div>
              <p className="text-zinc-400 leading-relaxed text-xs">
                Autonomous technical interview practice platform for software engineers. Grounded in candidate resumes and calibrated to target job requirements.
              </p>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
                <ShieldCheck className="h-3.5 w-3.5" /> Zero Biometrics • Strict Rubrics
              </div>
            </div>

            {/* Architecture Capabilities */}
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
                <Terminal className="h-3 w-3 text-zinc-400" /> Capabilities
              </h4>
              <ul className="space-y-2 text-xs">
                <li><span className="text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" onClick={() => setCurrentView('setup')}>Resume Claim Grounding</span></li>
                <li><span className="text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" onClick={() => setCurrentView('setup')}>Job Description Calibration</span></li>
                <li><span className="text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" onClick={() => setCurrentView('interview')}>Adaptive State Machine Probing</span></li>
                <li><span className="text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors" onClick={() => setCurrentView('dossier')}>Decoupled Rubric Scoring</span></li>
              </ul>
            </div>

            {/* Target Disciplines */}
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
                <Cpu className="h-3 w-3 text-zinc-400" /> Disciplines
              </h4>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li>Distributed Systems Architecture</li>
                <li>Backend Engineering &amp; Concurrency</li>
                <li>Database Modeling &amp; MVCC Tuning</li>
                <li>Event Streaming &amp; Message Ledgers</li>
              </ul>
            </div>

            {/* Invariants & Compliance */}
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-zinc-400" /> System Invariants
              </h4>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li>Normalized Character-Offset Citations</li>
                <li>Deterministic Guardrails &amp; FSM</li>
                <li>PostgreSQL Transactional Outbox</li>
                <li>GDPR Comprehensive Right to Erasure</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-mono">
            <p>© 2026 IntervueX. Grounded Technical Practice &amp; Decoupled Evaluation.</p>
            <div className="flex items-center gap-4 text-xs">
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Privacy &amp; Data Minimization</span>
              <span>•</span>
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">Security Standards</span>
              <span>•</span>
              <span className="hover:text-zinc-300 cursor-pointer transition-colors">API v1 Protocol</span>
            </div>
          </div>
        </div>
      </footer>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(view) => setCurrentView(view)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
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

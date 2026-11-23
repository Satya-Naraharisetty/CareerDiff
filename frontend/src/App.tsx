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
import { ResumeRewriter } from './components/ResumeRewriter';
import { isSkipAuthEnabled, useAuthStore } from './stores/authStore';
import { useInterviewStore } from './stores/interviewStore';
import { BrowserSpeechSynthesizer } from './lib/speechSynthesis';
import { stopAllMediaHardware } from './lib/audio';
import { CareerDiffLogo } from './components/CareerDiffLogo';
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

const VIEW_STORAGE_KEY = 'careerdiff_active_view';

type View = 'home' | 'setup' | 'interview' | 'dossier' | 'rewriter';
const VIEW_PATHS: Record<View, string> = {
  home: '/',
  setup: '/practice',
  interview: '/interview',
  dossier: '/dashboard',
  rewriter: '/resume-studio',
};
const viewFromPath = (path: string): View | null => {
  const clean = path.replace(/\/+$/, '') || '/';
  const match = (Object.keys(VIEW_PATHS) as View[]).find((v) => VIEW_PATHS[v] === clean);
  return match ?? null;
};
const isInterviewLive = () => {
  const { state, interviewId } = useInterviewStore.getState();
  return Boolean(interviewId && state !== 'COMPLETED');
};

export const AppContent: React.FC = () => {
  const { isAuthenticated, rehydrateProfile } = useAuthStore();
  const [currentView, setCurrentView] = useState<View>(() => {
    const fromUrl = typeof window !== 'undefined' ? viewFromPath(window.location.pathname) : null;
    const hasActiveInterview =
      typeof localStorage !== 'undefined' && !!localStorage.getItem('careerdiff_active_interview_id');
    if (fromUrl) {
      if (!isAuthenticated && !isSkipAuthEnabled() && fromUrl !== 'home') return 'home';
      // Preserve live interview room on cold browser refresh if an active session ID is stored
      if (fromUrl === 'interview') return hasActiveInterview ? 'interview' : 'setup';
      return fromUrl;
    }
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved && ['home', 'setup', 'interview', 'dossier', 'rewriter'].includes(saved)) {
        if (!isAuthenticated && !isSkipAuthEnabled() && saved !== 'home') return 'home';
        if (saved === 'interview') return hasActiveInterview ? 'interview' : 'setup';
        return saved as 'home' | 'setup' | 'interview' | 'dossier' | 'rewriter';
      }
    }
    return (isAuthenticated || isSkipAuthEnabled()) ? 'setup' : 'home';
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { reset: resetInterview } = useInterviewStore();

  // Rehydrate profile on mount if token is present
  useEffect(() => {
    // Check for OAuth redirect token in URL query params on mount
    // OAuth full-page fallback delivers the token in the URL fragment (never sent to servers).
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hashParams.get('auth_token');
    if (token) {
      // Remove the token from the address bar / history immediately.
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      useAuthStore.getState().loginWithToken(token).then(() => {
        applyView('setup', 'replace');
      }).catch((err) => {
        console.error('Failed to authenticate via URL token:', err);
        useAuthStore.getState().logout();
      });
      return;
    }

    if (isAuthenticated || isSkipAuthEnabled()) {
      rehydrateProfile();
    }
  }, [isAuthenticated, rehydrateProfile]);

  // Derive active view from authentication guard
  const activeView = (!isAuthenticated && !isSkipAuthEnabled()) ? 'home' : currentView;

  const applyView = (view: View, historyMode: 'push' | 'replace' | 'none') => {
    if (view !== 'interview') {
      useInterviewStore.getState().disconnectVoiceSession();
      BrowserSpeechSynthesizer.stop();
      stopAllMediaHardware();
    }
    setCurrentView(view);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {}
    const path = VIEW_PATHS[view];
    if (historyMode === 'push' && window.location.pathname !== path) {
      window.history.pushState({ view }, '', path);
    } else if (historyMode === 'replace') {
      window.history.replaceState({ view }, '', path);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  };

  /** Single navigation entry point: every nav surface (navbar, palette, footer) goes through here. */
  const handleNavigate = (view: View, opts: { skipLeaveConfirm?: boolean } = {}) => {
    if (
      !opts.skipLeaveConfirm &&
      currentView === 'interview' &&
      view !== 'interview' &&
      isInterviewLive() &&
      !window.confirm('Leave the live interview? Your microphone will stop and the session will be paused. You can conclude it later from Practice.')
    ) {
      return;
    }
    if (view === 'interview' && !useInterviewStore.getState().interviewId) {
      view = 'setup';
    }
    applyView(view, 'push');
  };

  // Keep the URL in sync on first render, and support the browser back/forward buttons.
  useEffect(() => {
    window.history.replaceState({ view: activeView }, '', VIEW_PATHS[activeView] + window.location.search);
    const onPopState = () => {
      const view = viewFromPath(window.location.pathname) ?? 'home';
      if (view === 'interview' && !isInterviewLive()) {
        // Never navigate back into a finished (or missing) interview room.
        const fallback: View = useInterviewStore.getState().state === 'COMPLETED' ? 'dossier' : 'setup';
        applyView(fallback, 'replace');
        return;
      }
      applyView(view, 'none');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before closing / reloading the tab during a live interview.
  useEffect(() => {
    if (activeView !== 'interview') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isInterviewLive()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeView]);

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
    if (activeView === 'home') {
      handleNavigate('setup');
    }
  };

  // Dynamic SEO Page Title & Meta Updates per state
  useEffect(() => {
    switch (activeView) {
      case 'home':
        document.title = 'CareerDiff — Autonomous Technical Interview Simulator & Rubric Engine';
        break;
      case 'setup':
        document.title = 'Session Calibration & Resume Analysis — CareerDiff';
        break;
      case 'interview':
        document.title = 'Live Technical Interview Simulation — CareerDiff';
        break;
      case 'dossier':
        document.title = 'Assessment Dossier & Rubric Grounding — CareerDiff';
        break;
      case 'rewriter':
        document.title = 'Resume Rewriter & Overleaf LaTeX Studio — CareerDiff';
        break;
      default:
        document.title = 'CareerDiff — Autonomous Technical Interview Simulator & Rubric Engine';
    }
  }, [activeView]);

  const handleStartInterview = () => {
    handleNavigate('interview');
  };

  const handleConcludeInterview = () => {
    useInterviewStore.getState().disconnectVoiceSession();
    BrowserSpeechSynthesizer.stop();
    stopAllMediaHardware();
    handleNavigate('dossier', { skipLeaveConfirm: true });
  };

  const handleReset = () => {
    useInterviewStore.getState().disconnectVoiceSession();
    BrowserSpeechSynthesizer.stop();
    stopAllMediaHardware();
    resetInterview();
    handleNavigate('setup');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white">
      <Navbar
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        currentView={activeView}
        onNavigate={handleNavigate}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      <main className="flex-1" id="main-content" role="main">
        {activeView === 'home' && (
          <HomePage
            onGetStarted={() => {
              if (isAuthenticated || isSkipAuthEnabled()) {
                if (!isAuthenticated && isSkipAuthEnabled()) {
                  useAuthStore.getState().loginAsDev();
                }
                handleNavigate('setup');
              } else {
                setIsAuthOpen(true);
              }
            }}
            onOpenAuth={() => setIsAuthOpen(true)}
            onOpenDashboard={() => handleNavigate('dossier')}
          />
        )}

        {activeView === 'setup' && (
          <InterviewSetup
            onStartInterview={handleStartInterview}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}

        {activeView === 'interview' && (
          <InterviewRoom onConclude={handleConcludeInterview} />
        )}

        {activeView === 'dossier' && (
          <DossierView onReset={handleReset} />
        )}

        {activeView === 'rewriter' && (
          <ResumeRewriter onBackToInterview={() => handleNavigate('setup')} />
        )}
      </main>

      {/* Semantic High-Craft Developer Footer */}
      {activeView !== 'interview' && (
      <footer className="border-t border-zinc-800/80 bg-zinc-950 px-4 py-10 text-xs text-zinc-500 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {/* Brand column */}
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 shadow-sm">
                  <CareerDiffLogo className="h-3.5 w-3.5" />
                </div>
                <span className="font-semibold text-white text-sm tracking-tight font-mono">CareerDiff</span>
                <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] font-mono text-zinc-300">
                  Engine v1.0
                </span>
              </div>
              <p className="text-zinc-400 leading-relaxed text-xs">
                Autonomous technical interview practice platform for software engineers. Grounded in candidate resumes and calibrated to target job requirements.
              </p>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono">
                <ShieldCheck className="h-3.5 w-3.5" /> No biometric scoring • Rubric-based
              </div>
            </div>

            {/* Architecture Capabilities */}
            <div>
              <h4 className="font-mono text-xs uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
                <Terminal className="h-3 w-3 text-zinc-400" /> Capabilities
              </h4>
              <ul className="space-y-2 text-xs">
                <li><button type="button" className="text-zinc-400 hover:text-zinc-200 transition-colors" onClick={() => handleNavigate('setup')}>Practice interview setup</button></li>
                <li><button type="button" className="text-zinc-400 hover:text-zinc-200 transition-colors" onClick={() => handleNavigate('dossier')}>Your reports</button></li>
                <li><button type="button" className="text-zinc-400 hover:text-zinc-200 transition-colors" onClick={() => handleNavigate('rewriter')}>Resume Studio</button></li>
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
                <li>Account &amp; data deletion on request</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-mono">
            <p>© 2026 CareerDiff. Grounded Technical Practice &amp; Decoupled Evaluation.</p>
            <p className="text-xs">You can delete your account and all data at any time from your profile.</p>
          </div>
        </div>
      </footer>
      )}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(view) => handleNavigate(view)}
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

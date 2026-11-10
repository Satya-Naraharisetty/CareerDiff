import React from 'react';
import { Bot, Home, LogIn, LogOut, Radio, Sparkles, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useInterviewStore } from '../stores/interviewStore';

interface NavbarProps {
  onOpenAuth: () => void;
  currentView: 'home' | 'setup' | 'interview' | 'dossier';
  onNavigate: (view: 'home' | 'setup' | 'interview' | 'dossier') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, currentView, onNavigate }) => {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { state: interviewState, wsStatus, mode } = useInterviewStore();

  const handleLogout = () => {
    logout();
    onNavigate('home');
  };

  const handleGuardedNavigate = (view: 'setup' | 'interview' | 'dossier') => {
    if (!isAuthenticated) {
      onOpenAuth();
    } else {
      onNavigate(view);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('home')}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/20">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">Intervue<span className="text-indigo-400">X</span></span>
              <span className="rounded-full bg-indigo-950/80 px-2 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-800/60">
                AI Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Autonomous Practice & Evaluation</p>
          </div>
        </div>

        {/* Center Navigation / Active Status Indicator */}
        <nav className="hidden md:flex items-center gap-2" aria-label="Main Navigation">
          <button
            onClick={() => onNavigate('home')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              currentView === 'home'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Home className="h-4 w-4 text-indigo-400" />
            Home
          </button>

          <button
            onClick={() => handleGuardedNavigate('setup')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              currentView === 'setup'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Session Setup
          </button>

          <button
            onClick={() => handleGuardedNavigate('interview')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              currentView === 'interview'
                ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-700/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Radio className={`h-4 w-4 ${currentView === 'interview' ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`} />
            Live Session
            {interviewState !== 'CREATED' && interviewState !== 'COMPLETED' && (
              <span className="ml-1 inline-flex items-center rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/50">
                {interviewState}
              </span>
            )}
          </button>

          <button
            onClick={() => handleGuardedNavigate('dossier')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              currentView === 'dossier'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            Assessment Dossier
          </button>
        </nav>

        {/* Right Section: Status Pill & Auth Controls */}
        <div className="flex items-center gap-3">
          {mode === 'VOICE' && wsStatus === 'connected' && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 text-xs text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              Voice Link Live
            </div>
          )}

          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 border border-slate-800">
                <UserIcon className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-medium text-slate-300">{user.full_name || user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-900 hover:text-rose-400 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-900 transition-all"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </button>
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-500 transition-all active:scale-95"
              >
                Get Started Free
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

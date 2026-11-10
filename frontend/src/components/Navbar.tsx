import React, { useState } from 'react';
import { Bot, FileText, Home, LogIn, LogOut, Menu, Radio, Sparkles, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useInterviewStore } from '../stores/interviewStore';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  currentView: 'home' | 'setup' | 'interview' | 'dossier';
  onNavigate: (view: 'home' | 'setup' | 'interview' | 'dossier') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, onOpenProfile, currentView, onNavigate }) => {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { state: interviewState } = useInterviewStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const isSessionActive = interviewState !== 'CREATED' && interviewState !== 'COMPLETED';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo - Crisp Single Line */}
        <div
          className="flex items-center gap-2 cursor-pointer shrink-0 group"
          onClick={() => onNavigate('home')}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 group-hover:bg-indigo-500 transition-colors">
            <Bot className="h-4 w-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">
            Intervue<span className="text-indigo-400">X</span>
          </span>
        </div>

        {/* Desktop Center Navigation - Minimalist & Focused */}
        <nav className="hidden lg:flex items-center gap-1" aria-label="Main Navigation">
          <button
            onClick={() => onNavigate('home')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'home'
                ? 'bg-slate-900 text-white border border-slate-800'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            Home
          </button>

          <button
            onClick={() => handleGuardedNavigate('setup')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'setup'
                ? 'bg-slate-900 text-white border border-slate-800'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            Setup
          </button>

          <button
            onClick={() => handleGuardedNavigate('interview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'interview'
                ? 'bg-slate-900 text-indigo-300 border border-indigo-900/80'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            {isSessionActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
            Live Session
          </button>

          <button
            onClick={() => handleGuardedNavigate('dossier')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'dossier'
                ? 'bg-slate-900 text-white border border-slate-800'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
            }`}
          >
            Dossier
          </button>
        </nav>

        {/* Desktop Right Actions - Uncluttered */}
        <div className="hidden lg:flex items-center gap-2">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenProfile}
                title="View Profile & Security Settings"
                className="flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-2.5 py-1.5 border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors"
              >
                <div className="h-5 w-5 rounded-full bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                  {(user.full_name || user.email)[0].toUpperCase()}
                </div>
                <span className="max-w-[120px] truncate font-medium">
                  {user.full_name?.split(' ')[0] || 'Account'}
                </span>
              </button>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all active:scale-95"
            >
              Sign In
            </button>
          )}
        </div>

        {/* Mobile Header Controls */}
        <div className="flex lg:hidden items-center gap-2">
          {!isAuthenticated ? (
            <button
              onClick={onOpenAuth}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-all active:scale-95"
            >
              Sign In
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2 py-1 border border-slate-800 text-xs text-slate-200"
            >
              <div className="h-4 w-4 rounded-full bg-indigo-950 flex items-center justify-center text-[9px] font-bold text-indigo-300">
                {(user?.full_name || user?.email || 'U')[0].toUpperCase()}
              </div>
              <span className="max-w-[70px] truncate">{user?.full_name?.split(' ')[0] || 'User'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-white transition-colors"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-slate-800 bg-slate-950/95 px-4 pt-3 pb-5 lg:hidden backdrop-blur-xl animate-in slide-in-from-top-2 duration-200 shadow-2xl">
          <nav className="flex flex-col space-y-1" aria-label="Mobile Navigation">
            <button
              onClick={() => {
                onNavigate('home');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'home'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Home className="h-4 w-4 text-indigo-400" />
              Home
            </button>

            <button
              onClick={() => {
                handleGuardedNavigate('setup');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'setup'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <FileText className="h-4 w-4 text-indigo-400" />
              Setup
            </button>

            <button
              onClick={() => {
                handleGuardedNavigate('interview');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'interview'
                  ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-700/60'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Radio className={`h-4 w-4 ${currentView === 'interview' ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`} />
                Live Session
              </div>
              {isSessionActive && (
                <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/50">
                  {interviewState}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                handleGuardedNavigate('dossier');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'dossier'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              Dossier
            </button>
          </nav>

          {/* Mobile Auth Actions */}
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            {isAuthenticated && user ? (
              <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-xs font-bold text-indigo-300">
                    {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-medium text-white">{user.full_name || 'Candidate'}</p>
                    <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-400 hover:bg-rose-950/40 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  onOpenAuth();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md active:scale-[0.98]"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

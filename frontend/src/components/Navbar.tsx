import React, { useState } from 'react';
import { Bot, Command, FileText, Home, LogOut, Menu, Radio, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useInterviewStore } from '../stores/interviewStore';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  currentView: 'home' | 'setup' | 'interview' | 'dossier';
  onNavigate: (view: 'home' | 'setup' | 'interview' | 'dossier') => void;
  onOpenCommandPalette?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
  onOpenProfile,
  currentView,
  onNavigate,
  onOpenCommandPalette,
}) => {
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
    <header className="sticky top-0 z-40 w-full border-b border-zinc-850/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo - Crisp Developer Monospace Pill */}
        <div
          className="flex items-center gap-2 cursor-pointer shrink-0 group"
          onClick={() => onNavigate('home')}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 shadow-sm group-hover:bg-zinc-800 transition-colors">
            <Bot className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white font-mono">
            IntervueX
          </span>
          <span className="hidden sm:inline-block rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
            Engine v1.0
          </span>
        </div>

        {/* Desktop Center Navigation - Minimalist & Focused */}
        <nav className="hidden lg:flex items-center gap-1 font-sans" aria-label="Main Navigation">
          <button
            onClick={() => onNavigate('home')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'home'
                ? 'bg-zinc-900 text-white border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
            }`}
          >
            Home
          </button>

          <button
            onClick={() => handleGuardedNavigate('setup')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'setup'
                ? 'bg-zinc-900 text-white border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
            }`}
          >
            Setup
          </button>

          <button
            onClick={() => handleGuardedNavigate('interview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              currentView === 'interview'
                ? 'bg-zinc-900 text-white border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
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
                ? 'bg-zinc-900 text-white border border-zinc-800'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
            }`}
          >
            Dossier
          </button>
        </nav>

        {/* Desktop Right Actions - Command Palette Trigger & Profile */}
        <div className="hidden lg:flex items-center gap-2.5">
          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              title="Open Command Palette (Cmd+K / Ctrl+K)"
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors shadow-sm"
            >
              <Command className="h-3.5 w-3.5 text-zinc-500" />
              <span className="font-mono text-[11px]">⌘K</span>
            </button>
          )}

          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenProfile}
                title="View Profile & Security Settings"
                className="flex items-center gap-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1.5 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors"
              >
                <div className="h-5 w-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300">
                  {(user.full_name || user.email)[0].toUpperCase()}
                </div>
                <span className="max-w-[120px] truncate font-medium">
                  {user.full_name?.split(' ')[0] || 'Account'}
                </span>
              </button>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-900 rounded-lg transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="rounded-lg bg-white hover:bg-zinc-200 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-sm transition-all active:scale-[0.98]"
            >
              Sign In
            </button>
          )}
        </div>

        {/* Mobile Header Controls */}
        <div className="flex lg:hidden items-center gap-2">
          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="Open Command Palette"
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:text-white"
            >
              <Command className="h-4 w-4" />
            </button>
          )}
          {!isAuthenticated ? (
            <button
              onClick={onOpenAuth}
              className="rounded-lg bg-white hover:bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-all active:scale-95"
            >
              Sign In
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2 py-1 border border-zinc-800 text-xs text-zinc-200"
            >
              <div className="h-4 w-4 rounded-full bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-zinc-300">
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
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-zinc-850 bg-zinc-950/95 px-4 pt-3 pb-5 lg:hidden backdrop-blur-xl animate-in slide-in-from-top-2 duration-200 shadow-2xl">
          <nav className="flex flex-col space-y-1" aria-label="Mobile Navigation">
            <button
              onClick={() => {
                onNavigate('home');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'home'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Home className="h-4 w-4 text-zinc-400" />
              Home
            </button>

            <button
              onClick={() => {
                handleGuardedNavigate('setup');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'setup'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <FileText className="h-4 w-4 text-zinc-400" />
              Calibration Setup
            </button>

            <button
              onClick={() => {
                handleGuardedNavigate('interview');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'interview'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Radio className="h-4 w-4 text-zinc-400" />
                Live Session
              </div>
              {isSessionActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => {
                handleGuardedNavigate('dossier');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'dossier'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <FileText className="h-4 w-4 text-zinc-400" />
              Assessment Dossier
            </button>
          </nav>

          {/* Mobile Auth Actions */}
          <div className="mt-3 pt-3 border-t border-zinc-850">
            {isAuthenticated && user ? (
              <div className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                    {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-medium text-white">{user.full_name || 'Candidate'}</p>
                    <p className="text-[10px] text-zinc-400 truncate max-w-[150px]">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-rose-400 rounded transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  onOpenAuth();
                  setMobileMenuOpen(false);
                }}
                className="w-full rounded-lg bg-white hover:bg-zinc-200 py-2 text-xs font-semibold text-zinc-950 transition-colors shadow-sm"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

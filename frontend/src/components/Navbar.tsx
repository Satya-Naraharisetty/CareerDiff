import React, { useState } from 'react';
import { BarChart3, Command, FileText, LogOut, Menu, Play, X } from 'lucide-react';
import { CareerDiffLogo } from './CareerDiffLogo';
import { isSkipAuthEnabled, useAuthStore } from '../stores/authStore';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  currentView: 'home' | 'setup' | 'interview' | 'dossier' | 'rewriter';
  onNavigate: (view: 'home' | 'setup' | 'interview' | 'dossier' | 'rewriter') => void;
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    onNavigate('home');
  };

  const handleGuardedNavigate = (view: 'setup' | 'interview' | 'dossier') => {
    if (!isAuthenticated && !isSkipAuthEnabled()) {
      onOpenAuth();
    } else {
      if (!isAuthenticated && isSkipAuthEnabled()) {
        useAuthStore.getState().loginAsDev();
      }
      onNavigate(view);
    }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const paletteShortcut = isMac ? '⌘K' : 'Ctrl+K';
  const initialOf = (u: { full_name?: string; email?: string } | null | undefined) =>
    ((u?.full_name || u?.email || 'U').trim()[0] || 'U').toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo - Crisp Developer Monospace Pill */}
        <button
          type="button"
          aria-label="CareerDiff home"
          className="flex items-center gap-2.5 shrink-0 group rounded-lg"
          onClick={() => onNavigate('home')}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 shadow-sm group-hover:border-zinc-600 group-hover:bg-zinc-800 transition-all">
            <CareerDiffLogo className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white font-mono">
            CareerDiff
          </span>
          <span className="hidden sm:inline-block rounded-md border border-zinc-800 bg-zinc-900/90 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">
            Engine v1.0
          </span>
        </button>

        {/* Desktop Center Navigation - Segmented Dock Control */}
        <nav
          className="hidden lg:flex items-center bg-zinc-900/70 border border-zinc-800/90 rounded-full p-1 shadow-inner backdrop-blur-sm"
          aria-label="Main Navigation"
        >
          <button
            type="button"
            onClick={() => handleGuardedNavigate('dossier')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-150 ${
              currentView === 'dossier' || currentView === 'home'
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => handleGuardedNavigate('setup')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-150 ${
              currentView === 'setup'
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Play className="h-3.5 w-3.5 text-zinc-400" />
            <span>Practice</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('rewriter')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-150 ${
              currentView === 'rewriter'
                ? 'bg-zinc-800 text-emerald-400 shadow-sm border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-zinc-400" />
            <span>Resume Studio</span>
            <span className="rounded bg-zinc-800/90 border border-zinc-700/60 px-1 py-px text-[11px] font-mono text-zinc-400">
              LaTeX
            </span>
          </button>
        </nav>

        {/* Desktop Right Actions - Command Palette Trigger & Unified Identity Chip */}
        <div className="hidden lg:flex items-center gap-3">
          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              title={`Open Command Palette (${paletteShortcut})`}
              className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors shadow-sm"
            >
              <Command className="h-3.5 w-3.5 text-zinc-500" />
              <span className="font-mono text-[11px] text-zinc-400">{paletteShortcut}</span>
            </button>
          )}

          {isAuthenticated && user ? (
            <div className="flex items-center rounded-full border border-zinc-800 bg-zinc-900/90 p-1 pl-1.5 shadow-sm">
              <button
                type="button"
                onClick={onOpenProfile}
                title="View Candidate Profile & Settings"
                className="flex items-center gap-2 pr-2 text-xs text-zinc-300 hover:text-white transition-colors group"
              >
                <div className="h-6 w-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[11px] font-semibold text-emerald-400 shadow-inner group-hover:scale-105 transition-transform">
                  {initialOf(user)}
                </div>
                <span className="font-medium text-xs max-w-[110px] truncate text-zinc-200 group-hover:text-white">
                  {user.full_name?.split(' ')[0] || 'Account'}
                </span>
                {user.auth_provider === 'LOCAL_DEV' && (
                  <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[11px] font-mono text-amber-300 font-medium">
                    DEV
                  </span>
                )}
              </button>
              <div className="h-3.5 w-px bg-zinc-800" />
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                className="ml-1 p-1 text-zinc-500 hover:text-rose-400 rounded-full hover:bg-zinc-800/80 transition-colors"
                aria-label="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="rounded-full bg-white hover:bg-zinc-200 px-4 py-1.5 text-xs font-semibold text-zinc-950 shadow-sm transition-all active:scale-[0.98]"
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
              className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-2 py-1 border border-zinc-800 text-xs text-zinc-200"
            >
              <div className="h-5 w-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[11px] font-bold text-emerald-400">
                {initialOf(user)}
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
        <div className="border-b border-zinc-800 bg-zinc-950/95 px-4 pt-3 pb-5 lg:hidden backdrop-blur-xl animate-in slide-in-from-top-2 duration-200 shadow-2xl">
          <nav className="flex flex-col space-y-1" aria-label="Mobile Navigation">
            <button
              onClick={() => {
                handleGuardedNavigate('dossier');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'dossier' || currentView === 'home'
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <BarChart3 className="h-4 w-4 text-emerald-400" />
              <span>Dashboard</span>
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
              <Play className="h-4 w-4 text-zinc-400" />
              <span>Practice Workspace</span>
            </button>

            <button
              onClick={() => {
                onNavigate('rewriter');
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                currentView === 'rewriter'
                  ? 'bg-zinc-800 text-emerald-400'
                  : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-emerald-400" />
                <span>Resume Studio</span>
              </div>
              <span className="rounded bg-zinc-800 border border-zinc-700/80 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">
                LaTeX
              </span>
            </button>
          </nav>

          {/* Mobile Auth Actions */}
          <div className="mt-3 pt-3 border-t border-zinc-800">
            {isAuthenticated && user ? (
              <div className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400">
                    {initialOf(user)}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-white">{user.full_name || 'Candidate'}</p>
                      {user.auth_provider === 'LOCAL_DEV' && (
                        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[11px] font-mono text-amber-300 font-medium">
                          DEV
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate max-w-[150px]">{user.email}</p>
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

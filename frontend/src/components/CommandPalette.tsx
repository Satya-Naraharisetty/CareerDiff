import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Code2,
  Compass,
  FileCheck,
  FileText,
  Home,
  KeyRound,
  LogOut,
  Mic,
  RotateCcw,
  Search,
  Terminal,
  User,
  X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useInterviewStore } from '../stores/interviewStore';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: 'home' | 'setup' | 'interview' | 'dossier') => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onToggleScratchpad?: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Actions' | 'Tools' | 'Account';
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenAuth,
  onOpenProfile,
  onToggleScratchpad,
}) => {
  const { isAuthenticated, logout, user } = useAuthStore();
  const { reset: resetInterview, setMode, mode } = useInterviewStore();

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const commands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [
      // Navigation
      {
        id: 'nav-home',
        title: 'Home Overview',
        subtitle: 'Workbench preview & architectural pillars',
        category: 'Navigation',
        icon: Home,
        shortcut: 'G H',
        run: () => {
          onNavigate('home');
          onClose();
        },
      },
      {
        id: 'nav-setup',
        title: 'Calibration Studio',
        subtitle: 'Resume parsing & target JD calibration',
        category: 'Navigation',
        icon: Compass,
        shortcut: 'G S',
        run: () => {
          onNavigate('setup');
          onClose();
        },
      },
      {
        id: 'nav-interview',
        title: 'Live Interview Room',
        subtitle: 'Adaptive state machine simulation',
        category: 'Navigation',
        icon: Terminal,
        shortcut: 'G I',
        run: () => {
          onNavigate('interview');
          onClose();
        },
      },
      {
        id: 'nav-dossier',
        title: 'Assessment Dossier',
        subtitle: 'Normalized rubrics & evidence provenance',
        category: 'Navigation',
        icon: FileCheck,
        shortcut: 'G D',
        run: () => {
          onNavigate('dossier');
          onClose();
        },
      },

      // Actions
      {
        id: 'act-mode-toggle',
        title: mode === 'VOICE' ? 'Switch to Text Turn Mode' : 'Switch to Real-Time Voice Mode',
        subtitle: `Current protocol: ${mode}`,
        category: 'Actions',
        icon: Mic,
        shortcut: 'M',
        run: () => {
          setMode(mode === 'VOICE' ? 'TEXT' : 'VOICE');
          onClose();
        },
      },
      {
        id: 'act-scratchpad',
        title: 'Toggle Architecture Scratchpad',
        subtitle: 'Split-screen diagram & pseudocode editor in live room',
        category: 'Actions',
        icon: Code2,
        shortcut: 'S',
        run: () => {
          onNavigate('interview');
          if (onToggleScratchpad) onToggleScratchpad();
          onClose();
        },
      },
      {
        id: 'act-reset',
        title: 'Reset Session State',
        subtitle: 'Clear current interview progress and re-calibrate',
        category: 'Actions',
        icon: RotateCcw,
        run: () => {
          resetInterview();
          onNavigate('setup');
          onClose();
        },
      },

      // Tools
      {
        id: 'tool-print',
        title: 'Print / Export Assessment Dossier',
        subtitle: 'Open browser print dialog for PDF export',
        category: 'Tools',
        icon: FileText,
        shortcut: '⌘ P',
        run: () => {
          onNavigate('dossier');
          onClose();
          setTimeout(() => window.print(), 300);
        },
      },
    ];

    // Account items
    if (isAuthenticated) {
      list.push(
        {
          id: 'acc-profile',
          title: `Account Profile (${user?.full_name || 'Candidate'})`,
          subtitle: user?.email,
          category: 'Account',
          icon: User,
          run: () => {
            onOpenProfile();
            onClose();
          },
        },
        {
          id: 'acc-logout',
          title: 'Sign Out',
          subtitle: 'End session and clear client credentials',
          category: 'Account',
          icon: LogOut,
          run: () => {
            logout();
            onNavigate('home');
            onClose();
          },
        }
      );
    } else {
      list.push({
        id: 'acc-login',
        title: 'Sign In / Register',
        subtitle: 'Authenticate to access calibration studio & evaluation',
        category: 'Account',
        icon: KeyRound,
        shortcut: 'L',
        run: () => {
          onOpenAuth();
          onClose();
        },
      });
    }

    return list;
  }, [
    isAuthenticated,
    user,
    mode,
    setMode,
    onNavigate,
    onOpenAuth,
    onOpenProfile,
    onToggleScratchpad,
    resetInterview,
    logout,
    onClose,
  ]);

  const filtered = useMemo(() => {
    if (!search.trim()) return commands;
    const q = search.toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.subtitle?.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, search]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].run();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl overflow-hidden font-sans backdrop-blur-xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950/70">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command or search actions..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-sans"
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-mono">
              No matching commands found for "{search}"
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.id}
                  onClick={() => cmd.run()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${isSelected
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-300 hover:bg-zinc-800/60'
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 border ${isSelected
                          ? 'border-zinc-700 bg-zinc-700/80 text-white'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                        }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-100 truncate">
                        {cmd.title}
                      </div>
                      {cmd.subtitle && (
                        <div className="text-[11px] text-zinc-400 truncate">
                          {cmd.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase">
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <kbd className="hidden sm:inline-flex rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Palette Footer Help Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800 bg-zinc-950/80 text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span className="text-zinc-600">CareerDiff Command HUD</span>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { login, register, isLoading, error, clearError } = useAuthStore();
  const initialInputRef = useRef<HTMLInputElement | null>(null);

  // Focus first input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => initialInputRef.current?.focus(), 50);
    }
  }, [isOpen, tab]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMsg(null);

    try {
      if (tab === 'login') {
        await login({ email: email.trim(), password });
        if (onSuccess) onSuccess();
        else onClose();
      } else {
        await register({
          email: email.trim(),
          password,
          full_name: fullName.trim() || 'Candidate',
        });
        setSuccessMsg('Account created successfully! Welcome to IntervueX.');
        setTimeout(() => {
          if (onSuccess) onSuccess();
          else onClose();
        }, 600);
      }
    } catch {
      // Error handled by store
    }
  };

  const handleFillDemo = (role: 'alex' | 'candidate') => {
    clearError();
    if (role === 'alex') {
      setEmail('alex.rivera@example.com');
      setPassword('Password123!');
      setFullName('Alex Rivera');
    } else {
      setEmail('candidate@example.com');
      setPassword('Password123!');
      setFullName('Taylor Chen');
    }
  };

  // Password Strength Indicators for Sign Up
  const hasMinLength = password.length >= 8;
  const hasMixedChars = /\d/.test(password) && /[a-zA-Z]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = [hasMinLength, hasMixedChars, hasSpecial].filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8 shadow-2xl shadow-black/80">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header Title */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-extrabold text-white text-lg tracking-tight">
              Intervue<span className="text-indigo-400">X</span>
            </span>
            <span className="rounded-full bg-indigo-950/80 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-800/60">
              AI Practice Studio
            </span>
          </div>
          <h2 id="auth-modal-title" className="text-xl font-bold text-white tracking-tight">
            {tab === 'login' ? 'Sign in to your account' : 'Create candidate practice account'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {tab === 'login'
              ? 'Access your resume intelligence and interview dossiers.'
              : 'Free practice with resume claim grounding & custom JD rubrics.'}
          </p>
        </div>

        {/* Header Tabs */}
        <div className="flex border-b border-slate-800 pb-2 mb-5">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              clearError();
              setShowPassword(false);
            }}
            className={`flex-1 pb-2 text-sm font-semibold transition-all border-b-2 -mb-[10px] ${
              tab === 'login'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Candidate Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              clearError();
              setShowPassword(false);
            }}
            className={`flex-1 pb-2 text-sm font-semibold transition-all border-b-2 -mb-[10px] ${
              tab === 'register'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Practice Account
          </button>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg bg-rose-950/60 border border-rose-800/60 p-3 text-xs text-rose-300 animate-in fade-in"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-950/60 border border-emerald-800/60 p-3 text-xs text-emerald-300 animate-in fade-in"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Auth Form with Modern Web Best Practices */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
          {tab === 'register' && (
            <div>
              <label htmlFor="auth-fullname" className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  ref={initialInputRef}
                  id="auth-fullname"
                  name="name"
                  type="text"
                  required
                  autoComplete="name"
                  enterKeyHint="next"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                ref={tab === 'login' ? initialInputRef : undefined}
                id="auth-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="next"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300">
                Password
              </label>
              {tab === 'login' && (
                <button
                  type="button"
                  onClick={() => handleFillDemo('alex')}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium"
                >
                  Fill Demo Account
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
              <input
                id="auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (min 8 chars)"
                className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
              />
              {/* Show / Hide Password Eye Toggle */}
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                tabIndex={0}
                className="absolute right-2.5 top-2 rounded p-1 text-slate-400 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-indigo-500 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-indigo-400" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Dynamic Password Strength Indicators (Sign Up Mode) */}
            {tab === 'register' && password.length > 0 && (
              <div className="mt-2 space-y-1.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5">
                  <div className="h-1 flex-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        strengthScore === 1
                          ? 'w-1/3 bg-rose-500'
                          : strengthScore === 2
                          ? 'w-2/3 bg-amber-500'
                          : 'w-full bg-emerald-500'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {strengthScore === 1 ? 'Weak' : strengthScore === 2 ? 'Fair' : 'Strong'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span className={hasMinLength ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                    ✓ 8+ chars
                  </span>
                  <span className={hasMixedChars ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                    ✓ letters &amp; numbers
                  </span>
                  <span className={hasSpecial ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                    ✓ symbol
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-purple-500 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : tab === 'login' ? (
              <KeyRound className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {tab === 'login' ? 'Sign In to IntervueX' : 'Create Free Practice Account'}
          </button>

          {/* Quick demo credentials toggle */}
          <div className="pt-2 text-center">
            <span className="text-[11px] text-slate-500">
              New to IntervueX? Try{' '}
              <button
                type="button"
                onClick={() => handleFillDemo('candidate')}
                className="text-indigo-400 hover:underline font-medium"
              >
                1-click test credentials
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};

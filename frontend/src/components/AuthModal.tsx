import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
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
  const [tab, setTab] = useState<'login' | 'register' | 'recover' | 'backup_codes_reveal'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [provisionedBackupCodes, setProvisionedBackupCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const { login, register, recoverPassword, isLoading, error, clearError } = useAuthStore();
  const initialInputRef = useRef<HTMLInputElement | null>(null);

  // Focus first input on open or tab change
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
      } else if (tab === 'register') {
        const res = await register({
          email: email.trim(),
          password,
          full_name: fullName.trim() || 'Candidate',
        });
        if (res.backup_codes && res.backup_codes.length > 0) {
          setProvisionedBackupCodes(res.backup_codes);
          setTab('backup_codes_reveal');
        } else {
          setSuccessMsg('Account created successfully! Welcome to IntervueX.');
          setTimeout(() => {
            if (onSuccess) onSuccess();
            else onClose();
          }, 600);
        }
      } else if (tab === 'recover') {
        const res = await recoverPassword({
          email: email.trim(),
          backup_code: backupCodeInput.trim(),
          new_password: password,
        });
        setSuccessMsg(
          `${res.message} (${res.remaining_backup_codes} recovery codes remaining)`
        );
        setTimeout(() => {
          if (onSuccess) onSuccess();
          else onClose();
        }, 800);
      }
    } catch {
      // Error handled by store
    }
  };

  const getDisplayError = (err: string | null): string | null => {
    if (!err) return null;
    if (err.includes('INVALID_CREDENTIALS')) {
      return 'Incorrect email or password. Please check your credentials and try again.';
    }
    if (err.includes('INVALID_RECOVERY_CODE')) {
      return 'Invalid or already consumed backup recovery code. Please check the code and try again.';
    }
    if (err.includes('USER_ALREADY_EXISTS')) {
      return 'An account with this email address already exists. Please sign in instead.';
    }
    if (err.includes('USER_INACTIVE')) {
      return 'This account is currently deactivated. Please contact support.';
    }
    return err;
  };

  const handleCopyBackupCodes = () => {
    const text = provisionedBackupCodes.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleDownloadBackupCodes = () => {
    const text = [
      'IntervueX Emergency Backup Recovery Codes',
      `Account: ${email.trim()}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Each backup code can be used ONCE to recover your account if you forget your password.',
      'Keep these codes in a secure password manager or offline location.',
      '',
      ...provisionedBackupCodes.map((code, idx) => `${idx + 1}. ${code}`),
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `intervuex-recovery-codes-${email.split('@')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Password Strength Indicators
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
              AI Engine
            </span>
          </div>
          <h2 id="auth-modal-title" className="text-xl font-bold text-white tracking-tight">
            {tab === 'login' && 'Sign in to your account'}
            {tab === 'register' && 'Create your account'}
            {tab === 'recover' && 'Recover your account'}
            {tab === 'backup_codes_reveal' && 'Save your backup recovery codes'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {tab === 'login' && 'Access your calibrated interview sessions and evaluation dossiers.'}
            {tab === 'register' && 'Start practicing technical interviews with adaptive AI feedback.'}
            {tab === 'recover' && 'Enter your email and an unused backup code to reset your password.'}
            {tab === 'backup_codes_reveal' && 'Store these single-use codes safely to recover your account if you forget your password.'}
          </p>
        </div>

        {/* Step: Backup Codes Reveal (Post-Registration) */}
        {tab === 'backup_codes_reveal' ? (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="rounded-xl border border-amber-800/60 bg-amber-950/40 p-3 text-xs text-amber-300 flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-200">Critical: Save these recovery codes now</p>
                <p className="text-[11px] text-amber-300/90 mt-0.5">
                  These codes will not be shown again. If you lose your password, an unused backup code is required to recover your account.
                </p>
              </div>
            </div>

            {/* Codes Grid */}
            <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              {provisionedBackupCodes.map((code, idx) => (
                <div
                  key={idx}
                  className="font-mono text-xs font-bold text-indigo-300 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 flex items-center justify-between"
                >
                  <span className="text-[10px] text-slate-500 font-sans">{idx + 1}.</span>
                  <span>{code}</span>
                </div>
              ))}
            </div>

            {/* Action Buttons: Copy & Download */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyBackupCodes}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 py-2 px-3 text-xs font-semibold text-slate-200 transition-colors"
              >
                {copiedCodes ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-indigo-400" />
                    Copy All Codes
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadBackupCodes}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 py-2 px-3 text-xs font-semibold text-slate-200 transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-indigo-400" />
                Download as .txt
              </button>
            </div>

            {/* Acknowledge & Continue */}
            <button
              type="button"
              onClick={() => {
                if (onSuccess) onSuccess();
                else onClose();
              }}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-[0.98]"
            >
              <ShieldCheck className="h-4 w-4" />
              I Have Saved My Recovery Codes
            </button>
          </div>
        ) : (
          <>
            {/* Header Tabs (only in login/register modes) */}
            {tab !== 'recover' && (
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
                  Sign In
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
                  Create Account
                </button>
              </div>
            )}

            {/* Feedback Alerts */}
            {error && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-lg bg-rose-950/60 border border-rose-800/60 p-3 text-xs text-rose-300 animate-in fade-in"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{getDisplayError(error)}</span>
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

            {/* Auth Form */}
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
                      placeholder="e.g. Jane Doe"
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
                    ref={tab !== 'register' ? initialInputRef : undefined}
                    id="auth-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    spellCheck={false}
                    enterKeyHint="next"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Backup Code Input (Only in Recovery Mode) */}
              {tab === 'recover' && (
                <div>
                  <label htmlFor="auth-backup-code" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Emergency Backup Code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
                    <input
                      id="auth-backup-code"
                      name="backup-code"
                      type="text"
                      required
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      value={backupCodeInput}
                      onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                      placeholder="e.g. H7KP-9X2M"
                      className="w-full font-mono uppercase tracking-wider rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-indigo-300 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter one of the 8-character recovery codes you saved upon registration.
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300">
                    {tab === 'recover' ? 'New Password' : 'Password'}
                  </label>
                  {tab === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab('recover');
                        clearError();
                        setSuccessMsg(null);
                      }}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline font-medium"
                    >
                      Forgot password?
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

                {/* Password Strength Indicators (Sign Up & Recovery Modes) */}
                {(tab === 'register' || tab === 'recover') && password.length > 0 && (
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
                ) : tab === 'register' ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {tab === 'login' && 'Sign In'}
                {tab === 'register' && 'Create Account'}
                {tab === 'recover' && 'Reset Password & Sign In'}
              </button>

              {/* Navigation Switch Footer */}
              <div className="pt-2 text-center text-xs text-slate-400">
                {tab === 'login' && (
                  <span>
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setTab('register');
                        clearError();
                        setShowPassword(false);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline"
                    >
                      Create account
                    </button>
                  </span>
                )}
                {tab === 'register' && (
                  <span>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        clearError();
                        setShowPassword(false);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline"
                    >
                      Sign in
                    </button>
                  </span>
                )}
                {tab === 'recover' && (
                  <span>
                    Remembered your password?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        clearError();
                        setShowPassword(false);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 font-medium hover:underline"
                    >
                      Back to sign in
                    </button>
                  </span>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

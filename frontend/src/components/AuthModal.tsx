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
import { CareerDiffLogo } from './CareerDiffLogo';
import { useAuthStore } from '../stores/authStore';

declare global {
  interface Window {
    google?: any;
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

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
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login, register, recoverPassword, loginWithGoogle, isLoading, error, clearError } = useAuthStore();
  const initialInputRef = useRef<HTMLInputElement | null>(null);
  const googleBtnContainerRef = useRef<HTMLDivElement | null>(null);

  // Initialize Google Identity Services (GIS)
  useEffect(() => {
    if (!isOpen || tab === 'recover' || tab === 'backup_codes_reveal') return;
    if (!GOOGLE_CLIENT_ID) return;

    const initGsi = () => {
      if (!window.google?.accounts?.id || !googleBtnContainerRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response: { credential: string }) => {
            setGoogleLoading(true);
            try {
              await loginWithGoogle(response.credential);
              if (onSuccess) onSuccess();
              else onClose();
            } catch {
              // handled by store
            } finally {
              setGoogleLoading(false);
            }
          },
        });

        const containerWidth = googleBtnContainerRef.current?.offsetWidth || 384;
        const buttonWidth = Math.min(Math.max(containerWidth, 200), 400);

        googleBtnContainerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: tab === 'register' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: buttonWidth,
        });
      } catch (err) {
        console.warn('Google GSI initialization notice:', err);
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      const scriptId = 'google-gsi-client';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
      script.addEventListener('load', initGsi);
      return () => script?.removeEventListener('load', initGsi);
    }
  }, [isOpen, tab, loginWithGoogle, onSuccess, onClose]);

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
          setSuccessMsg('Account created successfully! Welcome to CareerDiff.');
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
      'CareerDiff Emergency Backup Recovery Codes',
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
    link.download = `CareerDiff-recovery-codes-${email.split('@')[0]}.txt`;
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
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8 shadow-2xl shadow-black/80 font-sans">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors focus-visible:outline-2 focus-visible:outline-zinc-500"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header Title */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 shadow-sm">
              <CareerDiffLogo className="h-4 w-4" />
            </div>
            <span className="font-semibold text-white text-sm font-mono tracking-tight">
              CareerDiff
            </span>
            <span className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
              Engine v1.0
            </span>
          </div>
          <h2 id="auth-modal-title" className="text-xl font-bold text-white tracking-tight">
            {tab === 'login' && 'Sign in to your account'}
            {tab === 'register' && 'Create your account'}
            {tab === 'recover' && 'Recover your account'}
            {tab === 'backup_codes_reveal' && 'Save your backup recovery codes'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {tab === 'login' && 'Access your calibrated interview sessions and evaluation dossiers.'}
            {tab === 'register' && 'Start practicing technical interviews with adaptive evaluation.'}
            {tab === 'recover' && 'Enter your email and an unused backup code to reset your password.'}
            {tab === 'backup_codes_reveal' && 'Store these single-use codes safely to recover your account if you forget your password.'}
          </p>
        </div>

        {/* Step: Backup Codes Reveal (Post-Registration) */}
        {tab === 'backup_codes_reveal' ? (
          <div className="space-y-4 animate-in fade-in duration-150 font-mono">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-300 flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <p className="font-semibold text-zinc-100">Critical: Save these recovery codes now</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
                  These codes will not be shown again. If you lose your password, an unused backup code is required to recover your account.
                </p>
              </div>
            </div>

            {/* Codes Grid */}
            <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">
              {provisionedBackupCodes.map((code, idx) => (
                <div
                  key={idx}
                  className="font-mono text-xs font-bold text-zinc-200 bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800 flex items-center justify-between"
                >
                  <span className="text-[10px] text-zinc-500 font-sans">{idx + 1}.</span>
                  <span>{code}</span>
                </div>
              ))}
            </div>

            {/* Action Buttons: Copy & Download */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyBackupCodes}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 py-2 px-3 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                {copiedCodes ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-zinc-400" />
                    Copy All Codes
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadBackupCodes}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-zinc-700 py-2 px-3 text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
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
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-zinc-950 hover:bg-zinc-200 shadow-sm transition-all active:scale-[0.98]"
            >
              <ShieldCheck className="h-4 w-4" />
              I Have Saved My Recovery Codes
            </button>
          </div>
        ) : (
          <>
            {/* Header Tabs (only in login/register modes) */}
            {tab !== 'recover' && (
              <div className="flex border-b border-zinc-800 pb-2 mb-5 font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    clearError();
                    setShowPassword(false);
                  }}
                  className={`flex-1 pb-2 text-xs font-semibold transition-all border-b-2 -mb-[10px] ${tab === 'login'
                      ? 'border-white text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
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
                  className={`flex-1 pb-2 text-xs font-semibold transition-all border-b-2 -mb-[10px] ${tab === 'register'
                      ? 'border-white text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
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
                className="mb-4 flex items-center gap-2 rounded-lg bg-rose-950/60 border border-rose-800/60 p-3 text-xs text-rose-300 animate-in fade-in font-mono"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{getDisplayError(error)}</span>
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="mb-4 flex items-center gap-2 rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs text-emerald-400 animate-in fade-in font-mono"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Google OAuth Quick Sign-In */}
            <div className="space-y-3 mb-4">
              <div
                ref={googleBtnContainerRef}
                className="w-full flex items-center justify-center min-h-[44px] overflow-hidden rounded-lg [&>div]:!bg-transparent [&>div]:!border-none [&>div]:!shadow-none [&>div]:w-full [&>div]:flex [&>div]:justify-center [&_iframe]:!bg-transparent [&_iframe]:!rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!GOOGLE_CLIENT_ID) {
                      alert(
                        'Google OAuth is configured and verified in the backend! To enable browser Google One-Tap, set VITE_GOOGLE_CLIENT_ID in frontend/.env.'
                      );
                    }
                  }}
                  disabled={isLoading || googleLoading}
                  className="w-full flex items-center justify-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:bg-zinc-800/80 hover:border-zinc-700 py-2.5 px-4 text-xs font-semibold text-zinc-200 hover:text-white transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 font-sans"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  ) : (
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>
                    {tab === 'register' ? 'Sign up with Google' : 'Continue with Google'}
                  </span>
                </button>
              </div>

              <div className="relative flex items-center justify-center my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <span className="relative bg-zinc-900 px-2.5 text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Auth Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
              {tab === 'register' && (
                <div>
                  <label htmlFor="auth-fullname" className="block text-xs font-medium text-zinc-300 mb-1.5 font-sans">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
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
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-all font-sans"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300 mb-1.5 font-sans">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
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
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-all font-sans"
                  />
                </div>
              </div>

              {/* Backup Code Input (Only in Recovery Mode) */}
              {tab === 'recover' && (
                <div>
                  <label htmlFor="auth-backup-code" className="block text-xs font-medium text-zinc-300 mb-1.5 font-sans">
                    Emergency Backup Code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
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
                      className="w-full font-mono uppercase tracking-wider rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-xs sm:text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 font-mono">
                    Enter one of the 8-character recovery codes you saved upon registration.
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-medium text-zinc-300 font-sans">
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
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 hover:underline font-mono"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
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
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-10 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-all font-sans"
                  />
                  {/* Show / Hide Password Eye Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    tabIndex={0}
                    className="absolute right-2.5 top-2.5 rounded p-1 text-zinc-400 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-500 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-zinc-300" />
                    ) : (
                      <Eye className="h-4 w-4 text-zinc-400" />
                    )}
                  </button>
                </div>

                {/* Password Strength Indicators (Sign Up & Recovery Modes) */}
                {(tab === 'register' || tab === 'recover') && password.length > 0 && (
                  <div className="mt-2 space-y-1.5 animate-in fade-in duration-150 font-mono">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${strengthScore === 1
                              ? 'w-1/3 bg-rose-500'
                              : strengthScore === 2
                                ? 'w-2/3 bg-zinc-400'
                                : 'w-full bg-emerald-500'
                            }`}
                        />
                      </div>
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                        {strengthScore === 1 ? 'Weak' : strengthScore === 2 ? 'Fair' : 'Strong'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                      <span className={hasMinLength ? 'text-emerald-400 font-medium' : 'text-zinc-600'}>
                        ✓ 8+ chars
                      </span>
                      <span className={hasMixedChars ? 'text-emerald-400 font-medium' : 'text-zinc-600'}>
                        ✓ letters &amp; numbers
                      </span>
                      <span className={hasSpecial ? 'text-emerald-400 font-medium' : 'text-zinc-600'}>
                        ✓ symbol
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-3 flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-zinc-950 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-sm font-sans"
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
              <div className="pt-2 text-center text-xs text-zinc-400 font-mono">
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
                      className="text-zinc-200 hover:text-white font-medium hover:underline ml-1"
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
                      className="text-zinc-200 hover:text-white font-medium hover:underline ml-1"
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
                      className="text-zinc-200 hover:text-white font-medium hover:underline ml-1"
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

import React, { useCallback, useEffect, useState } from 'react';
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
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { authApi } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import type { UserProfileResponse } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'backup_codes' | 'danger'>('profile');

  // Profile data
  const [profileData, setProfileData] = useState<UserProfileResponse | null>(null);
  const isLoadingProfile = isOpen && profileData === null;

  // Password update form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Backup codes regeneration state
  const [isRegeneratingCodes, setIsRegeneratingCodes] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [codesError, setCodesError] = useState<string | null>(null);

  // Danger zone (Account Deletion) state
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCloseModal = useCallback(() => {
    setProfileData(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordSuccess(null);
    setPasswordError(null);
    setNewBackupCodes(null);
    setCodesError(null);
    setDeletePassword('');
    setConfirmDeleteText('');
    setShowDeletePassword(false);
    setIsDeletingAccount(false);
    setDeleteError(null);
    onClose();
  }, [onClose]);

  // Fetch fresh profile data on open
  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    authApi
      .getProfile()
      .then((res) => {
        if (isSubscribed) {
          setProfileData(res);
        }
      })
      .catch(() => {
        // Handled gracefully with fallback defaults
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCloseModal]);

  if (!isOpen) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match. Please verify and try again.');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(res.message || 'Password successfully updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      setPasswordError(msg);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleRegenerateCodes = async () => {
    setIsRegeneratingCodes(true);
    setCodesError(null);
    try {
      const res = await authApi.regenerateBackupCodes();
      setNewBackupCodes(res.backup_codes);
      if (profileData) {
        setProfileData({
          ...profileData,
          remaining_backup_codes: res.count,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate backup codes';
      setCodesError(msg);
    } finally {
      setIsRegeneratingCodes(false);
    }
  };

  const handleCopyCodes = () => {
    if (!newBackupCodes) return;
    navigator.clipboard.writeText(newBackupCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleDownloadCodes = () => {
    if (!newBackupCodes) return;
    const text = [
      'IntervueX Emergency Backup Recovery Codes',
      `Account: ${profileData?.email || user?.email}`,
      `Regenerated: ${new Date().toISOString()}`,
      '',
      'Each backup code can be used ONCE to recover your account if you forget your password.',
      'Keep these codes in a secure password manager or offline location.',
      '',
      ...newBackupCodes.map((code, idx) => `${idx + 1}. ${code}`),
    ].join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `intervuex-recovery-codes-${(user?.email || 'user').split('@')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);

    if (confirmDeleteText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('You must type DELETE in all caps to confirm account erasure.');
      return;
    }

    if (!deletePassword) {
      setDeleteError('Please enter your current password to authorize account erasure.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await authApi.deleteAccount({
        current_password: deletePassword,
        confirmation_text: confirmDeleteText.trim(),
      });
      logout();
      handleCloseModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account. Please verify credentials.';
      setDeleteError(msg);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Password strength
  const hasMinLength = newPassword.length >= 8;
  const hasMixedChars = /\d/.test(newPassword) && /[a-zA-Z]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const strengthScore = [hasMinLength, hasMixedChars, hasSpecial].filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8 shadow-2xl shadow-black/80 font-sans">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleCloseModal}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors focus-visible:outline-2 focus-visible:outline-zinc-500"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 border border-zinc-700 shadow-sm text-zinc-200">
            <UserIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 id="profile-modal-title" className="text-lg font-bold text-white tracking-tight">
              {profileData?.full_name || user?.full_name || 'Candidate Profile'}
            </h2>
            <p className="text-xs text-zinc-400 font-mono">{profileData?.email || user?.email}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 pb-2 mb-6 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex-1 pb-2 text-xs font-mono font-medium transition-all border-b-2 -mb-[10px] ${
              activeTab === 'profile'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('password')}
            className={`flex-1 pb-2 text-xs font-mono font-medium transition-all border-b-2 -mb-[10px] ${
              activeTab === 'password'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('backup_codes')}
            className={`flex-1 pb-2 text-xs font-mono font-medium transition-all border-b-2 -mb-[10px] ${
              activeTab === 'backup_codes'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Recovery
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('danger')}
            className={`flex-1 pb-2 text-xs font-mono font-medium transition-all border-b-2 -mb-[10px] ${
              activeTab === 'danger'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-zinc-500 hover:text-rose-400'
            }`}
          >
            Danger Zone
          </button>
        </div>

        {/* Tab 1: Profile Overview */}
        {activeTab === 'profile' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {isLoadingProfile ? (
              <div className="py-8 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mb-2" />
                <span className="text-xs">Loading profile intelligence...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Target Seniority
                    </span>
                    <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      {profileData?.target_seniority || 'SENIOR'}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Primary Discipline
                    </span>
                    <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-indigo-400" />
                      {profileData?.primary_discipline || 'BACKEND'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Experience Track</span>
                    <span className="font-semibold text-slate-200">
                      {profileData?.years_experience ? `${profileData.years_experience} Years` : 'Calibrating'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Emergency Recovery Codes</span>
                    <span className="font-semibold text-emerald-400">
                      {profileData?.remaining_backup_codes ?? 8} Remaining
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Account Access</span>
                    <span className="font-semibold text-indigo-300">Active</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('password')}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 py-2.5 px-4 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    <Lock className="h-3.5 w-3.5 text-indigo-400" />
                    Manage Password &amp; Credentials
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Change Password */}
        {activeTab === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4 animate-in fade-in duration-150">
            {passwordError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-rose-950/60 border border-rose-800/60 p-3 text-xs text-rose-300 animate-in fade-in"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-lg bg-emerald-950/60 border border-emerald-800/60 p-3 text-xs text-emerald-300 animate-in fade-in"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {/* Current Password */}
            <div>
              <label htmlFor="profile-current-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Current Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  id="profile-current-password"
                  name="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                  className="absolute right-2.5 top-2 rounded p-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4 text-indigo-400" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="profile-new-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  id="profile-new-password"
                  name="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="•••••••• (min 8 chars)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-10 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  className="absolute right-2.5 top-2 rounded p-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4 text-indigo-400" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength indicator */}
              {newPassword.length > 0 && (
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
                </div>
              )}
            </div>

            {/* Confirm New Password */}
            <div>
              <label htmlFor="profile-confirm-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
                <input
                  id="profile-confirm-password"
                  name="confirmPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {isUpdatingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" />
                  Update Password
                </>
              )}
            </button>
          </form>
        )}

        {/* Tab 3: Emergency Backup Codes */}
        {activeTab === 'backup_codes' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center justify-between text-slate-200 font-semibold">
                <span>Recovery Status</span>
                <span className="text-emerald-400">{profileData?.remaining_backup_codes ?? 8} Unused Codes</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Emergency backup codes can be used to reset your password if you ever forget it. Each code is single-use and consumed permanently upon recovery.
              </p>
            </div>

            {codesError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-rose-950/60 border border-rose-800/60 p-3 text-xs text-rose-300 animate-in fade-in"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{codesError}</span>
              </div>
            )}

            {newBackupCodes ? (
              <div className="space-y-3 animate-in fade-in">
                <div className="rounded-xl border border-amber-800/60 bg-amber-950/40 p-3 text-xs text-amber-300 flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-200">Fresh Recovery Codes Generated</p>
                    <p className="text-[11px] text-amber-300/90 mt-0.5">
                      Save these codes now. All previously generated codes are now permanently invalidated.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  {newBackupCodes.map((code, idx) => (
                    <div
                      key={idx}
                      className="font-mono text-xs font-bold text-indigo-300 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 flex items-center justify-between"
                    >
                      <span className="text-[10px] text-slate-500 font-sans">{idx + 1}.</span>
                      <span>{code}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCodes}
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
                        Copy All
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadCodes}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 py-2 px-3 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-indigo-400" />
                    Download .txt
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRegenerateCodes}
                disabled={isRegeneratingCodes}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-700/60 py-2.5 px-4 text-xs font-semibold text-indigo-200 transition-colors"
              >
                {isRegeneratingCodes ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                    Generating Fresh Codes...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 text-indigo-400" />
                    Regenerate 8 Fresh Backup Codes
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Tab 4: Danger Zone - Permanent Account Deletion */}
        {activeTab === 'danger' && (
          <form onSubmit={handleDeleteAccountSubmit} className="space-y-4 animate-in fade-in duration-150">
            <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-xs text-rose-200 space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-semibold font-mono">
                <Trash2 className="h-4 w-4 shrink-0 text-rose-400" />
                <span>Permanent Account Erasure (GDPR Right to Erasure)</span>
              </div>
              <p className="text-[11px] text-rose-300/80 leading-relaxed font-sans">
                This operation is immediate and irreversible. All of your candidate intelligence—including uploaded resumes, extracted claims, past interview sessions, live transcripts, and rubric assessment reports—will be permanently purged from PostgreSQL.
              </p>
            </div>

            {deleteError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-rose-950/60 border border-rose-800/60 p-3 text-xs text-rose-300 animate-in fade-in font-mono"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Current Password confirmation */}
            <div>
              <label htmlFor="delete-account-password" className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                Current Password <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
                <input
                  id="delete-account-password"
                  name="deletePassword"
                  type={showDeletePassword ? 'text' : 'password'}
                  required
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-10 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword((prev) => !prev)}
                  aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-2 rounded p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {showDeletePassword ? <EyeOff className="h-4 w-4 text-zinc-200" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirmation text input */}
            <div>
              <label htmlFor="delete-account-confirm-text" className="block text-xs font-mono font-medium text-zinc-300 mb-1.5">
                Type <span className="font-bold text-rose-400 font-mono">DELETE</span> to confirm <span className="text-rose-400">*</span>
              </label>
              <input
                id="delete-account-confirm-text"
                name="confirmDeleteText"
                type="text"
                required
                value={confirmDeleteText}
                onChange={(e) => setConfirmDeleteText(e.target.value)}
                placeholder="Type DELETE in capital letters"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 px-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isDeletingAccount || confirmDeleteText.trim().toUpperCase() !== 'DELETE' || !deletePassword}
              className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 px-4 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {isDeletingAccount ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Permanently Deleting Account...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Permanently Delete My Account &amp; Data
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

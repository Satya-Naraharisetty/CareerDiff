import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Layers,
  MessageSquare,
  Mic,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { interviewsApi, rolesApi } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useInterviewStore } from '../stores/interviewStore';
import type {
  InterviewBlueprintRead,
  InterviewMode,
  JobRoleRead,
  SeniorityLevel,
} from '../types';

interface InterviewSetupProps {
  onStartInterview: () => void;
  onOpenAuth: () => void;
}

const SENIORITY_LEVELS: { id: SeniorityLevel; title: string; desc: string }[] = [
  { id: 'JUNIOR', title: 'Junior Engineer', desc: 'Core fundamentals, code semantics, basic debugging' },
  { id: 'MID', title: 'Mid-Level Engineer', desc: 'System tradeoffs, concurrency, database performance' },
  { id: 'SENIOR', title: 'Senior Engineer', desc: 'Distributed systems, fault tolerance, architectural guardrails' },
  { id: 'STAFF', title: 'Staff / Principal', desc: 'High-throughput topologies, multi-datacenter consensus, strategic vision' },
];

export const InterviewSetup: React.FC<InterviewSetupProps> = ({ onStartInterview, onOpenAuth }) => {
  const { isAuthenticated } = useAuthStore();
  const { setInterview } = useInterviewStore();

  const [roles, setRoles] = useState<JobRoleRead[]>([]);
  const [selectedRole, setSelectedRole] = useState<JobRoleRead | null>(null);
  const [seniority, setSeniority] = useState<SeniorityLevel>('SENIOR');
  const [duration, setDuration] = useState<number>(30);
  const [mode, setMode] = useState<InterviewMode>('VOICE');

  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createdBlueprint, setCreatedBlueprint] = useState<InterviewBlueprintRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRoles() {
      try {
        const res = await rolesApi.list();
        setRoles(res.items || []);
        if (res.items?.length > 0) {
          setSelectedRole(res.items[0]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load roles';
        setError(msg);
      } finally {
        setIsLoadingRoles(false);
      }
    }
    loadRoles();
  }, []);

  const handleCreate = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }
    if (!selectedRole) {
      setError('Please select a target job role.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const res = await interviewsApi.create({
        role_id: selectedRole.id,
        target_seniority: seniority,
        duration_minutes: duration,
        mode,
      });

      setCreatedBlueprint(res.blueprint);
      setInterview(
        res.interview_id,
        res.state,
        mode,
        seniority,
        res.blueprint
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Interview creation failed';
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero Header */}
      <div className="mb-8 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-950/60 border border-indigo-800/40 px-3 py-1 text-xs font-semibold text-indigo-300 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          Autonomous Technical Interview Simulator
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Targeted Interview Calibration
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-2xl">
          Deterministic session policies, resume-grounded blueprinting, and real-time adaptive questioning powered by our decoupled interview engine.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-800/60 bg-rose-950/40 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Main Configuration Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Step 1: Target Role Selection */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 mb-4 flex items-center gap-2">
              <Layers className="h-4 w-4" /> 1. Select Discipline & Role
            </h2>

            {isLoadingRoles ? (
              <div className="h-24 rounded-lg bg-slate-800/40 animate-pulse flex items-center justify-center text-xs text-slate-500">
                Loading role catalog...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roles.map((role) => {
                  const isSelected = selectedRole?.id === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={`text-left rounded-xl p-3.5 border transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-950/40 shadow-sm shadow-indigo-500/10'
                          : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="font-semibold text-slate-100 text-sm">{role.name}</div>
                      <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                        {role.description || 'Core technical interview evaluation.'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {role.competencies.slice(0, 3).map((comp) => (
                          <span
                            key={comp.id}
                            className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300"
                          >
                            {comp.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2: Seniority Calibrator */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> 2. Target Seniority Level
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SENIORITY_LEVELS.map((lvl) => {
                const isSelected = seniority === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setSeniority(lvl.id)}
                    className={`text-left rounded-xl p-3.5 border transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/40 shadow-sm shadow-indigo-500/10'
                        : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100 text-sm">{lvl.title}</span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                        {lvl.id}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{lvl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Duration & Interaction Mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Duration Budget
              </h2>
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    className={`rounded-lg py-2 text-xs font-bold border transition-all ${
                      duration === mins
                        ? 'border-indigo-500 bg-indigo-600 text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-1.5">
                <Mic className="h-4 w-4" /> Interaction Protocol
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('VOICE')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-bold border transition-all ${
                    mode === 'VOICE'
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <Mic className="h-3.5 w-3.5" />
                  Live Voice (WS)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('TEXT')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-bold border transition-all ${
                    mode === 'TEXT'
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Text Turn Mode
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Summary / Blueprint Preview Column */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <h3 className="text-base font-bold text-white mb-4">Session Blueprint Preview</h3>

            {createdBlueprint ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 p-3 text-xs text-emerald-300">
                  Blueprint generated! Total allocated:{' '}
                  <span className="font-bold">{Math.round(createdBlueprint.total_allocated_seconds / 60)} minutes</span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Topic Timeline
                  </span>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {createdBlueprint.topics.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg bg-slate-950 p-2.5 text-xs border border-slate-800"
                      >
                        <span className="font-medium text-slate-200">{t.topic_name}</span>
                        <span className="text-indigo-400 font-mono font-semibold">{t.allocated_seconds}s</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onStartInterview}
                  className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-400 transition-all active:scale-[0.98]"
                >
                  Enter Practice Room <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Discipline:</span>
                    <span className="font-semibold text-slate-200">{selectedRole?.name || 'None'}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Level:</span>
                    <span className="font-semibold text-slate-200">{seniority}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Duration:</span>
                    <span className="font-semibold text-slate-200">{duration} Minutes</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Mode:</span>
                    <span className="font-semibold text-indigo-400">{mode}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isCreating || !selectedRole}
                  onClick={handleCreate}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {isCreating ? 'Compiling Blueprint...' : 'Initialize Session Blueprint'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

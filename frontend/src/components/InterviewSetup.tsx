import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { DeviceCheckModal } from './DeviceCheckModal';
import { interviewsApi, resumesApi, rolesApi } from '../lib/api';
import { isSkipAuthEnabled, useAuthStore } from '../stores/authStore';
import { useInterviewStore } from '../stores/interviewStore';
import type {
  CompanyAnalysisResponse,
  CompanyPersona,
  InterviewBlueprintRead,
  InterviewMode,
  JdAnalysisResponse,
  JobRoleRead,
  ResumeAnalysisResponse,
  ResumeJdMatchResponse,
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

const COMPANY_PERSONAS: {
  id: CompanyPersona;
  title: string;
  badge: string;
  icon: string;
  desc: string;
  focus: string;
}[] = [
  {
    id: 'STANDARD',
    title: 'Balanced Standard',
    badge: 'Universal Core',
    icon: '🌐',
    desc: 'Core architecture fundamentals, clean modular interfaces, concurrency control, and pragmatic trade-offs.',
    focus: 'Concurrency, REST/gRPC, Caching, DB Query Tuning',
  },
  {
    id: 'BIG_TECH',
    title: 'Hyperscale Big Tech',
    badge: 'Google / Meta / AWS',
    icon: '🏢',
    desc: 'Distributed systems at massive scale (millions QPS), CAP theorem trade-offs, and multi-region consensus.',
    focus: 'Consensus (Raft/Paxos), Multi-Region Replicas, Failure Partitions',
  },
  {
    id: 'SCALE_UP',
    title: 'High-Velocity Scale-Up',
    badge: 'Stripe / Uber / Airbnb',
    icon: '⚡',
    desc: 'Pragmatic feature velocity, developer ergonomics, monolith modularization, and event queues.',
    focus: 'Idempotency Keys, Event Bus, Fast Rollbacks, Observability',
  },
  {
    id: 'FINTECH',
    title: 'FinTech & Banking',
    badge: 'Mission-Critical',
    icon: '🛡️',
    desc: 'Zero data loss, strict ACID transactions, double-entry audit ledgers, and deterministic states.',
    focus: 'Audit Trails, Cryptographic Verification, Strict p99 Latency',
  },
];

const SUPPORTED_LANGUAGES = ['Python', 'Java', 'TypeScript', 'JavaScript', 'Go', 'Rust', 'C++', 'C#', 'SQL'];

const SAMPLE_JD_TEXT = `Role: Senior Distributed Systems Architect - Payments Infrastructure
Company: GlobalFinTech Corp
Location: Remote (US / EMEA)

About the Team:
Our Payments Infrastructure team is building next-generation event-driven ledger systems handling tens of thousands of financial transactions per second across multi-region datacenters.

What You'll Do:
• Architect, implement, and operate low-latency, highly available distributed payment services.
• Design event streaming pipelines using Apache Kafka, guaranteeing strict message ordering, deduplication, and exactly-once semantics.
• Scale relational databases (PostgreSQL) and distributed caches (Redis) with multi-region active-passive failover and automated read replicas.
• Ensure microservice reliability using rate limiters, distributed locks, circuit breakers, and zero-downtime deployment strategies.

Requirements:
• 6+ years of backend engineering experience designing distributed systems with Python, FastAPI, Go, or Java.
• Deep practical experience with event streaming pipelines using Kafka, RabbitMQ, or AWS Kinesis.
• Proven expertise tuning PostgreSQL query performance, MVCC vacuum behavior, and composite indexing.
• Strong foundation in distributed concurrency, idempotency tokens, and network fault tolerance.`;

export const InterviewSetup: React.FC<InterviewSetupProps> = ({ onStartInterview, onOpenAuth }) => {
  const { isAuthenticated } = useAuthStore();
  const isAuthed = isAuthenticated || isSkipAuthEnabled();
  const { setInterview } = useInterviewStore();

  const [roles, setRoles] = useState<JobRoleRead[]>([]);
  const [selectedRole, setSelectedRole] = useState<JobRoleRead | null>(null);
  const [seniority, setSeniority] = useState<SeniorityLevel>('SENIOR');
  const [duration, setDuration] = useState<number>(30);
  const [mode, setMode] = useState<InterviewMode>('VOICE');
  const [userSelectedLanguage, setUserSelectedLanguage] = useState<string | null>(null);
  const [companyPersona, setCompanyPersona] = useState<CompanyPersona>('STANDARD');
  const [targetCompany, setTargetCompany] = useState<string>('');
  const [isAnalyzingCompany, setIsAnalyzingCompany] = useState<boolean>(false);
  const [companyAnalysisResult, setCompanyAnalysisResult] = useState<CompanyAnalysisResponse | null>(null);
  const [isDeviceCheckOpen, setIsDeviceCheckOpen] = useState<boolean>(false);
  const [currentPhase, setCurrentPhase] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1: Resume Ingestion State (DEFAULT OPTION IS UPLOAD FILE)
  const [resumeTab, setResumeTab] = useState<'upload' | 'paste'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // Start empty: sample content is only loaded on request ("Load sample"), never submitted silently.
  const [resumeText, setResumeText] = useState('');
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysisResponse | null>(null);
  const [resumeSuccessMsg, setResumeSuccessMsg] = useState<string | null>(null);

  // Step 2: Target Calibration State (DEFAULT OPTION IS PASTE JD)
  const [targetTab, setTargetTab] = useState<'jd' | 'discipline'>('jd');
  const [jdText, setJdText] = useState('');
  // Snapshots of exactly what was analyzed, so later edits don't silently diverge from the analysis.
  const [analyzedResumeText, setAnalyzedResumeText] = useState<string>('');
  const [analyzedJdText, setAnalyzedJdText] = useState<string>('');
  const [isAnalyzingJd, setIsAnalyzingJd] = useState(false);
  const [jdAnalysis, setJdAnalysis] = useState<JdAnalysisResponse | null>(null);
  const [jdSuccessMsg, setJdSuccessMsg] = useState<string | null>(null);

  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createdBlueprint, setCreatedBlueprint] = useState<InterviewBlueprintRead | null>(null);
  const [matchAnalysis, setMatchAnalysis] = useState<ResumeJdMatchResponse | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectedLanguages = React.useMemo(() => {
    const all = [
      ...(resumeAnalysis?.verified_skills || []),
      ...(jdAnalysis?.matched_technologies || []),
    ];
    return SUPPORTED_LANGUAGES.filter((lang) =>
      all.some((skill) => skill.toLowerCase() === lang.toLowerCase())
    );
  }, [resumeAnalysis, jdAnalysis]);

  const preferredLanguage = userSelectedLanguage ?? (detectedLanguages[0] || 'Python');
  const setPreferredLanguage = (lang: string) => setUserSelectedLanguage(lang);

  // Comparative Intelligence: resume vs. JD fit, recomputed (debounced) only when the analyzed
  // inputs change — not on every keystroke — and stale responses are discarded.
  useEffect(() => {
    if (!resumeAnalysis || (!jdAnalysis && !selectedRole)) {
      setMatchAnalysis(null);
      return;
    }
    const resumeBody =
      analyzedResumeText ||
      [resumeAnalysis.summary, ...resumeAnalysis.claims.map((c) => c.claim_text)].filter(Boolean).join('\n');
    const jdBody = jdAnalysis && analyzedJdText
      ? analyzedJdText
      : `${selectedRole?.name || ''}\n${selectedRole?.description || ''}\n${(selectedRole?.competencies || []).map((c) => c.name).join(', ')}`;
    if (resumeBody.trim().length < 10 || jdBody.trim().length < 10) {
      setMatchAnalysis(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsMatching(true);
      try {
        const res = await rolesApi.matchResumeJd({
          resume_text: resumeBody,
          jd_text: jdBody,
          resume_skills: resumeAnalysis.verified_skills,
          jd_technologies: jdAnalysis?.matched_technologies || [],
          candidate_seniority: seniority,
          required_seniority: jdAnalysis?.detected_seniority || seniority,
        });
        if (!cancelled) setMatchAnalysis(res);
      } catch (err) {
        if (!cancelled) console.warn('Resume vs JD match calculation failed:', err);
      } finally {
        if (!cancelled) setIsMatching(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resumeAnalysis, jdAnalysis, selectedRole, seniority, analyzedResumeText, analyzedJdText]);

  // Any change to the session configuration after the plan was compiled invalidates that plan,
  // so the candidate never enters an interview with settings different from what they see.
  const configKey = `${selectedRole?.id}|${seniority}|${duration}|${mode}|${preferredLanguage}|${companyPersona}|${targetCompany.trim()}`;
  const compiledConfigKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (createdBlueprint && compiledConfigKeyRef.current && compiledConfigKeyRef.current !== configKey) {
      setCreatedBlueprint(null);
      compiledConfigKeyRef.current = null;
    }
  }, [configKey, createdBlueprint]);

  useEffect(() => {
    async function initData() {
      try {
        const rolesRes = await rolesApi.list();
        setRoles(rolesRes.items || []);
        if (rolesRes.items?.length > 0) {
          setSelectedRole(rolesRes.items[0]);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load setup catalog';
        setError(msg);
      } finally {
        setIsLoadingRoles(false);
      }
    }
    initData();
  }, [isAuthed]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const analyzeResumeFile = async (file: File) => {
    if (!isAuthed) {
      onOpenAuth();
      return;
    }

    setIsAnalyzingResume(true);
    setError(null);
    setResumeSuccessMsg(null);

    try {
      const analysis = await resumesApi.uploadFile(file);
      setAnalyzedResumeText('');
      setResumeAnalysis(analysis);
      setSeniority(analysis.detected_seniority);
      setResumeSuccessMsg(
        `Resume parsed successfully! Extracted ${analysis.claims.length} technical claims and ${analysis.verified_skills.length} skills.`
      );

      if (analysis.recommended_role_id) {
        const matched = roles.find((r) => r.id === analysis.recommended_role_id);
        if (matched) setSelectedRole(matched);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze resume';
      setError(msg);
      setResumeAnalysis(null);
    } finally {
      setIsAnalyzingResume(false);
    }
  };

  const analyzeResumeTextContent = async (text: string) => {
    if (!isAuthed) {
      onOpenAuth();
      return;
    }

    if (!text.trim()) {
      setError('Please provide candidate resume text before analyzing.');
      return;
    }

    setIsAnalyzingResume(true);
    setError(null);
    setResumeSuccessMsg(null);

    try {
      const analysis = await resumesApi.uploadText({
        raw_text: text.trim(),
        filename: 'candidate_resume.txt',
      });
      setAnalyzedResumeText(text.trim());
      setResumeAnalysis(analysis);
      setSeniority(analysis.detected_seniority);
      setResumeSuccessMsg(
        `Resume parsed successfully! Extracted ${analysis.claims.length} technical claims and ${analysis.verified_skills.length} skills.`
      );

      if (analysis.recommended_role_id) {
        const matched = roles.find((r) => r.id === analysis.recommended_role_id);
        if (matched) setSelectedRole(matched);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze resume';
      setError(msg);
      setResumeAnalysis(null);
    } finally {
      setIsAnalyzingResume(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const validExts = ['.pdf', '.docx', '.txt'];
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (validExts.includes(fileExt)) {
        setSelectedFile(file);
        setError(null);
        void analyzeResumeFile(file);
      } else {
        setError('Please drop a valid resume file (.pdf, .docx, or .txt).');
      }
    }
  };

  const runCompanyAnalysis = async (companyName: string) => {
    if (!companyName.trim()) return;
    setIsAnalyzingCompany(true);
    try {
      const res = await rolesApi.analyzeCompany({
        company_name: companyName.trim(),
        jd_text: jdAnalysis && analyzedJdText ? analyzedJdText : undefined,
      });
      setCompanyAnalysisResult(res);
      setCompanyPersona(res.detected_persona);
    } catch (err) {
      console.warn('Company analysis failed:', err);
    } finally {
      setIsAnalyzingCompany(false);
    }
  };

  const handleAnalyzeJd = async () => {
    if (!isAuthed) {
      onOpenAuth();
      return;
    }
    if (!jdText.trim()) {
      setError('Please paste Job Description text to analyze.');
      return;
    }

    setIsAnalyzingJd(true);
    setError(null);
    setJdSuccessMsg(null);

    try {
      const res = await rolesApi.analyzeJd({ jd_text: jdText.trim() });
      setAnalyzedJdText(jdText.trim());
      setJdAnalysis(res);
      setSelectedRole(res.role);
      setSeniority(res.detected_seniority);
      if (res.suggested_company_name) {
        setTargetCompany(res.suggested_company_name);
        void runCompanyAnalysis(res.suggested_company_name);
      } else if (res.suggested_persona) {
        setCompanyPersona(res.suggested_persona);
      }
      setJdSuccessMsg(`Calibrated interview track for '${res.extracted_title}' (${res.detected_seniority}) with ${res.tailored_competencies.length} tailored competencies!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze Job Description';
      setError(msg);
    } finally {
      setIsAnalyzingJd(false);
    }
  };

  const handleCreate = async () => {
    if (!isAuthed) {
      onOpenAuth();
      return;
    }
    if (!resumeAnalysis) {
      setError('Please upload and calibrate your resume before initializing an interview.');
      setCurrentPhase(1);
      return;
    }
    if (!selectedRole) {
      setError('Please select a target job role or paste a Job Description.');
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
        preferred_language: preferredLanguage,
        jd_text: jdAnalysis && analyzedJdText ? analyzedJdText : undefined,
        company_persona: companyPersona,
        target_company: targetCompany.trim() || undefined,
      });

      setCreatedBlueprint(res.blueprint);
      compiledConfigKeyRef.current = configKey;
      setInterview(
        res.interview_id,
        res.state,
        mode,
        seniority,
        res.blueprint,
        preferredLanguage
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Interview creation failed';
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="text-center sm:text-left space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/90 px-3 py-1 text-xs font-mono text-zinc-300 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span>Calibration Studio • Target &amp; Provenance Setup</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white font-sans">
          Candidate Intelligence &amp; Target Calibration
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
          Upload your resume and paste your target Job Description (or choose a standardized discipline) to compile an interview blueprint grounded in verified experience claims.
        </p>
      </div>

      {!isAuthed && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-3.5 text-xs text-zinc-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm font-sans">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-zinc-400" />
            <span>You are viewing the calibration studio in preview mode. Sign in to analyze your resume and compile live interview sessions.</span>
          </div>
          <button
            type="button"
            onClick={onOpenAuth}
            className="shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-colors shadow-sm"
          >
            Sign In Now
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-900/60 bg-rose-950/40 p-3.5 text-xs text-rose-300 font-mono">
          {error}
        </div>
      )}

      {resumeSuccessMsg && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-3.5 text-xs text-zinc-200 flex items-center gap-2 font-mono">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{resumeSuccessMsg}</span>
        </div>
      )}

      {jdSuccessMsg && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-3.5 text-xs text-zinc-200 flex items-center gap-2 font-mono">
          <Briefcase className="h-4 w-4 shrink-0 text-zinc-400" />
          <span>{jdSuccessMsg}</span>
        </div>
      )}

      {/* 5-Phase Interactive Calibration Stepper */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-2 sm:p-3 backdrop-blur-md shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
          {[
            {
              phase: 1 as const,
              num: '01',
              title: 'Resume',
              subtitle: resumeAnalysis ? `${resumeAnalysis.claims.length} Claims` : 'Upload File',
            },
            {
              phase: 2 as const,
              num: '02',
              title: 'Job Description',
              subtitle: jdAnalysis ? jdAnalysis.extracted_title : selectedRole ? selectedRole.name : 'Target Role',
            },
            {
              phase: 3 as const,
              num: '03',
              title: 'Seniority & Lang',
              subtitle: `${seniority} • ${preferredLanguage}`,
            },
            {
              phase: 4 as const,
              num: '04',
              title: 'Persona & Format',
              subtitle: `${companyPersona} • ${duration}m`,
            },
            {
              phase: 5 as const,
              num: '05',
              title: 'Initialize & Launch',
              subtitle: createdBlueprint ? 'Compiled' : 'Review & Start',
            },
          ].map((item) => {
            const isActive = currentPhase === item.phase;
            const isCompleted = currentPhase > item.phase;
            const isLocked = item.phase > 1 && !resumeAnalysis;
            return (
              <button
                key={item.phase}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (isLocked) {
                    setError('Please upload and extract your resume before proceeding to subsequent calibration phases.');
                    return;
                  }
                  setError(null);
                  setCurrentPhase(item.phase);
                }}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'border-emerald-500/80 bg-emerald-950/40 text-white shadow-sm ring-1 ring-emerald-500/40'
                    : isCompleted
                    ? 'border-zinc-800 bg-zinc-950/80 text-zinc-300 hover:border-zinc-700 hover:text-white'
                    : isLocked
                    ? 'border-transparent text-zinc-600 opacity-50 cursor-not-allowed'
                    : 'border-transparent text-zinc-500 hover:text-zinc-400'
                }`}
                title={isLocked ? 'Upload resume first to unlock' : undefined}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                      : isCompleted
                      ? 'border-emerald-700/80 bg-emerald-950/80 text-emerald-400'
                      : isLocked
                      ? 'border-zinc-900 bg-zinc-950 text-zinc-600'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-500'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isLocked ? (
                    <Lock className="h-3 w-3 text-zinc-600" />
                  ) : (
                    item.num
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className={`font-semibold truncate ${
                      isActive
                        ? 'text-white'
                        : isCompleted
                        ? 'text-zinc-200'
                        : isLocked
                        ? 'text-zinc-600'
                        : 'text-zinc-400'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className={`text-[10px] truncate hidden sm:block ${isLocked ? 'text-zinc-700' : 'text-zinc-500'}`}>
                    {item.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Phased Configuration Area */}
      <div className="space-y-6">
        {/* PHASE 1: RESUME INGESTION */}
        {currentPhase === 1 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80 mb-4">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-zinc-400" /> Phase 1: Candidate Experience &amp; Resume Ingestion
              </h2>

              <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setResumeTab('upload')}
                    aria-pressed={resumeTab === 'upload'}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                    resumeTab === 'upload'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setResumeTab('paste')}
                    aria-pressed={resumeTab === 'paste'}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                    resumeTab === 'paste'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Paste Text
                </button>
              </div>
            </div>

            {resumeTab === 'upload' ? (
              <div className="space-y-3">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                    isDraggingFile
                      ? 'border-emerald-400 bg-emerald-950/20 ring-2 ring-emerald-500/20'
                      : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-950/70'
                  }`}
                >
                  <Upload
                    className={`h-7 w-7 mb-2 transition-colors ${
                      isDraggingFile ? 'text-emerald-400 animate-bounce' : 'text-zinc-400'
                    }`}
                  />
                  <p className="text-xs font-semibold text-zinc-200">
                    {isDraggingFile
                      ? 'Drop your resume file to load'
                      : 'Drag & drop your resume file here, or browse'}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                    Text &amp; claims extracted with character-offset provenance • Max 10MB
                  </p>

                  <div className="flex items-center gap-1.5 mt-2.5">
                    {['PDF', 'DOCX', 'TXT'].map((ext) => (
                      <span
                        key={ext}
                        className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-mono text-zinc-400 border border-zinc-800"
                      >
                        .{ext.toLowerCase()}
                      </span>
                    ))}
                  </div>

                  <label className="mt-3.5 inline-flex items-center gap-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3.5 py-1.5 text-xs font-semibold cursor-pointer border border-zinc-700 transition-colors shadow-sm">
                    <FileText className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Select Resume File</span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setSelectedFile(file);
                          setError(null);
                          void analyzeResumeFile(file);
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  {selectedFile && (
                    <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs font-mono text-emerald-400 shadow-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate max-w-[200px] sm:max-w-xs">{selectedFile.name}</span>
                      <span className="text-zinc-500 text-[11px]">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          setResumeAnalysis(null);
                          setResumeSuccessMsg(null);
                        }}
                        className="ml-1 text-zinc-500 hover:text-zinc-300 p-0.5"
                        title="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <span className="block text-xs text-zinc-400">
                  Candidate resume plain text / markdown:
                </span>
                <textarea
                  rows={6}
                  value={resumeText}
                  onChange={(e) => {
                    setResumeText(e.target.value);
                    if (!e.target.value.trim()) {
                      setResumeAnalysis(null);
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && pasted.trim().length > 30) {
                      setResumeText(pasted);
                      void analyzeResumeTextContent(pasted);
                    }
                  }}
                  onBlur={() => {
                    if (resumeText.trim().length > 30 && resumeText.trim() !== analyzedResumeText) {
                      void analyzeResumeTextContent(resumeText);
                    }
                  }}
                  placeholder="Paste candidate resume here (work history, technologies, achievements)..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
            )}

            {/* Automatic Extraction Status Indicator */}
            {isAnalyzingResume ? (
              <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 p-3 text-xs font-mono text-emerald-300 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />
                <span>Extracting candidate claims, skills, and provenance in background...</span>
              </div>
            ) : (
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-500 font-mono">
                <span>Grounds interview questions and blueprint topics in your verified claims.</span>
                <span className="text-[11px] text-zinc-400">
                  {resumeAnalysis ? '✓ Resume analyzed & verified' : 'Extraction starts automatically on upload'}
                </span>
              </div>
            )}

            {/* Resume Analysis Output Card */}
            {resumeAnalysis && (
              <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 space-y-3 font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-300">Parsed Profile:</span>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-medium text-white border border-zinc-700">
                      {resumeAnalysis.detected_seniority}
                    </span>
                    <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 border border-zinc-800">
                      {resumeAnalysis.primary_discipline} Track
                    </span>
                    <span className="text-xs text-zinc-400">
                      ~{resumeAnalysis.years_experience} YOE
                    </span>
                  </div>
                  <span className="text-xs text-emerald-400 font-medium">
                    {resumeAnalysis.claims.length} Claims Indexed
                  </span>
                </div>

                {resumeAnalysis.summary && (
                  <p className="text-xs text-zinc-300 bg-zinc-900/60 p-2.5 rounded border border-zinc-800/80 leading-relaxed font-sans">
                    "{resumeAnalysis.summary}"
                  </p>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                    Extracted Technical Keywords
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {resumeAnalysis.verified_skills.map((skill, sIdx) => (
                      <span
                        key={sIdx}
                        className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300 border border-zinc-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Phase 1 Navigation Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-zinc-800/80">
              <span className="text-xs text-zinc-500 font-mono">
                {resumeAnalysis
                  ? '✓ Resume verified. Ready to calibrate target role.'
                  : 'Resume upload or paste required to proceed.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!resumeAnalysis) {
                    setError('Please upload or paste your resume before proceeding to the job description phase.');
                    return;
                  }
                  setError(null);
                  setCurrentPhase(2);
                }}
                disabled={!resumeAnalysis || isAnalyzingResume}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold transition-all shadow-md ${
                  !resumeAnalysis || isAnalyzingResume
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60'
                    : 'bg-white text-zinc-950 hover:bg-zinc-200 active:scale-95'
                }`}
              >
                {isAnalyzingResume ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Extracting Resume...</span>
                  </>
                ) : !resumeAnalysis ? (
                  <>
                    <Lock className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Upload Resume to Proceed</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Job Description</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* PHASE 2: TARGET JOB DESCRIPTION & ALIGNMENT */}
        {currentPhase === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Target Calibration Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 text-zinc-400" /> Phase 2: Target Calibration (Paste JD or Pick Discipline)
                </h2>

              <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTargetTab('jd')}
                    aria-pressed={targetTab === 'jd'}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                    targetTab === 'jd'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Paste JD (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetTab('discipline')}
                    aria-pressed={targetTab === 'discipline'}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                    targetTab === 'discipline'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Choose Discipline
                </button>
              </div>
            </div>

            {targetTab === 'jd' ? (
              /* TAB A: PASTE JOB DESCRIPTION */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-zinc-400">
                  <span>Paste any target Job Description (JD) text:</span>
                  <button
                    type="button"
                    onClick={() => setJdText(SAMPLE_JD_TEXT)}
                    className="text-zinc-300 hover:text-white underline font-mono text-[11px] self-start sm:self-auto"
                  >
                    Load Sample Senior Payments JD
                  </button>
                </div>
                <textarea
                  rows={7}
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste Job Description (requirements, responsibilities, required technologies)..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500 font-mono">
                    Extracts required competencies, seniority, and matches against your resume claims.
                  </span>
                  <button
                    type="button"
                    disabled={isAnalyzingJd || !jdText.trim()}
                    onClick={handleAnalyzeJd}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-white py-2 px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98] shrink-0 shadow-sm"
                  >
                    {isAnalyzingJd ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Calibrating JD...
                      </>
                    ) : (
                      <>
                        <Compass className="h-3.5 w-3.5" />
                        Analyze JD &amp; Tailor Competencies
                      </>
                    )}
                  </button>
                </div>

                {/* JD Analysis Results Card */}
                {jdAnalysis && (
                  <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 space-y-3 font-mono">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-white font-sans">{jdAnalysis.extracted_title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs font-medium text-white border border-zinc-700">
                            {jdAnalysis.detected_seniority}
                          </span>
                          <span className="rounded bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 border border-zinc-800">
                            {jdAnalysis.primary_discipline} Track
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-zinc-300 font-medium bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800">
                        Active Interview Role
                      </span>
                    </div>

                    {jdAnalysis.key_requirements.length > 0 && (
                      <div>
                        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                          Key JD Requirements
                        </span>
                        <ul className="text-xs text-zinc-300 space-y-1 font-sans">
                          {jdAnalysis.key_requirements.slice(0, 3).map((req, rIdx) => (
                            <li key={rIdx} className="flex items-start gap-1.5">
                              <span className="text-zinc-500">•</span>
                              <span className="line-clamp-1">{req}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                        Tailored Blueprint Competencies
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {jdAnalysis.tailored_competencies.map((comp) => (
                          <div
                            key={comp.id}
                            className="rounded bg-zinc-900/90 p-2 text-xs border border-zinc-800"
                          >
                            <span className="font-medium text-zinc-200 block font-sans">{comp.name}</span>
                            <span className="text-[11px] text-zinc-400 line-clamp-1 font-sans">{comp.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* TAB B: CHOOSE TARGET DISCIPLINE */
              <div className="space-y-3">
                <span className="text-xs text-zinc-400 block mb-2 font-mono">
                  Select a standardized engineering discipline from our rubric catalog:
                </span>
                {isLoadingRoles ? (
                  <div className="h-24 rounded-lg bg-zinc-900/40 animate-pulse flex items-center justify-center text-xs text-zinc-500 font-mono">
                    Loading role catalog...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {roles.map((role) => {
                      const isSelected = selectedRole?.id === role.id && !jdAnalysis;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => {
                            setSelectedRole(role);
                            setJdAnalysis(null);
                          }}
                          className={`text-left rounded-lg p-3.5 border transition-all ${
                            isSelected
                              ? 'border-zinc-500 bg-zinc-800/90 text-white ring-1 ring-zinc-500/20'
                              : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50'
                          }`}
                        >
                          <div className="font-semibold text-zinc-100 text-xs sm:text-sm">{role.name}</div>
                          <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                            {role.description || 'Core technical interview evaluation.'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1 font-mono">
                            {role.competencies.slice(0, 3).map((comp) => (
                              <span
                                key={comp.id}
                                className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-300 border border-zinc-800"
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
            )}
          </div>

          {/* STEP 3: COMPARATIVE INTELLIGENCE: RESUME VS JD ALIGNMENT */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-400" />
                <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200">
                  Step 3: Comparative Alignment Matrix (Resume vs. Target JD)
                </h2>
              </div>
              {matchAnalysis ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/70 border border-emerald-800/80 px-2.5 py-0.5 text-xs font-mono font-bold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {matchAnalysis.match_score_pct}% Match
                  </span>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-300 border border-zinc-700">
                    {matchAnalysis.seniority_fit} Fit
                  </span>
                </div>
              ) : isMatching ? (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  <span>Computing alignment matrix...</span>
                </div>
              ) : null}
            </div>

            {matchAnalysis ? (
              <div className="space-y-4">
                <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                  {matchAnalysis.alignment_summary}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Direct Matches */}
                  <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-2">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Direct Matched Skills ({matchAnalysis.matched_skills.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {matchAnalysis.matched_skills.length > 0 ? (
                        matchAnalysis.matched_skills.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 px-1.5 py-0.5 text-[11px] font-mono"
                          >
                            ✓ {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-zinc-500 font-mono">No direct tech overlap detected</span>
                      )}
                    </div>
                  </div>

                  {/* Identified Gaps */}
                  <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-2">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Identified Gaps ({matchAnalysis.missing_skills.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {matchAnalysis.missing_skills.length > 0 ? (
                        matchAnalysis.missing_skills.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-amber-950/30 text-amber-300 border border-amber-800/50 px-1.5 py-0.5 text-[11px] font-mono"
                          >
                            ⚠️ {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-zinc-500 font-mono">Zero core skill gaps found</span>
                      )}
                    </div>
                  </div>

                  {/* Differentiating Strengths */}
                  <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/90 p-3 space-y-2">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Candidate Strengths ({matchAnalysis.differentiating_skills.length})
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {matchAnalysis.differentiating_skills.length > 0 ? (
                        matchAnalysis.differentiating_skills.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-indigo-950/30 text-indigo-300 border border-indigo-800/50 px-1.5 py-0.5 text-[11px] font-mono"
                          >
                            ⭐ {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-zinc-500 font-mono">Standard stack alignment</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Adaptive Strategy Alert */}
                <div className="rounded-lg border border-zinc-700/80 bg-zinc-950 p-3 text-xs text-zinc-300 font-sans flex items-start gap-2.5 shadow-sm">
                  <Compass className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white block mb-0.5 font-mono text-[11px]">
                      Adaptive Interview Calibration:
                    </span>
                    <p className="text-zinc-400 leading-relaxed text-xs">
                      {matchAnalysis.adaptive_interview_strategy}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-4 text-xs text-zinc-400 flex items-center gap-3">
                <Compass className="h-4 w-4 text-zinc-500 shrink-0" />
                <span>
                  {resumeAnalysis
                    ? 'Target role selected. Paste a custom Job Description in Step 2 to generate tailored skill gaps and match percentages.'
                    : 'Upload your resume in Step 1 to unlock live comparative alignment, skill gap detection, and adaptive strategy calibration.'}
                </span>
              </div>
            )}
          </div>

          {/* Phase 2 Navigation Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setCurrentPhase(1)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-all shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back: Resume Ingestion</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPhase(3)}
              disabled={isAnalyzingJd}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-md active:scale-95"
            >
              <span>Continue to Seniority &amp; Language</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

        {/* PHASE 3: SENIORITY LEVEL & PREFERRED IMPLEMENTATION LANGUAGE */}
        {currentPhase === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Target Seniority Level Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 pb-2 border-b border-zinc-800/80">
                <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" /> Phase 3 (Part A): Target Seniority Level
                </h2>
                <span className="text-[11px] font-mono text-zinc-400">Calibrates system design &amp; architectural scope</span>
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SENIORITY_LEVELS.map((lvl) => {
                const isSelected = seniority === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setSeniority(lvl.id)}
                    aria-pressed={seniority === lvl.id}
                    className={`text-left rounded-lg p-3.5 border transition-all ${
                      isSelected
                        ? 'border-zinc-500 bg-zinc-800/90 text-white ring-1 ring-zinc-500/20'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100 text-xs sm:text-sm">{lvl.title}</span>
                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] font-mono font-medium text-zinc-300 border border-zinc-800">
                        {lvl.id}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">{lvl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 5: PREFERRED IMPLEMENTATION LANGUAGE */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 backdrop-blur-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Code2 className="h-3.5 w-3.5 text-zinc-400" />
                Step 5: Preferred Implementation Language
              </h2>
              {detectedLanguages.length > 0 && (
                <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
                  <span className="text-emerald-400 font-medium">⚡ Detected in profile:</span>
                  <div className="flex items-center gap-1">
                    {detectedLanguages.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setPreferredLanguage(lang)}
                    aria-pressed={preferredLanguage === lang}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium border transition-colors ${
                          preferredLanguage === lang
                            ? 'border-emerald-500 bg-emerald-950/80 text-emerald-300'
                            : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-400">
              Select your primary coding language. The Adaptive Interview Engine will frame implementation questions, concurrency models, and scratchpad presets in this language.
            </p>

            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 pt-1">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = preferredLanguage === lang;
                const isDetected = detectedLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setPreferredLanguage(lang)}
                    aria-pressed={preferredLanguage === lang}
                    className={`relative rounded-lg py-2 px-2.5 text-xs font-mono font-semibold border transition-all text-center ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-500/30 shadow-sm'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <span>{lang}</span>
                    {isDetected && !isSelected && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-zinc-900" title="Detected in resume / JD" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phase 3 Navigation Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setCurrentPhase(2)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-all shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back: Job Description</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPhase(4)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-md active:scale-95"
            >
              <span>Continue to Persona &amp; Format</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 4: COMPANY PERSONA, SCALE, DURATION & INTERACTION */}
      {currentPhase === 4 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* STEP 6: COMPANY INTERVIEW PERSONA */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
                Step 6: Company Interview Persona &amp; Scale Calibration
              </h2>
              <span className="text-[11px] font-mono text-zinc-400">
                Calibrates questioning depth, scale expectations &amp; trade-off focus
              </span>
            </div>

            {/* Target Company Name Search & Intelligence Bar */}
            <div className="rounded-lg bg-zinc-950/70 border border-zinc-800 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <label className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                  <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Target Company Archetype (Optional):</span>
                </label>
                <span className="text-[11px] text-zinc-500">Auto-deduces company scale &amp; culture</span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runCompanyAnalysis(targetCompany);
                      }
                    }}
                    placeholder="Enter company name (e.g. Stripe, Google, JPMorgan, Databricks, Citadel, or any startup)..."
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 font-sans"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => runCompanyAnalysis(targetCompany)}
                  disabled={isAnalyzingCompany || !targetCompany.trim()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0 font-mono"
                >
                  {isAnalyzingCompany ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>{isAnalyzingCompany ? 'Analyzing...' : 'Calibrate Company'}</span>
                </button>
              </div>

              {/* Quick Company Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-mono">
                <span className="text-zinc-500 text-[11px]">Popular:</span>
                {[
                  { name: 'Stripe', persona: 'SCALE_UP' },
                  { name: 'Google', persona: 'BIG_TECH' },
                  { name: 'JPMorgan', persona: 'FINTECH' },
                  { name: 'Databricks', persona: 'SCALE_UP' },
                  { name: 'Citadel', persona: 'FINTECH' },
                  { name: 'Netflix', persona: 'BIG_TECH' },
                  { name: 'Airbnb', persona: 'SCALE_UP' },
                ].map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      setTargetCompany(item.name);
                      runCompanyAnalysis(item.name);
                    }}
                    className={`rounded px-2 py-0.5 text-[11px] border transition-colors ${
                      targetCompany.toLowerCase() === item.name.toLowerCase()
                        ? 'border-indigo-500 bg-indigo-950/70 text-indigo-300 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Calibration Intelligence Result Card */}
            {companyAnalysisResult && (
              <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-4 space-y-2.5 font-mono text-xs shadow-sm animate-in fade-in duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/40 pb-2">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                    <Sparkles className="h-4 w-4 text-indigo-400" />
                    <span>Auto-Calibrated for "{companyAnalysisResult.company_name}"</span>
                    <span className="rounded bg-indigo-900/60 px-2 py-0.5 text-[11px] text-indigo-200 border border-indigo-800">
                      {companyAnalysisResult.scale_tier}
                    </span>
                  </div>
                  <div>
                    {companyPersona === companyAnalysisResult.detected_persona ? (
                      <span className="rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2.5 py-0.5 text-[11px] font-bold">
                        ✓ Active Persona Calibrated
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 px-2.5 py-0.5 text-[11px] font-bold">
                        Manual Override Active
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-zinc-300 text-xs font-sans leading-relaxed">
                  {companyAnalysisResult.rationale}
                </p>
                {companyAnalysisResult.architectural_focus.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-zinc-500 font-mono">Key Architecture Focus:</span>
                    {companyAnalysisResult.architectural_focus.map((f, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-zinc-950 px-2 py-0.5 text-[11px] text-indigo-300 border border-zinc-800"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4 Persona Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {COMPANY_PERSONAS.map((p) => {
                const isSelected = companyPersona === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setCompanyPersona(p.id);
                    }}
                    className={`text-left rounded-lg p-3.5 border transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/30 text-white ring-1 ring-indigo-500/30 shadow-sm'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{p.icon}</span>
                        <span className="font-semibold text-zinc-100 text-xs sm:text-sm">{p.title}</span>
                      </div>
                      <span className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-mono font-medium text-indigo-400 border border-zinc-800">
                        {p.badge}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed font-sans">{p.desc}</p>
                    <div className="mt-2 text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                      <span className="text-indigo-400">Focus:</span>
                      <span>{p.focus}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 7: INTERACTION & DURATION */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 backdrop-blur-sm">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-zinc-400" /> Duration Budget
              </h2>
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setDuration(mins)}
                    aria-pressed={duration === mins}
                    className={`rounded-lg py-2 text-xs font-mono font-semibold border transition-all ${
                      duration === mins
                        ? 'border-zinc-500 bg-white text-zinc-950 shadow-sm'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 backdrop-blur-sm">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 mb-3 flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-zinc-400" /> Interaction Protocol
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('VOICE')}
                    aria-pressed={mode === 'VOICE'}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-mono font-semibold border transition-all ${
                    mode === 'VOICE'
                      ? 'border-zinc-500 bg-white text-zinc-950 shadow-sm'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <Mic className="h-3.5 w-3.5" />
                  Live Voice (WS)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('TEXT')}
                    aria-pressed={mode === 'TEXT'}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-mono font-semibold border transition-all ${
                    mode === 'TEXT'
                      ? 'border-zinc-500 bg-white text-zinc-950 shadow-sm'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Text Turn Mode
                </button>
              </div>
            </div>
          </div>

          {/* Phase 4 Navigation Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setCurrentPhase(3)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-all shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back: Seniority &amp; Language</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!createdBlueprint && selectedRole) {
                  void handleCreate();
                }
                setCurrentPhase(5);
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all shadow-md active:scale-95"
            >
              <span>Review &amp; Initialize Session</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 5: THE INITIALIZATION POINT */}
      {currentPhase === 5 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header & Status Banner */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 backdrop-blur-sm shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
                  05
                </div>
                <div>
                  <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200">
                    Phase 5: Session Initialization &amp; Preflight
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Review your grounded configuration and verified experience claims before entering the live interview room.
                  </p>
                </div>
              </div>
              {createdBlueprint ? (
                <span className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 px-3 py-1 text-xs font-mono font-bold text-emerald-400 shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Blueprint Compiled &amp; Grounded
                </span>
              ) : (
                <span className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-full bg-amber-950/80 border border-amber-800/80 px-3 py-1 text-xs font-mono font-bold text-amber-400 shadow-sm">
                  Pending Blueprint Compilation
                </span>
              )}
            </div>

            {/* 4-Card Calibration Summary Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
              {/* Card 1: Candidate Claims */}
              <div className="rounded-lg bg-zinc-950/80 border border-zinc-800/80 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-zinc-400" /> Resume Profile
                  </span>
                  <span className="text-emerald-400 font-bold">{resumeAnalysis ? 'Loaded' : 'None'}</span>
                </div>
                <div className="text-white font-semibold text-sm truncate">
                  {resumeAnalysis ? `${resumeAnalysis.claims.length} Claims Verified` : 'No Resume'}
                </div>
                <p className="text-[11px] text-zinc-500 font-sans truncate">
                  {resumeAnalysis?.recommended_role_name || resumeAnalysis?.primary_discipline || 'Experience claims extracted'}
                </p>
              </div>

              {/* Card 2: Target JD & Seniority */}
              <div className="rounded-lg bg-zinc-950/80 border border-zinc-800/80 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5 text-zinc-400" /> Target &amp; Track
                  </span>
                  <span className="text-emerald-400 font-bold">{seniority}</span>
                </div>
                <div className="text-white font-semibold text-sm truncate">
                  {selectedRole?.name || 'Standard Track'}
                </div>
                <p className="text-[11px] text-zinc-500 font-sans truncate">
                  {matchAnalysis ? `${matchAnalysis.match_score_pct}% Match Alignment` : 'Calibrated discipline'}
                </p>
              </div>

              {/* Card 3: Persona & Architecture */}
              <div className="rounded-lg bg-zinc-950/80 border border-zinc-800/80 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-zinc-400" /> Company Persona
                  </span>
                  <span className="text-indigo-400 font-bold">{companyPersona}</span>
                </div>
                <div className="text-white font-semibold text-sm truncate">
                  {targetCompany.trim() || 'Custom Archetype'}
                </div>
                <p className="text-[11px] text-zinc-500 font-sans truncate">
                  Language: <span className="text-emerald-400 font-semibold">{preferredLanguage}</span>
                </p>
              </div>

              {/* Card 4: Format & Duration */}
              <div className="rounded-lg bg-zinc-950/80 border border-zinc-800/80 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-zinc-400" /> Session Format
                  </span>
                  <span className="text-zinc-200 font-bold">{duration} mins</span>
                </div>
                <div className="text-white font-semibold text-sm truncate">
                  {mode === 'VOICE' ? 'Live Voice (WS)' : 'Text Turn Mode'}
                </div>
                <p className="text-[11px] text-zinc-500 font-sans truncate">
                  Neural 24kHz Studio Audio
                </p>
              </div>
            </div>
          </div>

          {/* Blueprint Topic Breakdown or Compile CTA */}
          {createdBlueprint ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 backdrop-blur-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-800/80 pb-3">
                <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Grounded Session Blueprint &amp; Topic Schedule
                </h3>
                <span className="text-xs font-mono text-emerald-400 font-bold">
                  {Math.round(createdBlueprint.total_allocated_seconds / 60)}m Allocated Session
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {createdBlueprint.topics.map((t, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg bg-zinc-950/80 p-3.5 border border-zinc-800/80 space-y-2 font-mono text-xs hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                      <span className="font-semibold text-zinc-100 text-sm truncate">{t.topic_name}</span>
                      <span className="rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 font-bold">
                        {Math.round(t.allocated_seconds / 60)}m ({t.allocated_seconds}s)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-500">Grounded Claims:</span>
                      <span className="text-emerald-400 font-semibold">
                        {t.mapped_claims_count} Claim{t.mapped_claims_count === 1 ? '' : 's'} Mapped
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hardware Preflight Banner */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300">
                    <Camera className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white font-mono">Hardware Readiness Preflight</div>
                    <div className="text-xs text-zinc-400 font-sans">
                      Verify microphone input, camera self-view, and network latency before entering.
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsDeviceCheckOpen(true)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 px-4 py-2.5 text-xs font-semibold text-white transition-all shadow-sm active:scale-95"
                  >
                    <Camera className="h-4 w-4 text-zinc-400" />
                    <span>Test Audio &amp; Camera</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-sm font-semibold text-white font-mono">
                  Ready to Compile Grounded Blueprint
                </h3>
                <p className="text-xs text-zinc-400 font-sans">
                  Click below to compile your adaptive session blueprint grounded in your verified resume claims and target company architecture.
                </p>
              </div>
              <button
                type="button"
                disabled={isCreating || !selectedRole}
                onClick={handleCreate}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-xs font-bold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Compiling Blueprint...</span>
                  </>
                ) : (
                  <>
                    <span>Initialize Session Blueprint</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Phase 5 Navigation Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => setCurrentPhase(4)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-all shadow-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back: Persona &amp; Format</span>
            </button>

            {createdBlueprint && (
              <button
                type="button"
                onClick={() => setIsDeviceCheckOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-2.5 text-xs font-bold text-zinc-950 hover:bg-zinc-200 transition-all shadow-md active:scale-95"
              >
                <span>Enter Live Interview Room</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Hardware Readiness & Permissions Check Modal */}
      <DeviceCheckModal
        isOpen={isDeviceCheckOpen}
        onClose={() => setIsDeviceCheckOpen(false)}
        onProceedToInterview={() => {
          setIsDeviceCheckOpen(false);
          onStartInterview();
        }}
        mode={mode}
      />
    </div>
  );
};

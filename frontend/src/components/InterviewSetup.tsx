import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Building2,
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
import { interviewsApi, resumesApi, rolesApi } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
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

const SAMPLE_RESUME_TEXT = `Alex Rivera
Senior Distributed Systems & Backend Engineer
alex.rivera@example.com | 7+ years of experience

SUMMARY
Senior Backend Architect with 7+ years of hands-on experience designing high-throughput distributed microservices, event streaming architectures, and resilient databases in Python, FastAPI, Kafka, and PostgreSQL.

TECHNICAL SKILLS
Languages & Frameworks: Python, FastAPI, Django, TypeScript
Databases & Storage: PostgreSQL, Redis, SQLAlchemy, Alembic, Cassandra
Distributed Systems: Kafka, RabbitMQ, Microservices, gRPC, Distributed Locking
Infrastructure: Docker, Kubernetes, AWS, CI/CD, Linux

PROFESSIONAL EXPERIENCE
Senior Backend Engineer | FinTech Systems (2021 - Present)
• Architected low-latency Kafka pipeline processing 50k events/sec with sub-25ms P99 latency.
• Scaled PostgreSQL database using read replicas, custom MVCC query tuning, and Redis caching.
• Developed resilient microservices using Python and FastAPI with automatic circuit breakers and idempotency keys.
• Implemented distributed locking with Redlock algorithm to eliminate double-spend race conditions in payment ledger.

Backend Software Engineer | CloudScale Inc (2018 - 2021)
• Built RESTful API platform handling 15M daily requests with 99.99% uptime.
• Migrated legacy monolithic services to Docker containers orchestrated by Kubernetes on AWS.
• Reduced database query bottlenecks by 45% through composite B-tree indexing and connection pooling.`;

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
  const { setInterview } = useInterviewStore();

  const [roles, setRoles] = useState<JobRoleRead[]>([]);
  const [selectedRole, setSelectedRole] = useState<JobRoleRead | null>(null);
  const [seniority, setSeniority] = useState<SeniorityLevel>('SENIOR');
  const [duration, setDuration] = useState<number>(30);
  const [mode, setMode] = useState<InterviewMode>('VOICE');
  const [preferredLanguage, setPreferredLanguage] = useState<string>('Python');
  const [companyPersona, setCompanyPersona] = useState<CompanyPersona>('STANDARD');
  const [targetCompany, setTargetCompany] = useState<string>('GlobalFinTech Corp');
  const [isAnalyzingCompany, setIsAnalyzingCompany] = useState<boolean>(false);
  const [companyAnalysisResult, setCompanyAnalysisResult] = useState<CompanyAnalysisResponse | null>(null);

  // Step 1: Resume Ingestion State (DEFAULT OPTION IS UPLOAD FILE)
  const [resumeTab, setResumeTab] = useState<'upload' | 'paste'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [resumeText, setResumeText] = useState(SAMPLE_RESUME_TEXT);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysisResponse | null>(null);
  const [resumeSuccessMsg, setResumeSuccessMsg] = useState<string | null>(null);

  // Step 2: Target Calibration State (DEFAULT OPTION IS PASTE JD)
  const [targetTab, setTargetTab] = useState<'jd' | 'discipline'>('jd');
  const [jdText, setJdText] = useState(SAMPLE_JD_TEXT);
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

  useEffect(() => {
    if (detectedLanguages.length > 0 && !detectedLanguages.includes(preferredLanguage)) {
      setPreferredLanguage(detectedLanguages[0]);
    }
  }, [detectedLanguages]);

  // Comparative Intelligence: Compute Resume vs. JD fit matrix whenever context updates
  useEffect(() => {
    async function runComparativeMatch() {
      if (!resumeAnalysis || (!jdAnalysis && !selectedRole)) {
        setMatchAnalysis(null);
        return;
      }
      setIsMatching(true);
      try {
        const jdBody = jdAnalysis
          ? jdText
          : `${selectedRole?.name || ''}\n${selectedRole?.description || ''}\n${(selectedRole?.competencies || []).map((c) => c.name).join(', ')}`;
        const jdTechs = jdAnalysis?.matched_technologies || [];
        const res = await rolesApi.matchResumeJd({
          resume_text: resumeText || SAMPLE_RESUME_TEXT,
          jd_text: jdBody,
          resume_skills: resumeAnalysis.verified_skills,
          jd_technologies: jdTechs,
          candidate_seniority: seniority,
          required_seniority: jdAnalysis?.detected_seniority || seniority,
        });
        setMatchAnalysis(res);
      } catch (err) {
        console.warn('Resume vs JD match calculation failed:', err);
      } finally {
        setIsMatching(false);
      }
    }
    runComparativeMatch();
  }, [resumeAnalysis, jdAnalysis, selectedRole, seniority, jdText, resumeText]);

  useEffect(() => {
    async function initData() {
      try {
        const rolesRes = await rolesApi.list();
        setRoles(rolesRes.items || []);
        if (rolesRes.items?.length > 0) {
          setSelectedRole(rolesRes.items[0]);
        }

        // Check if user already has an analyzed resume
        if (isAuthenticated) {
          try {
            const latestResume = await resumesApi.getLatest();
            if (latestResume) {
              setResumeAnalysis(latestResume);
              setSeniority(latestResume.detected_seniority);
              if (latestResume.recommended_role_id) {
                const matched = rolesRes.items.find((r) => r.id === latestResume.recommended_role_id);
                if (matched) setSelectedRole(matched);
              }
            }
          } catch {
            // No resume uploaded yet
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load setup catalog';
        setError(msg);
      } finally {
        setIsLoadingRoles(false);
      }
    }
    initData();
  }, [isAuthenticated]);

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
      } else {
        setError('Please drop a valid resume file (.pdf, .docx, or .txt).');
      }
    }
  };

  const handleAnalyzeResume = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }

    setIsAnalyzingResume(true);
    setError(null);
    setResumeSuccessMsg(null);

    try {
      let analysis: ResumeAnalysisResponse;
      if (resumeTab === 'upload') {
        if (!selectedFile) {
          setError('Please select a PDF, DOCX, or TXT resume file to upload.');
          setIsAnalyzingResume(false);
          return;
        }
        analysis = await resumesApi.uploadFile(selectedFile);
      } else {
        if (!resumeText.trim()) {
          setError('Please paste resume text before analyzing.');
          setIsAnalyzingResume(false);
          return;
        }
        analysis = await resumesApi.uploadText({
          raw_text: resumeText.trim(),
          filename: 'candidate_resume.txt',
        });
      }

      setResumeAnalysis(analysis);
      setSeniority(analysis.detected_seniority);
      setResumeSuccessMsg(`Resume parsed successfully! Extracted ${analysis.claims.length} technical claims and ${analysis.verified_skills.length} skills.`);

      if (analysis.recommended_role_id) {
        const matched = roles.find((r) => r.id === analysis.recommended_role_id);
        if (matched) setSelectedRole(matched);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze resume';
      setError(msg);
    } finally {
      setIsAnalyzingResume(false);
    }
  };

  const runCompanyAnalysis = async (companyName: string) => {
    if (!companyName.trim()) return;
    setIsAnalyzingCompany(true);
    try {
      const res = await rolesApi.analyzeCompany({
        company_name: companyName.trim(),
        jd_text: jdAnalysis ? jdText : undefined,
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
    if (!isAuthenticated) {
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
    if (!isAuthenticated) {
      onOpenAuth();
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
        jd_text: jdAnalysis ? jdText : undefined,
        company_persona: companyPersona,
        target_company: targetCompany.trim() || undefined,
      });

      setCreatedBlueprint(res.blueprint);
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

      {!isAuthenticated && (
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

      {/* 3-Stage Workflow Stepper */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-sm shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
          {/* Stage 1 */}
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                resumeAnalysis
                  ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-400 shadow-sm shadow-emerald-500/10'
                  : isAnalyzingResume
                  ? 'bg-zinc-800 border-zinc-600 text-zinc-100 animate-pulse'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              {resumeAnalysis ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isAnalyzingResume ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                '01'
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">
                {resumeAnalysis ? 'Resume Ingested' : 'Ingest Resume'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                {resumeAnalysis
                  ? `${resumeAnalysis.claims.length} claims extracted`
                  : 'Upload file or paste text'}
              </div>
            </div>
          </div>

          {/* Stage 2 */}
          <div className="flex items-center gap-3 sm:border-l sm:border-zinc-800/80 sm:pl-4">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                jdAnalysis || selectedRole
                  ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-400 shadow-sm shadow-emerald-500/10'
                  : isAnalyzingJd
                  ? 'bg-zinc-800 border-zinc-600 text-zinc-100 animate-pulse'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              {jdAnalysis || selectedRole ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isAnalyzingJd ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                '02'
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">
                {jdAnalysis
                  ? 'JD Calibrated'
                  : selectedRole
                  ? 'Role Selected'
                  : 'Target Calibration'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                {jdAnalysis
                  ? jdAnalysis.extracted_title
                  : selectedRole
                  ? selectedRole.name
                  : 'Paste JD or pick discipline'}
              </div>
            </div>
          </div>

          {/* Stage 3 */}
          <div className="flex items-center gap-3 sm:border-l sm:border-zinc-800/80 sm:pl-4">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                createdBlueprint
                  ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-400 shadow-sm shadow-emerald-500/10'
                  : isCreating
                  ? 'bg-zinc-800 border-zinc-600 text-zinc-100 animate-pulse'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              {createdBlueprint ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                '03'
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">
                {createdBlueprint ? 'Blueprint Compiled' : 'Compile Blueprint'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                {createdBlueprint
                  ? `${Math.round(createdBlueprint.total_allocated_seconds / 60)}m interview plan`
                  : 'Adaptive rubric ready'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* STEP 1: RESUME INGESTION (DEFAULT OPTION IS UPLOAD) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80 mb-4">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-zinc-400" /> 1. Upload Candidate Resume (Default)
              </h2>

              <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setResumeTab('upload')}
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
                        className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-mono text-zinc-400 border border-zinc-800"
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
                          setSelectedFile(e.target.files[0]);
                          setError(null);
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  {selectedFile && (
                    <div className="mt-3.5 flex items-center gap-2 rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs font-mono text-emerald-400 shadow-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate max-w-[200px] sm:max-w-xs">{selectedFile.name}</span>
                      <span className="text-zinc-500 text-[10px]">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-zinc-400">
                  <span>Candidate resume plain text / markdown:</span>
                  <button
                    type="button"
                    onClick={() => setResumeText(SAMPLE_RESUME_TEXT)}
                    className="text-zinc-300 hover:text-white underline font-mono text-[11px] self-start sm:self-auto"
                  >
                    Load Sample Senior Resume
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste candidate resume here (work history, technologies, achievements)..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                />
              </div>
            )}

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-zinc-500 font-mono">
                Grounds interview questions and blueprint topics in your verified claims.
              </span>
              <button
                type="button"
                disabled={isAnalyzingResume}
                onClick={handleAnalyzeResume}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-white py-2 px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 transition-all active:scale-[0.98] shrink-0 shadow-sm"
              >
                {isAnalyzingResume ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Extracting Provenance...
                  </>
                ) : (
                  <>
                    <Code2 className="h-3.5 w-3.5" />
                    Analyze Resume &amp; Claims
                  </>
                )}
              </button>
            </div>

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
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
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
          </div>

          {/* STEP 2: PASTE JD OR CHOOSE DISCIPLINE */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80 mb-4">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-zinc-400" /> 2. Target Calibration: Paste JD or Pick Discipline
              </h2>

              <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTargetTab('jd')}
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
                        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
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
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
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
                                className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300 border border-zinc-800"
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
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-zinc-700">
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
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
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
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1">
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
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
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

          {/* STEP 4: TARGET SENIORITY LEVEL */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 mb-4 flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" /> Step 4: Target Seniority Level
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SENIORITY_LEVELS.map((lvl) => {
                const isSelected = seniority === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setSeniority(lvl.id)}
                    className={`text-left rounded-lg p-3.5 border transition-all ${
                      isSelected
                        ? 'border-zinc-500 bg-zinc-800/90 text-white ring-1 ring-zinc-500/20'
                        : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-100 text-xs sm:text-sm">{lvl.title}</span>
                      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-300 border border-zinc-800">
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
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
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
                <span className="text-[10px] text-zinc-500">Auto-deduces company scale &amp; culture</span>
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
                <span className="text-zinc-500 text-[10px]">Popular:</span>
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
                    className={`rounded px-2 py-0.5 text-[10px] border transition-colors ${
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
                    <span className="rounded bg-indigo-900/60 px-2 py-0.5 text-[10px] text-indigo-200 border border-indigo-800">
                      {companyAnalysisResult.scale_tier}
                    </span>
                  </div>
                  <div>
                    {companyPersona === companyAnalysisResult.detected_persona ? (
                      <span className="rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2.5 py-0.5 text-[10px] font-bold">
                        ✓ Active Persona Calibrated
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 px-2.5 py-0.5 text-[10px] font-bold">
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
                    <span className="text-[10px] text-zinc-500 font-mono">Key Architecture Focus:</span>
                    {companyAnalysisResult.architectural_focus.map((f, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-zinc-950 px-2 py-0.5 text-[10px] text-indigo-300 border border-zinc-800"
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
                      <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-mono font-medium text-indigo-400 border border-zinc-800">
                        {p.badge}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed font-sans">{p.desc}</p>
                    <div className="mt-2 text-[10px] font-mono text-zinc-400 flex items-center gap-1">
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
        </div>

        {/* Right Summary / Blueprint Preview Column */}
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 sm:p-6 shadow-xl sticky top-20">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 mb-4 flex items-center justify-between">
              <span>Grounded Session Blueprint</span>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </h3>

            {createdBlueprint ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-300 font-mono flex items-center justify-between">
                  <span>Session Blueprint compiled</span>
                  <span className="font-semibold text-emerald-400">{Math.round(createdBlueprint.total_allocated_seconds / 60)}m track</span>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
                    Topic Timeline &amp; Mapped Resume Claims
                  </span>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {createdBlueprint.topics.map((t, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg bg-zinc-950 p-2.5 text-xs border border-zinc-800 space-y-1 font-mono"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-200">{t.topic_name}</span>
                          <span className="text-zinc-400 font-mono text-[11px]">{t.allocated_seconds}s</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span>Allocated budget</span>
                          <span className="text-emerald-400 font-medium">
                            {t.mapped_claims_count} Claim{t.mapped_claims_count === 1 ? '' : 's'} Mapped
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onStartInterview}
                  className="w-full mt-4 flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 transition-all active:scale-[0.98] shadow-sm"
                >
                  Enter Live Interview Room
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-zinc-950 p-4 border border-zinc-800 space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between text-zinc-400">
                    <span>Resume Context:</span>
                    <span className="font-medium text-emerald-400">
                      {resumeAnalysis ? `${resumeAnalysis.claims.length} Claims Loaded` : 'No Resume Uploaded'}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Target Role / JD:</span>
                    <span className="font-medium text-zinc-200 max-w-[160px] truncate">
                      {selectedRole?.name || 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Seniority Track:</span>
                    <span className="font-medium text-zinc-200">{seniority}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Time Budget:</span>
                    <span className="font-medium text-zinc-200">{duration} Minutes</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Protocol:</span>
                    <span className="font-medium text-zinc-200">{mode}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Code Language:</span>
                    <span className="font-medium text-emerald-400">{preferredLanguage}</span>
                  </div>
                  {matchAnalysis && (
                    <div className="flex justify-between text-zinc-400 pt-1 border-t border-zinc-800/60">
                      <span>JD Alignment:</span>
                      <span className="font-medium text-emerald-400">{matchAnalysis.match_score_pct}% Match</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isCreating || !selectedRole}
                  onClick={handleCreate}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 px-4 text-xs font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-sm"
                >
                  {isCreating ? 'Compiling Blueprint...' : 'Initialize Session Blueprint'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

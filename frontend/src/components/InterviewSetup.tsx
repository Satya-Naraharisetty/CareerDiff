import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { interviewsApi, resumesApi, rolesApi } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useInterviewStore } from '../stores/interviewStore';
import type {
  InterviewBlueprintRead,
  InterviewMode,
  JdAnalysisResponse,
  JobRoleRead,
  ResumeAnalysisResponse,
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

  // Step 1: Resume Ingestion State (DEFAULT OPTION IS UPLOAD FILE)
  const [resumeTab, setResumeTab] = useState<'upload' | 'paste'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
  const [error, setError] = useState<string | null>(null);

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
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-3.5 text-xs text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-amber-400" />
            <span>You are viewing the calibration studio in preview mode. Sign in to analyze your resume and start live interview sessions.</span>
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
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3.5 text-xs text-red-300 font-mono">
          {error}
        </div>
      )}

      {resumeSuccessMsg && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 p-3.5 text-xs text-emerald-300 flex items-center gap-2 font-mono">
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
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center hover:border-zinc-700 transition-colors">
                  <Upload className="h-6 w-6 text-zinc-400 mb-2" />
                  <p className="text-xs font-medium text-zinc-200">
                    Upload your resume document (PDF, DOCX, or TXT)
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                    Maximum file size 10MB • Text &amp; claims extracted with character-offset provenance.
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                    className="mt-3 text-xs text-zinc-400 max-w-full file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700"
                  />
                  {selectedFile && (
                    <span className="mt-2 text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
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
                      <span className="text-xs text-emerald-400 font-medium bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-800/40">
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

          {/* STEP 3: SENIORITY & DURATION */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-sm shadow-sm">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300 mb-4 flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" /> 3. Target Seniority Level
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

          {/* STEP 4: INTERACTION & DURATION */}
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
                <div className="rounded-lg bg-emerald-950/30 border border-emerald-900/50 p-3 text-xs text-emerald-300 font-mono">
                  Blueprint generated! Total allocated:{' '}
                  <span className="font-bold">{Math.round(createdBlueprint.total_allocated_seconds / 60)} minutes</span>
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

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
  Sparkles,
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
      <div className="text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-950/60 border border-indigo-800/40 px-3 py-1 text-xs font-semibold text-indigo-300 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          Autonomous Technical Interview Simulator
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Candidate Intelligence & Target Calibration
        </h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-2xl">
          Upload your resume, then paste your target Job Description (or choose an engineering discipline) to generate an interview blueprint tailored specifically to your background and the role requirements.
        </p>
      </div>

      {!isAuthenticated && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/40 p-4 text-sm text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <Lock className="h-5 w-5 shrink-0 text-amber-400" />
            <span>You are viewing the calibration studio in preview mode. Please sign in to analyze your resume and start live interview sessions.</span>
          </div>
          <button
            type="button"
            onClick={onOpenAuth}
            className="shrink-0 rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-sm"
          >
            Sign In Now
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {resumeSuccessMsg && (
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-4 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>{resumeSuccessMsg}</span>
        </div>
      )}

      {jdSuccessMsg && (
        <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/40 p-4 text-sm text-indigo-300 flex items-center gap-2">
          <Briefcase className="h-5 w-5 shrink-0 text-indigo-400" />
          <span>{jdSuccessMsg}</span>
        </div>
      )}

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* STEP 1: RESUME INGESTION (DEFAULT OPTION IS UPLOAD) */}
          <div className="rounded-2xl border border-indigo-900/60 bg-slate-900/80 p-5 sm:p-6 backdrop-blur-sm shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <FileText className="h-4 w-4" /> 1. Upload Candidate Resume (Default)
              </h2>

              <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setResumeTab('upload')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    resumeTab === 'upload'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setResumeTab('paste')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    resumeTab === 'paste'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Paste Text
                </button>
              </div>
            </div>

            {resumeTab === 'upload' ? (
              <div className="space-y-3">
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/60 p-6 text-center hover:border-indigo-500 transition-colors">
                  <Upload className="h-8 w-8 text-indigo-400 mb-2" />
                  <p className="text-xs font-medium text-slate-200">
                    Upload your resume document (PDF, DOCX, or TXT)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Maximum file size 10MB. Text & claims are extracted with character-offset provenance.
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                      }
                    }}
                    className="mt-3 text-xs text-slate-400 max-w-full file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                  />
                  {selectedFile && (
                    <span className="mt-2 text-xs font-medium text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-400">
                  <span>Candidate resume markdown / plain text:</span>
                  <button
                    type="button"
                    onClick={() => setResumeText(SAMPLE_RESUME_TEXT)}
                    className="text-indigo-400 hover:text-indigo-300 underline font-medium self-start sm:self-auto"
                  >
                    Load Sample Senior Resume
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste candidate resume here (work history, technologies, achievements)..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Grounds interview questions and blueprint topics in your verified claims.
              </span>
              <button
                type="button"
                disabled={isAnalyzingResume}
                onClick={handleAnalyzeResume}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 py-2.5 px-5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 transition-all active:scale-95 shrink-0"
              >
                {isAnalyzingResume ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Extracting Provenance...
                  </>
                ) : (
                  <>
                    <Code2 className="h-3.5 w-3.5" />
                    Analyze Resume & Claims
                  </>
                )}
              </button>
            </div>

            {/* Resume Analysis Output Card */}
            {resumeAnalysis && (
              <div className="mt-5 rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Parsed Profile:</span>
                    <span className="rounded bg-indigo-900/80 px-2 py-0.5 text-xs font-bold text-indigo-200 border border-indigo-700">
                      {resumeAnalysis.detected_seniority}
                    </span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
                      {resumeAnalysis.primary_discipline} Track
                    </span>
                    <span className="text-xs text-slate-400">
                      ~{resumeAnalysis.years_experience} Years Exp
                    </span>
                  </div>
                  <span className="text-xs text-emerald-400 font-semibold">
                    {resumeAnalysis.claims.length} Claims Indexed
                  </span>
                </div>

                {resumeAnalysis.summary && (
                  <p className="text-xs text-slate-300 italic bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    "{resumeAnalysis.summary}"
                  </p>
                )}

                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Extracted Technical Keywords
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {resumeAnalysis.verified_skills.map((skill, sIdx) => (
                      <span
                        key={sIdx}
                        className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-indigo-300 border border-slate-800"
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
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 backdrop-blur-sm shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800 mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <Briefcase className="h-4 w-4" /> 2. Target Calibration: Paste JD or Pick Discipline
              </h2>

              <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTargetTab('jd')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    targetTab === 'jd'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Paste JD (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetTab('discipline')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    targetTab === 'discipline'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Choose Discipline
                </button>
              </div>
            </div>

            {targetTab === 'jd' ? (
              /* TAB A: PASTE JOB DESCRIPTION */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-400">
                  <span>Paste any target Job Description (JD) text:</span>
                  <button
                    type="button"
                    onClick={() => setJdText(SAMPLE_JD_TEXT)}
                    className="text-indigo-400 hover:text-indigo-300 underline font-medium self-start sm:self-auto"
                  >
                    Load Sample Senior Payments JD
                  </button>
                </div>
                <textarea
                  rows={7}
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste Job Description (requirements, responsibilities, required technologies)..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 font-mono text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    Extracts required competencies, seniority, and matches against your resume claims.
                  </span>
                  <button
                    type="button"
                    disabled={isAnalyzingJd || !jdText.trim()}
                    onClick={handleAnalyzeJd}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 py-2.5 px-5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 transition-all active:scale-95 shrink-0"
                  >
                    {isAnalyzingJd ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Calibrating JD...
                      </>
                    ) : (
                      <>
                        <Compass className="h-3.5 w-3.5" />
                        Analyze JD & Tailor Competencies
                      </>
                    )}
                  </button>
                </div>

                {/* JD Analysis Results Card */}
                {jdAnalysis && (
                  <div className="mt-4 rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-white">{jdAnalysis.extracted_title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="rounded bg-indigo-900/80 px-2 py-0.5 text-xs font-bold text-indigo-200 border border-indigo-700">
                            {jdAnalysis.detected_seniority}
                          </span>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
                            {jdAnalysis.primary_discipline} Track
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-indigo-300 font-semibold bg-indigo-950 px-2.5 py-1 rounded-lg border border-indigo-800">
                        Active Interview Role
                      </span>
                    </div>

                    {jdAnalysis.key_requirements.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Key JD Requirements
                        </span>
                        <ul className="text-xs text-slate-300 space-y-1">
                          {jdAnalysis.key_requirements.slice(0, 3).map((req, rIdx) => (
                            <li key={rIdx} className="flex items-start gap-1.5">
                              <span className="text-indigo-400">•</span>
                              <span className="line-clamp-1">{req}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Tailored Blueprint Competencies
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {jdAnalysis.tailored_competencies.map((comp) => (
                          <div
                            key={comp.id}
                            className="rounded-lg bg-slate-900/90 p-2 text-xs border border-slate-800"
                          >
                            <span className="font-semibold text-slate-200 block">{comp.name}</span>
                            <span className="text-[11px] text-slate-400 line-clamp-1">{comp.description}</span>
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
                <span className="text-xs text-slate-400 block mb-2">
                  Select a standardized engineering discipline from our rubric catalog:
                </span>
                {isLoadingRoles ? (
                  <div className="h-24 rounded-lg bg-slate-800/40 animate-pulse flex items-center justify-center text-xs text-slate-500">
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
            )}
          </div>

          {/* STEP 3: SENIORITY & DURATION */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-400 mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> 3. Target Seniority Level
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

          {/* STEP 4: INTERACTION & DURATION */}
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
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sticky top-24">
            <h3 className="text-base font-bold text-white mb-4">Grounded Session Blueprint</h3>

            {createdBlueprint ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 p-3 text-xs text-emerald-300">
                  Blueprint generated! Total allocated:{' '}
                  <span className="font-bold">{Math.round(createdBlueprint.total_allocated_seconds / 60)} minutes</span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Topic Timeline & Mapped Resume Claims
                  </span>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {createdBlueprint.topics.map((t, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg bg-slate-950 p-2.5 text-xs border border-slate-800 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-200">{t.topic_name}</span>
                          <span className="text-indigo-400 font-mono font-semibold">{t.allocated_seconds}s</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>Allocated budget</span>
                          <span className="text-emerald-400 font-semibold">
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
                  className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-400 transition-all active:scale-[0.98]"
                >
                  Enter Practice Room <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Resume Context:</span>
                    <span className="font-semibold text-emerald-400">
                      {resumeAnalysis ? `${resumeAnalysis.claims.length} Claims Loaded` : 'No Resume Uploaded'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Target Role / JD:</span>
                    <span className="font-semibold text-slate-200 max-w-[160px] truncate">
                      {selectedRole?.name || 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Seniority Track:</span>
                    <span className="font-semibold text-slate-200">{seniority}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Time Budget:</span>
                    <span className="font-semibold text-slate-200">{duration} Minutes</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Protocol:</span>
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

/**
 * IntervueX Full-Stack TypeScript Schema Definitions
 * Perfectly aligned with backend Pydantic models (Auth, Roles, Interview, Adaptive, Voice, Evaluation).
 */

export type SeniorityLevel = 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF';
export type InterviewMode = 'VOICE' | 'TEXT';
export type InterviewState =
  | 'CREATED'
  | 'WARMUP'
  | 'TECHNICAL_CORE'
  | 'CONCLUDING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'ABORTED';

export type EngineAction =
  | 'PROBE_DEEPER'
  | 'CLARIFY'
  | 'CHALLENGE'
  | 'VERIFY_CLAIM'
  | 'SCENARIO'
  | 'CHANGE_TOPIC'
  | 'SIMPLIFY'
  | 'REVISIT'
  | 'CONCLUDE';

export type Speaker = 'CANDIDATE' | 'INTERVIEWER' | 'SYSTEM';

// ---------------------------------------------------------------------------
// Authentication Schemas
// ---------------------------------------------------------------------------
export interface UserRegisterRequest {
  email: string;
  password: string;
  full_name: string;
}

export interface UserRegisterResponse {
  user_id: string;
  email: string;
  full_name: string;
  access_token: string;
  token_type: string;
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
}

// ---------------------------------------------------------------------------
// Resume & Profile Intelligence
// ---------------------------------------------------------------------------
export interface ResumeClaimRead {
  id: string;
  claim_text: string;
  category: string;
  source_section: string;
  start_offset: number;
  end_offset: number;
  technologies: string[];
  confidence_score: number;
  created_at?: string;
}

export interface ResumeTextUploadRequest {
  raw_text: string;
  filename?: string;
}

export interface ResumeAnalysisResponse {
  resume_id: string;
  status: string;
  filename: string;
  detected_seniority: SeniorityLevel;
  primary_discipline: string;
  years_experience: number;
  summary: string;
  verified_skills: string[];
  claims: ResumeClaimRead[];
  recommended_role_id: string | null;
  recommended_role_name: string | null;
}

// ---------------------------------------------------------------------------
// Roles & Competencies
// ---------------------------------------------------------------------------
export interface CompetencyRead {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
}

export interface JobRoleRead {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  competencies: CompetencyRead[];
}

export interface RoleListResponse {
  items: JobRoleRead[];
}

export interface JdAnalysisRequest {
  jd_text: string;
  job_title?: string | null;
}

export interface JdAnalysisResponse {
  role: JobRoleRead;
  extracted_title: string;
  detected_seniority: SeniorityLevel;
  primary_discipline: string;
  key_requirements: string[];
  matched_technologies: string[];
  tailored_competencies: CompetencyRead[];
}

// ---------------------------------------------------------------------------
// Interview Session & Blueprints
// ---------------------------------------------------------------------------
export interface BlueprintTopicRead {
  topic_name: string;
  allocated_seconds: number;
  mapped_claims_count: number;
}

export interface InterviewBlueprintRead {
  total_topics: number;
  total_allocated_seconds: number;
  warmup_seconds: number;
  conclusion_seconds: number;
  topics: BlueprintTopicRead[];
}

export interface InterviewCreateRequest {
  role_id: string;
  target_seniority: SeniorityLevel;
  duration_minutes: number;
  mode: InterviewMode;
}

export interface InterviewCreateResponse {
  interview_id: string;
  state: InterviewState;
  scheduled_duration_minutes: number;
  blueprint: InterviewBlueprintRead;
}

export interface InterviewDetailResponse {
  id: string;
  state: InterviewState;
  target_seniority: SeniorityLevel;
  scheduled_duration_minutes: number;
  actual_duration_seconds: number;
  current_topic: string | null;
  consecutive_probes: number;
  total_turns: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// ---------------------------------------------------------------------------
// Adaptive Turns & Transcripts
// ---------------------------------------------------------------------------
export interface CandidateTurnRequest {
  transcript: string;
  duration_ms?: number | null;
}

export interface InterviewerTurnResponse {
  turn_index: number;
  speaker: string;
  transcript: string;
  action_taken: EngineAction;
  session_state: InterviewState;
  active_topic: string | null;
  created_at: string;
}

export interface InterviewTurnRead {
  turn_index: number;
  speaker: Speaker;
  transcript: string;
  action_taken?: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Real-Time WebSocket Protocol
// ---------------------------------------------------------------------------
export interface WsTicketResponse {
  ticket: string;
  websocket_url: string;
  expires_in_seconds: number;
}

export type WsClientMessage =
  | { type: 'speech_started'; client_timestamp_ms: number }
  | { type: 'speech_stopped'; client_timestamp_ms: number }
  | { type: 'text_input'; text: string; turn_index?: number }
  | { type: 'ping'; timestamp?: number };

export type WsServerMessage =
  | {
      type: 'session_ready';
      interview_id: string;
      current_turn_index: number;
      state: string;
      remaining_seconds: number;
    }
  | {
      type: 'transcript_partial';
      turn_index: number;
      text: string;
    }
  | {
      type: 'transcript_final';
      turn_index: number;
      speaker: string;
      text: string;
      duration_ms: number;
    }
  | {
      type: 'interviewer_speaking';
      turn_index: number;
      action: string;
      question_text: string;
    }
  | {
      type: 'interviewer_interrupted';
      turn_index: number;
      cutoff_timestamp_ms: number;
    }
  | {
      type: 'state_change';
      previous_state: string;
      new_state: string;
      active_competency: string | null;
    }
  | {
      type: 'error';
      code: string;
      message: string;
      fatal: boolean;
      details?: Record<string, unknown> | null;
    };

// ---------------------------------------------------------------------------
// Assessment Dossier & Evaluation
// ---------------------------------------------------------------------------
export type EvidenceType =
  | 'POSITIVE_MASTERY'
  | 'KNOWLEDGE_GAP'
  | 'CONTRADICTION'
  | 'SUPERFICIAL_EXPLANATION';

export type AssessmentImpact =
  | 'UPWEIGHT'
  | 'DOWNWEIGHT'
  | 'NEUTRAL'
  | 'DISQUALIFYING';

export type ScoreStatus = 'EVALUATED' | 'INSUFFICIENT_EVIDENCE';

export type ClaimVerificationStatus =
  | 'VERIFIED'
  | 'CONTRADICTED'
  | 'VAGUE'
  | 'UNTESTED';

export interface EvaluationEvidenceRead {
  id: string;
  interview_turn_id: string;
  turn_index: number;
  evidence_type: EvidenceType;
  assessment_impact: AssessmentImpact;
  transcript_excerpt: string;
  start_char_offset: number;
  end_char_offset: number;
  confidence: number;
  rationale: string;
}

export interface CompetencyScoreRead {
  competency_id: string;
  competency_name: string;
  score: number | null;
  status: ScoreStatus;
  rationale: string;
  confidence: number;
  evidence_items: EvaluationEvidenceRead[];
}

export interface ClaimVerificationRead {
  claim_id: string;
  claim_text: string;
  category: string;
  status: ClaimVerificationStatus;
  confidence: number;
  auditor_notes: string | null;
  verified_turn_index: number | null;
}

export interface AssessmentReportRead {
  report_id: string;
  interview_id: string;
  version: number;
  is_latest: boolean;
  model_used: string;
  overall_score: number | null;
  summary: string;
  strengths: string[];
  knowledge_gaps: string[];
  study_recommendations: string[];
  competency_scores: CompetencyScoreRead[];
  claim_verifications: ClaimVerificationRead[];
  created_at: string;
}

export interface EvaluationTriggerResponse {
  interview_id: string;
  status: string;
  message: string;
  task_id: string | null;
}

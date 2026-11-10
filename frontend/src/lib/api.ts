/**
 * IntervueX Typed API Client
 * Built on native fetch with Bearer token injection, RFC 7807 problem details parsing,
 * and strict typing for all REST endpoints.
 */

import type {
  AssessmentReportRead,
  BackupCodesRegenerateResponse,
  CandidateTurnRequest,
  EvaluationTriggerResponse,
  InterviewCreateRequest,
  InterviewCreateResponse,
  InterviewDetailResponse,
  InterviewerTurnResponse,
  InterviewTurnRead,
  JdAnalysisRequest,
  JdAnalysisResponse,
  PasswordChangeRequest,
  PasswordChangeResponse,
  PasswordRecoveryRequest,
  PasswordRecoveryResponse,
  ResumeAnalysisResponse,
  ResumeTextUploadRequest,
  RoleListResponse,
  TokenResponse,
  UserLoginRequest,
  UserProfileResponse,
  UserRegisterRequest,
  UserRegisterResponse,
  WsTicketResponse,
} from '../types';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const getAuthToken = (): string | null => {
  try {
    const raw = localStorage.getItem('intervuex_auth_storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
};

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

function formatApiErrorMessage(detail: string): string {
  switch (detail) {
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'INVALID_CURRENT_PASSWORD':
      return 'The current password you entered is incorrect.';
    case 'NEW_PASSWORD_SAME_AS_CURRENT':
      return 'Your new password must be different from your current password.';
    case 'INVALID_RECOVERY_CODE':
      return 'Invalid or already consumed backup recovery code. Please check the code and try again.';
    case 'USER_ALREADY_EXISTS':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'USER_INACTIVE':
      return 'This account is currently deactivated. Please contact support.';
    default:
      return detail;
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    let errorData: unknown = null;
    try {
      errorData = await response.json();
      if (typeof errorData === 'object' && errorData !== null) {
        const obj = errorData as Record<string, unknown>;
        if (typeof obj.detail === 'string') {
          errorDetail = formatApiErrorMessage(obj.detail);
        } else if (Array.isArray(obj.detail)) {
          errorDetail = obj.detail
            .map((err) => (typeof err === 'object' && err?.msg ? err.msg : JSON.stringify(err)))
            .join(', ');
        } else if (typeof obj.title === 'string') {
          errorDetail = formatApiErrorMessage(obj.title);
        }
      }
    } catch {
      // Ignore json parsing error if response is plain text
    }
    throw new ApiError(response.status, errorDetail, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const authApi = {
  register: (payload: UserRegisterRequest) =>
    fetchApi<UserRegisterResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: UserLoginRequest) =>
    fetchApi<TokenResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  recoverPassword: (payload: PasswordRecoveryRequest) =>
    fetchApi<PasswordRecoveryResponse>('/api/v1/auth/recover-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  regenerateBackupCodes: () =>
    fetchApi<BackupCodesRegenerateResponse>('/api/v1/auth/backup-codes/regenerate', {
      method: 'POST',
    }),

  changePassword: (payload: PasswordChangeRequest) =>
    fetchApi<PasswordChangeResponse>('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProfile: () => fetchApi<UserProfileResponse>('/api/v1/auth/me'),
};

export const rolesApi = {
  list: () => fetchApi<RoleListResponse>('/api/v1/roles'),
  analyzeJd: (payload: JdAnalysisRequest) =>
    fetchApi<JdAnalysisResponse>('/api/v1/roles/analyze-jd', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const interviewsApi = {
  create: (payload: InterviewCreateRequest) =>
    fetchApi<InterviewCreateResponse>('/api/v1/interviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  get: (interviewId: string) =>
    fetchApi<InterviewDetailResponse>(`/api/v1/interviews/${interviewId}`),

  start: (interviewId: string) =>
    fetchApi<InterviewTurnRead>(`/api/v1/interviews/${interviewId}/start`, {
      method: 'POST',
    }),

  submitTurn: (interviewId: string, payload: CandidateTurnRequest) =>
    fetchApi<InterviewerTurnResponse>(`/api/v1/interviews/${interviewId}/turns`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTurns: (interviewId: string) =>
    fetchApi<InterviewTurnRead[]>(`/api/v1/interviews/${interviewId}/turns`),

  getWsTicket: (interviewId: string) =>
    fetchApi<WsTicketResponse>(`/api/v1/interviews/${interviewId}/ws-ticket`, {
      method: 'POST',
    }),

  triggerEvaluation: (interviewId: string) =>
    fetchApi<EvaluationTriggerResponse>(`/api/v1/interviews/${interviewId}/evaluate`, {
      method: 'POST',
    }),

  getReport: (interviewId: string) =>
    fetchApi<AssessmentReportRead>(`/api/v1/interviews/${interviewId}/report`),
};


export const resumesApi = {
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchApi<ResumeAnalysisResponse>('/api/v1/resumes', {
      method: 'POST',
      body: formData,
    });
  },

  uploadText: (payload: ResumeTextUploadRequest) =>
    fetchApi<ResumeAnalysisResponse>('/api/v1/resumes/text', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getLatest: () => fetchApi<ResumeAnalysisResponse>('/api/v1/resumes/latest'),
};

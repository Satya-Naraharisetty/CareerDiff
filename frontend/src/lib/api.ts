/**
 * IntervueX Typed API Client
 * Built on native fetch with Bearer token injection, RFC 7807 problem details parsing,
 * and strict typing for all REST endpoints.
 */

import type {
  AssessmentReportRead,
  CandidateTurnRequest,
  EvaluationTriggerResponse,
  InterviewCreateRequest,
  InterviewCreateResponse,
  InterviewDetailResponse,
  InterviewerTurnResponse,
  InterviewTurnRead,
  RoleListResponse,
  TokenResponse,
  UserLoginRequest,
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

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(endpoint, {
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
          errorDetail = obj.detail;
        } else if (Array.isArray(obj.detail)) {
          errorDetail = obj.detail.map((err) => (typeof err === 'object' && err?.msg ? err.msg : JSON.stringify(err))).join(', ');
        } else if (typeof obj.title === 'string') {
          errorDetail = obj.title;
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
};

export const rolesApi = {
  list: () => fetchApi<RoleListResponse>('/api/v1/roles'),
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

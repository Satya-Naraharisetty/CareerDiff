import { create } from 'zustand';
import { authApi } from '../lib/api';
import type {
  PasswordRecoveryRequest,
  PasswordRecoveryResponse,
  UserLoginRequest,
  UserProfile,
  UserRegisterRequest,
  UserRegisterResponse,
} from '../types';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: UserLoginRequest) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithToken: (accessToken: string) => Promise<void>;
  loginAsDev: () => void;
  register: (payload: UserRegisterRequest) => Promise<UserRegisterResponse>;
  recoverPassword: (payload: PasswordRecoveryRequest) => Promise<PasswordRecoveryResponse>;
  rehydrateProfile: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const STORAGE_KEYS = [
  'CareerDiff_auth_storage',
  'careerdiff_auth_storage',
  'intervuex_auth_storage',
];
const STORAGE_KEY = 'CareerDiff_auth_storage';

export const isSkipAuthEnabled = (): boolean => {
  // The login bypass is a local-development convenience only: it is never honoured in a
  // production build, even if VITE_SKIP_AUTH=true leaks into the deployment environment.
  if (!import.meta.env.DEV) return false;
  const envVal = import.meta.env.VITE_SKIP_AUTH ?? import.meta.env.VITE_SKIP_LOGIN;
  if (envVal !== undefined) {
    return envVal === 'true' || envVal === '1';
  }
  return false;
};

export const DEV_DEFAULT_TOKEN = 'dev-local-bypass-token';

export const DEV_DEFAULT_USER: UserProfile = {
  id: 'dev-local-user',
  email: 'dev@careerdiff.local',
  full_name: 'Dev Candidate',
  role: 'CANDIDATE',
  target_seniority: 'SENIOR',
  primary_discipline: 'BACKEND',
  auth_provider: 'LOCAL_DEV',
  avatar_url: undefined,
};

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  if (token === DEV_DEFAULT_TOKEN || token.startsWith('dev-local-')) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return false;
    // Expired if current timestamp exceeds token exp with a 10s buffer
    return payload.exp * 1000 <= Date.now() + 10000;
  } catch {
    return false;
  }
}

/** Build a provisional profile from the JWT's own claims (never invent placeholder emails). */
function profileFromToken(token: string, fallbackEmail?: string): UserProfile {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const email: string = payload.email || fallbackEmail || '';
    return { id: String(payload.sub || ''), email, full_name: email ? email.split('@')[0] : '' };
  } catch {
    return { id: '', email: fallbackEmail || '', full_name: fallbackEmail ? fallbackEmail.split('@')[0] : '' };
  }
}

function toUserProfile(profile: {
  id: string;
  email: string;
  full_name: string;
  role?: UserProfile['role'];
  target_seniority?: UserProfile['target_seniority'];
  primary_discipline?: UserProfile['primary_discipline'];
  auth_provider?: UserProfile['auth_provider'];
  avatar_url?: UserProfile['avatar_url'];
}): UserProfile {
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    target_seniority: profile.target_seniority,
    primary_discipline: profile.primary_discipline,
    auth_provider: profile.auth_provider,
    avatar_url: profile.avatar_url,
  };
}

/** Remove every piece of per-user client state (used on logout / account switch). */
const USER_SCOPED_KEYS = [
  'careerdiff_active_interview_id',
  'careerdiff_active_view',
];
function clearUserScopedState() {
  USER_SCOPED_KEYS.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });
  window.dispatchEvent(new CustomEvent('careerdiff:logout'));
}

const loadPersistedAuth = (): { token: string | null; user: UserProfile | null } => {
  try {
    for (const key of STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const token = parsed?.state?.token || parsed?.token || parsed?.access_token || null;
        const user = parsed?.state?.user || parsed?.user || null;

        if (token) {
          if (isTokenExpired(token)) {
            try {
              localStorage.removeItem(key);
            } catch {}
            continue;
          }

          if (key !== STORAGE_KEY) {
            savePersistedAuth(token, user);
            try {
              localStorage.removeItem(key);
            } catch {}
          }
          return { token, user };
        }
      }
    }

    if (isSkipAuthEnabled()) {
      savePersistedAuth(DEV_DEFAULT_TOKEN, DEV_DEFAULT_USER);
      return { token: DEV_DEFAULT_TOKEN, user: DEV_DEFAULT_USER };
    }

    return { token: null, user: null };
  } catch {
    if (isSkipAuthEnabled()) {
      return { token: DEV_DEFAULT_TOKEN, user: DEV_DEFAULT_USER };
    }
    return { token: null, user: null };
  }
};

const savePersistedAuth = (token: string | null, user: UserProfile | null) => {
  try {
    if (!token) {
      STORAGE_KEYS.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
    } else {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: { token, user },
          version: 1,
        })
      );
    }
  } catch {
    // Storage quota or private browsing fallback
  }
};

const initialAuth = loadPersistedAuth();

export const useAuthStore = create<AuthState>((set, get) => ({
  token: initialAuth.token,
  user: initialAuth.user,
  isAuthenticated: !!initialAuth.token,
  isLoading: false,
  error: null,

  login: async (credentials: UserLoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login(credentials);
      clearUserScopedState();
      let user: UserProfile = profileFromToken(res.access_token, credentials.email);
      savePersistedAuth(res.access_token, user);

      // Attempt to load full verified profile from server
      try {
        user = toUserProfile(await authApi.getProfile());
        savePersistedAuth(res.access_token, user);
      } catch {
        // Fallback to credentials profile
      }

      set({
        token: res.access_token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  loginWithGoogle: async (idToken: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.loginWithGoogle({ id_token: idToken });
      clearUserScopedState();
      let user: UserProfile = profileFromToken(res.access_token);
      savePersistedAuth(res.access_token, user);

      try {
        user = toUserProfile(await authApi.getProfile());
        savePersistedAuth(res.access_token, user);
      } catch {
        // Fallback
      }

      set({
        token: res.access_token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google authentication failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  loginWithToken: async (accessToken: string) => {
    set({ isLoading: true, error: null });
    try {
      if (isTokenExpired(accessToken)) {
        throw new Error('This sign-in link has expired. Please sign in again.');
      }
      clearUserScopedState();
      savePersistedAuth(accessToken, profileFromToken(accessToken));
      // Validate the token with the server before treating the user as signed in.
      const user = toUserProfile(await authApi.getProfile());
      savePersistedAuth(accessToken, user);

      set({
        token: accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  loginAsDev: () => {
    savePersistedAuth(DEV_DEFAULT_TOKEN, DEV_DEFAULT_USER);
    set({
      token: DEV_DEFAULT_TOKEN,
      user: DEV_DEFAULT_USER,
      isAuthenticated: true,
      error: null,
    });
  },

  register: async (payload: UserRegisterRequest): Promise<UserRegisterResponse> => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.register(payload);
      clearUserScopedState();
      const user: UserProfile = {
        id: res.user_id,
        email: res.email,
        full_name: res.full_name,
      };
      savePersistedAuth(res.access_token, user);
      set({
        token: res.access_token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  recoverPassword: async (payload: PasswordRecoveryRequest): Promise<PasswordRecoveryResponse> => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.recoverPassword(payload);
      clearUserScopedState();
      let user: UserProfile = profileFromToken(res.access_token, payload.email);
      savePersistedAuth(res.access_token, user);
      try {
        user = toUserProfile(await authApi.getProfile());
        savePersistedAuth(res.access_token, user);
      } catch {
        // keep token-derived profile
      }
      set({
        token: res.access_token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Password recovery failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  rehydrateProfile: async () => {
    const { token } = get();
    if (!token || isTokenExpired(token)) {
      get().logout();
      return;
    }

    if (token === DEV_DEFAULT_TOKEN) {
      // Local dev bypass: the backend (SKIP_AUTH=true, ENVIRONMENT=development) resolves this
      // token to its own dev user. Never log in with shared hard-coded credentials.
      return;
    }

    try {
      const user = toUserProfile(await authApi.getProfile());
      savePersistedAuth(token, user);
      set({ user, isAuthenticated: true });
    } catch {
      // If profile fails due to 401, careerdiff:unauthorized handles logout
    }
  },

  logout: () => {
    savePersistedAuth(null, null);
    clearUserScopedState();
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('careerdiff:unauthorized', () => {
    if (!isSkipAuthEnabled()) {
      useAuthStore.getState().logout();
    }
  });
}

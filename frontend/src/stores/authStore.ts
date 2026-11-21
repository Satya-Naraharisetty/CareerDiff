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

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
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
    return { token: null, user: null };
  } catch {
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
      let user: UserProfile = {
        id: 'current-user',
        email: credentials.email,
        full_name: credentials.email.split('@')[0],
      };
      savePersistedAuth(res.access_token, user);

      // Attempt to load full verified profile from server
      try {
        const profile = await authApi.getProfile();
        user = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          target_seniority: profile.target_seniority,
          primary_discipline: profile.primary_discipline,
          auth_provider: profile.auth_provider,
          avatar_url: profile.avatar_url,
        };
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
      let user: UserProfile = {
        id: 'google-user',
        email: 'candidate@google.com',
        full_name: 'Candidate',
      };
      savePersistedAuth(res.access_token, user);

      try {
        const profile = await authApi.getProfile();
        user = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          target_seniority: profile.target_seniority,
          primary_discipline: profile.primary_discipline,
          auth_provider: profile.auth_provider,
          avatar_url: profile.avatar_url,
        };
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
      let user: UserProfile = {
        id: 'oauth-user',
        email: 'candidate@oauth.com',
        full_name: 'Candidate',
      };
      savePersistedAuth(accessToken, user);

      try {
        const profile = await authApi.getProfile();
        user = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role,
          target_seniority: profile.target_seniority,
          primary_discipline: profile.primary_discipline,
          auth_provider: profile.auth_provider,
          avatar_url: profile.avatar_url,
        };
        savePersistedAuth(accessToken, user);
      } catch {
        // Fallback
      }

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

  register: async (payload: UserRegisterRequest): Promise<UserRegisterResponse> => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.register(payload);
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
      const user: UserProfile = {
        id: 'recovered-user',
        email: payload.email,
        full_name: payload.email.split('@')[0],
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
    try {
      const profile = await authApi.getProfile();
      const user: UserProfile = {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        target_seniority: profile.target_seniority,
        primary_discipline: profile.primary_discipline,
      };
      savePersistedAuth(token, user);
      set({ user, isAuthenticated: true });
    } catch {
      // If profile fails due to 401, careerdiff:unauthorized handles logout
    }
  },

  logout: () => {
    savePersistedAuth(null, null);
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
    useAuthStore.getState().logout();
  });
}

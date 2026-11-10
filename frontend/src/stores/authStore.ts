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
  register: (payload: UserRegisterRequest) => Promise<UserRegisterResponse>;
  recoverPassword: (payload: PasswordRecoveryRequest) => Promise<PasswordRecoveryResponse>;
  logout: () => void;
  clearError: () => void;
}

const STORAGE_KEY = 'intervuex_auth_storage';

const loadPersistedAuth = (): { token: string | null; user: UserProfile | null } => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw);
    return {
      token: parsed?.state?.token || null,
      user: parsed?.state?.user || null,
    };
  } catch {
    return { token: null, user: null };
  }
};

const savePersistedAuth = (token: string | null, user: UserProfile | null) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { token, user },
        version: 1,
      })
    );
  } catch {
    // Storage quota or private browsing fallback
  }
};

const initialAuth = loadPersistedAuth();

export const useAuthStore = create<AuthState>((set) => ({
  token: initialAuth.token,
  user: initialAuth.user,
  isAuthenticated: !!initialAuth.token,
  isLoading: false,
  error: null,

  login: async (credentials: UserLoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login(credentials);
      // Construct fallback profile from credentials
      const user: UserProfile = {
        id: 'current-user',
        email: credentials.email,
        full_name: credentials.email.split('@')[0],
      };
      savePersistedAuth(res.access_token, user);
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

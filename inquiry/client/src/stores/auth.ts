import { create } from 'zustand';
import { authApi, User, setAccessToken, ApiError } from '../lib/api';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  signup: (email: string, password: string, firstName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  signup: async (email: string, password: string, firstName: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.signup(email, password, firstName);
      set({ user: response.user, isLoading: false });
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to create account';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);
      set({ user: response.user, isLoading: false });
    } catch (error) {
      const message = error instanceof ApiError
        ? error.message
        : 'Failed to log in';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      setAccessToken(null);
      set({ user: null, isLoading: false });
    }
  },

  initialize: async () => {
    set({ isLoading: true });
    try {
      const response = await authApi.refresh();
      if (response) {
        set({ user: response.user, isLoading: false, isInitialized: true });
      } else {
        set({ user: null, isLoading: false, isInitialized: true });
      }
    } catch {
      set({ user: null, isLoading: false, isInitialized: true });
    }
  },

  clearError: () => set({ error: null }),
}));

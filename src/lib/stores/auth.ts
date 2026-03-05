import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { authApi, type User } from '../api';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  loading: false,
  error: null
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    /**
     * Register a new user
     */
    async register(username: string, email: string, password: string) {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const user = await authApi.register({ username, email, password });
        // Auto-login after registration
        await authApi.login({ username, email, password });
        update(state => ({ ...state, user, loading: false }));
        return user;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Registration failed';
        update(state => ({ ...state, loading: false, error: message }));
        throw error;
      }
    },

    /**
     * Login with username and password
     */
    async login(username: string, password: string) {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        await authApi.login({ 
          username, 
          password 
        });
        
        // After successful login, we should fetch user info
        // For now, create a minimal user object
        const user: User = {
          id: 0, // Will be populated from token or API call
          username,
          email: '',
          is_active: true
        };
        
        update(state => ({ ...state, user, loading: false }));
        return user;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed';
        update(state => ({ ...state, loading: false, error: message }));
        throw error;
      }
    },

    /**
     * Logout
     */
    logout() {
      authApi.logout();
      set(initialState);
    },

    /**
     * Clear error message
     */
    clearError() {
      update(state => ({ ...state, error: null }));
    },

    /**
     * Check if user is authenticated (has token)
     */
    checkAuth() {
      if (!browser) return;
      
      const token = localStorage.getItem('access_token');
      if (token) {
        // Token exists, set a placeholder user
        // In production, you'd validate/decode the token or fetch user info
        update(state => ({
          ...state,
          user: {
            id: 0,
            username: 'User',
            email: '',
            is_active: true
          }
        }));
      }
    }
  };
}

export const auth = createAuthStore();

// Derived store for authentication status
export const isAuthenticated = derived(auth, $auth => $auth.user !== null);

// Check authentication on page load
if (browser) {
  auth.checkAuth();
}

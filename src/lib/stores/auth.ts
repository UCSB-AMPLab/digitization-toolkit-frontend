// Global authentication state: the access token, the signed-in user and
// their role. The token itself is persisted through `tokenStore`
// (stores/token.ts); this store persists only the user.

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { tokenStore } from './token';

// Roles in the system. A role the backend adds has to be added here — this
// is the only place the list lives.
//
// The array is the source and the type derives from it, not the other way
// round: the list is needed at runtime to validate the backend's response
// (isUserRole, below), and two written copies would drift apart.
export const USER_ROLES = ['admin', 'operator', 'reviewer'] as const;

export type UserRole = (typeof USER_ROLES)[number];

// The role arrives from the backend as free text in the JSON: TypeScript
// types it as UserRole, but nothing checks that it is one. Without this
// check, a new backend role or a typo would reach navigation and camera
// permissions unnoticed (NEH-117).
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
}

interface AuthState {
  user: AuthUser | null;  // null = no session
  token: string | null;   // JWT access token
}

// The token and user are restored from localStorage. With a token present,
// the app assumes a session until the backend says otherwise.
const initialState: AuthState = {
  // tokenStore (stores/token.ts) is the single source for the token — the
  // same one apiRequest() in api.ts reads on every request.
  token: tokenStore.get(),
  user: browser ? (() => { try { const u = localStorage.getItem('auth_user'); return u ? JSON.parse(u) : null; } catch { return null; } })() : null,
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    setSession(token: string, user: AuthUser) {
      // The token is persisted through tokenStore (the single source); the
      // user is persisted only by this store.
      tokenStore.set(token);
      if (browser) {
        localStorage.setItem('auth_user', JSON.stringify(user));
      }
      update(state => ({ ...state, token, user }));
    },

    // Replaces only the token (e.g. after /auth/refresh); the user does not
    // change on a refresh.
    updateToken(token: string) {
      tokenStore.set(token);
      update(state => ({ ...state, token }));
    },

    clearSession() {
      tokenStore.clear();
      if (browser) {
        localStorage.removeItem('auth_user');
      }
      set({ user: null, token: null });
    },

    // For use outside Svelte components.
    getToken(): string | null {
      return get({ subscribe }).token;
    },

    isAuthenticated(): boolean {
      return get({ subscribe }).token !== null;
    },

    // Shared guard for routes outside (dashboard) (NEH-66).
    // (dashboard)/+layout.svelte validates the session fully against
    // /users/me; routes outside that group (live-preview, the full-screen
    // volume gallery) do not inherit that check, so they call this guard
    // instead. Redirects to /login when there is no session, and to
    // `fallback` when `roles` does not include the current user's role.
    // Returns true when the caller can go on mounting the page.
    requireSession(roles?: UserRole[], fallback = '/dashboard'): boolean {
      const state = get({ subscribe });
      if (!state.token) {
        goto('/login');
        return false;
      }
      if (roles && roles.length > 0 && !roles.includes(state.user?.role as UserRole)) {
        goto(fallback);
        return false;
      }
      return true;
    },
  };
}

export const authStore = createAuthStore();

export const userRole = derived(
  authStore,
  $auth => $auth.user?.role ?? null
);


// Global authentication state: the signed-in user and their role. The
// credential is an httpOnly cookie the backend sets at login (NEH-61); this
// store never sees it. There is a session when there is a user.
//
// Version: 0.1.0-beta

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { dropLegacyToken } from './legacy-token';
import { clearFocusActivity } from '$lib/focus-check';

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
}

const AUTH_USER_KEY = 'auth_user';

// The user saved in localStorage is only a hint, so routes can decide without
// waiting for the backend: (dashboard)/+layout.svelte validates it against
// /users/me, and only the cookie authenticates.
//
// A browser that still holds an earlier build's token in localStorage starts
// without a session: the token is removed (stores/legacy-token.ts) and so is
// the user saved with it, so the guards send it to /login once instead of
// showing a session the backend no longer recognises.
export function readInitialUser(): AuthUser | null {
  if (!browser) return null;
  try {
    if (dropLegacyToken()) {
      localStorage.removeItem(AUTH_USER_KEY);
      return null;
    }
    const u = localStorage.getItem(AUTH_USER_KEY);
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

const initialState: AuthState = {
  user: readInitialUser(),
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    // Keeps the user after a login or after /users/me validated the
    // session. The backend has already set the cookie. The login page passes
    // `signIn`: a sign-in clears the user's last focus check, so the capture
    // screen of a DSLR unit asks for one again (NEH-339). The dashboard's
    // revalidation of an open session does not, or every return to the
    // capture screen through the dashboard would ask.
    setSession(user: AuthUser, options: { signIn?: boolean } = {}) {
      if (browser) {
        try { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)); } catch { /* storage unavailable */ }
        if (options.signIn) clearFocusActivity(user.id);
      }
      update(state => ({ ...state, user }));
    },

    // Clears this tab's record of the session. Only the backend can remove
    // the httpOnly cookie: to log out, call authApi.logout() (api.ts), which
    // asks the backend to clear it and then calls this.
    clearSession() {
      if (browser) {
        try { localStorage.removeItem(AUTH_USER_KEY); } catch { /* storage unavailable */ }
      }
      set({ user: null });
    },

    // For use outside Svelte components.
    getUser(): AuthUser | null {
      return get({ subscribe }).user;
    },

    isAuthenticated(): boolean {
      return get({ subscribe }).user !== null;
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
      if (!state.user) {
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


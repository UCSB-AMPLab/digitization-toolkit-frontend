// ============================================================================
// STORE: auth.ts
// Maneja el estado de autenticación global de la aplicación.
// Guarda el token, los datos del usuario y el rol.
// Se importa desde cualquier componente que necesite saber si hay sesión activa.
// ============================================================================

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// ----------------------------------------------------------------------------
// TIPOS
// ----------------------------------------------------------------------------

// Roles disponibles en el sistema
// Si el backend agrega roles nuevos, agregarlos aquí
export type UserRole = 'admin' | 'operator' | 'reviewer';

// Datos del usuario autenticado
export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;       // rol que determina a qué dashboard se redirige
  is_active: boolean;
}

// Estado completo del store de autenticación
interface AuthState {
  user: AuthUser | null;  // null = no hay sesión
  token: string | null;   // JWT token de acceso
  isLoading: boolean;     // true mientras verifica sesión al cargar la app
}

// ----------------------------------------------------------------------------
// ESTADO INICIAL
// ----------------------------------------------------------------------------

// Al iniciar, intenta recuperar el token guardado en localStorage
// Si existe, la app asume que hay sesión (se verificará con el backend)
const initialState: AuthState = {
  user: null,
  // Solo accede a localStorage en el browser (no en SSR)
  token: browser ? localStorage.getItem('access_token') : null,
  user: browser ? (() => { try { const u = localStorage.getItem('auth_user'); return u ? JSON.parse(u) : null; } catch { return null; } })() : null,
  isLoading: false,
};

// ----------------------------------------------------------------------------
// STORE PRINCIPAL
// ----------------------------------------------------------------------------

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    // ── Guarda el token y los datos del usuario tras login exitoso ─────────
    setSession(token: string, user: AuthUser) {
      // Persiste el token en localStorage para que sobreviva recargas
      if (browser) {
        localStorage.setItem('access_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      }
      update(state => ({
        ...state,
        token,
        user,
        isLoading: false,
      }));
    },

    // ── Limpia la sesión al hacer logout ──────────────────────────────────
    clearSession() {
      if (browser) {
        localStorage.removeItem('access_token');
      localStorage.removeItem('auth_user');
      }
      set({
        user: null,
        token: null,
        isLoading: false,
      });
    },

    // ── Activa el spinner de carga (ej: mientras verifica token al inicio) ─
    setLoading(loading: boolean) {
      update(state => ({ ...state, isLoading: loading }));
    },

    // ── Obtiene el token actual (útil fuera de componentes Svelte) ─────────
    getToken(): string | null {
      return get({ subscribe }).token;
    },

    // ── Verifica si hay sesión activa ──────────────────────────────────────
    isAuthenticated(): boolean {
      return get({ subscribe }).token !== null;
    },
  };
}

export const authStore = createAuthStore();

// ----------------------------------------------------------------------------
// DERIVADOS (computed values)
// Estos son reactivos: se actualizan automáticamente cuando cambia authStore
// ----------------------------------------------------------------------------

// true si hay sesión activa
export const isAuthenticated = derived(
  authStore,
  $auth => $auth.token !== null
);

// El usuario actual (null si no hay sesión)
export const currentUser = derived(
  authStore,
  $auth => $auth.user
);

// El rol del usuario actual (null si no hay sesión)
export const userRole = derived(
  authStore,
  $auth => $auth.user?.role ?? null
);

// ----------------------------------------------------------------------------
// HELPER: getRoleDashboardPath
// Devuelve la ruta del dashboard según el rol del usuario.
// Si el backend cambia los nombres de los roles, actualizar aquí.
// ----------------------------------------------------------------------------
export function getRoleDashboardPath(_role: UserRole): string {
  return '/dashboard';
};

// ============================================================================
// STORE: auth.ts
// Maneja el estado de autenticación global de la aplicación.
// Guarda el token, los datos del usuario y el rol.
// Se importa desde cualquier componente que necesite saber si hay sesión activa.
// ============================================================================

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { tokenStore } from './token';

// ----------------------------------------------------------------------------
// TIPOS
// ----------------------------------------------------------------------------

// Roles disponibles en el sistema. Si el backend agrega roles nuevos,
// agregarlos aquí — es el único lugar donde vive la lista.
//
// El arreglo es la fuente y el tipo se deriva de él, no al revés: hace falta
// la lista en tiempo de ejecución para validar lo que responde el backend
// (isUserRole, abajo), y tenerla escrita dos veces es garantía de que tarde o
// temprano se separen.
export const USER_ROLES = ['admin', 'operator', 'reviewer'] as const;

export type UserRole = (typeof USER_ROLES)[number];

// El rol llega del backend como texto libre en el JSON: TypeScript lo tipa
// como UserRole, pero nada verifica que de verdad lo sea. Un rol nuevo del
// backend, o un typo, se colaría hasta la navegación y los permisos de cámara
// sin que nadie lo note (NEH-117).
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

// Datos del usuario autenticado
export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
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
  // El token viene de tokenStore (stores/token.ts) — única fuente de verdad,
  // también la que usa apiRequest() en api.ts para cada request.
  token: tokenStore.get(),
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
      // El token se persiste vía tokenStore (única fuente de verdad); el
      // usuario es responsabilidad exclusiva de este store.
      tokenStore.set(token);
      if (browser) {
        localStorage.setItem('auth_user', JSON.stringify(user));
      }
      update(state => ({
        ...state,
        token,
        user,
        isLoading: false,
      }));
    },

    // ── Actualiza solo el token (ej: tras /auth/refresh) sin tocar al
    //    usuario, que no cambia en un refresh ──────────────────────────────
    updateToken(token: string) {
      tokenStore.set(token);
      update(state => ({ ...state, token }));
    },

    // ── Limpia la sesión al hacer logout ──────────────────────────────────
    clearSession() {
      tokenStore.clear();
      if (browser) {
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

    // ── Guard centralizado para rutas fuera de (dashboard) ──────────────────
    // (dashboard)/+layout.svelte ya valida la sesión a fondo contra
    // /users/me; las rutas que viven fuera de ese grupo (live-preview, la
    // galería full-screen de colecciones) no heredan eso y cada una
    // reimplementaba su propio chequeo de "hay token" copy-pasteado, sin
    // validar rol (NEH-66). Un solo guard aquí reemplaza esas copias:
    // redirige a /login si no hay sesión, y a `fallback` si `roles` no
    // incluye el rol del usuario actual. Devuelve true si el llamador puede
    // continuar montando la página.
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

// ============================================================================
// STORE: token.ts
// Única fuente de verdad para el access token persistido en localStorage
// (NEH-41 — antes había dos escrituras independientes de la misma clave:
// esta y una copia inline en api.ts).
//
// Sin reactividad de Svelte a propósito: apiRequest() (api.ts) necesita
// leerlo de forma síncrona en cada request, incluso antes de que authStore
// tenga el usuario cargado — ver el comentario en el paso 2 de
// (auth)/login/+page.svelte, que depende de este orden. authStore
// (stores/auth.ts) delega en este módulo para el token en vez de tener su
// propia copia de localStorage.getItem/setItem('access_token').
// ============================================================================

import { browser } from '$app/environment';

const ACCESS_TOKEN_KEY = 'access_token';

export const tokenStore = {
  get(): string | null {
    if (!browser) return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  set(token: string) {
    if (browser) localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  clear() {
    if (browser) localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
};

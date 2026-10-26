// The single source for the access token persisted in localStorage (NEH-41).
//
// Not a Svelte store on purpose: apiRequest() (api.ts) reads the token
// synchronously on every request, even before authStore has the user — the
// login page ((auth)/login/+page.svelte) relies on this when it stores the
// token before calling `/users/me`. authStore (stores/auth.ts) delegates to
// this module rather than reading or writing 'access_token' itself.

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

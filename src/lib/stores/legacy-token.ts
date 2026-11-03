// Clean-up of the access token earlier builds kept in localStorage (NEH-61).
//
// The session is an httpOnly cookie the backend sets at login; no script on
// the page can read it. A browser that still holds a token under the
// 'access_token' key from an earlier build has no such cookie, so that token
// authenticates nothing any more. authStore removes it at load, together with
// the user saved beside it, and starts without a session; the route guards
// then send the browser to /login once. The key is gone after that, so the
// next load does not come back here.
//
// Version: 0.1.0-beta

import { browser } from '$app/environment';

export const LEGACY_TOKEN_KEY = 'access_token';

/** Removes the legacy token. Returns true when there was one. */
export function dropLegacyToken(): boolean {
	if (!browser) return false;
	try {
		if (localStorage.getItem(LEGACY_TOKEN_KEY) === null) return false;
		localStorage.removeItem(LEGACY_TOKEN_KEY);
		return true;
	} catch {
		// Storage unavailable (private mode): there is nothing to remove.
		return false;
	}
}

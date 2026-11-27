// The sign-out mark (NEH-415): whether this browser has signed out since its
// last sign-in, kept in a cookie of the frontend's own.
//
// Version: 0.4.0

import { browser } from '$app/environment';

// The mark of a sign-out in this browser (NEH-415). A browser that keeps no
// saved user can find its session again from the cookie (stores/session.ts),
// but not after a sign-out: when POST /auth/logout fails the cookie stays
// valid, and the sign-out would be undone, in this tab or by another tab's
// late answer. authApi.logout() (api.ts) sets the mark before its logout is
// sent, and a successful authApi.login() clears it. While it is set, only a
// sign-in opens a session: setSession writes nothing else, and
// stores/session.ts drops a saved user found beside it. It is a cookie of
// the frontend's own, for the browser session only, because localStorage is
// what such a browser does not keep.
//
// A module of its own, so that a test replacing stores/auth.ts with a stub
// leaves api.ts the mark it sets.
export const SIGNED_OUT_COOKIE = 'captua_signed_out';

export function writeSignedOutMark(set: boolean): void {
	if (!browser) return;
	try {
		document.cookie = set
			? `${SIGNED_OUT_COOKIE}=1; path=/; SameSite=Strict`
			: `${SIGNED_OUT_COOKIE}=; path=/; SameSite=Strict; max-age=0`;
	} catch {
		// A document that refuses cookies refuses the session cookie too.
	}
}

// Whether this browser has signed out since its last sign-in.
export function signedOutHere(): boolean {
	if (!browser) return false;
	try {
		return document.cookie.split(';').some((part) => part.trim() === `${SIGNED_OUT_COOKIE}=1`);
	} catch {
		return false;
	}
}

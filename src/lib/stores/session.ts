// Whether there is a session, decided in one place for every route guard
// (NEH-415): the dashboard layout, the capture screen (/live-preview), the
// volume gallery's full-screen layout, the root route and the login page.
//
// The user saved in localStorage (stores/auth.ts) is a hint; only the cookie
// authenticates. A browser that keeps no saved user (a private window, site
// data blocked or cleared, storage that throws on access) can still hold a
// valid session cookie, so with no saved user the session is asked of
// /users/me, which the browser sends the cookie to. A 200 opens the session
// as for a saved user (authStore.setSession). A 401 or 403 means there is no
// session (session-check.ts classifies the answer). A failed fetch or a 5xx
// says nothing about the session: it is asked again with a growing delay, as
// the dashboard layout does for a saved user, or, with `wait: false`, the
// check ends as 'cancelled' and the caller decides.
//
// A browser that has signed out since its last sign-in (the sign-out mark,
// stores/signed-out.ts) has no session to restore, whatever is saved: a
// saved user found beside the mark is cleared, the answer is 'invalid' and
// nothing is asked. An answer that arrives once the mark is set opens
// nothing either.
//
// A check whose `signal` has aborted has no effect, whatever answer then
// arrives: no store write, no end of a session, no navigation. The signal
// reaches the request, so api.ts ends no session for it either
// (isDeadSession). Every caller passes a signal tied to its own lifetime.
//
// No localStorage is read or written here: authStore does that, and its
// reads and writes survive storage that throws.
//
// Version: 0.4.0

import { goto } from '$app/navigation';
import { usersApi, endRejectedSession } from '$lib/api';
import {
	waitForSession,
	sessionRetryDelay,
	type SessionCheckOutcome,
	type WaitForSessionOptions
} from '$lib/session-check';
import { authStore, type AuthUser } from './auth';
import { signedOutHere } from './signed-out';

export interface CheckSessionOptions extends WaitForSessionOptions {
	// Ask /users/me even when a user is saved. The dashboard layout does, so
	// that an expired cookie or a deactivated user is found before any
	// protected content is shown; the other guards take a saved user as it is.
	revalidate?: boolean;
	// false: ask once, and end as 'cancelled' when the backend does not
	// answer, instead of asking again until it does.
	wait?: boolean;
}

// The session's user ('valid'), no session ('invalid'), or 'cancelled' when
// `signal` aborted first or, with `wait: false`, the backend did not answer.
// On 'valid' after asking, the user is set in authStore. On 'invalid', a
// session still set in authStore is ended (endRejectedSession).
export async function checkSession({
	revalidate = false,
	wait = true,
	signal,
	onWaiting,
	delay = sessionRetryDelay,
	sleep
}: CheckSessionOptions = {}): Promise<SessionCheckOutcome<AuthUser>> {
	if (signedOutHere()) {
		dropSavedUser();
		return { kind: 'invalid' };
	}
	const saved = authStore.getUser();
	if (saved && !revalidate) return { kind: 'valid', user: saved };

	const once = wait ? null : new AbortController();
	const onAbort = () => once?.abort();
	if (once) {
		if (signal?.aborted) once.abort();
		else signal?.addEventListener('abort', onAbort, { once: true });
	}
	const checkSignal = once ? once.signal : signal;
	try {
		const outcome = await waitForSession<AuthUser>(() => usersApi.me(checkSignal), {
			signal: checkSignal,
			delay,
			sleep,
			onWaiting: (waiting) => {
				if (once && waiting) once.abort();
				onWaiting?.(waiting);
			}
		});
		if (outcome.kind === 'valid' && signedOutHere()) {
			// Signed out while the check was waiting for its answer.
			dropSavedUser();
			return { kind: 'invalid' };
		}
		if (outcome.kind === 'valid') authStore.setSession(outcome.user);
		else if (outcome.kind === 'invalid' && authStore.isAuthenticated()) endRejectedSession();
		return outcome;
	} finally {
		signal?.removeEventListener('abort', onAbort);
	}
}

// The saved user, unless this browser has signed out since its last sign-in:
// then the saved user is cleared and there is none. For a route that goes on
// at once with a saved user, before or without checkSession.
export function savedUser(): AuthUser | null {
	if (signedOutHere()) {
		dropSavedUser();
		return null;
	}
	return authStore.getUser();
}

function dropSavedUser(): void {
	authStore.clearSession();
}

// The guard for a route that needs a session: sends the browser to /login
// when there is none. Resolves true when the caller can go on mounting the
// page. A check cancelled by `signal` resolves false and navigates nowhere.
export async function requireSession(options: CheckSessionOptions = {}): Promise<boolean> {
	const outcome = await checkSession(options);
	if (outcome.kind === 'invalid') goto('/login');
	return outcome.kind === 'valid';
}

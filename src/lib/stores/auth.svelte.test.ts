// NEH-61: authStore holds who is logged in, never a token. The credential is
// an httpOnly cookie no script can read; the user saved in localStorage is a
// hint the dashboard layout validates against /users/me.
//
// A browser that still has the token an older build kept in localStorage
// starts logged out: the token and the user saved beside it are removed, so
// the route guards send it to /login once, and the next load finds nothing to
// migrate.
//
// Version: 0.1.0-beta
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { goto } from '$app/navigation';
import { authStore, readInitialUser, type AuthUser } from './auth';

const user: AuthUser = {
	id: 1,
	username: 'reviewer1',
	email: 'reviewer1@example.com',
	role: 'reviewer',
	is_active: true
};

// authStore takes its starting user from readInitialUser() once, when the
// module is imported. In browser-mode Vitest, vi.resetModules() does not run
// the module again on the next import, so the
// load-time behaviour is tested by calling readInitialUser() directly.

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	authStore.clearSession();
	localStorage.clear();
	vi.mocked(goto).mockClear();
});

describe('authStore keeps the user, not a token', () => {
	it('setSession stores the user and nothing under access_token', () => {
		authStore.setSession(user);

		expect(authStore.getUser()).toEqual(user);
		expect(authStore.isAuthenticated()).toBe(true);
		expect(localStorage.getItem('access_token')).toBeNull();
		expect(JSON.parse(localStorage.getItem('auth_user')!)).toEqual(user);
		let state: Record<string, unknown> | undefined;
		authStore.subscribe((s) => (state = s as unknown as Record<string, unknown>))();
		expect(state).not.toHaveProperty('token');
	});

	it('clearSession removes the user', () => {
		authStore.setSession(user);
		authStore.clearSession();

		expect(authStore.getUser()).toBeNull();
		expect(authStore.isAuthenticated()).toBe(false);
		expect(localStorage.getItem('auth_user')).toBeNull();
	});

	it('a saved user, with no old token beside it, is the starting session', () => {
		localStorage.setItem('auth_user', JSON.stringify(user));

		expect(readInitialUser()).toEqual(user);
	});
});

describe('migration from the localStorage token', () => {
	it('drops the old token and the user saved with it, and starts logged out', () => {
		localStorage.setItem('access_token', 'old-token');
		localStorage.setItem('auth_user', JSON.stringify(user));

		expect(readInitialUser()).toBeNull();
		expect(localStorage.getItem('access_token')).toBeNull();
		expect(localStorage.getItem('auth_user')).toBeNull();
	});

	it('runs once: after a new login, the next load keeps the session', () => {
		localStorage.setItem('access_token', 'old-token');
		localStorage.setItem('auth_user', JSON.stringify(user));
		expect(readInitialUser()).toBeNull();

		// The operator logs in again; the cookie carries the session now.
		authStore.setSession(user);

		expect(readInitialUser()).toEqual(user);
		expect(localStorage.getItem('access_token')).toBeNull();
	});

	it('a browser that starts with no user is sent to /login by requireSession', () => {
		authStore.clearSession();

		expect(authStore.requireSession()).toBe(false);
		expect(goto).toHaveBeenCalledWith('/login');
	});
});

// When a 401 clears this tab's session. Three cases, one per reason the
// rule in api.ts has its current shape: a request from a tab with a session,
// a request from a tab with no session at all (first-run setup), and a
// request from a tab whose cookie another tab's logout cleared while this
// tab's authStore still held the session.
//
// Version: 0.1.0-beta
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authApi, usersApi, AuthError } from './api';
import { authStore } from './stores/auth';
import type { AuthUser } from './stores/auth';

const user: AuthUser = {
	id: 1,
	username: 'reviewer1',
	email: 'reviewer1@example.com',
	role: 'reviewer',
	is_active: true
};

function respond401() {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify({ detail: 'Could not validate credentials' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	);
}

beforeEach(() => {
	gotoMock.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('a 401 and this tab\'s session', () => {
	it('clears the session and goes to /login when this tab had a session', async () => {
		authStore.setSession(user);
		const fetchSpy = respond401();

		await expect(usersApi.me()).rejects.toBeInstanceOf(AuthError);

		const sent = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(sent.credentials).toBe('include');
		expect(authStore.getUser()).toBeNull();
		expect(gotoMock).toHaveBeenCalledWith('/login');
	});

	it('leaves a tab with no session where it is (first-run setup, wrong bootstrap token)', async () => {
		respond401();

		await expect(
			authApi.register({ username: 'admin', email: 'a@example.com', password: 'Password123!' }, 'wrong')
		).rejects.toBeInstanceOf(AuthError);

		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('clears a session whose cookie another tab\'s logout removed', async () => {
		// What logging out in another tab leaves behind: the backend cleared
		// the cookie for every tab, and this tab's authStore still holds the
		// old session, so the next request gets a 401.
		authStore.setSession(user);
		respond401();

		await expect(usersApi.me()).rejects.toBeInstanceOf(AuthError);

		expect(authStore.getUser()).toBeNull();
		expect(gotoMock).toHaveBeenCalledWith('/login');
	});

	it('keeps the session on a 403', async () => {
		authStore.setSession(user);
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ detail: 'Operation not permitted' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		await expect(usersApi.me()).rejects.toBeInstanceOf(AuthError);

		expect(authStore.getUser()).toEqual(user);
		expect(gotoMock).not.toHaveBeenCalled();
	});
});

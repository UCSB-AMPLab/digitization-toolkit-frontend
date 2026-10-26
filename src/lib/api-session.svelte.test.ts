// When a 401 clears this tab's session. Three cases, one per reason the
// rule in api.ts has its current shape: a request that carried a token, a
// request from a tab with no session at all (first-run setup), and a
// request from a tab whose token another tab removed from localStorage
// while this tab's authStore still held the session.
//
// Version: 0.1.0-beta
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authApi, usersApi, AuthError } from './api';
import { authStore } from './stores/auth';
import type { AuthUser } from './stores/auth';
import { tokenStore } from './stores/token';

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
	it('clears the session and goes to /login when the request carried a token', async () => {
		authStore.setSession('tok-1', user);
		const fetchSpy = respond401();

		await expect(usersApi.me()).rejects.toBeInstanceOf(AuthError);

		const sent = fetchSpy.mock.calls[0][1] as RequestInit;
		expect((sent.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1');
		expect(authStore.getToken()).toBeNull();
		expect(gotoMock).toHaveBeenCalledWith('/login');
	});

	it('leaves a tab with no session where it is (first-run setup, wrong bootstrap token)', async () => {
		const fetchSpy = respond401();

		await expect(
			authApi.register({ username: 'admin', email: 'a@example.com', password: 'Password123!' }, 'wrong')
		).rejects.toBeInstanceOf(AuthError);

		const sent = fetchSpy.mock.calls[0][1] as RequestInit;
		expect((sent.headers as Record<string, string>)['Authorization']).toBeUndefined();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('clears a session whose token another tab removed, though the request carried none', async () => {
		authStore.setSession('tok-1', user);
		// What logging out in another tab leaves behind: localStorage has no
		// token, and this tab's authStore still holds the old session.
		tokenStore.clear();
		expect(authStore.getToken()).toBe('tok-1');
		const fetchSpy = respond401();

		await expect(usersApi.me()).rejects.toBeInstanceOf(AuthError);

		const sent = fetchSpy.mock.calls[0][1] as RequestInit;
		expect((sent.headers as Record<string, string>)['Authorization']).toBeUndefined();
		expect(authStore.getToken()).toBeNull();
		expect(gotoMock).toHaveBeenCalledWith('/login');
	});
});

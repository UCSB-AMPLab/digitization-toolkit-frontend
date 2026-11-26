// The root route in a browser that keeps no user in localStorage (a private
// window, blocked or cleared site data): it asks /users/me with the cookie the
// browser has and goes to the dashboard on a 200, to /login on a 401. A saved
// user goes to the dashboard without asking (NEH-415). Once the page is gone,
// whatever answer the check then gets changes nothing. After a sign-out in
// this browser the cookie restores nothing, even when the backend did not end
// the session, until the next sign-in.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authApi } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { sessionRenewals } from '$lib/session-keepalive';
import RootPage from './+page.svelte';

const operator: AuthUser = {
	id: 1,
	username: 'operator1',
	email: null,
	role: 'operator',
	is_active: true
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

let paths: string[];

function serve(me: () => Response | Promise<Response>) {
	paths = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		paths.push(path);
		if (path.endsWith('/users/me')) return me();
		return json({}, 404);
	});
}

beforeEach(() => {
	gotoMock.mockClear();
	authStore.clearSession();
});
afterEach(async () => {
	vi.restoreAllMocks();
	authStore.clearSession();
	await sessionRenewals.stop();
	sessionRenewals.resume();
});

describe('root route', () => {
	it('with no saved user, goes to the dashboard when /users/me answers 200', async () => {
		serve(() => json(operator));
		render(RootPage);
		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledTimes(1);
		expect(gotoMock).toHaveBeenCalledWith('/dashboard');
		expect(authStore.getUser()).toEqual(operator);
	});

	it('with no saved user, goes to /login on a 401', async () => {
		serve(() => json({ detail: 'Not authenticated' }, 401));
		render(RootPage);
		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledTimes(1);
		expect(gotoMock).toHaveBeenCalledWith('/login');
	});

	it('with no saved user, goes to /login when the backend cannot be reached', async () => {
		serve(() => Promise.reject(new TypeError('Failed to fetch')));
		render(RootPage);
		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledTimes(1);
		expect(gotoMock).toHaveBeenCalledWith('/login');
	});

	it('with a saved user, goes to the dashboard without asking', async () => {
		authStore.setSession(operator);
		serve(() => json(operator));
		render(RootPage);
		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/dashboard');
		expect(paths).toEqual([]);
	});
});

describe('root route left before the check is answered', () => {
	for (const [label, answer] of [
		['a 200', () => json(operator)],
		['a 401', () => json({ detail: 'Not authenticated' }, 401)]
	] as const) {
		it(`neither sets a session nor navigates on ${label}`, async () => {
			let release!: (answer: Response) => void;
			const held = new Promise<Response>((resolve) => (release = resolve));
			serve(() => held);
			const screen = render(RootPage);
			await expect.poll(() => paths.filter((p) => p.endsWith('/users/me')).length).toBe(1);
			screen.unmount();

			release(answer());
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(gotoMock).not.toHaveBeenCalled();
			expect(authStore.getUser()).toBeNull();
		});
	}
});

describe('root route after a sign-out the backend did not confirm', () => {
	// POST /auth/logout fails, so the cookie stays valid and /users/me answers 200.
	function serveFailedLogout() {
		serve(() => json(operator));
		const routed = vi.mocked(globalThis.fetch).getMockImplementation()!;
		vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
			const path = new URL(String(input), 'http://localhost').pathname;
			if (path.endsWith('/auth/logout')) {
				paths.push(path);
				return new Response('bad gateway', { status: 502 });
			}
			if (path.endsWith('/auth/login')) {
				paths.push(path);
				return json({ access_token: null, token_type: 'cookie' });
			}
			return routed(input, init);
		});
	}

	it('stays signed out and does not ask /users/me', async () => {
		authStore.setSession(operator);
		serveFailedLogout();
		await authApi.logout();
		expect(authStore.getUser()).toBeNull();

		render(RootPage);

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(paths.filter((p) => p.endsWith('/users/me'))).toHaveLength(0);
		expect(authStore.getUser()).toBeNull();
	});

	it('restores the session from the cookie again after the next sign-in', async () => {
		authStore.setSession(operator);
		serveFailedLogout();
		await authApi.logout();
		await authApi.login({ username: 'operator1', password: 'pw-8x' });
		// A reload in a browser that keeps no user.
		authStore.clearSession();

		render(RootPage);

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/dashboard');
		expect(paths.filter((p) => p.endsWith('/users/me'))).toHaveLength(1);
		expect(authStore.getUser()).toEqual(operator);
	});
});

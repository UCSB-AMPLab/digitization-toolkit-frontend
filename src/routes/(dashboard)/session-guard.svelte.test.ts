// NEH-219: on the appliance the kiosk opens the dashboard before the backend
// answers, and Nginx returns 502 for several seconds. The layout must wait
// and retry, keeping the saved session, and must not navigate anywhere; only a
// 401/403 from /users/me ends the session.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { readable } from 'svelte/store';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/dashboard') })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
// Short retries so the test does not sit through the real 2 s backoff.
vi.mock('$lib/session-check', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/session-check')>();
	return { ...actual, sessionRetryDelay: () => 20 };
});

import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { authApi } from '$lib/api';
import { sessionRenewals } from '$lib/session-keepalive';
import Layout from './+layout.svelte';

const user: AuthUser = {
	id: 1,
	username: 'operator1',
	email: null,
	role: 'operator',
	is_active: true
};

const children = createRawSnippet(() => ({
	render: () => '<p>protected content</p>'
}));

function nginx502() {
	return new Response('<html><body>502 Bad Gateway</body></html>', {
		status: 502,
		headers: { 'Content-Type': 'text/html' }
	});
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

beforeEach(() => {
	locale.set('en');
	gotoMock.mockClear();
	authStore.setSession(user);
});

afterEach(async () => {
	vi.restoreAllMocks();
	authStore.clearSession();
	// Each test starts with renewals allowed and none in flight.
	await sessionRenewals.stop();
	sessionRenewals.resume();
});

describe('(dashboard) layout with a saved session and a backend that is not answering', () => {
	it('waits through 502s and a network error without navigating, then shows the dashboard', async () => {
		let answer: 'down' | 'up' = 'down';
		let calls = 0;
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			calls++;
			if (answer === 'up') return json(200, user);
			// Alternate the two ways the backend can be unavailable.
			if (calls % 2 === 0) throw new TypeError('Failed to fetch');
			return nginx502();
		});

		const screen = render(Layout, { children });

		await expect.element(screen.getByText('Waiting for the server to respond…')).toBeVisible();
		await expect.poll(() => calls).toBeGreaterThanOrEqual(3);
		expect(screen.container.textContent).not.toContain('protected content');
		expect(gotoMock).not.toHaveBeenCalled();
		expect(authStore.getUser()).toEqual(user);

		answer = 'up';

		await expect.element(screen.getByText('protected content')).toBeVisible();
		expect(gotoMock).not.toHaveBeenCalled();
		expect(authStore.getUser()).toEqual(user);
		// The session rides on the cookie, not on an Authorization header.
		const sent = fetchSpy.mock.calls.at(-1)![1] as RequestInit;
		expect(sent.credentials).toBe('include');
		expect((sent.headers as Record<string, string>)['Authorization']).toBeUndefined();
	});

	it('ends the session and goes to /login on a 401', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			json(401, { detail: 'Invalid or expired token' })
		);

		render(Layout, { children });

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(authStore.getUser()).toBeNull();
	});

	it('ends the session on a 403 too, so /login does not send the operator back here', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			json(403, { detail: 'Operation not permitted' })
		);

		render(Layout, { children });

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(authStore.getUser()).toBeNull();
	});
});

// The failed validation that clears the session is a sign-out: the logout
// follows the renewal in flight, and no renewal starts after it.
describe('(dashboard) layout and the session renewal', () => {
	function routed(meAnswer: () => Response | Promise<Response>) {
		let finishRefresh!: () => void;
		const refreshDone = new Promise<Response>((resolve) => {
			finishRefresh = () => resolve(json(200, { access_token: null, token_type: 'cookie' }));
		});
		const order: string[] = [];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '');
			order.push(path);
			if (path === '/auth/refresh') return refreshDone;
			if (path === '/auth/logout') return new Response(null, { status: 204 });
			return meAnswer();
		});
		return { order, finishRefresh };
	}

	it('sends the logout only after the renewal in flight settles when /users/me answers 403', async () => {
		const { order, finishRefresh } = routed(() => json(403, { detail: 'Operation not permitted' }));
		sessionRenewals.start(() => authApi.refreshSession());

		render(Layout, { children });

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(authStore.getUser()).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(order).not.toContain('/auth/logout');
		expect(sessionRenewals.canStart()).toBe(false);

		finishRefresh();
		await expect.poll(() => order.includes('/auth/logout')).toBe(true);
		expect(order.indexOf('/auth/logout')).toBeGreaterThan(order.indexOf('/auth/refresh'));
		expect(order.filter((p) => p === '/auth/logout')).toHaveLength(1);
		expect(sessionRenewals.canStart()).toBe(false);
	});

	it('leaves renewals running when /users/me cannot be reached and the session is kept', async () => {
		const { order, finishRefresh } = routed(() => new Response('bad gateway', { status: 502 }));
		sessionRenewals.start(() => authApi.refreshSession());

		render(Layout, { children });

		await new Promise((resolve) => setTimeout(resolve, 100));
		finishRefresh();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(authStore.getUser()).toEqual(user);
		expect(order).not.toContain('/auth/logout');
		expect(sessionRenewals.canStart()).toBe(true);
	});
});

describe('(dashboard) layout with no saved session', () => {
	it('goes to /login once without asking the backend (a browser just migrated off the localStorage token)', async () => {
		authStore.clearSession();
		const fetchSpy = vi.spyOn(globalThis, 'fetch');

		render(Layout, { children });

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledTimes(1);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

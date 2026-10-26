// NEH-219: on the appliance the kiosk opens the dashboard before the backend
// answers, and Nginx returns 502 for several seconds. The layout must wait
// and retry, keeping the saved session, and must not navigate anywhere; only a
// 401/403 from /users/me ends the session.
//
// Version: 0.1.0-beta
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
	authStore.setSession('tok-1', user);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
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
		expect(authStore.getToken()).toBe('tok-1');

		answer = 'up';

		await expect.element(screen.getByText('protected content')).toBeVisible();
		expect(gotoMock).not.toHaveBeenCalled();
		expect(authStore.getToken()).toBe('tok-1');
		const sent = fetchSpy.mock.calls.at(-1)![1] as RequestInit;
		expect((sent.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-1');
	});

	it('ends the session and goes to /login on a 401', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(401, { detail: 'Invalid or expired token' }));

		render(Layout, { children });

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(authStore.getToken()).toBeNull();
	});

	it('ends the session on a 403 too, so /login does not send the operator back here', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(403, { detail: 'Operation not permitted' }));

		render(Layout, { children });

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(authStore.getToken()).toBeNull();
	});
});

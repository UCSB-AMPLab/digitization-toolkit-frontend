// The login page in a browser that keeps no user in localStorage (a private
// window, blocked or cleared site data): it asks /users/me once with the
// cookie the browser has, and on a 200 opens the session and sends the person
// on, as it does for a saved user. On a 401, or with the backend not
// answering, the form stays (NEH-415). A sign-in started while that check is
// unanswered cancels it: whatever answer then arrives changes nothing, and the
// signed-in session stands. After a sign-out in this browser the cookie
// restores nothing, even when the backend did not end the session.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authApi } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { sessionRenewals } from '$lib/session-keepalive';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import LoginPage from './+page.svelte';

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
		if (path === '/users/me') return me();
		if (path === '/auth/setup/status')
			return json({ needs_setup: false, default_language: 'en', local: false });
		return json({ status: 'ok' });
	});
}

beforeEach(() => {
	locale.set('en');
	gotoMock.mockClear();
	authStore.clearSession();
});
afterEach(async () => {
	vi.restoreAllMocks();
	authStore.clearSession();
	await sessionRenewals.stop();
	sessionRenewals.resume();
});

describe('login page and a session the browser did not store', () => {
	it('sends the person on when /users/me answers 200', async () => {
		serve(() => json(operator));
		render(LoginPage);
		await expect.poll(() => gotoMock.mock.calls.map((c) => c[0])).toContain('/');
		expect(authStore.getUser()).toEqual(operator);
	});

	it('keeps the form on a 401', async () => {
		serve(() => json({ detail: 'Not authenticated' }, 401));
		render(LoginPage);
		await expect.element(page.getByRole('button', { name: en.login_submit })).toBeVisible();
		await expect.poll(() => paths.filter((p) => p === '/users/me').length).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(gotoMock).not.toHaveBeenCalled();
		expect(authStore.getUser()).toBeNull();
	});

	it('keeps the form, and asks once, when the backend does not answer', async () => {
		serve(() => new Response('bad gateway', { status: 502 }));
		render(LoginPage);
		await expect.element(page.getByRole('button', { name: en.login_submit })).toBeVisible();
		await expect.poll(() => paths.filter((p) => p === '/users/me').length).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 2500));
		expect(paths.filter((p) => p === '/users/me')).toHaveLength(1);
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('with a saved user, sends the person on without asking', async () => {
		authStore.setSession(operator);
		serve(() => json(operator));
		render(LoginPage);
		await expect.poll(() => gotoMock.mock.calls.map((c) => c[0])).toContain('/');
		expect(paths).not.toContain('/users/me');
	});
});

describe('login page: a sign-in while the first check of the cookie is unanswered', () => {
	const ana: AuthUser = {
		id: 7,
		username: 'ana',
		email: null,
		role: 'operator',
		is_active: true,
		language: 'en'
	};

	// The first /users/me (the check on arrival) is held until `release` is
	// called with its answer; every later one is the sign-in's and answers 200.
	function serveHeld() {
		let release!: (answer: Response) => void;
		const held = new Promise<Response>((resolve) => (release = resolve));
		let meCalls = 0;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const path = new URL(String(input), 'http://localhost').pathname;
			if (path === '/users/me') {
				meCalls++;
				return meCalls === 1 ? held : json(ana);
			}
			if (path === '/auth/login') return json({ access_token: null, token_type: 'cookie' });
			if (path === '/auth/setup/status')
				return json({ needs_setup: false, default_language: 'en', local: false });
			return json({ status: 'ok' });
		});
		return { release, meCalls: () => meCalls };
	}

	async function signIn() {
		await userEvent.fill(page.getByLabelText(en.common_username_label), 'ana');
		await userEvent.fill(page.getByLabelText(en.common_password_label, { exact: true }), 'pw-8x');
		await userEvent.click(page.getByRole('button', { name: en.login_submit }));
		await expect.poll(() => authStore.getUser()).toEqual(ana);
	}

	for (const [label, answer] of [
		['a 401', () => json({ detail: 'Not authenticated' }, 401)],
		['a 200 for another user', () => json(operator)]
	] as const) {
		it(`keeps the new session when the held check then gets ${label}`, async () => {
			const { release, meCalls } = serveHeld();
			render(LoginPage);
			await expect.poll(meCalls).toBe(1);
			await signIn();

			release(answer());
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(authStore.getUser()).toEqual(ana);
			const targets = gotoMock.mock.calls.map((c) => c[0]);
			expect(targets).not.toContain('/login');
			expect(targets).not.toContain('/');
		});
	}
});

describe('login page after a sign-out the backend did not confirm', () => {
	it('keeps the form and does not ask /users/me', async () => {
		authStore.setSession(operator);
		serve(() => json(operator));
		const routed = vi.mocked(globalThis.fetch).getMockImplementation()!;
		vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
			const path = new URL(String(input), 'http://localhost').pathname;
			if (path === '/auth/logout') return Promise.reject(new TypeError('Failed to fetch'));
			return routed(input, init);
		});
		await authApi.logout();
		expect(authStore.getUser()).toBeNull();
		paths.length = 0;

		render(LoginPage);

		await expect.element(page.getByRole('button', { name: en.login_submit })).toBeVisible();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(paths).not.toContain('/users/me');
		expect(gotoMock).not.toHaveBeenCalled();
		expect(authStore.getUser()).toBeNull();
	});
});

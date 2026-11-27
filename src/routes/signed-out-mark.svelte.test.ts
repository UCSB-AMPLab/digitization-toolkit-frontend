// While the sign-out mark is set, only a sign-in opens a session (NEH-415).
// Two tabs of one browser share the saved user and the cookies: tab B's
// dashboard is revalidating with /users/me when tab A signs out and its
// logout fails, so the cookie stays valid. B's late 200 writes nothing, and
// when A reloads, a saved user found beside the mark is cleared and nothing
// is asked: A stays signed out.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { readable } from 'svelte/store';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/dashboard') })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authApi } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { sessionRenewals } from '$lib/session-keepalive';
import DashboardLayout from './(dashboard)/+layout.svelte';
import RootPage from './+page.svelte';
import LoginPage from './(auth)/login/+page.svelte';

const operator: AuthUser = {
	id: 1,
	username: 'operator1',
	email: null,
	role: 'operator',
	is_active: true
};

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

let paths: string[];
let releaseB: (answer: Response) => void;

// The first /users/me (tab B's revalidation) is held; any later one answers
// 200, as the cookie is still valid. POST /auth/logout fails.
function serve() {
	paths = [];
	const held = new Promise<Response>((resolve) => (releaseB = resolve));
	let meCalls = 0;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		paths.push(path);
		if (path === '/users/me') {
			meCalls++;
			return meCalls === 1 ? held : json(operator);
		}
		if (path === '/auth/logout') return new Response('bad gateway', { status: 502 });
		if (path === '/auth/setup/status')
			return json({ needs_setup: false, default_language: 'en', local: false });
		return json({ status: 'ok' });
	});
}

// Tab B holds its revalidation; tab A signs out, the logout fails; B's 200
// then arrives. Leaves B unmounted and the saved state as B left it.
async function signOutWhileTabBRevalidates() {
	authStore.setSession(operator);
	serve();
	const tabB = render(DashboardLayout, { children });
	await expect.poll(() => paths.filter((p) => p === '/users/me').length).toBe(1);

	await authApi.logout();
	expect(authStore.getUser()).toBeNull();

	releaseB(json(operator));
	await new Promise((resolve) => setTimeout(resolve, 100));
	tabB.unmount();
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

describe('a revalidation in another tab that answers after a failed sign-out', () => {
	it('writes no session', async () => {
		await signOutWhileTabBRevalidates();

		expect(authStore.getUser()).toBeNull();
		expect(localStorage.getItem('auth_user')).toBeNull();
	});

	it('leaves the reloaded root route signed out, asking nothing, even with a saved user', async () => {
		await signOutWhileTabBRevalidates();
		// Tab A reloads and finds a saved user beside the mark. The store keeps
		// the user it read at load, which a test cannot repeat, so the user is
		// put back as a sign-in would (the one write the mark does not stop).
		authStore.setSession(operator, { signIn: true });
		gotoMock.mockClear();
		paths.length = 0;

		render(RootPage);

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		expect(paths).not.toContain('/users/me');
		expect(authStore.getUser()).toBeNull();
		expect(localStorage.getItem('auth_user')).toBeNull();
	});

	it('leaves the reloaded login page on the form, asking nothing, even with a saved user', async () => {
		await signOutWhileTabBRevalidates();
		authStore.setSession(operator, { signIn: true });
		gotoMock.mockClear();
		paths.length = 0;

		render(LoginPage);

		await expect.element(page.getByRole('button', { name: en.login_submit })).toBeVisible();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(gotoMock).not.toHaveBeenCalled();
		expect(paths).not.toContain('/users/me');
		expect(authStore.getUser()).toBeNull();
	});

	it('leaves the reloaded dashboard signed out, asking nothing, even with a saved user', async () => {
		await signOutWhileTabBRevalidates();
		authStore.setSession(operator, { signIn: true });
		gotoMock.mockClear();
		paths.length = 0;

		const screen = render(DashboardLayout, { children });

		await expect.poll(() => gotoMock.mock.calls.length).toBeGreaterThan(0);
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(paths).not.toContain('/users/me');
		expect(authStore.getUser()).toBeNull();
		expect(screen.container.textContent).not.toContain('protected content');
	});
});

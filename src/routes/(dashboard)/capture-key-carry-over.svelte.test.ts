// NEH-336: when the dashboard has validated the session of an administrator
// or operator, a capture key this browser assigned before the unit held one
// is sent to the unit, once, if the unit has none.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/dashboard') })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { resetUnit } from '$lib/unit-mode';
import { STORAGE_KEYS } from '$lib/storage-keys';
import Layout from './+layout.svelte';

const F7 = { key: 'F7', ctrl: false, alt: false, meta: false, shift: false };
const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

let puts: unknown[];

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function serve(role: UserRole) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(typeof input === 'string' ? input : (input as Request).url).pathname;
		if (path === '/users/me')
			return json({ id: 4, username: role, email: null, role, is_active: true, language: 'en' });
		if (path === '/system/unit/capture-key') {
			puts.push(JSON.parse(init!.body as string));
			return json({ detail: 'x' }, 500);
		}
		if (path === '/system/unit')
			return json({
				mode: 'offline',
				projectsEnabled: true,
				projectsShown: true,
				defaultProjectId: null,
				prerequisites: { backup: [], fisqua: [] },
				captureKey: null
			});
		return json({});
	});
}

beforeEach(() => {
	locale.set('en');
	resetUnit();
	puts = [];
	localStorage.setItem(STORAGE_KEYS.captureChord, JSON.stringify(F7));
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	localStorage.removeItem(STORAGE_KEYS.captureChord);
});

describe('(dashboard) layout and the capture key', () => {
	it("sends an operator's browser key to a unit that has none", async () => {
		authStore.setSession({ id: 4, username: 'op', email: null, role: 'operator', is_active: true });
		serve('operator');
		render(Layout, { children });
		await expect.poll(() => puts).toEqual([{ capture_key: F7 }]);
		expect(localStorage.getItem(STORAGE_KEYS.captureChord)).toBeNull();
	});

	it("leaves a reviewer's browser key alone", async () => {
		authStore.setSession({
			id: 4,
			username: 'rev',
			email: null,
			role: 'reviewer',
			is_active: true
		});
		serve('reviewer');
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		await expect
			.poll(() => vi.mocked(fetch).mock.calls.some((c) => String(c[0]).includes('/users/me')))
			.toBe(true);
		expect(puts).toEqual([]);
		expect(localStorage.getItem(STORAGE_KEYS.captureChord)).not.toBeNull();
	});
});

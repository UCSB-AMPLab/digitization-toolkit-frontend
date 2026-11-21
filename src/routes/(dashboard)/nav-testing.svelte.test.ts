// The testing role (NEH-391): one shared account per unit that sees and
// creates only testing projects and volumes. The sidebar offers it Overview,
// Projects or Volumes, and Settings; Queue, To retake and Users stay closed to
// it, by link and by URL, and the layout does not ask for the retake count the
// backend refuses it. The Testing marker sits beside the account name.
//
// Version: 0.1.1
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import type { Writable } from 'svelte/store';

const nav = vi.hoisted(() => ({ page: null as unknown as Writable<{ url: URL }> }));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	nav.page = writable({ url: new URL('http://localhost/dashboard') });
	return { page: nav.page };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { goto } from '$app/navigation';
import { get } from 'svelte/store';
import { authStore } from '$lib/stores/auth';
import { tour } from '$lib/tour';
import { locale } from '$lib/i18n';
import '../../app.css';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function signIn() {
	const user = { id: 9, username: 'testing', email: null, role: 'testing', is_active: true };
	authStore.setSession(user as never);
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input);
		// The backend refuses these to the testing role: a request for one fails the test.
		for (const refused of ['/system/catalogue-backup', '/records/to-retake/count', '/records/to-retake/summary']) {
			if (url.endsWith(refused)) return json({ detail: 'Operation not permitted' }, 403);
		}
		return json(user);
	});
}

const callsTo = (spy: ReturnType<typeof signIn>, suffix: string) =>
	spy.mock.calls.filter(([u]) => String(u).endsWith(suffix)).length;
const countCalls = (spy: ReturnType<typeof signIn>) => callsTo(spy, '/records/to-retake/count');

beforeEach(() => {
	localStorage.clear();
	locale.set('en');
	nav.page.set({ url: new URL('http://localhost/dashboard') });
	vi.mocked(goto).mockClear();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('dashboard layout for the testing role', () => {
	it('offers Overview, Projects or Volumes, and Settings, and not Queue, To retake or Users', async () => {
		const fetchSpy = signIn();
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		const labels = [...screen.container.querySelectorAll('.s-nav .s-label')].map((l) => l.textContent?.trim());
		expect(labels).toContain('Overview');
		expect(labels.some((l) => l === 'Projects' || l === 'Volumes')).toBe(true);
		expect(labels).toContain('Settings');
		expect(labels).not.toContain('Queue');
		expect(labels).not.toContain('To retake');
		expect(labels).not.toContain('Users');
		expect(countCalls(fetchSpy)).toBe(0);
	});

	it('shows the role as "Testing" under the user name', async () => {
		signIn();
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		expect(screen.container.querySelector('.user-role')?.textContent?.trim()).toBe('Testing');
	});

	for (const path of ['/dashboard/users', '/dashboard/queue', '/dashboard/retakes']) {
		it(`shows the no-access state at ${path}`, async () => {
			nav.page.set({ url: new URL(`http://localhost${path}`) });
			signIn();
			const screen = render(Layout, { children });
			await expect.element(screen.getByRole('status')).toBeVisible();
			// The session is valid, so the guard sends the role to Overview.
			await expect.poll(() => vi.mocked(goto).mock.calls.map((c) => c[0])).toContain('/dashboard');
			expect(vi.mocked(goto)).not.toHaveBeenCalledWith('/login');
			expect(screen.container.textContent).not.toContain('protected content');
		});
	}

	it('marks the testing space beside the account name, expanded and collapsed', async () => {
		signIn();
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		expect(screen.container.querySelector('.user-row .testing-badge')?.textContent?.trim()).toBe('Testing');
		(screen.container.querySelector('.collapse-btn') as HTMLElement).click();
		await expect.poll(() => screen.container.querySelector('.user-row')).toBeNull();
		expect(screen.container.querySelector('.s-footer .testing-badge')?.textContent?.trim()).toBe('Testing');
	});

	it('shows no content at /dashboard/volumes and sends the role to Overview', async () => {
		nav.page.set({ url: new URL('http://localhost/dashboard/volumes') });
		signIn();
		const screen = render(Layout, { children });
		await expect.poll(() => vi.mocked(goto).mock.calls.map((c) => c[0])).toContain('/dashboard');
		expect(screen.container.textContent).not.toContain('protected content');
	});

	it('does not ask for the retake count, on mount or on navigation', async () => {
		const fetchSpy = signIn();
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		nav.page.set({ url: new URL('http://localhost/dashboard/config') });
		nav.page.set({ url: new URL('http://localhost/dashboard') });
		await new Promise((r) => setTimeout(r, 100));
		expect(countCalls(fetchSpy)).toBe(0);
	});

	it('does not mount the catalogue backup indicator or poll for it', async () => {
		const fetchSpy = signIn();
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		await new Promise((r) => setTimeout(r, 100));
		expect(callsTo(fetchSpy, '/system/catalogue-backup')).toBe(0);
		expect(screen.container.querySelector('.backup-pill')).toBeNull();
	});

	it('does not start the guided tour on the first sign-in, and the account menu has no Help entry', async () => {
		signIn();
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		await new Promise((r) => setTimeout(r, 100));
		expect(get(tour).active).toBe(false);
		(screen.container.querySelector('.user-row') as HTMLElement).click();
		await expect.element(screen.getByRole('menuitem', { name: /shut down/i })).toBeVisible();
		expect(screen.getByRole('menuitem', { name: 'Help' }).elements()).toHaveLength(0);
	});
});

describe('dashboard layout for the operator, unchanged', () => {
	it('polls the catalogue backup, shows the indicator, starts the tour once and offers Help', async () => {
		const user = { id: 5, username: 'op', email: null, role: 'operator', is_active: true };
		authStore.setSession(user as never);
		const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).endsWith('/system/catalogue-backup')) return json({ detail: 'x' }, 500);
			return json(user);
		});
		const screen = render(Layout, { children });
		await expect.element(screen.getByText('protected content')).toBeVisible();
		await expect.poll(() => callsTo(spy as never, '/system/catalogue-backup')).toBeGreaterThan(0);
		await expect.poll(() => get(tour).active).toBe(true);
		(screen.container.querySelector('.user-row') as HTMLElement).click();
		await expect.element(screen.getByRole('menuitem', { name: 'Help' })).toBeVisible();
		expect(screen.container.querySelector('.testing-badge')).toBeNull();
	});
});

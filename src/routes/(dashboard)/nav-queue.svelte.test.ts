// The sidebar's Cola and Por recapturar entries (0.2.0): both shown to every
// role, Cola straight after Proyectos, and Por recapturar with a badge counting
// the records waiting, from GET /records/to-retake/count, read again on
// every navigation: a count of 0, or a failed count, takes the badge away.
//
// Version: 0.2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import type { Writable } from 'svelte/store';

// The page store, writable so that a test can navigate.
const nav = vi.hoisted(() => ({ page: null as unknown as Writable<{ url: URL }> }));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	nav.page = writable({ url: new URL('http://localhost/dashboard') });
	return { page: nav.page };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import '../../app.css';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// What the count endpoint answers next: a count, or an error status.
const reply = { count: 0, status: 200 };

// /users/me answers the session check; the count endpoint answers `reply`.
function signIn(role: UserRole) {
	const user = { id: 1, username: role, email: null, role, is_active: true };
	authStore.setSession('tok', user);
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input);
		if (url.endsWith('/records/to-retake/count')) {
			return reply.status === 200 ? json({ count: reply.count }) : json({ detail: 'boom' }, reply.status);
		}
		return json(user);
	});
}

async function mount(role: UserRole, count: number) {
	reply.count = count;
	reply.status = 200;
	const fetchSpy = signIn(role);
	const screen = render(Layout, { children });
	await expect.element(screen.getByText('protected content')).toBeVisible();
	return { screen, fetchSpy };
}

function goTo(path: string) {
	nav.page.set({ url: new URL(`http://localhost${path}`) });
}

beforeEach(() => {
	locale.set('es');
	nav.page.set({ url: new URL('http://localhost/dashboard') });
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('sidebar Cola and Por recapturar', () => {
	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		it(`shows both entries to the ${role} role, Cola after Proyectos`, async () => {
			const { screen } = await mount(role, 0);
			const nav = screen.container.querySelector('.s-nav')!;
			const labels = [...nav.querySelectorAll('.s-label')].map((l) => l.textContent?.trim());
			const projects = labels.indexOf('Proyectos');
			expect(labels[projects + 1]).toBe('Cola');
			expect(labels).toContain('Por recapturar');
			await expect.element(screen.getByRole('link', { name: /^Cola/ })).toHaveAttribute('href', '/dashboard/queue');
			await expect.element(screen.getByRole('link', { name: /^Por recapturar/ })).toHaveAttribute('href', '/dashboard/retakes');
		});
	}

	it('badges Por recapturar with the count of records waiting', async () => {
		const { screen } = await mount('operator', 7);
		const link = screen.getByRole('link', { name: /^Por recapturar/ });
		await expect.element(link.getByText('7', { exact: true })).toBeVisible();
		await expect.element(link.getByText('7 registros por recapturar')).toBeInTheDocument();
	});

	it('reads the count again on each navigation, and drops the badge for 0 or for a failed count', async () => {
		const { screen, fetchSpy } = await mount('operator', 7);
		const badge = () => screen.container.querySelector('a[href="/dashboard/retakes"] .s-badge')?.textContent ?? null;
		const countCalls = () => fetchSpy.mock.calls.filter(([u]) => String(u).endsWith('/records/to-retake/count')).length;
		await expect.poll(badge).toBe('7');
		const first = countCalls();

		// Nothing waiting any more: the badge goes once that answer is handled.
		reply.count = 0;
		goTo('/dashboard/queue');
		await expect.poll(countCalls).toBe(first + 1);
		await expect.poll(badge).toBeNull();

		// Back to a count, so that the failure below has a badge to remove.
		reply.count = 3;
		goTo('/dashboard/retakes');
		await expect.poll(badge).toBe('3');

		// A failed count shows no badge rather than a stale one.
		reply.status = 500;
		goTo('/dashboard');
		await expect.poll(countCalls).toBe(first + 3);
		await expect.poll(badge).toBeNull();
	});
});

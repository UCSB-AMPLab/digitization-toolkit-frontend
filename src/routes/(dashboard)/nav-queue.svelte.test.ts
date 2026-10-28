// The sidebar's Cola and Por recapturar entries (0.2.0): both shown to every
// role, Cola straight after Proyectos, and Por recapturar with a badge counting
// the records waiting, from GET /records/to-retake/count.
//
// Version: 0.2.0
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
import '../../app.css';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// /users/me answers the session check; the count endpoint answers `count`,
// or fails with `countStatus`.
function signIn(role: UserRole, count: number, countStatus = 200) {
	const user = { id: 1, username: role, email: null, role, is_active: true };
	authStore.setSession('tok', user);
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input);
		if (url.endsWith('/records/to-retake/count')) {
			return countStatus === 200 ? json({ count }) : json({ detail: 'boom' }, countStatus);
		}
		return json(user);
	});
}

async function mount(role: UserRole, count: number, countStatus = 200) {
	const fetchSpy = signIn(role, count, countStatus);
	const screen = render(Layout, { children });
	await expect.element(screen.getByText('protected content')).toBeVisible();
	return { screen, fetchSpy };
}

beforeEach(() => locale.set('es'));
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

	it('shows no badge when nothing is waiting, or when the count cannot be loaded', async () => {
		const zero = await mount('operator', 0);
		await expect.element(zero.screen.getByRole('link', { name: /^Por recapturar/ })).toBeVisible();
		expect(zero.screen.container.querySelector('a[href="/dashboard/retakes"] .s-badge')).toBeNull();
		zero.screen.unmount();
		vi.restoreAllMocks();

		const failed = await mount('operator', 0, 500);
		await expect.poll(() =>
			failed.fetchSpy.mock.calls.some(([u]) => String(u).endsWith('/records/to-retake/count'))
		).toBe(true);
		expect(failed.screen.container.querySelector('a[href="/dashboard/retakes"] .s-badge')).toBeNull();
	});
});

// The sidebar's Volúmenes entry (NEH-313): while the unit hides projects,
// Volúmenes takes Proyectos' place, for the same roles, at
// /dashboard/volumes; with projects shown, or when the unit's state cannot
// be read, Proyectos stays as it was.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/dashboard') }) };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function unit(mode: string, projectsShown: boolean) {
	return { mode, projectsEnabled: projectsShown, projectsShown, defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

async function mount(role: UserRole, unitAnswer: Response) {
	const user = { id: 1, username: role, email: null, role, is_active: true };
	authStore.setSession('tok', user);
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input);
		if (url.endsWith('/records/to-retake/count')) return json({ count: 0 });
		if (url.endsWith('/system/unit')) return unitAnswer.clone();
		return json(user);
	});
	const screen = render(Layout, { children });
	await expect.element(screen.getByText('protected content')).toBeVisible();
	return screen;
}

function labels(screen: { container: HTMLElement }) {
	return [...screen.container.querySelectorAll('.s-nav .s-label')].map((l) => l.textContent?.trim());
}

beforeEach(() => locale.set('es'));
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('sidebar Volúmenes', () => {
	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		it(`shows Volúmenes in Proyectos' place to the ${role} role while projects are hidden`, async () => {
			const screen = await mount(role, json(unit('fisqua', false)));
			await expect.poll(() => labels(screen)).toContain('Volúmenes');
			const l = labels(screen);
			expect(l).not.toContain('Proyectos');
			expect(l[l.indexOf('Volúmenes') + 1]).toBe('Cola');
			await expect.element(screen.getByRole('link', { name: /^Volúmenes/ })).toHaveAttribute('href', '/dashboard/volumes');
		});
	}

	it('keeps Proyectos while projects are shown', async () => {
		const screen = await mount('operator', json(unit('offline', true)));
		await expect.poll(() => labels(screen)).toContain('Proyectos');
		expect(labels(screen)).not.toContain('Volúmenes');
	});

	it('keeps Proyectos when the unit’s state cannot be read', async () => {
		const screen = await mount('operator', json({ detail: 'boom' }, 500));
		await expect.poll(() => labels(screen)).toContain('Proyectos');
		expect(labels(screen)).not.toContain('Volúmenes');
	});
});

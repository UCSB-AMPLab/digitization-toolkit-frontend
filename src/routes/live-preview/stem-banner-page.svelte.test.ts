// The capture screen's needs-stem banner and the unit's mode (NEH-311,
// NEH-313): the page passes LiveViewport the link to the volume form on
// Volúmenes while projects are hidden, and, for an operator in Fisqua mode,
// the note that only an administrator can change the stem instead of the
// link. Every request is answered by a fetch mock keyed on the path.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL('http://localhost/live-preview?projectId=2&collectionId=9') });
			return () => {};
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serve(mode: string, projectsShown: boolean) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/system/unit')) {
			return json({ mode, projectsEnabled: projectsShown, projectsShown, defaultProjectId: 2, prerequisites: { backup: [], fisqua: [] } });
		}
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 17', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: null, custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/records/to-retake/summary')) return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		return json([]);
	});
}

function signIn(role: UserRole) {
	authStore.setSession('tok', { id: 1, username: role, email: null, role, is_active: true });
}

beforeEach(() => locale.set('es'));
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

function banner(container: HTMLElement) {
	return container.querySelector('.needs-stem-banner') as HTMLElement | null;
}

describe('capture screen: the needs-stem banner and the unit mode', () => {
	it('gives an operator in Fisqua mode the note, with no link', async () => {
		signIn('operator');
		serve('fisqua', false);
		const screen = render(LivePreview);
		await expect.poll(() => banner(screen.container)?.textContent ?? '').toContain(es.pd_fisqua_codes_readonly);
		expect(banner(screen.container)!.querySelector('a')).toBeNull();
	});

	it('gives an admin in Fisqua mode the link to the form on Volúmenes', async () => {
		signIn('admin');
		serve('fisqua', false);
		const screen = render(LivePreview);
		await expect.poll(() => banner(screen.container)?.querySelector('a')?.getAttribute('href')).toBe('/dashboard/volumes?editVolume=9');
		expect(banner(screen.container)!.textContent).not.toContain(es.pd_fisqua_codes_readonly);
	});

	it('shows no project name in the top bar while projects are hidden', async () => {
		signIn('operator');
		serve('backup', false);
		const screen = render(LivePreview);
		await expect.poll(() => screen.container.querySelector('.bc-collection')?.textContent ?? '').toContain('Tomo 17');
		await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/system\/unit$/), expect.anything()));
		await expect.poll(() => screen.container.querySelector('.bc-project')).toBeNull();
		expect(screen.container.textContent).not.toContain('AHR');
	});

	it('shows the project name in the top bar while projects are shown', async () => {
		signIn('operator');
		serve('offline', true);
		const screen = render(LivePreview);
		await expect.poll(() => screen.container.querySelector('.bc-project')?.textContent?.trim()).toBe('AHR');
	});

	it('links to the project page while projects are shown', async () => {
		signIn('operator');
		serve('offline', true);
		const screen = render(LivePreview);
		await expect.poll(() => banner(screen.container)?.querySelector('a')?.getAttribute('href')).toBe('/dashboard/projects/2?editVolume=9');
	});
});

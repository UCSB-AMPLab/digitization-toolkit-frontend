// The capture screen in a browser that keeps no user in localStorage (a
// private window, blocked or cleared site data): its guard asks /users/me
// with the cookie the browser has. A 200 opens the session and the screen
// loads its volume; a 401 sends it to /login. A saved user is taken as it is,
// without asking (NEH-415).
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL('http://localhost/live-preview?projectId=2&collectionId=9') });
			return () => {};
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { resetUnit } from '$lib/unit-mode';
import '../../app.css';
import LivePreview from './+page.svelte';

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

function serve(me: () => Response) {
	paths = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		paths.push(path);
		if (path.endsWith('/users/me')) return me();
		if (path.endsWith('/system/unit')) {
			return json({
				mode: 'offline',
				projectsEnabled: true,
				projectsShown: true,
				defaultProjectId: 2,
				prerequisites: { backup: [], fisqua: [] }
			});
		}
		if (path.endsWith('/collections/9')) {
			return json({
				id: 9,
				name: 'Tomo 17',
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: 'tomo17',
				custom_attributes: null
			});
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/records/to-retake/summary'))
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		return json([]);
	});
}

beforeEach(() => {
	locale.set('es');
	gotoMock.mockClear();
	authStore.clearSession();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('capture screen with no saved user', () => {
	it('opens the session from the cookie when /users/me answers 200, and loads the volume', async () => {
		serve(() => json(operator));
		const screen = render(LivePreview);
		await expect
			.poll(() => screen.container.querySelector('.bc-collection')?.textContent ?? '')
			.toContain('Tomo 17');
		expect(authStore.getUser()).toEqual(operator);
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
	});

	it('goes to /login on a 401', async () => {
		serve(() => json({ detail: 'Not authenticated' }, 401));
		render(LivePreview);
		await expect.poll(() => gotoMock.mock.calls.map((c) => c[0])).toContain('/login');
		expect(authStore.getUser()).toBeNull();
	});

	it('sends a reviewer signed in by the cookie to the dashboard', async () => {
		serve(() => json({ ...operator, role: 'reviewer' }));
		render(LivePreview);
		await expect.poll(() => gotoMock.mock.calls.map((c) => c[0])).toContain('/dashboard');
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
	});
});

describe('capture screen with a saved user', () => {
	it('does not ask /users/me', async () => {
		authStore.setSession(operator);
		serve(() => json(operator));
		const screen = render(LivePreview);
		await expect
			.poll(() => screen.container.querySelector('.bc-collection')?.textContent ?? '')
			.toContain('Tomo 17');
		expect(paths.some((p) => p.endsWith('/users/me'))).toBe(false);
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
	});
});

// The volume gallery in a browser that keeps no user in localStorage (a
// private window, blocked or cleared site data). The full-screen layout holds
// the guard: it asks /users/me with the cookie the browser has, a 200 opens
// the session and a 401 sends it to /login; a saved user is taken as it is.
// The page does not send anyone to /login itself: it loads its records once
// the session is known (NEH-415).
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable({
			params: { projectId: '7', collectionId: '97' },
			url: new URL('http://localhost/dashboard/projects/7/collections/97'),
			data: { projectName: 'AHR Digitalización 2026', collectionName: 'Tomo 097' }
		})
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, systemApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { resetUnit } from '$lib/unit-mode';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import Layout from './+layout@.svelte';
import CollectionPage from './+page.svelte';

const operator: AuthUser = {
	id: 1,
	username: 'operator1',
	email: null,
	role: 'operator',
	is_active: true
};

const children = createRawSnippet(() => ({ render: () => '<p>volume</p>' }));

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
		return json({}, 500);
	});
}

beforeEach(() => {
	locale.set('es');
	gotoMock.mockClear();
	authStore.clearSession();
	vi.spyOn(systemApi, 'unit').mockRejectedValue(new Error('not read'));
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('gallery layout with no saved user', () => {
	it('opens the session from the cookie when /users/me answers 200', async () => {
		serve(() => json(operator));
		render(Layout, { children });
		await expect.poll(() => authStore.getUser()).toEqual(operator);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
		await expect.element(page.getByText('Tomo 097')).toBeInTheDocument();
	});

	it('goes to /login on a 401', async () => {
		serve(() => json({ detail: 'Not authenticated' }, 401));
		render(Layout, { children });
		await expect.poll(() => gotoMock.mock.calls.map((c) => c[0])).toContain('/login');
		expect(authStore.getUser()).toBeNull();
	});

	it('goes to /login when the session ends while the gallery is open', async () => {
		serve(() => json(operator));
		render(Layout, { children });
		await expect.poll(() => authStore.getUser()).toEqual(operator);
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
		authStore.clearSession();
		await expect.poll(() => gotoMock.mock.calls.map((c) => c[0])).toContain('/login');
	});
});

describe('gallery layout with a saved user', () => {
	it('does not ask /users/me and stays', async () => {
		authStore.setSession(operator);
		serve(() => json(operator));
		render(Layout, { children });
		await expect.element(page.getByText('Tomo 097')).toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(paths.some((p) => p.endsWith('/users/me'))).toBe(false);
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
	});
});

describe('gallery page with no saved user', () => {
	it('does not send the browser to /login itself, and loads the records once the session is open', async () => {
		serve(() => json(operator));
		const listAll = vi.spyOn(recordsApi, 'listAll').mockResolvedValue([] as ApiRecord[]);
		vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue({
			pendingRecords: 0,
			volumes: [],
			turn: { state: 'free', unlockedBy: null }
		});
		const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
		render(CollectionPage, { context: volumeTopbarContext(slot) });
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
		expect(listAll).not.toHaveBeenCalled();

		// What the layout's guard does on a 200 from /users/me.
		authStore.setSession(operator);

		await expect.poll(() => listAll.mock.calls.length).toBe(1);
		expect(gotoMock).not.toHaveBeenCalledWith('/login');
	});
});

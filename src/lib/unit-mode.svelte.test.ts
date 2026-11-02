// The unit's mode through the API (NEH-311): GET and PUT /system/unit, a 403
// that keeps its structured detail, and the store that reads the state once
// per session and again after a change.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { AuthError, collectionsApi, systemApi } from './api';
import { authStore, type AuthUser } from './stores/auth';
import { ensureUnit, reloadUnit, unitState } from './unit-mode';

const admin: AuthUser = { id: 1, username: 'admin1', email: null, role: 'admin', is_active: true };

const unit = {
	mode: 'backup',
	projectsEnabled: false,
	projectsShown: false,
	defaultProjectId: null,
	prerequisites: { backup: [], fisqua: ['fisqua_not_configured'] }
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
	authStore.setSession('tok', admin);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('systemApi.unit and setUnit', () => {
	it('reads GET /system/unit', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(unit));
		expect(await systemApi.unit()).toEqual(unit);
		expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/system\/unit$/);
	});

	it('sends PUT /system/unit with only the fields given', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...unit, mode: 'offline' }));
		await systemApi.setUnit({ mode: 'offline', projectsEnabled: true });
		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toMatch(/\/system\/unit$/);
		expect(init?.method).toBe('PUT');
		expect(JSON.parse(String(init?.body))).toEqual({ mode: 'offline', projectsEnabled: true });
	});
});

describe('a 403 with a structured detail', () => {
	it('is an AuthError that keeps the detail and a readable message', async () => {
		const detail = { code: 'volumes_from_fisqua', message: "In Fisqua mode, volumes come from Fisqua's queue." };
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail }, 403));
		const error = await collectionsApi.create({ name: 'Tomo 1' }).catch((e) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect(error.status).toBe(403);
		expect(error.detail).toEqual(detail);
		expect(error.message).toBe(detail.message);
		// A 403 never ends the session.
		expect(authStore.getToken()).toBe('tok');
	});

	it('has no detail when the 403 carries a string', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Forbidden' }, 403));
		const error = await collectionsApi.create({ name: 'Tomo 1' }).catch((e) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect(error.detail).toBeUndefined();
		expect(error.message).toBe('Forbidden');
	});
});

describe('the unit store', () => {
	it('reads the state once per session, and again on reload', async () => {
		const spy = vi.spyOn(systemApi, 'unit').mockResolvedValue(unit as never);
		expect((await ensureUnit())?.mode).toBe('backup');
		await ensureUnit();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(get(unitState)?.projectsShown).toBe(false);

		spy.mockResolvedValue({ ...unit, mode: 'offline' } as never);
		await reloadUnit();
		expect(spy).toHaveBeenCalledTimes(2);
		expect(get(unitState)?.mode).toBe('offline');
	});

	it('reads it again for a new session', async () => {
		const spy = vi.spyOn(systemApi, 'unit').mockResolvedValue(unit as never);
		await ensureUnit();
		authStore.clearSession();
		expect(get(unitState)).toBeNull();
		authStore.setSession('tok-2', admin);
		await ensureUnit();
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('stays unread when the state cannot be read or has another shape', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue({ id: 1, username: 'admin1' } as never);
		expect(await ensureUnit()).toBeNull();
		expect(get(unitState)).toBeNull();
		vi.mocked(systemApi.unit).mockRejectedValue(new Error('boom'));
		expect(await reloadUnit()).toBeNull();
	});
});

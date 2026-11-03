// NEH-61: the session is an httpOnly cookie. api.ts never reads or writes a
// token in localStorage, never sends one in an Authorization header, and
// never puts one in a URL; every request it makes carries the cookie
// (credentials: 'include') and the CSRF header the backend requires on
// cookie-authenticated state changes.
//
// Version: 0.1.0-beta
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	authApi,
	usersApi,
	recordsApi,
	collectionsApi,
	systemApi,
	camerasApi,
	sessionRequestInit,
	CSRF_HEADER,
	LOGOUT_TIMEOUT_MS
} from './api';
import { authStore, type AuthUser } from './stores/auth';

const user: AuthUser = {
	id: 1,
	username: 'operator1',
	email: null,
	role: 'operator',
	is_active: true
};

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
	return (init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
	gotoMock.mockClear();
	localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	localStorage.clear();
});

describe('requests carry the cookie and the CSRF header, never a bearer token', () => {
	it('a JSON request sends credentials and X-Requested-With and no Authorization header', async () => {
		// A token left in localStorage by an older build must not be picked up.
		localStorage.setItem('access_token', 'stale-token');
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, user));

		await usersApi.me();

		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(init.credentials).toBe('include');
		expect(headersOf(init)[CSRF_HEADER]).toBeTruthy();
		expect(headersOf(init)['Authorization']).toBeUndefined();
		expect(String(fetchSpy.mock.calls[0][0])).not.toContain('token');
	});

	it('a state-changing request carries the CSRF header', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 204 }));

		await recordsApi.deleteImage(5);

		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(init.method).toBe('DELETE');
		expect(init.credentials).toBe('include');
		expect(headersOf(init)[CSRF_HEADER]).toBeTruthy();
	});

	it('the power control request, which bypasses apiRequest, carries them too', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { message: 'ok' }));

		await systemApi.powerControl('reboot');

		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(init.credentials).toBe('include');
		expect(headersOf(init)[CSRF_HEADER]).toBeTruthy();
		expect(headersOf(init)['Content-Type']).toBe('application/json');
		expect(headersOf(init)['Authorization']).toBeUndefined();
	});

	it('a binary request (test capture) carries them too', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 }));

		await camerasApi.testCapture(0);

		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect(headersOf(init)[CSRF_HEADER]).toBe('XMLHttpRequest');
		expect(headersOf(init)['Authorization']).toBeUndefined();
	});

	it('sessionRequestInit keeps headers passed as a Headers object', () => {
		const init = sessionRequestInit({
			headers: new Headers({ 'Content-Type': 'application/json' })
		});
		expect(headersOf(init)['content-type']).toBe('application/json');
		expect(headersOf(init)[CSRF_HEADER]).toBeTruthy();
	});

	it('sessionRequestInit keeps headers passed as an array of pairs', () => {
		const init = sessionRequestInit({ headers: [['Content-Type', 'text/csv']] });
		expect(headersOf(init)['Content-Type']).toBe('text/csv');
		expect(headersOf(init)[CSRF_HEADER]).toBeTruthy();
	});

	it('sessionRequestInit does not send the CSRF header twice under another case', () => {
		const init = sessionRequestInit({ headers: { 'x-requested-with': 'other' } });
		const keys = Object.keys(headersOf(init)).filter((k) => k.toLowerCase() === 'x-requested-with');
		expect(keys).toEqual([CSRF_HEADER]);
	});

	it("a caller's Headers object reaches the request apiRequest sends", async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, user));

		await authApi.register({ username: 'a', email: null, password: 'Password123!' }, 'boot-123');

		const h = headersOf(fetchSpy.mock.calls[0][1] as RequestInit);
		expect(h['X-Bootstrap-Token']).toBe('boot-123');
		expect(h['Content-Type']).toBe('application/json');
		expect(h[CSRF_HEADER]).toBeTruthy();
	});

	it("sessionRequestInit keeps the caller's headers and options", () => {
		const init = sessionRequestInit({
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect(headersOf(init)['Content-Type']).toBe('application/json');
		expect(headersOf(init)[CSRF_HEADER]).toBeTruthy();
	});
});

describe('login and refresh keep no token', () => {
	it('login sends the CSRF header and credentials, and the cookie answer needs nothing kept', async () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(json(200, { access_token: null, token_type: 'cookie' }));

		const result = await authApi.login({ username: 'operator1', password: 'pw' });

		expect(result).toBeUndefined();
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url.endsWith('/auth/login')).toBe(true);
		expect(init.credentials).toBe('include');
		expect(headersOf(init)[CSRF_HEADER]).toBe('XMLHttpRequest');
		expect(setItem).not.toHaveBeenCalled();
	});

	it('refreshSession posts /auth/refresh and keeps nothing from the answer', async () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(json(200, { access_token: null, token_type: 'cookie' }));

		expect(await authApi.refreshSession()).toBeUndefined();

		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url.endsWith('/auth/refresh')).toBe(true);
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect(headersOf(init)[CSRF_HEADER]).toBe('XMLHttpRequest');
		expect(setItem).not.toHaveBeenCalled();
	});

	it('writes nothing token-shaped to localStorage and returns no token', async () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			json(200, { access_token: 'secret-token-value', token_type: 'bearer' })
		);

		const result = await authApi.login({ username: 'operator1', password: 'pw' });

		expect(result).toBeUndefined();
		for (const [key, value] of setItem.mock.calls) {
			expect(key).not.toBe('access_token');
			expect(String(value)).not.toContain('secret-token-value');
		}
		expect(JSON.stringify({ ...localStorage })).not.toContain('secret-token-value');
	});
});

describe('image and download URLs carry no token', () => {
	beforeEach(() => {
		localStorage.setItem('access_token', 'stale-token');
		authStore.setSession(user);
	});

	it.each([
		['thumbnail', () => recordsApi.getImageThumbnailUrl(7), '/records/images/7/thumbnail'],
		['file', () => recordsApi.getImageFileUrl(7), '/records/images/7/file'],
		['preview', () => recordsApi.getImagePreviewUrl(7), '/records/images/7/preview'],
		[
			'export download',
			() => collectionsApi.getExportDownloadUrl(3),
			'/collections/3/export/download'
		]
	])('%s', (_name, build, path) => {
		const url = build();
		expect(url.endsWith(path)).toBe(true);
		expect(url).not.toContain('?');
		expect(url).not.toContain('token');
	});
});

describe('logout', () => {
	it('asks the backend to clear the cookie and clears the local session', async () => {
		authStore.setSession(user);
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 204 }));

		await authApi.logout();

		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url.endsWith('/auth/logout')).toBe(true);
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect(headersOf(init)[CSRF_HEADER]).toBe('XMLHttpRequest');
		expect(authStore.getUser()).toBeNull();
		expect(localStorage.getItem('auth_user')).toBeNull();
	});

	it('clears the local session even when the backend cannot be reached', async () => {
		authStore.setSession(user);
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

		await authApi.logout();

		expect(authStore.getUser()).toBeNull();
	});

	it('gives up on a backend that does not answer within the logout timeout', async () => {
		authStore.setSession(user);
		vi.useFakeTimers();
		try {
			vi.spyOn(globalThis, 'fetch').mockImplementation(
				(_url, init) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener('abort', () =>
							reject(new DOMException('The operation was aborted.', 'AbortError'))
						);
					})
			);

			const done = authApi.logout();
			await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS);
			await done;

			expect(authStore.getUser()).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('clears the local session when the backend refuses the logout', async () => {
		authStore.setSession(user);
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

		await authApi.logout();

		expect(authStore.getUser()).toBeNull();
		expect(gotoMock).not.toHaveBeenCalled();
	});
});

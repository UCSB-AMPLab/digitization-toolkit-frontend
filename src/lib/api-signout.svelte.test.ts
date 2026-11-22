// Sign-out is the last auth request this tab sends (NEH-355): a renewal in
// flight settles before POST /auth/logout goes out, so the cookie deletion is
// processed after any refreshed cookie; no renewal starts from the moment a
// sign-out begins until the next sign-in; a renewal that never answers holds
// a sign-out back by at most SESSION_REFRESH_TIMEOUT_MS. The sign-out on a
// 401 follows the same order.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authApi, projectsApi, LOGOUT_TIMEOUT_MS, SESSION_REFRESH_TIMEOUT_MS } from './api';
import {
	SESSION_RENEW_INTERVAL_MS,
	sessionRenewals,
	startSessionKeepalive
} from './session-keepalive';
import { authStore, type AuthUser } from './stores/auth';

const user: AuthUser = { id: 1, username: 'op1', email: null, role: 'operator', is_active: true };

const cookieAnswer = () =>
	new Response(JSON.stringify({ access_token: null, token_type: 'cookie' }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});

type Route = (init: RequestInit | undefined) => Promise<Response>;

// fetch answered per path; every call is recorded in order.
function routedFetch(routes: { [path: string]: Route }) {
	const order: string[] = [];
	const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname.replace(/^\/api/, '');
		order.push(path);
		const route = routes[path];
		return route ? route(init) : Promise.resolve(new Response('[]', { status: 200 }));
	});
	return { spy, order };
}

// A promise settled from outside.
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

// Records how a pending promise settled, without awaiting it.
function track<T>(promise: Promise<T>) {
	const state: { settled: boolean; error?: unknown } = { settled: false };
	promise.then(
		() => (state.settled = true),
		(error) => {
			state.settled = true;
			state.error = error;
		}
	);
	return state;
}

type Listener = (event: { isTrusted: boolean }) => void;

// An input source for the keepalive whose events count as real input.
function inputTarget() {
	const listeners = new Map<string, Set<Listener>>();
	return {
		addEventListener(type: string, fn: Listener) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener(type: string, fn: Listener) {
			listeners.get(type)?.delete(fn);
		},
		press() {
			for (const fn of listeners.get('pointerdown') ?? []) fn({ isTrusted: true });
		}
	};
}

// Lets reading a response body finish: that takes real tasks of the
// browser, which the fake timers do not run.
async function flush() {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>((resolve) => {
			const channel = new MessageChannel();
			channel.port1.onmessage = () => resolve();
			channel.port2.postMessage(null);
		});
		await vi.advanceTimersByTimeAsync(0);
	}
}

const count = (order: string[], path: string) => order.filter((p) => p === path).length;

let stopKeepalive: (() => void) | undefined;
let clock = 1_000_000;

function keepalive() {
	const target = inputTarget();
	stopKeepalive = startSessionKeepalive({
		target: target as unknown as EventTarget,
		renew: () => authApi.refreshSession(),
		isSignedIn: () => authStore.isAuthenticated(),
		now: () => clock
	});
	return target;
}

beforeEach(() => {
	vi.useFakeTimers();
	gotoMock.mockClear();
	clock = 1_000_000;
	authStore.setSession(user);
});

afterEach(async () => {
	stopKeepalive?.();
	stopKeepalive = undefined;
	vi.useRealTimers();
	vi.restoreAllMocks();
	authStore.clearSession();
	// Each test starts with renewals allowed and none in flight.
	await sessionRenewals.stop();
	sessionRenewals.resume();
});

describe('sign-out and session renewal', () => {
	it('a sign-out waits for the renewal in flight before it sends the logout request', async () => {
		const refresh = deferred<Response>();
		const { order } = routedFetch({
			'/auth/refresh': () => refresh.promise,
			'/auth/logout': () => Promise.resolve(new Response(null, { status: 204 }))
		});
		const target = keepalive();
		target.press();
		expect(count(order, '/auth/refresh')).toBe(1);

		const signOut = track(authApi.logout());
		await vi.advanceTimersByTimeAsync(1000);
		expect(count(order, '/auth/logout')).toBe(0);
		expect(signOut.settled).toBe(false);

		refresh.resolve(cookieAnswer());
		await flush();
		expect(order).toEqual(['/auth/refresh', '/auth/logout']);
		expect(signOut.settled).toBe(true);
		expect(authStore.getUser()).toBeNull();
	});

	it('no input during or after a sign-out starts a renewal', async () => {
		const logout = deferred<Response>();
		const { order } = routedFetch({ '/auth/logout': () => logout.promise });
		const target = keepalive();

		const signOut = track(authApi.logout());
		await vi.advanceTimersByTimeAsync(0);
		// The user is still shown until the logout answers; input renews nothing.
		expect(authStore.getUser()).toEqual(user);
		target.press();
		expect(count(order, '/auth/refresh')).toBe(0);

		logout.resolve(new Response(null, { status: 204 }));
		await vi.advanceTimersByTimeAsync(0);
		expect(signOut.settled).toBe(true);

		// Even with a user put back by some other path, nothing renews until a sign-in.
		authStore.setSession(user);
		clock += SESSION_RENEW_INTERVAL_MS * 2;
		target.press();
		expect(count(order, '/auth/refresh')).toBe(0);
	});

	it('after a new sign-in, input renews the session again', async () => {
		const { order } = routedFetch({
			'/auth/logout': () => Promise.resolve(new Response(null, { status: 204 })),
			'/auth/login': () => Promise.resolve(cookieAnswer()),
			'/auth/refresh': () => Promise.resolve(cookieAnswer())
		});
		const target = keepalive();
		await authApi.logout();

		await authApi.login({ username: 'op1', password: 'secret' });
		authStore.setSession(user, { signIn: true });
		target.press();
		expect(count(order, '/auth/refresh')).toBe(1);
	});

	it('a renewal that never answers holds a sign-out back by at most its own limit', async () => {
		const { order } = routedFetch({
			// Settles on nothing, not even its signal.
			'/auth/refresh': () => new Promise<Response>(() => {}),
			'/auth/logout': () => new Promise<Response>(() => {})
		});
		const target = keepalive();
		target.press();

		const signOut = track(authApi.logout());
		await vi.advanceTimersByTimeAsync(SESSION_REFRESH_TIMEOUT_MS - 1);
		expect(count(order, '/auth/logout')).toBe(0);

		await vi.advanceTimersByTimeAsync(1);
		expect(count(order, '/auth/logout')).toBe(1);
		expect(signOut.settled).toBe(false);

		await vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS);
		expect(signOut.settled).toBe(true);
		expect(authStore.getUser()).toBeNull();
	});

	it('on a 401 with a renewal in flight, a logout request follows the renewal, and a sign-in waits for it', async () => {
		const refresh = deferred<Response>();
		const logout = deferred<Response>();
		const { order } = routedFetch({
			'/auth/refresh': () => refresh.promise,
			'/auth/logout': () => logout.promise,
			'/auth/login': () => Promise.resolve(cookieAnswer()),
			'/projects/': () =>
				Promise.resolve(
					new Response(JSON.stringify({ detail: 'Not authenticated' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					})
				)
		});
		const target = keepalive();
		target.press();

		await expect(projectsApi.list()).rejects.toMatchObject({ name: 'AuthError', status: 401 });
		expect(authStore.getUser()).toBeNull();
		expect(count(order, '/auth/logout')).toBe(0);

		const signIn = track(authApi.login({ username: 'op2', password: 'secret' }));
		await vi.advanceTimersByTimeAsync(0);
		expect(count(order, '/auth/login')).toBe(0);

		// The renewal answers with a fresh cookie after the 401: the logout
		// that follows deletes it, and the tab stays signed out.
		refresh.resolve(cookieAnswer());
		await flush();
		expect(count(order, '/auth/logout')).toBe(1);
		expect(authStore.getUser()).toBeNull();
		clock += SESSION_RENEW_INTERVAL_MS * 2;
		target.press();
		expect(count(order, '/auth/refresh')).toBe(1);
		expect(count(order, '/auth/login')).toBe(0);

		logout.resolve(new Response(null, { status: 204 }));
		await flush();
		expect(signIn.settled).toBe(true);
		expect(order.slice(-2)).toEqual(['/auth/logout', '/auth/login']);
	});

	it('a sign-out that fails does not stop a later sign-in', async () => {
		const { order } = routedFetch({
			'/auth/logout': () => Promise.resolve(new Response(null, { status: 204 })),
			'/auth/login': () => Promise.resolve(cookieAnswer())
		});
		// A store subscriber that throws makes clearSession, and so the sign-out, fail.
		const realClearSession = authStore.clearSession.bind(authStore);
		const clearSession = vi.spyOn(authStore, 'clearSession').mockImplementationOnce(() => {
			throw new Error('boom');
		});

		await expect(authApi.logout()).rejects.toThrow('boom');
		clearSession.mockRestore();
		realClearSession();
		expect(authStore.getUser()).toBeNull();
		expect(count(order, '/auth/logout')).toBe(1);

		await expect(authApi.login({ username: 'op1', password: 'secret' })).resolves.toBeUndefined();
		expect(count(order, '/auth/login')).toBe(1);
		expect(order).toEqual(['/auth/logout', '/auth/login']);
	});

	it('on a 401 with no renewal in flight, only the local session is cleared', async () => {
		const { order } = routedFetch({
			'/projects/': () =>
				Promise.resolve(
					new Response(JSON.stringify({ detail: 'Not authenticated' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					})
				)
		});
		const target = keepalive();

		await expect(projectsApi.list()).rejects.toMatchObject({ status: 401 });
		await vi.advanceTimersByTimeAsync(0);
		expect(authStore.getUser()).toBeNull();
		expect(order).toEqual(['/projects/']);

		authStore.setSession(user);
		target.press();
		expect(count(order, '/auth/refresh')).toBe(0);
	});
});

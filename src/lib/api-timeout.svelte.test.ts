// Every request through apiRequest() and apiRequestBlob() has a time limit
// (NEH-356): a backend that accepts the connection and never answers ends in
// a TimeoutError carrying the existing "request failed" message, never in a
// page that waits for ever. The limit depends on the call (a capture can wait
// far longer than a list), a caller's own signal still cancels the request,
// and a timeout leaves the session alone.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	camerasApi,
	fisquaApi,
	healthApi,
	projectsApi,
	systemApi,
	withTimeLimit,
	CAMERA_REQUEST_TIMEOUT_MS,
	HEALTH_REQUEST_TIMEOUT_MS,
	POWER_REQUEST_TIMEOUT_MS,
	REQUEST_TIMEOUT_MS,
	SLOW_REQUEST_TIMEOUT_MS
} from './api';
import { m } from './i18n';
import { authStore, type AuthUser } from './stores/auth';

const user: AuthUser = { id: 1, username: 'op1', email: null, role: 'operator', is_active: true };

// A fetch that never answers on its own: it settles only when its signal
// aborts, with the signal's reason, as the browser's fetch does.
function hangingFetch() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(
		(_input, init) =>
			new Promise<Response>((_resolve, reject) => {
				const signal = init?.signal;
				if (!signal) return;
				if (signal.aborted) reject(signal.reason);
				signal.addEventListener('abort', () => reject(signal.reason), { once: true });
			})
	);
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

beforeEach(() => {
	vi.useFakeTimers();
	gotoMock.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('request time limits', () => {
	it('an ordinary request that gets no answer ends in a TimeoutError at REQUEST_TIMEOUT_MS', async () => {
		authStore.setSession(user);
		hangingFetch();
		const state = track(projectsApi.list());

		await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
		expect(state.settled).toBe(false);

		await vi.advanceTimersByTimeAsync(1);
		expect(state.settled).toBe(true);
		expect(state.error).toBeInstanceOf(DOMException);
		expect((state.error as DOMException).name).toBe('TimeoutError');
		expect((state.error as DOMException).message).toBe(get(m).api_request_failed);
		// A timeout says nothing about the session.
		expect(authStore.getUser()).toEqual(user);
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('a response body that never finishes is cut at the same limit', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(new ReadableStream({ start() {} }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const state = track(projectsApi.list());

		await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
		expect(state.settled).toBe(true);
		expect((state.error as DOMException).name).toBe('TimeoutError');
	});

	it('a capture is not cut at the ordinary limit, only at CAMERA_REQUEST_TIMEOUT_MS', async () => {
		hangingFetch();
		const state = track(camerasApi.captureDual({ cameras: [0, 1] } as never));

		await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2);
		expect(state.settled).toBe(false);

		await vi.advanceTimersByTimeAsync(CAMERA_REQUEST_TIMEOUT_MS - REQUEST_TIMEOUT_MS * 2);
		expect(state.settled).toBe(true);
		expect((state.error as DOMException).name).toBe('TimeoutError');
	});

	it('apiRequestBlob has a limit too (a preview frame waits like a capture)', async () => {
		hangingFetch();
		const state = track(camerasApi.previewFrame(0));

		await vi.advanceTimersByTimeAsync(CAMERA_REQUEST_TIMEOUT_MS - 1);
		expect(state.settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect((state.error as DOMException).name).toBe('TimeoutError');
	});

	it('the health check has a short limit of its own', async () => {
		hangingFetch();
		const state = track(healthApi.check());

		await vi.advanceTimersByTimeAsync(HEALTH_REQUEST_TIMEOUT_MS);
		expect(state.settled).toBe(true);
		expect((state.error as DOMException).name).toBe('TimeoutError');
	});

	it("a caller's signal still cancels the request, with the caller's reason", async () => {
		hangingFetch();
		const controller = new AbortController();
		const state = track(fisquaApi.searchDescriptions('tomo', controller.signal));

		const reason = new DOMException('stopped', 'AbortError');
		controller.abort(reason);
		await vi.advanceTimersByTimeAsync(0);
		expect(state.settled).toBe(true);
		expect(state.error).toBe(reason);
	});

	it('a limit that is not a positive finite number falls back to the ordinary limit', async () => {
		for (const timeoutMs of [Infinity, NaN, 0, -1, null as unknown as number]) {
			const state = track(withTimeLimit({ timeoutMs }, () => new Promise<never>(() => {})));
			await vi.advanceTimersByTimeAsync(0);
			expect(state.settled, String(timeoutMs)).toBe(false);

			await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
			expect(state.settled, String(timeoutMs)).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			expect((state.error as DOMException).name, String(timeoutMs)).toBe('TimeoutError');
		}
	});

	it("a caller's signal aborted before the call ends it at once, with the caller's reason", async () => {
		const fetchSpy = hangingFetch();
		const controller = new AbortController();
		const reason = new DOMException('stopped', 'AbortError');
		controller.abort(reason);

		const state = track(fisquaApi.searchDescriptions('tomo', controller.signal));
		await vi.advanceTimersByTimeAsync(0);
		expect(state.settled).toBe(true);
		expect(state.error).toBe(reason);
		const sent = fetchSpy.mock.calls[0]?.[1]?.signal;
		if (sent) expect(sent.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('a binary body that never finishes is cut at the limit of its call', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(new ReadableStream({ start() {} }), {
				status: 200,
				headers: { 'Content-Type': 'image/jpeg' }
			})
		);
		const state = track(camerasApi.previewFrame(0));

		await vi.advanceTimersByTimeAsync(CAMERA_REQUEST_TIMEOUT_MS - 1);
		expect(state.settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect((state.error as DOMException).name).toBe('TimeoutError');
	});

	it('changing the unit mode waits on Fisqua and has the slow limit, not the ordinary one', async () => {
		hangingFetch();
		const state = track(systemApi.setUnit({ mode: 'fisqua' }));

		await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2);
		expect(state.settled).toBe(false);

		await vi.advanceTimersByTimeAsync(SLOW_REQUEST_TIMEOUT_MS - REQUEST_TIMEOUT_MS * 2);
		expect(state.settled).toBe(true);
		expect((state.error as DOMException).name).toBe('TimeoutError');
	});

	it('a power order that gets no answer ends in a TimeoutError at POWER_REQUEST_TIMEOUT_MS', async () => {
		hangingFetch();
		const state = track(systemApi.powerControl('reboot'));

		await vi.advanceTimersByTimeAsync(POWER_REQUEST_TIMEOUT_MS - 1);
		expect(state.settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect((state.error as DOMException).name).toBe('TimeoutError');
		expect((state.error as DOMException).message).toBe(get(m).api_request_failed);
	});

	it('a request that answers in time leaves no timer behind', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
			);
		await expect(projectsApi.list()).resolves.toEqual([]);

		const signal = (fetchSpy.mock.calls[0][1] as RequestInit).signal!;
		await vi.advanceTimersByTimeAsync(CAMERA_REQUEST_TIMEOUT_MS);
		expect(signal.aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});

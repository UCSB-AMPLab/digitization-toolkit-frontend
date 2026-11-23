// NEH-252/348: the shared store of the camera kind. Each call reads the
// route again; a read in flight is shared; the answer before stays in the
// store while a new one is read, and when a later read fails; a failed
// first read is read again at the next call.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { cameraKindApi, type CameraKindWire } from './api';
import { cameraKind, loadCameraKind, readCameraKindNow, resetCameraKind } from './camera-kind';

function wire(configured: string): CameraKindWire {
	return {
		configured,
		source: 'detected',
		stored: null,
		pending_restart: false,
		detected: null,
		connected: { picamera2: 0, gphoto2: 2, chdk: 0 },
		available: { picamera2: true, gphoto2: true, chdk: true },
		mixed: false,
		mismatch: false
	};
}

const configured = () => {
	const s = get(cameraKind);
	return s.status === 'ready' ? s.report.configured : s.status;
};

afterEach(() => {
	vi.restoreAllMocks();
	resetCameraKind();
});

describe('camera kind store', () => {
	it('reads again on each call and shares a read in flight', async () => {
		const api = vi.spyOn(cameraKindApi, 'get').mockResolvedValue(wire('gphoto2'));
		await loadCameraKind();
		await loadCameraKind();
		expect(api).toHaveBeenCalledTimes(2);
		await Promise.all([loadCameraKind(), loadCameraKind()]);
		expect(api).toHaveBeenCalledTimes(3);
	});

	it('keeps the answer before while a new read is in flight, then takes the new one', async () => {
		const api = vi.spyOn(cameraKindApi, 'get').mockResolvedValueOnce(wire('gphoto2'));
		await loadCameraKind();
		let answer: (v: CameraKindWire) => void = () => {};
		api.mockImplementationOnce(() => new Promise((r) => (answer = r)));
		const next = loadCameraKind();
		await expect.poll(() => api.mock.calls.length).toBe(2);
		expect(configured()).toBe('gphoto2');
		answer(wire('chdk'));
		await next;
		expect(configured()).toBe('chdk');
	});

	it('keeps the answer before when a later read fails', async () => {
		const api = vi.spyOn(cameraKindApi, 'get').mockResolvedValueOnce(wire('gphoto2'));
		await loadCameraKind();
		api.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await loadCameraKind();
		expect(configured()).toBe('gphoto2');
	});

	it('reads again at the next call after a failed first read', async () => {
		const api = vi
			.spyOn(cameraKindApi, 'get')
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(wire('picamera2'));
		await loadCameraKind();
		expect(configured()).toBe('failed');
		await loadCameraKind();
		expect(api).toHaveBeenCalledTimes(2);
		expect(configured()).toBe('picamera2');
	});
});

describe('camera kind store: a fresh read', () => {
	function deferred<T>() {
		let resolve!: (v: T) => void;
		const promise = new Promise<T>((r) => (resolve = r));
		return { promise, resolve };
	}

	it('is answered only by a request sent after it was asked for, never by an older one arriving late', async () => {
		const old = deferred<CameraKindWire>();
		const fresh = deferred<CameraKindWire>();
		const api = vi
			.spyOn(cameraKindApi, 'get')
			.mockImplementationOnce(() => old.promise)
			.mockImplementationOnce(() => fresh.promise);
		const mount = loadCameraKind();
		await expect.poll(() => api.mock.calls.length).toBe(1);
		const after = loadCameraKind({ fresh: true });
		// The fresh read waits for the one in flight, then sends its own.
		expect(api).toHaveBeenCalledTimes(1);
		old.resolve(wire('picamera2'));
		await mount;
		await expect.poll(() => api.mock.calls.length).toBe(2);
		fresh.resolve(wire('chdk'));
		const state = await after;
		expect(state.status === 'ready' && state.report.configured).toBe('chdk');
		expect(configured()).toBe('chdk');
	});

	it('shares one new request among fresh callers asking before it is sent', async () => {
		const old = deferred<CameraKindWire>();
		const api = vi
			.spyOn(cameraKindApi, 'get')
			.mockImplementationOnce(() => old.promise)
			.mockResolvedValue(wire('chdk'));
		void loadCameraKind();
		await expect.poll(() => api.mock.calls.length).toBe(1);
		const a = loadCameraKind({ fresh: true });
		const b = loadCameraKind({ fresh: true });
		old.resolve(wire('picamera2'));
		await Promise.all([a, b]);
		expect(api).toHaveBeenCalledTimes(2);
	});

	it('sends another request for a fresh caller asking once the fresh one is already sent', async () => {
		const first = deferred<CameraKindWire>();
		const api = vi
			.spyOn(cameraKindApi, 'get')
			.mockImplementationOnce(() => first.promise)
			.mockResolvedValue(wire('chdk'));
		const a = loadCameraKind({ fresh: true });
		await expect.poll(() => api.mock.calls.length).toBe(1);
		const b = loadCameraKind({ fresh: true });
		first.resolve(wire('picamera2'));
		await a;
		const state = await b;
		expect(api).toHaveBeenCalledTimes(2);
		expect(state.status === 'ready' && state.report.configured).toBe('chdk');
	});
});

describe('camera kind store: a read that decides', () => {
	it('answers null when its own request fails, never the answer read before', async () => {
		vi.spyOn(cameraKindApi, 'get')
			.mockResolvedValueOnce(wire('gphoto2'))
			.mockRejectedValue(new TypeError('Failed to fetch'));
		await loadCameraKind();
		expect(await readCameraKindNow()).toBeNull();
		// The store, and so the screens, keep the answer before.
		expect(configured()).toBe('gphoto2');
	});

	it('answers the report its own request read', async () => {
		vi.spyOn(cameraKindApi, 'get')
			.mockResolvedValueOnce(wire('gphoto2'))
			.mockResolvedValueOnce(wire('chdk'));
		await loadCameraKind();
		expect((await readCameraKindNow())?.configured).toBe('chdk');
	});
});

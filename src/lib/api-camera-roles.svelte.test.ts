// NEH-342/NEH-343: which camera photographs which page. GET /cameras/setup
// says whether the unit needs an answer, and why; PUT /cameras/roles saves
// both roles in one request; GET /cameras/preview/{n} gives one frame. A
// backend without /cameras/setup (404) needs no answer, so the capture
// screen behaves as before.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, camerasApi, isPreviewFrameFailed, isPreviewFrameFailedResponse } from './api';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const pathOf = (input: unknown) => new URL(String(input), 'http://localhost').pathname;

afterEach(() => vi.restoreAllMocks());

describe('camerasApi.getSetup', () => {
	it('reads GET /cameras/setup', async () => {
		const setup = {
			needs_setup: true,
			reasons: [{ code: 'port_changed', message: 'Camera b is on a different port', hardware_ids: ['b'] }],
			confirmed_pair: { left: 'a', right: 'b' }
		};
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(setup));
		expect(await camerasApi.getSetup()).toEqual(setup);
		expect(pathOf(fetchSpy.mock.calls[0][0]).endsWith('/cameras/setup')).toBe(true);
	});

	it('a backend without the route (404) needs no set-up', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Not Found' }, 404));
		expect(await camerasApi.getSetup()).toEqual({ needs_setup: false, reasons: [], confirmed_pair: null });
	});

	it('any other failure throws', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Storage unavailable' }, 503));
		const err = await camerasApi.getSetup().catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.status).toBe(503);
	});
});

describe('camerasApi.setRoles', () => {
	it('puts both roles in one request and returns the devices and the set-up', async () => {
		const answer = { devices: [{ index: 0, hardware_id: 'a', role: 'left' }], setup: { needs_setup: false, reasons: [], confirmed_pair: { left: 'a', right: 'b' } } };
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(answer));
		expect(await camerasApi.setRoles('a', 'b')).toEqual(answer);
		const [input, init] = fetchSpy.mock.calls[0];
		expect(pathOf(input).endsWith('/cameras/roles')).toBe(true);
		expect(init?.method).toBe('PUT');
		expect(JSON.parse(String(init?.body))).toEqual({ left: { hardware_id: 'a' }, right: { hardware_id: 'b' } });
	});

	it('a 409 keeps its code in the detail', async () => {
		const detail = { code: 'camera_not_connected', message: 'Camera b is not connected' };
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail }, 409));
		const err = await camerasApi.setRoles('a', 'b').catch((e) => e);
		expect(err.status).toBe(409);
		expect(err.detail).toEqual(detail);
	});
});

describe('camerasApi.previewFrame', () => {
	it('asks GET /cameras/preview/{n} for one frame', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 }));
		const blob = await camerasApi.previewFrame(1);
		expect(blob.size).toBe(1);
		const [input, init] = fetchSpy.mock.calls[0];
		expect(pathOf(input).endsWith('/cameras/preview/1')).toBe(true);
		expect(init?.method ?? 'GET').toBe('GET');
	});

	it('a camera without a frame throws', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Camera 1 not found' }, 404));
		const err = await camerasApi.previewFrame(1).catch((e) => e);
		expect(err.status).toBe(404);
		expect(isPreviewFrameFailed(err)).toBe(false);
	});

	// NEH-349: a connected camera that sent no frame answers 503 with
	// detail.code preview_frame_failed; the next request may get one.
	const FAILED = { code: 'preview_frame_failed', message: 'The camera is connected but did not send a preview frame.' };

	it('the 503 preview_frame_failed throws an ApiError that isPreviewFrameFailed recognises', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: FAILED }, 503));
		const err = await camerasApi.previewFrame(0).catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.status).toBe(503);
		expect(err.detail).toEqual(FAILED);
		expect(err.message).toBe(FAILED.message);
		expect(isPreviewFrameFailed(err)).toBe(true);
	});

	it('a 503 without the code, or another status with it, is not that answer', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Capture system not available: x' }, 503));
		const busy = await camerasApi.previewFrame(0).catch((e) => e);
		expect(busy.status).toBe(503);
		expect(busy.message).toBe('Capture system not available: x');
		expect(isPreviewFrameFailed(busy)).toBe(false);
		expect(isPreviewFrameFailed(new ApiError('x', FAILED, 500))).toBe(false);
		expect(isPreviewFrameFailed(new Error('x'))).toBe(false);
	});

	it('isPreviewFrameFailedResponse reads a raw response without using up its body', async () => {
		const failed = json({ detail: FAILED }, 503);
		expect(await isPreviewFrameFailedResponse(failed)).toBe(true);
		expect(await failed.json()).toEqual({ detail: FAILED });
		expect(await isPreviewFrameFailedResponse(json({ detail: 'Capture system not available: x' }, 503))).toBe(false);
		expect(await isPreviewFrameFailedResponse(new Response('', { status: 503 }))).toBe(false);
		expect(await isPreviewFrameFailedResponse(json({ detail: FAILED }, 404))).toBe(false);
	});
});

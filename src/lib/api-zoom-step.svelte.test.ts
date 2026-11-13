// NEH-339: the stepped zoom of a CHDK camera. POST /cameras/settings/{n}
// with {"zoom_step": n} answers with the step the camera confirmed; a refusal
// keeps the backend's detail, and pydantic's list form stays readable.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, camerasApi } from './api';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.restoreAllMocks());

describe('camerasApi.setZoomStep', () => {
	it('posts the step to the camera and returns the step it confirmed', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'Zoom step applied', zoom_step: 26 }));
		const result = await camerasApi.setZoomStep(1, 25);
		const [input, init] = fetchSpy.mock.calls[0];
		expect(new URL(String(input), 'http://localhost').pathname.endsWith('/cameras/settings/1')).toBe(true);
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual({ zoom_step: 25 });
		expect(result.zoom_step).toBe(26);
	});

	it('a 502 throws with the status and the detail', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'The camera on usb:001,004 did not move the lens' }, 502));
		const err = await camerasApi.setZoomStep(0, 3).catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.status).toBe(502);
		expect(err.message).toBe('The camera on usb:001,004 did not move the lens');
	});

	it('a 422 in the list form keeps the list as the detail', async () => {
		const list = [{ type: 'int_type', loc: ['body', 'zoom_step'], msg: 'Input should be a valid integer' }];
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: list }, 422));
		const err = await camerasApi.setZoomStep(0, 3).catch((e) => e);
		expect(err.status).toBe(422);
		expect(err.detail).toEqual(list);
	});
});

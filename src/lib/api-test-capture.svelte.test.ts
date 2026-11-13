// NEH-339: the test capture of the focus check asks for the backend's bounded
// mode (?focus_check=true, an answer within about 20 s, 504 when no picture
// came), and reads the focal length the backend may attach. The dashboard's
// call stays as it was.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi } from './api';

function image(headers: Record<string, string> = {}) {
	return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200, headers });
}

afterEach(() => vi.restoreAllMocks());

describe('camerasApi.testCapture', () => {
	it('without options: no query, and no focal length when the header is absent', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(image({ 'X-Capture-Seconds': '4.200' }));
		const result = await camerasApi.testCapture(1);
		const url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost');
		expect(url.pathname.endsWith('/cameras/test-capture/1')).toBe(true);
		expect(url.search).toBe('');
		expect(result.seconds).toBe(4.2);
		expect(result.focalLength).toBeNull();
	});

	it('with focusCheck: ?focus_check=true, and the focal length in millimetres', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(image({ 'X-Focal-Length': '27.5' }));
		const result = await camerasApi.testCapture(0, { focusCheck: true });
		const url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://localhost');
		expect(url.pathname.endsWith('/cameras/test-capture/0')).toBe(true);
		expect(url.searchParams.get('focus_check')).toBe('true');
		expect(result.focalLength).toBe(27.5);
	});

	it('a focal length that is not a number is null', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(image({ 'X-Focal-Length': 'unknown' }));
		expect((await camerasApi.testCapture(0, { focusCheck: true })).focalLength).toBeNull();
	});
});

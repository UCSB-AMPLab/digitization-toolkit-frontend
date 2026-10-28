// A FormData upload through apiRequest (0.2.0, the digitisation list
// import): no JSON Content-Type, so the browser writes the multipart one
// with its boundary; the bearer token still goes; the body is the FormData
// itself, with the file under `file`. A JSON request keeps its Content-Type.
//
// Version: 0.2.0
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { importsApi } from './api';
import { authStore } from './stores/auth';

function respondJson(body: unknown) {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
	);
}

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('apiRequest with a FormData body', () => {
	it('sends the FormData as the body, with the bearer and without a JSON Content-Type', async () => {
		authStore.setSession('tok-9', { id: 1, username: 'op', email: null, role: 'operator', is_active: true });
		const fetchSpy = respondJson({ listId: 'x' });
		const file = new File(['{"contract":"fisqua-captua-exchange"}'], 'lista.json', { type: 'application/json' });

		await importsApi.importList(file);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url.endsWith('/imports/digitisation-list')).toBe(true);
		expect(init.method).toBe('POST');
		const headers = init.headers as Record<string, string>;
		expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
		expect(headers['Authorization']).toBe('Bearer tok-9');
		expect(init.body).toBeInstanceOf(FormData);
		const sent = (init.body as FormData).get('file') as File;
		expect(sent).toBeInstanceOf(File);
		expect(sent.name).toBe('lista.json');
		expect(await sent.text()).toBe('{"contract":"fisqua-captua-exchange"}');
	});

	it('leaves a JSON request with its Content-Type', async () => {
		authStore.setSession('tok-9', { id: 1, username: 'rev', email: null, role: 'reviewer', is_active: true });
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

		await importsApi.setDone('0b9c1d5e-0000-4000-8000-000000000001', 3, true);

		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url.endsWith('/imports/digitisation-lists/0b9c1d5e-0000-4000-8000-000000000001/items/3/done')).toBe(true);
		expect(init.method).toBe('PUT');
		expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
		expect(init.body).toBe('{"done":true}');
	});
});

// NEH-186: healthApi.probe() tells the update page's own answer (503 with a
// JSON body whose `status` is "unavailable", scripts/update-page/serve.py)
// from a healthy answer and from every other failure.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { healthApi } from './api';

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('healthApi.probe', () => {
	it('reads each answer', async () => {
		const cases: [() => Promise<Response>, string][] = [
			[async () => json(200, { status: 'ok' }), 'ok'],
			[
				async () =>
					json(503, { status: 'unavailable', detail: 'Captua is stopped for an update.' }),
				'update'
			],
			[async () => json(503, { detail: 'Service Unavailable' }), 'unreachable'],
			[async () => new Response('<html>busy</html>', { status: 503 }), 'unreachable'],
			[async () => new Response('Bad Gateway', { status: 502 }), 'unreachable'],
			[async () => new Response('', { status: 504 }), 'unreachable'],
			[async () => json(500, { detail: 'x' }), 'unreachable'],
			[
				async () => {
					throw new TypeError('Failed to fetch');
				},
				'unreachable'
			]
		];
		for (const [answer, expected] of cases) {
			vi.spyOn(globalThis, 'fetch').mockImplementationOnce(answer);
			expect(await healthApi.probe(new AbortController().signal)).toBe(expected);
		}
	});

	it('gives up when the signal aborts', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(
			(_u, init) =>
				new Promise((_r, reject) =>
					init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
				)
		);
		const ctrl = new AbortController();
		const p = healthApi.probe(ctrl.signal);
		ctrl.abort();
		expect(await p).toBe('unreachable');
	});
});

// NEH-345: the client of the unit's pairing routes. GET /system/pairing is
// read through readPairingStatus, so a field the contract does not name (a
// secret, if one ever leaked) never reaches the page; POST sends only the
// unit's name; renew and cancel send nothing. Refusals keep the status and
// the detail, from which the card reads the code.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, systemApi } from './api';
import { pairingErrorCode } from './fisqua-pairing';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const ANSWER = {
	state: 'showing',
	reason: null,
	trouble: null,
	deviceId: 'k3m9qz7a',
	deviceIdError: null,
	unitName: 'Sala 2',
	code: 'ABCDEF',
	expiresInSeconds: 290,
	renewalSecondsLeft: 540,
	environment: 'production',
	currentTenant: null,
	linked: { configured: false, tenant: null, environment: null },
	eligible: { ok: true, reason: null },
	retryAfterSeconds: null,
	result: null,
	restartRequired: false,
	lastOutcome: null
};

const path = (input: unknown) => new URL(String(input), 'http://localhost').pathname;

afterEach(() => vi.restoreAllMocks());

describe('systemApi pairing', () => {
	it('getPairing reads GET /system/pairing and drops fields outside the contract', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(json({ ...ANSWER, collectSecret: 'cs-1', token: 't-1' }));
		const s = await systemApi.getPairing();
		const [input, init] = fetchSpy.mock.calls[0];
		expect(path(input).endsWith('/system/pairing')).toBe(true);
		expect(init?.method ?? 'GET').toBe('GET');
		expect(s).toEqual(ANSWER);
		expect(JSON.stringify(s)).not.toMatch(/secret|token|cs-1|t-1/i);
	});

	it('getPairing passes the abort signal', async () => {
		// The request carries a signal of its own that also has the time limit
		// (NEH-356); aborting the caller's signal aborts it.
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
			(_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), {
						once: true
					});
				})
		);
		const ctrl = new AbortController();
		const pending = systemApi.getPairing(ctrl.signal);
		const sent = fetchSpy.mock.calls[0][1]?.signal as AbortSignal;
		expect(sent.aborted).toBe(false);
		ctrl.abort();
		expect(sent.aborted).toBe(true);
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('getPairing throws for an answer without a state', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ hello: 1 }));
		await expect(systemApi.getPairing()).rejects.toThrow();
	});

	it('startPairing posts only the unit name', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(json({ ...ANSWER, state: 'requesting' }));
		const s = await systemApi.startPairing('Sala 2');
		const [input, init] = fetchSpy.mock.calls[0];
		expect(path(input).endsWith('/system/pairing')).toBe(true);
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual({ unitName: 'Sala 2' });
		expect(s?.state).toBe('requesting');
	});

	it('renewPairing posts to /system/pairing/renew with no body', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(ANSWER));
		await systemApi.renewPairing();
		const [input, init] = fetchSpy.mock.calls[0];
		expect(path(input).endsWith('/system/pairing/renew')).toBe(true);
		expect(init?.method).toBe('POST');
		expect(init?.body).toBeUndefined();
	});

	it('cancelPairing sends DELETE /system/pairing, and accepts an empty answer', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 204 }));
		const s = await systemApi.cancelPairing();
		const [input, init] = fetchSpy.mock.calls[0];
		expect(path(input).endsWith('/system/pairing')).toBe(true);
		expect(init?.method).toBe('DELETE');
		expect(s).toBeNull();
	});

	it('renew and cancel answer with the same body as GET', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			json({ ...ANSWER, state: 'cancelled', code: null })
		);
		expect((await systemApi.renewPairing())?.state).toBe('cancelled');
		expect((await systemApi.cancelPairing())?.state).toBe('cancelled');
	});

	it.each([
		'mode_not_eligible',
		'offsite_held',
		'rclone_missing',
		'busy_capturing',
		'script_missing',
		'script_too_old',
		'not_renewable',
		'restart_required',
		'offsite_job_running',
		'device_id_missing',
		'device_id_invalid',
		'device_id_unreadable'
	])('a 409 %s keeps its code', async (code) => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			json({ detail: { code, message: 'English' } }, 409)
		);
		const err = await systemApi.startPairing('Sala 2').catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(pairingErrorCode(err)).toBe(code);
	});

	it('a 422 unit_name keeps its code', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			json({ detail: { code: 'unit_name', message: 'English' } }, 422)
		);
		const err = await systemApi.startPairing('x'.repeat(65)).catch((e) => e);
		expect(pairingErrorCode(err)).toBe('unit_name');
	});
});

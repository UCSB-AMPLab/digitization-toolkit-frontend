// Linking the unit to a Fisqua workspace by a code (NEH-345): the pure
// helpers of the Settings card. The answer of GET /system/pairing is read
// field by field, so nothing else the backend sends reaches the page; the
// code is grouped three and three; refusals are read as codes; the poll
// runs every interval while the page is visible and stops once the page has
// been hidden for long.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	groupCode,
	pairingErrorCode,
	pairingPanel,
	pollPairing,
	readPairingStatus,
	PAIRING_HIDDEN_STOP_MS,
	PAIRING_POLL_MS
} from './fisqua-pairing';

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

describe('readPairingStatus', () => {
	it('keeps the fields of the contract', () => {
		expect(readPairingStatus(ANSWER)).toEqual(ANSWER);
	});

	it('drops any other field, secrets included', () => {
		const s = readPairingStatus({
			...ANSWER,
			collectSecret: 'cs-1',
			secret: 's-1',
			token: 't-1',
			apiKey: 'k-1',
			linked: { ...ANSWER.linked, token: 't-2' },
			result: {
				tenant: 'archivo-x',
				environment: 'production',
				at: '2026-11-13T10:00:00Z',
				by: 'admin1',
				secret: 's-2'
			}
		});
		expect(JSON.stringify(s)).not.toMatch(/secret|token|apiKey|cs-1|s-1|t-1|t-2|k-1|s-2/i);
		expect(s?.result).toEqual({
			tenant: 'archivo-x',
			environment: 'production',
			at: '2026-11-13T10:00:00Z',
			by: 'admin1'
		});
	});

	it('reads a missing or malformed field as null rather than failing', () => {
		const s = readPairingStatus({ state: 'idle' });
		expect(s?.state).toBe('idle');
		expect(s?.code).toBeNull();
		expect(s?.linked).toEqual({ configured: false, tenant: null, environment: null });
		expect(s?.eligible).toEqual({ ok: true, reason: null });
		expect(s?.renewalSecondsLeft).toBeNull();
		expect(s?.trouble).toBeNull();
		expect(s?.deviceIdError).toBeNull();
	});

	it('keeps restartRequired and lastOutcome, and reads them as false and null when absent', () => {
		const s = readPairingStatus({
			...ANSWER,
			state: 'idle',
			restartRequired: true,
			lastOutcome: 'apply_unverified'
		});
		expect([s?.restartRequired, s?.lastOutcome]).toEqual([true, 'apply_unverified']);
		const bare = readPairingStatus({ state: 'idle' });
		expect([bare?.restartRequired, bare?.lastOutcome]).toEqual([false, null]);
	});

	it('keeps the reason, the trouble and the device id error', () => {
		const s = readPairingStatus({
			...ANSWER,
			state: 'not_eligible',
			reason: 'offsite_held',
			trouble: 'busy',
			deviceIdError: 'invalid'
		});
		expect([s?.reason, s?.trouble, s?.deviceIdError]).toEqual(['offsite_held', 'busy', 'invalid']);
	});

	it('is null for an answer without a state', () => {
		expect(readPairingStatus(null)).toBeNull();
		expect(readPairingStatus({ code: 'ABCDEF' })).toBeNull();
		expect(readPairingStatus('showing')).toBeNull();
	});
});

describe('groupCode', () => {
	it('groups six characters three and three', () => {
		expect(groupCode('ABCDEF')).toBe('ABC-DEF');
		expect(groupCode('abc-def')).toBe('ABC-DEF');
		expect(groupCode(' abc def ')).toBe('ABC-DEF');
	});

	it('leaves any other length as it is, in capitals', () => {
		expect(groupCode('ABCDE')).toBe('ABCDE');
	});
});

describe('pairingErrorCode', () => {
	it('reads detail.code, whatever the status', () => {
		expect(
			pairingErrorCode({ status: 409, detail: { code: 'offsite_held', message: 'English' } })
		).toBe('offsite_held');
		expect(
			pairingErrorCode({ status: 422, detail: { code: 'unit_name', message: 'English' } })
		).toBe('unit_name');
	});

	it('is null for any other body', () => {
		expect(
			pairingErrorCode({
				status: 409,
				detail: { message: 'x', problems: [{ code: 'rclone_missing' }] }
			})
		).toBeNull();
		expect(
			pairingErrorCode({ status: 422, detail: [{ loc: ['body', 'unitName'], msg: 'too long' }] })
		).toBeNull();
		expect(pairingErrorCode({ status: 500 })).toBeNull();
		expect(pairingErrorCode({ status: 409, detail: 'string' })).toBeNull();
		expect(pairingErrorCode(new Error('x'))).toBeNull();
		expect(pairingErrorCode(null)).toBeNull();
	});
});

describe('pairingPanel', () => {
	it.each([
		['idle', 'form'],
		['cancelled', 'form'],
		['ended', 'form'],
		['requesting', 'requesting'],
		['showing', 'code'],
		['applying', 'applying'],
		['restarting', 'restarting'],
		['restart_needed', 'restart_needed'],
		['lapsed', 'renew'],
		['lost_answer', 'renew'],
		['unknown', 'renew'],
		['cannot_pair', 'final'],
		['wrong_environment', 'final'],
		['other_workspace', 'final'],
		['bad_payload', 'final'],
		['not_eligible', 'final'],
		['apply_failed', 'final'],
		['apply_unverified', 'final'],
		['settings_overridden', 'final'],
		['script_missing', 'final'],
		['script_too_old', 'final'],
		['error', 'final'],
		['a_state_from_a_newer_backend', 'final']
	])('%s → %s', (state, panel) => {
		expect(pairingPanel(state)).toBe(panel);
	});
});

class FakeDocument extends EventTarget {
	visibilityState: 'visible' | 'hidden' = 'visible';
	hide() {
		this.visibilityState = 'hidden';
		this.dispatchEvent(new Event('visibilitychange'));
	}
	show() {
		this.visibilityState = 'visible';
		this.dispatchEvent(new Event('visibilitychange'));
	}
}

describe('pollPairing', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('polls every 2 s by default and the hidden limit is longer than the backend heartbeat', () => {
		expect(PAIRING_POLL_MS).toBe(2000);
		expect(PAIRING_HIDDEN_STOP_MS).toBeGreaterThan(30_000);
	});

	it('reads at once, then every interval after the last read ends', async () => {
		const read = vi.fn().mockResolvedValue(undefined);
		const doc = new FakeDocument();
		const stop = pollPairing({ read, intervalMs: 100, hiddenStopMs: 1000, doc });
		await vi.advanceTimersByTimeAsync(0);
		expect(read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(99);
		expect(read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(read).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(300);
		expect(read).toHaveBeenCalledTimes(5);
		stop();
	});

	it('keeps polling after a failed read', async () => {
		const read = vi.fn().mockRejectedValue(new Error('down'));
		const stop = pollPairing({
			read,
			intervalMs: 100,
			hiddenStopMs: 1000,
			doc: new FakeDocument()
		});
		await vi.advanceTimersByTimeAsync(250);
		expect(read).toHaveBeenCalledTimes(3);
		stop();
	});

	it('stops when stopped, and aborts the read in flight', async () => {
		let signal: AbortSignal | undefined;
		const read = vi.fn((s: AbortSignal) => {
			signal = s;
			return new Promise<void>(() => {});
		});
		const doc = new FakeDocument();
		const stop = pollPairing({ read, intervalMs: 100, hiddenStopMs: 1000, doc });
		await vi.advanceTimersByTimeAsync(0);
		stop();
		expect(signal?.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('gives up on a read that does not answer in time and polls again', async () => {
		const read = vi.fn(() => new Promise<void>(() => {}));
		const stop = pollPairing({
			read,
			intervalMs: 100,
			hiddenStopMs: 100_000,
			timeoutMs: 500,
			doc: new FakeDocument()
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(read).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(600);
		expect(read).toHaveBeenCalledTimes(2);
		stop();
	});

	it('keeps polling while the page is hidden briefly', async () => {
		const read = vi.fn().mockResolvedValue(undefined);
		const doc = new FakeDocument();
		const stop = pollPairing({ read, intervalMs: 100, hiddenStopMs: 1000, doc });
		await vi.advanceTimersByTimeAsync(0);
		doc.hide();
		await vi.advanceTimersByTimeAsync(500);
		expect(read).toHaveBeenCalledTimes(6);
		stop();
	});

	it('stops once the page has been hidden for long, and reads again when it is shown', async () => {
		const read = vi.fn().mockResolvedValue(undefined);
		const doc = new FakeDocument();
		const stop = pollPairing({ read, intervalMs: 100, hiddenStopMs: 1000, doc });
		await vi.advanceTimersByTimeAsync(0);
		doc.hide();
		await vi.advanceTimersByTimeAsync(1000);
		const atStop = read.mock.calls.length;
		await vi.advanceTimersByTimeAsync(5000);
		expect(read).toHaveBeenCalledTimes(atStop);
		doc.show();
		await vi.advanceTimersByTimeAsync(0);
		expect(read).toHaveBeenCalledTimes(atStop + 1);
		await vi.advanceTimersByTimeAsync(100);
		expect(read).toHaveBeenCalledTimes(atStop + 2);
		stop();
	});

	it('removes its listener when stopped', async () => {
		const read = vi.fn().mockResolvedValue(undefined);
		const doc = new FakeDocument();
		const remove = vi.spyOn(doc, 'removeEventListener');
		const stop = pollPairing({ read, intervalMs: 100, hiddenStopMs: 1000, doc });
		stop();
		expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
	});
});

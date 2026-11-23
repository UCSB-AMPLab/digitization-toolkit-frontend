// The capture that may have been saved (NEH-381, NEH-401): what counts as a
// timeout, the id each capture carries, and the check that asks the backend
// every 5 s for the capture saved under that id, until it is stored, or the
// backend no longer knows the id, or the check gives up: 180 s of failed
// asks, or 15 minutes while the backend says the capture is still running.
//
// Version: 0.3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CHECK_INTERVAL_MS,
	CHECK_WINDOW_MS,
	IN_PROGRESS_LIMIT_MS,
	STILL_WORKING_AFTER_MS,
	checkCaptureRequest,
	createCaptureGate,
	createKnownRecords,
	isCaptureAbandoned,
	isCaptureIdRefusal,
	isCaptureInProgress,
	newClientCaptureId,
	runPageCapture,
	isCaptureTimeout,
	whenSlow,
	createReconciler,
	RECONCILE_INTERVAL_MS,
	RECONCILE_LIMIT_MS,
	RECONCILE_MAX,
	type RecordLike
} from './capture-check';
import { CaptureNotSaved, CaptureOutcomeUnknown } from './capture-errors';

// A stand-in for api.ts's ApiError, as in capture-errors.test.ts.
class ApiError extends Error {
	status?: number;
	detail?: unknown;
	constructor(message: string, status?: number, detail?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.detail = detail;
	}
}

function rec(id: number, imageIds: number[]): RecordLike {
	return { id, images: imageIds.map((i) => ({ id: i })) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A version 4 UUID, variant 10xx.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Every duration the check measures is read from the monotonic clock, which
// the tests fake with the timers; the wall clock (Date) is faked apart, so a
// test can step it alone.
const FAKED = ['setTimeout', 'clearTimeout', 'Date', 'performance'] as const;

// The answers of GET /cameras/capture-requests/{id} (app/api/cameras.py).
const stored = (recordId: number, imageIds: number[]) => ({
	success: true,
	record_id: recordId,
	image_ids: imageIds,
	file_path: '/x.jpg',
	timing: null,
	error: null,
	replayed: true,
	in_progress: false
});
const running = { in_progress: true };
const notFound = () =>
	new ApiError('Not found.', 404, { code: 'not_found', message: 'Not found.' });
// FastAPI's 404 for a route it does not have: a string detail, which api.ts does not keep.
const noRoute = () => new ApiError('Not Found', 404);
// A stored capture with an image deleted since: 410, which the answer will not change.
const gone = () =>
	new ApiError('An image of the capture saved with this id has been deleted.', 410, {
		code: 'capture_no_longer_stored',
		message: 'An image of the capture saved with this id has been deleted.'
	});
const inProgress = () =>
	new ApiError('A capture with this id is still running.', 409, {
		code: 'capture_in_progress',
		message: 'A capture with this id is still running.'
	});

describe('isCaptureTimeout', () => {
	it("is true for the proxy's 504 and for the request layer's TimeoutError", () => {
		expect(isCaptureTimeout(new ApiError('Gateway Time-out', 504))).toBe(true);
		expect(isCaptureTimeout(new DOMException('La solicitud falló', 'TimeoutError'))).toBe(true);
	});

	it('is false for every other failure', () => {
		for (const error of [
			new ApiError('Internal Server Error', 500),
			new ApiError('Bad Gateway', 502),
			new ApiError('conflict', 409),
			new ApiError('not found', 404),
			new TypeError('Failed to fetch'),
			new DOMException('aborted', 'AbortError'),
			new Error('Capture failed'),
			null,
			undefined,
			'504'
		]) {
			expect(isCaptureTimeout(error)).toBe(false);
		}
	});
});

describe('newClientCaptureId: a fresh id for each capture (NEH-401)', () => {
	it('a canonical UUID in lower case, a new one each call', () => {
		const a = newClientCaptureId();
		const b = newClientCaptureId();
		expect(a).toMatch(UUID);
		expect(b).toMatch(UUID);
		expect(a).not.toBe(b);
	});

	it('lower case even when randomUUID answers in upper case', () => {
		const id = newClientCaptureId({
			randomUUID: () =>
				'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE' as `${string}-${string}-${string}-${string}-${string}`
		});
		expect(id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
	});

	it('without randomUUID (a page served over plain http), from getRandomValues only', () => {
		const random = vi.spyOn(Math, 'random');
		for (const fill of [0x00, 0xff, 0x5a]) {
			const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(array: T) => {
				const bytes = array as unknown as Uint8Array;
				for (let i = 0; i < bytes.length; i++) bytes[i] = fill;
				return array;
			});
			const id = newClientCaptureId({ getRandomValues } as unknown as Crypto);
			expect(getRandomValues).toHaveBeenCalledTimes(1);
			expect(id).toMatch(UUID_V4);
		}
		expect(random).not.toHaveBeenCalled();
		const all = vi.fn(<T extends ArrayBufferView | null>(array: T) => {
			(array as unknown as Uint8Array).fill(0xff);
			return array;
		});
		expect(newClientCaptureId({ getRandomValues: all } as unknown as Crypto)).toBe(
			'ffffffff-ffff-4fff-bfff-ffffffffffff'
		);
	});

	it('with no crypto at all (null, which does not fall back to the global), from Math.random', () => {
		const globalUUID = vi.spyOn(globalThis.crypto, 'randomUUID');
		const globalValues = vi.spyOn(globalThis.crypto, 'getRandomValues');
		const random = vi.spyOn(Math, 'random');
		const a = newClientCaptureId(null);
		expect(random).toHaveBeenCalledTimes(16);
		const b = newClientCaptureId(null);
		expect(random).toHaveBeenCalledTimes(32);
		expect(globalUUID).not.toHaveBeenCalled();
		expect(globalValues).not.toHaveBeenCalled();
		expect(a).toMatch(UUID_V4);
		expect(b).toMatch(UUID_V4);
		expect(a).not.toBe(b);
		random.mockReturnValue(0.999);
		expect(newClientCaptureId(null)).toMatch(UUID_V4);
		random.mockReturnValue(0);
		expect(newClientCaptureId(null)).toMatch(UUID_V4);
	});
});

describe("the backend's refusals of a capture id (NEH-401)", () => {
	it('capture_in_progress: the id is still running', () => {
		expect(isCaptureInProgress(inProgress())).toBe(true);
		expect(isCaptureInProgress(new ApiError('x', 409, { code: 'record_changed' }))).toBe(false);
		expect(isCaptureInProgress(new ApiError('x', 409))).toBe(false);
		expect(isCaptureIdRefusal(inProgress())).toBe(false);
	});

	it('capture_abandoned: the id was closed by a lookup that found nothing', () => {
		const abandoned = new ApiError('x', 409, { code: 'capture_abandoned', message: 'x' });
		expect(isCaptureAbandoned(abandoned)).toBe(true);
		expect(isCaptureIdRefusal(abandoned)).toBe(true);
		expect(isCaptureInProgress(abandoned)).toBe(false);
		expect(isCaptureAbandoned(inProgress())).toBe(false);
		expect(isCaptureAbandoned(new ApiError('x', 404, { code: 'capture_abandoned' }))).toBe(false);
	});

	it('client_capture_id_in_use and capture_no_longer_stored', () => {
		for (const code of ['client_capture_id_in_use', 'capture_no_longer_stored']) {
			expect(isCaptureAbandoned(new ApiError('x', 409, { code }))).toBe(false);
			expect(isCaptureIdRefusal(new ApiError('x', 409, { code }))).toBe(true);
			expect(isCaptureInProgress(new ApiError('x', 409, { code }))).toBe(false);
		}
		expect(isCaptureIdRefusal(new ApiError('x', 409, { code: 'record_changed' }))).toBe(false);
	});
});

describe('whenSlow', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: [...FAKED] });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('calls back once the request has run 10 s, and not if cancelled first', () => {
		const slow = vi.fn();
		whenSlow(slow);
		vi.advanceTimersByTime(STILL_WORKING_AFTER_MS - 1);
		expect(slow).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(slow).toHaveBeenCalledTimes(1);

		const cancelled = vi.fn();
		const cancel = whenSlow(cancelled);
		vi.advanceTimersByTime(STILL_WORKING_AFTER_MS - 1);
		cancel();
		vi.advanceTimersByTime(10_000);
		expect(cancelled).not.toHaveBeenCalled();
	});
});

describe('checkCaptureRequest: asks the backend for the capture saved under its id (NEH-401)', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: [...FAKED] });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
	// Each ask answers the next of `answers` (an Error rejects), the last one again once they run out.
	function asker(answers: unknown[]) {
		const entered = Date.now();
		const at: number[] = [];
		const lookup = vi.fn(async (id: string) => {
			expect(id).toBe(ID);
			at.push(Date.now() - entered);
			const next = answers.length > 1 ? answers.shift() : answers[0];
			if (next instanceof Error) throw next;
			return next;
		});
		return { lookup, at };
	}
	function start(lookup: (id: string) => Promise<unknown>, signal = new AbortController().signal) {
		let settled: unknown = null;
		const outcome = checkCaptureRequest({ id: ID, lookup, signal });
		void outcome.then((o) => (settled = o));
		return { outcome, settled: () => settled };
	}

	it('the cadence and the bounds', () => {
		expect(CHECK_INTERVAL_MS).toBe(5_000);
		expect(CHECK_WINDOW_MS).toBe(180_000);
		expect(IN_PROGRESS_LIMIT_MS).toBe(900_000);
	});

	it('asks every 5 s, the first 5 s after the start, and ends with the stored answer', async () => {
		const { lookup, at } = asker([running, stored(2, [20])]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
		expect(c.settled()).toEqual({ kind: 'stored', answer: stored(2, [20]) });
		expect(at).toEqual([5_000, 10_000]);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('the backend no longer knows the id (404 not_found): not saved, at once', async () => {
		const { lookup } = asker([notFound()]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'not-saved' });
		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it('in progress: goes on past 180 s, and a capture stored at 400 s is found', async () => {
		const { lookup } = asker([running]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(395_000);
		expect(c.settled()).toBeNull();
		lookup.mockResolvedValueOnce(stored(3, [30]));
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'stored', answer: stored(3, [30]) });
		expect(lookup).toHaveBeenCalledTimes(80);
	});

	it('in progress for 15 minutes: unknown, never not saved', async () => {
		const { lookup } = asker([running]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(IN_PROGRESS_LIMIT_MS - 1);
		expect(c.settled()).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(c.settled()).toEqual({ kind: 'unknown', retry: true });
		expect(lookup).toHaveBeenCalledTimes(IN_PROGRESS_LIMIT_MS / CHECK_INTERVAL_MS);
	});

	it('failed asks (a 500, the network) go on; at 180 s the outcome is unknown, never not saved', async () => {
		const { lookup } = asker([
			new ApiError('Internal Server Error', 500),
			new TypeError('Failed to fetch')
		]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS - 1);
		expect(c.settled()).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(c.settled()).toEqual({ kind: 'unknown', retry: true });
		expect(lookup).toHaveBeenCalledTimes(CHECK_WINDOW_MS / CHECK_INTERVAL_MS);
	});

	it('a failed ask decides nothing: a later answer does', async () => {
		const { lookup } = asker([new TypeError('Failed to fetch'), notFound()]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toBeNull();
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'not-saved' });
	});

	it('failed asks after an answer of in progress go on past 180 s', async () => {
		const { lookup } = asker([running, new TypeError('Failed to fetch')]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS + 60_000);
		expect(c.settled()).toBeNull();
		lookup.mockResolvedValueOnce(stored(4, [40]));
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'stored', answer: stored(4, [40]) });
	});

	it('an answer that is neither stored nor in progress counts as a failed ask', async () => {
		const { lookup } = asker([{ in_progress: false, success: false }, stored(5, [50])]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toBeNull();
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'stored', answer: stored(5, [50]) });
	});

	it('a backend without the lookup route (a 404 with no not_found code): unknown at once, never not saved', async () => {
		const { lookup } = asker([noRoute()]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'unknown', retry: false });
		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it('a stored capture with an image deleted since (410 capture_no_longer_stored): unknown, never not saved, and no point asking again', async () => {
		const { lookup } = asker([gone()]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'unknown', retry: false });
		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it('the wall clock stepped 15 minutes forward during in progress: the check goes on', async () => {
		const { lookup } = asker([running]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
		vi.setSystemTime(Date.now() + IN_PROGRESS_LIMIT_MS);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
		expect(c.settled()).toBeNull();
		lookup.mockResolvedValueOnce(stored(6, [60]));
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toEqual({ kind: 'stored', answer: stored(6, [60]) });
	});

	it('the wall clock stepped backward during in progress: the 15-minute limit still ends it on time', async () => {
		const { lookup } = asker([running]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
		vi.setSystemTime(Date.now() - IN_PROGRESS_LIMIT_MS);
		await vi.advanceTimersByTimeAsync(IN_PROGRESS_LIMIT_MS - CHECK_INTERVAL_MS * 2 - 1);
		expect(c.settled()).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(c.settled()).toEqual({ kind: 'unknown', retry: true });
	});

	it('the wall clock stepped forward during failed asks: the 180 s window is not cut short', async () => {
		const { lookup } = asker([new TypeError('Failed to fetch')]);
		const c = start(lookup);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		vi.setSystemTime(Date.now() + CHECK_WINDOW_MS);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(c.settled()).toBeNull();
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS - CHECK_INTERVAL_MS * 2);
		expect(c.settled()).toEqual({ kind: 'unknown', retry: true });
	});

	it('stops when its signal aborts, and leaves no timer behind', async () => {
		const { lookup } = asker([running]);
		const controller = new AbortController();
		const c = start(lookup, controller.signal);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(lookup).toHaveBeenCalledTimes(1);
		controller.abort();
		await expect(c.outcome).resolves.toEqual({ kind: 'stopped' });
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS);
		expect(lookup).toHaveBeenCalledTimes(1);
	});
});

describe('createReconciler: keeps asking for an unknown capture in the background (NEH-401)', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: [...FAKED] });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	// Each ask takes the next of `answers` (an Error rejects), the last one again once they run out.
	function lookupFor(answers: unknown[]) {
		return vi.fn(async (_id: string) => {
			const next = answers.length > 1 ? answers.shift() : answers[0];
			if (next instanceof Error) throw next;
			return next;
		});
	}
	const A = '0f8fad5b-d9cb-469f-a165-70867728950e';
	const B = '1f8fad5b-d9cb-469f-a165-70867728950e';
	const C = '2f8fad5b-d9cb-469f-a165-70867728950e';
	const D = '3f8fad5b-d9cb-469f-a165-70867728950e';

	it('the cadence, the bound and the cap', () => {
		expect(RECONCILE_INTERVAL_MS).toBe(15_000);
		expect(RECONCILE_LIMIT_MS).toBe(900_000);
		expect(RECONCILE_MAX).toBe(3);
	});

	it('asks for the id every 15 s; stored, it hands over the answer once and stops, with no timer left', async () => {
		const r = createReconciler();
		const lookup = lookupFor([new TypeError('Failed to fetch'), running, stored(8, [80])]);
		const onStored = vi.fn();
		r.start({ id: A, lookup, onStored });
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS - 1);
		expect(lookup).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(lookup).toHaveBeenCalledTimes(1);
		expect(lookup).toHaveBeenLastCalledWith(A);
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS * 2);
		expect(onStored).toHaveBeenCalledTimes(1);
		expect(onStored).toHaveBeenCalledWith(stored(8, [80]));
		expect(r.running()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS * 4);
		expect(lookup).toHaveBeenCalledTimes(3);
	});

	for (const [name, answer] of [
		['404 not_found', notFound],
		['410 capture_no_longer_stored', gone],
		['a 404 with no code (no such route)', noRoute]
	] as const) {
		it(`${name}: stops silently`, async () => {
			const r = createReconciler();
			const lookup = lookupFor([answer()]);
			const onStored = vi.fn();
			r.start({ id: A, lookup, onStored });
			await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
			expect(lookup).toHaveBeenCalledTimes(1);
			expect(r.running()).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
			expect(onStored).not.toHaveBeenCalled();
		});
	}

	it('gives up after 15 minutes on the monotonic clock, whatever the wall clock does', async () => {
		const r = createReconciler();
		const lookup = lookupFor([running]);
		r.start({ id: A, lookup, onStored: vi.fn() });
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		vi.setSystemTime(Date.now() + RECONCILE_LIMIT_MS);
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		expect(r.running()).toBe(1);
		vi.setSystemTime(Date.now() - 2 * RECONCILE_LIMIT_MS);
		await vi.advanceTimersByTimeAsync(RECONCILE_LIMIT_MS - RECONCILE_INTERVAL_MS * 2);
		expect(lookup).toHaveBeenCalledTimes(RECONCILE_LIMIT_MS / RECONCILE_INTERVAL_MS);
		expect(r.running()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('one per id; at most three, the oldest dropped for a fourth', async () => {
		const r = createReconciler();
		const lookups = [A, B, C, D].map(() => lookupFor([running]));
		r.start({ id: A, lookup: lookups[0], onStored: vi.fn() });
		r.start({ id: A, lookup: lookups[0], onStored: vi.fn() });
		expect(r.running()).toBe(1);
		r.start({ id: B, lookup: lookups[1], onStored: vi.fn() });
		r.start({ id: C, lookup: lookups[2], onStored: vi.fn() });
		r.start({ id: D, lookup: lookups[3], onStored: vi.fn() });
		expect(r.running()).toBe(3);
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		expect(lookups.map((l) => l.mock.calls.length)).toEqual([0, 1, 1, 1]);
	});

	it('the stop it returns ends that one; stopAll ends every one, with no timer left', async () => {
		const r = createReconciler();
		const a = lookupFor([running]);
		const b = lookupFor([running]);
		const stopA = r.start({ id: A, lookup: a, onStored: vi.fn() });
		r.start({ id: B, lookup: b, onStored: vi.fn() });
		stopA();
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		expect(a).not.toHaveBeenCalled();
		expect(b).toHaveBeenCalledTimes(1);
		r.stopAll();
		expect(r.running()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS * 4);
		expect(b).toHaveBeenCalledTimes(1);
	});

	it('logs the first failed ask, then stays quiet until an answer changes the state', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = createReconciler();
		const down = () => new TypeError('Failed to fetch');
		const lookup = lookupFor([down(), down(), down(), running, down(), down(), stored(1, [10])]);
		r.start({ id: A, lookup, onStored: vi.fn() });
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS * 3);
		const ours = () => logged.mock.calls.filter((c) => String(c[0]).startsWith('[capture-check]'));
		expect(lookup).toHaveBeenCalledTimes(3);
		expect(ours()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS * 4);
		expect(lookup).toHaveBeenCalledTimes(7);
		expect(ours()).toHaveLength(2);
	});

	it('an ask in flight when the job is stopped hands nothing over', async () => {
		const r = createReconciler();
		let answer!: (v: unknown) => void;
		const lookup = vi.fn(() => new Promise((res) => (answer = res)));
		const onStored = vi.fn();
		const stop = r.start({ id: A, lookup, onStored });
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		stop();
		answer(stored(9, [90]));
		await vi.advanceTimersByTimeAsync(0);
		expect(onStored).not.toHaveBeenCalled();
	});
});

describe('createKnownRecords: the records the screen knows the volume holds', () => {
	it('a record listed or confirmed by a capture answer is known; reset forgets them', () => {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		known.confirmed(2);
		expect(known.hasRecord(1)).toBe(true);
		expect(known.hasRecord(2)).toBe(true);
		expect(known.hasRecord(3)).toBe(false);
		known.reset();
		expect(known.hasRecord(1)).toBe(false);
		expect(known.hasRecord(2)).toBe(false);
	});
});

describe('createCaptureGate: one gate for starting a capture', () => {
	it('lets one holder in at a time, and reports when it is busy', () => {
		const changes: boolean[] = [];
		const gate = createCaptureGate((busy) => changes.push(busy));
		const release = gate.acquire();
		expect(release).not.toBeNull();
		expect(gate.isBusy()).toBe(true);
		expect(gate.acquire()).toBeNull();
		release!();
		expect(gate.isBusy()).toBe(false);
		// A second release of the same hold does nothing.
		const next = gate.acquire();
		release!();
		expect(gate.isBusy()).toBe(true);
		next!();
		expect(changes).toEqual([true, false, true, false]);
	});
});

describe('the gate and what the screen knows (NEH-381)', () => {
	it('a capture cannot be started before a successful read of the volume; an empty volume is ready after its empty read', () => {
		const known = createKnownRecords();
		const gate = createCaptureGate(undefined, () => known.ready);
		expect(known.ready).toBe(false);
		expect(gate.acquire()).toBeNull();
		// A test capture saves nothing, and needs no baseline.
		const test = gate.acquire('test');
		expect(test).not.toBeNull();
		test!();
		known.listed([]);
		expect(known.ready).toBe(true);
		const release = gate.acquire();
		expect(release).not.toBeNull();
		release!();
		known.reset();
		expect(known.ready).toBe(false);
		expect(gate.acquire()).toBeNull();
	});

	it('knows whether a record is among the known records', () => {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		known.confirmed(2);
		expect(known.hasRecord(1)).toBe(true);
		expect(known.hasRecord(2)).toBe(true);
		expect(known.hasRecord(3)).toBe(false);
	});
});

describe("runPageCapture: the page's capture refuses on its own (NEH-381)", () => {
	function deps(over: Partial<Parameters<typeof runPageCapture>[0]> = {}) {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		const gate = createCaptureGate(undefined, () => known.ready);
		const send = vi.fn(async () => ({ success: true, record_id: 1, image_ids: [11] }));
		return {
			known,
			gate,
			send,
			opts: {
				gate,
				known,
				target: 1,
				names: [1],
				current: () => true,
				send,
				lookup: async () => ({ in_progress: true }),
				notice: vi.fn(),
				onCapturing: vi.fn(),
				onCheck: vi.fn(),
				attempt: 'retake' as const,
				single: false,
				...over
			}
		};
	}

	it('sends nothing, and resolves null, while the gate is held', async () => {
		const d = deps();
		const hold = d.gate.acquire()!;
		await expect(runPageCapture(d.opts)).resolves.toBeNull();
		expect(d.send).not.toHaveBeenCalled();
		hold();
	});

	it('sends nothing when it names a record the volume does not know', async () => {
		const d = deps();
		await expect(runPageCapture({ ...d.opts, names: [99] })).resolves.toBeNull();
		expect(d.send).not.toHaveBeenCalled();
		expect(d.gate.isBusy()).toBe(false);
	});

	it('sends nothing before the volume has been read', async () => {
		const d = deps();
		d.known.reset();
		await expect(runPageCapture({ ...d.opts, names: [] })).resolves.toBeNull();
		expect(d.send).not.toHaveBeenCalled();
	});

	it('with the gate free, sends once, holds the gate meanwhile, and adds the answer to what is known', async () => {
		const d = deps();
		const outcome = runPageCapture({
			...d.opts,
			send: vi.fn(async () => {
				expect(d.gate.isBusy()).toBe(true);
				return { success: true, record_id: 1, image_ids: [11] };
			})
		});
		await expect(outcome).resolves.toEqual({
			result: { success: true, record_id: 1, image_ids: [11] }
		});
		expect(d.gate.isBusy()).toBe(false);
	});
});

describe('the gate counts the captures started (NEH-388)', () => {
	it('each capture it lets in takes the next number; a test capture or a refusal takes none', () => {
		const gate = createCaptureGate();
		expect(gate.serial()).toBe(0);
		const first = gate.acquire()!;
		expect(gate.serial()).toBe(1);
		expect(gate.acquire()).toBeNull();
		expect(gate.serial()).toBe(1);
		first();
		gate.acquire('test')!();
		expect(gate.serial()).toBe(1);
		gate.acquire()!();
		expect(gate.serial()).toBe(2);
	});
});

describe('runPageCapture: a check before sending, inside the gate (NEH-388)', () => {
	function opts(over: Partial<Parameters<typeof runPageCapture>[0]> = {}) {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		const gate = createCaptureGate(undefined, () => known.ready);
		const send = vi.fn(async () => ({ success: true, record_id: 1, image_ids: [11] }));
		return {
			gate,
			send,
			o: {
				gate,
				known,
				target: 1,
				names: [1],
				current: () => true,
				send,
				lookup: async () => ({ in_progress: true }),
				notice: vi.fn(),
				onCapturing: vi.fn(),
				onCheck: vi.fn(),
				attempt: 'retake' as const,
				single: false,
				...over
			}
		};
	}

	it('runs with the gate held, and then sends', async () => {
		const d = opts();
		const seen: boolean[] = [];
		await runPageCapture({ ...d.o, precheck: async () => void seen.push(d.gate.isBusy()) });
		expect(seen).toEqual([true]);
		expect(d.send).toHaveBeenCalledTimes(1);
	});

	it('a check that throws sends nothing, releases the gate and passes the error on', async () => {
		const d = opts();
		const refused = new Error('changed');
		await expect(
			runPageCapture({
				...d.o,
				precheck: async () => {
					throw refused;
				}
			})
		).rejects.toBe(refused);
		expect(d.send).not.toHaveBeenCalled();
		expect(d.gate.isBusy()).toBe(false);
	});

	it('the screen gone during the check: nothing is sent', async () => {
		const d = opts();
		let here = true;
		await expect(
			runPageCapture({
				...d.o,
				current: () => here,
				precheck: async () => {
					here = false;
				}
			})
		).resolves.toBeNull();
		expect(d.send).not.toHaveBeenCalled();
		expect(d.gate.isBusy()).toBe(false);
	});
});

describe('runPageCapture: the id, and the check after a timeout (NEH-401)', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: [...FAKED] });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function deps() {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		const gate = createCaptureGate(undefined, () => known.ready);
		const sent: string[] = [];
		const asked: string[] = [];
		const answers: unknown[] = [];
		const notices: unknown[] = [];
		const rereadWhileHeld: boolean[] = [];
		let sendAnswer: () => Promise<{
			success: boolean;
			record_id?: number;
			image_ids?: number[];
		}> = async () => ({ success: true, record_id: 1, image_ids: [11] });
		const opts = {
			gate,
			known,
			target: null,
			names: [1],
			current: () => true,
			send: vi.fn(async (id: string) => {
				sent.push(id);
				return sendAnswer();
			}),
			lookup: vi.fn(async (id: string) => {
				asked.push(id);
				const next = answers.length > 1 ? answers.shift() : answers[0];
				if (next instanceof Error) throw next;
				return next;
			}),
			notice: vi.fn((v: unknown) => void notices.push(v)),
			onCapturing: vi.fn(),
			onCheck: vi.fn(),
			attempt: 'another' as const,
			single: false,
			reread: vi.fn(async () => {
				rereadWhileHeld.push(gate.isBusy());
				return true;
			}),
			reconciler: createReconciler(),
			onReconciled: vi.fn()
		};
		return {
			known,
			gate,
			sent,
			asked,
			answers,
			notices,
			opts,
			rereadWhileHeld,
			failWith: (error: unknown) => {
				sendAnswer = async () => {
					throw error;
				};
			}
		};
	}

	it('each attempt sends a fresh id with its request', async () => {
		const d = deps();
		await runPageCapture(d.opts);
		await runPageCapture(d.opts);
		expect(d.sent).toHaveLength(2);
		expect(d.sent[0]).toMatch(UUID);
		expect(d.sent[1]).toMatch(UUID);
		expect(d.sent[0]).not.toBe(d.sent[1]);
		expect(d.opts.lookup).not.toHaveBeenCalled();
	});

	for (const [name, error] of [
		["nginx's 504", () => new ApiError('HTTP 504', 504)],
		["the request layer's TimeoutError", () => new DOMException('x', 'TimeoutError')],
		['a 409 capture_in_progress (the request sent twice)', inProgress]
	] as const) {
		it(`${name}: asks for the same id, holds the gate while it runs, and resolves the stored answer as the request's`, async () => {
			const d = deps();
			d.failWith(error());
			d.answers.push(running, running, stored(7, [70, 71]));
			let settled: unknown = null;
			void runPageCapture(d.opts).then((o) => (settled = o));
			await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
			expect(settled).toBeNull();
			expect(d.gate.isBusy()).toBe(true);
			expect(d.gate.acquire()).toBeNull();
			expect(d.notices.at(-1)).toBe('maybe_saved');
			await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
			expect(settled).toEqual({ result: stored(7, [70, 71]) });
			expect(d.asked).toEqual([d.sent[0], d.sent[0], d.sent[0]]);
			expect(d.sent).toHaveLength(1);
			expect(d.known.hasRecord(7)).toBe(true);
			expect(d.notices.at(-1)).toBe('found');
			expect(d.gate.isBusy()).toBe(false);
		});
	}

	it('the backend no longer knows the id: CaptureNotSaved, and the gate free', async () => {
		const d = deps();
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(notFound());
		const outcome = runPageCapture(d.opts);
		const caught = outcome.catch((e) => e);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(await caught).toBeInstanceOf(CaptureNotSaved);
		expect(d.gate.isBusy()).toBe(false);
	});

	it('unknown: the records are read again with the gate held, then the gate is free; the error names the attempt', async () => {
		const d = deps();
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(new TypeError('Failed to fetch'));
		const caught = runPageCapture(d.opts).catch((e) => e);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS);
		const error = await caught;
		expect(error).toBeInstanceOf(CaptureOutcomeUnknown);
		expect(error).toMatchObject({ attempt: 'another', single: false });
		expect(d.opts.reread).toHaveBeenCalledTimes(1);
		expect(d.rereadWhileHeld).toEqual([true]);
		expect(d.gate.isBusy()).toBe(false);
	});

	it('unknown, then stored in the background: handed over with mayReport true, the record known, the gate never held', async () => {
		const d = deps();
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(new TypeError('Failed to fetch'));
		const caught = runPageCapture(d.opts).catch((e) => e);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS);
		await caught;
		const asks = d.asked.length;
		d.answers.splice(0, d.answers.length, running);
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		expect(d.asked.length).toBe(asks + 1);
		expect(d.gate.isBusy()).toBe(false);
		d.answers.splice(0, d.answers.length, stored(12, [120, 121]));
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		expect(new Set(d.asked)).toEqual(new Set([d.sent[0]]));
		expect(d.opts.onReconciled).toHaveBeenCalledTimes(1);
		const [answer, may] = d.opts.onReconciled.mock.calls[0] as unknown as [unknown, () => boolean];
		expect(answer).toEqual(stored(12, [120, 121]));
		expect(may()).toBe(true);
		expect(d.known.hasRecord(12)).toBe(true);
	});

	it('a newer capture started before the background answer: mayReport is false', async () => {
		const d = deps();
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(new TypeError('Failed to fetch'));
		const caught = runPageCapture(d.opts).catch((e) => e);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS);
		await caught;
		const newer = d.gate.acquire()!;
		d.answers.splice(0, d.answers.length, stored(12, [120, 121]));
		await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS);
		const [, may] = d.opts.onReconciled.mock.calls[0] as unknown as [unknown, () => boolean];
		expect(may()).toBe(false);
		newer();
	});

	it('410 capture_no_longer_stored: the records read again, unknown, and nothing asked in the background', async () => {
		const d = deps();
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(gone());
		const caught = runPageCapture(d.opts).catch((e) => e);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(await caught).toBeInstanceOf(CaptureOutcomeUnknown);
		expect(d.opts.reread).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(RECONCILE_LIMIT_MS);
		expect(d.asked).toHaveLength(1);
		expect(d.opts.reconciler.running()).toBe(0);
	});

	it('the screen gone during the re-read: nothing thrown, nothing asked in the background', async () => {
		const d = deps();
		let here = true;
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(noRoute());
		d.opts.reread = vi.fn(async () => {
			here = false;
			return true;
		});
		const outcome = runPageCapture({ ...d.opts, current: () => here });
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		await expect(outcome).resolves.toBeNull();
		expect(d.opts.reconciler.running()).toBe(0);
	});

	it('no answer it can read for 180 s: CaptureOutcomeUnknown, never CaptureNotSaved', async () => {
		const d = deps();
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(new TypeError('Failed to fetch'));
		const caught = runPageCapture(d.opts).catch((e) => e);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS);
		expect(await caught).toBeInstanceOf(CaptureOutcomeUnknown);
		expect(d.gate.isBusy()).toBe(false);
	});

	it('a backend without the lookup route: CaptureOutcomeUnknown at the first ask', async () => {
		const d = deps();
		d.failWith(new ApiError('HTTP 504', 504));
		d.answers.push(noRoute());
		const caught = runPageCapture(d.opts).catch((e) => e);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(await caught).toBeInstanceOf(CaptureOutcomeUnknown);
	});

	it('a 409 capture_abandoned on the request: CaptureNotSaved for this attempt, no ask, the gate free, and the next attempt a new id', async () => {
		const d = deps();
		d.failWith(new ApiError('x', 409, { code: 'capture_abandoned', message: 'x' }));
		await expect(runPageCapture(d.opts)).rejects.toBeInstanceOf(CaptureNotSaved);
		expect(d.opts.lookup).not.toHaveBeenCalled();
		expect(d.sent).toHaveLength(1);
		expect(d.gate.isBusy()).toBe(false);
		d.failWith(new ApiError('x', 500));
		await expect(runPageCapture(d.opts)).rejects.toBeInstanceOf(ApiError);
		expect(d.sent).toHaveLength(2);
		expect(d.sent[1]).not.toBe(d.sent[0]);
	});

	it('a 409 capture_abandoned that arrives once the screen has left the volume: nothing is thrown or shown', async () => {
		const d = deps();
		let here = true;
		d.failWith(new ApiError('x', 409, { code: 'capture_abandoned', message: 'x' }));
		const sendFailing = d.opts.send;
		d.opts.send = vi.fn(async (id: string) => {
			here = false;
			return sendFailing(id);
		});
		await expect(runPageCapture({ ...d.opts, current: () => here })).resolves.toBeNull();
		expect(d.notices.filter((n) => n !== null)).toEqual([]);
		expect(d.gate.isBusy()).toBe(false);
	});

	it('client_capture_id_in_use and capture_no_longer_stored are thrown on as ordinary failures, with no check', async () => {
		for (const code of ['client_capture_id_in_use', 'capture_no_longer_stored']) {
			const d = deps();
			const refusal = new ApiError('x', 409, { code });
			d.failWith(refusal);
			await expect(runPageCapture(d.opts)).rejects.toBe(refusal);
			expect(d.opts.lookup).not.toHaveBeenCalled();
			expect(d.gate.isBusy()).toBe(false);
		}
	});
});

// The capture that may have been saved (NEH-381): what counts as a timeout,
// what counts as the capture having appeared in the volume's records, and
// the check that reads the records again every 5 s until the capture
// appears, or until a read that succeeded at or after 180 s from the start
// of the check has not found it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CHECK_INTERVAL_MS,
	CHECK_WINDOW_MS,
	STILL_WORKING_AFTER_MS,
	appearedRecord,
	captureBefore,
	checkForCapture,
	createCaptureGate,
	createKnownRecords,
	runPageCapture,
	isCaptureTimeout,
	whenSlow,
	type RecordLike
} from './capture-check';

// A stand-in for api.ts's ApiError, as in capture-errors.test.ts.
class ApiError extends Error {
	status?: number;
	constructor(message: string, status?: number) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

function rec(id: number, imageIds: number[]): RecordLike {
	return { id, images: imageIds.map((i) => ({ id: i })) };
}

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

describe('appearedRecord', () => {
	const before = [rec(1, [10]), rec(2, [20, 21])];

	it('a new capture (viewport, single or dual, or "capture another here"): a record not there before, with images', () => {
		const snapshot = captureBefore(before);
		expect(appearedRecord(snapshot, before)).toBeNull();
		expect(appearedRecord(snapshot, [...before, rec(3, [30])])).toEqual(rec(3, [30]));
		expect(appearedRecord(snapshot, [...before, rec(3, [30, 31])])).toEqual(rec(3, [30, 31]));
		// Inserted before others (afterRecordId): its place in the list does not matter.
		expect(appearedRecord(snapshot, [before[0], rec(3, [30, 31]), before[1]])).toEqual(
			rec(3, [30, 31])
		);
	});

	it('a new record without images is not a capture (a placeholder for a missing opening)', () => {
		expect(appearedRecord(captureBefore(before), [...before, rec(3, [])])).toBeNull();
		expect(appearedRecord(captureBefore(before), [...before, { id: 3 }])).toBeNull();
	});

	it('a retake: the record holds an image id it did not hold before', () => {
		const snapshot = captureBefore(before, 2);
		expect(appearedRecord(snapshot, before)).toBeNull();
		// The current images were superseded by the retake's.
		expect(appearedRecord(snapshot, [before[0], rec(2, [22, 23])])).toEqual(rec(2, [22, 23]));
		// A new record elsewhere is not this retake.
		expect(appearedRecord(snapshot, [...before, rec(3, [30])])).toBeNull();
		// The record gone from the list: nothing appeared.
		expect(appearedRecord(snapshot, [before[0]])).toBeNull();
	});

	it('a placeholder filled by a dual capture: the record had no images and now has some', () => {
		const withHole = [...before, rec(3, [])];
		const snapshot = captureBefore(withHole, 3);
		expect(appearedRecord(snapshot, withHole)).toBeNull();
		expect(appearedRecord(snapshot, [...before, rec(3, [30, 31])])).toEqual(rec(3, [30, 31]));
	});
});

describe('whenSlow', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
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

describe('checkForCapture', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	const before = [rec(1, [10])];
	const start = (
		read: () => Promise<readonly RecordLike[] | null>,
		signal = new AbortController().signal
	) => checkForCapture({ before: captureBefore(before), read, signal });

	it('the window is 180 s from the start of the check, read every 5 s', () => {
		expect(CHECK_WINDOW_MS).toBe(180_000);
		expect(CHECK_INTERVAL_MS).toBe(5_000);
	});

	it('reads every 5 s, the first 5 s after the start, and ends when the capture has appeared', async () => {
		const entered = Date.now();
		const reads: number[] = [];
		const read = vi.fn(async () => {
			reads.push(Date.now() - entered);
			return reads.length < 2 ? before : [...before, rec(2, [20])];
		});
		const outcome = start(read);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
		await expect(outcome).resolves.toEqual({ kind: 'found', record: rec(2, [20]) });
		expect(reads).toEqual([5_000, 10_000]);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('(a) a timeout at 300 s still gets the whole loop: a capture committed 60 s later is found', async () => {
		// The request started 300 s ago; the check starts now.
		vi.advanceTimersByTime(300_000);
		const entered = Date.now();
		let committed = false;
		const read = vi.fn(async () => (committed ? [...before, rec(2, [20])] : before));
		let settled: unknown = null;
		void start(read).then((o) => (settled = o));
		await vi.advanceTimersByTimeAsync(55_000);
		expect(settled).toBeNull();
		committed = true;
		await vi.advanceTimersByTimeAsync(5_000);
		expect(settled).toEqual({ kind: 'found', record: rec(2, [20]) });
		expect(Date.now() - entered).toBe(60_000);
		expect(read).toHaveBeenCalledTimes(12);
	});

	it('(c) ends as not saved on a read that succeeded at the end of the window and found nothing', async () => {
		const entered = Date.now();
		const read = vi.fn(async () => before);
		let settled: unknown = null;
		void start(read).then((o) => (settled = o));
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS - 1);
		expect(settled).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toEqual({ kind: 'not-saved' });
		expect(Date.now() - entered).toBe(CHECK_WINDOW_MS);
		expect(read).toHaveBeenCalledTimes(CHECK_WINDOW_MS / CHECK_INTERVAL_MS);
	});

	it('(b) a read that fails at the end of the window does not end it: the next successful read decides', async () => {
		let failing = false;
		let committed = false;
		const read = vi.fn(async () => {
			if (failing) throw new Error('offline');
			return committed ? [...before, rec(2, [20])] : before;
		});
		let settled: unknown = null;
		void start(read).then((o) => (settled = o));
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS - 1);
		failing = true;
		await vi.advanceTimersByTimeAsync(1);
		expect(settled).toBeNull();
		// Failed reads go on every 5 s, and still decide nothing.
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
		expect(settled).toBeNull();
		expect(read).toHaveBeenCalledTimes(CHECK_WINDOW_MS / CHECK_INTERVAL_MS + 3);
		failing = false;
		committed = true;
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(settled).toEqual({ kind: 'found', record: rec(2, [20]) });
	});

	it('(b) a read that answers null at the end of the window, then an empty successful read: not saved only then', async () => {
		let failing = false;
		const read = vi.fn(async () => (failing ? null : before));
		let settled: unknown = null;
		void start(read).then((o) => (settled = o));
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS - 1);
		failing = true;
		await vi.advanceTimersByTimeAsync(1);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(settled).toBeNull();
		failing = false;
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(settled).toEqual({ kind: 'not-saved' });
	});

	it('a read still in flight at the end of the window decides when it answers', async () => {
		let answer: ((v: readonly RecordLike[]) => void) | null = null;
		let calls = 0;
		const read = vi.fn(() => {
			calls++;
			if (calls === CHECK_WINDOW_MS / CHECK_INTERVAL_MS)
				return new Promise<readonly RecordLike[]>((r) => (answer = r));
			return Promise.resolve(before);
		});
		let settled: unknown = null;
		void start(read).then((o) => (settled = o));
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS + 30_000);
		expect(settled).toBeNull();
		answer!([...before, rec(2, [20])]);
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toEqual({ kind: 'found', record: rec(2, [20]) });
	});

	it('stops when its signal aborts, and leaves no timer behind', async () => {
		const read = vi.fn(async () => before);
		const controller = new AbortController();
		const outcome = start(read, controller.signal);
		await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
		expect(read).toHaveBeenCalledTimes(1);
		controller.abort();
		await expect(outcome).resolves.toEqual({ kind: 'stopped' });
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(CHECK_WINDOW_MS);
		expect(read).toHaveBeenCalledTimes(1);
	});
});

describe('createKnownRecords: what the screen knows the server holds', () => {
	it('the last successful list read, plus every record and image a capture answer confirmed since', () => {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		// Capture A answered with its record and images; the list read after it failed.
		known.confirmed(2, [20, 21]);
		const before = known.snapshot();
		// The first read that holds A is not capture B.
		expect(appearedRecord(before, [rec(1, [10]), rec(2, [20, 21])])).toBeNull();
		expect(appearedRecord(before, [rec(1, [10]), rec(2, [20, 21]), rec(3, [30])])).toEqual(
			rec(3, [30])
		);
	});

	it('a retake answer confirms its new images: the next retake of the record counts only newer ones', () => {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		known.confirmed(1, [11]);
		const before = known.snapshot(1);
		expect(appearedRecord(before, [rec(1, [11])])).toBeNull();
		expect(appearedRecord(before, [rec(1, [12])])).toEqual(rec(1, [12]));
	});

	it('a snapshot does not change with later reads', () => {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		const before = known.snapshot();
		known.listed([rec(1, [10]), rec(2, [20])]);
		expect(appearedRecord(before, [rec(1, [10]), rec(2, [20])])).toEqual(rec(2, [20]));
	});

	it('reset forgets everything, for another volume', () => {
		const known = createKnownRecords();
		known.listed([rec(1, [10])]);
		known.confirmed(2, [20]);
		known.reset();
		expect(appearedRecord(known.snapshot(), [rec(1, [10])])).toEqual(rec(1, [10]));
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
		known.confirmed(2, [20]);
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
				read: async () => null,
				notice: vi.fn(),
				onCapturing: vi.fn(),
				onCheck: vi.fn(),
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
		expect(appearedRecord(d.known.snapshot(1), [rec(1, [11])])).toBeNull();
	});
});

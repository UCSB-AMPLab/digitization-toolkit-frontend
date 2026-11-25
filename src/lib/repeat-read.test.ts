// The repeated read of a state that is still changing (NEH-419, NEH-420):
// one read per interval while it is wanted, none while the document is
// hidden, and none once stopped. Driven by a scheduler the test fires by
// hand, so nothing waits on time.
//
// Version: 0.3.0
import { describe, expect, it, vi } from 'vitest';
import { HALT, repeatRead, type Scheduler } from './repeat-read';

function manual(): Scheduler & {
	fire(): void;
	pending(): number;
	delays: number[];
	last: (() => void) | null;
} {
	const queue = new Map<number, () => void>();
	const delays: number[] = [];
	let n = 0;
	return {
		delays,
		last: null,
		setTimeout(fn, ms) {
			delays.push(ms);
			this.last = fn;
			queue.set(++n, fn);
			return n;
		},
		clearTimeout(handle) {
			queue.delete(handle as number);
		},
		fire() {
			const due = [...queue.values()];
			queue.clear();
			for (const fn of due) fn();
		},
		pending: () => queue.size
	};
}

function fakeDocument() {
	const target = new EventTarget() as EventTarget & { visibilityState: string };
	target.visibilityState = 'visible';
	const set = (state: string) => {
		target.visibilityState = state;
		target.dispatchEvent(new Event('visibilitychange'));
	};
	return { doc: target as unknown as Document, set };
}

const settle = () => new Promise<void>((r) => queueMicrotask(r));

describe('repeatRead', () => {
	it('can be constructed and disposed during server rendering without a document or timers', () => {
		const scheduler = manual();
		const read = vi.fn();
		const r = repeatRead({ read, wanted: () => true, scheduler });
		r.poke();
		expect(scheduler.pending()).toBe(0);
		r.stop();
		expect(read).not.toHaveBeenCalled();
	});

	it('reads once per interval while wanted, and stops asking once not wanted', async () => {
		const scheduler = manual();
		const { doc } = fakeDocument();
		let wanted = true;
		const read = vi.fn(async () => {});
		const r = repeatRead({ read, wanted: () => wanted, scheduler, doc, intervalMs: 5000 });
		r.poke();
		expect(scheduler.pending()).toBe(1);
		expect(scheduler.delays).toEqual([5000]);
		expect(read).not.toHaveBeenCalled();
		scheduler.fire();
		await settle();
		await settle();
		expect(read).toHaveBeenCalledTimes(1);
		expect(scheduler.pending()).toBe(1);
		wanted = false;
		scheduler.fire();
		await settle();
		await settle();
		expect(read).toHaveBeenCalledTimes(1);
		expect(scheduler.pending()).toBe(0);
		r.stop();
	});

	it('arms one timer however often it is poked', () => {
		const scheduler = manual();
		const { doc } = fakeDocument();
		const r = repeatRead({ read: async () => {}, wanted: () => true, scheduler, doc });
		r.poke();
		r.poke();
		r.poke();
		expect(scheduler.pending()).toBe(1);
		r.stop();
	});

	it('pauses while the document is hidden and goes on when it is visible again', async () => {
		const scheduler = manual();
		const { doc, set } = fakeDocument();
		const read = vi.fn(async () => {});
		const r = repeatRead({ read, wanted: () => true, scheduler, doc });
		r.poke();
		set('hidden');
		expect(scheduler.pending()).toBe(0);
		r.poke();
		expect(scheduler.pending()).toBe(0);
		set('visible');
		expect(scheduler.pending()).toBe(1);
		scheduler.fire();
		await settle();
		expect(read).toHaveBeenCalledTimes(1);
		r.stop();
	});

	it('asks nothing after stop, even from a timer already due', async () => {
		const scheduler = manual();
		const { doc, set } = fakeDocument();
		const read = vi.fn(async () => {});
		const r = repeatRead({ read, wanted: () => true, scheduler, doc });
		r.poke();
		const due = scheduler.last!;
		r.stop();
		expect(scheduler.pending()).toBe(0);
		due();
		set('hidden');
		set('visible');
		r.poke();
		await settle();
		expect(read).not.toHaveBeenCalled();
		expect(scheduler.pending()).toBe(0);
	});

	it('never starts a read while one is in flight: a slow read, the document hidden and shown, the timer fires', async () => {
		const scheduler = manual();
		const { doc, set } = fakeDocument();
		let finish!: () => void;
		const read = vi.fn(
			() =>
				new Promise<void>((r) => {
					finish = r;
				})
		);
		const r = repeatRead({ read, wanted: () => true, scheduler, doc });
		r.poke();
		scheduler.fire();
		expect(read).toHaveBeenCalledTimes(1);
		// The read is slow; meanwhile the page is hidden and shown again.
		set('hidden');
		set('visible');
		r.poke();
		expect(scheduler.pending()).toBeLessThanOrEqual(1);
		scheduler.fire();
		expect(read).toHaveBeenCalledTimes(1);
		// The next read is scheduled once the slow one ends, and only one.
		finish();
		await settle();
		await settle();
		expect(scheduler.pending()).toBe(1);
		scheduler.fire();
		expect(read).toHaveBeenCalledTimes(2);
		finish();
		r.stop();
	});

	it('a visibility change cannot arm a second timer', () => {
		const scheduler = manual();
		const { doc, set } = fakeDocument();
		const r = repeatRead({ read: async () => {}, wanted: () => true, scheduler, doc });
		r.poke();
		set('visible');
		set('visible');
		expect(scheduler.pending()).toBe(1);
		r.stop();
	});

	// A read whose end the test decides, counting how many are in flight at once.
	function slowReads() {
		let inFlight = 0;
		let most = 0;
		const ends: (() => void)[] = [];
		const started: number[] = [];
		const read = vi.fn(() => {
			inFlight += 1;
			most = Math.max(most, inFlight);
			started.push(read.mock.calls.length);
			return new Promise<void>((r) =>
				ends.push(() => {
					inFlight -= 1;
					r();
				})
			);
		});
		return { read, ends, most: () => most, inFlight: () => inFlight };
	}

	it('now() reads at once and cancels an armed timer: Retry just before the timer fires', async () => {
		const scheduler = manual();
		const { doc } = fakeDocument();
		const reads = slowReads();
		const r = repeatRead({ read: reads.read, wanted: () => true, scheduler, doc });
		r.poke();
		expect(scheduler.pending()).toBe(1);
		r.now();
		expect(reads.read).toHaveBeenCalledTimes(1);
		expect(scheduler.pending()).toBe(0);
		scheduler.fire();
		expect(reads.read).toHaveBeenCalledTimes(1);
		reads.ends.shift()!();
		await settle();
		await settle();
		expect(scheduler.pending()).toBe(1);
		expect(reads.most()).toBe(1);
		r.stop();
	});

	it('now() during a read is not lost and does not overlap: it starts when that read ends', async () => {
		const scheduler = manual();
		const { doc, set } = fakeDocument();
		const reads = slowReads();
		const r = repeatRead({ read: reads.read, wanted: () => true, scheduler, doc });
		r.poke();
		scheduler.fire();
		expect(reads.read).toHaveBeenCalledTimes(1);
		// Hidden and shown during the timed read, then a direct read asked for.
		set('hidden');
		set('visible');
		r.now();
		r.now();
		expect(reads.read).toHaveBeenCalledTimes(1);
		reads.ends.shift()!();
		await settle();
		await settle();
		expect(reads.read).toHaveBeenCalledTimes(2);
		expect(reads.inFlight()).toBe(1);
		expect(scheduler.pending()).toBe(0);
		reads.ends.shift()!();
		await settle();
		await settle();
		expect(reads.read).toHaveBeenCalledTimes(2);
		expect(reads.most()).toBe(1);
		r.stop();
	});

	it('a read that answers HALT stops the repeat until now() is asked', async () => {
		const scheduler = manual();
		const { doc, set } = fakeDocument();
		const read = vi.fn(async () => HALT);
		const r = repeatRead({ read, wanted: () => true, scheduler, doc });
		r.now();
		await settle();
		await settle();
		expect(read).toHaveBeenCalledTimes(1);
		expect(scheduler.pending()).toBe(0);
		r.poke();
		set('hidden');
		set('visible');
		expect(scheduler.pending()).toBe(0);
		r.now();
		await settle();
		expect(read).toHaveBeenCalledTimes(2);
		r.stop();
	});

	it('a layout refresh queues behind an active read and cannot resume a refused reader', async () => {
		const scheduler = manual();
		const { doc } = fakeDocument();
		let finish!: (answer: unknown) => void;
		const read = vi.fn(() => new Promise((r) => (finish = r)));
		const r = repeatRead({ read, wanted: () => false, scheduler, doc });
		r.now();
		r.refresh();
		expect(read).toHaveBeenCalledTimes(1);
		finish(undefined);
		await settle();
		await settle();
		expect(read).toHaveBeenCalledTimes(2);
		finish(HALT);
		await settle();
		await settle();
		r.refresh();
		expect(read).toHaveBeenCalledTimes(2);
		r.now();
		expect(read).toHaveBeenCalledTimes(3);
		r.stop();
		finish(undefined);
	});

	it('an authorization refusal cancels even an immediate read queued before it arrived', async () => {
		const scheduler = manual();
		const { doc } = fakeDocument();
		let finish!: (answer: typeof HALT) => void;
		const read = vi.fn(() => new Promise<typeof HALT>((r) => (finish = r)));
		const r = repeatRead({ read, wanted: () => true, scheduler, doc });
		r.now();
		r.now();
		finish(HALT);
		await settle();
		await settle();
		expect(read).toHaveBeenCalledTimes(1);
		expect(scheduler.pending()).toBe(0);
		r.now();
		expect(read).toHaveBeenCalledTimes(2);
		r.stop();
		finish(HALT);
	});

	it('visibility refreshes are serialized, including while idle, but cannot resume a refused reader', async () => {
		const scheduler = manual();
		const { doc, set } = fakeDocument();
		let finish!: (answer: unknown) => void;
		const read = vi.fn(() => new Promise((r) => (finish = r)));
		const r = repeatRead({ read, wanted: () => false, readOnVisible: true, scheduler, doc });
		r.now();
		set('visible');
		set('visible');
		expect(read).toHaveBeenCalledTimes(1);
		finish(undefined);
		await settle();
		await settle();
		expect(read).toHaveBeenCalledTimes(2);
		finish(HALT);
		await settle();
		await settle();
		set('visible');
		expect(read).toHaveBeenCalledTimes(2);
		r.now();
		expect(read).toHaveBeenCalledTimes(3);
		r.stop();
		finish(undefined);
	});
});

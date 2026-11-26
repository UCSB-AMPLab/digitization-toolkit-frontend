// NEH-186: the root layout's watcher asks the backend's health every 15 s
// while the page is visible, one request at a time. The update page's own
// answer (503 {"status": "unavailable"}) reloads the page at once, or as
// soon as the page is visible again; no other failure ever reloads it.
// Three other failures in a row raise `unitNotAnswering`, which the banner
// shows; one healthy answer lowers it and starts the count again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	UNIT_WATCH_INTERVAL_MS,
	startUnitWatch,
	unitNotAnswering,
	type HealthProbe
} from './unit-watch';

class FakeDoc {
	visibilityState = 'visible';
	private listeners = new Set<() => void>();
	addEventListener(_t: 'visibilitychange', l: () => void) {
		this.listeners.add(l);
	}
	removeEventListener(_t: 'visibilitychange', l: () => void) {
		this.listeners.delete(l);
	}
	set(state: 'visible' | 'hidden') {
		this.visibilityState = state;
		for (const l of [...this.listeners]) l();
	}
}

let stops: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	for (const s of stops) s();
	stops = [];
	vi.useRealTimers();
});

function watch(answers: HealthProbe | (() => HealthProbe | Promise<HealthProbe>)) {
	const probe = vi.fn(async (_signal?: AbortSignal) =>
		typeof answers === 'function' ? answers() : answers
	);
	const reload = vi.fn();
	const doc = new FakeDoc();
	stops.push(startUnitWatch({ probe, reload, doc }));
	return { probe, reload, doc };
}

const tick = () => vi.advanceTimersByTimeAsync(UNIT_WATCH_INTERVAL_MS);

describe('startUnitWatch', () => {
	it("reloads at once on the update page's answer", async () => {
		const w = watch('update');
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.reload.mock.calls.length).toBe(1);
		await tick();
		await tick();
		expect(w.probe).toHaveBeenCalledTimes(1);
		expect(w.reload).toHaveBeenCalledTimes(1);
	});

	it('while hidden, reloads only once the page is shown and the answer is still the update', async () => {
		let answer: HealthProbe = 'unreachable';
		const w = watch(() => answer);
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.probe.mock.calls.length).toBe(1);
		w.doc.set('hidden');
		answer = 'update';
		await tick();
		await tick();
		expect(w.probe).toHaveBeenCalledTimes(1);
		expect(w.reload).not.toHaveBeenCalled();
		w.doc.set('visible');
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.reload.mock.calls.length).toBe(1);
		expect(w.probe).toHaveBeenCalledTimes(2);
	});

	it('an update answer that arrives while hidden does not reload until a check made while visible says so', async () => {
		let release: (v: HealthProbe) => void = () => {};
		let n = 0;
		const w = watch(() => {
			n += 1;
			return n === 1 ? new Promise<HealthProbe>((r) => (release = r)) : 'ok';
		});
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.probe.mock.calls.length).toBe(1);
		w.doc.set('hidden');
		release('update');
		await vi.advanceTimersByTimeAsync(0);
		expect(w.reload).not.toHaveBeenCalled();
		w.doc.set('visible');
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.probe.mock.calls.length).toBe(2);
		expect(w.reload).not.toHaveBeenCalled();
	});

	it('never reloads on any other failure, and raises the banner after three in a row', async () => {
		const w = watch('unreachable');
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.probe.mock.calls.length).toBe(1);
		await tick();
		await expect.poll(() => w.probe.mock.calls.length).toBe(2);
		expect(get(unitNotAnswering)).toBe(false);
		await tick();
		await expect.poll(() => get(unitNotAnswering)).toBe(true);
		// A download on the page keeps going: twenty more minutes of 502s reload nothing.
		for (let i = 0; i < 80; i++) await tick();
		expect(w.probe.mock.calls.length).toBeGreaterThan(80);
		expect(w.reload).not.toHaveBeenCalled();
	});

	it('one healthy answer lowers the banner and starts the count again', async () => {
		const answers: HealthProbe[] = [
			'unreachable',
			'unreachable',
			'unreachable',
			'ok',
			'unreachable',
			'unreachable'
		];
		const w = watch(() => answers.shift() ?? 'unreachable');
		await vi.advanceTimersByTimeAsync(0);
		await tick();
		await tick();
		await expect.poll(() => get(unitNotAnswering)).toBe(true);
		await tick();
		await expect.poll(() => w.probe.mock.calls.length).toBe(4);
		expect(get(unitNotAnswering)).toBe(false);
		await tick();
		await tick();
		await expect.poll(() => w.probe.mock.calls.length).toBe(6);
		expect(get(unitNotAnswering)).toBe(false);
		await tick();
		await expect.poll(() => get(unitNotAnswering)).toBe(true);
	});

	it('keeps one check in flight at a time when the health hangs', async () => {
		let inFlight = 0;
		let most = 0;
		const w = watch(() => {
			inFlight += 1;
			most = Math.max(most, inFlight);
			const signal = w.probe.mock.calls.at(-1)?.[0];
			return new Promise<HealthProbe>((resolve) => {
				signal?.addEventListener('abort', () => {
					inFlight -= 1;
					resolve('unreachable');
				});
			});
		});
		await vi.advanceTimersByTimeAsync(0);
		for (let i = 0; i < 20; i++) await tick();
		expect(w.probe.mock.calls.length).toBeGreaterThan(1);
		expect(most).toBe(1);
		expect(w.reload).not.toHaveBeenCalled();
	});

	it('a second watcher stops the first, so one watcher runs after a remount', async () => {
		const first = watch('ok');
		await vi.advanceTimersByTimeAsync(0);
		const second = watch('ok');
		await vi.advanceTimersByTimeAsync(0);
		const before = first.probe.mock.calls.length;
		for (let i = 0; i < 4; i++) await tick();
		expect(first.probe.mock.calls.length).toBe(before);
		expect(second.probe.mock.calls.length).toBe(5);
	});
});

describe('startUnitWatch: shown again during a check', () => {
	it('starts a new check as soon as the one in flight settles', async () => {
		let release: (v: HealthProbe) => void = () => {};
		let n = 0;
		const w = watch(() => {
			n += 1;
			return n === 1 ? new Promise<HealthProbe>((r) => (release = r)) : 'ok';
		});
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.probe.mock.calls.length).toBe(1);
		w.doc.set('hidden');
		await vi.advanceTimersByTimeAsync(0);
		w.doc.set('visible');
		await vi.advanceTimersByTimeAsync(0);
		expect(w.probe).toHaveBeenCalledTimes(1);
		release('unreachable');
		await vi.advanceTimersByTimeAsync(0);
		await expect.poll(() => w.probe.mock.calls.length).toBe(2);
	});
});

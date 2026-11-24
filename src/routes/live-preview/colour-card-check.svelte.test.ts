// The capture screen's colour card check (NEH-340, colour-card-check.svelte.ts)
// on its own. It holds one verdict, `need`, from the latest answer; the
// first check of a visit is pending until it settles or its bound passes;
// the page tells it whether it may read (`update`), and nothing else starts
// a read. After `destroy` nothing it is asked to do sends or schedules
// anything.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ state: vi.fn() }));
const unit = vi.hoisted(() => ({ reloadUnit: vi.fn() }));
vi.mock('$lib/api', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/api')>()),
	colourCardApi: { state: api.state }
}));
vi.mock('$lib/unit-mode', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/unit-mode')>()),
	reloadUnit: unit.reloadUnit
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { readColourCardState } from '$lib/colour-card';
import { ColourCardCheck, FIRST_CHECK_HOLD_MS } from './colour-card-check.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

const answer = (needed: boolean | null, enabled = true) =>
	readColourCardState({
		enabled,
		needed,
		reason: needed ? 'settings_changed' : null,
		status: 'none',
		sets: []
	})!;

let asks: boolean;
const check = () => new ColourCardCheck({ collectionId: () => 9, asks: () => asks });

beforeEach(() => {
	asks = true;
	api.state.mockReset();
	unit.reloadUnit.mockReset();
	unit.reloadUnit.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('the first check of a visit', () => {
	it('is pending at most FIRST_CHECK_HOLD_MS from the moment it may start, then goes on in the background', async () => {
		vi.useFakeTimers();
		const fresh = deferred<null>();
		unit.reloadUnit.mockReturnValue(fresh.promise);
		const read = deferred<ReturnType<typeof answer>>();
		api.state.mockReturnValue(read.promise);
		const c = check();
		expect(FIRST_CHECK_HOLD_MS).toBe(10_000);
		expect(c.firstPending).toBe(true);
		c.update(true);
		await vi.advanceTimersByTimeAsync(FIRST_CHECK_HOLD_MS - 1);
		expect(c.firstPending).toBe(true);
		await vi.advanceTimersByTimeAsync(1);
		expect(c.firstPending).toBe(false);
		expect(c.need).toBe(false);
		fresh.resolve(null);
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
		read.resolve(answer(true));
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.destroy();
	});

	it('a check that settles within the bound leaves no timer behind', async () => {
		vi.useFakeTimers();
		api.state.mockResolvedValue(answer(false));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.firstPending).toBe(false));
		expect(vi.getTimerCount()).toBe(0);
		c.destroy();
	});

	it('nothing is read until the page says it may', async () => {
		api.state.mockResolvedValue(answer(true));
		const c = check();
		c.request();
		c.update(false);
		expect(unit.reloadUnit).not.toHaveBeenCalled();
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.destroy();
	});
});

describe('need: the verdict of the latest answer', () => {
	it('a later answer "not needed" clears a "needed" one', async () => {
		api.state.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(false));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.request();
		await vi.waitFor(() => expect(c.need).toBe(false));
		c.destroy();
	});

	it('needed null keeps the verdict before it; on the first check it is not needed', async () => {
		api.state
			.mockResolvedValueOnce(answer(null))
			.mockResolvedValueOnce(answer(true))
			.mockResolvedValueOnce(answer(null))
			.mockResolvedValueOnce(answer(false, true));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.firstPending).toBe(false));
		expect(c.need).toBe(false);
		c.request();
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.request();
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(3));
		c.request();
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(4));
		await vi.waitFor(() => expect(c.need).toBe(false));
		c.destroy();
	});

	it('not enabled is not needed', async () => {
		api.state.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(true, false));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.request();
		await vi.waitFor(() => expect(c.need).toBe(false));
		c.destroy();
	});

	it('the setting off, read afresh, is not needed', async () => {
		api.state.mockResolvedValue(answer(true));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		asks = false;
		c.request();
		await vi.waitFor(() => expect(c.need).toBe(false));
		expect(api.state).toHaveBeenCalledTimes(1);
		c.destroy();
	});

	it('a failed read keeps the previous verdict', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = deferred<never>();
		api.state.mockResolvedValueOnce(answer(true)).mockReturnValueOnce(failing.promise);
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.request();
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(2));
		failing.reject(new Error('down'));
		await failing.promise.catch(() => {});
		await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
		expect(c.need).toBe(true);
		c.destroy();
	});

	it('requests made during a read come to one more read, started when it settles', async () => {
		const first = deferred<ReturnType<typeof answer>>();
		api.state.mockReturnValueOnce(first.promise).mockResolvedValue(answer(false));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
		c.request();
		c.request();
		c.request();
		first.resolve(answer(true));
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(c.need).toBe(false));
		expect(api.state).toHaveBeenCalledTimes(2);
		c.destroy();
	});
});

describe('destroy', () => {
	it('after destroy nothing is read and no timer is set', async () => {
		vi.useFakeTimers();
		const c = check();
		c.destroy();
		c.update(true);
		c.request();
		c.reset();
		c.evidence({ at: c.stamp(), need: true });
		expect(unit.reloadUnit).not.toHaveBeenCalled();
		expect(api.state).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('a read in flight when it is destroyed changes nothing when it answers', async () => {
		const read = deferred<ReturnType<typeof answer>>();
		api.state.mockReturnValue(read.promise);
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
		c.destroy();
		read.resolve(answer(true));
		await read.promise;
		// A task boundary: every continuation of the read has run.
		await new Promise<void>((r) => setTimeout(r, 0));
		expect(c.need).toBe(false);
	});
});

describe('evidence: one way in, latest started wins', () => {
	it('a read started before the step completed the set is dropped when it answers after', async () => {
		const read = deferred<ReturnType<typeof answer>>();
		api.state.mockResolvedValueOnce(answer(true)).mockReturnValueOnce(read.promise);
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.request();
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(2));
		// The step completes the set: later evidence.
		c.evidence({ at: c.stamp(), need: false });
		expect(c.need).toBe(false);
		read.resolve(answer(true));
		await read.promise;
		await new Promise<void>((r) => setTimeout(r, 0));
		expect(c.need).toBe(false);
		c.destroy();
	});

	it('a recovery read started after a background read is applied over it, and the background answer that started first is dropped', async () => {
		const c = check();
		api.state.mockResolvedValueOnce(answer(true));
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		const background = c.stamp();
		const recovery = c.stamp();
		c.evidence({ at: recovery, state: answer(true) });
		c.evidence({ at: background, state: answer(false) });
		expect(c.need).toBe(true);
		c.destroy();
	});

	it('after destroy, evidence changes nothing', () => {
		const c = check();
		c.destroy();
		c.evidence({ at: c.stamp(), state: answer(true) });
		expect(c.need).toBe(false);
	});
});

describe('a state read is stamped when its GET is sent, and an answer dropped as older asks again', () => {
	it('a read waiting on the unit read while the set is completed, then settings change: need becomes true with no other trigger', async () => {
		const fresh = deferred<null>();
		api.state.mockResolvedValueOnce(answer(true)).mockResolvedValueOnce(answer(true));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.need).toBe(true));
		unit.reloadUnit.mockReturnValueOnce(fresh.promise);
		c.request();
		await vi.waitFor(() => expect(unit.reloadUnit).toHaveBeenCalledTimes(2));
		// The step completes the set while the read waits on the unit.
		expect(c.evidence({ at: c.stamp(), need: false })).toBe(true);
		expect(c.need).toBe(false);
		// The settings change; the GET that now goes out says needed.
		fresh.resolve(null);
		await vi.waitFor(() => expect(c.need).toBe(true));
		expect(api.state).toHaveBeenCalledTimes(2);
		c.destroy();
	});

	it('an answer dropped as older requests one fresh read', async () => {
		const inFlight = deferred<ReturnType<typeof answer>>();
		api.state
			.mockResolvedValueOnce(answer(false))
			.mockReturnValueOnce(inFlight.promise)
			.mockResolvedValueOnce(answer(true));
		const c = check();
		c.update(true);
		await vi.waitFor(() => expect(c.firstPending).toBe(false));
		c.request();
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(2));
		// Newer evidence lands while that GET is out.
		c.evidence({ at: c.stamp(), need: false });
		inFlight.resolve(answer(true));
		await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(3));
		await vi.waitFor(() => expect(c.need).toBe(true));
		c.destroy();
	});

	it('evidence says whether it was applied', () => {
		const c = check();
		const older = c.stamp();
		expect(c.evidence({ at: c.stamp(), need: true })).toBe(true);
		expect(c.evidence({ at: older, need: false })).toBe(false);
		expect(c.need).toBe(true);
		c.destroy();
	});
});

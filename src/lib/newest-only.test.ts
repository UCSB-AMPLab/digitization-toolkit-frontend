// newestOnly: of overlapping loads, only the newest request's response is
// assigned; an older one is discarded whoever started it, and its caller
// learns the newest one's outcome.
//
// Version: 0.3.3
import { describe, expect, it, vi } from 'vitest';
import { newestOnly } from './newest-only';

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('newestOnly', () => {
	it('assigns only the newest response when two loads resolve out of order', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const responses = [first, second];
		const apply = vi.fn((v: string) => v.length > 0);
		const load = newestOnly(() => responses.shift()!.promise, apply);

		const older = load();
		const newer = load();
		second.resolve('new');
		await expect(newer).resolves.toEqual({ ok: true, own: true });
		first.resolve('old');
		await expect(older).resolves.toEqual({ ok: true, own: false });
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply).toHaveBeenCalledWith('new');
	});

	it('also when the older one answers first: it is not assigned, and waits for the newest', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const responses = [first, second];
		const apply = vi.fn(() => true);
		const load = newestOnly(() => responses.shift()!.promise, apply);

		const older = load();
		const newer = load();
		first.resolve('old');
		let olderDone = false;
		older.then(() => (olderDone = true));
		await Promise.resolve();
		await Promise.resolve();
		expect(olderDone).toBe(false);
		expect(apply).not.toHaveBeenCalled();
		second.resolve('new');
		await expect(newer).resolves.toEqual({ ok: true, own: true });
		await expect(older).resolves.toEqual({ ok: true, own: false });
		expect(apply).toHaveBeenCalledWith('new');
		expect(apply).toHaveBeenCalledTimes(1);
	});

	it("tells an older caller that the newest failed, and never assigns the older one's data", async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const responses = [first, second];
		const apply = vi.fn(() => true);
		const onError = vi.fn();
		const load = newestOnly(() => responses.shift()!.promise, apply, onError);

		const older = load();
		const newer = load();
		first.resolve('old');
		second.reject(new Error('boom'));
		await expect(newer).resolves.toEqual({ ok: false, own: false });
		await expect(older).resolves.toEqual({ ok: false, own: false });
		expect(apply).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it('a single load reports its own outcome, failure included', async () => {
		const apply = vi.fn((v: number) => v > 0);
		let next: () => Promise<number> = () => Promise.resolve(3);
		const load = newestOnly(() => next(), apply, () => {});
		await expect(load()).resolves.toEqual({ ok: true, own: true });
		next = () => Promise.resolve(0);
		await expect(load()).resolves.toEqual({ ok: false, own: false });
		next = () => Promise.reject(new Error('x'));
		await expect(load()).resolves.toEqual({ ok: false, own: false });
	});
});

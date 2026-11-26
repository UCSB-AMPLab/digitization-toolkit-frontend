// Renewing the session while someone uses the interface (NEH-355): a renewal
// follows real input (pointer, key, touch, wheel; the capture pedal is a key),
// at most once per interval, one at a time; a failed one is silent and the
// next input after an interval tries again; nothing renews without input or
// while signed out, nor between a sign-out and the next sign-in, and a
// sign-out can wait for the renewal in flight.
//
// Version: 0.3.0
import { describe, expect, it, vi } from 'vitest';
import {
	SESSION_ACTIVITY_EVENTS,
	SESSION_RENEW_INTERVAL_MS,
	createSessionRenewals,
	startSessionKeepalive
} from './session-keepalive';

type Listener = (event: { isTrusted: boolean }) => void;

function fakeTarget() {
	const listeners = new Map<string, Set<Listener>>();
	return {
		addEventListener(type: string, fn: Listener) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener(type: string, fn: Listener) {
			listeners.get(type)?.delete(fn);
		},
		fire(type: string, isTrusted = true) {
			for (const fn of listeners.get(type) ?? []) fn({ isTrusted });
		},
		count() {
			let n = 0;
			for (const set of listeners.values()) n += set.size;
			return n;
		}
	};
}

function setup(options: { signedIn?: () => boolean; renew?: () => Promise<void> } = {}) {
	let now = 1_000_000;
	const target = fakeTarget();
	const renew = vi.fn(options.renew ?? (() => Promise.resolve()));
	const renewals = createSessionRenewals();
	const stop = startSessionKeepalive({
		target: target as unknown as EventTarget,
		renew,
		isSignedIn: options.signedIn ?? (() => true),
		now: () => now,
		renewals
	});
	return {
		target,
		renew,
		renewals,
		stop,
		advance(ms: number) {
			now += ms;
		}
	};
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startSessionKeepalive', () => {
	it('renews on the first real input, and not again within the interval', async () => {
		const k = setup();
		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(1);
		await settle();

		k.advance(SESSION_RENEW_INTERVAL_MS - 1);
		k.target.fire('pointerdown');
		k.target.fire('touchstart');
		expect(k.renew).toHaveBeenCalledTimes(1);

		k.advance(1);
		k.target.fire('wheel');
		expect(k.renew).toHaveBeenCalledTimes(2);
	});

	it('listens to pointer, key, touch and wheel input', () => {
		expect([...SESSION_ACTIVITY_EVENTS].sort()).toEqual([
			'keydown',
			'pointerdown',
			'touchstart',
			'wheel'
		]);
		for (const type of SESSION_ACTIVITY_EVENTS) {
			const k = setup();
			k.target.fire(type);
			expect(k.renew).toHaveBeenCalledTimes(1);
			k.stop();
		}
	});

	it('never renews without input, however long the page stays open', async () => {
		const k = setup();
		k.advance(SESSION_RENEW_INTERVAL_MS * 100);
		await settle();
		expect(k.renew).not.toHaveBeenCalled();
	});

	it('ignores events a script dispatched', () => {
		const k = setup();
		k.target.fire('keydown', false);
		expect(k.renew).not.toHaveBeenCalled();
	});

	it('does not renew while signed out', () => {
		let signedIn = false;
		const k = setup({ signedIn: () => signedIn });
		k.target.fire('keydown');
		expect(k.renew).not.toHaveBeenCalled();

		signedIn = true;
		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(1);
	});

	it('keeps one renewal in flight at a time', async () => {
		let finish!: () => void;
		const k = setup({ renew: () => new Promise<void>((resolve) => (finish = resolve)) });
		k.target.fire('keydown');
		k.advance(SESSION_RENEW_INTERVAL_MS * 2);
		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(1);

		// Once it settles, an input more than an interval after it renews.
		finish();
		await settle();
		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(2);
	});

	it('a failed renewal is silent and the next input after an interval tries again', async () => {
		const k = setup({ renew: () => Promise.reject(new TypeError('Failed to fetch')) });
		k.target.fire('keydown');
		await settle();
		expect(k.renew).toHaveBeenCalledTimes(1);

		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(1);

		k.advance(SESSION_RENEW_INTERVAL_MS);
		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(2);
		await settle();
	});

	it('starts no renewal once renewals are stopped, until they are resumed', async () => {
		const k = setup();
		await k.renewals.stop();
		k.target.fire('keydown');
		k.advance(SESSION_RENEW_INTERVAL_MS * 3);
		k.target.fire('pointerdown');
		expect(k.renew).not.toHaveBeenCalled();

		k.renewals.resume();
		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(1);
	});

	it('stop() resolves only once the renewal in flight has settled, and says one was', async () => {
		let finish!: () => void;
		const k = setup({ renew: () => new Promise<void>((resolve) => (finish = resolve)) });
		k.target.fire('keydown');
		expect(k.renew).toHaveBeenCalledTimes(1);

		let result: boolean | undefined;
		k.renewals.stop().then((wasInFlight) => (result = wasInFlight));
		await settle();
		expect(result).toBeUndefined();

		finish();
		await settle();
		expect(result).toBe(true);
	});

	it('stop() resolves after a renewal that fails, too, and at once with none in flight', async () => {
		let fail!: (error: Error) => void;
		const k = setup({ renew: () => new Promise<void>((_resolve, reject) => (fail = reject)) });
		await expect(k.renewals.stop()).resolves.toBe(false);
		k.renewals.resume();

		k.target.fire('keydown');
		let result: boolean | undefined;
		k.renewals.stop().then((wasInFlight) => (result = wasInFlight));
		fail(new TypeError('Failed to fetch'));
		await settle();
		expect(result).toBe(true);
	});

	it('stop() removes every listener', () => {
		const k = setup();
		expect(k.target.count()).toBe(SESSION_ACTIVITY_EVENTS.length);
		k.stop();
		expect(k.target.count()).toBe(0);
		k.target.fire('keydown');
		expect(k.renew).not.toHaveBeenCalled();
	});

	it('renews well inside the backend session of eight hours', () => {
		expect(SESSION_RENEW_INTERVAL_MS).toBeLessThanOrEqual(15 * 60 * 1000);
		expect(SESSION_RENEW_INTERVAL_MS).toBeGreaterThanOrEqual(60 * 1000);
	});
});

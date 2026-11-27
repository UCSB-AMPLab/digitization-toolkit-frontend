// NEH-336: the unit holds the capture key. `captureChords` gives the readers
// the unit's key (GET /system/unit, captureKey), the defaults when it is
// null, and this browser's cached copy until the unit has answered. A key
// a browser assigned before the unit held one is carried over once, by an
// administrator or an operator, when the unit has none; a refusal is ignored.
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { reloadUnit, resetUnit, writeUnit } from '$lib/unit-mode';
import { DEFAULT_CHORDS, readChords, writeChord, clearChord, readLegacyChord } from './capture-key';
import { STORAGE_KEYS } from './storage-keys';
import {
	captureChords,
	carryOverCaptureKey,
	setUnitCaptureKey,
	watchCaptureChords
} from './capture-key-unit';

const F7 = { key: 'F7', ctrl: false, alt: false, meta: false, shift: false };
const X = { key: 'x', ctrl: false, alt: false, meta: false, shift: false };
const UNIT = {
	mode: 'offline',
	projectsEnabled: true,
	projectsShown: true,
	defaultProjectId: null,
	prerequisites: { backup: [], fisqua: [] }
};

let unitKey: unknown;
let putAnswer: (body: { capture_key: unknown }) => Response;
let puts: unknown[];
// Holds GET /system/unit back until released; `unitFails` answers it with a 500.
let unitHold: Promise<void> | null;
let unitFails: boolean;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function unitBody() {
	return unitKey === 'absent' ? UNIT : { ...UNIT, captureKey: unitKey };
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 5, username: role, email: null, role, is_active: true });
}

function setLegacy(chord: unknown) {
	localStorage.setItem(STORAGE_KEYS.captureChord, JSON.stringify(chord));
}

beforeEach(() => {
	resetUnit();
	clearChord();
	localStorage.removeItem(STORAGE_KEYS.captureChord);
	unitKey = null;
	puts = [];
	unitHold = null;
	unitFails = false;
	putAnswer = (body) => {
		unitKey = body.capture_key;
		return json(unitBody());
	};
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url);
		if (url.pathname === '/system/unit/capture-key' && init?.method === 'PUT') {
			const body = JSON.parse(init.body as string);
			puts.push(body);
			return putAnswer(body);
		}
		if (url.pathname === '/system/unit') {
			if (unitHold) await unitHold;
			if (unitFails) return json({ detail: 'x' }, 500);
			return json(unitBody());
		}
		return json({});
	});
	signIn('operator');
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	clearChord();
	localStorage.removeItem(STORAGE_KEYS.captureChord);
});

function watch() {
	const seen: (readonly unknown[])[] = [];
	const stop = watchCaptureChords((c) => seen.push(c));
	return { seen, stop };
}

describe('captureChords', () => {
	it('paints with the cached key, then takes the unit’s and caches it', async () => {
		writeChord(X);
		unitKey = F7;
		const { seen, stop } = watch();
		expect(seen[0]).toEqual([X]);
		await expect.poll(() => get(captureChords)).toEqual([F7]);
		expect(readChords()).toEqual([F7]);
		stop();
	});

	it('gives the defaults, and clears the cache, when the unit has no key', async () => {
		writeChord(X);
		unitKey = null;
		const { seen, stop } = watch();
		await expect.poll(() => seen.at(-1)).toEqual(DEFAULT_CHORDS);
		expect(readChords()).toEqual(DEFAULT_CHORDS);
		stop();
	});

	it('keeps the cached key from a backend that does not report one', async () => {
		writeChord(X);
		unitKey = 'absent';
		const { seen, stop } = watch();
		await expect.poll(() => vi.mocked(globalThis.fetch).mock.calls.length).toBe(1);
		expect(get(captureChords)).toEqual([X]);
		stop();
	});

	it("never takes the browser's own assigned key as the capture key", async () => {
		setLegacy(F7);
		unitKey = null;
		const { seen, stop } = watch();
		await expect.poll(() => vi.mocked(globalThis.fetch).mock.calls.length).toBe(1);
		expect(seen.at(-1)).toEqual(DEFAULT_CHORDS);
		stop();
	});

	it('follows a key set for the unit', async () => {
		const { seen, stop } = watch();
		await setUnitCaptureKey(F7);
		await expect.poll(() => seen.at(-1)).toEqual([F7]);
		expect(puts).toEqual([{ capture_key: F7 }]);
		await setUnitCaptureKey(null);
		await expect.poll(() => seen.at(-1)).toEqual(DEFAULT_CHORDS);
		expect(puts.at(-1)).toEqual({ capture_key: null });
		stop();
	});
});

describe('carryOverCaptureKey', () => {
	for (const role of ['admin', 'operator'] as const) {
		it(`sends a ${role}'s browser key once when the unit has none, then stops reading it`, async () => {
			signIn(role);
			setLegacy(F7);
			await carryOverCaptureKey(role);
			expect(puts).toEqual([{ capture_key: F7 }]);
			expect(readLegacyChord()).toBeNull();
			await carryOverCaptureKey(role);
			expect(puts).toHaveLength(1);
			expect(get(captureChords)).toEqual([F7]);
		});
	}

	it('sends nothing for a default key, and forgets it', async () => {
		setLegacy({ key: 'b', ctrl: false, alt: false, meta: false, shift: false });
		await carryOverCaptureKey('operator');
		expect(puts).toEqual([]);
		expect(readLegacyChord()).toBeNull();
	});

	it('sends nothing when the unit already has a key, and forgets the browser’s', async () => {
		unitKey = X;
		setLegacy(F7);
		await carryOverCaptureKey('admin');
		expect(puts).toEqual([]);
		expect(readLegacyChord()).toBeNull();
	});

	for (const role of ['reviewer', 'testing'] as const) {
		it(`sends nothing for ${role}, and leaves the browser's key for someone who may`, async () => {
			signIn(role);
			setLegacy(F7);
			await carryOverCaptureKey(role);
			expect(puts).toEqual([]);
			expect(readLegacyChord()).toEqual(F7);
		});
	}

	it('ignores a refusal silently and does not try again', async () => {
		putAnswer = () => json({ detail: 'Forbidden' }, 403);
		setLegacy(F7);
		await expect(carryOverCaptureKey('operator')).resolves.toBeUndefined();
		expect(puts).toHaveLength(1);
		expect(readLegacyChord()).toBeNull();
		await carryOverCaptureKey('operator');
		expect(puts).toHaveLength(1);
	});
});

describe("the unit's key is read again on every watch (review round 1)", () => {
	function hold() {
		let release!: () => void;
		unitHold = new Promise<void>((resolve) => (release = resolve));
		const answer = () => {
			unitHold = null;
			release();
		};
		// A test that fails before answering must not leave the unit's queue held.
		onTestFinished(answer);
		return answer;
	}
	const unitReads = () =>
		vi
			.mocked(globalThis.fetch)
			.mock.calls.filter((c) => new URL(String(c[0])).pathname === '/system/unit').length;

	it('sees a key another browser set: the cached key until the answer, then the new one', async () => {
		unitKey = F7;
		const first: (readonly unknown[])[] = [];
		const stopFirst = watchCaptureChords((c) => first.push(c));
		await expect.poll(() => first.at(-1)).toEqual([F7]);
		stopFirst();

		// Another browser sets x; this one opens the capture screen again.
		unitKey = X;
		const release = hold();
		const screen: (readonly unknown[])[] = [];
		const stopScreen = watchCaptureChords((c) => screen.push(c));
		await expect.poll(() => unitReads()).toBe(2);
		expect(screen.at(-1)).toEqual([F7]);
		release();
		await expect.poll(() => screen.at(-1)).toEqual([X]);

		// With the capture screen still open, the camera check opens: read again.
		unitKey = F7;
		const check: (readonly unknown[])[] = [];
		const stopCheck = watchCaptureChords((c) => check.push(c));
		await expect.poll(() => check.at(-1)).toEqual([F7]);
		expect(screen.at(-1)).toEqual([F7]);
		stopCheck();
		stopScreen();
	});

	it('keeps the cached key when the read fails', async () => {
		writeChord(X);
		unitFails = true;
		const seen: (readonly unknown[])[] = [];
		const stop = watchCaptureChords((c) => seen.push(c));
		await expect.poll(() => unitReads()).toBe(1);
		// A read started afterwards ends after the watcher's has been handled.
		await reloadUnit();
		expect(seen.length).toBeGreaterThan(0);
		expect(seen.every((c) => JSON.stringify(c) === JSON.stringify([X]))).toBe(true);
		stop();
	});
});

describe('the carry-over (review rounds 2 and 3)', () => {
	const unitReads = () =>
		vi
			.mocked(globalThis.fetch)
			.mock.calls.filter((c) => new URL(String(c[0])).pathname === '/system/unit').length;

	it('carry-over never writes from a cached "no key": a failed read of its own does nothing', async () => {
		await writeUnit(async () => ({ ...UNIT, captureKey: null }));
		setLegacy(F7);
		unitFails = true;
		await carryOverCaptureKey('operator');
		expect(unitReads()).toBe(1);
		expect(puts).toEqual([]);
		expect(readLegacyChord()).toEqual(F7);
	});

	it('carry-over reads the unit itself: a key set since the cache was read means no write', async () => {
		await writeUnit(async () => ({ ...UNIT, captureKey: null }));
		unitKey = X;
		setLegacy(F7);
		await carryOverCaptureKey('admin');
		expect(unitReads()).toBe(1);
		expect(puts).toEqual([]);
		expect(readLegacyChord()).toBeNull();
	});

	it('carry-over writes nothing when the person signed out while its read was out', async () => {
		setLegacy(F7);
		let release!: () => void;
		unitHold = new Promise<void>((resolve) => (release = resolve));
		onTestFinished(() => release());
		const carrying = carryOverCaptureKey('operator');
		await expect.poll(() => unitReads()).toBe(1);
		authStore.clearSession();
		unitHold = null;
		release();
		await carrying;
		expect(puts).toEqual([]);
		expect(readLegacyChord()).toEqual(F7);
	});
});

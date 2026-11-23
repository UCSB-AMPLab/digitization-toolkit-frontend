// NEH-336, review round 4: requests about the unit's state never overlap in
// this browser. Every read of /system/unit and every write that changes it
// is an item of one serial queue in the store; an item starts once the one
// before it has settled. The reviewer's three sequences, a failed item, and
// the count of requests in flight at once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/dashboard/config') }) };
});

import { systemApi, type UnitSettings } from './api';
import { authStore } from './stores/auth';
import { locale } from './i18n';
import { es } from './i18n/es';
import { reloadUnit, resetUnit, unitState, writeUnit, type UnitState } from './unit-mode';
import { carryOverCaptureKey, setUnitCaptureKey } from './capture-key-unit';
import { STORAGE_KEYS } from './storage-keys';
import { clearChord } from './capture-key';
import UnitModeCard from '../routes/(dashboard)/dashboard/config/UnitModeCard.svelte';

const F7 = { key: 'F7', ctrl: false, alt: false, meta: false, shift: false };
const X = { key: 'x', ctrl: false, alt: false, meta: false, shift: false };

type Backend = UnitSettings & { captureKey: typeof F7 | null };
let backend: Backend;
// Requests sent and not yet answered, and the most at once.
let inFlight: number;
let maxInFlight: number;
// Each request as sent: its kind and a function that answers it.
let sent: { kind: string; body?: unknown; release: () => void; fail: () => void }[];

function base(): Backend {
	return {
		mode: 'backup',
		projectsEnabled: false,
		projectsShown: false,
		defaultProjectId: 1,
		prerequisites: { backup: [], fisqua: [] },
		captureKey: null
	};
}

// A request is held until the test answers it. `at` says when the backend
// handles it: on arrival ('send') or only when it is answered ('release').
function held<T>(
	kind: string,
	at: 'send' | 'release',
	handle: () => T,
	body?: unknown
): Promise<T> {
	inFlight += 1;
	maxInFlight = Math.max(maxInFlight, inFlight);
	const early = at === 'send' ? handle() : undefined;
	return new Promise<T>((resolve, reject) => {
		sent.push({
			kind,
			body,
			release: () => {
				inFlight -= 1;
				resolve(at === 'send' ? (early as T) : handle());
			},
			fail: () => {
				inFlight -= 1;
				reject(new Error('Internal Server Error'));
			}
		});
	});
}

const snapshot = () => ({ ...backend, prerequisites: { backup: [], fisqua: [] } });
const sentOf = (kind: string) => sent.filter((s) => s.kind === kind);

let readsAt: 'send' | 'release';
let writesAt: 'send' | 'release';

beforeEach(() => {
	locale.set('es');
	resetUnit();
	clearChord();
	localStorage.removeItem(STORAGE_KEYS.captureChord);
	backend = base();
	inFlight = 0;
	maxInFlight = 0;
	sent = [];
	readsAt = 'send';
	writesAt = 'send';
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
	vi.spyOn(systemApi, 'unit').mockImplementation(() => held('get', readsAt, snapshot) as never);
	vi.spyOn(systemApi, 'setCaptureKey').mockImplementation(
		(chord) =>
			held(
				'put-key',
				writesAt,
				() => {
					backend = { ...backend, captureKey: chord ?? null };
					return snapshot();
				},
				chord
			) as never
	);
	vi.spyOn(systemApi, 'setUnit').mockImplementation(
		(body) =>
			held(
				'put-unit',
				writesAt,
				() => {
					backend = { ...backend, ...(body.mode ? { mode: body.mode } : {}) };
					return snapshot();
				},
				body
			) as never
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	clearChord();
	localStorage.removeItem(STORAGE_KEYS.captureChord);
});

describe('one serial queue for the unit state', () => {
	it('(1) save F7, then a read while the PUT is out: the state ends F7', async () => {
		// The PUT reaches the backend only when answered; a read sent while it
		// is out would see the key before it.
		writesAt = 'release';
		readsAt = 'send';
		const save = setUnitCaptureKey(F7);
		await expect.poll(() => sentOf('put-key').length).toBe(1);
		// The section is opened again: a read is asked for.
		const read = reloadUnit();
		// The read's module imports have settled, so a read that went out at
		// once has been sent by now: none may be while the PUT is out.
		await vi.dynamicImportSettled();
		await vi.dynamicImportSettled();
		expect(sentOf('get')).toHaveLength(0);
		sentOf('put-key')[0].release();
		await expect.poll(() => sentOf('get').length).toBe(1);
		sentOf('get')[0].release();
		await read;
		await save;
		expect(get(unitState)?.captureKey).toEqual(F7);
		expect(maxInFlight).toBe(1);
	});

	it('(2) a mode change, then the capture key saved before the mode answers: the state keeps both', async () => {
		readsAt = 'send';
		writesAt = 'send';
		const history: (UnitState | null)[] = [];
		const stop = unitState.subscribe((s) => history.push(s));
		// The card's first read.
		render(UnitModeCard);
		await expect.poll(() => sentOf('get').length).toBe(1);
		sentOf('get')[0].release();
		await userEvent.click(page.getByRole('radio', { name: /^Solo en el escáner/ }));
		await userEvent.click(page.getByRole('button', { name: es.common_save, exact: true }));
		await expect.poll(() => sentOf('put-unit').length).toBe(1);
		// Settings › Capture key, saved while the mode's answer is out.
		const key = setUnitCaptureKey(F7);
		const applied = history.length;
		sentOf('put-unit')[0].release();
		await expect.poll(() => sentOf('put-key').length).toBe(1);
		sentOf('put-key')[0].release();
		await key;
		// Both answers have been applied.
		await expect.poll(() => history.length).toBe(applied + 2);
		expect(history.at(-1)?.mode).toBe('offline');
		expect(history.at(-1)?.captureKey).toEqual(F7);
		expect(maxInFlight).toBe(1);
		stop();
	});

	it("(3) the carry-over's read held, then an explicit save of x: the unit keeps x, and no legacy key is written after it", async () => {
		localStorage.setItem(STORAGE_KEYS.captureChord, JSON.stringify(F7));
		const carrying = carryOverCaptureKey('admin');
		await expect.poll(() => sentOf('get').length).toBe(1);
		const save = setUnitCaptureKey(X);
		sentOf('get')[0].release();
		// The carry-over runs as one item: its write, if any, comes before x's.
		for (let i = 0; i < 2; i++) {
			await expect.poll(() => sentOf('put-key').length).toBeGreaterThan(i);
			sentOf('put-key')[i].release();
			if (sentOf('put-key')[i].body === X) break;
		}
		await carrying;
		await save;
		expect(sentOf('put-key').at(-1)?.body).toEqual(X);
		expect(backend.captureKey).toEqual(X);
		expect(get(unitState)?.captureKey).toEqual(X);
		expect(maxInFlight).toBe(1);
	});

	it('(3b) an explicit save queued before the carry-over is seen by its read: no legacy key is written', async () => {
		localStorage.setItem(STORAGE_KEYS.captureChord, JSON.stringify(F7));
		const save = setUnitCaptureKey(X);
		await expect.poll(() => sentOf('put-key').length).toBe(1);
		const carrying = carryOverCaptureKey('admin');
		sentOf('put-key')[0].release();
		await save;
		await expect.poll(() => sentOf('get').length).toBe(1);
		sentOf('get')[0].release();
		await carrying;
		expect(sentOf('put-key').map((s) => s.body)).toEqual([X]);
		expect(get(unitState)?.captureKey).toEqual(X);
	});

	it('a failed item rejects for its caller and the next one runs', async () => {
		const save = setUnitCaptureKey(F7);
		await expect.poll(() => sentOf('put-key').length).toBe(1);
		const read = reloadUnit();
		sentOf('put-key')[0].fail();
		await expect(save).rejects.toThrow();
		await expect.poll(() => sentOf('get').length).toBe(1);
		sentOf('get')[0].release();
		expect((await read)?.mode).toBe('backup');
	});

	it('runs items one at a time; reads asked for while one waits share it', async () => {
		const first = writeUnit(() => systemApi.setUnit({ mode: 'offline' }));
		const r1 = reloadUnit();
		const r2 = reloadUnit();
		const second = writeUnit(() => systemApi.setCaptureKey(F7));
		const r3 = reloadUnit();
		const order = ['put-unit', 'get', 'put-key', 'get'];
		for (let i = 0; i < order.length; i++) {
			await expect.poll(() => sent.length).toBe(i + 1);
			expect(sent[i].kind).toBe(order[i]);
			expect(inFlight).toBe(1);
			sent[i].release();
		}
		await Promise.all([first, r1, r2, second, r3]);
		expect(sent.map((s) => s.kind)).toEqual(['put-unit', 'get', 'put-key', 'get']);
		expect(maxInFlight).toBe(1);
		expect(get(unitState)?.mode).toBe('offline');
		expect(get(unitState)?.captureKey).toEqual(F7);
	});
});

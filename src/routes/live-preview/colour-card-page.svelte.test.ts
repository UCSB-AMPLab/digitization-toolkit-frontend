// NEH-340: the colour card step on the capture screen. Once the camera
// set-up is known and needs nothing, the screen reads GET
// /collections/{id}/colour-card?read_cameras=1, holding capture until that
// read has settled; when the answer is enabled and needed, the step opens
// over the screen and no page capture is taken (button and capture key)
// until it is answered. `needed: null` and `enabled: false` open nothing and
// hold nothing; with the unit's setting off, in a testing volume and for the
// testing account nothing is read. The state is read again when the camera
// check closes, when the camera panel is closed and when the tab comes back.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const current = vi.hoisted(() => ({ url: '' }));
const nav = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: nav.goto }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL(current.url) });
			return () => {};
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { recordFocusActivity } from '$lib/focus-check';
import { clearChord } from '$lib/capture-key';
import { reloadUnit, resetUnit } from '$lib/unit-mode';
import { cameraStatus } from '$lib/stores/cameras';
import { get } from 'svelte/store';
import '../../app.css';
import LivePreview from './+page.svelte';

const USER = 3;
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((yes) => (resolve = yes));
	return { promise, resolve };
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const NOT_NEEDED = { needs_setup: false, reasons: [], confirmed_pair: { left: 'a', right: 'b' } };
const SETUP_NEEDED = {
	needs_setup: true,
	reasons: [{ code: 'role_unconfirmed', message: 'English', hardware_ids: ['b'] }],
	confirmed_pair: null
};

const cardState = (over: Record<string, unknown> = {}) => ({
	enabled: true,
	needed: true,
	reason: 'start',
	status: 'none',
	sets: [],
	...over
});
const openSet = {
	id: 5,
	number: 1,
	outcome: null,
	capture_mode: 'dual',
	cameras: [{ camera_index: 0 }, { camera_index: 1 }],
	shots: [
		{ id: 10, camera_index: 0, capture_id: 'x0', filename: 'a.jpg', preview: true, url: '/x' },
		{ id: 11, camera_index: 1, capture_id: 'x1', filename: 'b.jpg', preview: true, url: '/y' }
	]
};

let unitBody: Record<string, unknown>;
// The body of each GET /system/unit; unitBody when unset.
let unitAnswer: (() => Record<string, unknown> | Promise<Record<string, unknown>>) | null;
let unitReads: number;
let capturesAnswer: () => Response | Promise<Response>;
let recordsBody: unknown[];
// When set, each read of the records waits for it.
let recordsGate: Promise<void> | null;
let setBodies: unknown[];
let capsBody: Record<string, unknown>;
// When set, the read of the volume waits for it.
let collectionGate: Promise<void> | null;
// While true, each read of the records fails.
let recordsFail: boolean;
// The answer to each colour card shot.
let shotAnswer: () => Response;
// When set, the answer to POST .../complete waits for it.
let completeGate: Promise<void> | null;
// When set, PUT /cameras/dslr/{n}/settings waits for it.
let dslrPutGate: Promise<void> | null;
let dslrPuts: unknown[];
// How many captures had been sent when each colour card read started.
let capturesAtCardRead: number[];
let collectionBody: Record<string, unknown>;
let setupAnswers: (() => Response)[];
let setupAnswered: number;
let cardAnswers: (() => Response | Promise<Response>)[];
let cardReads: string[];
// The number of set-up answers already given when each colour card read started.
let cardReadAfterSetup: number[];
let captures: string[];

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(String(input), 'http://localhost');
		const path = url.pathname;
		const method = (init as RequestInit | undefined)?.method ?? 'GET';
		if (path.endsWith('/system/unit')) {
			unitReads += 1;
			return json(unitAnswer ? await unitAnswer() : unitBody);
		}
		if (path.endsWith('/cameras/roles') && method === 'PUT')
			return json({ devices: [], setup: NOT_NEEDED });
		if (path.endsWith('/cameras/capabilities')) return json(capsBody);
		if (/\/colour-card\/sets\/\d+\/shots$/.test(path) && method === 'POST') return shotAnswer();
		if (path.endsWith('/cameras/setup')) {
			const next = setupAnswers.length > 1 ? setupAnswers.shift()! : setupAnswers[0];
			setupAnswered += 1;
			return next();
		}
		if (path.endsWith('/colour-card') && method === 'GET') {
			cardReads.push(url.search);
			capturesAtCardRead.push(captures.length);
			cardReadAfterSetup.push(setupAnswered);
			const next = cardAnswers.length > 1 ? cardAnswers.shift()! : cardAnswers[0];
			return next();
		}
		if (path.endsWith('/colour-card/sets') && method === 'POST') {
			setBodies.push(JSON.parse(String((init as RequestInit).body ?? '{}')));
			return json(openSet);
		}
		if (/\/cameras\/dslr\/\d\/settings$/.test(path) && method === 'PUT') {
			dslrPuts.push(JSON.parse(String((init as RequestInit).body)));
			if (dslrPutGate) await dslrPutGate;
			return json({});
		}
		if (path.endsWith('/complete') && method === 'POST' && completeGate) await completeGate;
		if (path.endsWith('/complete') && method === 'POST')
			return json({ ...openSet, outcome: 'taken' });
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (path.endsWith('/cameras/devices') || path.endsWith('/cameras/rescan'))
			return json([
				{
					index: 0,
					hardware_id: 'a',
					model: 'X',
					calibrated: false,
					role: 'left',
					role_confirmed: true
				},
				{
					index: 1,
					hardware_id: 'b',
					model: 'X',
					calibrated: false,
					role: 'right',
					role_confirmed: true
				}
			]);
		if (/\/cameras\/\d\/orientation$/.test(path)) return json({});
		if (path.endsWith('/records/to-retake/summary'))
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.endsWith('/collections/9')) {
			if (collectionGate) await collectionGate;
			return json(collectionBody);
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records/')) {
			if (recordsGate) await recordsGate;
			if (recordsFail) return json({ detail: 'boom' }, 500);
			return json(recordsBody);
		}
		if (path.endsWith('/cameras/capture/dual') || path.endsWith('/cameras/capture')) {
			captures.push(path);
			return capturesAnswer();
		}
		return json([]);
	});
}

function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}
const buttonIn = (root: ParentNode | null, name: string) =>
	root
		? ([...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => nameOf(b) === name) ??
			null)
		: null;
const step = () => document.querySelector('[data-colour-card]') as HTMLElement | null;
const whichStep = () => document.querySelector('[data-which-camera]') as HTMLElement | null;
const checkView = () => document.querySelector('[data-camera-check]') as HTMLElement | null;
const captureButton = () => document.querySelector('.capture-btn') as HTMLButtonElement | null;

function press(key: string, code = key) {
	const target = document.activeElement ?? document.body;
	target.dispatchEvent(
		new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
	);
	target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
}

function signIn(role: UserRole) {
	authStore.setSession(
		{ id: USER, username: role, email: null, role, is_active: true },
		{ signIn: true }
	);
}

beforeEach(() => {
	unitBody = {
		mode: 'offline',
		projectsEnabled: true,
		projectsShown: true,
		defaultProjectId: null,
		prerequisites: { backup: [], fisqua: [] },
		colourCardShots: true
	};
	collectionBody = {
		id: 9,
		name: 'Tomo 6',
		project_id: 2,
		created_at: '2026-01-01T00:00:00',
		filename_stem: 'co-ahr-6',
		custom_attributes: null
	};
	setupAnswers = [() => json(NOT_NEEDED)];
	setupAnswered = 0;
	cardAnswers = [() => json(cardState())];
	cardReads = [];
	cardReadAfterSetup = [];
	captures = [];
	unitAnswer = null;
	unitReads = 0;
	recordsBody = [];
	recordsGate = null;
	recordsFail = false;
	collectionGate = null;
	completeGate = null;
	dslrPutGate = null;
	dslrPuts = [];
	capsBody = { backend: 'gphoto2', live_preview: true, dslr_settings: false };
	shotAnswer = () =>
		json({ id: 12, camera_index: 0, capture_id: 'z', filename: 'z.jpg', preview: true, url: '/z' });
	setBodies = [];
	capturesAtCardRead = [];
	capturesAnswer = () => json({ success: true, record_id: 42, image_ids: [] });
	nav.goto.mockReset();
	localStorage.clear();
	clearChord();
	resetUnit();
	locale.set('en');
	recordFocusActivity(USER, Date.now());
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	signIn('operator');
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	localStorage.clear();
	document.querySelectorAll('[data-colour-card]').forEach((n) => n.remove());
});

describe('capture screen: colour card shots', () => {
	it('a volume asked for shots: the step opens after the camera set-up, and nothing captures', async () => {
		render(LivePreview);
		await expect.poll(() => step()).not.toBeNull();
		expect(cardReads[0]).toBe('?read_cameras=1');
		expect(cardReadAfterSetup[0]).toBeGreaterThan(0);
		expect(step()?.textContent).toContain(en.cc_reason_start);
		expect(captureButton()?.disabled).toBe(true);
		press(' ', 'Space');
		// The step's own set is opened, a later point the capture key would have preceded.
		await expect.poll(() => buttonIn(step(), en.cc_continue)?.disabled).toBe(false);
		expect(captures.length).toBe(0);
	});

	it('Continue answers the request: the step closes and the capture key captures', async () => {
		// After the set is completed the unit is asked again, and says so.
		cardAnswers = [
			() => json(cardState()),
			() => json(cardState({ needed: false, reason: null, status: 'present' }))
		];
		render(LivePreview);
		await expect.poll(() => buttonIn(step(), en.cc_continue)?.disabled).toBe(false);
		buttonIn(step(), en.cc_continue)!.click();
		await expect.poll(() => step()).toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
	});

	it('no colour card read while the camera set-up step is needed; it follows the set-up', async () => {
		setupAnswers = [() => json(SETUP_NEEDED)];
		const read = deferred<Response>();
		cardAnswers = [() => read.promise];
		render(LivePreview);
		await expect
			.poll(() => whichStep()?.querySelector('[data-card="0"] button[data-pick]') ?? null)
			.not.toBeNull();
		await expect.poll(() => setupAnswered).toBeGreaterThanOrEqual(2);
		expect(cardReads.length).toBe(0);
		expect(step()).toBeNull();
		// The set-up is completed: the roles are saved.
		(whichStep()!.querySelector('[data-card="0"] button[data-pick]') as HTMLButtonElement).click();
		await expect.poll(() => buttonIn(whichStep(), en.camwhich_confirm)?.disabled).toBe(false);
		buttonIn(whichStep(), en.camwhich_confirm)!.click();
		await expect.poll(() => whichStep()).toBeNull();
		// The first colour card read starts then, and capture is held while it is pending.
		await expect.poll(() => cardReads.length).toBe(1);
		expect(captureButton()?.disabled).toBe(true);
		press(' ', 'Space');
		read.resolve(json(cardState()));
		await expect.poll(() => step()).not.toBeNull();
		expect(captures.length).toBe(0);
	});

	it('R1: with "off" cached, the first check still holds capture until the fresh unit read and the state read settle', async () => {
		const fresh = deferred<void>();
		let reads = 0;
		unitAnswer = async () => {
			reads += 1;
			if (reads === 1) return { ...unitBody, colourCardShots: false };
			await fresh.promise;
			return { ...unitBody, colourCardShots: true };
		};
		cardAnswers = [() => json(cardState({ needed: false, reason: null, status: 'present' }))];
		render(LivePreview);
		// The check's own fresh read of the unit is in flight.
		await expect.poll(() => reads).toBe(2);
		expect(captureButton()?.disabled).toBe(true);
		press(' ', 'Space');
		captureButton()?.click();
		fresh.resolve();
		await expect.poll(() => cardReads.length).toBeGreaterThanOrEqual(1);
		// No capture went before the check's state read. (The setting seen
		// turning on asks for one more read, which may follow.)
		expect(capturesAtCardRead[0]).toBe(0);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(captures.length).toBe(0);
	});

	it('R3: "needed" during a capture holds new captures at once and shows the step when it ends; a later "not needed" removes hold and step', async () => {
		const second = deferred<Response>();
		cardAnswers = [
			() => json(cardState({ needed: false, reason: null, status: 'present' })),
			() => second.promise,
			() => json(cardState({ needed: false, reason: null, status: 'present' }))
		];
		const slow = deferred<Response>();
		capturesAnswer = () => slow.promise;
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => cardReads.length).toBe(2);
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
		second.resolve(json(cardState({ reason: 'settings_changed' })));
		await second.promise;
		await new Promise<void>((r) => realSetTimeout(r, 0));
		// The capture in flight goes on; the step waits for it.
		expect(step()).toBeNull();
		// When the capture ends, the button stays disabled as the step appears.
		let disabledWhenShown: boolean | null = null;
		const watch = new MutationObserver(() => {
			if (disabledWhenShown === null && step())
				disabledWhenShown = captureButton()?.disabled ?? null;
		});
		watch.observe(document.body, { childList: true, subtree: true });
		slow.resolve(json({ success: true, record_id: 42, image_ids: [] }));
		await expect.poll(() => step()).not.toBeNull();
		watch.disconnect();
		expect(disabledWhenShown).toBe(true);
		await expect.poll(() => setBodies.length).toBe(1);
		await expect.poll(() => buttonIn(step(), en.cc_continue)?.disabled).toBe(false);
		// The shots were completed on another screen: the next read says so.
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => cardReads.length).toBe(3);
		await expect.poll(() => step()).toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(setBodies.length).toBe(1);
		expect(captures.length).toBe(1);
	});

	it('finding 1: a background read that sampled "needed" before Continue, answering after it, is dropped', async () => {
		const background = deferred<Response>();
		cardAnswers = [
			() => json(cardState()),
			() => background.promise,
			() => json(cardState({ needed: false, reason: null, status: 'present' }))
		];
		render(LivePreview);
		await expect.poll(() => buttonIn(step(), en.cc_continue)?.disabled).toBe(false);
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => cardReads.length).toBe(2);
		buttonIn(step(), en.cc_continue)!.click();
		await expect.poll(() => step()).toBeNull();
		background.resolve(json(cardState({ reason: 'settings_changed' })));
		await background.promise;
		await new Promise<void>((r) => realSetTimeout(r, 0));
		await new Promise<void>((r) => realSetTimeout(r, 0));
		expect(step()).toBeNull();
		expect(setBodies.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
	});

	it('finding 3: a background "needed: null" does not clear the verdict, and the step\'s recovery "needed" keeps it up', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const recovery = deferred<Response>();
		cardAnswers = [
			() => json(cardState()),
			() => recovery.promise,
			() => json(cardState({ needed: null, reason: null }))
		];
		shotAnswer = () => json({ detail: 'Gateway Timeout' }, 504);
		render(LivePreview);
		await expect
			.poll(
				() =>
					step()?.querySelector<HTMLButtonElement>('button[data-cc-take]:not(:disabled)') ?? null
			)
			.not.toBeNull();
		step()!.querySelector<HTMLButtonElement>('button[data-cc-take]:not(:disabled)')!.click();
		// The step's recovery read is out; a background read answers null meanwhile.
		await expect.poll(() => cardReads.length).toBe(2);
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => cardReads.length).toBe(3);
		recovery.resolve(json(cardState({ reason: 'settings_changed', sets: [openSet] })));
		await recovery.promise;
		await new Promise<void>((r) => realSetTimeout(r, 0));
		await new Promise<void>((r) => realSetTimeout(r, 0));
		expect(step()).not.toBeNull();
		expect(step()?.textContent).toContain(en.cc_reason_settings_changed);
		expect(captureButton()?.disabled).toBe(true);
	});

	it('finding 2: a unit read by anyone saying the setting is off removes hold and step at once', async () => {
		render(LivePreview);
		await expect.poll(() => buttonIn(step(), en.cc_continue)?.disabled).toBe(false);
		unitAnswer = () => ({ ...unitBody, colourCardShots: false });
		// As Refocus does when it mounts (watchCaptureChords).
		void reloadUnit();
		await expect.poll(() => step()).toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(cardReads.length).toBe(1);
	});

	it('finding 2 (round 5): an older recovery answer arriving after a newer "not needed" opens no set, and the step goes when its request ends', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const recovery = deferred<Response>();
		cardAnswers = [() => json(cardState()), () => recovery.promise];
		shotAnswer = () => json({ detail: 'Gateway Timeout' }, 504);
		render(LivePreview);
		await expect
			.poll(
				() =>
					step()?.querySelector<HTMLButtonElement>('button[data-cc-take]:not(:disabled)') ?? null
			)
			.not.toBeNull();
		step()!.querySelector<HTMLButtonElement>('button[data-cc-take]:not(:disabled)')!.click();
		await expect.poll(() => cardReads.length).toBe(2);
		// The setting is turned off elsewhere and seen: newer "not needed".
		unitAnswer = () => ({ ...unitBody, colourCardShots: false });
		await reloadUnit();
		// The recovery read, started earlier, says needed with no open set.
		recovery.resolve(json(cardState({ reason: 'settings_changed', sets: [] })));
		await expect.poll(() => step()).toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(setBodies.length).toBe(1);
	});

	it('round 6, 1: a completion acknowledged after a read said "needed" asks again, and the step comes back', async () => {
		let release!: () => void;
		completeGate = new Promise<void>((r) => (release = r));
		cardAnswers = [
			() => json(cardState()),
			() => json(cardState({ reason: 'settings_changed' })),
			() => json(cardState({ reason: 'settings_changed' }))
		];
		render(LivePreview);
		await expect.poll(() => buttonIn(step(), en.cc_continue)?.disabled).toBe(false);
		buttonIn(step(), en.cc_continue)!.click();
		// While the completion is out, the settings change elsewhere and a read says so.
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => cardReads.length).toBe(2);
		release();
		// The completion's "not needed" is followed by a fresh read, which says needed.
		await expect.poll(() => cardReads.length).toBe(3);
		await expect.poll(() => setBodies.length).toBe(2);
		expect(step()).not.toBeNull();
		expect(captureButton()?.disabled).toBe(true);
	});

	it('round 6, 2: a camera settings write that settles after the panel closed asks again', async () => {
		capsBody = { ...capsBody, dslr_settings: true };
		let release!: () => void;
		dslrPutGate = new Promise<void>((r) => (release = r));
		cardAnswers = [
			() => json(cardState({ needed: false, reason: null, status: 'present' })),
			() => json(cardState({ needed: false, reason: null, status: 'present' })),
			() => json(cardState({ reason: 'settings_changed' }))
		];
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		const panel = () => document.querySelector('.sidebar-wrapper');
		buttonIn(panel(), en.cam_panel_expand_aria)!.click();
		const isoButton = () =>
			[...document.querySelectorAll('.control-label')]
				.find((el) => el.textContent === 'ISO')
				?.parentElement?.querySelector<HTMLButtonElement>('.control-btn') ?? null;
		await expect.poll(() => isoButton()).not.toBeNull();
		isoButton()!.click();
		await expect
			.poll(() => document.querySelectorAll('.global-dropdown button').length)
			.toBeGreaterThan(1);
		const option = [
			...document.querySelectorAll<HTMLButtonElement>('.global-dropdown button')
		].find((b) => !b.classList.contains('selected'))!;
		option.click();
		await expect.poll(() => dslrPuts.length).toBe(1);
		buttonIn(panel(), en.cam_panel_collapse)!.click();
		// The check asked on closing reads the old settings.
		await expect.poll(() => cardReads.length).toBe(2);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(step()).toBeNull();
		release();
		await expect.poll(() => cardReads.length).toBe(3);
		await expect.poll(() => step()).not.toBeNull();
	});

	it('the records read fails, the operator chooses a mode, Retry succeeds: the check starts and capture is released', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		recordsFail = true;
		cardAnswers = [() => json(cardState({ needed: false, reason: null, status: 'present' }))];
		render(LivePreview);
		const unread = () => document.querySelector('.lv-records-unread');
		await expect.poll(() => unread()).not.toBeNull();
		const panel = () => document.querySelector('.sidebar-wrapper');
		buttonIn(panel(), en.cam_panel_expand_aria)!.click();
		const single = () =>
			[...(panel()?.querySelectorAll<HTMLLabelElement>('label.radio-label') ?? [])].find((l) =>
				l.textContent?.includes(en.cam_mode_single)
			) ?? null;
		await expect.poll(() => single()).not.toBeNull();
		single()!.click();
		expect(cardReads.length).toBe(0);
		recordsFail = false;
		buttonIn(unread(), en.common_retry)!.click();
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
	});

	it('the setting turned off elsewhere while the step is up: a refused shot removes the step and the preview refresh is enabled again', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		capsBody = { ...capsBody, continuous_preview: false };
		shotAnswer = () =>
			json({ detail: { code: 'colour_card_not_enabled', message: 'English' } }, 409);
		const refresh = () => document.querySelector<HTMLButtonElement>('.refresh-preview-btn');
		render(LivePreview);
		await expect
			.poll(() => step()?.querySelector('button[data-cc-take]:not(:disabled)') ?? null)
			.not.toBeNull();
		step()!.querySelector<HTMLButtonElement>('button[data-cc-take]:not(:disabled)')!.click();
		await expect.poll(() => step()).toBeNull();
		await expect.poll(() => refresh()).not.toBeNull();
		await expect.poll(() => refresh()?.disabled).toBe(false);
	});

	it('a read of the volume that answers after the screen has gone starts nothing', async () => {
		let release!: () => void;
		collectionGate = new Promise<void>((r) => (release = r));
		const screen = render(LivePreview);
		await expect.poll(() => setupAnswered).toBeGreaterThanOrEqual(1);
		await expect.poll(() => unitReads).toBeGreaterThanOrEqual(1);
		screen.unmount();
		const before = unitReads;
		release();
		await collectionGate;
		await new Promise<void>((r) => realSetTimeout(r, 0));
		await new Promise<void>((r) => realSetTimeout(r, 0));
		expect(unitReads).toBe(before);
		expect(cardReads.length).toBe(0);
	});

	it('R4: arriving for a single-mode record, the check waits for the records and opens a single set', async () => {
		current.url = 'http://localhost/live-preview?projectId=2&collectionId=9&recordId=42';
		let release!: () => void;
		recordsGate = new Promise<void>((r) => (release = r));
		recordsBody = [
			{
				id: 42,
				title: 'R',
				status: 'rejected',
				capture_mode: 'single',
				sequence: 1,
				images: []
			}
		];
		render(LivePreview);
		await expect.poll(() => setupAnswered).toBeGreaterThanOrEqual(1);
		await expect.poll(() => unitReads).toBeGreaterThanOrEqual(1);
		expect(cardReads.length).toBe(0);
		release();
		await expect.poll(() => step()).not.toBeNull();
		await expect.poll(() => setBodies.length).toBe(1);
		expect(setBodies[0]).toEqual({ capture_mode: 'single', camera_index: 0 });
	});

	it('an answer "needed" that arrives during a capture opens the step only once the capture has completed', async () => {
		const later = deferred<Response>();
		cardAnswers = [
			() => json(cardState({ needed: false, reason: null, status: 'present' })),
			() => later.promise
		];
		const slow = deferred<Response>();
		capturesAnswer = () => slow.promise;
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => cardReads.length).toBe(2);
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
		// Whether the capture had answered when the step first appeared.
		let answered = false;
		let appearedAfterCapture: boolean | null = null;
		const watch = new MutationObserver(() => {
			if (appearedAfterCapture === null && step()) appearedAfterCapture = answered;
		});
		watch.observe(document.body, { childList: true, subtree: true });
		// The answer's body is read only when the page reads it: once it has
		// been pulled and the page's continuation has run (a task boundary
		// after the read), the answer has been applied.
		let pulled = false;
		const bytes = new TextEncoder().encode(
			JSON.stringify(cardState({ reason: 'settings_changed' }))
		);
		later.resolve(
			new Response(
				new ReadableStream({
					pull(c) {
						pulled = true;
						c.enqueue(bytes);
						c.close();
					}
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		await expect.poll(() => pulled).toBe(true);
		await new Promise<void>((r) => realSetTimeout(r, 0));
		expect(step()).toBeNull();
		recordsBody = [
			{ id: 42, title: 'R', status: 'captured', capture_mode: 'dual', sequence: 1, images: [] }
		];
		answered = true;
		slow.resolve(json({ success: true, record_id: 42, image_ids: [] }));
		await expect.poll(() => step()).not.toBeNull();
		watch.disconnect();
		expect(appearedAfterCapture).toBe(true);
		expect(step()?.textContent).toContain(en.cc_reason_settings_changed);
		// The capture completed as any other: its record is in the strip, and no failure is shown.
		await expect.poll(() => document.querySelectorAll('.thumbnail-item').length).toBe(1);
		expect(get(cameraStatus).captureError).toBe(false);
	});

	it('a re-read asked for while a read is in flight goes out as soon as that read settles', async () => {
		const first = deferred<Response>();
		cardAnswers = [
			() => first.promise,
			() => json(cardState({ needed: false, status: 'present' }))
		];
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		const panel = () => document.querySelector('.sidebar-wrapper');
		buttonIn(panel(), en.cam_panel_expand_aria)!.click();
		await expect.poll(() => buttonIn(panel(), en.cam_panel_collapse)).not.toBeNull();
		buttonIn(panel(), en.cam_panel_collapse)!.click();
		await expect.poll(() => buttonIn(panel(), en.cam_panel_expand_aria)).not.toBeNull();
		buttonIn(panel(), en.cam_panel_expand_aria)!.click();
		await expect.poll(() => buttonIn(panel(), en.cam_panel_collapse)).not.toBeNull();
		buttonIn(panel(), en.cam_panel_collapse)!.click();
		first.resolve(json(cardState({ needed: false, status: 'present' })));
		// Two requests during the read: one more read, at once.
		await expect.poll(() => cardReads.length).toBe(2);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(cardReads.length).toBe(2);
	});

	it('the setting turned on from another browser: a re-read point reads the unit afresh, then asks', async () => {
		let on = false;
		unitAnswer = () => ({ ...unitBody, colourCardShots: on });
		cardAnswers = [() => json(cardState({ reason: 'start' }))];
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
		expect(cardReads.length).toBe(0);
		const before = unitReads;
		on = true;
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => step()).not.toBeNull();
		expect(unitReads).toBeGreaterThan(before);
		expect(cardReads.length).toBeGreaterThanOrEqual(1);
		expect(cardReads.every((q) => q === '?read_cameras=1')).toBe(true);
	});

	it('a unit read that fails keeps the last known setting and does not hold capture', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		let fail = false;
		unitAnswer = () => {
			if (fail) throw new Error('down');
			return { ...unitBody, colourCardShots: false };
		};
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		fail = true;
		const before = unitReads;
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => unitReads).toBeGreaterThan(before);
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
		expect(cardReads.length).toBe(0);
	});

	for (const [what, body] of [
		['a camera that could not be read (needed null)', cardState({ needed: null, reason: null })],
		['the volume not asked (enabled false)', cardState({ enabled: false, needed: false })]
	] as const) {
		it(`${what}: no step, and the capture key captures`, async () => {
			cardAnswers = [() => json(body)];
			render(LivePreview);
			await expect.poll(() => cardReads.length).toBe(1);
			await expect.poll(() => captureButton()?.disabled).toBe(false);
			press(' ', 'Space');
			await expect.poll(() => captures.length).toBe(1);
			expect(step()).toBeNull();
		});
	}

	it('a read that fails holds nothing and opens nothing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		cardAnswers = [() => json({ detail: 'boom' }, 500)];
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
		expect(step()).toBeNull();
	});

	for (const [what, arrange] of [
		[
			'the unit setting off',
			() => {
				unitBody = { ...unitBody, colourCardShots: false };
			}
		],
		[
			'a testing volume',
			() => {
				collectionBody = { ...collectionBody, testing: true };
			}
		],
		['the testing account', () => signIn('testing')]
	] as const) {
		it(`${what}: nothing is read, and the capture key captures`, async () => {
			arrange();
			render(LivePreview);
			await expect.poll(() => captureButton()?.disabled).toBe(false);
			press(' ', 'Space');
			await expect.poll(() => captures.length).toBe(1);
			expect(cardReads.length).toBe(0);
			expect(step()).toBeNull();
		});
	}

	it('the camera check closing reads again, and settings changed open the step', async () => {
		cardAnswers = [
			() => json(cardState({ needed: false, reason: null, status: 'present' })),
			() => json(cardState({ reason: 'settings_changed' }))
		];
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(step()).toBeNull();
		buttonIn(document.querySelector('.topbar'), en.camcheck_open)!.click();
		await expect.poll(() => checkView()).not.toBeNull();
		await expect.poll(() => buttonIn(checkView(), en.camcheck_back)).not.toBeNull();
		buttonIn(checkView(), en.camcheck_back)!.click();
		await expect.poll(() => step()).not.toBeNull();
		expect(cardReads).toEqual(['?read_cameras=1', '?read_cameras=1']);
		expect(step()?.textContent).toContain(en.cc_reason_settings_changed);
		expect(captureButton()?.disabled).toBe(true);
	});

	it('the tab coming back reads again', async () => {
		cardAnswers = [
			() => json(cardState({ needed: false, reason: null, status: 'present' })),
			() => json(cardState({ reason: 'settings_changed' }))
		];
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => step()).not.toBeNull();
		expect(cardReads.length).toBe(2);
	});

	it('closing the camera panel reads again', async () => {
		cardAnswers = [
			() => json(cardState({ needed: false, reason: null, status: 'present' })),
			() => json(cardState({ reason: 'settings_changed' }))
		];
		render(LivePreview);
		await expect.poll(() => cardReads.length).toBe(1);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		buttonIn(document.querySelector('.sidebar-wrapper'), en.cam_panel_expand_aria)!.click();
		await expect
			.poll(() => buttonIn(document.querySelector('.sidebar-wrapper'), en.cam_panel_collapse))
			.not.toBeNull();
		buttonIn(document.querySelector('.sidebar-wrapper'), en.cam_panel_collapse)!.click();
		await expect.poll(() => step()).not.toBeNull();
		expect(cardReads.length).toBe(2);
	});
});

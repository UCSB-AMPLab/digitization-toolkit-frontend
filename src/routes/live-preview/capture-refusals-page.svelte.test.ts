// The capture screen's answer to the backend's two capture refusals (NEH-427,
// NEH-425). A page capture, a retake and "Capture another here" can each be
// refused with 409 `camera_setup_needed` (the cameras' pages are not set, or
// `reasons` exactly ["camera_list_unreadable"] when the backend could not list
// the cameras) or 409 `colour_card_pending` (a new page while the volume's
// colour card shots are due). The screen shows the catalogue's message for
// the code, never the backend's English, and reads again the state that the
// refusal names: the camera set-up, so the camera step opens; the colour card
// state, so the colour card step opens. A camera list that could not be read
// is read again by nothing. Every request is answered by a fetch mock keyed
// on the path.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const current = vi.hoisted(() => ({ url: '' }));
const BASE_URL = 'http://localhost/live-preview?projectId=2&collectionId=9';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL(current.url) });
			return () => {};
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { cameraStatus } from '$lib/stores/cameras';
import { recordFocusActivity } from '$lib/focus-check';
import { clearChord } from '$lib/capture-key';
import { resetUnit } from '$lib/unit-mode';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

type Img = {
	id: number;
	record_id: number;
	filename: string;
	file_path: string;
	format: string;
	role: string;
	is_current: boolean;
};
type Rec = {
	id: number;
	title: string;
	status: string;
	sequence: number;
	capture_mode: string;
	collection_id: number;
	images: Img[];
	missing_side: string | null;
	missing_expected: string | null;
	missing_note: string | null;
	missing_request_id: string | null;
	closed_reason: string | null;
	closed_note: string | null;
};

function img(id: number, recordId: number, role: string): Img {
	return {
		id,
		record_id: recordId,
		filename: `${id}.jpg`,
		file_path: `/${id}`,
		format: 'jpg',
		role,
		is_current: true
	};
}

function rec(id: number, sequence: number, mode: 'dual' | 'single'): Rec {
	return {
		id,
		title: `Par ${sequence}`,
		status: 'captured',
		sequence,
		capture_mode: mode,
		collection_id: 9,
		images:
			mode === 'dual'
				? [img(id * 10, id, 'left'), img(id * 10 + 1, id, 'right')]
				: [img(id * 10, id, 'single')],
		missing_side: null,
		missing_expected: null,
		missing_note: null,
		missing_request_id: null,
		closed_reason: null,
		closed_note: null
	};
}

function placeholder(id: number, sequence: number): Rec {
	return {
		...rec(id, sequence, 'dual'),
		images: [],
		missing_side: 'both',
		missing_expected: 'Folios 90v y 91r',
		missing_note: null
	};
}

const NOT_NEEDED = { needs_setup: false, reasons: [], confirmed_pair: { left: 'a', right: 'b' } };
const SETUP_NEEDED = {
	needs_setup: true,
	reasons: [{ code: 'role_unconfirmed', message: 'English', hardware_ids: ['b'] }],
	confirmed_pair: null
};
const CARD_DONE = { enabled: true, needed: false, reason: null, status: 'present', sets: [] };
const CARD_PENDING = { enabled: true, needed: true, reason: 'start', status: 'none', sets: [] };
const OPEN_SET = {
	id: 5,
	number: 1,
	outcome: null,
	capture_mode: 'dual',
	cameras: [{ camera_index: 0 }, { camera_index: 1 }],
	shots: []
};

// The two refusals, as app/api/cameras.py and app/core/colour_card.py send them.
const REFUSALS = {
	setup: {
		code: 'camera_setup_needed',
		message:
			"The cameras' pages are not set. Confirm which page each camera photographs, then capture.",
		reasons: ['role_unconfirmed']
	},
	unreadable: {
		code: 'camera_setup_needed',
		message:
			'Captua could not read the camera list to check which page each camera photographs. Reload the camera list, then capture.',
		reasons: ['camera_list_unreadable']
	},
	card: {
		code: 'colour_card_pending',
		message: 'English',
		reason: 'start'
	}
};

const served = {
	records: [] as Rec[],
	captures: [] as { path: string; body: Record<string, unknown> }[],
	nextId: 600,
	// The next capture is refused with this detail.
	failNext: null as null | Record<string, unknown>,
	// While true, every capture is refused with failNext, not only the next.
	refuseAll: false,
	setup: NOT_NEEDED as Record<string, unknown>,
	setupReads: 0,
	card: CARD_DONE as Record<string, unknown>,
	cardReads: 0
};

function serve() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(String(input), 'http://localhost');
		const path = url.pathname;
		const method = (init as RequestInit | undefined)?.method ?? 'GET';
		if (path.endsWith('/system/unit'))
			return json({
				mode: 'offline',
				projectsEnabled: true,
				projectsShown: true,
				defaultProjectId: null,
				prerequisites: { backup: [], fisqua: [] },
				colourCardShots: true
			});
		if (path.endsWith('/cameras/setup')) {
			served.setupReads++;
			return json(served.setup);
		}
		if (path.endsWith('/cameras/roles') && method === 'PUT')
			return json({ devices: [], setup: NOT_NEEDED });
		if (path.endsWith('/colour-card/sets') && method === 'POST') return json(OPEN_SET);
		if (path.endsWith('/colour-card/skip') && method === 'POST')
			return json({ ...OPEN_SET, outcome: 'skipped' });
		if (path.endsWith('/colour-card') && method === 'GET') {
			served.cardReads++;
			return json(served.card);
		}
		if (path.endsWith('/cameras/capabilities'))
			return json({ backend: 'gphoto2', live_preview: true, dslr_settings: false });
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
		if (path.endsWith('/records/to-retake/summary'))
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (/\/records\/\d+\/rejections$/.test(path)) return json([]);
		if (path.endsWith('/collections/9'))
			return json({
				id: 9,
				name: 'Tomo 17',
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: 'co-ahr-not-t017',
				custom_attributes: null
			});
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/records/')) return json(served.records);
		if (path.endsWith('/cameras/capture') || path.endsWith('/cameras/capture/dual')) {
			const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
			served.captures.push({ path, body });
			if (served.failNext !== null) {
				const detail = served.failNext;
				if (!served.refuseAll) served.failNext = null;
				return json({ detail }, 409);
			}
			const mode = path.endsWith('/dual') ? 'dual' : 'single';
			if (typeof body.record_id === 'number') {
				const target = served.records.find((r) => r.id === body.record_id)!;
				const fresh = rec(target.id, target.sequence, mode);
				target.images = fresh.images.map((i) => ({ ...i, id: i.id + 1000 }));
				target.missing_side = null;
				return json({
					success: true,
					record_id: target.id,
					image_ids: target.images.map((i) => i.id)
				});
			}
			const id = served.nextId++;
			let seq = Math.max(0, ...served.records.map((r) => r.sequence)) + 1;
			let at = served.records.length;
			if (typeof body.afterRecordId === 'number') {
				at = served.records.findIndex((r) => r.id === body.afterRecordId) + 1;
				seq = served.records[at - 1].sequence + 1;
				for (const r of served.records) if (r.sequence >= seq) r.sequence++;
			}
			const added = rec(id, seq, mode);
			served.records.splice(at, 0, added);
			return json({ success: true, record_id: id, image_ids: added.images.map((i) => i.id) });
		}
		return json([]);
	});
}

beforeEach(() => {
	locale.set('en');
	current.url = BASE_URL;
	served.records = [rec(41, 95, 'dual'), rec(43, 97, 'dual')];
	served.captures = [];
	served.nextId = 600;
	served.failNext = null;
	served.refuseAll = false;
	served.setup = NOT_NEEDED;
	served.setupReads = 0;
	served.card = CARD_DONE;
	served.cardReads = 0;
	localStorage.clear();
	clearChord();
	resetUnit();
	cameraStatus.reportSuccess();
	authStore.setSession({
		id: 1,
		username: 'operator',
		email: null,
		role: 'operator',
		is_active: true
	});
	recordFocusActivity(1, Date.now() + 60 * 60 * 1000);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	localStorage.clear();
	cameraStatus.reportSuccess();
	document.querySelectorAll('[data-colour-card]').forEach((n) => n.remove());
});

function words(el: Element): string {
	const copy = el.cloneNode(true) as HTMLElement;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return copy.textContent?.trim() ?? '';
}
const buttonIn = (root: ParentNode | null, name: string) =>
	[...(root?.querySelectorAll('button') ?? [])].find(
		(b) => words(b) === name || b.getAttribute('aria-label') === name
	) as HTMLButtonElement | undefined;
const captureButton = () => document.querySelector('button.capture-btn') as HTMLButtonElement;
const banner = () => {
	const el = document.querySelector('.capture-error-banner');
	return el ? words(el) : '';
};
const whichStep = () => document.querySelector('[data-which-camera]') as HTMLElement | null;
const cardStep = () => document.querySelector('[data-colour-card]') as HTMLElement | null;
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? '';
const viewportArea = () => document.querySelector('.camera-viewport')?.parentElement ?? null;
const confirmBox = () => document.querySelector('.retake-last-confirm') as HTMLElement | null;
// Lets the screen act on an answer: enough for a read it would start to be sent.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

async function screenReady() {
	await vi.waitFor(() => expect(captureButton()?.disabled).toBe(false));
}

// Each refusal: the message shown, and which step the re-read opens (none
// for the camera list that could not be read).
const CASES = [
	{
		what: 'cameras whose pages are not set',
		detail: REFUSALS.setup,
		text: () => en.camwhich_needed,
		opens: 'camera step'
	},
	{
		what: 'a camera list that could not be read',
		detail: REFUSALS.unreadable,
		text: (single: boolean) => en.lv_capture_camera_list_unreadable(single),
		opens: null
	},
	{
		what: 'colour card shots pending',
		detail: REFUSALS.card,
		text: () => en.cc_needed,
		opens: 'colour card step'
	}
] as const;

// What the backend answers to the re-read the refusal asks for. Every
// capture from then on is refused the same way.
function arm(detail: Record<string, unknown>) {
	served.failNext = detail;
	served.refuseAll = true;
	served.setup = SETUP_NEEDED;
	served.card = CARD_PENDING;
}

async function expectReread(
	opens: (typeof CASES)[number]['opens'],
	setupBefore: number,
	cardBefore: number
) {
	if (opens === 'camera step') {
		await vi.waitFor(() => expect(whichStep()).not.toBeNull());
		expect(served.setupReads).toBeGreaterThan(setupBefore);
		expect(cardStep()).toBeNull();
	} else if (opens === 'colour card step') {
		await vi.waitFor(() => expect(cardStep()).not.toBeNull());
		expect(served.cardReads).toBeGreaterThan(cardBefore);
		expect(served.setupReads).toBe(setupBefore);
		expect(whichStep()).toBeNull();
	} else {
		await settle();
		expect(served.setupReads).toBe(setupBefore);
		expect(served.cardReads).toBe(cardBefore);
		expect(whichStep()).toBeNull();
		expect(cardStep()).toBeNull();
	}
}

// The operator completes the step the re-read opened (saves the roles, or
// skips the colour card shots), with every capture still refused: the
// screen sends no capture by itself, then or after.
async function completeRecovery(opens: (typeof CASES)[number]['opens']) {
	const sent = served.captures.length;
	if (opens === 'camera step') {
		served.setup = NOT_NEEDED;
		const pick = () =>
			whichStep()?.querySelector<HTMLButtonElement>('[data-card="0"] button[data-pick]') ?? null;
		await vi.waitFor(() => expect(pick()).not.toBeNull());
		pick()!.click();
		await vi.waitFor(() =>
			expect(buttonIn(whichStep(), en.camwhich_confirm)?.disabled).toBe(false)
		);
		buttonIn(whichStep(), en.camwhich_confirm)!.click();
		await vi.waitFor(() => expect(whichStep()).toBeNull());
	} else if (opens === 'colour card step') {
		served.card = CARD_DONE;
		await vi.waitFor(() => expect(buttonIn(cardStep(), en.cc_skip)?.disabled).toBe(false));
		buttonIn(cardStep(), en.cc_skip)!.click();
		await vi.waitFor(() => expect(buttonIn(document, en.cc_skip_confirm)).toBeTruthy());
		buttonIn(document, en.cc_skip_confirm)!.click();
		await vi.waitFor(() => expect(cardStep()).toBeNull());
	}
	await settle();
	await settle();
	expect(served.captures).toHaveLength(sent);
}

describe('capture screen: a page capture refused (NEH-427, NEH-425)', () => {
	for (const { what, detail, text } of CASES) {
		for (const single of [false, true]) {
			it(`${what}, ${single ? 'single' : 'dual'} mode: the catalogue's message`, async () => {
				if (single) served.records = [rec(41, 95, 'single'), rec(43, 97, 'single')];
				serve();
				render(LivePreview);
				await screenReady();
				served.failNext = detail;
				captureButton().click();
				await vi.waitFor(() => expect(banner()).toBe(text(single)));
				expect(served.captures).toHaveLength(1);
				expect(served.captures[0].path.endsWith('/dual')).toBe(!single);
				expect(document.body.textContent).not.toContain(detail.message);
			});
		}
	}
});

describe('capture screen: a page capture refused, the state read again (NEH-427, NEH-425)', () => {
	for (const { what, detail, text, opens } of CASES) {
		it(`${what}: ${opens ?? 'nothing'} read again`, async () => {
			serve();
			render(LivePreview);
			await screenReady();
			await settle();
			const setupBefore = served.setupReads;
			const cardBefore = served.cardReads;
			arm(detail);
			captureButton().click();
			await vi.waitFor(() => expect(banner()).toBe(text(false)));
			expect(served.captures).toHaveLength(1);
			await expectReread(opens, setupBefore, cardBefore);
			await completeRecovery(opens);
		});
	}
});

describe('capture screen: a retake refused (NEH-427)', () => {
	// The backend never refuses a retake for the colour card (app/api/cameras.py).
	for (const { what, detail, text, opens } of CASES.filter((c) => c.detail !== REFUSALS.card)) {
		it(`${what}: the catalogue's message, and ${opens ?? 'nothing'} read again`, async () => {
			serve();
			render(LivePreview);
			await screenReady();
			captureButton().click();
			await vi.waitFor(() => expect(served.captures).toHaveLength(1));
			await vi.waitFor(() =>
				expect(buttonIn(viewportArea(), en.lv_retake_last(false))?.disabled).toBe(false)
			);
			buttonIn(viewportArea(), en.lv_retake_last(false))!.click();
			await vi.waitFor(() => expect(confirmBox()).not.toBeNull());
			await settle();
			const setupBefore = served.setupReads;
			const cardBefore = served.cardReads;
			arm(detail);
			buttonIn(confirmBox(), en.common_confirm)!.click();
			await vi.waitFor(() => expect(banner()).toBe(text(false)));
			expect(served.captures).toHaveLength(2);
			expect(served.captures[1].body.record_id).toBe(600);
			await expectReread(opens, setupBefore, cardBefore);
			await completeRecovery(opens);
		});
	}
});

describe('capture screen: "Capture another here" refused (NEH-427, NEH-425)', () => {
	for (const { what, detail, text, opens } of CASES) {
		it(`${what}: the catalogue's message, and ${opens ?? 'nothing'} read again`, async () => {
			current.url = `${BASE_URL}&recordId=42`;
			served.records = [rec(41, 95, 'dual'), placeholder(42, 96), rec(43, 97, 'dual')];
			serve();
			const screen = render(LivePreview);
			const dialog = screen.getByRole('dialog');
			await dialog.getByRole('button', { name: en.retakes_capture, exact: true }).click();
			await expect.element(dialog.getByText(en.cap_another_q(null))).toBeVisible();
			await settle();
			const setupBefore = served.setupReads;
			const cardBefore = served.cardReads;
			arm(detail);
			buttonIn(document.querySelector('[role="dialog"]'), en.cap_another)!.click();
			await vi.waitFor(() => expect(dialogText()).toContain(text(false)));
			expect(served.captures).toHaveLength(2);
			expect(served.captures[1].body.afterRecordId).toBe(42);
			await expectReread(opens, setupBefore, cardBefore);
			await completeRecovery(opens);
		});
	}
});

describe('capture screen: a retake of a single-camera record on a two-camera unit refused (NEH-427)', () => {
	it('a camera list that could not be read: the single-camera message, from the single endpoint', async () => {
		served.records = [rec(60, 1, 'single'), rec(50, 2, 'dual')];
		serve();
		render(LivePreview);
		await screenReady();
		const thumbOf = (title: string) =>
			[...document.querySelectorAll<HTMLButtonElement>('.thumbnail-item')].find((b) =>
				b.getAttribute('aria-label')?.includes(title)
			);
		const dialogButton = (name: string) =>
			[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
				(b) => b.textContent?.trim().endsWith(name) && !b.disabled
			);
		await vi.waitFor(() => expect(thumbOf('Par 1')?.disabled).toBe(false));
		thumbOf('Par 1')!.click();
		await vi.waitFor(() => expect(dialogButton(en.lvm_retake)).toBeTruthy());
		dialogButton(en.lvm_retake)!.click();
		await vi.waitFor(() => expect(dialogButton(en.common_confirm)).toBeTruthy());
		served.failNext = REFUSALS.unreadable;
		dialogButton(en.common_confirm)!.click();
		await vi.waitFor(() =>
			expect(dialogText()).toContain(en.lv_capture_camera_list_unreadable(true))
		);
		expect(dialogText()).not.toContain(en.lv_capture_camera_list_unreadable(false));
		expect(served.captures).toHaveLength(1);
		expect(served.captures[0].path.endsWith('/cameras/capture')).toBe(true);
		expect(served.captures[0].body.record_id).toBe(60);
	});
});

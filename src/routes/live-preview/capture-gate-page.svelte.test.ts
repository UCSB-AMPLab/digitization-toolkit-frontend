// NEH-381, the capture screen as a whole:
// - what the screen knows the server holds: a capture the backend confirmed
//   counts as known even when the read of the records after it failed, so a
//   later capture that ends in a timeout is not "found" in it;
// - one gate for starting a capture: while a capture is in flight or being
//   checked, no entry point sends another and no thumbnail opens or
//   replaces the image window;
// - a request and a read belong to the volume they began in, and the
//   still-working timer writes nothing once the screen has gone.
// Every request is answered by a fetch mock keyed on the path; the page's
// URL is a store the tests can change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { tick } from 'svelte';
import { get } from 'svelte/store';

const current = vi.hoisted(() => {
	const subs = new Set<(v: { url: URL }) => void>();
	return {
		url: '',
		subs,
		set(url: string) {
			this.url = url;
			for (const run of subs) run({ url: new URL(url) });
		}
	};
});
const BASE_URL = 'http://localhost/live-preview?projectId=2&collectionId=9';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL(current.url) });
			current.subs.add(run);
			return () => current.subs.delete(run);
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { cameraStatus } from '$lib/stores/cameras';
import { recordFocusActivity } from '$lib/focus-check';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import '../../app.css';
import LivePreview from './+page.svelte';

const realSetTimeout = globalThis.setTimeout.bind(globalThis);

async function settle() {
	for (let i = 0; i < 6; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 10));
	}
}

async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
	await settle();
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function gatewayTimeout() {
	return new Response('<html><head><title>504 Gateway Time-out</title></head></html>', {
		status: 504,
		headers: { 'Content-Type': 'text/html' }
	});
}

type Img = { id: number; record_id: number; filename: string; file_path: string; format: string; role: string; is_current: boolean };
type Rec = {
	id: number; title: string; status: string; sequence: number; capture_mode: string; collection_id: number; images: Img[];
	missing_side: string | null; missing_expected: string | null; missing_note: string | null;
	missing_request_id: string | null; closed_reason: string | null; closed_note: string | null;
};

function img(id: number, recordId: number, role: string): Img {
	return { id, record_id: recordId, filename: `${id}.jpg`, file_path: `/${id}`, format: 'jpg', role, is_current: true };
}

function pair(id: number, sequence: number): Rec {
	return {
		id, title: `Par ${sequence}`, status: 'captured', sequence, capture_mode: 'dual', collection_id: 9,
		images: [img(id * 10, id, 'left'), img(id * 10 + 1, id, 'right')],
		missing_side: null, missing_expected: null, missing_note: null, missing_request_id: null, closed_reason: null, closed_note: null
	};
}

const served = {
	records: [] as Rec[],
	// The records of volume 10.
	records10: [] as Rec[],
	captures: [] as { path: string; body: Record<string, unknown> }[],
	held: null as null | Promise<Response>,
	// The next records reads answer through these, once each, in order.
	recordsNext: [] as (() => Promise<Response>)[],
	recordReads: 0,
	capabilities: {} as Record<string, unknown>
};

function holdNextCapture() {
	let answer!: (r: Response) => void;
	served.held = new Promise((r) => (answer = r));
	return answer;
}

// What the backend commits for a new capture at the end of the volume.
function appendPair(id: number): Rec {
	const r = pair(id, Math.max(0, ...served.records.map((x) => x.sequence)) + 1);
	served.records.push(r);
	return r;
}

function serve() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(String(input), 'http://localhost');
		const path = url.pathname;
		if (path.endsWith('/records/to-retake/summary')) return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (/\/records\/\d+\/rejections$/.test(path)) return json([]);
		if (/\/collections\/\d+$/.test(path)) {
			const id = Number(path.split('/').pop());
			return json({ id, name: `Tomo ${id}`, project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: `stem-${id}`, custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/cameras/capabilities')) return json(served.capabilities);
		if (path.endsWith('/records/')) {
			served.recordReads++;
			const next = served.recordsNext.shift();
			if (next) return next();
			return json(url.searchParams.get('collection_id') === '10' ? served.records10 : served.records);
		}
		if (path.endsWith('/cameras/capture') || path.endsWith('/cameras/capture/dual')) {
			const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
			served.captures.push({ path, body });
			const held = served.held;
			if (held) {
				served.held = null;
				return held;
			}
			if (typeof body.record_id === 'number') {
				const target = served.records.find((r) => r.id === body.record_id)!;
				const base = target.id * 100 + served.captures.length * 2;
				target.images = [img(base, target.id, 'left'), img(base + 1, target.id, 'right')];
				return json({ success: true, record_id: target.id, image_ids: [base, base + 1] });
			}
			const added = appendPair(600 + served.captures.length);
			return json({ success: true, record_id: added.id, image_ids: added.images.map((i) => i.id) });
		}
		return json([]);
	});
}

beforeEach(() => {
	locale.set('es');
	current.url = BASE_URL;
	current.subs.clear();
	served.records = [pair(41, 95), pair(43, 97)];
	served.records10 = [{ ...pair(81, 1), collection_id: 10, title: 'Folio 1' }];
	served.captures = [];
	served.held = null;
	served.recordsNext = [];
	served.recordReads = 0;
	served.capabilities = {};
	cameraStatus.reportSuccess();
	authStore.setSession({ id: 1, username: 'operator', email: null, role: 'operator', is_active: true });
	// No automatic focus check on opening the screen.
	recordFocusActivity(1, Date.now() + 60 * 60 * 1000);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	authStore.clearSession();
	cameraStatus.reportSuccess();
});

function words(el: Element): string {
	const copy = el.cloneNode(true) as HTMLElement;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return copy.textContent?.trim() ?? '';
}
const dialogs = () => [...document.querySelectorAll('[role="dialog"]')] as HTMLElement[];
const dialogText = () => dialogs().map((d) => d.textContent ?? '').join(' ');
const buttonIn = (root: ParentNode | null, name: string) =>
	[...(root?.querySelectorAll('button') ?? [])].find((b) => words(b) === name || b.getAttribute('aria-label') === name) as
		| HTMLButtonElement
		| undefined;
const thumb = (title: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('.thumbnail-item')].find((b) => b.textContent?.includes(title));
const captureButton = () => document.querySelector('button.capture-btn') as HTMLButtonElement;
const press = () => {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
	window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
};
const viewerTitle = () => document.querySelector('.img-viewer-title')?.textContent?.trim() ?? '';
const stripSources = () => [...document.querySelectorAll('.thumbnail-item img')].map((i) => i.getAttribute('src') ?? '');

async function screenReady() {
	await vi.waitFor(() => expect(thumb('Par 97')).toBeTruthy());
	await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
}

// A retake of record 41 whose request ends in nginx's 504 at 120 s: the page is checking.
async function retakeTimedOut(screen: ReturnType<typeof render>) {
	thumb('Par 95')!.click();
	const dialog = screen.getByRole('dialog');
	await dialog.getByRole('button', { name: es.lvm_retake }).click();
	await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	const answer = holdNextCapture();
	buttonIn(document, es.common_confirm)!.click();
	await settle();
	await advance(120_000);
	answer(gatewayTimeout());
	await settle();
	expect(dialogText()).toContain(es.lv_capture_maybe_saved);
}

// A capture from the viewport whose request ends in nginx's 504 at 120 s.
async function viewportCaptureTimedOut() {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
	const answer = holdNextCapture();
	press();
	await settle();
	await advance(120_000);
	answer(gatewayTimeout());
	await settle();
	expect(document.querySelector('.capture-note-banner')?.textContent).toContain(es.lv_capture_maybe_saved);
}

describe('capture screen: what the screen knows the server holds (NEH-381)', () => {
	it('a capture confirmed while its records read failed is not taken for the next capture that times out', async () => {
		serve();
		render(LivePreview);
		await screenReady();

		// Capture A succeeds; the read of the records after it fails.
		served.recordsNext = [async () => json({ detail: 'down' }, 500)];
		press();
		await vi.waitFor(() => expect(served.captures).toHaveLength(1));
		await vi.waitFor(() => expect(served.recordReads).toBeGreaterThanOrEqual(2));
		await settle();
		const a = served.records[served.records.length - 1];
		expect(stripSources().some((src) => src.includes(`/records/images/${a.images[0].id}/`))).toBe(false);

		// Capture B times out; the first read shows A, not B.
		await viewportCaptureTimedOut();
		await advance(5_000);
		expect(document.querySelector('.capture-note-banner')?.textContent).toContain(es.lv_capture_maybe_saved);
		expect(captureButton().disabled).toBe(true);

		// B is stored: the next read finds it.
		appendPair(700);
		await advance(5_000);
		expect(document.querySelector('.capture-note-banner')?.textContent).toContain(es.lv_capture_found);
		expect(captureButton().disabled).toBe(false);
		expect(served.captures).toHaveLength(2);
	});
});

// Every way the capture screen can send a capture request, or open a dialog
// that sends one. The last test in this file reads the sources and fails
// when a call to camerasApi.capture, captureDual or testCapture is added or
// moved without being listed here.
const ENTRY_POINTS = {
	'LiveViewport.svelte': ['the capture button', 'the capture key and pedal'],
	'+page.svelte': ['Retake and Confirm in the image window', 'Capture in a placeholder', 'Capture another here'],
	'CameraCheck.svelte': ['Check cameras (its test captures)'],
	'RefocusModal.svelte': ['Refocus (its test captures)']
} as const;

describe('capture screen: one gate for starting a capture (NEH-381)', () => {
	it('during the check of a timed-out retake, a thumbnail cannot replace the image window, by pointer or keyboard', async () => {
		serve();
		const screen = render(LivePreview);
		await screenReady();
		await retakeTimedOut(screen);

		const other = thumb('Par 97')!;
		other.click();
		other.focus();
		other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await settle();
		// No button of any window can send another capture.
		for (const name of [es.lvm_retake, es.common_confirm, es.retakes_capture, es.cap_another]) {
			const b = buttonIn(document, name);
			if (b) {
				b.click();
				await settle();
			}
		}
		expect(served.captures).toHaveLength(1);
		expect(viewerTitle()).toBe('Par 95');
		expect(dialogs()).toHaveLength(1);
		expect(other.disabled).toBe(true);
		expect(document.activeElement).not.toBe(other);
	});

	it('during the check of a timed-out retake, every entry point is refused', async () => {
		served.capabilities = { dslr_settings: true };
		serve();
		const screen = render(LivePreview);
		await screenReady();
		await retakeTimedOut(screen);

		// The capture button and the capture key.
		captureButton().click();
		press();
		await settle();
		// Check cameras and Refocus open nothing.
		buttonIn(document, es.camcheck_open)?.click();
		buttonIn(document, es.focus_refocus)?.click();
		await settle();
		expect(dialogs()).toHaveLength(1);
		expect(served.captures).toHaveLength(1);
		expect(Object.values(ENTRY_POINTS).flat()).toHaveLength(7);
	});

	it('during the check of a timed-out viewport capture, every entry point is refused', async () => {
		served.capabilities = { dslr_settings: true };
		serve();
		render(LivePreview);
		await screenReady();
		await viewportCaptureTimedOut();

		captureButton().click();
		press();
		// A thumbnail opens no image window, so neither Retake nor a placeholder's Capture is reachable.
		thumb('Par 95')!.click();
		await settle();
		expect(dialogs()).toHaveLength(0);
		expect(thumb('Par 95')!.disabled).toBe(true);
		buttonIn(document, es.camcheck_open)?.click();
		buttonIn(document, es.focus_refocus)?.click();
		await settle();
		expect(dialogs()).toHaveLength(0);
		expect(served.captures).toHaveLength(1);
	});

	it('the list of entry points names every capture request the capture screen can send', () => {
		const sources = import.meta.glob('./*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
		const calls: Record<string, number> = {};
		for (const [path, source] of Object.entries(sources)) {
			const n = (source.match(/camerasApi\.(capture|captureDual|testCapture)\(/g) ?? []).length;
			if (n > 0) calls[path.replace('./', '')] = n;
		}
		expect(Object.keys(calls).sort()).toEqual(Object.keys(ENTRY_POINTS).sort());
		// LiveViewport: single and dual; the page: the retake's two and Capture another here.
		expect(calls).toEqual({ 'LiveViewport.svelte': 2, '+page.svelte': 3, 'CameraCheck.svelte': 1, 'RefocusModal.svelte': 1 });
	});
});

describe('capture screen: a request and a read belong to the volume they began in (NEH-381)', () => {
	it('another volume while a retake is pending: its timeout starts no check and locks nothing', async () => {
		serve();
		const screen = render(LivePreview);
		await screenReady();
		thumb('Par 95')!.click();
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const answer = holdNextCapture();
		buttonIn(document, es.common_confirm)!.click();
		await settle();
		await advance(60_000);

		current.set('http://localhost/live-preview?projectId=2&collectionId=10');
		await settle();
		await advance(60_000);
		answer(gatewayTimeout());
		await settle();
		const reads = served.recordReads;
		expect(dialogText()).not.toContain(es.lv_capture_maybe_saved);
		expect(document.querySelector('.capture-note-banner')).toBeNull();
		await advance(30_000);
		expect(served.recordReads).toBe(reads);
		// The new volume's records are on screen, and nothing is locked.
		expect(thumb('Par 97')).toBeUndefined();
		expect(thumb('Folio 1')?.disabled).toBe(false);
		expect(captureButton().disabled).toBe(false);
	});

	it("an aborted check's late read of the old volume is not put on screen", async () => {
		serve();
		const screen = render(LivePreview);
		await screenReady();
		await retakeTimedOut(screen);

		// The first read of the check stays unanswered; the volume changes meanwhile.
		let answerRead!: () => void;
		served.recordsNext = [() => new Promise<Response>((r) => (answerRead = () => r(json(served.records))))];
		await advance(5_000);
		current.set('http://localhost/live-preview?projectId=2&collectionId=10');
		await settle();
		// The backend stored the retake meanwhile; the late answer carries it.
		const target = served.records.find((r) => r.id === 41)!;
		target.images = [img(9990, 41, 'left'), img(9991, 41, 'right')];
		answerRead();
		await settle();
		expect(stripSources().some((src) => src.includes('/records/images/9990/'))).toBe(false);
	});

	it('the screen gone before 10 s: the still-working timer writes nothing into the shared camera status', async () => {
		serve();
		const screen = render(LivePreview);
		await screenReady();
		thumb('Par 95')!.click();
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		holdNextCapture();
		buttonIn(document, es.common_confirm)!.click();
		await settle();
		await advance(5_000);
		screen.unmount();
		await settle();
		await advance(10_000);
		expect(get(cameraStatus).notice).toBeNull();
	});
});

describe('capture screen: no capture before the volume has been read (NEH-381)', () => {
	it('while the first read of the records is pending, neither the button nor the key sends a capture', async () => {
		let answerRead!: () => void;
		served.recordsNext = [() => new Promise<Response>((r) => (answerRead = () => r(json(served.records))))];
		serve();
		render(LivePreview);
		await vi.waitFor(() => expect(served.recordReads).toBe(1));
		await settle();
		expect(captureButton().disabled).toBe(true);
		captureButton().click();
		press();
		await settle();
		expect(served.captures).toHaveLength(0);

		answerRead();
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		press();
		await vi.waitFor(() => expect(served.captures).toHaveLength(1));
	});

	it('when the first read of the records failed, no capture can be sent', async () => {
		served.recordsNext = [async () => json({ detail: 'down' }, 500)];
		serve();
		render(LivePreview);
		await vi.waitFor(() => expect(served.recordReads).toBe(1));
		await settle();
		await settle();
		expect(captureButton().disabled).toBe(true);
		press();
		await settle();
		expect(served.captures).toHaveLength(0);
	});

	it('an empty volume is ready once its empty read has succeeded', async () => {
		served.records = [];
		serve();
		render(LivePreview);
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		press();
		await vi.waitFor(() => expect(served.captures).toHaveLength(1));
	});
});

describe('capture screen: the image window is modal (NEH-381)', () => {
	it('Tab never leaves the image window: Check cameras and the thumbnails cannot be reached under it', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		thumb('Par 95')!.click();
		await vi.waitFor(() => expect(dialogs()).toHaveLength(1));
		const dialog = dialogs()[0];
		for (let i = 0; i < 15; i++) {
			await userEvent.tab();
			expect(dialog.contains(document.activeElement)).toBe(true);
		}
		for (let i = 0; i < 15; i++) {
			await userEvent.tab({ shift: true });
			expect(dialog.contains(document.activeElement)).toBe(true);
		}
	});
});

describe('capture screen: another volume clears the old one (NEH-381)', () => {
	it('a placeholder fill pending when the volume changes: the window closes, the old success is dropped, nothing targets the old record', async () => {
		served.records = [pair(41, 95), { ...pair(42, 96), images: [], missing_side: 'both' }, pair(43, 97)];
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByRole('button', { name: es.retakes_capture, exact: true })).toBeVisible();
		const answer = holdNextCapture();
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(1));

		current.set('http://localhost/live-preview?projectId=2&collectionId=10');
		await settle();
		// Before any control of the new volume is usable, the old window is gone.
		expect(dialogs()).toHaveLength(0);
		answer(json({ success: true, record_id: 42, image_ids: [4200, 4201] }));
		await settle();
		expect(dialogs()).toHaveLength(0);
		expect(document.body.textContent).not.toContain(es.cap_another_q(null));
		// The new volume's records are read, and capture is usable on them.
		await vi.waitFor(() => expect(thumb('Folio 1')).toBeTruthy());
		expect(thumb('Par 95')).toBeUndefined();
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		press();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		expect(served.captures[1].body.collection_id).toBe(10);
		expect(served.captures[1].body.record_id).toBeUndefined();
	});
});

describe('capture screen: a failed first read of the records (NEH-381)', () => {
	const unread = () => document.body.textContent?.includes(es.lv_records_unread) ?? false;
	const retry = () =>
		[...document.querySelectorAll<HTMLButtonElement>('.lv-records-unread button')].find((b) => words(b) === es.common_retry);

	it('says why capture is unavailable, with a retry that reads again; on success the message goes and capture works', async () => {
		served.recordsNext = [async () => json({ detail: 'down' }, 500)];
		serve();
		render(LivePreview);
		await vi.waitFor(() => expect(unread()).toBe(true));
		expect(retry()).toBeTruthy();
		expect(captureButton().disabled).toBe(true);

		retry()!.click();
		await vi.waitFor(() => expect(served.recordReads).toBe(2));
		await vi.waitFor(() => expect(unread()).toBe(false));
		expect(retry()).toBeUndefined();
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		press();
		await vi.waitFor(() => expect(served.captures).toHaveLength(1));
	});

	it('a retry that fails again keeps the message and the button', async () => {
		served.recordsNext = [async () => json({ detail: 'down' }, 500), async () => json({ detail: 'down' }, 500)];
		serve();
		render(LivePreview);
		await vi.waitFor(() => expect(retry()).toBeTruthy());
		retry()!.click();
		await vi.waitFor(() => expect(served.recordReads).toBe(2));
		await settle();
		expect(unread()).toBe(true);
		expect(retry()).toBeTruthy();
	});

	it('while the first read is only pending, nothing new is shown', async () => {
		let answerRead!: () => void;
		served.recordsNext = [() => new Promise<Response>((r) => (answerRead = () => r(json(served.records))))];
		serve();
		render(LivePreview);
		await vi.waitFor(() => expect(served.recordReads).toBe(1));
		await settle();
		expect(unread()).toBe(false);
		expect(document.querySelector('.lv-records-unread')).toBeNull();
		answerRead();
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		expect(unread()).toBe(false);
	});
});

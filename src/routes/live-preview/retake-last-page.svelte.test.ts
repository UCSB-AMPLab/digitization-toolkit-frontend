// NEH-388: "Retake the last opening", beside the capture button. It shows
// once a capture into this volume has been confirmed on this screen, and
// refers to the record captured or retaken last here; another volume clears
// it, and it is hidden for a record the backend would not retake (excluded,
// or in a status other than captured or rejected). Pressing it asks for
// confirmation in place; Confirm retakes the record through the image
// window's path (`record_id`). The capture key and the pedal never press it
// or confirm it, and take no capture while its confirmation shows. Its
// request carries a fresh client_capture_id, and one that ends in a timeout
// is checked by asking the backend for that id (NEH-401).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { tick } from 'svelte';

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

function pair(id: number, sequence: number): Rec {
	return {
		id,
		title: `Par ${sequence}`,
		status: 'captured',
		sequence,
		capture_mode: 'dual',
		collection_id: 9,
		images: [img(id * 10, id, 'left'), img(id * 10 + 1, id, 'right')],
		missing_side: null,
		missing_expected: null,
		missing_note: null,
		missing_request_id: null,
		closed_reason: null,
		closed_note: null
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
	capabilities: {} as Record<string, unknown>,
	// The next summary read answers only when this is resolved.
	summaryHeld: null as null | Promise<void>,
	summaryReads: 0,
	// The next capture fails with this backend status and detail.
	failNext: null as null | { status: number; detail: unknown },
	// The next answer to a capture into a record leaves out its image ids.
	noImageIdsNext: false,
	// The ids GET /cameras/capture-requests/{id} was asked for, and what it
	// answers: the next of `lookups`, or in progress once they run out.
	asked: [] as string[],
	lookups: [] as (() => Response)[]
};

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
		if (path.endsWith('/records/to-retake/summary')) {
			served.summaryReads++;
			const held = served.summaryHeld;
			served.summaryHeld = null;
			if (held) await held;
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		}
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (/\/records\/\d+\/rejections$/.test(path)) return json([]);
		if (/\/collections\/\d+$/.test(path)) {
			const id = Number(path.split('/').pop());
			return json({
				id,
				name: `Tomo ${id}`,
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: `stem-${id}`,
				custom_attributes: null
			});
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/cameras/capabilities')) return json(served.capabilities);
		const lookup = path.match(/\/cameras\/capture-requests\/([^/]+)$/);
		if (lookup) {
			served.asked.push(lookup[1]);
			return (served.lookups.shift() ?? (() => json({ in_progress: true })))();
		}
		if (path.endsWith('/records/')) {
			served.recordReads++;
			const next = served.recordsNext.shift();
			if (next) return next();
			return json(
				url.searchParams.get('collection_id') === '10' ? served.records10 : served.records
			);
		}
		if (path.endsWith('/cameras/capture') || path.endsWith('/cameras/capture/dual')) {
			const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
			served.captures.push({ path, body });
			if (served.failNext !== null) {
				const { status, detail } = served.failNext;
				served.failNext = null;
				return json({ detail }, status);
			}
			const held = served.held;
			if (held) {
				served.held = null;
				return held;
			}
			if (typeof body.record_id === 'number') {
				const target = served.records.find((r) => r.id === body.record_id)!;
				const base = target.id * 100 + served.captures.length * 2;
				target.images = [img(base, target.id, 'left'), img(base + 1, target.id, 'right')];
				if (served.noImageIdsNext) {
					served.noImageIdsNext = false;
					return json({ success: true, record_id: target.id });
				}
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
	served.summaryHeld = null;
	served.summaryReads = 0;
	served.failNext = null;
	served.noImageIdsNext = false;
	served.asked = [];
	served.lookups = [];
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
const buttonIn = (root: ParentNode | null, name: string) =>
	[...(root?.querySelectorAll('button') ?? [])].find(
		(b) => words(b) === name || b.getAttribute('aria-label') === name
	) as HTMLButtonElement | undefined;
const thumb = (title: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('.thumbnail-item')].find((b) =>
		b.textContent?.includes(title)
	);
const captureButton = () => document.querySelector('button.capture-btn') as HTMLButtonElement;
const retakeLast = () =>
	buttonIn(
		document.querySelector('.camera-viewport')?.parentElement ?? null,
		es.lv_retake_last(false)
	);
const confirmBox = () => document.querySelector('.retake-last-confirm') as HTMLElement | null;
const press = () => {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
	window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
};

async function screenReady() {
	await vi.waitFor(() => expect(thumb('Par 97')).toBeTruthy());
	await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
}

// A capture from the capture button, confirmed, with the records read after it.
async function captureOne(): Promise<Rec> {
	const n = served.captures.length;
	captureButton().click();
	await vi.waitFor(() => expect(served.captures).toHaveLength(n + 1));
	const added = served.records[served.records.length - 1];
	await vi.waitFor(() => expect(thumb(added.title)).toBeTruthy());
	await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
	return added;
}

async function openConfirm() {
	await vi.waitFor(() => expect(retakeLast()?.disabled).toBe(false));
	retakeLast()!.click();
	await vi.waitFor(() => expect(confirmBox()).not.toBeNull());
}

describe('Retake the last opening (NEH-388)', () => {
	it('is not shown before a capture is confirmed, and shows after one', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		expect(retakeLast()).toBeUndefined();
		await captureOne();
		await vi.waitFor(() => expect(retakeLast()).toBeTruthy());
	});

	it('asks in place; Cancel sends nothing; Confirm retakes the last record, which stays the last', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		const added = await captureOne();
		await openConfirm();
		const box = confirmBox()!;
		expect(box.textContent).toContain(es.lvm_retake_confirm);
		buttonIn(box, es.common_cancel)!.click();
		await vi.waitFor(() => expect(confirmBox()).toBeNull());
		expect(served.captures).toHaveLength(1);

		await openConfirm();
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		expect(served.captures[1].path).toMatch(/\/cameras\/capture\/dual$/);
		expect(served.captures[1].body.record_id).toBe(added.id);
		await vi.waitFor(() => expect(confirmBox()).toBeNull());

		// Still that record: a second retake goes into it again.
		await openConfirm();
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		expect(served.captures[2].body.record_id).toBe(added.id);
	});

	it('follows the newest capture, and a retake from the image window', async () => {
		serve();
		const screen = render(LivePreview);
		await screenReady();
		await captureOne();
		const second = await captureOne();
		await openConfirm();
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		expect(served.captures[2].body.record_id).toBe(second.id);
		await vi.waitFor(() => expect(confirmBox()).toBeNull());

		// Record 41 retaken in the image window becomes the last one.
		await vi.waitFor(() => expect(thumb('Par 95')?.disabled).toBe(false));
		thumb('Par 95')!.click();
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake, exact: true }).click();
		await dialog.getByRole('button', { name: es.common_confirm, exact: true }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(4));
		await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
		await openConfirm();
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(5));
		expect(served.captures[4].body.record_id).toBe(41);
	});

	it('the capture key takes no capture and confirms nothing while the confirmation shows; afterwards it captures as before', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		const added = await captureOne();
		await openConfirm();
		press();
		// A real key press on the focused Confirm button does not press it either.
		buttonIn(confirmBox(), es.common_confirm)!.focus();
		await userEvent.keyboard(' ');
		expect(confirmBox()).not.toBeNull();

		buttonIn(confirmBox(), es.common_cancel)!.click();
		await vi.waitFor(() => expect(confirmBox()).toBeNull());
		// The key never presses the button itself: a new record, not a retake.
		retakeLast()!.focus();
		await userEvent.keyboard(' ');
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		expect(served.captures[1].body.record_id).toBeUndefined();
		expect(confirmBox()).toBeNull();
		await vi.waitFor(() =>
			expect(thumb(served.records[served.records.length - 1].title)).toBeTruthy()
		);
		expect(served.records[served.records.length - 1].id).not.toBe(added.id);
		// Nothing else was sent while the confirmation showed.
		expect(served.captures).toHaveLength(2);
	});

	for (const status of ['excluded', 'approved']) {
		it(`is hidden for a record the backend would not retake (${status})`, async () => {
			serve();
			render(LivePreview);
			await screenReady();
			// The read after the capture reports the new record in that status.
			served.recordsNext = [
				async () => json(served.records.map((r) => (r.id >= 600 ? { ...r, status } : r)))
			];
			const added = await captureOne();
			expect(thumb(added.title)).toBeTruthy();
			expect(retakeLast()).toBeUndefined();
		});
	}

	it('another volume clears it', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		await captureOne();
		await vi.waitFor(() => expect(retakeLast()).toBeTruthy());
		current.set('http://localhost/live-preview?projectId=2&collectionId=10');
		await vi.waitFor(() => expect(thumb('Folio 1')).toBeTruthy());
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		expect(retakeLast()).toBeUndefined();
	});
});

const banner = () => {
	const el = document.querySelector('.capture-error-banner');
	return el ? words(el) : '';
};

// NEH-388: Confirm reads the volume's records again, with the gate held, and
// sends the retake only when the record is unchanged since this screen
// captured it: still listed, captured or rejected, no open placeholder, in
// the mode on screen, with the same current images.
describe('Retake the last opening: a record changed on another screen', () => {
	const changes: [string, (r: Rec) => void][] = [
		[
			'retaken: other current images',
			(r) => (r.images = [img(9000, r.id, 'left'), img(9001, r.id, 'right')])
		],
		['deleted', (r) => (served.records = served.records.filter((x) => x.id !== r.id))],
		['excluded', (r) => (r.status = 'excluded')],
		['approved', (r) => (r.status = 'approved')],
		['an open placeholder', (r) => Object.assign(r, { missing_side: 'both', images: [] })],
		['in the other mode', (r) => (r.capture_mode = 'single')]
	];
	for (const [how, change] of changes) {
		it(`${how}: nothing is sent, the button goes, the strip and the banner say so`, async () => {
			serve();
			render(LivePreview);
			await screenReady();
			const added = await captureOne();
			await openConfirm();
			change(added);
			const reads = served.recordReads;
			buttonIn(confirmBox(), es.common_confirm)!.click();
			await vi.waitFor(() => expect(banner()).toBe(es.lv_retake_last_changed(false)));
			expect(served.recordReads).toBeGreaterThan(reads);
			expect(served.captures).toHaveLength(1);
			expect(retakeLast()).toBeUndefined();
			if (how === 'deleted') expect(thumb(added.title)).toBeUndefined();
			// Focus is on the capture button, the button being gone.
			await vi.waitFor(() => expect(document.activeElement).toBe(captureButton()));
		});
	}

	it('a re-read that fails sends nothing and says so', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		await captureOne();
		await openConfirm();
		served.recordsNext = [async () => json({ detail: 'down' }, 500)];
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(banner()).toBe(es.lv_records_unread));
		expect(served.captures).toHaveLength(1);
	});

	it('unchanged, it retakes, and focus comes back to the button', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		const added = await captureOne();
		await openConfirm();
		const reads = served.recordReads;
		const replaced = added.images.map((i) => i.id).sort((a, b) => a - b);
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		expect(served.captures[1].body.record_id).toBe(added.id);
		// It names the images it replaces, as this screen captured them.
		expect(served.captures[1].body.expected_image_ids).toEqual(replaced);
		// The records were read before the retake was sent.
		expect(served.recordReads).toBeGreaterThan(reads);
		await vi.waitFor(() => expect(document.activeElement).toBe(retakeLast()));
	});
});

describe('Retake the last opening: the banner belongs to the latest capture (NEH-388)', () => {
	it('a retake that completes after a later capture failed leaves that failure on screen', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		await captureOne();
		await openConfirm();
		// The retake's POST succeeds; the reload of the turn after it waits.
		let answerSummary!: () => void;
		served.summaryHeld = new Promise<void>((r) => (answerSummary = r));
		const summaries = served.summaryReads;
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		await vi.waitFor(() => expect(served.summaryReads).toBe(summaries + 1));
		// The gate is free again: a later capture fails and says so.
		await vi.waitFor(() => expect(captureButton().disabled).toBe(false));
		served.failNext = { status: 500, detail: 'The camera did not answer' };
		captureButton().click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		await vi.waitFor(() => expect(banner()).not.toBe(''));
		const failure = banner();
		// Now the retake's reload answers and the retake completes.
		answerSummary();
		await vi.waitFor(() => expect(document.activeElement).toBe(retakeLast()));
		expect(banner()).toBe(failure);
	});
});

describe('Retake the last opening: the backend refuses a changed record (NEH-388)', () => {
	it('a 409 record_changed is handled as a record changed on another screen', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		const added = await captureOne();
		await openConfirm();
		// Another screen retakes the record after this screen's re-read.
		served.failNext = {
			status: 409,
			detail: { code: 'record_changed', message: 'The record changed.' }
		};
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(banner()).toBe(es.lv_retake_last_changed(false)));
		expect(served.captures).toHaveLength(2);
		expect(served.captures[1].body.record_id).toBe(added.id);
		expect(retakeLast()).toBeUndefined();
		await vi.waitFor(() => expect(document.activeElement).toBe(captureButton()));
	});

	it('with no image ids known at Confirm, the re-read gives the images the retake names', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		const added = await captureOne();
		// A retake answered without image ids, and the read after it failed.
		await openConfirm();
		served.noImageIdsNext = true;
		served.recordsNext = [
			async () => json(served.records),
			async () => json({ detail: 'down' }, 500)
		];
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		await vi.waitFor(() => expect(document.activeElement).toBe(retakeLast()));
		const current = added.images.map((i) => i.id).sort((a, b) => a - b);

		await openConfirm();
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		expect(served.captures[2].body.record_id).toBe(added.id);
		expect(served.captures[2].body.expected_image_ids).toEqual(current);
	});
});

describe('Retake the last opening that ends in a timeout (NEH-401)', () => {
	// Captured before any test fakes timers.
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
	const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
	const note = () => {
		const el = document.querySelector('.capture-note-banner');
		return el ? words(el) : '';
	};

	// A capture confirmed, then its retake confirmed and answered with nginx's 504 at 120 s.
	async function retakeLastTimedOut(): Promise<{ added: Rec; id: string; replaced: number[] }> {
		const added = await captureOne();
		await openConfirm();
		const replaced = added.images.map((i) => i.id).sort((a, b) => a - b);
		let answer!: (r: Response) => void;
		served.held = new Promise((r) => (answer = r));
		buttonIn(confirmBox(), es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		await advance(120_000);
		answer(
			new Response('<html><head><title>504 Gateway Time-out</title></head></html>', {
				status: 504,
				headers: { 'Content-Type': 'text/html' }
			})
		);
		await settle();
		expect(note()).toBe(es.lv_capture_maybe_saved);
		const body = served.captures[1].body;
		expect(body.record_id).toBe(added.id);
		// The id goes with the request, beside the images it replaces.
		expect(body.expected_image_ids).toEqual(replaced);
		const id = body.client_capture_id as string;
		expect(id).toMatch(UUID);
		expect(id).not.toBe(served.captures[0].body.client_capture_id);
		return { added, id, replaced };
	}

	it('stored at the first ask: a successful retake, with no second capture', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		const { added, id } = await retakeLastTimedOut();
		expect(captureButton().disabled).toBe(true);
		const target = served.records.find((r) => r.id === added.id)!;
		target.images = [img(7000, added.id, 'left'), img(7001, added.id, 'right')];
		served.lookups = [
			() =>
				json({
					success: true,
					record_id: added.id,
					image_ids: [7000, 7001],
					timing: null,
					error: null,
					replayed: true,
					in_progress: false
				})
		];
		await advance(5_000);
		expect(served.asked).toEqual([id]);
		// As after the request's own success: no notice left, no failure.
		expect(note()).toBe('');
		expect(banner()).toBe('');
		expect(captureButton().disabled).toBe(false);
		expect(served.captures).toHaveLength(2);
	});

	it('the backend no longer knows the id: the banner says nothing was saved', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		const { id } = await retakeLastTimedOut();
		served.lookups = [() => json({ detail: { code: 'not_found', message: 'Not found.' } }, 404)];
		await advance(5_000);
		expect(served.asked).toEqual([id]);
		expect(banner()).toBe(es.lv_capture_not_saved);
		expect(captureButton().disabled).toBe(false);
		expect(served.captures).toHaveLength(2);
	});

	it('a backend without the lookup route: the banner says the outcome is unknown, never not saved', async () => {
		serve();
		render(LivePreview);
		await screenReady();
		await retakeLastTimedOut();
		served.lookups = [() => json({ detail: 'Not Found' }, 404)];
		await advance(5_000);
		expect(banner()).toBe(es.lv_capture_unknown('retake', false));
		expect(captureButton().disabled).toBe(false);
	});
});

// NEH-381, NEH-401: a retake, a placeholder's fill or "Capture another here"
// that ends in a timeout. The capture screen does not report it as a
// failure: the modal says the capture may have been saved and stays locked
// while the page asks GET /cameras/capture-requests/{id} every 5 s for the
// client_capture_id the request carried. Stored, the screen goes on as after
// a successful capture, and sends no second capture; a 404 not_found says
// nothing was saved; a backend without the route leaves the outcome
// unknown. Leaving the screen stops the asks. Every request is answered by a
// fetch mock keyed on the path; a capture held by the test is answered with
// nginx's 504 page.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

const current = vi.hoisted(() => ({ url: '' }));
const BASE_URL = 'http://localhost/live-preview?projectId=2&collectionId=9';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
import { goto } from '$app/navigation';
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
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import '../../app.css';
import LivePreview from './+page.svelte';

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

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

// What nginx answers when the backend has said nothing for proxy_read_timeout.
function gatewayTimeout() {
	return new Response('<html><head><title>504 Gateway Time-out</title></head></html>', {
		status: 504,
		headers: { 'Content-Type': 'text/html' }
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

function pair(id: number, sequence: number, status = 'captured'): Rec {
	return {
		id,
		title: `Par ${sequence}`,
		status,
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

function placeholder(id: number, sequence: number): Rec {
	return {
		id,
		title: `Par ${sequence}`,
		status: 'captured',
		sequence,
		capture_mode: 'dual',
		collection_id: 9,
		images: [],
		missing_side: 'both',
		missing_expected: null,
		missing_note: 'Falta el folio 91.',
		missing_request_id: null,
		closed_reason: null,
		closed_note: null
	};
}

const served = {
	records: [] as Rec[],
	captures: [] as { path: string; body: Record<string, unknown> }[],
	nextId: 500,
	// When set, the next capture waits for this answer instead of the usual one.
	held: null as null | Promise<Response>,
	recordReads: 0,
	// The ids GET /cameras/capture-requests/{id} was asked for, and what it
	// answers: the next of `lookups`, or in progress once they run out.
	asked: [] as string[],
	lookups: [] as (() => Response)[]
};

// The lookup's answer for a stored capture, as the capture request was answered.
function storedBody(recordId: number, imageIds: number[]) {
	return json({
		success: true,
		record_id: recordId,
		image_ids: imageIds,
		file_paths: imageIds.map((i) => `/${i}`),
		timing: null,
		error: null,
		replayed: true,
		in_progress: false
	});
}
const notFoundBody = () => json({ detail: { code: 'not_found', message: 'Not found.' } }, 404);
const noRouteBody = () => json({ detail: 'Not Found' }, 404);

function holdNextCapture() {
	let answer!: (r: Response) => void;
	served.held = new Promise((r) => (answer = r));
	return answer;
}

function serve() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/records/to-retake/summary')) {
			const pending = served.records
				.filter((r) => r.missing_side && !r.closed_reason)
				.map((r) => r.id);
			return json({
				pendingRecords: pending.length,
				volumes:
					pending.length === 0
						? []
						: [
								{
									collectionId: 9,
									projectId: 2,
									name: 'Tomo 17',
									filenameStem: 'co-ahr-not-t017',
									pending: pending.length,
									total: 0,
									excluded: 0,
									firstPendingRecordId: pending[0],
									pendingRecordIds: pending,
									missingSideRecordIds: pending
								}
							],
				turn: { state: 'recaptures', unlockedBy: null }
			});
		}
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (/\/records\/\d+\/rejections$/.test(path)) return json([]);
		if (path.endsWith('/collections/9')) {
			return json({
				id: 9,
				name: 'Tomo 17',
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: 'co-ahr-not-t017',
				custom_attributes: null
			});
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/records/')) {
			served.recordReads++;
			return json(served.records);
		}
		const lookup = path.match(/\/cameras\/capture-requests\/([^/]+)$/);
		if (lookup) {
			served.asked.push(lookup[1]);
			return (served.lookups.shift() ?? (() => json({ in_progress: true })))();
		}
		if (path.endsWith('/cameras/capture') || path.endsWith('/cameras/capture/dual')) {
			const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
			served.captures.push({ path, body });
			const held = served.held;
			if (held) {
				served.held = null;
				return held;
			}
			if (typeof body.afterRecordId === 'number') {
				const id = insertAfter(body.afterRecordId);
				return json({ success: true, record_id: id, image_ids: [id * 10, id * 10 + 1] });
			}
			fillOrRetake(body.record_id as number);
			return json({ success: true, record_id: body.record_id });
		}
		return json([]);
	});
}

// What the backend commits for a capture inserted after a record.
function insertAfter(afterId: number): number {
	const id = served.nextId++;
	const at = served.records.findIndex((r) => r.id === afterId);
	const seq = served.records[at].sequence + 1;
	for (const r of served.records) if (r.sequence >= seq) r.sequence++;
	served.records.splice(at + 1, 0, pair(id, seq));
	return id;
}

// What the backend commits for a retake or a placeholder's fill: new current images.
function fillOrRetake(recordId: number) {
	const target = served.records.find((r) => r.id === recordId)!;
	target.missing_side = null;
	const base = target.id * 100 + served.captures.length * 2;
	target.images = [img(base, target.id, 'left'), img(base + 1, target.id, 'right')];
}

beforeEach(() => {
	locale.set('es');
	served.records = [pair(41, 95), placeholder(42, 96), pair(43, 97)];
	served.captures = [];
	served.nextId = 500;
	served.held = null;
	served.recordReads = 0;
	served.asked = [];
	served.lookups = [];
	vi.mocked(goto).mockReset();
	cameraStatus.reportSuccess();
	authStore.setSession({
		id: 1,
		username: 'operator',
		email: null,
		role: 'operator',
		is_active: true
	});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	authStore.clearSession();
	cameraStatus.reportSuccess();
});

const dialogEl = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const dialogText = () => dialogEl()?.textContent ?? '';
// A button's words, without the text of its icon.
function words(el: Element): string {
	const copy = el.cloneNode(true) as HTMLElement;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return copy.textContent?.trim() ?? '';
}
const buttonIn = (name: string) =>
	[...(dialogEl()?.querySelectorAll('button') ?? [])].find((b) => words(b) === name) as
		| HTMLButtonElement
		| undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Opens record 41's retake, confirms it, and answers its request with a 504 at 120 s.
async function retakeTimedOut(screen: ReturnType<typeof render>) {
	const dialog = screen.getByRole('dialog');
	await dialog.getByRole('button', { name: es.lvm_retake }).click();
	await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
	const answer = holdNextCapture();
	buttonIn(es.common_confirm)!.click();
	await settle();
	expect(served.captures).toHaveLength(1);
	expect(served.captures[0].body.record_id).toBe(41);
	await advance(120_000);
	answer(gatewayTimeout());
	await settle();
	expect(dialogText()).toContain(es.lv_capture_maybe_saved);
}

describe('capture screen: a retake that ends in a timeout (NEH-381, NEH-401)', () => {
	it('a 504 at 120 s, then the capture stored at the second ask: goes on as after a successful retake, with no second capture', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		const answer = holdNextCapture();
		buttonIn(es.common_confirm)!.click();
		await settle();
		expect(served.captures).toHaveLength(1);
		expect(served.captures[0].body.record_id).toBe(41);
		const id = served.captures[0].body.client_capture_id as string;
		expect(id).toMatch(UUID);

		await advance(10_000);
		expect(dialogText()).toContain(es.lv_capture_still_working);
		await advance(110_000);
		answer(gatewayTimeout());
		await settle();
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		expect(dialogText()).not.toContain(es.lv_capture_error);
		expect(dialogText()).not.toContain(es.lvm_retake_error(''));

		await advance(5_000);
		expect(served.asked).toEqual([id]);
		expect(goto).not.toHaveBeenCalled();
		// The backend commits the retake between the first and the second ask.
		fillOrRetake(41);
		const ids = served.records.find((r) => r.id === 41)!.images.map((i) => i.id);
		served.lookups = [() => storedBody(41, ids)];
		await advance(5_000);
		expect(served.asked).toEqual([id, id]);
		expect(goto).toHaveBeenCalledWith('/dashboard/projects/2/collections/9');
		expect(served.captures).toHaveLength(1);
		await advance(240_000);
		expect(served.asked).toHaveLength(2);
	});

	it('the backend no longer knows the id: the modal says nothing was saved at the first ask, and lets go', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		served.lookups = [notFoundBody];
		await retakeTimedOut(screen);
		expect(buttonIn(es.lvm_retake)).toBeUndefined();
		await advance(5_000);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_not_saved));
		expect(dialogText()).not.toContain(es.lv_capture_maybe_saved);
		expect(buttonIn(es.lvm_retake)?.disabled).toBe(false);
		expect(goto).not.toHaveBeenCalled();
		expect(served.captures).toHaveLength(1);
	});

	it('in progress past 180 s: the modal stays locked; asks that fail then go on until stored', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		await retakeTimedOut(screen);
		await advance(240_000);
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		expect(buttonIn(es.lvm_retake)).toBeUndefined();
		served.lookups = [
			() => json({ detail: 'down' }, 500),
			() => {
				fillOrRetake(41);
				return storedBody(
					41,
					served.records.find((r) => r.id === 41)!.images.map((i) => i.id)
				);
			}
		];
		await advance(10_000);
		expect(goto).toHaveBeenCalledWith('/dashboard/projects/2/collections/9');
		expect(served.captures).toHaveLength(1);
	});

	it('asks that fail for 180 s: the modal says the outcome is unknown, never that nothing was saved', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		served.lookups = Array.from({ length: 40 }, () => () => json({ detail: 'down' }, 500));
		await retakeTimedOut(screen);
		await advance(179_999);
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		await advance(1);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_unknown('retake', false)));
		expect(dialogText()).not.toContain(es.lv_capture_not_saved);
		expect(buttonIn(es.lvm_retake)?.disabled).toBe(false);
	});

	it('a backend without the lookup route: the outcome is unknown at the first ask, never not saved', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		served.lookups = [noRouteBody];
		await retakeTimedOut(screen);
		await advance(5_000);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_unknown('retake', false)));
		expect(dialogText()).not.toContain(es.lv_capture_not_saved);
		expect(served.asked).toHaveLength(1);
	});

	it('leaving the screen during the check stops the asks', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		await retakeTimedOut(screen);
		await advance(5_000);
		const asks = served.asked.length;
		expect(asks).toBe(1);

		screen.unmount();
		await settle();
		await advance(240_000);
		expect(served.asked).toHaveLength(asks);
		expect(served.captures).toHaveLength(1);
	});
});

describe('capture screen: a retake whose capture was stored and has lost an image since (NEH-401)', () => {
	it('410: the window says to check this opening, the records are read again, and nothing more is asked', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		served.lookups = [
			() => json({ detail: { code: 'capture_no_longer_stored', message: 'x' } }, 410)
		];
		await retakeTimedOut(screen);
		const reads = served.recordReads;
		await advance(5_000);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_unknown('retake', false)));
		expect(dialogText()).not.toContain(es.lv_capture_not_saved);
		expect(served.recordReads).toBeGreaterThan(reads);
		await advance(600_000);
		expect(served.asked).toHaveLength(1);
	});
});

describe('capture screen: a retake refused with 409 capture_abandoned (NEH-401)', () => {
	it('the modal says nothing was saved, asks nothing, and the next Confirm sends a new id', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();
		served.held = Promise.resolve(
			json({ detail: { code: 'capture_abandoned', message: 'x' } }, 409)
		);
		buttonIn(es.common_confirm)!.click();
		await vi.waitFor(() =>
			expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_not_saved))
		);
		expect(served.asked).toEqual([]);
		expect(goto).not.toHaveBeenCalled();
		expect(served.captures).toHaveLength(1);

		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();
		buttonIn(es.common_confirm)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		expect(served.captures[1].body.client_capture_id).not.toBe(
			served.captures[0].body.client_capture_id
		);
	});
});

describe("capture screen: a placeholder's fill that ends in a timeout (NEH-401)", () => {
	it('the fill carries an id; stored at the first ask, the panel asks whether another opening is missing', async () => {
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect
			.element(dialog.getByRole('button', { name: es.retakes_capture, exact: true }))
			.toBeVisible();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		const answer = holdNextCapture();
		buttonIn(es.retakes_capture)!.click();
		await settle();
		expect(served.captures).toHaveLength(1);
		expect(served.captures[0].body.record_id).toBe(42);
		const id = served.captures[0].body.client_capture_id as string;
		expect(id).toMatch(UUID);
		await advance(120_000);
		answer(gatewayTimeout());
		await settle();
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		fillOrRetake(42);
		served.lookups = [
			() =>
				storedBody(
					42,
					served.records.find((r) => r.id === 42)!.images.map((i) => i.id)
				)
		];
		await advance(5_000);
		expect(served.asked).toEqual([id]);
		expect(dialogText()).toContain(es.lv_capture_found);
		expect(dialogText()).toContain(es.cap_another_q(null));
		expect(served.captures).toHaveLength(1);
	});
});

describe('capture screen: "Capture another here" that ends in a timeout (NEH-381, NEH-401)', () => {
	it('a 504, then the inserted record stored at the second ask: the panel asks again after it, with no second capture', async () => {
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		expect(served.captures).toHaveLength(1);

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		const answer = holdNextCapture();
		buttonIn(es.cap_another)!.click();
		await settle();
		expect(served.captures).toHaveLength(2);
		expect(served.captures[1].body.afterRecordId).toBe(42);
		const id = served.captures[1].body.client_capture_id as string;
		expect(id).toMatch(UUID);
		expect(id).not.toBe(served.captures[0].body.client_capture_id);

		await advance(120_000);
		answer(gatewayTimeout());
		await settle();
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		expect(dialogText()).not.toContain(es.lvm_retake_error(''));
		expect(buttonIn(es.cap_another)?.disabled).toBe(true);
		const closes = [...(dialogEl()?.querySelectorAll('button') ?? [])].filter(
			(b) => words(b) === es.common_close || b.getAttribute('aria-label') === es.common_close
		);
		expect(closes.length).toBeGreaterThan(0);
		for (const b of closes) expect((b as HTMLButtonElement).disabled).toBe(true);

		await advance(5_000);
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		const inserted = insertAfter(42);
		served.lookups = [() => storedBody(inserted, [inserted * 10, inserted * 10 + 1])];
		await advance(5_000);
		expect(served.asked).toEqual([id, id]);
		expect(dialogText()).not.toContain(es.lv_capture_maybe_saved);
		expect(dialogText()).toContain(es.lv_capture_found);
		expect(dialogText()).toContain(es.cap_another_q(null));
		expect(buttonIn(es.cap_another)?.disabled).toBe(false);
		expect(served.captures).toHaveLength(2);

		// The panel now follows the record just stored: the next insertion goes after it.
		// (An unknown outcome of "Capture another here" names the openings around it: below.)
		vi.useRealTimers();
		buttonIn(es.cap_another)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		expect(served.captures[2].body.afterRecordId).toBe(500);
	});
});

describe('capture screen: "Capture another here" whose outcome is unknown (NEH-401)', () => {
	it('the panel says to check the openings around this one', async () => {
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		const answer = holdNextCapture();
		buttonIn(es.cap_another)!.click();
		await settle();
		await advance(120_000);
		answer(gatewayTimeout());
		await settle();
		served.lookups = [noRouteBody];
		await advance(5_000);
		expect(dialogText()).toContain(es.lv_capture_unknown('another', false));
		expect(dialogText()).not.toContain(es.lv_capture_not_saved);
	});
});

describe('capture screen: a capture found by the background asks completes as a success would (NEH-401)', () => {
	const failedBody = () => json({ detail: 'down' }, 500);

	it('"Capture another here" found later as record 500: the next insertion goes after 500', async () => {
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		const answer = holdNextCapture();
		buttonIn(es.cap_another)!.click();
		await settle();
		expect(served.captures[1].body.afterRecordId).toBe(42);
		await advance(120_000);
		answer(gatewayTimeout());
		await settle();
		served.lookups = Array.from({ length: 36 }, () => failedBody);
		await advance(180_000);
		expect(dialogText()).toContain(es.lv_capture_unknown('another', false));

		// The backend had inserted it; the background ask finds it.
		const inserted = insertAfter(42);
		expect(inserted).toBe(500);
		served.lookups = [() => storedBody(inserted, [inserted * 10, inserted * 10 + 1])];
		await advance(15_000);
		// The panel stays open, and its message for that attempt is gone.
		expect(dialogText()).toContain(es.cap_another_q(null));
		expect(dialogText()).not.toContain(es.lv_capture_unknown('another', false));
		expect(dialogText()).toContain(es.lv_capture_found);

		vi.useRealTimers();
		await vi.waitFor(() => expect(buttonIn(es.cap_another)?.disabled).toBe(false));
		buttonIn(es.cap_another)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		expect(served.captures[2].body.afterRecordId).toBe(500);
	});

	const thumbOf = (title: string) =>
		[...document.querySelectorAll<HTMLButtonElement>('.thumbnail-item')].find((t) =>
			t.textContent?.includes(title)
		);
	const closeButton = () =>
		[...(dialogEl()?.querySelectorAll('button') ?? [])].find(
			(x) => words(x) === es.common_close || x.getAttribute('aria-label') === es.common_close
		) as HTMLButtonElement | undefined;

	it('a retake found later, with its window still open: the message goes, the window stays, and the screen does not move on', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		await retakeTimedOut(screen);
		served.lookups = Array.from({ length: 36 }, () => failedBody);
		await advance(180_000);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_unknown('retake', false)));

		fillOrRetake(41);
		served.lookups = [
			() =>
				storedBody(
					41,
					served.records.find((r) => r.id === 41)!.images.map((i) => i.id)
				)
		];
		await advance(15_000);
		expect(dialogText()).not.toContain(es.lv_capture_unknown('retake', false));
		expect(dialogEl()).not.toBeNull();
		expect(dialogText()).toContain('Par 95');
		await advance(60_000);
		expect(goto).not.toHaveBeenCalled();
		expect(served.captures).toHaveLength(1);
	});

	it("a placeholder's fill found later, with its window open: the message goes, the window stays, no navigation", async () => {
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect
			.element(dialog.getByRole('button', { name: es.retakes_capture, exact: true }))
			.toBeVisible();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		const answer = holdNextCapture();
		buttonIn(es.retakes_capture)!.click();
		await settle();
		await advance(120_000);
		answer(gatewayTimeout());
		await settle();
		served.lookups = Array.from({ length: 36 }, () => failedBody);
		await advance(180_000);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_unknown('retake', false)));

		fillOrRetake(42);
		served.lookups = [
			() =>
				storedBody(
					42,
					served.records.find((r) => r.id === 42)!.images.map((i) => i.id)
				)
		];
		await advance(15_000);
		expect(dialogText()).not.toContain(es.lv_capture_unknown('retake', false));
		expect(dialogEl()).not.toBeNull();
		await advance(60_000);
		expect(goto).not.toHaveBeenCalled();
		expect(served.captures).toHaveLength(1);
	});

	it('the window closed and opened again on the same record, then the retake found: the window stays, no navigation, nothing moves on', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		await retakeTimedOut(screen);
		served.lookups = Array.from({ length: 36 }, () => failedBody);
		await advance(180_000);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_unknown('retake', false)));

		closeButton()!.click();
		await settle();
		expect(dialogEl()).toBeNull();
		thumbOf('Par 95')!.click();
		await settle();
		expect(dialogText()).toContain('Par 95');

		fillOrRetake(41);
		served.lookups = [
			() =>
				storedBody(
					41,
					served.records.find((r) => r.id === 41)!.images.map((i) => i.id)
				)
		];
		await advance(15_000);
		await advance(60_000);
		expect(dialogEl()).not.toBeNull();
		expect(dialogText()).toContain('Par 95');
		expect(goto).not.toHaveBeenCalled();
	});

	it('a later, different error in the same panel stays when the earlier attempt is found', async () => {
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
		const answerA = holdNextCapture();
		buttonIn(es.cap_another)!.click();
		await settle();
		await advance(120_000);
		answerA(gatewayTimeout());
		await settle();
		served.lookups = Array.from({ length: 36 }, () => failedBody);
		await advance(180_000);
		expect(dialogText()).toContain(es.lv_capture_unknown('another', false));

		// B fails with an ordinary error, in the same panel.
		const answerB = holdNextCapture();
		buttonIn(es.cap_another)!.click();
		await settle();
		answerB(json({ detail: 'Internal Server Error' }, 500));
		await settle();
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_error));

		// A is found stored.
		const inserted = insertAfter(42);
		served.lookups = [() => storedBody(inserted, [inserted * 10, inserted * 10 + 1])];
		await advance(15_000);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_error));
	});
});

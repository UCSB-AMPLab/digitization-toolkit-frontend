// NEH-381: a retake, or "Capture another here", that ends in a timeout. The
// capture screen does not report it as a failure: the modal says the capture
// may have been saved and stays locked while the page reads the volume's
// records again every 5 s. When the capture appears, the screen goes on as
// after a successful one, and sends no second capture. Leaving the screen
// stops the reads. Every request is answered by a fetch mock keyed on the
// path; a capture held by the test is answered with nginx's 504 page.
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
	recordReads: 0
};

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

describe('capture screen: a retake that ends in a timeout (NEH-381)', () => {
	it('a 504 at 120 s, then the new images at the second read: goes on as after a successful retake, with no second capture', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const answer = holdNextCapture();
		buttonIn(es.common_confirm)!.click();
		await settle();
		expect(served.captures).toHaveLength(1);
		expect(served.captures[0].body.record_id).toBe(41);

		await advance(10_000);
		expect(dialogText()).toContain(es.lv_capture_still_working);
		await advance(110_000);
		answer(gatewayTimeout());
		await settle();
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		expect(dialogText()).not.toContain(es.lv_capture_error);
		expect(dialogText()).not.toContain(es.lvm_retake_error(''));
		const readsBefore = served.recordReads;

		await advance(5_000);
		expect(served.recordReads).toBe(readsBefore + 1);
		expect(goto).not.toHaveBeenCalled();
		// The backend commits the retake between the first and the second read.
		fillOrRetake(41);
		await advance(5_000);
		expect(served.recordReads).toBe(readsBefore + 2);
		expect(goto).toHaveBeenCalledWith('/dashboard/projects/2/collections/9');
		expect(served.captures).toHaveLength(1);
		const reads = served.recordReads;
		await advance(240_000);
		expect(served.recordReads).toBe(reads);
	});

	it('nothing appears: 180 s after the check began the modal says nothing was saved and lets go', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const answer = holdNextCapture();
		buttonIn(es.common_confirm)!.click();
		await settle();
		await advance(120_000);
		answer(gatewayTimeout());
		await settle();
		await advance(179_999);
		expect(dialogText()).toContain(es.lv_capture_maybe_saved);
		expect(buttonIn(es.lvm_retake)).toBeUndefined();
		await advance(1);
		expect(dialogText()).toContain(es.lvm_retake_error(es.lv_capture_not_saved));
		expect(dialogText()).not.toContain(es.lv_capture_maybe_saved);
		expect(buttonIn(es.lvm_retake)?.disabled).toBe(false);
		expect(goto).not.toHaveBeenCalled();
		expect(served.captures).toHaveLength(1);
	});

	it('leaving the screen during the check stops the reads', async () => {
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.lvm_retake }).click();
		await expect.element(dialog.getByRole('button', { name: es.common_confirm })).toBeVisible();

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const answer = holdNextCapture();
		buttonIn(es.common_confirm)!.click();
		await settle();
		await advance(120_000);
		answer(gatewayTimeout());
		await settle();
		await advance(5_000);
		const reads = served.recordReads;

		screen.unmount();
		await settle();
		await advance(240_000);
		expect(served.recordReads).toBe(reads);
		expect(served.captures).toHaveLength(1);
	});
});

describe('capture screen: "Capture another here" that ends in a timeout (NEH-381)', () => {
	it('a 504, then the inserted record at the second read: the panel asks again after it, with no second capture', async () => {
		current.url = `${BASE_URL}&recordId=42`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		expect(served.captures).toHaveLength(1);

		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
		const answer = holdNextCapture();
		buttonIn(es.cap_another)!.click();
		await settle();
		expect(served.captures).toHaveLength(2);
		expect(served.captures[1].body.afterRecordId).toBe(42);

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
		insertAfter(42);
		await advance(5_000);
		expect(dialogText()).not.toContain(es.lv_capture_maybe_saved);
		expect(dialogText()).toContain(es.lv_capture_found);
		expect(dialogText()).toContain(es.cap_another_q(null));
		expect(buttonIn(es.cap_another)?.disabled).toBe(false);
		expect(served.captures).toHaveLength(2);

		// The panel now follows the record just found: the next insertion goes after it.
		vi.useRealTimers();
		buttonIn(es.cap_another)!.click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		expect(served.captures[2].body.afterRecordId).toBe(500);
	});
});

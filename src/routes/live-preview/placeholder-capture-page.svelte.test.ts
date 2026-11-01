// NEH-317: capturing into a placeholder on the capture screen. Opened with
// the record id of a placeholder (missing_side "both"), the guided recapture
// shows where the opening goes between its neighbours, the note (from Fisqua
// review when it came from a request), the line that separates order from
// file names, and a link to close it without capturing. Only a dual capture
// fills it. After the capture it asks whether another opening is missing
// there: "Capture another here" inserts a new record after the one just
// filled and asks again; "That was the last one" lets the guide go on.
// Every request is answered by a fetch mock keyed on the path.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const current = vi.hoisted(() => ({ url: '' }));
const BASE_URL = 'http://localhost/live-preview?projectId=2&collectionId=9';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
import { goto } from '$app/navigation';
import { userEvent } from 'vitest/browser';
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
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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
		id, title: `Par ${sequence}`, status: 'in_review', sequence, capture_mode: 'dual', collection_id: 9,
		images: [img(id * 10, id, 'left'), img(id * 10 + 1, id, 'right')],
		missing_side: null, missing_expected: null, missing_note: null, missing_request_id: null, closed_reason: null, closed_note: null
	};
}

function placeholder(id: number, sequence: number, requestId: string | null): Rec {
	return {
		id, title: `Par ${sequence}`, status: 'captured', sequence, capture_mode: 'dual', collection_id: 9, images: [],
		missing_side: 'both', missing_expected: 'Folios 90v y 91r',
		missing_note: 'Ningún cuadro muestra el folio 91. Revisa el volumen.', missing_request_id: requestId,
		closed_reason: null, closed_note: null
	};
}

const served = {
	records: [] as Rec[],
	captures: [] as { path: string; body: Record<string, unknown> }[],
	closes: [] as { id: number; body: Record<string, unknown> }[],
	nextId: 500,
	// When set, the next capture that inserts (afterRecordId) waits for it.
	hold: null as null | Promise<void>,
	recordsNext: null as null | (() => Promise<Response>)
};

function serve() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/records/to-retake/summary')) {
			const pending = served.records.filter((r) => r.missing_side && !r.closed_reason).map((r) => r.id);
			return json({
				pendingRecords: pending.length,
				volumes: pending.length === 0 ? [] : [{
					collectionId: 9, projectId: 2, name: 'Tomo 17', filenameStem: 'co-ahr-not-t017',
					pending: pending.length, total: 0, excluded: 0, firstPendingRecordId: pending[0],
					pendingRecordIds: pending, missingSideRecordIds: pending
				}],
				turn: { state: 'recaptures', unlockedBy: null }
			});
		}
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (/\/records\/\d+\/rejections$/.test(path)) return json([]);
		const close = path.match(/\/records\/(\d+)\/close-missing$/);
		if (close) {
			const id = Number(close[1]);
			const body = JSON.parse(String(init?.body ?? '{}'));
			served.closes.push({ id, body });
			const target = served.records.find((r) => r.id === id)!;
			target.closed_reason = body.reason;
			target.closed_note = body.note;
			return json(target);
		}
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 17', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-not-t017', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'AHR' });
		if (path.endsWith('/records')) {
			// Armed by a test: the next read of the records answers through it, once.
			const once = served.recordsNext;
			if (once) {
				served.recordsNext = null;
				return once();
			}
			return json(served.records);
		}
		if (path.endsWith('/cameras/capture') || path.endsWith('/cameras/capture/dual')) {
			const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
			served.captures.push({ path, body });
			if (typeof body.afterRecordId === 'number') {
				if (served.hold) await served.hold;
				const id = served.nextId++;
				const at = served.records.findIndex((r) => r.id === body.afterRecordId);
				// As the backend: the new record takes the next sequence, later ones move up.
				const seq = served.records[at].sequence + 1;
				for (const r of served.records) if (r.sequence >= seq) r.sequence++;
				served.records.splice(at + 1, 0, { ...pair(id, seq), status: 'captured' });
				return json({ success: true, record_id: id });
			}
			const target = served.records.find((r) => r.id === body.record_id);
			if (target) {
				target.missing_side = null;
				target.images = [img(target.id * 10, target.id, 'left'), img(target.id * 10 + 1, target.id, 'right')];
			}
			return json({ success: true, record_id: body.record_id });
		}
		return json([]);
	});
}

beforeEach(() => {
	locale.set('es');
	current.url = `${BASE_URL}&recordId=42`;
	served.records = [pair(41, 95), placeholder(42, 96, 'req-7'), pair(43, 97)];
	served.captures = [];
	served.closes = [];
	served.nextId = 500;
	served.hold = null;
	served.recordsNext = null;
	vi.mocked(goto).mockReset();
	authStore.setSession('tok', { id: 1, username: 'operator', email: null, role: 'operator', is_active: true });
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('capture screen: capturing into a placeholder (NEH-317)', () => {
	it('shows where the opening goes, the note from Fisqua review, the order line and the close link', async () => {
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByRole('heading', { name: es.cap_title(null, 95) })).toBeVisible();
		const where = dialog.getByRole('group', { name: es.cap_where });
		await expect.element(where).toBeVisible();
		const thumbs = [...where.element().querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
		expect(thumbs.some((s) => s.includes('/records/images/410/thumbnail'))).toBe(true);
		expect(thumbs.some((s) => s.includes('/records/images/431/thumbnail'))).toBe(true);
		expect(where.element().querySelectorAll('[data-missing-side]')).toHaveLength(2);
		await expect.element(dialog.getByText(es.cap_from_review)).toBeVisible();
		await expect.element(dialog.getByText('Ningún cuadro muestra el folio 91. Revisa el volumen.')).toBeVisible();
		await expect.element(dialog.getByText('Folios 90v y 91r')).toBeVisible();
		await expect.element(dialog.getByText(es.cap_order_note(95, null))).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: es.cap_nothing_link })).toBeVisible();
		// No confirmation to replace images: there are none.
		await expect.element(dialog.getByRole('button', { name: 'Volver a capturar' })).not.toBeInTheDocument();
	});

	it('shows the plain note when the placeholder did not come from a Fisqua request', async () => {
		served.records[1] = placeholder(42, 96, null);
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('Ningún cuadro muestra el folio 91. Revisa el volumen.')).toBeVisible();
		await expect.element(dialog.getByText(es.cap_from_review)).not.toBeInTheDocument();
	});

	it('fills it with a dual capture, then asks about another; Capture another inserts after the one just filled and asks again', async () => {
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		expect(served.captures).toHaveLength(1);
		expect(served.captures[0].path).toMatch(/\/cameras\/capture\/dual$/);
		expect(served.captures[0].body.record_id).toBe(42);
		await expect.element(dialog.getByRole('button', { name: es.retakes_capture, exact: true })).not.toBeInTheDocument();

		await dialog.getByRole('button', { name: es.cap_another }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		expect(served.captures[1].path).toMatch(/\/cameras\/capture\/dual$/);
		expect(served.captures[1].body.afterRecordId).toBe(42);
		expect(served.captures[1].body.record_id).toBeUndefined();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();

		await dialog.getByRole('button', { name: es.cap_another }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(3));
		expect(served.captures[2].body.afterRecordId).toBe(500);
		expect(served.records.map((r) => r.id)).toEqual([41, 42, 500, 501, 43]);
	});

	it('That was the last one lets the guide go on: with nothing left, the end panel', async () => {
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await dialog.getByRole('button', { name: es.cap_last }).click();
		await expect.element(screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' })).toBeVisible();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('There is no opening to capture here opens the close dialog; closing it lets the guide go on', async () => {
		serve();
		const screen = render(LivePreview);
		await screen.getByRole('dialog').getByRole('button', { name: es.cap_nothing_link }).click();
		const close = screen.getByRole('dialog', { name: es.close_title });
		await expect.element(close).toBeVisible();
		await close.getByRole('radio', { name: es.close_reason_skip }).click();
		await close.getByRole('button', { name: es.close_submit }).click();
		await expect.element(screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' })).toBeVisible();
		expect(served.closes).toEqual([{ id: 42, body: { reason: 'foliation_skip', note: null } }]);
		expect(served.captures).toHaveLength(0);
	});

	it('Back to capture returns to the placeholder', async () => {
		serve();
		const screen = render(LivePreview);
		await screen.getByRole('dialog').getByRole('button', { name: es.cap_nothing_link }).click();
		await screen.getByRole('dialog', { name: es.close_title }).getByRole('button', { name: es.close_back }).click();
		await expect.element(screen.getByRole('dialog', { name: es.close_title })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('heading', { name: es.cap_title(null, 95) })).toBeVisible();
	});

	it('never offers a single capture for it, even with the camera in single mode', async () => {
		// The record is dual, so the screen opens it in double mode; the
		// capture into a placeholder is dual whatever the mode.
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(1));
		expect(served.captures.every((c) => c.path.endsWith('/cameras/capture/dual'))).toBe(true);
	});

	it('Skip is disabled once a placeholder is filled; That was the last one opens the next with Capture and no after-panel', async () => {
		served.records = [pair(41, 95), placeholder(42, 96, null), pair(43, 97), placeholder(44, 98, null), pair(45, 99)];
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: 'Saltar por ahora' })).toBeDisabled();
		await dialog.getByRole('button', { name: es.cap_last }).click();
		await expect.element(dialog.getByRole('heading', { name: es.cap_title(null, 97) })).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: es.retakes_capture, exact: true })).toBeVisible();
		await expect.element(dialog.getByText(es.cap_another_q(null))).not.toBeInTheDocument();
		await expect.element(dialog.getByRole('button', { name: 'Saltar por ahora' })).toBeEnabled();
	});

	it('blocks Escape, X and Close while another capture runs', async () => {
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		let release!: () => void;
		served.hold = new Promise((r) => (release = r));
		await dialog.getByRole('button', { name: es.cap_another }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		await userEvent.keyboard('{Escape}');
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		for (const b of dialog.getByRole('button', { name: es.common_close }).elements()) expect((b as HTMLButtonElement).disabled).toBe(true);
		release();
		await expect.element(dialog.getByRole('button', { name: es.cap_another })).toBeEnabled();
	});

	it('Close after a fill reloads the records: the strip shows the images, and the record is no placeholder any more', async () => {
		current.url = BASE_URL;
		serve();
		const screen = render(LivePreview);
		const item = () => [...screen.container.querySelectorAll<HTMLElement>('.thumbnail-item')].find((b) => b.textContent?.includes('Par 96'))!;
		await vi.waitFor(() => expect(item()).toBeTruthy());
		item().click();
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		await dialog.getByRole('button', { name: es.common_close }).first().click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		await vi.waitFor(() => expect(item().querySelector('img')?.getAttribute('src') ?? '').toContain('/records/images/420/thumbnail'));
		item().click();
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		await expect.element(screen.getByRole('heading', { name: es.cap_title(null, 95) })).not.toBeInTheDocument();
	});

	it('Close after a fill from the guide goes on as That was the last one does', async () => {
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		await dialog.getByRole('button', { name: es.common_close }).first().click();
		await expect.element(screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' })).toBeVisible();
	});

	it('sends the camera swap with the fill, and the title and swap with Capture another here', async () => {
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog).toBeVisible();
		const swap = screen.getByRole('button', { name: es.lv_swap_orientation });
		(swap.element() as HTMLButtonElement).click();
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
		expect(served.captures[0].body).toMatchObject({ record_id: 42, left_camera_index: 1 });
		await dialog.getByRole('button', { name: es.cap_another }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(2));
		expect(served.captures[1].body).toMatchObject({ afterRecordId: 42, left_camera_index: 1, collection_id: 9, project_name: 'AHR' });
		expect(String(served.captures[1].body.record_title)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
	});

	it('after each Capture another here, the panel describes the next slot', async () => {
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
		await expect.element(dialog.getByRole('heading', { name: es.cap_title(null, 96) })).toBeVisible();
		await expect.element(dialog.getByText(es.cap_order_note(96, null))).toBeVisible();
		await dialog.getByRole('button', { name: es.cap_another }).click();
		await expect.element(dialog.getByRole('heading', { name: es.cap_title(null, 97) })).toBeVisible();
		await expect.element(dialog.getByText(es.cap_order_note(97, null))).toBeVisible();
		const where = dialog.getByRole('group', { name: es.cap_where }).element();
		expect([...where.querySelectorAll('img')].some((i) => (i.getAttribute('src') ?? '').includes('/records/images/5000/thumbnail'))).toBe(true);
	});

	it('a closed placeholder shows two empty pages and the Closed pill, and asks before a capture', async () => {
		served.records[1] = { ...placeholder(42, 96, null), closed_reason: 'foliation_skip', closed_note: null };
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText(es.pill_closed, { exact: true })).toBeVisible();
		expect(dialog.element().querySelectorAll('.img-viewer-frame[data-missing-side]')).toHaveLength(2);
		expect(dialog.element().textContent).not.toContain('image_not_supported');
		await dialog.getByRole('button', { name: 'Volver a capturar' }).click();
		await expect.element(dialog.getByText(es.lvm_retake_confirm)).toBeVisible();
		await dialog.getByRole('button', { name: 'Confirmar' }).click();
		await vi.waitFor(() => expect(served.captures).toHaveLength(1));
		expect(served.captures[0].path).toMatch(/\/cameras\/capture\/dual$/);
	});

	describe('leaving the after-panel (round 4)', () => {
		async function fill(screen: ReturnType<typeof render>) {
			const dialog = screen.getByRole('dialog');
			await dialog.getByRole('button', { name: es.retakes_capture, exact: true }).click();
			await expect.element(dialog.getByText(es.cap_another_q(null))).toBeVisible();
			// The reload after the fill has answered: the capture is no longer running.
			await expect.element(dialog.getByText(es.lvm_retaking)).not.toBeInTheDocument();
			return dialog;
		}
		function slowRecords() {
			let release!: (ok: boolean) => void;
			const gate = new Promise<boolean>((r) => (release = r));
			served.recordsNext = async () => ((await gate) ? json(served.records) : json({ detail: 'boom' }, 500));
			return release;
		}
		function expectLocked(screen: ReturnType<typeof render>, dialog: ReturnType<ReturnType<typeof render>['getByRole']>) {
			const capture = [...dialog.element().querySelectorAll('button')].find((b) => b.textContent?.trim() === es.retakes_capture);
			expect(capture).toBeUndefined();
			for (const b of dialog.getByRole('button', { name: es.common_close }).elements()) expect((b as HTMLButtonElement).disabled).toBe(true);
			for (const name of [es.cap_another, es.cap_last]) {
				expect((dialog.getByRole('button', { name }).element() as HTMLButtonElement).disabled).toBe(true);
			}
			expect((dialog.getByRole('button', { name: 'Saltar por ahora' }).element() as HTMLButtonElement).disabled).toBe(true);
			void screen;
		}

		it('That was the last one keeps the modal locked, with no Capture, until the guide has moved on', async () => {
			serve();
			const screen = render(LivePreview);
			const dialog = await fill(screen);
			const release = slowRecords();
			await dialog.getByRole('button', { name: es.cap_last }).click();
			await new Promise((r) => setTimeout(r, 50));
			expectLocked(screen, dialog);
			await userEvent.keyboard('{Escape}');
			await expect.element(screen.getByRole('dialog')).toBeVisible();
			release(true);
			await expect.element(screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' })).toBeVisible();
			await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		});

		it('Close in the after-panel stays locked the same way until the guide has moved on', async () => {
			serve();
			const screen = render(LivePreview);
			const dialog = await fill(screen);
			const release = slowRecords();
			await dialog.getByRole('button', { name: es.common_close }).first().click();
			await new Promise((r) => setTimeout(r, 50));
			expectLocked(screen, dialog);
			release(true);
			await expect.element(screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' })).toBeVisible();
		});

		it('a failed reload in the guide pauses it, and leaves nothing locked', async () => {
			serve();
			const screen = render(LivePreview);
			const dialog = await fill(screen);
			const release = slowRecords();
			await dialog.getByRole('button', { name: es.cap_last }).click();
			release(false);
			await expect.element(screen.getByText(es.retakes_load_error)).toBeVisible();
			await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
			await screen.getByRole('button', { name: es.common_retry }).click();
			await expect.element(screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' })).toBeVisible();
		});

		it('a failed reload outside the guide leaves the next modal free to close', async () => {
			current.url = BASE_URL;
			serve();
			const screen = render(LivePreview);
			const item = () => [...screen.container.querySelectorAll<HTMLElement>('.thumbnail-item')].find((b) => b.textContent?.includes('Par 97'))!;
			const hole = () => [...screen.container.querySelectorAll<HTMLElement>('.thumbnail-item')].find((b) => b.textContent?.includes('Par 96'))!;
			await vi.waitFor(() => expect(hole()).toBeTruthy());
			hole().click();
			const dialog = await fill(screen);
			const release = slowRecords();
			await dialog.getByRole('button', { name: es.common_close }).first().click();
			release(false);
			await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
			item().click();
			const next = screen.getByRole('dialog');
			await expect.element(next).toBeVisible();
			await next.getByRole('button', { name: es.common_close }).first().click();
			await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		});
	});
});

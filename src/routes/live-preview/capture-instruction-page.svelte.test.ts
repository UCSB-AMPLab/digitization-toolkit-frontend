// The capture page's instruction band (0.2.0), wired end to end: the page
// reads the stored lists and shows the item of the newest list whose volume
// is the open one; with no such item it falls back to the notes the import
// kept in the volume's custom_attributes; and it shows nothing when there
// is neither. Opened at 800x480, the band leaves the capture button and the
// thumbnail strip on screen and clickable. The lists never hold up the
// retake modal of a record opened from Book view (NEH-209). Every request
// is answered by a fetch mock keyed on the path. A volume whose every list
// item is withdrawn or hidden (contract 1.7) shows no band, and its
// custom_attributes are not read for one. No band shows while the lists
// request is waiting, so that notes the lists would replace never flash.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

// The address the page reads; a test may add a recordId.
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

import type { QueueItem, QueueList } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import '../../app.css';
import LivePreview from './+page.svelte';

function item(position: number, collectionId: number, over: Partial<QueueItem> = {}): QueueItem {
	return {
		position,
		sequence: position,
		referenceCode: `co-ahr-${position}`,
		filenameStem: `co-ahr-${position}`,
		title: `Tomo ${position}`,
		notes: null,
		action: null,
		collectionId,
		projectId: 2,
		status: null,
		doneMark: null,
		...over
	};
}

function list(listId: string, items: QueueItem[]): QueueList {
	return { listId, listName: listId, projectId: 2, importedAt: '2026-10-27T15:00:00', listFileMissing: false, items };
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const LONG = Array.from({ length: 300 }, (_, i) => `${100 + i}r, ${99 + i}v`).join('; ');

const rejectedRecord = {
	id: 41,
	title: '2026-10-20T09:15:00',
	status: 'rejected',
	capture_mode: 'single',
	collection_id: 9,
	images: []
};

// The volume carries `attributes`; the lists endpoint answers `lists`,
// fails when `lists` is null, and never answers when it is 'pending'.
function serve(attributes: string | null, lists: QueueList[] | null | 'pending') {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/imports/digitisation-lists')) {
			if (lists === 'pending') return new Promise<Response>(() => {});
			return lists ? json(lists) : json({ detail: 'boom' }, 500);
		}
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: attributes });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records')) return json([rejectedRecord]);
		if (path.includes('/cameras/capabilities')) return json({});
		return json([]);
	});
}

function signInAdmin() {
	authStore.setSession('tok', { id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
}

beforeEach(() => {
	current.url = BASE_URL;
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('capture page instruction', () => {
	it('shows the item of the newest list whose volume is open, over the volume attributes', async () => {
		locale.set('es');
		signInAdmin();
		serve(JSON.stringify({ fisqua: { notes: 'Notas viejas del volumen' } }), [
			list('new', [item(1, 3), item(2, 9, { notes: '117r, 116v; 193r, 192v', action: 'spot-recapture' })]),
			list('old', [item(5, 9, { notes: 'Todo el tomo', action: 'full-rescan' })])
		]);
		const screen = render(LivePreview);
		const band = screen.getByRole('note', { name: 'Recaptura puntual' });
		await expect.element(band).toBeVisible();
		await expect.element(band.getByText('117r, 116v; 193r, 192v')).toBeVisible();
		await expect.element(screen.getByText('Notas viejas del volumen')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Todo el tomo')).not.toBeInTheDocument();
		// Above the capture area, not inside it.
		const content = screen.container.querySelector('.content-area')!;
		expect(content.contains(band.element())).toBe(false);
		expect(band.element().compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('falls back to the volume custom_attributes when no list has an item for it', async () => {
		locale.set('es');
		signInAdmin();
		serve(JSON.stringify({ fisqua: { notes: 'Desde el folio 49r hasta el final', action: 'complete' } }), [
			list('new', [item(1, 3, { notes: 'Otro volumen' })])
		]);
		const screen = render(LivePreview);
		const band = screen.getByRole('note', { name: 'Completar digitalización' });
		await expect.element(band.getByText('Desde el folio 49r hasta el final')).toBeVisible();
	});

	it('falls back to the volume custom_attributes when the lists cannot be loaded', async () => {
		locale.set('es');
		signInAdmin();
		serve(JSON.stringify({ fisqua: { notes: 'Todo el tomo' } }), null);
		const screen = render(LivePreview);
		await expect.element(screen.getByRole('note', { name: 'Instrucción de la lista' }).getByText('Todo el tomo')).toBeVisible();
	});

	it('shows no band for a withdrawn queue item, without falling back to the volume custom_attributes', async () => {
		locale.set('es');
		signInAdmin();
		serve(JSON.stringify({ fisqua: { notes: 'Notas del volumen retirado', action: 'spot-recapture' } }), [
			list('queue', [item(1, 9, { notes: 'Notas retiradas', action: 'spot-recapture', withdrawn: true })]),
			list('file', [item(2, 9, { notes: 'Notas ocultas', queueHidden: true })])
		]);
		const screen = render(LivePreview);
		await expect.element(screen.getByText('Tomo 6')).toBeVisible();
		// The lists arrive after the volume: wait for them before checking.
		await expect.poll(() =>
			vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input).includes('/imports/digitisation-lists'))
		).toBe(true);
		await expect.poll(() => screen.container.querySelector('[role="note"]')).toBeNull();
		await expect.element(screen.getByText('Notas del volumen retirado')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Notas retiradas')).not.toBeInTheDocument();
	});

	it('shows the next-newest list item when the queue item for the volume is withdrawn', async () => {
		locale.set('es');
		signInAdmin();
		serve(JSON.stringify({ fisqua: { notes: 'Notas del volumen retirado' } }), [
			list('queue', [item(1, 9, { notes: 'Notas retiradas', action: 'spot-recapture', withdrawn: true })]),
			list('file', [item(2, 9, { notes: 'Todo el tomo', action: 'full-rescan' })])
		]);
		const screen = render(LivePreview);
		const band = screen.getByRole('note', { name: 'Reescaneo completo' });
		await expect.element(band.getByText('Todo el tomo')).toBeVisible();
		await expect.element(screen.getByText('Notas del volumen retirado')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Notas retiradas')).not.toBeInTheDocument();
	});

	it('shows no band while the lists request is waiting, even with notes in the volume custom_attributes', async () => {
		locale.set('es');
		signInAdmin();
		serve(JSON.stringify({ fisqua: { notes: 'Notas del volumen' } }), 'pending');
		const screen = render(LivePreview);
		// The volume has loaded: its name and its attributes are in.
		await expect.element(screen.getByText('Tomo 6')).toBeVisible();
		expect(screen.container.querySelector('[role="note"]')).toBeNull();
		await expect.element(screen.getByText('Notas del volumen')).not.toBeInTheDocument();
	});

	it('shows no band when neither the lists nor the volume carry an instruction', async () => {
		locale.set('es');
		signInAdmin();
		serve(null, [list('new', [item(1, 3)])]);
		const screen = render(LivePreview);
		await expect.element(screen.getByText('Tomo 6')).toBeVisible();
		expect(screen.container.querySelector('[role="note"]')).toBeNull();
	});

	it('opened at 800x480, leaves the capture button clickable and the thumbnail strip on screen', async () => {
		locale.set('es');
		signInAdmin();
		await browserPage.viewport(800, 480);
		serve(null, [list('new', [item(2, 9, { notes: LONG, action: 'spot-recapture' })])]);
		const screen = render(LivePreview);
		const toggle = screen.getByRole('button', { name: 'Mostrar todo' });
		await expect.element(toggle).toBeVisible();
		await toggle.click();
		await expect.element(screen.getByRole('button', { name: 'Mostrar menos' })).toBeVisible();

		const capture = screen.getByRole('button', { name: 'Capturar' }).element() as HTMLElement;
		const box = capture.getBoundingClientRect();
		const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		expect(hit && capture.contains(hit)).toBe(true);

		const thumbs = screen.container.querySelector('.thumbnail-area')!.getBoundingClientRect();
		expect(thumbs.bottom).toBeLessThanOrEqual(480 + 0.5);
		expect(thumbs.height).toBeGreaterThanOrEqual(139);

		// The band, open, scrolls inside its cap rather than growing past it.
		const band = screen.getByRole('note').element() as HTMLElement;
		expect(band.scrollHeight).toBeGreaterThan(band.clientHeight);
	});

	it('opens the retake modal for a recordId without waiting for the lists', async () => {
		locale.set('es');
		signInAdmin();
		current.url = `${BASE_URL}&recordId=41`;
		serve(null, 'pending');
		const screen = render(LivePreview);
		await expect.element(screen.getByRole('dialog')).toBeVisible();
	});
});

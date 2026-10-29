// The capture screen and the recapture turn (0.2.0), wired end to end:
// - an empty volume while the turn is `recaptures` shows the block panel and
//   no capture controls to an operator; an admin also gets the dashed
//   override, which brings the controls back;
// - an empty volume while the turn is `new` shows the green unlock band;
// - opened with the recordId of a rejected record, the screen guides the
//   operator through the volume's rejected records: "Recaptura k de N", a
//   progress bar, the next record opened after each retake, "Saltar por
//   ahora", the folios of the next record, and the end panel.
// Every request is answered by a fetch mock keyed on the path.
//
// Version: 0.2.0
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

import type { QueueItem, QueueList, RetakeSummary } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

type Rec = { id: number; title: string; status: string; sequence: number; capture_mode: string; collection_id: number; images: [] };

function rec(id: number, sequence: number, status: string): Rec {
	return { id, title: `Par ${sequence}`, status, sequence, capture_mode: 'single', collection_id: 9, images: [] };
}

function summary(state: 'free' | 'recaptures' | 'new'): RetakeSummary {
	return {
		pendingRecords: state === 'free' ? 0 : 5,
		volumes:
			state === 'free'
				? []
				: [
						{ collectionId: 30, projectId: 2, name: 'Tomo 030', filenameStem: 'co-30', pending: 3, total: 3, firstPendingRecordId: 300 },
						{ collectionId: 31, projectId: 2, name: 'Tomo 002', filenameStem: 'co-31', pending: 2, total: 2, firstPendingRecordId: 310 }
					],
		turn: { state, unlockedBy: state === 'new' ? { collectionId: 77, name: 'Tomo 077' } : null }
	};
}

function queueItem(position: number, collectionId: number): QueueItem {
	return {
		position,
		sequence: position,
		referenceCode: `co-${collectionId}`,
		filenameStem: `co-${collectionId}`,
		title: `Tomo ${collectionId}`,
		notes: null,
		action: null,
		collectionId,
		projectId: 2,
		status: null,
		doneMark: null
	};
}

// The state the fetch mock serves; each test sets it.
const served = {
	records: [] as Rec[],
	summaries: [] as RetakeSummary[],
	lists: [] as QueueList[],
	comments: new Map<number, string>()
};

function serve() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/records/to-retake/summary')) {
			// Each call takes the next summary; the last one repeats.
			const next = served.summaries.length > 1 ? served.summaries.shift()! : served.summaries[0];
			return json(next);
		}
		if (path.endsWith('/imports/digitisation-lists')) return json(served.lists);
		const rejections = path.match(/\/records\/(\d+)\/rejections$/);
		if (rejections) {
			const id = Number(rejections[1]);
			const comment = served.comments.get(id) ?? null;
			return json([{ id: 1, record_id: id, predefined_reason: 'other', comment, rejected_by: 'revisora', rejected_at: '2026-10-28T10:00:00', images: [] }]);
		}
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records')) return json(served.records.map((r) => ({ ...r })));
		if (path.endsWith('/cameras/capture')) {
			const body = JSON.parse(String(init?.body ?? '{}')) as { record_id?: number };
			const target = served.records.find((r) => r.id === body.record_id);
			if (target) target.status = 'captured';
			return json({ success: true, record_id: body.record_id });
		}
		return json([]);
	});
}

function signIn(role: UserRole) {
	authStore.setSession('tok', { id: 1, username: role, email: null, role, is_active: true });
}

beforeEach(() => {
	locale.set('es');
	current.url = BASE_URL;
	served.records = [];
	served.summaries = [summary('free')];
	served.lists = [];
	served.comments = new Map();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('capture screen: an empty volume in the retake turn', () => {
	it('shows an operator the block panel and no capture controls', async () => {
		signIn('operator');
		served.summaries = [summary('recaptures')];
		// The queue's first item with retakes is Tomo 002 (31), not the one with most pending.
		served.lists = [{ listId: 'l', listName: 'l', projectId: 2, importedAt: null, listFileMissing: false, items: [queueItem(1, 9), queueItem(2, 31), queueItem(3, 30)] }];
		serve();
		const screen = render(LivePreview);
		const block = screen.getByRole('region', { name: 'Primero, termina las recapturas de un volumen' });
		await expect.element(block).toBeVisible();
		await expect.element(block.getByText('Mientras en este equipo haya recapturas pendientes', { exact: false })).toBeVisible();
		await expect.element(block.getByText('Siguiente en la cola: Tomo 002, con 2 pares de páginas por recapturar.')).toBeVisible();
		await expect
			.element(block.getByRole('link', { name: 'Recapturar Tomo 002' }))
			.toHaveAttribute('href', '/live-preview?projectId=2&collectionId=31&recordId=310');
		await expect.element(block.getByRole('link', { name: 'Volver a la cola' })).toHaveAttribute('href', '/dashboard/queue');
		await expect.element(screen.getByRole('button', { name: 'Capturar de todos modos (administrador)' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Capturar', exact: true })).not.toBeInTheDocument();
		expect(screen.container.querySelector('.content-area')).toBeNull();
	});

	it('gives an admin the dashed override, which brings the capture controls back', async () => {
		signIn('admin');
		served.summaries = [summary('recaptures')];
		serve();
		const screen = render(LivePreview);
		const override = screen.getByRole('button', { name: 'Capturar de todos modos (administrador)' });
		await expect.element(override).toBeVisible();
		expect(getComputedStyle(override.element()).borderStyle).toBe('dashed');
		// Without lists, the volume with most pending is next.
		await expect.element(screen.getByText('Siguiente en la cola: Tomo 030, con 3 pares de páginas por recapturar.')).toBeVisible();
		await override.click();
		await expect.element(screen.getByRole('button', { name: 'Capturar', exact: true })).toBeVisible();
		await expect.element(screen.getByRole('region', { name: 'Primero, termina las recapturas de un volumen' })).not.toBeInTheDocument();
	});

	it('does not block a volume that already has records', async () => {
		signIn('operator');
		served.summaries = [summary('recaptures')];
		served.records = [rec(1, 1, 'captured')];
		serve();
		const screen = render(LivePreview);
		await expect.element(screen.getByRole('button', { name: 'Capturar', exact: true })).toBeVisible();
		await expect.element(screen.getByText('Primero, termina las recapturas de un volumen')).not.toBeInTheDocument();
	});

	it('does not block anything while no retake is pending', async () => {
		signIn('operator');
		serve();
		const screen = render(LivePreview);
		await expect.element(screen.getByRole('button', { name: 'Capturar', exact: true })).toBeVisible();
		await expect.element(screen.getByText('Primero, termina las recapturas de un volumen')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Puedes empezar este volumen')).not.toBeInTheDocument();
	});
});

describe('capture screen: an empty volume in the new-volume turn', () => {
	it('shows the green unlock band over the capture controls, until the operator starts', async () => {
		signIn('operator');
		served.summaries = [summary('new')];
		serve();
		const screen = render(LivePreview);
		const band = screen.getByRole('region', { name: 'Puedes empezar este volumen' });
		await expect.element(band).toBeVisible();
		await expect
			.element(band.getByText('Ya se terminaron las recapturas del volumen Tomo 077. Una vez empieces este volumen, puedes capturarlo sin límite; el siguiente turno será de recapturas.'))
			.toBeVisible();
		expect(getComputedStyle(band.element()).borderBottomColor).toBe('rgb(111, 191, 115)');
		await expect.element(screen.getByRole('button', { name: 'Capturar', exact: true })).toBeVisible();
		await band.getByRole('button', { name: 'Empezar a capturar' }).click();
		await expect.element(screen.getByRole('region', { name: 'Puedes empezar este volumen' })).not.toBeInTheDocument();
	});
});

describe('capture screen: the guided retake', () => {
	async function retakeCurrent(screen: ReturnType<typeof render>) {
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: 'Volver a capturar' }).click();
		await dialog.getByRole('button', { name: 'Confirmar' }).click();
	}

	it('goes through the rejected records in order, skips on request, and ends', async () => {
		signIn('operator');
		served.records = [rec(41, 1, 'rejected'), rec(44, 2, 'captured'), rec(42, 3, 'rejected'), rec(43, 4, 'rejected')];
		served.comments = new Map([
			[42, 'Folios 10r, 9v: recaptura pedida en la lista (imágenes 23 y 24 de AHR0108).'],
			[43, 'La imagen está movida.']
		]);
		served.summaries = [summary('recaptures')];
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('Recaptura 1 de 3 · Tomo 6')).toBeVisible();
		await expect.element(dialog.getByRole('progressbar', { name: 'Recaptura 1 de 3 · Tomo 6' })).toHaveAttribute('aria-valuenow', '0');
		await expect.element(dialog.getByText('Siguiente: folios 10r, 9v')).toBeVisible();

		await retakeCurrent(screen);
		await expect.element(dialog.getByText('Recaptura 2 de 3 · Tomo 6')).toBeVisible();
		await expect.element(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
		await expect.element(dialog.getByText('Par 3')).toBeVisible();
		// The next record's comment has no folios: no line.
		await expect.element(dialog.getByText('Siguiente: folios', { exact: false })).not.toBeInTheDocument();

		// Skipped: deferred to the back. k counts the retakes done, so it stays at 2.
		await dialog.getByRole('button', { name: 'Saltar por ahora' }).click();
		await expect.element(dialog.getByText('Recaptura 2 de 3 · Tomo 6')).toBeVisible();
		await expect.element(dialog.getByText('Par 4')).toBeVisible();

		// The skipped record comes back once the others are done; no end panel yet.
		await retakeCurrent(screen);
		await expect.element(dialog.getByText('Recaptura 3 de 3 · Tomo 6')).toBeVisible();
		await expect.element(dialog.getByText('Par 3')).toBeVisible();
		await expect.element(screen.getByText('Terminaste las recapturas', { exact: false })).not.toBeInTheDocument();

		await retakeCurrent(screen);
		const end = screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' });
		await expect.element(end).toBeVisible();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(end.getByRole('link', { name: 'Ir a la cola' })).toHaveAttribute('href', '/dashboard/queue');
		await expect
			.element(end.getByRole('link', { name: 'Recapturar otro volumen' }))
			.toHaveAttribute('href', '/live-preview?projectId=2&collectionId=30&recordId=300');
	});

	it('skips one of three, retakes the other two, reopens the skipped one, and ends only after it', async () => {
		signIn('operator');
		served.records = [rec(41, 1, 'rejected'), rec(42, 2, 'rejected'), rec(43, 3, 'rejected')];
		current.url = `${BASE_URL}&recordId=41`;
		served.summaries = [summary('recaptures')];
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('Par 1')).toBeVisible();

		await dialog.getByRole('button', { name: 'Saltar por ahora' }).click();
		await expect.element(dialog.getByText('Par 2')).toBeVisible();
		await retakeCurrent(screen);
		await expect.element(dialog.getByText('Par 3')).toBeVisible();
		await retakeCurrent(screen);

		// Both retaken: the skipped record opens again, and the volume still has it rejected.
		await expect.element(dialog.getByText('Par 1')).toBeVisible();
		await expect.element(dialog.getByText('Recaptura 3 de 3 · Tomo 6')).toBeVisible();
		await expect.element(screen.getByText('Terminaste las recapturas', { exact: false })).not.toBeInTheDocument();

		await retakeCurrent(screen);
		await expect.element(screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen.' })).toBeVisible();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('reopens a lone skipped record rather than ending', async () => {
		signIn('operator');
		served.records = [rec(41, 1, 'rejected'), rec(44, 2, 'captured')];
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('Recaptura 1 de 1 · Tomo 6')).toBeVisible();
		await dialog.getByRole('button', { name: 'Saltar por ahora' }).click();
		await expect.element(screen.getByRole('dialog').getByText('Recaptura 1 de 1 · Tomo 6')).toBeVisible();
		await expect.element(screen.getByText('Terminaste las recapturas', { exact: false })).not.toBeInTheDocument();
	});

	it('ends with the new-volume line when the last retake opened the turn', async () => {
		signIn('operator');
		served.records = [rec(41, 1, 'rejected'), rec(44, 2, 'captured')];
		// Before the retake, and after it.
		served.summaries = [summary('recaptures'), { ...summary('new'), volumes: [summary('new').volumes[0]] }];
		current.url = `${BASE_URL}&recordId=41`;
		serve();
		const screen = render(LivePreview);
		await expect.element(screen.getByRole('dialog').getByText('Recaptura 1 de 1 · Tomo 6')).toBeVisible();
		await retakeCurrent(screen);
		const end = screen.getByRole('region', { name: 'Terminaste las recapturas de este volumen. Ya puedes empezar un volumen nuevo.' });
		await expect.element(end).toBeVisible();
	});

	it('does not guide a record that is not rejected', async () => {
		signIn('operator');
		served.records = [rec(44, 1, 'captured')];
		current.url = `${BASE_URL}&recordId=44`;
		serve();
		const screen = render(LivePreview);
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		await expect.element(screen.getByText('Recaptura 1 de', { exact: false })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Saltar por ahora' })).not.toBeInTheDocument();
	});
});

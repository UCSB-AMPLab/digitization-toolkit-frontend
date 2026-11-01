// Por recapturar (/dashboard/retakes): every pending record from GET
// /records/to-retake, grouped under a heading per volume in the API's order
// (NEH-317), with its sequence, reason and gloss, comment, who rejected it
// and when, and a Repetir button into the capture screen's retake of that
// record, in the project the row gives. Placeholders and missing pages get
// Capture and a way to close them. The API is mocked.
//
// Version: 0.3.3
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.hoisted(() => vi.fn());
// The page store follows goto, as the router's would: `notify` re-emits it.
const pageUrl = vi.hoisted(() => ({ href: 'http://localhost/dashboard/retakes', notify: () => {} }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const state = () => ({ params: {}, get url() { return new URL(pageUrl.href); } });
	const store = writable(state());
	pageUrl.notify = () => store.set(state());
	return { page: { subscribe: store.subscribe } };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, collectionsApi, ApiError, type RecordToRetake } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import '../../../../app.css';
import Retakes from './+page.svelte';

const toRetake: RecordToRetake[] = [
	{
		recordId: 41,
		title: '2026-10-20T09:15:00',
		sequence: 12,
		collectionId: 5,
		projectId: 3,
		name: 'Tomo 6',
		filenameStem: 'co-ahr-aht-006',
		reason: 'blur',
		comment: 'El folio 112r salió movido.',
		rejectedBy: 'revisora',
		rejectedAt: '2026-10-21T14:00:00',
		pendingReason: 'rejected',
		missingSide: null
	},
	{
		recordId: 42,
		title: '2026-10-20T09:16:00',
		sequence: null,
		collectionId: 6,
		projectId: 4,
		name: 'Tomo 7',
		filenameStem: 'co-ahr-aht-007',
		reason: 'other',
		comment: null,
		rejectedBy: null,
		rejectedAt: '2026-10-22T14:00:00',
		pendingReason: 'rejected',
		missingSide: null
	},
	{
		recordId: 43,
		title: 'Sin rechazo registrado',
		sequence: 3,
		collectionId: 6,
		projectId: 4,
		name: 'Tomo 7',
		filenameStem: 'co-ahr-aht-007',
		reason: null,
		comment: null,
		rejectedBy: null,
		rejectedAt: null,
		pendingReason: 'rejected',
		missingSide: null
	},
	{
		recordId: 44,
		title: 'Registro suelto',
		sequence: null,
		collectionId: null,
		projectId: null,
		name: null,
		filenameStem: null,
		reason: 'glare',
		comment: null,
		rejectedBy: 'revisora',
		rejectedAt: '2026-10-23T14:00:00',
		pendingReason: 'rejected',
		missingSide: null
	}
];

function signIn(role: UserRole) {
	authStore.setSession('tok', { id: 1, username: role, email: null, role, is_active: true });
}

describe('Por recapturar', () => {
	beforeEach(() => {
		locale.set('es');
		gotoMock.mockReset();
		gotoMock.mockImplementation((to: string) => {
			pageUrl.href = new URL(to, pageUrl.href).href;
			pageUrl.notify();
		});
		pageUrl.href = 'http://localhost/dashboard/retakes';
		signIn('operator');
		// The volumes are not read: each row carries its project.
		vi.spyOn(collectionsApi, 'listAll').mockRejectedValue(new Error('not called'));
	});
	afterEach(() => {
		vi.restoreAllMocks();
		authStore.clearSession();
	});

	it('lists each record with its volume, sequence, reason, gloss, comment, and who rejected it when', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		await expect.element(screen.getByRole('heading', { level: 1, name: 'Por recapturar' })).toBeVisible();

		const rows = screen.getByRole('listitem');
		await expect.element(rows.first()).toBeVisible();
		expect(rows.elements()).toHaveLength(4);

		const tomo6 = screen.getByRole('region', { name: /^Tomo 6/ });
		await expect.element(tomo6.getByRole('heading', { level: 2 })).toHaveTextContent('Tomo 6');
		await expect.element(tomo6.getByText('co-ahr-aht-006')).toBeVisible();

		const first = rows.nth(0);
		await expect.element(first.getByText('2026-10-20T09:15:00')).toBeVisible();
		await expect.element(first.getByText('Secuencia 12')).toBeVisible();
		await expect.element(first.getByText('Imagen movida')).toBeVisible();
		await expect
			.element(first.getByText('La cámara o la página se movió durante la captura y los trazos se ven arrastrados.'))
			.toBeVisible();
		await expect.element(first.getByText('El folio 112r salió movido.')).toBeVisible();
		await expect.element(first.getByText(/^Rechazado por revisora el /)).toBeVisible();

		const second = rows.nth(1);
		await expect.element(second.getByText('Otro', { exact: true })).toBeVisible();
		await expect.element(second.getByText(/^Rechazado el /)).toBeVisible();
		await expect.element(second.getByText(/Secuencia/)).not.toBeInTheDocument();
	});

	it('shows a record without a rejection row without inventing a reason or a date', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		const third = screen.getByRole('listitem').nth(2);
		await expect.element(third.getByText('Sin rechazo registrado')).toBeVisible();
		await expect.element(third.getByText('No quedó registrado el motivo de este rechazo.')).toBeVisible();
		await expect.element(third.getByText(/^Rechazado/)).not.toBeInTheDocument();
		await expect.element(third.getByRole('button', { name: 'Volver a capturar' })).toBeVisible();
	});

	it('reads the naive UTC rejection time as UTC', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		// 14:00 UTC is 09:00 in Bogotá, the test browser's zone.
		const time = screen.getByRole('listitem').nth(0).getByRole('time');
		await expect.element(time).toHaveAttribute('datetime', '2026-10-21T14:00:00.000Z');
		await expect.element(time).toHaveTextContent(/9:00/);
	});

	it('groups the rows under a heading per volume, in the order the backend gives', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		await expect.element(screen.getByRole('listitem').first()).toBeVisible();
		const headings = screen.getByRole('heading', { level: 2 }).elements().map((h) => h.textContent?.replace(/\s+/g, ' ').trim());
		expect(headings).toEqual([
			'Tomo 6 co-ahr-aht-006 1 pendiente',
			'Tomo 7 co-ahr-aht-007 2 pendientes',
			'Este registro no está en ningún volumen.'
		]);
		const perGroup = screen.getByRole('region').elements().map((g) => g.querySelectorAll('li').length);
		expect(perGroup).toEqual([1, 2, 1]);
	});

	it('Repetir opens the capture screen on that record, in its volume and project', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		await screen.getByRole('listitem').nth(1).getByRole('button', { name: 'Volver a capturar' }).click();
		expect(gotoMock).toHaveBeenCalledWith('/live-preview?projectId=4&collectionId=6&recordId=42');
	});

	it('says when a record is in no volume, with no button', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		const fourth = screen.getByRole('listitem').nth(3);
		await expect.element(screen.getByRole('heading', { name: 'Este registro no está en ningún volumen.' })).toBeVisible();
		await expect.element(fourth.getByText('Reflejo/Brillo')).toBeVisible();
		await expect.element(fourth.getByRole('button', { name: 'Volver a capturar' })).not.toBeInTheDocument();
		expect(collectionsApi.listAll).not.toHaveBeenCalled();
	});

	it('labels the comment as a note for a screen reader', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		const comment = screen.getByText('El folio 112r salió movido.');
		await expect.element(comment).toBeVisible();
		expect(comment.element().closest('p')?.textContent).toBe('Nota: El folio 112r salió movido.');
	});

	it('gives a reviewer the list without the Repetir button', async () => {
		signIn('reviewer');
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		await expect.element(screen.getByRole('listitem').first()).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Volver a capturar' })).not.toBeInTheDocument();
	});

	it('says that nothing is waiting when the list is empty', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([]);
		const screen = render(Retakes);
		await expect.element(screen.getByText('No hay registros por recapturar.')).toBeVisible();
	});

	it('says when the list cannot be loaded', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockRejectedValue(new ApiError('boom', undefined, 500));
		const screen = render(Retakes);
		await expect.element(screen.getByText('No se pudo cargar la lista de registros por recapturar.')).toBeVisible();
	});

	describe('filter by volume', () => {
		it('offers every volume present in the rows, sorted by name, after All volumes', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
			const screen = render(Retakes);
			const select = screen.getByRole('combobox', { name: 'Volumen' });
			await expect.element(select).toBeVisible();
			const options = Array.from(select.element().querySelectorAll('option')).map((o) => o.textContent?.trim());
			expect(options).toEqual(['Todos los volúmenes', 'Tomo 6 co-ahr-aht-006', 'Tomo 7 co-ahr-aht-007']);
			expect(screen.getByRole('listitem').elements()).toHaveLength(4);
		});

		it('filters the rows by ?collectionId= and keeps the select on that volume', async () => {
			pageUrl.href = 'http://localhost/dashboard/retakes?collectionId=6';
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
			const screen = render(Retakes);
			await expect.element(screen.getByRole('listitem').first()).toBeVisible();
			expect(screen.getByRole('listitem').elements()).toHaveLength(2);
			expect((screen.getByRole('combobox', { name: 'Volumen' }).element() as HTMLSelectElement).value).toBe('6');
		});

		it('selecting a volume rewrites the query string in place and narrows the rows', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
			const screen = render(Retakes);
			await expect.element(screen.getByRole('listitem').first()).toBeVisible();
			await screen.getByRole('combobox', { name: 'Volumen' }).selectOptions('5');
			expect(gotoMock).toHaveBeenCalledWith('?collectionId=5', { replaceState: true, keepFocus: true, noScroll: true });
			expect(screen.getByRole('listitem').elements()).toHaveLength(1);
		});

		it('choosing All volumes drops the query', async () => {
			pageUrl.href = 'http://localhost/dashboard/retakes?collectionId=5';
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
			const screen = render(Retakes);
			await expect.element(screen.getByRole('listitem').first()).toBeVisible();
			await screen.getByRole('combobox', { name: 'Volumen' }).selectOptions('');
			expect(gotoMock).toHaveBeenCalledWith('?', { replaceState: true, keepFocus: true, noScroll: true });
			expect(screen.getByRole('listitem').elements()).toHaveLength(4);
		});

		it('says so when the volume in the query has no rows', async () => {
			pageUrl.href = 'http://localhost/dashboard/retakes?collectionId=99';
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
			const screen = render(Retakes);
			await expect.element(screen.getByText('Este volumen no tiene registros por recapturar.')).toBeVisible();
			expect(screen.getByRole('listitem').elements()).toHaveLength(0);
		});

		it('hides the select when the rows span a single volume', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([toRetake[0]]);
			const screen = render(Retakes);
			await expect.element(screen.getByText('Tomo 6')).toBeVisible();
			expect(screen.getByRole('combobox').elements()).toHaveLength(0);
		});

		it('keeps the select while a volume is chosen, even when the rows span one volume', async () => {
			pageUrl.href = 'http://localhost/dashboard/retakes?collectionId=5';
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([toRetake[0]]);
			const screen = render(Retakes);
			const select = screen.getByRole('combobox', { name: 'Volumen' });
			await expect.element(select).toBeVisible();
			expect((select.element() as HTMLSelectElement).value).toBe('5');
		});
	});

	describe('records that miss a side, and records prepared for retake (0.3.2)', () => {
		const missingRow: RecordToRetake = {
			recordId: 50, title: 'Par sin izquierda', sequence: 8, collectionId: 5, projectId: 3,
			name: 'Tomo 6', filenameStem: 'co-ahr-aht-006',
			reason: null, comment: null, rejectedBy: null, rejectedAt: null,
			pendingReason: 'missing_side', missingSide: 'left'
		};
		const preparedRow: RecordToRetake = {
			recordId: 51, title: 'Par preparado', sequence: 9, collectionId: 5, projectId: 3,
			name: 'Tomo 6', filenameStem: 'co-ahr-aht-006',
			reason: 'glare', comment: 'Reflejo en el folio 9v.', rejectedBy: 'revisora', rejectedAt: '2026-10-24T14:00:00',
			pendingReason: 'prepared', missingSide: null
		};

		it('a record that misses a side says so where a rejection gives its reason, with no rejection fields', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([missingRow]);
			const screen = render(Retakes);
			const row = screen.getByRole('listitem').first();
			await expect.element(row.getByText('Par sin izquierda')).toBeVisible();
			await expect.element(row.getByText(es.pill_page_missing)).toBeVisible();
			await expect.element(row.getByText(es.retakes_page_missing_row('left'))).toBeVisible();
			await expect.element(row.getByText('No quedó registrado el motivo de este rechazo.')).not.toBeInTheDocument();
			await expect.element(row.getByText(/^Rechazado/)).not.toBeInTheDocument();
			await expect.element(row.getByRole('button', { name: es.retakes_no_page })).toBeVisible();
			await expect.element(row.getByRole('button', { name: es.retakes_capture, exact: true })).toBeVisible();
			await expect.element(row.getByRole('button', { name: 'Volver a capturar' })).not.toBeInTheDocument();
		});

		it('shows no older rejection with a missing side, should the backend send one', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([{ ...missingRow, reason: 'blur', comment: 'Una nota antigua.', rejectedBy: 'revisora', rejectedAt: '2026-10-01T14:00:00' }]);
			const screen = render(Retakes);
			const row = screen.getByRole('listitem').first();
			await expect.element(row.getByText(es.retakes_page_missing_row('left'))).toBeVisible();
			await expect.element(row.getByText('Una nota antigua.')).not.toBeInTheDocument();
			await expect.element(row.getByText('Imagen movida')).not.toBeInTheDocument();
			await expect.element(row.getByText(/^Rechazado/)).not.toBeInTheDocument();
		});

		it('lists it with the others, so the rows count it', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([...toRetake, missingRow, preparedRow]);
			const screen = render(Retakes);
			const rows = screen.getByRole('listitem');
			await expect.element(rows.first()).toBeVisible();
			expect(rows.elements()).toHaveLength(6);
		});

		it('a record prepared for retake still shows its rejection', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([preparedRow]);
			const screen = render(Retakes);
			const row = screen.getByRole('listitem').first();
			await expect.element(row.getByText('Reflejo en el folio 9v.')).toBeVisible();
			await expect.element(row.getByText(/^Rechazado por revisora el /)).toBeVisible();
			await expect.element(row.getByText(es.pill_page_missing)).not.toBeInTheDocument();
		});
	});

	describe('placeholders and missing pages (NEH-317)', () => {
		const placeholderRow: RecordToRetake = {
			recordId: 60, title: 'Par vacío', sequence: 96, collectionId: 5, projectId: 3,
			name: 'Tomo 6', filenameStem: 'co-ahr-aht-006',
			reason: null, comment: null, rejectedBy: null, rejectedAt: null,
			pendingReason: 'missing_side', missingSide: 'both',
			missingExpected: 'Folios 90v y 91r', missingNote: 'Parece faltar el folio 91; revisa el volumen.', requestId: 'req-1'
		};
		const pageRow: RecordToRetake = {
			recordId: 61, title: 'Par sin derecha', sequence: 99, collectionId: 5, projectId: 3,
			name: 'Tomo 6', filenameStem: 'co-ahr-aht-006',
			reason: null, comment: null, rejectedBy: null, rejectedAt: null,
			pendingReason: 'missing_side', missingSide: 'right',
			missingExpected: null, missingNote: null, requestId: null
		};

		it('replaces the subtitle', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([placeholderRow]);
			const screen = render(Retakes);
			await expect.element(screen.getByText(es.retakes_subtitle)).toBeVisible();
		});

		it('a placeholder row shows its pill, what it should hold, the note, No opening here and Capture', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([placeholderRow]);
			const screen = render(Retakes);
			const row = screen.getByRole('listitem').first();
			await expect.element(row.getByText(es.pill_opening_missing)).toBeVisible();
			await expect.element(row.getByText('Folios 90v y 91r')).toBeVisible();
			await expect.element(row.getByText('Parece faltar el folio 91; revisa el volumen.')).toBeVisible();
			await expect.element(row.getByText(es.missing_page_reason)).not.toBeInTheDocument();
			await expect.element(row.getByRole('button', { name: es.retakes_no_opening })).toBeVisible();
			await row.getByRole('button', { name: es.retakes_capture, exact: true }).click();
			expect(gotoMock).toHaveBeenCalledWith('/live-preview?projectId=3&collectionId=5&recordId=60');
		});

		it('No opening here opens the close dialog; closing takes the row off the list', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([placeholderRow, pageRow]);
			const spy = vi.spyOn(recordsApi, 'closeMissing').mockResolvedValue({
				id: 60, title: 'Par vacío', status: 'captured', capture_mode: 'dual', images: [], missing_side: 'both', closed_reason: 'foliation_skip'
			});
			const screen = render(Retakes);
			await screen.getByRole('listitem').first().getByRole('button', { name: es.retakes_no_opening }).click();
			const dialog = screen.getByRole('dialog', { name: es.close_title });
			await expect.element(dialog).toBeVisible();
			await dialog.getByRole('radio', { name: es.close_reason_skip }).click();
			await dialog.getByRole('button', { name: es.close_submit }).click();
			await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
			expect(spy).toHaveBeenCalledWith(60, { reason: 'foliation_skip', note: null });
			expect(screen.getByRole('listitem').elements()).toHaveLength(1);
			await expect.element(screen.getByText('Par vacío')).not.toBeInTheDocument();
			await expect.element(screen.getByRole('heading', { level: 2 })).toHaveTextContent('1 pendiente');
		});

		it('No page here opens the close dialog for a missing page; Back to capture leaves the row', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([pageRow]);
			const screen = render(Retakes);
			await screen.getByRole('listitem').first().getByRole('button', { name: es.retakes_no_page }).click();
			const dialog = screen.getByRole('dialog', { name: es.close_page_title });
			await expect.element(dialog.getByRole('button', { name: es.close_page_submit })).toBeVisible();
			await dialog.getByRole('button', { name: es.close_back }).click();
			await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
			expect(screen.getByRole('listitem').elements()).toHaveLength(1);
		});

		it('a missing-page row names its side and offers Capture', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([pageRow]);
			const screen = render(Retakes);
			const row = screen.getByRole('listitem').first();
			await expect.element(row.getByText(es.retakes_page_missing_row('right'))).toBeVisible();
			await row.getByRole('button', { name: es.retakes_capture, exact: true }).click();
			expect(gotoMock).toHaveBeenCalledWith('/live-preview?projectId=3&collectionId=5&recordId=61');
		});

		it('writes which page is missing as plain muted text, like a rejection\'s explanation', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([toRetake[0], pageRow]);
			const screen = render(Retakes);
			const explanation = screen.getByText(es.retakes_page_missing_row('right'));
			const gloss = screen.getByText('La cámara o la página se movió durante la captura y los trazos se ven arrastrados.');
			await expect.element(explanation).toBeVisible();
			const a = getComputedStyle(explanation.element());
			const b = getComputedStyle(gloss.element());
			expect(a.fontWeight).toBe(b.fontWeight);
			expect(a.color).toBe(b.color);
			expect(a.fontSize).toBe(b.fontSize);
		});

		it('rejected rows keep their Retake button and no close button', async () => {
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([toRetake[0]]);
			const screen = render(Retakes);
			const row = screen.getByRole('listitem').first();
			await expect.element(row.getByRole('button', { name: 'Volver a capturar' })).toBeVisible();
			await expect.element(row.getByRole('button', { name: es.retakes_no_opening })).not.toBeInTheDocument();
			await expect.element(row.getByRole('button', { name: es.retakes_no_page })).not.toBeInTheDocument();
		});

		it('gives a reviewer neither Capture nor the close buttons', async () => {
			signIn('reviewer');
			vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([placeholderRow, pageRow]);
			const screen = render(Retakes);
			await expect.element(screen.getByRole('listitem').first()).toBeVisible();
			await expect.element(screen.getByRole('button', { name: es.retakes_capture, exact: true })).not.toBeInTheDocument();
			await expect.element(screen.getByRole('button', { name: es.retakes_no_opening })).not.toBeInTheDocument();
			await expect.element(screen.getByRole('button', { name: es.retakes_no_page })).not.toBeInTheDocument();
		});
	});
});

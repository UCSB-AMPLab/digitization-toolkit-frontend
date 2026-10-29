// Por recapturar (/dashboard/retakes): every rejected record from GET
// /records/to-retake, with its volume, sequence, reason and gloss, comment,
// who rejected it and when, and a Repetir button into the capture screen's
// retake of that record, in the project the row gives. The API is mocked.
//
// Version: 0.2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, collectionsApi, ApiError, type RecordToRetake } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
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
		rejectedAt: '2026-10-21T14:00:00'
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
		rejectedAt: '2026-10-22T14:00:00'
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
		rejectedAt: null
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
		rejectedAt: '2026-10-23T14:00:00'
	}
];

function signIn(role: UserRole) {
	authStore.setSession('tok', { id: 1, username: role, email: null, role, is_active: true });
}

describe('Por recapturar', () => {
	beforeEach(() => {
		locale.set('es');
		gotoMock.mockClear();
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

		const first = rows.nth(0);
		await expect.element(first.getByText('Tomo 6')).toBeVisible();
		await expect.element(first.getByText('co-ahr-aht-006')).toBeVisible();
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

		it('keeps the order the backend gives, oldest rejection first', async () => {
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue(toRetake);
		const screen = render(Retakes);
		await expect.element(screen.getByRole('listitem').first()).toBeVisible();
		const volumes = screen.getByRole('listitem').elements().map((r) => r.querySelector('.rt-volume-name')?.textContent?.trim());
		expect(volumes).toEqual(['Tomo 6', 'Tomo 7', 'Tomo 7', undefined]);
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
		await expect.element(fourth.getByText('Este registro no está en ningún volumen.')).toBeVisible();
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
		await expect.element(screen.getByText('Tomo 6')).toBeVisible();
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
});

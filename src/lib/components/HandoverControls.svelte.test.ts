// NEH-260: the operator's handover controls in the volume top bar — which
// buttons show for which mix of statuses, what each dialog says, and what is
// reported after promote and take-back answer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, ApiError, type Record as ApiRecord } from '$lib/api';
import HandoverControls from './HandoverControls.svelte';

type S = ApiRecord['status'];
let nextId = 1;
function rec(status: S, title?: string): ApiRecord {
	const id = nextId++;
	return { id, title: title ?? `Registro ${id}`, status, capture_mode: 'single', images: [] } as ApiRecord;
}
function recs(spec: Partial<{ [K in S]: number }>): ApiRecord[] {
	return (Object.entries(spec) as [S, number][]).flatMap(([s, n]) => Array.from({ length: n }, () => rec(s)));
}

describe('HandoverControls', () => {
	let promoteSpy: ReturnType<typeof vi.spyOn>;
	let takeBackSpy: ReturnType<typeof vi.spyOn>;
	let onChanged: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		nextId = 1;
		promoteSpy = vi.spyOn(collectionsApi, 'promote');
		takeBackSpy = vi.spyOn(collectionsApi, 'takeBack');
		onChanged = vi.fn();
	});
	afterEach(() => {
		promoteSpy.mockRestore();
		takeBackSpy.mockRestore();
	});

	const mount = (records: ApiRecord[]) => render(HandoverControls, { records, collectionId: 7, onChanged });

	it('a captured volume offers "Enviar a revisión" and no take-back', async () => {
		const screen = mount(recs({ captured: 3 }));
		await expect.element(screen.getByRole('button', { name: 'Enviar a revisión' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Retirar de revisión' })).not.toBeInTheDocument();
	});

	it('a volume with new captures after the send offers both, naming the new records', async () => {
		const screen = mount(recs({ in_review: 24, captured: 1 }));
		await expect.element(screen.getByRole('button', { name: 'Retirar de revisión' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Enviar 1 registro nuevo' })).toBeVisible();
	});

	it('a volume entirely in review offers only take-back', async () => {
		const screen = mount(recs({ in_review: 2 }));
		await expect.element(screen.getByRole('button', { name: 'Retirar de revisión' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: /Enviar/ })).not.toBeInTheDocument();
	});

	it('send: confirms with the count, calls promote, reports the result and reloads', async () => {
		promoteSpy.mockResolvedValue({ collection_id: 7, promoted: 37 });
		const screen = mount(recs({ captured: 37 }));
		await screen.getByRole('button', { name: 'Enviar a revisión' }).click();

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('¿Enviar el volumen a revisión?')).toBeVisible();
		await expect.element(dialog.getByText('Los 37 registros capturados quedarán en revisión.', { exact: false })).toBeVisible();
		expect(promoteSpy).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
		expect(promoteSpy).toHaveBeenCalledWith(7);
		await expect.element(screen.getByRole('status')).toHaveTextContent(/^Se enviaron 37 registros a revisión\.$/);
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(onChanged).toHaveBeenCalled();
	});

	it('send: Cancelar closes the dialog without calling promote', async () => {
		const screen = mount(recs({ captured: 2 }));
		await screen.getByRole('button', { name: 'Enviar a revisión' }).click();
		await screen.getByRole('button', { name: 'Cancelar' }).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(promoteSpy).not.toHaveBeenCalled();
	});

	it('send refused: names the blocking records and says nothing changed', async () => {
		const records = [rec('captured', 'Folio 12'), rec('captured', 'Folio 13'), rec('captured', 'Folio 31')];
		promoteSpy.mockRejectedValue(new ApiError('Cannot hand over', { message: 'x', blocking_record_ids: [records[0].id, records[2].id] }));
		const screen = mount(records);
		await screen.getByRole('button', { name: 'Enviar a revisión' }).click();
		await screen.getByRole('button', { name: 'Enviar', exact: true }).click();

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('No se pudo enviar el volumen')).toBeVisible();
		await expect.element(dialog.getByText('Hay 2 registros que todavía no se pueden enviar', { exact: false })).toBeVisible();
		await expect.element(dialog.getByText('Folio 12')).toBeVisible();
		await expect.element(dialog.getByText('Folio 31')).toBeVisible();
		await expect.element(dialog.getByText('Folio 13')).not.toBeInTheDocument();
		await expect.element(dialog.getByText('No se cambió el estado de ningún registro.')).toBeVisible();
	});

	it('send failed for another reason: an error notice, no refusal dialog', async () => {
		promoteSpy.mockRejectedValue(new Error('network'));
		const screen = mount(recs({ captured: 1 }));
		await screen.getByRole('button', { name: 'Enviar a revisión' }).click();
		await screen.getByRole('button', { name: 'Enviar', exact: true }).click();
		await expect.element(screen.getByRole('alert')).toHaveTextContent(/^No se pudo enviar el volumen a revisión\. Intenta de nuevo\.$/);
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('take-back: states what returns and what stays, calls take-back, reports the result', async () => {
		takeBackSpy.mockResolvedValue({ collection_id: 7, taken_back: 24 });
		const screen = mount(recs({ in_review: 24, approved: 9, rejected: 4 }));
		await screen.getByRole('button', { name: 'Retirar de revisión' }).click();

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('Los 24 registros en revisión quedarán otra vez en estado Capturado', { exact: false })).toBeVisible();
		await expect.element(dialog.getByText('Los 9 registros aprobados y los 4 rechazados se quedan como están, porque ya se revisaron.')).toBeVisible();

		await dialog.getByRole('button', { name: 'Retirar', exact: true }).click();
		expect(takeBackSpy).toHaveBeenCalledWith(7);
		await expect.element(screen.getByRole('status')).toHaveTextContent(/^Se retiraron 24 registros de revisión\.$/);
		expect(onChanged).toHaveBeenCalled();
	});

	it('take-back with nothing reviewed leaves out the "se quedan" line', async () => {
		const screen = mount(recs({ in_review: 1 }));
		await screen.getByRole('button', { name: 'Retirar de revisión' }).click();
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('El registro en revisión quedará otra vez en estado Capturado', { exact: false })).toBeVisible();
		await expect.element(dialog.getByText('se queda', { exact: false })).not.toBeInTheDocument();
	});

	it('Escape closes a dialog', async () => {
		const screen = mount(recs({ captured: 1 }));
		await screen.getByRole('button', { name: 'Enviar a revisión' }).click();
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
	});
});

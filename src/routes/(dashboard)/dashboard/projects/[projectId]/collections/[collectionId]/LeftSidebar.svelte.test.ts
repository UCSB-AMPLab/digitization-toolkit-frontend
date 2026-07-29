// NEH-209 (4th correction): the reason dropdown is replaced by always-visible
// chips (no open/close step) merged with the comment box into one
// chips+comment+Guardar/Cancelar form. "Rechazar" now depends on whether the
// record already has a SAVED error annotation (not the live chip selection,
// which is cleared after every Guardar) and sends the first error type of
// the OLDEST saved annotation as predefined_reason.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord, type RecordAnnotation } from '$lib/api';
import LeftSidebar from './LeftSidebar.svelte';

function makeRecord(overrides: Partial<ApiRecord> = {}): ApiRecord {
	return {
		id: 1,
		title: 'Test record',
		status: 'in_review',
		capture_mode: 'single',
		images: [],
		...overrides
	};
}

function makeAnnotation(overrides: Partial<RecordAnnotation> = {}): RecordAnnotation {
	return {
		id: 1,
		record_id: 1,
		error_types: [],
		note: undefined,
		created_at: '',
		...overrides
	};
}

function baseProps(overrides: Record<string, unknown> = {}) {
	return {
		viewMode: 'spread' as const,
		currentIndex: 1,
		totalRecords: 1,
		onRotateLeft: vi.fn(),
		onRotateRight: vi.fn(),
		onRecordUpdated: vi.fn(),
		onRecapture: vi.fn(),
		currentRecord: makeRecord(),
		userRole: 'reviewer',
		...overrides
	};
}

async function openAnnotationsTab(screen: { getByRole: (...a: any[]) => any }) {
	await screen.getByRole('button', { name: 'Anotaciones' }).click();
}

describe('LeftSidebar — review controls (NEH-209, 4th correction: reason chips)', () => {
	let rejectSpy: ReturnType<typeof vi.spyOn>;
	let updateStatusSpy: ReturnType<typeof vi.spyOn>;
	let getAnnotationsSpy: ReturnType<typeof vi.spyOn>;
	let addAnnotationSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		rejectSpy = vi.spyOn(recordsApi, 'reject');
		updateStatusSpy = vi.spyOn(recordsApi, 'updateStatus');
		getAnnotationsSpy = vi.spyOn(recordsApi, 'getAnnotations').mockResolvedValue([]);
		addAnnotationSpy = vi.spyOn(recordsApi, 'addAnnotation');
	});

	afterEach(() => {
		rejectSpy.mockRestore();
		updateStatusSpy.mockRestore();
		getAnnotationsSpy.mockRestore();
		addAnnotationSpy.mockRestore();
	});

	it('all 6 reason chips are visible immediately — no dropdown/listbox to open', async () => {
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);

		for (const label of ['Imagen Borrosa', 'Reflejo/Brillo', 'Sombras', 'Fuera de Foco', 'Exposición', 'Impurezas en superficie']) {
			await expect.element(screen.getByRole('button', { name: label, exact: true })).toBeVisible();
		}
		await expect.element(screen.getByRole('listbox')).not.toBeInTheDocument();
	});

	it('Guardar is disabled with 0 chips even if the comment has text, and enables once a chip is tapped', async () => {
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);

		await screen.getByPlaceholder('Agrega un comentario (opcional)...').fill('solo un comentario, sin motivo');
		await expect.element(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await expect.element(screen.getByRole('button', { name: 'Guardar' })).not.toBeDisabled();
	});

	it('tapping a second chip keeps both selected; untapping one leaves the other selected (verified via the saved payload)', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: ['glare'] }));
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await screen.getByRole('button', { name: 'Reflejo/Brillo', exact: true }).click();
		// Untap "Imagen Borrosa" — only "Reflejo/Brillo" should remain selected.
		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await screen.getByRole('button', { name: 'Guardar' }).click();

		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);
		expect(addAnnotationSpy).toHaveBeenCalledWith(1, { error_types: ['glare'], note: undefined });
	});

	it('Guardar saves the selected chips + comment together as ONE annotation, then resets (chips deselect, Guardar disabled again)', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: ['blur', 'glare'], note: 'nota completa' }));
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await screen.getByRole('button', { name: 'Reflejo/Brillo', exact: true }).click();
		await screen.getByPlaceholder('Agrega un comentario (opcional)...').fill('nota completa');
		await screen.getByRole('button', { name: 'Guardar' }).click();

		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);
		expect(addAnnotationSpy).toHaveBeenCalledWith(1, { error_types: ['blur', 'glare'], note: 'nota completa' });

		// Reset: no chips selected, nothing to save anymore.
		await expect.element(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
	});

	it('Cancelar discards chips + comment without saving anything', async () => {
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await screen.getByPlaceholder('Agrega un comentario (opcional)...').fill('cambié de opinión');
		await screen.getByRole('button', { name: 'Cancelar', exact: true }).click();

		expect(addAnnotationSpy).not.toHaveBeenCalled();
		await expect.element(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
	});

	it('in_review with no saved error annotations yet: Aprobar enabled, Rechazar disabled', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }) }));
		await openAnnotationsTab(screen);
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
	});

	it('Rechazar stays disabled while chips are only selected (not yet saved), and enables once Guardar persists an error annotation', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: ['exposure'] }));
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }) }));
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Exposición', exact: true }).click();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled();

		await screen.getByRole('button', { name: 'Guardar' }).click();
		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeDisabled();
	});

	it('approved: Aprobar disabled (can\'t approve twice), Rechazar enabled (undo, no saved annotation needed)', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'approved' }) }));
		await openAnnotationsTab(screen);
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeDisabled();
	});

	it('rejected + admin: "Recapturar imagen" replaces Rechazar, Aprobar (undo) also available, and clicking it calls onRecapture', async () => {
		const onRecapture = vi.fn();
		const record = makeRecord({ status: 'rejected' });
		const screen = render(LeftSidebar, baseProps({ currentRecord: record, userRole: 'admin', onRecapture }));
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Recapturar imagen' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeDisabled();

		await screen.getByRole('button', { name: 'Recapturar imagen' }).click();
		expect(onRecapture).toHaveBeenCalledWith(record);
	});

	it('rejected + reviewer: no "Recapturar imagen" button (can\'t operate a camera), Rechazar just stays disabled', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'rejected' }), userRole: 'reviewer' }));
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Recapturar imagen' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeDisabled();
	});

	it('clicking Aprobar/Rechazar opens a confirm popup and does NOT call the API until confirmed', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }) }));
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Aprobar' }).click();

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('¿Confirmas que quieres aprobar esta imagen?')).toBeVisible();
		expect(updateStatusSpy).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(updateStatusSpy).not.toHaveBeenCalled();
	});

	it('formal approve (in_review) calls updateStatus(id, "approved") after confirming', async () => {
		updateStatusSpy.mockResolvedValue(makeRecord({ status: 'approved' }));
		const onRecordUpdated = vi.fn();
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }), onRecordUpdated }));
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Aprobar' }).click();
		await screen.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect.poll(() => updateStatusSpy.mock.calls.length).toBe(1);
		expect(updateStatusSpy).toHaveBeenCalledWith(1, 'approved');
		expect(onRecordUpdated).toHaveBeenCalledTimes(1);
	});

	it('formal reject sends the first error type of the OLDEST saved annotation as predefined_reason', async () => {
		// annotations arrive newest-first from the backend: 'dirt' is the most
		// recent flag, 'glare' was the first problem ever flagged on this record.
		getAnnotationsSpy.mockResolvedValue([
			makeAnnotation({ id: 2, error_types: ['dirt'], created_at: '2026-01-02' }),
			makeAnnotation({ id: 1, error_types: ['glare'], created_at: '2026-01-01' })
		]);
		rejectSpy.mockResolvedValue(makeRecord({ status: 'rejected' }));
		const onRecordUpdated = vi.fn();
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }), onRecordUpdated }));
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Rechazar' }).click();
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('¿Confirmas que quieres rechazar esta imagen?')).toBeVisible();
		await dialog.getByRole('button', { name: 'Confirmar' }).click();

		await expect.poll(() => rejectSpy.mock.calls.length).toBe(1);
		expect(rejectSpy).toHaveBeenCalledWith(1, { predefined_reason: 'glare', comment: undefined });
		expect(onRecordUpdated).toHaveBeenCalledTimes(1);
	});

	it('undo an approval: Rechazar on an approved record reverts to in_review with no saved annotation required', async () => {
		updateStatusSpy.mockResolvedValue(makeRecord({ status: 'in_review' }));
		const onRecordUpdated = vi.fn();
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'approved' }), onRecordUpdated }));
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Rechazar' }).click();
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('¿Confirmas que quieres deshacer la aprobación de esta imagen?')).toBeVisible();
		await dialog.getByRole('button', { name: 'Confirmar' }).click();

		await expect.poll(() => updateStatusSpy.mock.calls.length).toBe(1);
		expect(updateStatusSpy).toHaveBeenCalledWith(1, 'in_review');
		expect(rejectSpy).not.toHaveBeenCalled();
		expect(onRecordUpdated).toHaveBeenCalledTimes(1);
	});

	it('operator on an in_review record sees no review actions at all (can\'t approve/reject, and nothing to recapture yet)', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }), userRole: 'operator' }));
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Recapturar imagen' })).not.toBeInTheDocument();
	});

	it('operator on a rejected record sees ONLY "Recapturar imagen" — no Aprobar (operators don\'t approve/reject)', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'rejected' }), userRole: 'operator' }));
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Recapturar imagen' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
	});
});

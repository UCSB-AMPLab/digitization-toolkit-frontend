// NEH-anotaciones-rechazo: "Marcar error" and "Agregar nota" are two
// independent accordion buttons (collapsed by default, icon + label,
// neutral surface style) — each expands in-line to its own content
// (a vertical checkmark-row list of error types, or a comment textarea)
// plus its own "Listo" button, and each creates its OWN annotation
// (error_types only, or note only) instead of a combined one. "Rechazar"
// still depends on whether the record already has a SAVED error
// annotation (not the live checklist selection, which is cleared after
// every "Listo") and sends the first error type of the OLDEST saved
// annotation as predefined_reason.
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

async function openReasonCard(screen: { getByRole: (...a: any[]) => any }) {
	await screen.getByRole('button', { name: 'Marcar error' }).click();
}

async function openNoteCard(screen: { getByRole: (...a: any[]) => any }) {
	await screen.getByRole('button', { name: 'Agregar nota' }).click();
}

describe('LeftSidebar — review controls (NEH-anotaciones-rechazo: two independent accordions)', () => {
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

	it('both accordions start collapsed — no error rows or comment box visible until tapped', async () => {
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Marcar error' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Agregar nota' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Imagen Borrosa', exact: true })).not.toBeInTheDocument();
		await expect.element(screen.getByPlaceholder('Agrega un comentario (opcional)...')).not.toBeInTheDocument();
	});

	it('tapping "Marcar error" expands all 6 error rows; tapping it again collapses without saving', async () => {
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);
		await openReasonCard(screen);

		for (const label of ['Imagen Borrosa', 'Reflejo/Brillo', 'Sombras', 'Fuera de Foco', 'Exposición', 'Impurezas en superficie']) {
			await expect.element(screen.getByRole('button', { name: label, exact: true })).toBeVisible();
		}

		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await openReasonCard(screen); // tap the header again — collapses

		await expect.element(screen.getByRole('button', { name: 'Imagen Borrosa', exact: true })).not.toBeInTheDocument();
		expect(addAnnotationSpy).not.toHaveBeenCalled();
	});

	it('"Listo" in "Marcar error" is disabled with 0 rows checked, enables once one is tapped, and toggling a second/third keeps them independent', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: ['glare'] }));
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);
		await openReasonCard(screen);

		await expect.element(screen.getByRole('button', { name: 'Listo' })).toBeDisabled();

		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await screen.getByRole('button', { name: 'Reflejo/Brillo', exact: true }).click();
		// Untap "Imagen Borrosa" — only "Reflejo/Brillo" should remain selected.
		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await expect.element(screen.getByRole('button', { name: 'Listo' })).not.toBeDisabled();

		await screen.getByRole('button', { name: 'Listo' }).click();
		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);
		expect(addAnnotationSpy).toHaveBeenCalledWith(1, { error_types: ['glare'], note: undefined });
	});

	it('"Listo" in "Marcar error" saves error types as their OWN annotation (no note attached), then collapses the card', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: ['blur', 'glare'] }));
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);
		await openReasonCard(screen);

		await screen.getByRole('button', { name: 'Imagen Borrosa', exact: true }).click();
		await screen.getByRole('button', { name: 'Reflejo/Brillo', exact: true }).click();
		await screen.getByRole('button', { name: 'Listo' }).click();

		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);
		expect(addAnnotationSpy).toHaveBeenCalledWith(1, { error_types: ['blur', 'glare'], note: undefined });

		// Collapsed again: the error rows are gone, only the toggle button remains.
		await expect.element(screen.getByRole('button', { name: 'Imagen Borrosa', exact: true })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Marcar error' })).toBeVisible();
	});

	it('"Agregar nota" is a separate accordion: "Listo" is disabled with empty text, saves a note-only annotation, then collapses', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: [], note: 'una nota suelta' }));
		const screen = render(LeftSidebar, baseProps());
		await openAnnotationsTab(screen);
		await openNoteCard(screen);

		await expect.element(screen.getByRole('button', { name: 'Listo' })).toBeDisabled();

		await screen.getByPlaceholder('Agrega un comentario (opcional)...').fill('una nota suelta');
		await expect.element(screen.getByRole('button', { name: 'Listo' })).not.toBeDisabled();
		await screen.getByRole('button', { name: 'Listo' }).click();

		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);
		expect(addAnnotationSpy).toHaveBeenCalledWith(1, { error_types: [], note: 'una nota suelta' });
		await expect.element(screen.getByPlaceholder('Agrega un comentario (opcional)...')).not.toBeInTheDocument();
	});

	it('in_review with no saved error annotations yet: Aprobar enabled; Rechazar is clickable but shows a popup asking for a reason instead of confirming', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }) }));
		await openAnnotationsTab(screen);
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeDisabled();

		await screen.getByRole('button', { name: 'Rechazar' }).click();

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('Debes seleccionar al menos un error.')).toBeVisible();
		// It's the "select a reason" popup, not the reject confirmation.
		await expect.element(dialog.getByText('¿Confirmas que quieres rechazar esta imagen?')).not.toBeInTheDocument();
		expect(rejectSpy).not.toHaveBeenCalled();
	});

	it('Rechazar keeps showing the "select a reason" popup while an error row is only tapped (not yet saved via Listo), and opens the real confirm once it persists', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: ['exposure'] }));
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }) }));
		await openAnnotationsTab(screen);
		await openReasonCard(screen);

		await screen.getByRole('button', { name: 'Exposición', exact: true }).click();
		await screen.getByRole('button', { name: 'Rechazar' }).click();
		await expect.element(screen.getByRole('dialog').getByText('Debes seleccionar al menos un error.')).toBeVisible();
		await screen.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();

		await screen.getByRole('button', { name: 'Listo' }).click();
		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);

		await screen.getByRole('button', { name: 'Rechazar' }).click();
		await expect.element(screen.getByRole('dialog').getByText('¿Confirmas que quieres rechazar esta imagen?')).toBeVisible();
	});

	it('a note-only annotation (via "Agregar nota") does NOT satisfy the reason requirement — Rechazar still asks for one', async () => {
		addAnnotationSpy.mockResolvedValue(makeAnnotation({ error_types: [], note: 'solo comentario' }));
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }) }));
		await openAnnotationsTab(screen);
		await openNoteCard(screen);

		await screen.getByPlaceholder('Agrega un comentario (opcional)...').fill('solo comentario');
		await screen.getByRole('button', { name: 'Listo' }).click();
		await expect.poll(() => addAnnotationSpy.mock.calls.length).toBe(1);

		await screen.getByRole('button', { name: 'Rechazar' }).click();
		await expect.element(screen.getByRole('dialog').getByText('Debes seleccionar al menos un error.')).toBeVisible();
	});

	it('approved: Aprobar disabled (can\'t approve twice), Rechazar enabled (undo, no saved annotation needed)', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'approved' }) }));
		await openAnnotationsTab(screen);
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeDisabled();
	});

	it('rejected: "Marcar error" and "Agregar nota" are both disabled — a rejected record accepts no more annotations', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'rejected' }), userRole: 'admin' }));
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Marcar error' })).toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Agregar nota' })).toBeDisabled();
	});

	it('rejected: existing annotations can no longer be deleted either (the delete button is hidden, not just disabled)', async () => {
		getAnnotationsSpy.mockResolvedValue([makeAnnotation({ id: 5, error_types: ['blur'] })]);
		const deleteAnnotationSpy = vi.spyOn(recordsApi, 'deleteAnnotation');
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'rejected' }), userRole: 'admin' }));
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Eliminar anotación' })).not.toBeInTheDocument();
		expect(deleteAnnotationSpy).not.toHaveBeenCalled();
		deleteAnnotationSpy.mockRestore();
	});

	it('in_review: existing annotations can still be deleted', async () => {
		getAnnotationsSpy.mockResolvedValue([makeAnnotation({ id: 5, error_types: ['blur'] })]);
		const deleteAnnotationSpy = vi.spyOn(recordsApi, 'deleteAnnotation').mockResolvedValue(undefined);
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }) }));
		await openAnnotationsTab(screen);

		await screen.getByRole('button', { name: 'Eliminar anotación' }).click();
		await expect.poll(() => deleteAnnotationSpy.mock.calls.length).toBe(1);
		expect(deleteAnnotationSpy).toHaveBeenCalledWith(5);
		deleteAnnotationSpy.mockRestore();
	});

	it('approved: "Marcar error" and "Agregar nota" are enabled again (re-approving a record re-enables annotations)', async () => {
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'approved' }) }));
		await openAnnotationsTab(screen);

		await expect.element(screen.getByRole('button', { name: 'Marcar error' })).not.toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Agregar nota' })).not.toBeDisabled();
	});

	it('rejecting a record collapses any open annotation card and disables both toggle buttons immediately after', async () => {
		getAnnotationsSpy.mockResolvedValue([makeAnnotation({ error_types: ['blur'] })]);
		rejectSpy.mockResolvedValue(makeRecord({ status: 'rejected' }));
		const onRecordUpdated = vi.fn(async () => {
			// Simulate the parent re-fetching and handing back the now-rejected record.
			await Promise.resolve();
		});
		const screen = render(LeftSidebar, baseProps({ currentRecord: makeRecord({ status: 'in_review' }), onRecordUpdated }));
		await openAnnotationsTab(screen);
		await openNoteCard(screen);
		await screen.getByPlaceholder('Agrega un comentario (opcional)...').fill('a medio escribir');

		await screen.getByRole('button', { name: 'Rechazar' }).click();
		await screen.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();

		await expect.poll(() => rejectSpy.mock.calls.length).toBe(1);
		await expect.element(screen.getByPlaceholder('Agrega un comentario (opcional)...')).not.toBeInTheDocument();
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

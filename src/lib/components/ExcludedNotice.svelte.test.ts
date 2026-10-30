// The notice on a record Fisqua excluded (contract 1.6): what the exclusion
// means, and Fisqua's reason when its latest exclusion carries one, read from
// GET /collections/{id}/status-changes (newest first).
//
// Version: 0.2.1
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, type Record as ApiRecord, type RecordStatusChange } from '$lib/api';
import { es } from '$lib/i18n/es';
import ExcludedNotice from './ExcludedNotice.svelte';

const record = (status: ApiRecord['status'] = 'excluded') =>
	({ id: 4, collection_id: 7, status, capture_mode: 'single', images: [] }) as unknown as ApiRecord;

function change(over: Partial<RecordStatusChange>): RecordStatusChange {
	return {
		id: 1,
		record_id: 4,
		collection_id: 7,
		from_status: 'in_review',
		to_status: 'excluded',
		changed_by: 'Fisqua: revisora',
		changed_at: '2026-10-29T15:00:00',
		note: null,
		...over
	};
}

describe('ExcludedNotice', () => {
	let spy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		spy = vi.spyOn(collectionsApi, 'statusChanges');
	});
	afterEach(() => spy.mockRestore());

	it("shows the hint and Fisqua's reason when the latest exclusion has a note", async () => {
		spy.mockResolvedValue([change({ id: 2, note: 'Prueba del soporte' }), change({ id: 1, note: 'Más antigua' })]);
		const screen = render(ExcludedNotice, { record: record() });
		await expect.element(screen.getByText(es.status_excluded_hint)).toBeInTheDocument();
		await expect.element(screen.getByText('Prueba del soporte')).toBeInTheDocument();
		await expect.element(screen.getByText(es.excluded_note_label)).toBeInTheDocument();
		expect(spy).toHaveBeenCalledWith(7);
	});

	it('shows the hint alone when the exclusion has no note', async () => {
		spy.mockResolvedValue([change({ note: null })]);
		const screen = render(ExcludedNotice, { record: record() });
		await expect.element(screen.getByText(es.status_excluded_hint)).toBeInTheDocument();
		await vi.waitFor(() => expect(spy).toHaveBeenCalled());
		await expect.element(screen.getByText(es.excluded_note_label)).not.toBeInTheDocument();
	});

	it('shows the hint alone when the history cannot be read', async () => {
		spy.mockRejectedValue(new Error('boom'));
		const screen = render(ExcludedNotice, { record: record() });
		await expect.element(screen.getByText(es.status_excluded_hint)).toBeInTheDocument();
		await expect.element(screen.getByText(es.excluded_note_label)).not.toBeInTheDocument();
	});

	it('shows nothing, and asks for nothing, on a record that is not excluded', async () => {
		spy.mockResolvedValue([]);
		const screen = render(ExcludedNotice, { record: record('approved') });
		await expect.element(screen.getByText(es.status_excluded_hint)).not.toBeInTheDocument();
		expect(spy).not.toHaveBeenCalled();
	});
});

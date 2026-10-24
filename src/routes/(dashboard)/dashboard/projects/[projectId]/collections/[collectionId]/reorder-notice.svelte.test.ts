// A refused reorder reloads the volume's records, and the reload swaps the
// list and the grid for the loading state. The notice that says why the
// drag was not saved must still be on screen once the records are back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({
		params: { projectId: '1', collectionId: '7' },
		data: { collectionName: 'Tomo 55' },
		url: new URL('http://localhost/dashboard/projects/1/collections/7')
	})
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, collectionsApi, recordsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import CollectionPage from './+page.svelte';

const operator: AuthUser = { id: 2, username: 'op1', email: null, role: 'operator', is_active: true };

// REORDER_IDS_MESSAGE in app/core/record_sequence.py.
const REORDER_IDS = 'ordered_ids must name every record of the volume exactly once.';

function rec(id: number, sequence: number): ApiRecord {
	return { id, title: `Folio ${id}`, status: 'captured', sequence, images: [] } as unknown as ApiRecord;
}

const records = [rec(1, 1), rec(2, 2), rec(3, 3)];

beforeEach(() => {
	locale.set('es');
	authStore.setSession('tok', operator);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

/** The list's drop zone: the element whose children are the record rows. */
function dropZone(container: HTMLElement): HTMLElement {
	const row = container.querySelector('.list-row');
	if (!row?.parentElement) throw new Error('no record rows');
	return row.parentElement;
}

describe('collection page: refused reorder', () => {
	it('keeps the notice on screen after the records are reloaded, until it is closed', async () => {
		// The reload after the refusal is held open, so the loading state is
		// on screen while it waits.
		let releaseReload: () => void = () => {};
		const listAll = vi
			.spyOn(recordsApi, 'listAll')
			.mockResolvedValueOnce(records)
			.mockImplementationOnce(() => new Promise((resolve) => (releaseReload = () => resolve(records))));
		vi.spyOn(collectionsApi, 'reorderRecords').mockRejectedValue(new ApiError(REORDER_IDS, REORDER_IDS, 422));

		const screen = render(CollectionPage);
		await expect.element(page.getByText('Folio 3')).toBeInTheDocument();

		dropZone(screen.container).dispatchEvent(
			new CustomEvent('finalize', { detail: { items: [records[2], records[0], records[1]], info: {} } })
		);
		await expect.element(page.getByText(es.col_loading_images)).toBeInTheDocument();
		releaseReload();

		await expect.element(page.getByText('Folio 3')).toBeInTheDocument();
		expect(listAll).toHaveBeenCalledTimes(2);
		const notice = page.getByRole('alert').filter({ hasText: es.col_reorder_stale });
		await expect.element(notice).toBeInTheDocument();

		await userEvent.click(notice.getByRole('button', { name: es.common_close }));
		await expect.element(page.getByText(es.col_reorder_stale)).not.toBeInTheDocument();
	});

	it('clears the notice once a later reorder is saved', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue(records);
		const reorder = vi
			.spyOn(collectionsApi, 'reorderRecords')
			.mockRejectedValueOnce(new ApiError(REORDER_IDS, REORDER_IDS, 422))
			.mockResolvedValueOnce({ reordered: 3 });

		const screen = render(CollectionPage);
		await expect.element(page.getByText('Folio 3')).toBeInTheDocument();
		const drop = () =>
			dropZone(screen.container).dispatchEvent(
				new CustomEvent('finalize', { detail: { items: [records[1], records[0], records[2]], info: {} } })
			);

		drop();
		await expect.element(page.getByText(es.col_reorder_stale)).toBeInTheDocument();
		await expect.element(page.getByText('Folio 3')).toBeInTheDocument();
		drop();
		await vi.waitFor(() => expect(reorder).toHaveBeenCalledTimes(2));
		await expect.element(page.getByText(es.col_reorder_stale)).not.toBeInTheDocument();
	});
});

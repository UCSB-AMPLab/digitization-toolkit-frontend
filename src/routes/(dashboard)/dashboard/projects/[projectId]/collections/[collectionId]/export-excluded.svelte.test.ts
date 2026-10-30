// The BagIt export from the volume view leaves out the records Fisqua
// excluded (contract 1.6), as the backend's exported_records() does: a volume
// of approved records plus excluded ones goes to the backend, and one with a
// record still in review shows that record as the blocker and asks nothing.
//
// Version: 0.2.1
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { readable } from 'svelte/store';
import '../../../../../../../app.css';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({
		params: { projectId: '1', collectionId: '7' },
		data: { collectionName: 'Tomo 55' },
		url: new URL('http://localhost/dashboard/projects/1/collections/7')
	})
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, recordsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import CollectionPage from './+page.svelte';

const admin: AuthUser = { id: 1, username: 'admin', email: null, role: 'admin', is_active: true };

function rec(id: number, status: ApiRecord['status']): ApiRecord {
	return {
		id,
		title: `Folio ${id}`,
		status,
		sequence: id,
		collection_id: 7,
		capture_mode: 'single',
		images: [{ id: 100 + id, record_id: id, filename: `f${id}.jpg`, file_path: '/x', format: 'jpg', is_current: true }]
	} as unknown as ApiRecord;
}

let exportSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	locale.set('es');
	authStore.setSession('tok', admin);
	vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue('');
	vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue({
		pendingRecords: 0,
		volumes: [],
		turn: { state: 'free', unlockedBy: null }
	});
	// The job never finishes here; the request is what is checked.
	exportSpy = vi.spyOn(collectionsApi, 'exportBagit').mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function startExport(records: ApiRecord[]) {
	vi.spyOn(recordsApi, 'listAll').mockResolvedValue(records);
	const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
	render(CollectionPage, { context: volumeTopbarContext(slot) });
	await expect.element(page.getByText('Folio 2').first()).toBeInTheDocument();
	await page.getByRole('button', { name: es.col_export }).click();
	await page.getByText(es.col_bagit_option_title).click();
}

describe('BagIt export with excluded records', () => {
	it('sends a volume of approved records plus excluded ones to the backend', async () => {
		await startExport([rec(1, 'approved'), rec(2, 'excluded'), rec(3, 'approved')]);
		await expect.poll(() => exportSpy.mock.calls.length).toBe(1);
		expect(exportSpy).toHaveBeenCalledWith(7);
		await expect.element(page.getByText(es.col_export_blocked_title)).not.toBeInTheDocument();
	});

	it('still shows a record in review as the blocker, and asks the backend nothing', async () => {
		await startExport([rec(1, 'approved'), rec(2, 'excluded'), rec(3, 'in_review')]);
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.col_export_blocked_title)).toBeInTheDocument();
		await expect.element(dialog.getByRole('button', { name: 'Folio 3' })).toBeInTheDocument();
		await expect.element(dialog.getByRole('button', { name: 'Folio 2' })).not.toBeInTheDocument();
		expect(exportSpy).not.toHaveBeenCalled();
	});
});

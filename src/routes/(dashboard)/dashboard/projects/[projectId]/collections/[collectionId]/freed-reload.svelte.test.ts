// NEH-248: the layout reloads the records when the volume's freed counts
// change, which can happen on each poll while a free or a restore runs. That
// reload must keep the record the admin is reading selected.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
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

import { recordsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import CollectionPage from './+page.svelte';

const admin: AuthUser = { id: 1, username: 'admin', email: null, role: 'admin', is_active: true };

function rec(id: number, masterFreedAt: string | null = null): ApiRecord {
	const image = {
		id: id * 10,
		record_id: id,
		filename: `f${id}.jpg`,
		file_path: `/x/f${id}.jpg`,
		format: 'jpg',
		is_current: true,
		master_freed_at: masterFreedAt
	};
	return { id, title: `Folio ${id}`, status: 'captured', sequence: id, images: [image] } as unknown as ApiRecord;
}
const records = [1, 2, 3, 4, 5, 6].map((id) => rec(id));

beforeEach(() => {
	locale.set('es');
	authStore.setSession('tok', admin);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

const selectedThumb = (container: HTMLElement) => container.querySelector('.thumb-item.selected')?.textContent ?? '';

describe('collection page: reload after a change in what is freed', () => {
	it('keeps record 5 selected after the reload', async () => {
		const listAll = vi.spyOn(recordsApi, 'listAll').mockResolvedValue(records);
		const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
		const screen = render(CollectionPage, { context: volumeTopbarContext(slot) });

		await expect.element(page.getByText('Folio 5')).toBeInTheDocument();
		await page.getByText('Folio 5').click();
		await expect.poll(() => selectedThumb(screen.container)).toContain('Folio 5');

		expect(slot.reloadRecords).toBeTypeOf('function');
		expect(await slot.reloadRecords!()).toBe(true);

		expect(listAll).toHaveBeenCalledTimes(2);
		await expect.poll(() => selectedThumb(screen.container)).toContain('Folio 5');
		// Updated in place: the book view is not swapped for the loading state.
		expect(screen.container.querySelector('.thumb-item')).not.toBeNull();
	});

	// The inspection modal opens from the export blockers: none of these
	// records is approved, so the export lists them all.
	async function inspect(screen: ReturnType<typeof render>, title: string) {
		await page.getByRole('button', { name: 'Exportar BagIt' }).click();
		await page.getByText('Paquete de archivo (BagIt)').click();
		await page.getByRole('dialog').getByRole('button', { name: title }).click();
		await expect.poll(() => screen.container.ownerDocument.querySelector('.img-viewer-download')).not.toBeNull();
	}

	it('gives an open inspection modal the reloaded record, with its new freed state', async () => {
		const freedAt = '2026-10-24T12:00:00';
		vi.spyOn(recordsApi, 'listAll')
			.mockResolvedValueOnce(records)
			.mockResolvedValueOnce(records.map((r) => (r.id === 5 ? rec(5, freedAt) : r)));
		const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
		const screen = render(CollectionPage, { context: volumeTopbarContext(slot) });
		await expect.element(page.getByText('Folio 5')).toBeInTheDocument();
		await inspect(screen, 'Folio 5');

		expect(await slot.reloadRecords!()).toBe(true);

		// A freed master offers no download (ImageViewerModal).
		await expect.poll(() => screen.container.ownerDocument.querySelector('.img-viewer-download')).toBeNull();
		// The modal stays open on the same record.
		expect(screen.container.ownerDocument.querySelector('.img-viewer-title')?.textContent).toContain('Folio 5');
	});

	it('closes the inspection modal when its record is gone after the reload', async () => {
		vi.spyOn(recordsApi, 'listAll')
			.mockResolvedValueOnce(records)
			.mockResolvedValueOnce(records.filter((r) => r.id !== 5));
		const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
		const screen = render(CollectionPage, { context: volumeTopbarContext(slot) });
		await expect.element(page.getByText('Folio 5')).toBeInTheDocument();
		await inspect(screen, 'Folio 5');

		expect(await slot.reloadRecords!()).toBe(true);

		await expect.poll(() => screen.container.ownerDocument.querySelector('.img-viewer-title')).toBeNull();
	});
});


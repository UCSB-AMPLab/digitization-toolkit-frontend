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

function rec(id: number): ApiRecord {
	return { id, title: `Folio ${id}`, status: 'captured', sequence: id, images: [] } as unknown as ApiRecord;
}
const records = [1, 2, 3, 4, 5, 6].map(rec);

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
});

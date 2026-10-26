// The capture manifest download in the volume's export chooser: admins and
// operators only (allow_contributor on GET /collections/{id}/capture-manifest),
// saved under the server's file name; a 409 lists its problems in the
// catalogue's words, and a 404 says the volume was not found.
//
// Version: 0.1.0-beta
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

import { ApiError, collectionsApi, recordsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import CollectionPage from './+page.svelte';

const user = (role: UserRole): AuthUser => ({ id: 1, username: role, email: null, role, is_active: true });

const records = [1, 2].map(
	(id) =>
		({
			id,
			title: `Folio ${id}`,
			status: 'in_review',
			sequence: id,
			images: [{ id: id * 10, record_id: id, filename: `f${id}.jpg`, file_path: `/x/f${id}.jpg`, format: 'jpg', is_current: true }]
		}) as unknown as ApiRecord
);

let saved: { download: string; href: string }[] = [];

beforeEach(() => {
	locale.set('es');
	saved = [];
	vi.spyOn(recordsApi, 'listAll').mockResolvedValue(records);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:manifest');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
		saved.push({ download: this.download, href: this.href });
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function openChooser(role: UserRole) {
	authStore.setSession('tok', user(role));
	const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
	render(CollectionPage, { context: volumeTopbarContext(slot) });
	await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
	await page.getByRole('button', { name: 'Exportar BagIt' }).click();
	await expect.element(page.getByText(es.col_bagit_option_title)).toBeInTheDocument();
}

describe('capture manifest download', () => {
	it.each(['admin', 'operator'] as const)('is offered to the %s', async (role) => {
		await openChooser(role);
		await expect.element(page.getByText(es.col_manifest_option_title)).toBeInTheDocument();
	});

	it('is not offered to a reviewer', async () => {
		await openChooser('reviewer');
		await expect.element(page.getByText(es.col_images_option_title)).toBeInTheDocument();
		expect(document.body.textContent).not.toContain(es.col_manifest_option_title);
	});

	it('saves the file under the name the server gives', async () => {
		const body = JSON.stringify({ generatedAt: '2026-10-24T18:00:00Z', volumes: [{ stem: 'other' }] });
		const download = vi.spyOn(collectionsApi, 'downloadCaptureManifest').mockResolvedValue({
			blob: new Blob([body], { type: 'application/json' }),
			contentDisposition: 'attachment; filename="capture-manifest_tomo-55_2026-10-24.json"'
		});
		await openChooser('operator');
		await page.getByText(es.col_manifest_option_title).click();

		await expect.poll(() => saved.length).toBe(1);
		expect(download).toHaveBeenCalledWith(7);
		expect(saved[0]).toEqual({ download: 'capture-manifest_tomo-55_2026-10-24.json', href: 'blob:manifest' });
		expect(document.body.textContent).not.toContain(es.col_manifest_err_title);
	});

	it('lists each problem of a refusal, mapping known rules and falling back for unknown ones', async () => {
		const detail = {
			message: 'The capture manifest cannot be exported, because Fisqua would refuse it: ...',
			problems: [
				{ rule: 'not_uploaded', message: '3 image(s) are not yet verified ...', record_ids: [2, 1], image_ids: [10, 20, 21] },
				{ rule: 'something_new', message: 'English only.', record_ids: [], image_ids: [] }
			]
		};
		vi.spyOn(collectionsApi, 'downloadCaptureManifest').mockRejectedValue(new ApiError(detail.message, detail, 409));
		await openChooser('admin');
		await page.getByText(es.col_manifest_option_title).click();

		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.col_manifest_refused_title)).toBeInTheDocument();
		await expect.element(dialog.getByText(es.col_manifest_rule_not_uploaded)).toBeInTheDocument();
		await expect.element(dialog.getByText(es.col_manifest_records([1, 2]))).toBeInTheDocument();
		await expect.element(dialog.getByText(es.col_manifest_rule_other)).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('English only.');
		expect(document.body.textContent).not.toContain('not yet verified');
		expect(saved).toHaveLength(0);

		await dialog.getByRole('button', { name: es.common_close }).click();
		await expect.poll(() => document.body.textContent?.includes(es.col_manifest_refused_title)).toBe(false);
	});

	it('says the volume was not found on a 404', async () => {
		vi.spyOn(collectionsApi, 'downloadCaptureManifest').mockRejectedValue(
			new ApiError('Collection 7 not found', undefined, 404)
		);
		await openChooser('admin');
		await page.getByText(es.col_manifest_option_title).click();

		await expect.element(page.getByText(es.col_manifest_err_not_found)).toBeInTheDocument();
		await expect.element(page.getByText(es.col_manifest_err_title)).toBeInTheDocument();
		expect(document.body.textContent).not.toContain('Collection 7 not found');
		expect(saved).toHaveLength(0);
	});
});

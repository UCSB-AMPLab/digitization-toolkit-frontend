// The volume's export chooser on the bench unit's 800×480 screen: the card is
// taller than the screen, so it must scroll inside with its title and Close
// button reachable, and Escape and a click on the backdrop must close it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
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

import { recordsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import CollectionPage from './+page.svelte';

const admin: AuthUser = { id: 1, username: 'admin', email: null, role: 'admin', is_active: true };

const records = [1, 2].map(
	(id) =>
		({
			id,
			title: `Folio ${id}`,
			status: 'in_review',
			sequence: id,
			images: []
		}) as unknown as ApiRecord
);

beforeEach(async () => {
	locale.set('es');
	vi.spyOn(recordsApi, 'listAll').mockResolvedValue(records);
	authStore.setSession('tok', admin);
	await page.viewport(800, 480);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function openChooser() {
	const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
	render(CollectionPage, { context: volumeTopbarContext(slot) });
	await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
	await page.getByRole('button', { name: es.col_export }).click();
	const dialog = page.getByRole('dialog');
	// The admin sees all three options, the tallest form of the card.
	await expect.element(dialog.getByText(es.col_manifest_option_title)).toBeInTheDocument();
	return dialog;
}

const chooserGone = () => document.body.textContent?.includes(es.col_download_choose_title) ?? false;

describe('export chooser at 800×480', () => {
	it('fits the screen and scrolls inside, with its title and Close button reachable', async () => {
		const dialog = await openChooser();
		const card = dialog.element() as HTMLElement;
		const box = card.getBoundingClientRect();
		expect(box.top).toBeGreaterThanOrEqual(0);
		expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
		expect(getComputedStyle(card).overflowY).toBe('auto');

		const title = dialog.getByText(es.col_download_choose_title).element();
		expect(title.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);

		const close = dialog.getByRole('button', { name: es.common_close });
		await close.click();
		await expect.poll(chooserGone).toBe(false);
	});

	it('closes on Escape', async () => {
		await openChooser();
		await userEvent.keyboard('{Escape}');
		await expect.poll(chooserGone).toBe(false);
	});

	it('closes on a click on the backdrop, not on a click inside the card', async () => {
		const dialog = await openChooser();
		const card = dialog.element() as HTMLElement;
		card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(chooserGone()).toBe(true);
		card.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await expect.poll(chooserGone).toBe(false);
	});
});

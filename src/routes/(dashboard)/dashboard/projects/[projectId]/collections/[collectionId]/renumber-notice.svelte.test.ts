// A renumber reloads the volume's records, and the reload swaps the grid for
// the loading state. The count of renumbered records has to survive that, so
// the page holds it and shows it once the records are back.
//
// Version: 0.1.0-beta
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

const pageStore = vi.hoisted(() => ({ value: null as null | import('svelte/store').Writable<unknown> }));

function pageAt(collectionId: string) {
	return {
		params: { projectId: '1', collectionId },
		data: { collectionName: 'Tomo 55' },
		url: new URL(`http://localhost/dashboard/projects/1/collections/${collectionId}`)
	};
}

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	pageStore.value = writable(pageAt('7'));
	return { page: pageStore.value };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, recordsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { en } from '$lib/i18n/en';
import CollectionPage from './+page.svelte';

const operator: AuthUser = { id: 2, username: 'op1', email: null, role: 'operator', is_active: true };

function rec(id: number, sequence: number): ApiRecord {
	return { id, title: `Folio ${id}`, status: 'captured', sequence, images: [] } as unknown as ApiRecord;
}

const records = [rec(1, 1), rec(2, 2), rec(3, 3)];

beforeEach(() => {
	pageStore.value?.set(pageAt('7'));
	locale.set('es');
	authStore.setSession('tok', operator);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function renumberFromGrid() {
	await userEvent.click(page.getByRole('button', { name: es.col_view_grid }));
	await userEvent.click(page.getByRole('button', { name: es.col_renumber, exact: true }));
	// The second one is the confirm button in the modal.
	await userEvent.click(page.getByRole('button', { name: es.col_renumber, exact: true }).last());
}

describe('collection page: renumber notice', () => {
	it('shows how many records were renumbered after the reload, until it is closed', async () => {
		const listAll = vi.spyOn(recordsApi, 'listAll').mockResolvedValue(records);
		vi.spyOn(collectionsApi, 'renumberImages').mockResolvedValue({ renumbered: 3 });

		render(CollectionPage);
		await expect.element(page.getByText('Folio 3')).toBeInTheDocument();
		await renumberFromGrid();

		const notice = page.getByRole('status').filter({ hasText: es.col_renumber_done(3) });
		await expect.element(notice).toBeInTheDocument();
		expect(listAll).toHaveBeenCalledTimes(2);

		await userEvent.click(notice.getByRole('button', { name: es.common_close }));
		await expect.element(page.getByText(es.col_renumber_done(3))).not.toBeInTheDocument();
	});
});

describe('collection page: renumber result from a volume the operator left', () => {
	it('is dropped', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue(records);
		let finish: (v: { renumbered: number }) => void = () => {};
		vi.spyOn(collectionsApi, 'renumberImages').mockImplementation(
			() => new Promise((resolve) => (finish = resolve))
		);

		render(CollectionPage);
		await expect.element(page.getByText('Folio 3')).toBeInTheDocument();
		await renumberFromGrid();

		pageStore.value!.set(pageAt('8'));
		finish({ renumbered: 3 });
		await new Promise((r) => setTimeout(r, 50));
		await expect.element(page.getByText(es.col_renumber_done(3))).not.toBeInTheDocument();
	});
});

describe('col_renumber_done', () => {
	it('agrees in number in both languages', () => {
		expect(es.col_renumber_done(1)).toBe('Se renumeró 1 registro.');
		expect(es.col_renumber_done(12345)).toBe('Se renumeraron 12.345 registros.');
		expect(es.col_renumber_done(0)).toBe('Este volumen no tiene registros para renumerar.');
		expect(en.col_renumber_done(1)).toBe('1 record renumbered.');
		expect(en.col_renumber_done(2)).toBe('2 records renumbered.');
	});
});

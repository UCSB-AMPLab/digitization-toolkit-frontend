// The volume page's recapture band (0.2.0): while any record of the volume is
// rejected, a band says how many page pairs are waiting, and "Recapturar
// ahora" opens the capture screen on the rejected record with the lowest
// sequence. No band without rejected records; no link for a reviewer.
//
// Version: 0.2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({
		params: { projectId: '1', collectionId: '7' },
		data: { collectionName: 'Tomo 066' },
		url: new URL('http://localhost/dashboard/projects/1/collections/7')
	})
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type AuthUser, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import '../../../../../../../app.css';
import CollectionPage from './+page.svelte';

function rec(id: number, sequence: number, status: ApiRecord['status']): ApiRecord {
	return { id, title: `Par ${id}`, status, sequence, images: [] } as unknown as ApiRecord;
}

function signIn(role: UserRole) {
	const user: AuthUser = { id: 2, username: role, email: null, role, is_active: true };
	authStore.setSession('tok', user);
}

beforeEach(() => {
	locale.set('es');
	signIn('operator');
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('volume page: recapture band', () => {
	it('says how many pairs wait and opens the first rejected record by sequence', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue([
			rec(1, 1, 'captured'),
			rec(12, 12, 'rejected'),
			rec(6, 6, 'rejected'),
			rec(2, 2, 'approved')
		]);
		const screen = render(CollectionPage);
		const band = screen.getByRole('region', { name: '2 pares de páginas por recapturar' });
		await expect.element(band).toBeVisible();
		const link = band.getByRole('link', { name: 'Recapturar ahora' });
		await expect.element(link).toHaveAttribute('href', '/live-preview?projectId=1&collectionId=7&recordId=6');
		const style = getComputedStyle(link.element());
		expect(style.backgroundColor).toBe('rgb(225, 183, 120)');
		expect(style.color).toBe('rgb(19, 17, 16)');
	});

	it('counts the records prepared for retake as the summary does, and opens its first pending record', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue([rec(1, 1, 'captured'), rec(6, 6, 'rejected'), rec(8, 8, 'captured')]);
		vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue({
			pendingRecords: 3,
			volumes: [{ collectionId: 7, projectId: 1, name: 'Tomo 066', filenameStem: 'co-66', pending: 3, total: 3, firstPendingRecordId: 1, pendingRecordIds: [1, 6, 8] }],
			turn: { state: 'recaptures', unlockedBy: null }
		});
		const screen = render(CollectionPage);
		const band = screen.getByRole('region', { name: '3 pares de páginas por recapturar' });
		await expect.element(band).toBeVisible();
		await expect
			.element(band.getByRole('link', { name: 'Recapturar ahora' }))
			.toHaveAttribute('href', '/live-preview?projectId=1&collectionId=7&recordId=1');
	});

	it('takes the summary over the records on screen: nothing pending there means no band, even with a rejected record shown', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue([rec(1, 1, 'captured'), rec(2, 2, 'rejected')]);
		vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue({
			pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null }
		});
		const screen = render(CollectionPage);
		await expect.element(screen.getByText('Par 2')).toBeInTheDocument();
		await expect.poll(() => (recordsApi.toRetakeSummary as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(0);
		await expect.element(screen.getByText('por recapturar', { exact: false })).not.toBeInTheDocument();
	});

	it('shows no band when the summary has nothing pending for the volume', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue([rec(1, 1, 'captured'), rec(2, 2, 'approved')]);
		vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue({
			pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null }
		});
		const screen = render(CollectionPage);
		await expect.element(screen.getByText('Par 2')).toBeInTheDocument();
		await expect.element(screen.getByText('por recapturar', { exact: false })).not.toBeInTheDocument();
	});

	it('uses the singular for one', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue([rec(1, 1, 'captured'), rec(3, 3, 'rejected')]);
		const screen = render(CollectionPage);
		await expect.element(screen.getByRole('region', { name: 'Un par de páginas por recapturar' })).toBeVisible();
	});

	it('shows no band without rejected records', async () => {
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue([rec(1, 1, 'captured'), rec(2, 2, 'approved')]);
		const screen = render(CollectionPage);
		await expect.element(screen.getByText('Par 2')).toBeInTheDocument();
		await expect.element(screen.getByText('por recapturar', { exact: false })).not.toBeInTheDocument();
	});

	it('gives a reviewer the band but no link', async () => {
		signIn('reviewer');
		vi.spyOn(recordsApi, 'listAll').mockResolvedValue([rec(4, 4, 'rejected')]);
		const screen = render(CollectionPage);
		const band = screen.getByRole('region', { name: 'Un par de páginas por recapturar' });
		await expect.element(band).toBeVisible();
		await expect.element(band.getByRole('link', { name: 'Recapturar ahora' })).not.toBeInTheDocument();
	});
});

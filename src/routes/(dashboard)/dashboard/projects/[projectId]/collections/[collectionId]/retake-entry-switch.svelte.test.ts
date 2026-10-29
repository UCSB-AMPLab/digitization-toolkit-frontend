// The volume page's recapture count belongs to one volume (0.2.0). SvelteKit
// reuses the page from one volume to the next, so the count of the volume
// left behind must go before the next one loads, and a summary that arrives
// for a volume no longer shown is dropped: the next volume shows no count
// from the last, its handover button is not disabled by it, and no link
// pairs its id with the last volume's record.
//
// Version: 0.2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const pageStore = vi.hoisted(() => ({ value: null as null | import('svelte/store').Writable<unknown> }));

function pageAt(collectionId: string) {
	return {
		params: { projectId: '1', collectionId },
		data: { collectionName: `Tomo ${collectionId}` },
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

import { recordsApi, type Record as ApiRecord, type RetakeSummary } from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import SnippetHost from '$lib/test-support/SnippetHost.svelte';
import '../../../../../../../app.css';
import CollectionPage from './+page.svelte';

const operator: AuthUser = { id: 2, username: 'op1', email: null, role: 'operator', is_active: true };

function rec(id: number, sequence: number, status: ApiRecord['status']): ApiRecord {
	return { id, title: `Par ${id}`, status, sequence, images: [] } as unknown as ApiRecord;
}

// Volume 7 has three pending, its first record 1; volume 8 has none.
const summaryA: RetakeSummary = {
	pendingRecords: 3,
	volumes: [{ collectionId: 7, projectId: 1, name: 'Tomo 7', filenameStem: 'co-7', pending: 3, total: 3, firstPendingRecordId: 1, pendingRecordIds: [1, 2, 3] }],
	turn: { state: 'recaptures', unlockedBy: null }
};

beforeEach(() => {
	pageStore.value?.set(pageAt('7'));
	locale.set('es');
	authStore.setSession('tok', operator);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function openAThenB(secondSummary: () => Promise<RetakeSummary>) {
	vi.spyOn(recordsApi, 'listAll').mockImplementation(async (params) =>
		params?.collection_id === 8 ? [rec(20, 1, 'captured')] : [rec(1, 1, 'captured'), rec(2, 2, 'captured')]
	);
	const summary = vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValueOnce(summaryA).mockImplementation(secondSummary);
	const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
	const screen = render(CollectionPage, { context: volumeTopbarContext(slot) });
	await expect.element(screen.getByRole('region', { name: '3 pares de páginas por recapturar' })).toBeVisible();

	pageStore.value?.set(pageAt('8'));
	await expect.element(screen.getByText('Par 20')).toBeInTheDocument();
	await expect.poll(() => summary.mock.calls.length).toBe(2);
	await expect.poll(() => slot.actions).not.toBeNull();
	const actions = render(SnippetHost, { snippet: slot.actions! });
	return { screen, actions };
}

async function expectNothingFromA(screen: ReturnType<typeof render>, actions: ReturnType<typeof render>) {
	await expect.element(screen.getByText('por recapturar', { exact: false })).not.toBeInTheDocument();
	expect(screen.container.querySelector('a[href*="collectionId=8&recordId=1"]')).toBeNull();
	await expect.element(actions.getByRole('button', { name: 'Enviar a revisión' })).toBeEnabled();
	await expect.element(actions.getByRole('button', { name: /^Faltan/ })).not.toBeInTheDocument();
}

describe('volume page: the recapture count follows the volume', () => {
	it("shows none of the last volume's count while the next volume's summary is pending", async () => {
		const { screen, actions } = await openAThenB(() => new Promise<RetakeSummary>(() => {}));
		await expectNothingFromA(screen, actions);
	});

	it("shows none of the last volume's count when the next volume's summary fails", async () => {
		const { screen, actions } = await openAThenB(() => Promise.reject(new Error('boom')));
		await expectNothingFromA(screen, actions);
	});

	it('drops a summary that arrives for a volume no longer shown', async () => {
		vi.spyOn(recordsApi, 'listAll').mockImplementation(async (params) =>
			params?.collection_id === 8 ? [rec(20, 1, 'captured')] : [rec(1, 1, 'captured')]
		);
		let releaseA: () => void = () => {};
		vi.spyOn(recordsApi, 'toRetakeSummary')
			.mockImplementationOnce(() => new Promise<RetakeSummary>((resolve) => (releaseA = () => resolve(summaryA))))
			.mockImplementation(() => new Promise<RetakeSummary>(() => {}));
		const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
		const screen = render(CollectionPage, { context: volumeTopbarContext(slot) });
		await expect.element(screen.getByText('Par 1')).toBeInTheDocument();

		pageStore.value?.set(pageAt('8'));
		await expect.element(screen.getByText('Par 20')).toBeInTheDocument();
		releaseA();
		await new Promise((r) => setTimeout(r, 100));
		await expect.poll(() => slot.actions).not.toBeNull();
		const actions = render(SnippetHost, { snippet: slot.actions! });
		await expectNothingFromA(screen, actions);
	});
});

// The Resumen's recapture band and "Volúmenes con recapturas" (0.2.0), drawn
// from GET /records/to-retake/summary: hidden while nothing is pending, the
// band's counts and the volume with most pending, a Recapturar for each
// volume that opens its first pending record, and no capture links for a
// reviewer, who cannot capture.
//
// Version: 0.3.2
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

import type { RetakeSummary } from '$lib/api';
import { locale } from '$lib/i18n';
import '../../../app.css';
import RetakeBand from './RetakeBand.svelte';

const summary: RetakeSummary = {
	pendingRecords: 33,
	volumes: [
		{ collectionId: 92, projectId: 24, name: 'Tomo 066', filenameStem: 'co-ahr-not-t066', pending: 31, total: 31, excluded: 0, firstPendingRecordId: 20946, pendingRecordIds: Array.from({ length: 31 }, (_, i) => 20946 + i) },
		{ collectionId: 3, projectId: 24, name: 'Tomo 003', filenameStem: 'co-ahr-not-t003', pending: 2, total: 4, excluded: 0, firstPendingRecordId: 11, pendingRecordIds: [11, 12] }
	],
	turn: { state: 'recaptures', unlockedBy: null }
};

beforeEach(() => locale.set('es'));

describe('RetakeBand', () => {
	it('draws nothing while no record is pending, or without a summary', async () => {
		const free = render(RetakeBand, { summary: { pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } }, canRetake: true });
		expect(free.container.textContent?.trim()).toBe('');
		const none = render(RetakeBand, { summary: null, canRetake: true });
		expect(none.container.textContent?.trim()).toBe('');
	});

	it('shows the counts, the body, the volume with most pending, and a start link to it', async () => {
		const screen = render(RetakeBand, { summary, canRetake: true });
		const band = screen.getByRole('region', { name: '33 pares de páginas por recapturar en 2 volúmenes' });
		await expect.element(band).toBeVisible();
		await expect.element(band.getByText('La lista de digitalización pide volver a capturarlos.', { exact: false })).toBeVisible();
		await expect.element(band.getByText('Con más pendientes: Tomo 066 (31).')).toBeVisible();
		await expect
			.element(band.getByRole('link', { name: 'Empezar recapturas' }))
			.toHaveAttribute('href', '/live-preview?projectId=24&collectionId=92&recordId=20946');
	});

	it('lists every volume with its pending count and a Recapturar link to its first pending record', async () => {
		const screen = render(RetakeBand, { summary, canRetake: true });
		const list = screen.getByRole('region', { name: 'Volúmenes con recapturas' });
		const rows = list.getByRole('listitem');
		await expect.element(rows.first()).toBeVisible();
		expect(rows.elements()).toHaveLength(2);
		await expect.element(rows.nth(0).getByText('Tomo 066')).toBeVisible();
		await expect.element(rows.nth(0).getByText('co-ahr-not-t066')).toBeVisible();
		await expect.element(rows.nth(0).getByText('31 de 31 pendientes')).toBeVisible();
		await expect.element(rows.nth(1).getByText('2 de 4 pendientes')).toBeVisible();
		await expect
			.element(rows.nth(1).getByRole('link', { name: 'Recapturar' }))
			.toHaveAttribute('href', '/live-preview?projectId=24&collectionId=3&recordId=11');
	});

	it('draws the start button in sand with dark text', async () => {
		const screen = render(RetakeBand, { summary, canRetake: true });
		const cta = screen.getByRole('link', { name: 'Empezar recapturas' });
		await expect.element(cta).toBeVisible();
		const style = getComputedStyle(cta.element());
		expect(style.backgroundColor).toBe('rgb(225, 183, 120)');
		expect(style.color).toBe('rgb(19, 17, 16)');
	});

	it('gives a reviewer the band and the list but no capture links', async () => {
		const screen = render(RetakeBand, { summary, canRetake: false });
		await expect.element(screen.getByText('Con más pendientes: Tomo 066 (31).')).toBeVisible();
		await expect.element(screen.getByText('31 de 31 pendientes')).toBeVisible();
		expect(screen.container.querySelectorAll('a')).toHaveLength(0);
	});

	it('counts the records that miss a side among the pending, never more pending than in all (0.3.2)', async () => {
		// The backend counts a missing side in `pending` and not in `total`.
		const missing: RetakeSummary = {
			pendingRecords: 2,
			volumes: [{ collectionId: 5, projectId: 24, name: 'Tomo 010', filenameStem: 'co-ahr-not-t010', pending: 2, total: 0, excluded: 0, firstPendingRecordId: 40, pendingRecordIds: [40, 41], missingSideRecordIds: [40, 41] }],
			turn: { state: 'recaptures', unlockedBy: null }
		};
		const screen = render(RetakeBand, { summary: missing, canRetake: true });
		await expect.element(screen.getByRole('region', { name: '2 pares de páginas por recapturar en un volumen' })).toBeVisible();
		await expect.element(screen.getByText('2 de 2 pendientes')).toBeVisible();
		const fill = screen.container.querySelector<HTMLElement>('.rb-bar-fill');
		expect(fill?.style.width).toBe('0%');
	});
});

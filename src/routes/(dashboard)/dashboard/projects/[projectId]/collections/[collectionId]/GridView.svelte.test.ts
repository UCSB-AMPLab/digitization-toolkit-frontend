// NEH-210: Gallery is navigation/organization/filtering only — quality
// review requires the full-size Book view, so no approve/reject control
// (individual or bulk) may ever render in the grid toolbar or on a card.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import type { Record as ApiRecord } from '$lib/api';
import GridView from './GridView.svelte';

function makeRecord(overrides: Partial<ApiRecord> = {}): ApiRecord {
	return {
		id: 1,
		title: 'Test record',
		status: 'in_review',
		capture_mode: 'single',
		images: [
			{
				id: 10,
				record_id: 1,
				filename: 'img.jpg',
				file_path: '/img.jpg',
				format: 'jpg',
				is_current: true
			}
		],
		...overrides
	} as ApiRecord;
}

function baseProps(overrides: Record<string, unknown> = {}) {
	return {
		records: [makeRecord()],
		collectionId: 1,
		triggerFinalizeModal: false,
		onRecordsUpdate: vi.fn(),
		onFinalized: vi.fn(),
		onFinalizeModalClosed: vi.fn(),
		...overrides
	};
}

describe('GridView toolbar (NEH-210: Gallery has no approve/reject controls)', () => {
	it('keeps the navigation/organization tools: Filtros, Renumerar, Reordenar and the columns slider', async () => {
		const screen = render(GridView, baseProps());

		await expect.element(screen.getByRole('button', { name: 'Filtros' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Renumerar' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Reordenar' })).toBeVisible();
		await expect.element(screen.getByRole('slider', { name: 'Número de columnas' })).toBeVisible();
	});

	it('the status filter panel only filters — it exposes no approve/reject action', async () => {
		const screen = render(GridView, baseProps());
		await screen.getByRole('button', { name: 'Filtros' }).click();

		await expect.element(screen.getByRole('button', { name: 'Aprobado' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Rechazado' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'En revisión' })).toBeVisible();

		// These are filter chips, not status-change actions.
		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
	});

	it('no approve/reject text, checkbox, or bulk-selection control exists anywhere in the toolbar or grid', async () => {
		const screen = render(GridView, baseProps());

		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('checkbox')).not.toBeInTheDocument();
		await expect.element(screen.getByText('registro seleccionado', { exact: false })).not.toBeInTheDocument();
	});

	it('clicking a grid card does not surface any review action (it is not selectable)', async () => {
		const screen = render(GridView, baseProps());
		const card = screen.container.querySelector('.grid-card') as HTMLElement;
		expect(card).not.toBeNull();

		await card.click();

		await expect.element(screen.getByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
	});
});

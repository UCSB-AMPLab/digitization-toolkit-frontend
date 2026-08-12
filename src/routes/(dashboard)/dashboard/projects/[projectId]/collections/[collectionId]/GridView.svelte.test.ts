// NEH-210: Gallery is navigation/organization/filtering only — quality
// review requires the full-size Book view, so no approve/reject control
// (individual or bulk) may ever render in the grid toolbar or on a card.
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
// .image-grid's grid-template-columns (the --grid-cols mapping) lives in the
// global stylesheet, not in this component's scoped <style> — needed here so
// pixel-width assertions reflect real grid track sizing, not a single
// implicit column.
import '../../../../../../../app.css';

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

function makePairRecord(overrides: Partial<ApiRecord> = {}): ApiRecord {
	return {
		id: 2,
		title: 'Document demo 1',
		status: 'in_review',
		capture_mode: 'dual',
		images: [
			{
				id: 20,
				record_id: 2,
				filename: 'left.jpg',
				file_path: '/left.jpg',
				format: 'jpg',
				role: 'left',
				is_current: true
			},
			{
				id: 21,
				record_id: 2,
				filename: 'right.jpg',
				file_path: '/right.jpg',
				format: 'jpg',
				role: 'right',
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
		onRecordClick: vi.fn(),
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
		// exact:true — the grid card is also role="button" (NEH-211 click-to-book-view)
		// and its accessible name includes its StatusBadge text, so a loose
		// substring match would ambiguously hit both elements.
		await expect.element(screen.getByRole('button', { name: 'En revisión', exact: true })).toBeVisible();

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

describe('GridView L/R pair grouping (NEH-211: pairs read as a single block)', () => {
	it('wraps an L/R pair in a single .grid-pair container, not two independent .grid-card elements', async () => {
		const screen = render(GridView, baseProps({ records: [makePairRecord()] }));

		const pairs = screen.container.querySelectorAll('.grid-pair');
		expect(pairs.length).toBe(1);

		// The pair must not also render as two separate top-level cards.
		const cards = screen.container.querySelectorAll('.grid-card');
		expect(cards.length).toBe(0);

		// Both thumbnails live inside that single container, side by side.
		const thumbs = pairs[0].querySelectorAll('.card-image-wrapper');
		expect(thumbs.length).toBe(2);
	});

	it('keeps the L and R badges inside the pair container', async () => {
		const screen = render(GridView, baseProps({ records: [makePairRecord()] }));

		const pair = screen.container.querySelector('.grid-pair') as HTMLElement;
		expect(pair).not.toBeNull();

		const badges = Array.from(pair.querySelectorAll('.role-badge')).map((el) => el.textContent);
		expect(badges).toEqual(['L', 'R']);
	});

	it('renders the document name exactly once per pair, not once per thumbnail', async () => {
		const screen = render(GridView, baseProps({ records: [makePairRecord()] }));

		const names = screen.container.querySelectorAll('.pair-name');
		expect(names.length).toBe(1);
		expect(names[0].textContent).toBe('Document demo 1');

		await expect.element(screen.getByText('Document demo 1')).toBeVisible();
	});

	it('a single-capture record (no pair) still renders as one plain .grid-card, unaffected by the pair grouping', async () => {
		const screen = render(GridView, baseProps({ records: [makeRecord()] }));

		expect(screen.container.querySelectorAll('.grid-pair').length).toBe(0);
		expect(screen.container.querySelectorAll('.grid-card').length).toBe(1);
	});

	it('grouping is stable across the grid-size slider range (min, mid, max columns)', async () => {
		const screen = render(GridView, baseProps({ records: [makePairRecord()] }));
		const slider = screen.getByRole('slider', { name: 'Número de columnas' });

		for (const value of ['2', '4', '6']) {
			await slider.fill(value);
			const pairs = screen.container.querySelectorAll('.grid-pair');
			expect(pairs.length).toBe(1);
			expect(pairs[0].querySelectorAll('.card-image-wrapper').length).toBe(2);
			expect(screen.container.querySelectorAll('.pair-name').length).toBe(1);
		}
	});

	// The actual regression this ticket fixed: L/R thumbnails inside a pair
	// must render at the SAME pixel width as a single-capture thumbnail —
	// not squeezed to fit inside one grid column.
	it('L/R thumbnails inside a pair are exactly as wide as a single-capture thumbnail, at every slider size', async () => {
		const screen = render(
			GridView,
			baseProps({ records: [makeRecord({ id: 1, title: 'Single doc' }), makePairRecord({ id: 2 })] })
		);
		const slider = screen.getByRole('slider', { name: 'Número de columnas' });

		for (const value of ['2', '4', '6']) {
			await slider.fill(value);

			const singleWidth = (
				screen.container.querySelector('.grid-card .card-image-wrapper') as HTMLElement
			).getBoundingClientRect().width;
			const pairThumbWidths = Array.from(
				screen.container.querySelectorAll('.grid-pair .card-image-wrapper')
			).map((el) => (el as HTMLElement).getBoundingClientRect().width);

			expect(pairThumbWidths).toHaveLength(2);
			for (const w of pairThumbWidths) {
				expect(Math.abs(w - singleWidth)).toBeLessThanOrEqual(1); // sub-pixel rounding only
			}
		}
	});

	it('Reordenar mode keeps the pair framed as one draggable unit, not two separate draggable cards', async () => {
		const screen = render(
			GridView,
			baseProps({ records: [makeRecord({ id: 1, title: 'Single doc' }), makePairRecord({ id: 2 })] })
		);

		await screen.getByRole('button', { name: 'Reordenar' }).click();

		// One draggable element per record: the pair is a single .grid-pair.draggable,
		// not two .grid-card.draggable items that could be dragged apart.
		const draggablePairs = screen.container.querySelectorAll('.grid-pair.draggable');
		expect(draggablePairs.length).toBe(1);
		expect(draggablePairs[0].querySelectorAll('.card-image-wrapper').length).toBe(2);
		expect(draggablePairs[0].querySelectorAll('.reorder-handle').length).toBe(1);

		const draggableCards = screen.container.querySelectorAll('.grid-card.draggable');
		expect(draggableCards.length).toBe(1);
		expect(draggableCards[0].querySelectorAll('.reorder-handle').length).toBe(1);

		// The old dots-based drag handle must be gone entirely.
		expect(screen.container.querySelectorAll('.drag-handle').length).toBe(0);

		// Still just one document name for the pair, even while reordering.
		expect(screen.container.querySelectorAll('.pair-name').length).toBe(1);
	});
});

describe('GridView click-to-Book-view (same pattern as ListView row click)', () => {
	it('clicking a single-capture card calls onRecordClick with that record', async () => {
		const onRecordClick = vi.fn();
		const record = makeRecord({ id: 7, title: 'Single doc' });
		const screen = render(GridView, baseProps({ records: [record], onRecordClick }));

		const card = screen.container.querySelector('.grid-card') as HTMLElement;
		await card.click();

		expect(onRecordClick).toHaveBeenCalledExactlyOnceWith(record);
	});

	it('clicking anywhere on an L/R pair calls onRecordClick once with that record (spread view shows both pages)', async () => {
		const onRecordClick = vi.fn();
		const record = makePairRecord({ id: 8 });
		const screen = render(GridView, baseProps({ records: [record], onRecordClick }));

		const pair = screen.container.querySelector('.grid-pair') as HTMLElement;
		await pair.click();

		expect(onRecordClick).toHaveBeenCalledExactlyOnceWith(record);
	});

	it('does not navigate on click while in Reordenar mode', async () => {
		const onRecordClick = vi.fn();
		const screen = render(
			GridView,
			baseProps({ records: [makeRecord(), makePairRecord({ id: 9 })], onRecordClick })
		);

		await screen.getByRole('button', { name: 'Reordenar' }).click();
		const card = screen.container.querySelector('.grid-card.draggable') as HTMLElement;
		const pair = screen.container.querySelector('.grid-pair.draggable') as HTMLElement;
		await card.click();
		await pair.click();

		expect(onRecordClick).not.toHaveBeenCalled();
	});
});

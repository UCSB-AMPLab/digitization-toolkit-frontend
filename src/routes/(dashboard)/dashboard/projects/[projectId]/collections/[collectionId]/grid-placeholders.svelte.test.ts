// NEH-317: placeholders in the volume grid. A placeholder for a whole
// opening (missing_side "both") is two empty pages under a dashed sand
// border, with its pill, what it should hold and the note; a record missing
// one page keeps its frame with its own pill; a closed record has a grey
// dashed border, the Closed pill and its reason. A legend sits under the
// grid. Admin and operator can mark an opening missing from the toolbar or
// between two tiles, through the mark dialog.
//
// Version: 0.3.3
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../../../../../../app.css';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, type Record as ApiRecord } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import GridView from './GridView.svelte';

const SAND = 'rgb(208, 154, 68)';

function pair(id: number, sequence: number, extra: Partial<ApiRecord> = {}): ApiRecord {
	return {
		id, title: `Registro ${sequence}`, status: 'in_review', capture_mode: 'dual', sequence,
		images: [
			{ id: id * 10, record_id: id, filename: 'l.jpg', file_path: '/l', format: 'jpg', role: 'left', is_current: true },
			{ id: id * 10 + 1, record_id: id, filename: 'r.jpg', file_path: '/r', format: 'jpg', role: 'right', is_current: true }
		],
		...extra
	} as ApiRecord;
}

function placeholder(id: number, sequence: number, extra: Partial<ApiRecord> = {}): ApiRecord {
	return {
		id, title: `Registro ${sequence}`, status: 'captured', capture_mode: 'dual', sequence, images: [],
		missing_side: 'both', missing_expected: 'Folios 90v y 91r', missing_note: 'Marcado en Fisqua: parece faltar el folio 91.',
		missing_request_id: null, closed_reason: null, closed_note: null,
		...extra
	} as ApiRecord;
}

function signIn(role: UserRole) {
	authStore.setSession('tok', { id: 1, username: role, email: null, role, is_active: true });
}

function mount(records: ApiRecord[], onRecordsUpdate = vi.fn(), onRecordClick = vi.fn()) {
	return render(GridView, { records, collectionId: 17, onRecordsUpdate, onRecordClick });
}

function cardOf(screen: ReturnType<typeof render>, title: string): HTMLElement {
	const name = [...screen.container.querySelectorAll<HTMLElement>('.card-name')].find((n) => n.textContent?.trim() === title);
	const card = name?.closest<HTMLElement>('.grid-pair, .grid-card');
	if (!card) throw new Error(`no card for ${title}`);
	return card;
}

beforeEach(() => {
	locale.set('es');
	signIn('operator');
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('grid: placeholders and closed records (NEH-317)', () => {
	it('draws a placeholder for an opening as two empty pages under a dashed sand border, with its pill, what it should hold and the note', async () => {
		const screen = mount([pair(1, 95), placeholder(2, 96)]);
		await expect.element(screen.getByText(es.pill_opening_missing)).toBeVisible();
		const card = cardOf(screen, 'Registro 96');
		expect(card.classList.contains('is-placeholder')).toBe(true);
		const halves = card.querySelectorAll('.card-image-wrapper');
		expect(halves).toHaveLength(2);
		expect(halves[0].querySelector('[data-missing-side="left"]')).not.toBeNull();
		expect(halves[1].querySelector('[data-missing-side="right"]')).not.toBeNull();
		const style = getComputedStyle(card);
		expect(style.borderTopStyle).toBe('dashed');
		expect(style.borderTopColor).toBe(SAND);
		expect(card.textContent).toContain('Folios 90v y 91r');
		expect(card.textContent).toContain('Marcado en Fisqua: parece faltar el folio 91.');
		// Not the record's status: a placeholder is captured only in name.
		expect(card.textContent).not.toContain(es.status_captured);
	});

	it('keeps the frame of a record missing one page, with the Page not captured pill', async () => {
		const missing = pair(3, 99, {
			status: 'captured',
			missing_side: 'left',
			images: [{ id: 31, record_id: 3, filename: 'r.jpg', file_path: '/r', format: 'jpg', role: 'right', is_current: true }]
		});
		const screen = mount([missing]);
		const card = cardOf(screen, 'Registro 99');
		await expect.element(screen.getByText(es.pill_page_missing)).toBeVisible();
		expect(card.classList.contains('is-placeholder')).toBe(false);
		expect(card.classList.contains('is-closed')).toBe(false);
	});

	it('gives a closed placeholder a grey dashed border, the Closed pill and its reason, and no sand pill', async () => {
		const closed = placeholder(4, 100, { closed_reason: 'foliation_skip', closed_note: 'Al 90 le sigue el 92.' });
		const screen = mount([closed]);
		const card = cardOf(screen, 'Registro 100');
		await expect.element(screen.getByText(es.pill_closed, { exact: true })).toBeVisible();
		expect(card.textContent).toContain(es.close_reason_skip);
		expect(card.textContent).toContain('Al 90 le sigue el 92.');
		expect(card.textContent).not.toContain(es.pill_opening_missing);
		expect(card.classList.contains('is-closed')).toBe(true);
		const style = getComputedStyle(card);
		expect(style.borderTopStyle).toBe('dashed');
		expect(style.borderTopColor).toMatch(/^rgba?\(171, 183, 183/);
	});

	it('closes a record missing one page the same way, whatever its side', async () => {
		const closed = pair(5, 101, {
			status: 'captured', missing_side: 'right', closed_reason: 'captured_elsewhere', closed_note: null,
			images: [{ id: 51, record_id: 5, filename: 'l.jpg', file_path: '/l', format: 'jpg', role: 'left', is_current: true }]
		});
		const screen = mount([closed]);
		const card = cardOf(screen, 'Registro 101');
		await expect.element(screen.getByText(es.pill_closed, { exact: true })).toBeVisible();
		expect(card.textContent).toContain(es.close_reason_elsewhere);
		expect(card.textContent).not.toContain(es.pill_page_missing);
		expect(card.classList.contains('is-closed')).toBe(true);
	});

	it('explains the three colours in a legend under the grid', async () => {
		const screen = mount([pair(1, 95)]);
		const legend = screen.getByRole('list', { name: es.legend_title });
		await expect.element(legend).toBeVisible();
		await expect.element(legend.getByText(es.legend_rejected)).toBeVisible();
		await expect.element(legend.getByText(es.legend_never)).toBeVisible();
		await expect.element(legend.getByText(es.legend_closed)).toBeVisible();
		const swatches = [...legend.element().querySelectorAll<HTMLElement>('.legend-swatch')];
		expect(swatches.map((s) => getComputedStyle(s).borderTopColor)).toEqual(['rgb(214, 103, 74)', SAND, expect.stringMatching(/^rgba?\(171, 183, 183/)]);
	});
});

describe('grid: marking an opening missing (NEH-317)', () => {
	it('is offered to an operator in the toolbar, and not to a reviewer', async () => {
		const screen = mount([pair(1, 95), pair(2, 96)]);
		await expect.element(screen.getByRole('button', { name: es.toolbar_mark_missing })).toBeVisible();
		screen.unmount();
		signIn('reviewer');
		const other = mount([pair(1, 95), pair(2, 96)]);
		await expect.element(other.getByRole('button', { name: 'Filtros' })).toBeVisible();
		await expect.element(other.getByRole('button', { name: es.toolbar_mark_missing })).not.toBeInTheDocument();
		await expect.element(other.getByRole('button', { name: es.hover_missing_here, exact: true })).not.toBeInTheDocument();
	});

	it('from the toolbar, asks for the record the opening goes after, and opens the dialog for the one clicked', async () => {
		const onRecordClick = vi.fn();
		const screen = mount([pair(1, 95), pair(2, 96)], vi.fn(), onRecordClick);
		await screen.getByRole('button', { name: es.toolbar_mark_missing }).click();
		await expect.element(screen.getByText(es.mark_pick_hint)).toBeVisible();
		cardOf(screen, 'Registro 95').click();
		const dialog = screen.getByRole('dialog', { name: es.mark_title });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByText(es.mark_body(95, null))).toBeVisible();
		expect(onRecordClick).not.toHaveBeenCalled();
	});

	it('cancels the choice without opening anything', async () => {
		const screen = mount([pair(1, 95), pair(2, 96)]);
		await screen.getByRole('button', { name: es.toolbar_mark_missing }).click();
		await screen.getByRole('button', { name: es.mark_cancel }).click();
		await expect.element(screen.getByText(es.mark_pick_hint)).not.toBeInTheDocument();
	});

	it('offers An opening is missing here between two tiles, not after the last, and opens the dialog for the tile before it', async () => {
		const screen = mount([pair(1, 95), pair(2, 96), pair(3, 97)]);
		const between = screen.getByRole('button', { name: es.hover_missing_here, exact: true });
		await expect.element(between.first()).toBeInTheDocument();
		expect(between.elements()).toHaveLength(2);
		(between.elements()[1] as HTMLElement).click();
		const dialog = screen.getByRole('dialog', { name: es.mark_title });
		await expect.element(dialog.getByText(es.mark_body(96, null))).toBeVisible();
	});

	it('marks it and reloads the grid', async () => {
		const spy = vi.spyOn(collectionsApi, 'markMissingOpenings').mockResolvedValue([placeholder(9, 96)]);
		const onRecordsUpdate = vi.fn();
		const screen = mount([pair(1, 95), pair(2, 96)], onRecordsUpdate);
		(screen.getByRole('button', { name: es.hover_missing_here, exact: true }).element() as HTMLElement).click();
		const dialog = screen.getByRole('dialog', { name: es.mark_title });
		await dialog.getByRole('button', { name: es.mark_submit }).click();
		await vi.waitFor(() => expect(onRecordsUpdate).toHaveBeenCalled());
		expect(spy).toHaveBeenCalledWith(17, { afterRecordId: 1, count: null, expected: null, note: null });
		await expect.element(screen.getByRole('dialog', { name: es.mark_title })).not.toBeInTheDocument();
	});
});

describe('grid: the hover button and the legend (NEH-317, round 2)', () => {
	it('puts An opening is missing here beside the card, not inside it, so the card keeps its own name', async () => {
		const screen = mount([pair(1, 95), pair(2, 96)]);
		const button = screen.getByRole('button', { name: es.hover_missing_here, exact: true });
		await expect.element(button).toBeInTheDocument();
		expect(button.element().closest('[role="button"]:not(button)')).toBeNull();
		const card = cardOf(screen, 'Registro 95');
		expect(card.textContent).not.toContain(es.hover_missing_here);
	});

	it('offers no hover button while a filter is on, or while reordering', async () => {
		const screen = mount([pair(1, 95), pair(2, 96)]);
		await screen.getByRole('button', { name: 'Filtros' }).click();
		await screen.getByRole('button', { name: 'En revisión', exact: true }).click();
		await expect.element(screen.getByRole('button', { name: es.hover_missing_here, exact: true })).not.toBeInTheDocument();
		await screen.getByRole('button', { name: es.col_clear_filter }).click();
		await expect.element(screen.getByRole('button', { name: es.hover_missing_here, exact: true })).toBeInTheDocument();
		await screen.getByRole('button', { name: 'Reordenar' }).click();
		await expect.element(screen.getByRole('button', { name: es.hover_missing_here, exact: true })).not.toBeInTheDocument();
	});

	it('lets the last row scroll clear of the legend', async () => {
		const records = Array.from({ length: 9 }, (_, i) => pair(i + 1, 90 + i));
		records.push(placeholder(20, 99, { closed_reason: 'foliation_skip' }));
		const screen = render(GridView, { records, collectionId: 17, onRecordsUpdate: vi.fn(), onRecordClick: vi.fn() });
		const view = screen.container.querySelector<HTMLElement>('.grid-view')!;
		view.style.height = '500px';
		await expect.element(screen.getByText(es.pill_closed, { exact: true })).toBeInTheDocument();
		const grid = view.querySelector<HTMLElement>('.image-grid')!;
		grid.scrollTop = grid.scrollHeight;
		await new Promise((r) => requestAnimationFrame(() => r(null)));
		const last = cardOf(screen, 'Registro 99').getBoundingClientRect();
		const legend = view.querySelector<HTMLElement>('.grid-legend')!.getBoundingClientRect();
		expect(last.bottom).toBeLessThanOrEqual(legend.top);
	});
});

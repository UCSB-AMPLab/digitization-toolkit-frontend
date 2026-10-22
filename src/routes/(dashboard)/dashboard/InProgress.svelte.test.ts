// "Digitalizaciones en curso": the Tablero/Tabla switch, both views rendered
// from mocked GET /activity/collections data, the actions on each card, and
// what the block shows when the endpoint fails.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { activityApi, ApiError, type Collection, type CollectionActivity, type Project, type StatusCounts } from '$lib/api';
import InProgress from './InProgress.svelte';

const VIEW_KEY = 'dtk_dashboard_in_progress_view';

const projects: Project[] = [{ id: 1, name: 'Fondo Rionegro' } as Project];

function coll(id: number, name: string, lastActivity: string | null): Collection {
	return { id, name, project_id: 1, created_at: '2026-01-01T00:00:00', last_activity_at: lastActivity };
}

function act(id: number, c: Partial<StatusCounts>, at: string | null): CollectionActivity {
	const sc = { captured: 0, in_review: 0, rejected: 0, approved: 0, ...c };
	return {
		collection_id: id,
		status_counts: sc,
		record_count: sc.captured + sc.in_review + sc.rejected + sc.approved,
		last_status_change_at: at
	};
}

const collections: Collection[] = [
	coll(1, 'Tomo 1', '2026-10-22T10:00:00'),
	coll(2, 'Tomo 2', '2026-10-21T10:00:00'),
	coll(3, 'Tomo 3', '2026-10-20T10:00:00'),
	coll(4, 'Tomo 4', '2026-10-19T10:00:00'),
	coll(5, 'Tomo vacío', null)
];

const activity: CollectionActivity[] = [
	act(1, { captured: 3, in_review: 10, rejected: 1, approved: 20 }, '2026-10-22T10:00:00'),
	act(2, { rejected: 1, approved: 39 }, '2026-10-21T10:00:00'),
	act(3, { in_review: 1 }, '2026-10-20T10:00:00'),
	act(4, { approved: 51 }, '2026-10-19T10:00:00'),
	act(5, {}, null)
];

describe('InProgress', () => {
	let activitySpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		localStorage.removeItem(VIEW_KEY);
		gotoMock.mockClear();
		activitySpy = vi.spyOn(activityApi, 'collections').mockResolvedValue(activity);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.removeItem(VIEW_KEY);
	});

	const mount = () => render(InProgress, { collections, projects });

	it('opens on Tabla, with the switch labelled Vista', async () => {
		const screen = mount();
		const group = screen.getByRole('group', { name: 'Vista' });
		await expect.element(group.getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'true');
		await expect.element(group.getByRole('button', { name: 'Tablero' })).toHaveAttribute('aria-pressed', 'false');
		// Column headers are hidden at the narrow test viewport; present in the DOM.
		await expect.element(screen.getByText('Avance')).toBeInTheDocument();
	});

	it('Tabla: the existing rows plus a progress cell with counts as text', async () => {
		const screen = mount();
		await expect.element(screen.getByText('34 registros')).toBeVisible();
		await expect.element(screen.getByText('Capturados: 3, Rechazados: 1, En revisión: 10, Aprobados: 20')).toBeInTheDocument();
		// Only volumes with records are listed, as before.
		await expect.element(screen.getByText('Tomo vacío')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
	});

	it('Tablero: four columns in order, each volume in its stage, and the choice remembered', async () => {
		const screen = mount();
		await screen.getByRole('button', { name: 'Tablero' }).click();
		await expect.element(screen.getByRole('button', { name: 'Tablero' })).toHaveAttribute('aria-pressed', 'true');
		expect(localStorage.getItem(VIEW_KEY)).toBe('board');

		const headings = screen.getByRole('heading', { level: 3 }).elements().map((h) => h.textContent?.trim());
		expect(headings).toEqual(['En captura', 'Por recapturar', 'En revisión', 'Aprobado']);

		const capture = screen.getByRole('region', { name: 'En captura' });
		const recapture = screen.getByRole('region', { name: 'Por recapturar' });
		const review = screen.getByRole('region', { name: 'En revisión' });
		const approved = screen.getByRole('region', { name: 'Aprobado' });

		await expect.element(capture.getByText('Volúmenes con registros que todavía no están en revisión.')).toBeVisible();
		await expect.element(recapture.getByText('Volúmenes con imágenes rechazadas que hay que volver a capturar.')).toBeVisible();
		await expect.element(review.getByText('Volúmenes con registros pendientes de revisión.')).toBeVisible();
		await expect.element(approved.getByText('Volúmenes con todos los registros aprobados, listos para exportar.')).toBeVisible();

		expect(capture.getByRole('article').elements().length).toBe(2);
		await expect.element(capture.getByRole('article', { name: 'Tomo 1' })).toBeVisible();
		await expect.element(capture.getByRole('article', { name: 'Tomo vacío' })).toBeVisible();
		await expect.element(capture.getByText('2 volúmenes')).toBeInTheDocument();
		await expect.element(recapture.getByRole('article', { name: 'Tomo 2' })).toBeVisible();
		await expect.element(review.getByRole('article', { name: 'Tomo 3' })).toBeVisible();
		await expect.element(approved.getByRole('article', { name: 'Tomo 4' })).toBeVisible();

		const card3 = review.getByRole('article', { name: 'Tomo 3' });
		await expect.element(card3.getByText('1 registro', { exact: true })).toBeVisible();
		await expect.element(card3.getByText('En revisión: 1')).toBeInTheDocument();
		await expect.element(capture.getByRole('article', { name: 'Tomo vacío' }).getByText('0 registros')).toBeVisible();
		await expect.element(approved.getByRole('article', { name: 'Tomo 4' }).getByText('51 registros')).toBeVisible();
	});

	it('Tablero: Capturar on the first two columns, Revisar on En revisión, nothing on Aprobado', async () => {
		localStorage.setItem(VIEW_KEY, 'board');
		const screen = mount();

		const capture = screen.getByRole('region', { name: 'En captura' });
		const recapture = screen.getByRole('region', { name: 'Por recapturar' });
		const review = screen.getByRole('region', { name: 'En revisión' });
		const approved = screen.getByRole('region', { name: 'Aprobado' });

		await expect.element(capture.getByRole('article', { name: 'Tomo 1' }).getByRole('button', { name: 'Capturar' })).toBeVisible();
		await recapture.getByRole('button', { name: 'Capturar' }).click();
		expect(gotoMock).toHaveBeenCalledWith('/live-preview?projectId=1&collectionId=2');

		await expect.element(review.getByRole('button', { name: 'Capturar' })).not.toBeInTheDocument();
		await review.getByRole('button', { name: 'Revisar' }).click();
		expect(gotoMock).toHaveBeenCalledWith('/dashboard/projects/1/collections/3');

		await expect.element(approved.getByRole('article', { name: 'Tomo 4' })).toBeVisible();
		expect(approved.getByRole('button').elements().length).toBe(0);
	});

	it('the switch works from the keyboard', async () => {
		const screen = mount();
		const board = screen.getByRole('button', { name: 'Tablero' });
		(board.element() as HTMLElement).focus();
		await userEvent.keyboard('{Enter}');
		await expect.element(board).toHaveAttribute('aria-pressed', 'true');
		await expect.element(screen.getByRole('region', { name: 'En captura' })).toBeVisible();

		const table = screen.getByRole('button', { name: 'Tabla' });
		(table.element() as HTMLElement).focus();
		await userEvent.keyboard(' ');
		await expect.element(table).toHaveAttribute('aria-pressed', 'true');
		// Column headers are hidden at the narrow test viewport; present in the DOM.
		await expect.element(screen.getByText('Avance')).toBeInTheDocument();
	});

	it('opens on Tabla when the stored choice cannot be read', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const screen = mount();
		await expect.element(screen.getByRole('button', { name: 'Tabla' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('endpoint failure: the board shows the error instead of a blank, the table keeps its rows', async () => {
		activitySpy.mockRejectedValue(new ApiError('boom'));
		localStorage.setItem(VIEW_KEY, 'board');
		const screen = mount();

		await expect.element(screen.getByRole('status')).toHaveTextContent('No se pudo cargar el avance de los volúmenes: boom');
		await expect.element(screen.getByRole('region', { name: 'En captura' })).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Tabla' }).click();
		await expect.element(screen.getByRole('status')).toHaveTextContent('No se pudo cargar el avance de los volúmenes: boom');
		await expect.element(screen.getByText('Tomo 1')).toBeVisible();
	});
});

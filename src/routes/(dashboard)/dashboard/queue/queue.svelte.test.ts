// Cola (/dashboard/queue): an imported list's items in order, with each
// item's action, notes, stage and capture button; Siguiente, done items
// and the manual done mark; the action filter; the list picker; and
// importing a list, with the report and its skips; and the Fisqua queue
// (contract 1.7): shown first, filtered by assignee, without withdrawn or
// hidden items, with a spot recapture's pairs, and done marks by itemId.
// GET and PUT under /imports/digitisation-lists and POST
// /imports/digitisation-list are mocked.
//
// Version: 0.3.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { importsApi, recordsApi, ApiError, AuthError, type ImportReport, type QueueItem, type QueueList, type RecordToRetake, type RetakeSummary, type StatusCounts } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import '../../../../app.css';
import Queue from './+page.svelte';

function counts(c: Partial<StatusCounts> = {}): StatusCounts {
	return { captured: 0, in_review: 0, rejected: 0, approved: 0, excluded: 0, ...c };
}

function item(position: number, over: Partial<QueueItem> = {}): QueueItem {
	return {
		position,
		sequence: position,
		referenceCode: `co-ahr-aht-${position}`,
		filenameStem: `co-ahr-aht-${position}`,
		title: `Tomo ${position}`,
		notes: null,
		action: null,
		collectionId: 100 + position,
		projectId: 7,
		status: counts(),
		doneMark: null,
		...over
	};
}

const LONG_NOTES =
	'117r, 116v; 193r, 192v; 201r, 200v; 215r, 214v; 230r, 229v; 244r, 243v; 260r, 259v; 271r, 270v; 288r, 287v; 299r, 298v; 310r, 309v';

const rionegro: QueueList = {
	listId: '0b9c1d5e-0000-4000-8000-000000000001',
	listName: 'Rionegro 2026',
	projectId: 7,
	importedAt: '2026-10-27T15:00:00Z',
	listFileMissing: false,
	items: [
		// Done by its records: no action, every record approved.
		item(1, { status: counts({ approved: 30 }) }),
		// Done by hand.
		item(2, {
			action: 'spot-recapture',
			notes: LONG_NOTES,
			status: counts({ captured: 2, in_review: 3 }),
			doneMark: { by: 'revisora', at: '2026-10-26T15:00:00' }
		}),
		item(3, { title: 'Tomo sin volumen', collectionId: null, projectId: null, status: null }),
		// Next: the first not done with a volume. In its own project.
		item(4, { action: 'complete', notes: 'Desde el folio 49r hasta el final', projectId: 8 }),
		// A full rescan of a volume whose old records are all approved: to do.
		item(5, { action: 'full-rescan', notes: null, status: counts({ approved: 30 }), projectId: null })
	]
};

const older: QueueList = {
	listId: '0b9c1d5e-0000-4000-8000-000000000002',
	listName: 'Lista anterior',
	projectId: 7,
	importedAt: '2026-09-01T10:00:00Z',
	items: [],
	listFileMissing: true
};

const FREE: RetakeSummary = { pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } };

// Volumes 104 (item 4) and 105 (item 5) have retakes pending.
function turnSummary(state: 'recaptures' | 'new'): RetakeSummary {
	return {
		pendingRecords: 33,
		volumes: [
			{ collectionId: 105, projectId: 7, name: 'Tomo 5', filenameStem: 'co-ahr-aht-5', pending: 31, total: 31, excluded: 0, firstPendingRecordId: 905, pendingRecordIds: Array.from({ length: 31 }, (_, i) => 905 + i) },
			{ collectionId: 104, projectId: 8, name: 'Tomo 4', filenameStem: 'co-ahr-aht-4', pending: 2, total: 3, excluded: 0, firstPendingRecordId: 904, pendingRecordIds: [904, 906] }
		],
		turn: { state, unlockedBy: state === 'new' ? { collectionId: 77, name: 'Tomo 002' } : null }
	};
}

function signIn(role: UserRole) {
	authStore.setSession('tok', { id: 1, username: role, email: null, role, is_active: true });
}

describe('Cola', () => {
	beforeEach(() => {
		locale.set('es');
		gotoMock.mockClear();
		signIn('operator');
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([]);
		vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(FREE);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		authStore.clearSession();
	});

	it('shows the items in order with their order number, title, code, action and notes', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		await expect.element(screen.getByRole('heading', { level: 1, name: 'Cola de digitalización' })).toBeVisible();

		const rows = screen.getByRole('listitem');
		await expect.element(rows.first()).toBeVisible();
		const titles = rows.elements().map((r) => r.querySelector('.q-title')?.textContent?.trim());
		expect(titles).toEqual(['Tomo 1', 'Tomo 2', 'Tomo sin volumen', 'Tomo 4', 'Tomo 5']);

		const row2 = rows.nth(1);
		await expect.element(row2.getByText('2', { exact: true })).toBeVisible();
		await expect.element(row2.getByText('co-ahr-aht-2')).toBeVisible();
		await expect.element(row2.getByText('Recaptura puntual')).toBeVisible();
		await expect.element(rows.nth(3).getByText('Completar digitalización')).toBeVisible();
		// The order number is read with its label, which is text, not an attribute.
		expect(rows.nth(1).element().querySelector('.q-order .visually-hidden')?.textContent).toBe('Orden 2');
		expect(rows.nth(1).element().querySelector('.q-order')?.hasAttribute('aria-label')).toBe(false);
		await expect.element(rows.nth(2).getByText('Recaptura puntual')).not.toBeInTheDocument();
	});

	it('shows long notes in full, wrapped and never cut', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		const notes = screen.getByText(LONG_NOTES);
		await expect.element(notes).toBeVisible();
		const el = notes.element() as HTMLElement;
		const style = getComputedStyle(el);
		expect(style.whiteSpace).not.toBe('nowrap');
		expect(style.textOverflow).not.toBe('ellipsis');
		// Wrapped onto more than one line, and not clipped.
		expect(el.getBoundingClientRect().height).toBeGreaterThan(parseFloat(style.lineHeight) * 1.5);
		expect(el.scrollWidth).toBeLessThanOrEqual(el.clientWidth + 1);
	});

	it('shows no notes block for an item without notes', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		const row5 = screen.getByRole('listitem').nth(4);
		await expect.element(row5.getByText('Tomo 5')).toBeVisible();
		expect(row5.element().querySelector('.q-notes')).toBeNull();
	});

	it('marks the first item that is not done and has a volume as Siguiente, and the done items as done', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		const rows = screen.getByRole('listitem');
		await expect.element(rows.nth(3).getByText('Siguiente')).toBeVisible();
		expect(screen.getByText('Siguiente', { exact: true }).elements()).toHaveLength(1);
		await expect.element(rows.nth(0).getByText('Hecho', { exact: true })).toBeVisible();
		await expect.element(rows.nth(1).getByText('Hecho', { exact: true })).toBeVisible();
		expect(screen.getByText('Hecho', { exact: true }).elements()).toHaveLength(2);
		// The done items stay in their places.
		expect(rows.nth(0).element().querySelector('.q-title')?.textContent?.trim()).toBe('Tomo 1');
		expect(rows.nth(1).element().querySelector('.q-title')?.textContent?.trim()).toBe('Tomo 2');
		await expect.element(rows.nth(0).getByText('Todos los registros están aprobados.')).toBeVisible();
		await expect.element(rows.nth(1).getByText(/^Marcado como hecho por revisora el /)).toBeVisible();
	});

	it('never shows a full rescan as done because its records are approved', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		const row5 = screen.getByRole('listitem').nth(4);
		await expect.element(row5.getByText('Aprobado', { exact: true })).toBeVisible();
		await expect.element(row5.getByText('Hecho', { exact: true })).not.toBeInTheDocument();
	});

	describe('records to retake', () => {
		function rejected(recordId: number, collectionId: number | null): RecordToRetake {
			return {
				recordId, title: `r${recordId}`, sequence: null, collectionId, projectId: 7,
				name: null, filenameStem: null, reason: 'blur', comment: null, rejectedBy: null, rejectedAt: null
			};
		}

		it('links an item whose volume has rejected records to them, with the count', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.mocked(recordsApi.toRetake).mockResolvedValue([rejected(1, 104), rejected(2, 104), rejected(3, 104), rejected(4, 104), rejected(5, 102), rejected(6, null)]);
			const screen = render(Queue);
			const rows = screen.getByRole('listitem');
			const link = rows.nth(3).getByRole('link', { name: '4 registros por recapturar' });
			await expect.element(link).toBeVisible();
			await expect.element(link).toHaveAttribute('href', '/dashboard/retakes?collectionId=104');
			await expect.element(rows.nth(1).getByRole('link', { name: '1 registro por recapturar' })).toHaveAttribute('href', '/dashboard/retakes?collectionId=102');
			expect(screen.getByRole('link', { name: /por recapturar$/ }).elements()).toHaveLength(2);
		});

		it('shows nothing on an item whose volume has none', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.mocked(recordsApi.toRetake).mockResolvedValue([rejected(1, 104)]);
			const screen = render(Queue);
			await expect.element(screen.getByRole('link', { name: '1 registro por recapturar' })).toBeVisible();
			expect(screen.getByRole('listitem').nth(0).element().querySelector('a')).toBeNull();
			expect(screen.getByRole('listitem').nth(2).element().querySelector('a')).toBeNull();
		});

		it('shows no counts and keeps the page working when the fetch fails', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.mocked(recordsApi.toRetake).mockRejectedValue(new ApiError('boom', undefined, 500));
			const screen = render(Queue);
			await expect.element(screen.getByText('Tomo 4')).toBeVisible();
			expect(screen.getByRole('link', { name: /por recapturar$/ }).elements()).toHaveLength(0);
		});
	});

	describe('recapture turn (0.2.0)', () => {
		function sectionTitles(container: HTMLElement) {
			return [...container.querySelectorAll('.q-row')].map((r) => r.querySelector('.q-title')?.textContent?.trim());
		}

		it('shows the retake turn, the volumes with retakes first, and the rest after with the lock line', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(turnSummary('recaptures'));
			const screen = render(Queue);

			const pill = screen.getByRole('status').filter({ hasText: 'Turno de recapturas' });
			await expect.element(pill).toBeVisible();
			await expect.element(pill.getByText('Termina las recapturas de un volumen y podrás empezar uno nuevo.')).toBeVisible();
			expect(getComputedStyle(pill.element()).backgroundColor).toBe('rgb(225, 183, 120)');

			const first = screen.getByRole('region', { name: 'Primero: recapturas' });
			await expect.element(first.getByText('Estos volúmenes tienen pares de páginas que la lista de digitalización pide volver a capturar.')).toBeVisible();
			expect(sectionTitles(first.element() as HTMLElement)).toEqual(['Tomo 4', 'Tomo 5']);
			const row4 = first.getByRole('listitem').nth(0);
			await expect.element(row4.getByText('2 de 3 pendientes')).toBeVisible();
			await expect
				.element(row4.getByRole('link', { name: 'Recapturar' }))
				.toHaveAttribute('href', '/live-preview?projectId=8&collectionId=104&recordId=904');

			const then = screen.getByRole('region', { name: 'Después: digitalización nueva' });
			await expect.element(then.getByText('Para empezar un volumen nuevo, primero hay que terminar las recapturas de un volumen.')).toBeVisible();
			expect(sectionTitles(then.element() as HTMLElement)).toEqual(['Tomo 1', 'Tomo 2', 'Tomo sin volumen']);
		});

		it('makes Siguiente the first item whose volume has retakes', async () => {
			// Without the summary item 4 is next; make item 5 (given a project) the only one with retakes.
			const summary = turnSummary('recaptures');
			summary.volumes = summary.volumes.filter((v) => v.collectionId === 105);
			const withProject = { ...rionegro, items: rionegro.items.map((i) => (i.position === 5 ? { ...i, projectId: 7 } : i)) };
			vi.spyOn(importsApi, 'lists').mockResolvedValue([withProject]);
			vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(summary);
			const screen = render(Queue);
			const first = screen.getByRole('region', { name: 'Primero: recapturas' });
			await expect.element(first.getByText('Tomo 5')).toBeVisible();
			const next = screen.container.querySelectorAll('.q-row.is-next');
			expect(next).toHaveLength(1);
			expect(next[0].querySelector('.q-title')?.textContent?.trim()).toBe('Tomo 5');
			await expect.element(first.getByText('Siguiente')).toBeVisible();
		});

		it('in the new-volume turn names the volume that opened it, and shows no lock line', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(turnSummary('new'));
			const screen = render(Queue);
			const pill = screen.getByRole('status').filter({ hasText: 'Turno de volumen nuevo' });
			await expect.element(pill).toBeVisible();
			await expect.element(pill.getByText('Ya se terminaron las recapturas del volumen Tomo 002. Puedes empezar un volumen nuevo.')).toBeVisible();
			await expect.element(screen.getByRole('region', { name: 'Primero: recapturas' })).toBeVisible();
			await expect.element(screen.getByRole('region', { name: 'Después: digitalización nueva' })).toBeVisible();
			await expect.element(screen.getByText('Para empezar un volumen nuevo, primero hay que terminar', { exact: false })).not.toBeInTheDocument();
		});

		it('shows one list and no turn while nothing is pending', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			const screen = render(Queue);
			await expect.element(screen.getByText('Tomo 5')).toBeVisible();
			await expect.element(screen.getByRole('region', { name: 'Primero: recapturas' })).not.toBeInTheDocument();
			await expect.element(screen.getByText('Turno de recapturas')).not.toBeInTheDocument();
			expect(screen.container.querySelectorAll('ol.queue')).toHaveLength(1);
		});

		it('gives a reviewer the sections but no Recapturar link', async () => {
			signIn('reviewer');
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(turnSummary('recaptures'));
			const screen = render(Queue);
			const first = screen.getByRole('region', { name: 'Primero: recapturas' });
			await expect.element(first.getByText('2 de 3 pendientes')).toBeVisible();
			await expect.element(first.getByRole('link', { name: 'Recapturar' })).not.toBeInTheDocument();
		});

		it('keeps the page working when the summary cannot be loaded', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.spyOn(recordsApi, 'toRetakeSummary').mockRejectedValue(new Error('boom'));
			const screen = render(Queue);
			await expect.element(screen.getByText('Tomo 5')).toBeVisible();
			await expect.element(screen.getByRole('region', { name: 'Primero: recapturas' })).not.toBeInTheDocument();
		});
	});

	describe('done marks', () => {
		for (const role of ['admin', 'reviewer'] as const) {
			it(`lets the ${role} mark an item done and take a mark off`, async () => {
				signIn(role);
				const lists = vi.spyOn(importsApi, 'lists').mockResolvedValue([structuredClone(rionegro)]);
				const setDone = vi
					.spyOn(importsApi, 'setDone')
					.mockResolvedValueOnce({ by: role, at: '2026-10-28T15:00:00' })
					.mockResolvedValueOnce(null);
				const screen = render(Queue);
				const rows = screen.getByRole('listitem');

				// The mark the PUT returns goes into the item; the lists are not read again.
				await rows.nth(3).getByRole('button', { name: 'Marcar como hecho' }).click();
				expect(setDone).toHaveBeenCalledWith(rionegro.listId, 4, true);
				await expect.element(rows.nth(3).getByText(new RegExp(`^Marcado como hecho por ${role} el `))).toBeVisible();
				await expect.element(rows.nth(3).getByText('Hecho', { exact: true })).toBeVisible();
				// Siguiente does not move to item 5: its volume has no project, so
				// the queue cannot open it for capture.
				await expect.element(rows.nth(4).getByText('Siguiente')).not.toBeInTheDocument();

				await rows.nth(1).getByRole('button', { name: 'Desmarcar' }).click();
				expect(setDone).toHaveBeenCalledWith(rionegro.listId, 2, false);
				await expect.element(rows.nth(1).getByRole('button', { name: 'Marcar como hecho' })).toBeVisible();
				await expect.element(rows.nth(1).getByText('Hecho', { exact: true })).not.toBeInTheDocument();
				// Item 2, a spot recapture no longer marked, is the first not done again.
				await expect.element(rows.nth(1).getByText('Siguiente')).toBeVisible();
				expect(lists.mock.calls.length).toBe(1);
			});
		}

		it('offers Marcar como hecho on every item not done, and Desmarcar only where there is a mark', async () => {
			signIn('reviewer');
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			const screen = render(Queue);
			const rows = screen.getByRole('listitem');
			await expect.element(rows.first()).toBeVisible();
			const marks = rows.elements().map((r) =>
				[...r.querySelectorAll('button')]
					// The visible label, without the icon's ligature text.
					.map((b) => (b.querySelector('span:not(.material-symbols-outlined)') ?? b).textContent?.trim())
					.filter((t) => t === 'Marcar como hecho' || t === 'Desmarcar')
			);
			expect(marks).toEqual([[], ['Desmarcar'], ['Marcar como hecho'], ['Marcar como hecho'], ['Marcar como hecho']]);
		});

		it('gives an operator no mark buttons', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			const screen = render(Queue);
			await expect.element(screen.getByText('Tomo 4')).toBeVisible();
			await expect.element(screen.getByRole('button', { name: 'Marcar como hecho' })).not.toBeInTheDocument();
			await expect.element(screen.getByRole('button', { name: 'Desmarcar' })).not.toBeInTheDocument();
		});

		it('says when the mark cannot be changed', async () => {
			signIn('admin');
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.spyOn(importsApi, 'setDone').mockRejectedValue(new ApiError('boom', undefined, 500));
			const screen = render(Queue);
			await screen.getByRole('listitem').nth(3).getByRole('button', { name: 'Marcar como hecho' }).click();
			await expect.element(screen.getByRole('alert')).toHaveTextContent('Captua no pudo guardar el cambio en este elemento.');
		});

		it('asks to try again when the unit is busy (503)', async () => {
			signIn('admin');
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.spyOn(importsApi, 'setDone').mockRejectedValue(new ApiError('busy', undefined, 503));
			const screen = render(Queue);
			await screen.getByRole('listitem').nth(3).getByRole('button', { name: 'Marcar como hecho' }).click();
			await expect
				.element(screen.getByRole('alert'))
				.toHaveTextContent('Captua no pudo guardar el cambio en este momento. Intenta de nuevo.');
		});
	});

	it('shows each stage and bar from the status counts, and says when the unit has no volume', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		const rows = screen.getByRole('listitem');
		await expect.element(rows.nth(1).getByText('En captura')).toBeVisible();
		await expect.element(rows.nth(1).getByText('Capturados: 2, En revisión: 3')).toBeInTheDocument();
		await expect.element(rows.nth(1).getByText('5 registros')).toBeVisible();
		await expect.element(rows.nth(0).getByText('Aprobado', { exact: true })).toBeVisible();
		await expect.element(rows.nth(2).getByText('Sin volumen en este equipo')).toBeVisible();
		await expect.element(rows.nth(2).getByRole('button', { name: 'Capturar' })).not.toBeInTheDocument();
	});

	it("opens a volume for capture in the item's own project, and has no button without one", async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		await screen.getByRole('listitem').nth(3).getByRole('button', { name: 'Capturar' }).click();
		expect(gotoMock).toHaveBeenCalledWith('/live-preview?projectId=8&collectionId=104');
		await expect.element(screen.getByRole('listitem').nth(4).getByRole('button', { name: 'Capturar' })).not.toBeInTheDocument();
	});

	it('shows a list with no import date or project without an invalid date', async () => {
		const bare: QueueList = { ...rionegro, listId: 'bare', importedAt: null, projectId: null };
		vi.spyOn(importsApi, 'lists').mockResolvedValue([bare, { ...older, importedAt: null }]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo 1')).toBeVisible();
		expect(document.body.textContent).not.toMatch(/Invalid Date|NaN/);
		const options = screen.getByRole('option').elements().map((o) => o.textContent?.trim());
		expect(options).toEqual(['Rionegro 2026', 'Lista anterior']);
	});

	it('gives a reviewer no capture and no import button', async () => {
		signIn('reviewer');
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Capturar' })).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Importar lista' })).not.toBeInTheDocument();
	});

	it('filters by each action present, and back to all', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		const group = screen.getByRole('group', { name: 'Acción' });
		await expect.element(group).toBeVisible();
		const names = group.getByRole('button').elements().map((b) => b.textContent?.trim());
		expect(names).toEqual(['Todas', 'Recaptura puntual', 'Completar digitalización', 'Reescaneo completo']);

		await group.getByRole('button', { name: 'Reescaneo completo' }).click();
		await expect.element(group.getByRole('button', { name: 'Reescaneo completo' })).toHaveAttribute('aria-pressed', 'true');
		const titles = () => screen.getByRole('listitem').elements().map((r) => r.querySelector('.q-title')?.textContent?.trim());
		await expect.poll(titles).toEqual(['Tomo 5']);
		// The next item (4, a completion) is not in this filter.
		await expect.element(screen.getByText('El siguiente elemento no aparece con este filtro.')).toBeVisible();

		await group.getByRole('button', { name: 'Completar digitalización' }).click();
		await expect.element(screen.getByText('El siguiente elemento no aparece con este filtro.')).not.toBeInTheDocument();

		await group.getByRole('button', { name: 'Todas' }).click();
		await expect.poll(titles).toEqual(['Tomo 1', 'Tomo 2', 'Tomo sin volumen', 'Tomo 4', 'Tomo 5']);
	});

	it('shows the newest list first, with a picker, and says when a list file is missing', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro, older]);
		const screen = render(Queue);
		const picker = screen.getByRole('combobox', { name: 'Lista' });
		await expect.element(picker).toBeVisible();
		await expect.element(screen.getByText('Tomo 1')).toBeVisible();

		await userEvent.selectOptions(picker, older.listId);
		await expect
			.element(screen.getByText('Captua no tiene una copia del archivo de esta lista, así que no puede mostrar sus elementos. Vuelve a importar el archivo para verlos.'))
			.toBeVisible();
		await expect.element(screen.getByText('Tomo 1')).not.toBeInTheDocument();
	});

	it('has no picker for a single list, and an empty state for none', async () => {
		const spy = vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const one = render(Queue);
		await expect.element(one.getByText('Tomo 1')).toBeVisible();
		await expect.element(one.getByRole('combobox', { name: 'Lista' })).not.toBeInTheDocument();
		one.unmount();

		spy.mockResolvedValue([]);
		const none = render(Queue);
		await expect
			.element(none.getByText('Todavía no hay listas importadas. Importa una lista de digitalización para ver aquí sus elementos en orden.'))
			.toBeVisible();
	});

	it('keeps a newer answer when an older one arrives late', async () => {
		const stale: QueueList = { ...rionegro, items: [item(1, { title: 'Respuesta vieja' })] };
		let resolveFirst!: (v: QueueList[]) => void;
		const lists = vi
			.spyOn(importsApi, 'lists')
			.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
			.mockResolvedValue([rionegro]);
		vi.spyOn(importsApi, 'importList').mockResolvedValue({
			listId: rionegro.listId, listName: 'Rionegro 2026', projectId: 7, projectName: 'Rionegro 2026',
			projectCreated: false, importedAt: '2026-10-28T10:00:00Z', created: 5, skipped: 0, volumes: [],
			rejects: [], reportStored: true, listStored: true
		});
		const screen = render(Queue);
		const input = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
		await userEvent.upload(input, new File(['{}'], 'r.json', { type: 'application/json' }));
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
		expect(lists.mock.calls.length).toBe(2);

		resolveFirst([stale]);
		await new Promise((r) => setTimeout(r, 50));
		await expect.element(screen.getByText('Respuesta vieja')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
	});

	it('keeps the list on screen with a small notice when a later reload fails', async () => {
		vi.spyOn(importsApi, 'lists')
			.mockResolvedValueOnce([rionegro])
			.mockRejectedValue(new ApiError('boom', undefined, 500));
		vi.spyOn(importsApi, 'importList').mockResolvedValue({
			listId: rionegro.listId, listName: 'Rionegro 2026', projectId: 7, projectName: 'Rionegro 2026',
			projectCreated: false, importedAt: '2026-10-28T10:00:00Z', created: 0, skipped: 0, volumes: [],
			rejects: [], reportStored: true, listStored: true
		});
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
		const input = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
		await userEvent.upload(input, new File(['{}'], 'r.json', { type: 'application/json' }));
		await expect
			.element(screen.getByText('No se pudo volver a cargar la cola: puede que lo que ves no esté al día.'))
			.toBeVisible();
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
		await expect.element(screen.getByText('No se pudo cargar la cola.')).not.toBeInTheDocument();
	});

	it('says when the lists cannot be loaded', async () => {
		vi.spyOn(importsApi, 'lists').mockRejectedValue(new ApiError('boom', undefined, 500));
		const screen = render(Queue);
		await expect.element(screen.getByText('No se pudo cargar la cola.')).toBeVisible();
	});

	it('stays quiet on a 401, which already sends the user to sign in', async () => {
		vi.spyOn(importsApi, 'lists').mockRejectedValue(new AuthError(401, 'expired'));
		const screen = render(Queue);
		await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible();
		await expect.element(screen.getByText('No se pudo cargar la cola.')).not.toBeInTheDocument();
	});

	describe('import', () => {
		const report: ImportReport = {
			listId: rionegro.listId,
			listName: 'Rionegro 2026',
			projectId: 7,
			projectName: 'Rionegro 2026',
			projectCreated: false,
			importedAt: '2026-10-28T10:00:00Z',
			created: 2,
			skipped: 3,
			volumes: [],
			rejects: [
				{ position: 1, referenceCode: 'co-ahr-aht-1', referenceCodeTruncated: false, reason: 'reference_code_on_unit' },
				{ position: 3, referenceCode: null, referenceCodeTruncated: false, reason: 'missing_reference_code' },
				{ position: 6, referenceCode: 'co-ahr-aht-6', referenceCodeTruncated: false, reason: 'some_new_reason' }
			],
			reportStored: true,
			listStored: true
		};

		function pickFile(screen: ReturnType<typeof render>) {
			const input = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
			const file = new File(['{}'], 'rionegro.json', { type: 'application/json' });
			return userEvent.upload(input, file).then(() => file);
		}

		it('reads the recapture summary again after the import, so the turn and the sections follow it (0.2.0)', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			vi.spyOn(importsApi, 'importList').mockResolvedValue(report);
			const summarySpy = vi
				.spyOn(recordsApi, 'toRetakeSummary')
				.mockResolvedValueOnce(FREE)
				.mockResolvedValue(turnSummary('recaptures'));
			const screen = render(Queue);
			await expect.element(screen.getByText('Tomo 5')).toBeVisible();
			await expect.element(screen.getByRole('region', { name: 'Primero: recapturas' })).not.toBeInTheDocument();

			await pickFile(screen);
			await expect.element(screen.getByRole('status').filter({ hasText: 'Turno de recapturas' })).toBeVisible();
			await expect.element(screen.getByRole('region', { name: 'Primero: recapturas' })).toBeVisible();
			expect(summarySpy).toHaveBeenCalledTimes(2);
		});

		it('posts the picked file and shows the counts and every skip with a plain reason', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
			const importSpy = vi.spyOn(importsApi, 'importList').mockResolvedValue(report);
			const screen = render(Queue);
			await expect.element(screen.getByRole('button', { name: 'Importar lista' })).toBeVisible();
			const file = await pickFile(screen);

			await expect.poll(() => importSpy.mock.calls.length).toBe(1);
			expect((importSpy.mock.calls[0][0] as File).name).toBe(file.name);

			const result = screen.getByRole('region', { name: 'Lista importada: Rionegro 2026' });
			await expect.element(result.getByText('Captua creó 2 volúmenes.')).toBeVisible();
			await expect.element(result.getByText('Captua omitió 3 elementos.')).toBeVisible();

			const onUnit = result.getByText('Ya hay un volumen con este código de referencia en este equipo.');
			await expect.element(onUnit).toBeVisible();
			await expect.element(result.getByText('Elemento 1 (co-ahr-aht-1)')).toBeVisible();
			await expect.element(result.getByText('El elemento no tiene código de referencia.')).toBeVisible();
			await expect.element(result.getByText('Elemento 3', { exact: true })).toBeVisible();
			await expect.element(result.getByText('Captua no creó este volumen (some_new_reason).')).toBeVisible();

			// Already on the unit is not shown as an error; the other skips are.
			const onUnitRow = onUnit.element().closest('li')!;
			expect(onUnitRow.classList.contains('is-error')).toBe(false);
			const errorRow = result.getByText('El elemento no tiene código de referencia.').element().closest('li')!;
			expect(errorRow.classList.contains('is-error')).toBe(true);

			// Announced politely, with focus moved to the report's heading.
			const live = result.element().closest('[aria-live]')!;
			expect(live.getAttribute('aria-live')).toBe('polite');
			await expect.poll(() => document.activeElement?.id).toBe('import-report-title');

			// The lists are loaded again, so the new list shows.
			await expect.poll(() => (importsApi.lists as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2);
		});

		it('says when the unit could not keep the file', async () => {
			vi.spyOn(importsApi, 'lists').mockResolvedValue([]);
			vi.spyOn(importsApi, 'importList').mockResolvedValue({ ...report, listStored: false, rejects: [], skipped: 0 });
			const screen = render(Queue);
			await pickFile(screen);
			await expect
				.element(screen.getByText('Captua importó la lista, pero no pudo guardar una copia del archivo, así que no puede mostrarla en la cola.'))
				.toBeVisible();
		});

		it('says when the import created the project', async () => {
			signIn('admin');
			vi.spyOn(importsApi, 'lists').mockResolvedValue([]);
			vi.spyOn(importsApi, 'importList').mockResolvedValue({ ...report, projectCreated: true });
			const screen = render(Queue);
			await pickFile(screen);
			await expect.element(screen.getByText('Captua creó el proyecto Rionegro 2026.')).toBeVisible();
		});

		const refusals: [number, string][] = [
			[400, 'Captua no pudo leer el archivo.'],
			[403, 'No hay un proyecto con el nombre de esta lista. Al importarla, Captua crearía uno, y solo un administrador puede hacerlo.'],
			[409, 'Captua no importó esta lista: ya se importó otra con el mismo identificador desde un archivo distinto, o Captua no pudo comprobar la importación anterior.'],
			[413, 'El archivo pesa más de 10 MB.'],
			[422, 'El archivo no es una lista de digitalización que Captua pueda importar.'],
			[503, 'Captua no pudo importar la lista en este momento. Intenta de nuevo.'],
			[500, 'Captua no pudo importar la lista.']
		];
		for (const [status, text] of refusals) {
			it(`explains a ${status} in the interface language`, async () => {
				vi.spyOn(importsApi, 'lists').mockResolvedValue([]);
				const err = status === 403 ? new AuthError(403, 'English') : new ApiError('English', undefined, status);
				vi.spyOn(importsApi, 'importList').mockRejectedValue(err);
				const screen = render(Queue);
				await pickFile(screen);
				await expect.element(screen.getByRole('alert')).toHaveTextContent(text);
				// Focus stays on the import button.
				await expect.poll(() => document.activeElement?.textContent?.trim()).toBe('Importar lista');
			});
		}
	});
});

describe('Cola: the Fisqua queue (contract 1.7)', () => {
	const QUEUE_ID = '5f0e3c2a-1b7d-5e4f-9a8b-0c1d2e3f4a5b';

	function qitem(position: number, over: Partial<QueueItem> = {}): QueueItem {
		return item(position, { itemId: `q-${position}`, assignee: null, withdrawn: false, queueHidden: false, retakes: [], ...over });
	}

	// Seen by an operator (username "operator"): A (theirs), B, F (unassigned).
	// An admin (username "admin") also sees C (theirs). D is withdrawn and E
	// hidden: nobody sees them.
	function fisqua(): QueueList {
		return {
			listId: QUEUE_ID,
			source: 'queue',
			listName: 'Rionegro',
			projectId: 7,
			importedAt: '2026-10-29T09:00:00Z',
			listFileMissing: false,
			items: [
				qitem(1, { title: 'Tomo A', assignee: 'operator' }),
				qitem(2, { title: 'Tomo B' }),
				qitem(3, { title: 'Tomo C', assignee: 'admin' }),
				qitem(4, { title: 'Tomo D', assignee: 'operator', withdrawn: true }),
				qitem(5, { title: 'Tomo E', queueHidden: true }),
				qitem(6, {
					title: 'Tomo F',
					action: 'spot-recapture',
					retakes: [
						{ captuaRecordId: 906, pairId: 'p-14', side: 'both' },
						{ captuaRecordId: 999, pairId: null, side: 'left' },
						{ captuaRecordId: 905, pairId: null, side: 'right' }
					]
				})
			]
		};
	}

	function titles(container: Element) {
		return [...container.querySelectorAll('.q-row')].map((r) => r.querySelector('.q-title')?.textContent?.trim());
	}

	beforeEach(() => {
		locale.set('en');
		gotoMock.mockClear();
		signIn('operator');
		vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([]);
		vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(FREE);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		authStore.clearSession();
	});

	it("shows the queue by default, labelled as Fisqua's, with the file lists still selectable", async () => {
		// The file list is the newer one, so it comes first in the answer.
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro, fisqua()]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo B')).toBeVisible();
		const select = screen.getByRole('combobox');
		expect((select.element() as HTMLSelectElement).value).toBe(QUEUE_ID);
		const selected = (select.element() as HTMLSelectElement).selectedOptions[0].textContent ?? '';
		expect(selected).toMatch(/^Fisqua queue: Rionegro, updated /);

		await select.selectOptions(rionegro.listId);
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
		await expect.element(screen.getByText('Tomo B')).not.toBeInTheDocument();
	});

	it("labels a single queue list as Fisqua's", async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([fisqua()]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Fisqua queue: Rionegro')).toBeVisible();
		await expect.element(screen.getByText(/^Updated /)).toBeVisible();
	});

	it('gives an operator their own and the unassigned items, with each assignee, and no filter', async () => {
		vi.spyOn(importsApi, 'lists').mockResolvedValue([fisqua()]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo B')).toBeVisible();
		expect(titles(screen.container)).toEqual(['Tomo A', 'Tomo B', 'Tomo F']);
		const rows = screen.container.querySelectorAll('.q-row');
		expect(rows[0].querySelector('.q-assignee')?.textContent?.trim()).toBe('Assigned to operator');
		expect(rows[1].querySelector('.q-assignee')?.textContent?.trim()).toBe('Unassigned');
		await expect.element(screen.getByRole('group', { name: 'Assigned to' })).not.toBeInTheDocument();
	});

	it("gives an admin every item, and the filters Mine, Unassigned and Everyone", async () => {
		signIn('admin');
		vi.spyOn(importsApi, 'lists').mockResolvedValue([fisqua()]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo B')).toBeVisible();
		expect(titles(screen.container)).toEqual(['Tomo A', 'Tomo B', 'Tomo C', 'Tomo F']);

		const group = screen.getByRole('group', { name: 'Assigned to' });
		await expect.element(group.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true');
		await group.getByRole('button', { name: 'Mine' }).click();
		await expect.element(group.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
		expect(titles(screen.container)).toEqual(['Tomo C']);
		await group.getByRole('button', { name: 'Unassigned' }).click();
		expect(titles(screen.container)).toEqual(['Tomo B', 'Tomo F']);
		await group.getByRole('button', { name: 'Everyone' }).click();
		expect(titles(screen.container)).toEqual(['Tomo A', 'Tomo B', 'Tomo C', 'Tomo F']);
	});

	it('leaves out withdrawn and hidden items, also from Siguiente', async () => {
		signIn('admin');
		const list = fisqua();
		// Without D and E, the first item not done is A; make A done so that
		// Siguiente would fall on D if it were counted.
		list.items[0].doneMark = { by: 'admin', at: '2026-10-29T10:00:00' };
		list.items = [list.items[0], list.items[3], list.items[4], list.items[1]];
		vi.spyOn(importsApi, 'lists').mockResolvedValue([list]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo B')).toBeVisible();
		await expect.element(screen.getByText('Tomo D')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Tomo E')).not.toBeInTheDocument();
		const next = screen.container.querySelectorAll('.q-row.is-next');
		expect(next).toHaveLength(1);
		expect(next[0].querySelector('.q-title')?.textContent?.trim()).toBe('Tomo B');
	});

	it("leaves out a file list's item whose volume a withdrawn entry hid", async () => {
		const file = { ...rionegro, items: rionegro.items.map((i) => (i.position === 3 ? { ...i, queueHidden: true } : i)) };
		vi.spyOn(importsApi, 'lists').mockResolvedValue([file]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
		expect(titles(screen.container)).toEqual(['Tomo 1', 'Tomo 2', 'Tomo 4', 'Tomo 5']);
	});

	it("shows a spot recapture's count and pairs, by sequence where known, and a null pairId without error", async () => {
		const rejectedRow = (recordId: number, title: string, sequence: number | null): RecordToRetake => ({
			recordId, title, sequence, collectionId: 106, projectId: 7,
			name: 'Tomo F', filenameStem: 'co-ahr-aht-6', reason: 'blur', comment: null, rejectedBy: null, rejectedAt: null
		});
		vi.mocked(recordsApi.toRetake).mockResolvedValue([rejectedRow(906, 'f. 14', 14), rejectedRow(905, 'f. 12', 12)]);
		vi.spyOn(importsApi, 'lists').mockResolvedValue([fisqua()]);
		const screen = render(Queue);
		await expect.element(screen.getByText('3 page pairs to retake')).toBeVisible();
		await expect.element(screen.getByText('f. 12')).toBeVisible();
		const row = screen.getByText('3 page pairs to retake').element().closest('.q-row')!;
		const pairs = [...row.querySelectorAll('.q-pair')].map((p) => p.textContent?.replace(/\s+/g, ' ').trim());
		expect(pairs).toEqual(['f. 12 Sequence 12', 'f. 14 Sequence 14', 'Record #999']);
		// Only the spot recapture has the block.
		expect(screen.container.querySelectorAll('.q-pairs')).toHaveLength(1);
	});

	it('sends the itemId with a done mark, and on a 409 reads the queue again and says so', async () => {
		signIn('admin');
		const lists = vi.spyOn(importsApi, 'lists').mockResolvedValue([fisqua()]);
		const setDone = vi
			.spyOn(importsApi, 'setDone')
			.mockResolvedValueOnce({ by: 'admin', at: '2026-10-29T10:00:00' })
			.mockRejectedValueOnce(new ApiError('another entry', undefined, 409));
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo B')).toBeVisible();

		const rowB = screen.getByText('Tomo B').element().closest('.q-row') as HTMLElement;
		(rowB.querySelector('.ip-btn-mark') as HTMLButtonElement).click();
		await expect.poll(() => setDone.mock.calls.length).toBe(1);
		expect(setDone).toHaveBeenCalledWith(QUEUE_ID, 2, true, 'q-2');
		await expect.element(screen.getByText(/^Marked done by admin on /)).toBeVisible();
		expect(lists.mock.calls.length).toBe(1);

		const rowC = screen.getByText('Tomo C').element().closest('.q-row') as HTMLElement;
		(rowC.querySelector('.ip-btn-mark') as HTMLButtonElement).click();
		await expect.poll(() => setDone.mock.calls.length).toBe(2);
		expect(setDone).toHaveBeenLastCalledWith(QUEUE_ID, 3, true, 'q-3');
		await expect.poll(() => lists.mock.calls.length).toBe(2);
		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent("This item has changed in Fisqua's queue. Captua has reloaded the queue: check the item and try again.");
	});

	it('keeps the recapture-turn sections on the queue list, with Siguiente on the first item with retakes', async () => {
		signIn('admin');
		vi.spyOn(importsApi, 'lists').mockResolvedValue([fisqua()]);
		vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue({
			pendingRecords: 4,
			volumes: [
				{ collectionId: 106, projectId: 7, name: 'Tomo F', filenameStem: 'co-ahr-aht-6', pending: 3, total: 3, excluded: 0, firstPendingRecordId: 905, pendingRecordIds: [905, 906, 907] },
				{ collectionId: 102, projectId: 7, name: 'Tomo B', filenameStem: 'co-ahr-aht-2', pending: 1, total: 2, excluded: 0, firstPendingRecordId: 802, pendingRecordIds: [802] }
			],
			turn: { state: 'recaptures', unlockedBy: null }
		});
		const screen = render(Queue);
		const first = screen.getByRole('region', { name: 'First: retakes' });
		await expect.element(first.getByText('Tomo B')).toBeVisible();
		expect(titles(first.element())).toEqual(['Tomo B', 'Tomo F']);
		await expect.element(first.getByText('1 of 2 pending')).toBeVisible();
		const then = screen.getByRole('region', { name: 'Then: new digitisation' });
		expect(titles(then.element())).toEqual(['Tomo A', 'Tomo C']);
		await expect.element(then.getByText('To start a new volume, first finish the retakes of one volume.')).toBeVisible();
		const next = screen.container.querySelectorAll('.q-row.is-next');
		expect(next).toHaveLength(1);
		expect(next[0].querySelector('.q-title')?.textContent?.trim()).toBe('Tomo B');
	});

	it('shows a file list as before: no assignee and no assignee filter', async () => {
		signIn('admin');
		vi.spyOn(importsApi, 'lists').mockResolvedValue([rionegro]);
		const screen = render(Queue);
		await expect.element(screen.getByText('Tomo 4')).toBeVisible();
		expect(screen.container.querySelectorAll('.q-assignee')).toHaveLength(0);
		await expect.element(screen.getByRole('group', { name: 'Assigned to' })).not.toBeInTheDocument();
		expect(titles(screen.container)).toEqual(['Tomo 1', 'Tomo 2', 'Tomo sin volumen', 'Tomo 4', 'Tomo 5']);
	});
});

// The new-volume form's reference-code search in Fisqua mode (NEH-321,
// contract 1.10). Only on a new volume, in Fisqua mode, and while the volume
// is not kept on the unit, the stem field searches Fisqua's descriptions as
// the admin types; choosing a match fills the stem, and the name when it is
// empty. Run on Volúmenes at the unit's 800x480 screen, with app.css, as
// page-fisqua.svelte.test.ts does.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { readable } from 'svelte/store';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', () => ({
	page: readable({ params: {}, url: new URL('http://localhost/dashboard/volumes') })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	ApiError,
	activityApi,
	collectionsApi,
	fisquaApi,
	projectMembersApi,
	projectsApi,
	recordsApi,
	systemApi,
	type Collection,
	type DescriptionMatch,
	type DescriptionSearchAnswer,
	type Project
} from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import '../../../../../app.css';
import Volumes from '../../volumes/+page.svelte';

function vol(id: number, name: string, extra: Partial<Collection> = {}): Collection {
	return { id, name, project_id: 1, created_at: '2026-10-01T00:00:00', record_count: 0, ...extra };
}

const tomo = vol(22, 'Tomo 097', { filename_stem: 'co-ahr-not-t097', stem_reserved: false });

function unit(mode: string) {
	return { mode, projectsEnabled: true, projectsShown: mode === 'offline', defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

function match(code: string, title: string, level = 'file', display = '1790-1795'): DescriptionMatch {
	return { referenceCode: code, title, level, dates: { display, start: null, end: null } };
}

const MATCHES = [
	match('co-ahr-con-caj002-car001', 'Autos de la Real Audiencia sobre tierras', 'file', '1790-1795'),
	match('co-ahr-con-caj002-car002', 'Expediente de visita', 'item', ''),
	match('co-ahr-con-caj002', 'Caja 2', 'volume', '1780')
];

const stem = () => page.getByLabelText(es.pd_field_stem_fisqua);
const name = () => page.getByPlaceholder(es.pd_ph_title);
const list = () => page.getByRole('listbox', { name: es.pd_search_list_label });
// Within the list: the page's stage filter has options of its own.
const options = () => list().getByRole('option');

async function openNew() {
	render(Volumes);
	await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
}

let searchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	await page.viewport(800, 480);
	locale.set('es');
	vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('fisqua') as never);
	vi.spyOn(projectsApi, 'get').mockResolvedValue({ id: 1, name: 'Rionegro' } as Project);
	vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
	vi.spyOn(projectMembersApi, 'list').mockResolvedValue([]);
	vi.spyOn(activityApi, 'collections').mockResolvedValue([]);
	vi.spyOn(collectionsApi, 'listAll').mockResolvedValue([tomo]);
	searchMock = vi.spyOn(fisquaApi, 'searchDescriptions').mockResolvedValue({ results: MATCHES }) as never;
	signIn('admin');
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('the reference-code field searches Fisqua on a new volume', () => {
	it('is a combobox under the same label, and lists the matches after the admin stops typing', async () => {
		await openNew();
		await expect.element(stem()).toHaveAttribute('role', 'combobox');
		await expect.element(stem()).toHaveAttribute('aria-expanded', 'false');
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(list()).toBeInTheDocument();
		expect(options().elements()).toHaveLength(3);
		expect(searchMock).toHaveBeenCalledTimes(1);
		expect(searchMock.mock.calls[0][0]).toBe('co-ahr-con');
		await expect.element(stem()).toHaveAttribute('aria-expanded', 'true');
		await expect.element(stem()).toHaveAttribute('aria-controls', list().element().id);
		// Two rows: the code, then the dates and level, then the full title.
		const first = options().first();
		await expect.element(first).toHaveTextContent('co-ahr-con-caj002-car001');
		await expect.element(first).toHaveTextContent('1790-1795 · Unidad documental compuesta');
		await expect.element(first).toHaveTextContent('Autos de la Real Audiencia sobre tierras');
		await expect.element(options().nth(1)).toHaveTextContent('Unidad documental simple');
		expect(options().nth(1).element().textContent).not.toContain(' · ');
	});

	it('does not search under three characters, and shows no line', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co');
		await new Promise((r) => setTimeout(r, 600));
		expect(searchMock).not.toHaveBeenCalled();
		expect(list().elements()).toHaveLength(0);
		expect(page.getByRole('status').elements().filter((e) => e.textContent?.trim())).toHaveLength(0);
	});

	it('choosing a match by tap fills the stem and the empty name, and closes the list', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await userEvent.click(options().nth(2));
		await expect.element(stem()).toHaveValue('co-ahr-con-caj002');
		await expect.element(name()).toHaveValue('Caja 2');
		await expect.element(list()).not.toBeInTheDocument();
		await expect.element(stem()).toHaveAttribute('aria-expanded', 'false');
		// The chosen code is not searched again.
		await new Promise((r) => setTimeout(r, 600));
		expect(searchMock).toHaveBeenCalledTimes(1);
	});

	it('never overwrites a name already typed', async () => {
		await openNew();
		await userEvent.fill(name(), 'Mi tomo');
		await userEvent.fill(stem(), 'co-ahr-con');
		await userEvent.click(options().first());
		await expect.element(stem()).toHaveValue('co-ahr-con-caj002-car001');
		await expect.element(name()).toHaveValue('Mi tomo');
	});

	it('takes the arrow keys, Enter and Esc', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(list()).toBeInTheDocument();
		await userEvent.keyboard('{ArrowDown}');
		await expect.element(options().first()).toHaveAttribute('aria-selected', 'true');
		await expect.element(stem()).toHaveAttribute('aria-activedescendant', options().first().element().id);
		await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
		// It stops at the last.
		await expect.element(options().nth(2)).toHaveAttribute('aria-selected', 'true');
		await userEvent.keyboard('{ArrowUp}');
		await expect.element(options().nth(1)).toHaveAttribute('aria-selected', 'true');
		await expect.element(options().first()).toHaveAttribute('aria-selected', 'false');
		await userEvent.keyboard('{Escape}');
		await expect.element(list()).not.toBeInTheDocument();
		await expect.element(stem()).toHaveAttribute('aria-expanded', 'false');
		await expect.element(stem()).not.toHaveAttribute('aria-activedescendant');
		await userEvent.keyboard('{ArrowDown}');
		await expect.element(list()).toBeInTheDocument();
		await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
		await expect.element(stem()).toHaveValue('co-ahr-con-caj002-car002');
		await expect.element(name()).toHaveValue('Expediente de visita');
		await expect.element(list()).not.toBeInTheDocument();
	});

	it('a choice made while a newer search waits keeps the list closed', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(list()).toBeInTheDocument();
		// Typing again starts the 400 ms wait; the admin chooses from the list before it ends.
		await userEvent.type(stem(), '-c');
		await userEvent.click(options().first());
		await expect.element(stem()).toHaveValue('co-ahr-con-caj002-car001');
		await new Promise((r) => setTimeout(r, 700));
		expect(list().elements()).toHaveLength(0);
		await expect.element(stem()).toHaveAttribute('aria-expanded', 'false');
		expect(searchMock).toHaveBeenCalledTimes(1);
	});

	it('keeps the input focused when the list itself is pressed (its scrollbar)', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(list()).toBeInTheDocument();
		const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		list().element().dispatchEvent(press);
		expect(press.defaultPrevented).toBe(true);
		await expect.element(list()).toBeInTheDocument();
	});

	it('fills the name from a long title cut to 255 characters at a word boundary', async () => {
		const title = Array.from({ length: 50 }, (_, i) => `Expediente${i}`).join(' ');
		expect(title.length).toBeGreaterThan(255);
		searchMock.mockResolvedValue({ results: [match('co-ahr-con-caj009', title, 'file', '')] });
		await openNew();
		await expect.element(name()).toHaveAttribute('maxlength', '255');
		await userEvent.fill(stem(), 'co-ahr-con');
		await userEvent.click(options().first());
		const value = (name().element() as HTMLInputElement).value;
		expect(value.length).toBeLessThanOrEqual(255);
		expect(title.startsWith(value)).toBe(true);
		expect(title[value.length]).toBe(' ');
		// The admin can edit it.
		await userEvent.type(name(), ' bis');
		expect((name().element() as HTMLInputElement).value.endsWith(' bis')).toBe(true);
	});

	it('saving still sends the chosen code for the backend to check', async () => {
		const create = vi.spyOn(collectionsApi, 'create').mockResolvedValue(vol(30, 'Caja 2'));
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await userEvent.click(options().nth(2));
		await userEvent.click(page.getByRole('button', { name: es.pd_create_btn }));
		await vi.waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
			name: 'Caja 2', filename_stem: 'co-ahr-con-caj002'
		})));
	});

	it('the admin can still type a full code by hand', async () => {
		const create = vi.spyOn(collectionsApi, 'create').mockResolvedValue(vol(30, 'Tomo'));
		searchMock.mockResolvedValue({ results: [] });
		await openNew();
		await userEvent.fill(name(), 'Tomo');
		await userEvent.fill(stem(), 'co-ahr-not-t099');
		await expect.element(page.getByText(es.pd_search_none)).toBeInTheDocument();
		await userEvent.click(page.getByRole('button', { name: es.pd_create_btn }));
		await vi.waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ filename_stem: 'co-ahr-not-t099' })));
	});
});

describe('leaving the field or pressing Esc while a search is pending', () => {
	// A search the admin has left behind must not open the list afterwards.
	function pending() {
		let answer!: (v: DescriptionSearchAnswer) => void;
		searchMock.mockReturnValue(new Promise((r) => (answer = r)));
		return (v: DescriptionSearchAnswer) => answer(v);
	}

	it('tabbing out during the 400 ms wait cancels the search', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await userEvent.tab();
		await new Promise((r) => setTimeout(r, 700));
		expect(searchMock).not.toHaveBeenCalled();
		expect(list().elements()).toHaveLength(0);
		await expect.element(stem()).toHaveAttribute('aria-expanded', 'false');
	});

	it('clicking out while the answer is out keeps the list closed when it arrives', async () => {
		const answer = pending();
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await vi.waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
		await userEvent.click(name());
		answer({ results: MATCHES });
		await new Promise((r) => setTimeout(r, 100));
		expect(list().elements()).toHaveLength(0);
		expect(page.getByText(es.pd_search_searching).elements()).toHaveLength(0);
		await expect.element(stem()).toHaveAttribute('aria-expanded', 'false');
	});

	it('Esc during the 400 ms wait cancels the search', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await userEvent.keyboard('{Escape}');
		await new Promise((r) => setTimeout(r, 700));
		expect(searchMock).not.toHaveBeenCalled();
		expect(list().elements()).toHaveLength(0);
	});

	it('Esc while the answer is out keeps the list closed when it arrives', async () => {
		const answer = pending();
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await vi.waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
		await userEvent.keyboard('{Escape}');
		answer({ results: MATCHES });
		await new Promise((r) => setTimeout(r, 100));
		expect(list().elements()).toHaveLength(0);
		expect(page.getByText(es.pd_search_searching).elements()).toHaveLength(0);
		// The field still has the focus, and typing searches again.
		searchMock.mockResolvedValue({ results: MATCHES });
		await userEvent.type(stem(), '-c');
		await expect.element(list()).toBeInTheDocument();
	});
});

describe('the lines under the field', () => {
	const region = () => document.getElementById('volume-stem-search-status') as HTMLElement;

	it('keep one live region rendered all along, which announces the number of matches', async () => {
		await openNew();
		await expect.element(stem()).toBeInTheDocument();
		expect(region()).not.toBeNull();
		expect(region().getAttribute('role')).toBe('status');
		expect(getComputedStyle(region()).display).not.toBe('none');
		expect(region().textContent?.trim()).toBe('');
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(list()).toBeInTheDocument();
		expect(region().textContent?.trim()).toBe(es.pd_search_count(3));
		// The count is for screen readers only: no visible line with the list.
		const count = region().querySelector('.visually-hidden') as HTMLElement;
		expect(count.textContent).toBe(es.pd_search_count(3));
		expect(count.getBoundingClientRect().width).toBeLessThanOrEqual(1);
		searchMock.mockResolvedValue({ results: [] });
		await userEvent.fill(stem(), 'zzzz');
		await expect.element(page.getByText(es.pd_search_none)).toBeInTheDocument();
		expect(region().contains(page.getByText(es.pd_search_none).element())).toBe(true);
		await userEvent.fill(stem(), 'zz');
		await vi.waitFor(() => expect(region().textContent?.trim()).toBe(''));
		expect(getComputedStyle(region()).display).not.toBe('none');
	});

	it('is rendered when the field does not search, too', async () => {
		vi.mocked(systemApi.unit).mockResolvedValue(unit('backup') as never);
		await openNew();
		await expect.element(page.getByLabelText(es.pd_field_stem)).toBeInTheDocument();
		expect(region()?.getAttribute('role')).toBe('status');
	});

	it('says Captua is searching while the answer is out', async () => {
		let answer!: (v: DescriptionSearchAnswer) => void;
		searchMock.mockReturnValue(new Promise((r) => (answer = r)));
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(page.getByText(es.pd_search_searching)).toBeInTheDocument();
		answer({ results: MATCHES });
		await expect.element(list()).toBeInTheDocument();
		await expect.element(page.getByText(es.pd_search_searching)).not.toBeInTheDocument();
	});

	it('says so when nothing matches', async () => {
		searchMock.mockResolvedValue({ results: [] });
		await openNew();
		await userEvent.fill(stem(), 'zzz');
		await expect.element(page.getByText(es.pd_search_none)).toBeInTheDocument();
		expect(list().elements()).toHaveLength(0);
	});

	for (const [status, code] of [[429, 'rate_limited'], [503, 'fisqua_unreachable']] as const) {
		it(`says Captua can't search Fisqua on a ${status}`, async () => {
			searchMock.mockRejectedValue(new ApiError('English', { code, message: 'English' }, status, status === 429 ? '30' : null));
			const screen = render(Volumes);
			await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
			await userEvent.fill(stem(), 'co-ahr-con');
			await expect.element(page.getByText(es.pd_search_unavailable)).toBeInTheDocument();
			expect(screen.container.textContent).not.toContain('English');
		});
	}

	it('says the same when Fisqua cannot be reached at all', async () => {
		searchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(page.getByText(es.pd_search_unavailable)).toBeInTheDocument();
	});

	it('shows nothing for a Fisqua without search, and stops asking it', async () => {
		searchMock.mockResolvedValue({ results: [], search: false });
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await vi.waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
		await new Promise((r) => setTimeout(r, 100));
		expect(list().elements()).toHaveLength(0);
		expect(page.getByText(es.pd_search_none).elements()).toHaveLength(0);
		expect(page.getByText(es.pd_search_unavailable).elements()).toHaveLength(0);
		expect(page.getByText(es.pd_search_searching).elements()).toHaveLength(0);
		await userEvent.fill(stem(), 'co-ahr-con-caj');
		await new Promise((r) => setTimeout(r, 600));
		expect(searchMock).toHaveBeenCalledTimes(1);
	});
});

describe('the help under the field', () => {
	it('is the search help while the field searches, in place of the stem help', async () => {
		await openNew();
		await expect.element(stem()).toHaveAttribute('role', 'combobox');
		await expect.element(page.getByText(es.pd_stem_search_help)).toBeInTheDocument();
		expect(page.getByText(es.pd_stem_help).elements()).toHaveLength(0);
		// The field is described by the help first (then by the empty-stem message, until a code is typed).
		const [helpId] = (stem().element().getAttribute('aria-describedby') ?? '').split(' ');
		expect(document.getElementById(helpId)?.textContent).toBe(es.pd_stem_search_help);
		// The Fisqua admin note stays.
		await expect.element(page.getByText(es.pd_fisqua_admin_note)).toBeInTheDocument();
	});

	it('is the stem help when editing a volume', async () => {
		render(Volumes);
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 097' }).getByTitle(es.common_actions));
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		await expect.element(page.getByText(es.pd_stem_help)).toBeInTheDocument();
		expect(page.getByText(es.pd_stem_search_help).elements()).toHaveLength(0);
	});

	it('is the stem help again once "keep on this unit" is ticked', async () => {
		await openNew();
		await userEvent.click(page.getByRole('checkbox', { name: es.pd_kept_on_unit }));
		await expect.element(page.getByText(es.pd_stem_help)).toBeInTheDocument();
		expect(page.getByText(es.pd_stem_search_help).elements()).toHaveLength(0);
	});
});

describe('the field stays a plain field', () => {
	it('when editing a volume', async () => {
		render(Volumes);
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 097' }).getByTitle(es.common_actions));
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		const field = page.getByLabelText(es.pd_field_stem_fisqua);
		await expect.element(field).toBeInTheDocument();
		expect(field.element().getAttribute('role')).toBeNull();
		await userEvent.fill(field, 'co-ahr-con');
		await new Promise((r) => setTimeout(r, 600));
		expect(searchMock).not.toHaveBeenCalled();
	});

	it('outside Fisqua mode', async () => {
		vi.mocked(systemApi.unit).mockResolvedValue(unit('backup') as never);
		await openNew();
		const field = page.getByLabelText(es.pd_field_stem);
		await expect.element(field).toBeInTheDocument();
		expect(field.element().getAttribute('role')).toBeNull();
		await userEvent.fill(field, 'co-ahr-con');
		await new Promise((r) => setTimeout(r, 600));
		expect(searchMock).not.toHaveBeenCalled();
	});

	it('while "keep on this unit" is ticked', async () => {
		await openNew();
		await userEvent.click(page.getByRole('checkbox', { name: es.pd_kept_on_unit }));
		const field = page.getByLabelText(es.pd_field_stem);
		expect(field.element().getAttribute('role')).toBeNull();
		await userEvent.fill(field, 'co-ahr-con');
		await new Promise((r) => setTimeout(r, 600));
		expect(searchMock).not.toHaveBeenCalled();
		expect(list().elements()).toHaveLength(0);
	});

	it('and the list closes when the box is ticked while it is open', async () => {
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-con');
		await expect.element(list()).toBeInTheDocument();
		await userEvent.click(page.getByRole('checkbox', { name: es.pd_kept_on_unit }));
		await expect.element(list()).not.toBeInTheDocument();
	});
});

describe('at 800x480', () => {
	it('fits the list inside the card, with nothing cut off', async () => {
		const long = Array.from({ length: 20 }, (_, i) =>
			match(`co-ahr-jud-caj1000-car${String(i).padStart(3, '0')}`,
				'Expediente seguido por don Juan de la Cruz contra los herederos de doña María Josefa sobre la propiedad de unas tierras en el valle',
				'file', '1790-1795'));
		searchMock.mockResolvedValue({ results: long });
		await openNew();
		await userEvent.fill(stem(), 'co-ahr-jud');
		await expect.element(list()).toBeInTheDocument();
		expect(options().elements()).toHaveLength(20);

		const card = document.querySelector('.modal-card') as HTMLElement;
		const cardBox = card.getBoundingClientRect();
		expect(cardBox.bottom).toBeLessThanOrEqual(480);
		expect(cardBox.top).toBeGreaterThanOrEqual(0);
		const listEl = list().element() as HTMLElement;
		const listBox = listEl.getBoundingClientRect();
		expect(listBox.left).toBeGreaterThanOrEqual(cardBox.left);
		expect(listBox.right).toBeLessThanOrEqual(cardBox.right);
		// The list scrolls inside the card rather than growing past it.
		expect(listEl.scrollHeight).toBeGreaterThan(listEl.clientHeight);
		expect(listBox.height).toBeLessThan(480);

		// Nothing in an option is clipped: every part fits its own box, and the option's width.
		for (const option of options().elements() as HTMLElement[]) {
			const box = option.getBoundingClientRect();
			for (const part of option.querySelectorAll<HTMLElement>('.match-code, .match-meta, .match-title')) {
				expect(part.scrollWidth).toBeLessThanOrEqual(part.clientWidth);
				const partBox = part.getBoundingClientRect();
				expect(partBox.left).toBeGreaterThanOrEqual(box.left - 0.5);
				expect(partBox.right).toBeLessThanOrEqual(box.right + 0.5);
			}
			expect(option.scrollWidth).toBeLessThanOrEqual(option.clientWidth);
		}
		const first = options().first().element() as HTMLElement;
		expect(first.querySelector('.match-meta')?.textContent).toBe('1790-1795 · Unidad documental compuesta');
		expect(first.querySelector('.match-title')?.textContent).toContain('sobre la propiedad de unas tierras en el valle');
		expect(getComputedStyle(first.querySelector('.match-code') as HTMLElement).fontFamily).toContain('monospace');
	});
});

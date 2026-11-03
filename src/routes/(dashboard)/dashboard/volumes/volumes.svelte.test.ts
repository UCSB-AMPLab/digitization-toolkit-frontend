// Volúmenes (/dashboard/volumes, NEH-313): every volume on the unit in one
// list, whatever its project, searchable by name, stem and reference code
// and filterable by stage, with the stage the project page already derives;
// rows open the volume page, and Nuevo volumen opens the volume form without
// a project. In Fisqua mode an operator has no Nuevo volumen (NEH-311).
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

const gotoMock = vi.hoisted(() => vi.fn());
const pageUrl = vi.hoisted(() => ({ href: 'http://localhost/dashboard/volumes' }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ get url() { return new URL(pageUrl.href); } }) };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { activityApi, collectionsApi, recordsApi, systemApi, type Collection, type StatusCounts } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit, unitState } from '$lib/unit-mode';
import { get } from 'svelte/store';
import '../../../../app.css';
import Volumes from './+page.svelte';

function counts(c: Partial<StatusCounts> = {}): StatusCounts {
	return { captured: 0, in_review: 0, rejected: 0, approved: 0, excluded: 0, ...c };
}

function vol(id: number, name: string, extra: Partial<Collection> = {}): Collection {
	return { id, name, project_id: 1, created_at: '2026-10-01T00:00:00', record_count: 0, ...extra };
}

const volumes = [
	vol(90, 'Tomo 090', { filename_stem: 'co-ahr-not-t090', record_count: 412, external_id: 'co-ahr-not-t090' }),
	vol(93, 'Tomo 093', { filename_stem: 'co-ahr-not-t093', record_count: 388, project_id: 2 }),
	vol(97, 'Tomo 097', { filename_stem: 'co-ahr-not-t097', record_count: 64, archival_metadata: { signatura: 'CO.AHR.NOT.97' } }),
	// A sub-volume belongs to its parent, not to the list.
	vol(99, 'Sub-volumen', { project_id: null, parent_collection_id: 90 })
];

function unit(mode: string) {
	return { mode, projectsEnabled: false, projectsShown: false, defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

function names(screen: { container: HTMLElement }) {
	return [...screen.container.querySelectorAll('tbody tr .vol-name')].map((el) => el.textContent?.trim());
}

beforeEach(() => {
	locale.set('es');
	gotoMock.mockClear();
	pageUrl.href = 'http://localhost/dashboard/volumes';
	signIn('admin');
	vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
	vi.spyOn(collectionsApi, 'listAll').mockResolvedValue(volumes);
	vi.spyOn(activityApi, 'collections').mockResolvedValue([
		{ collection_id: 90, status_counts: counts({ approved: 412 }) },
		{ collection_id: 93, status_counts: counts({ in_review: 388 }) },
		{ collection_id: 97, status_counts: counts({ rejected: 12, approved: 52 }) }
	] as never);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('Volúmenes', () => {
	it('lists every top-level volume, whatever its project, with records and stage', async () => {
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toEqual(['Tomo 090', 'Tomo 093', 'Tomo 097']);
		expect(collectionsApi.listAll).toHaveBeenCalledWith();
		expect(activityApi.collections).toHaveBeenCalledWith();
		const row = page.getByRole('row').filter({ hasText: 'Tomo 097' });
		await expect.element(row.getByText('co-ahr-not-t097')).toBeInTheDocument();
		await expect.element(row.getByText('64', { exact: true })).toBeInTheDocument();
		await expect.element(row.getByText(es.dash_stage_recapture)).toBeInTheDocument();
		await expect.element(page.getByRole('row').filter({ hasText: 'Tomo 093' }).getByText(es.dash_stage_review)).toBeInTheDocument();
		await expect.element(page.getByText(es.vols_count(3))).toBeInTheDocument();
	});

	it('searches by name, stem and reference code', async () => {
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		const search = page.getByRole('searchbox', { name: es.vols_search_label });
		await userEvent.fill(search, 't093');
		await expect.poll(() => names(screen)).toEqual(['Tomo 093']);
		await userEvent.fill(search, 'CO.AHR.NOT.97');
		await expect.poll(() => names(screen)).toEqual(['Tomo 097']);
		await userEvent.fill(search, 'tomo 090');
		await expect.poll(() => names(screen)).toEqual(['Tomo 090']);
		await userEvent.fill(search, 'nada');
		await expect.element(page.getByText(es.pd_empty_search)).toBeInTheDocument();
	});

	it('filters by stage', async () => {
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		await userEvent.selectOptions(page.getByRole('combobox', { name: es.vols_stage_label }), es.dash_stage_approved);
		await expect.poll(() => names(screen)).toEqual(['Tomo 090']);
		await userEvent.selectOptions(page.getByRole('combobox', { name: es.vols_stage_label }), es.vols_stage_all);
		await expect.poll(() => names(screen)).toHaveLength(3);
	});

	it('opens the volume page of a row, in its own project', async () => {
		render(Volumes);
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 093' }).getByText('Tomo 093'));
		expect(gotoMock).toHaveBeenCalledWith('/dashboard/projects/2/collections/93');
	});

	it('creates a volume without a project', async () => {
		const create = vi.spyOn(collectionsApi, 'create').mockResolvedValue(vol(100, 'Tomo 100'));
		render(Volumes);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.pd_modal_create_title)).toBeInTheDocument();
		expect(dialog.getByText(/^Proyecto:/).elements()).toHaveLength(0);
		await userEvent.fill(dialog.getByPlaceholder(es.pd_ph_title), 'Tomo 100');
		await userEvent.fill(dialog.getByLabelText(es.pd_field_stem), 'co-ahr-not-t100');
		await userEvent.click(dialog.getByRole('button', { name: es.pd_create_btn }));
		await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
		expect(create.mock.calls[0][0]).not.toHaveProperty('project_id');
		expect(create.mock.calls[0][0]).toMatchObject({ name: 'Tomo 100', filename_stem: 'co-ahr-not-t100' });
		await vi.waitFor(() => expect(collectionsApi.listAll).toHaveBeenCalledTimes(2));
	});

	it('gives an operator Nuevo volumen outside Fisqua mode only', async () => {
		signIn('operator');
		const screen = render(Volumes);
		await expect.element(page.getByRole('button', { name: es.pd_new_collection })).toBeInTheDocument();
		await vi.waitFor(() => expect(get(unitState)?.mode).toBe('backup'));
		screen.unmount();
		resetUnit();
		vi.mocked(systemApi.unit).mockResolvedValue(unit('fisqua') as never);
		const again = render(Volumes);
		await expect.poll(() => names(again)).toHaveLength(3);
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalledTimes(2));
		await expect.element(page.getByRole('button', { name: es.pd_new_collection })).not.toBeInTheDocument();
	});

	it('opens the edit form of the volume named by ?editVolume', async () => {
		pageUrl.href = 'http://localhost/dashboard/volumes?editVolume=97';
		render(Volumes);
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.pd_modal_edit_title)).toBeInTheDocument();
		await expect.element(dialog.getByPlaceholder(es.pd_ph_title)).toHaveValue('Tomo 097');
	});

	it('opens ?editVolume for an operator in Fisqua mode with the stem read-only', async () => {
		signIn('operator');
		vi.mocked(systemApi.unit).mockResolvedValue(unit('fisqua') as never);
		pageUrl.href = 'http://localhost/dashboard/volumes?editVolume=97';
		render(Volumes);
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.pd_modal_edit_title)).toBeInTheDocument();
		await expect.element(dialog.getByLabelText(es.pd_field_stem_fisqua)).toHaveAttribute('readonly');
		await expect.element(dialog.getByText(es.pd_fisqua_codes_readonly)).toBeInTheDocument();
	});

	it('does not open ?editVolume for a reviewer', async () => {
		signIn('reviewer');
		pageUrl.href = 'http://localhost/dashboard/volumes?editVolume=97';
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		expect(page.getByRole('dialog').elements()).toHaveLength(0);
	});

	it('goes to Proyectos while projects are shown', async () => {
		vi.mocked(systemApi.unit).mockResolvedValue({ ...unit('offline'), projectsEnabled: true, projectsShown: true } as never);
		render(Volumes);
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard/projects', { replaceState: true }));
	});

	it('stays on Volúmenes when the unit’s state cannot be read', async () => {
		vi.mocked(systemApi.unit).mockRejectedValue(new Error('boom'));
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		await new Promise((r) => setTimeout(r, 50));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('does not go to Proyectos once the route has changed', async () => {
		let answer!: (v: unknown) => void;
		vi.mocked(systemApi.unit).mockReturnValue(new Promise((r) => (answer = r)) as never);
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		pageUrl.href = 'http://localhost/dashboard/queue';
		screen.unmount();
		answer({ ...unit('offline'), projectsEnabled: true, projectsShown: true });
		await new Promise((r) => setTimeout(r, 50));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	for (const role of ['admin', 'operator'] as const) {
		it(`gives the ${role} role each row's Edit and Delete`, async () => {
			signIn(role);
			render(Volumes);
			const row = page.getByRole('row').filter({ hasText: 'Tomo 097' });
			await userEvent.click(row.getByTitle(es.common_actions));
			await expect.element(page.getByRole('button', { name: es.common_edit })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: es.common_delete })).toBeInTheDocument();
		});
	}

	it('gives a reviewer no row actions', async () => {
		signIn('reviewer');
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		expect(page.getByTitle(es.common_actions).elements()).toHaveLength(0);
	});

	it('opens a row’s form from Edit, and saves it', async () => {
		const update = vi.spyOn(collectionsApi, 'update').mockResolvedValue(volumes[2]);
		render(Volumes);
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 097' }).getByTitle(es.common_actions));
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByPlaceholder(es.pd_ph_title)).toHaveValue('Tomo 097');
		await userEvent.click(dialog.getByRole('button', { name: es.common_save_changes }));
		await vi.waitFor(() => expect(update).toHaveBeenCalledWith(97, expect.objectContaining({ name: 'Tomo 097' })));
	});

	it('opens Edit for an operator in Fisqua mode with the stem read-only', async () => {
		signIn('operator');
		vi.mocked(systemApi.unit).mockResolvedValue(unit('fisqua') as never);
		render(Volumes);
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 097' }).getByTitle(es.common_actions));
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		await expect.element(page.getByRole('dialog').getByLabelText(es.pd_field_stem_fisqua)).toHaveAttribute('readonly');
	});

	it('deletes an empty volume after the confirmation, as the project page does', async () => {
		vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
		const del = vi.spyOn(collectionsApi, 'delete').mockResolvedValue();
		render(Volumes);
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 097' }).getByTitle(es.common_actions));
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.pd_delete_collection_title, { exact: true }).first()).toBeInTheDocument();
		await expect.element(dialog.getByText(es.common_irreversible, { exact: false })).toBeInTheDocument();
		expect(del).not.toHaveBeenCalled();
		await userEvent.click(dialog.getByRole('button', { name: es.pd_delete_collection_title }));
		await vi.waitFor(() => expect(del).toHaveBeenCalledWith(97));
		await vi.waitFor(() => expect(collectionsApi.listAll).toHaveBeenCalledTimes(2));
	});

	it('offers every other listed volume as a target for a volume with records alone in its project, then moves and deletes', async () => {
		// Tomo 093 is the only volume of project 2.
		vi.spyOn(recordsApi, 'count').mockResolvedValue(388);
		const move = vi.spyOn(collectionsApi, 'moveRecords').mockResolvedValue({ moved: 388, target_collection_id: 90 });
		vi.spyOn(collectionsApi, 'get').mockResolvedValue(volumes[1]);
		const del = vi.spyOn(collectionsApi, 'delete').mockResolvedValue();
		render(Volumes);
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 093' }).getByTitle(es.common_actions));
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		const dialog = page.getByRole('dialog');
		const select = dialog.getByLabelText(es.pd_move_label);
		await expect.element(select).toBeInTheDocument();
		const options = [...(select.element() as HTMLSelectElement).options].filter((o) => o.value).map((o) => o.textContent?.trim());
		expect(options).toEqual(['Tomo 090', 'Tomo 097']);
		await userEvent.selectOptions(select, 'Tomo 090');
		await userEvent.click(dialog.getByRole('button', { name: es.proj_move_and_delete }));
		await vi.waitFor(() => expect(del).toHaveBeenCalledWith(93));
		expect(move).toHaveBeenCalledWith(93, 90);
		expect(move.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
	});

	it('keeps the last row’s open menu visible: no ancestor clips it', async () => {
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 097' }).getByTitle(es.common_actions));
		const menu = screen.container.querySelector('.action-menu') as HTMLElement;
		expect(menu).not.toBeNull();
		for (let el = menu.parentElement; el && el !== screen.container; el = el.parentElement) {
			const style = getComputedStyle(el);
			expect([style.overflowX, style.overflowY], el.className).toEqual(['visible', 'visible']);
		}
	});

	it('gives a volume without a stem the shortcut to its form', async () => {
		vi.mocked(collectionsApi.listAll).mockResolvedValue([vol(98, 'Tomo 098', { filename_stem: null })]);
		render(Volumes);
		await userEvent.click(page.getByRole('button', { name: es.pd_no_stem_badge }));
		await expect.element(page.getByRole('dialog').getByText(es.pd_modal_edit_title)).toBeInTheDocument();
	});

	it('gives a reviewer no Nuevo volumen', async () => {
		signIn('reviewer');
		const screen = render(Volumes);
		await expect.poll(() => names(screen)).toHaveLength(3);
		expect(page.getByRole('button', { name: es.pd_new_collection }).elements()).toHaveLength(0);
	});
});

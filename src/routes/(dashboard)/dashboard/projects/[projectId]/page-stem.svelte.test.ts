// The project page's volume list and forms, as the stem changes them: the
// "Sin raíz" mark, the stem sent on create, the translated 409 for a
// duplicate stem, and the delete refused for a volume that reserves its stem
// without moving its records first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { readable } from 'svelte/store';

const pageUrl = vi.hoisted(() => ({ href: 'http://localhost/dashboard/projects/1' }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({ params: { projectId: '1' }, get url() { return new URL(pageUrl.href); } })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	ApiError,
	collectionsApi,
	projectMembersApi,
	projectsApi,
	recordsApi,
	type Collection,
	type Project
} from '$lib/api';
import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import ProjectPage from './+page.svelte';

const admin: AuthUser = { id: 1, username: 'admin1', email: null, role: 'admin', is_active: true };

function vol(id: number, name: string, extra: Partial<Collection> = {}): Collection {
	return { id, name, project_id: 1, created_at: '2026-10-01T00:00:00', record_count: 0, ...extra };
}

const reserved = vol(22, 'Tomo 55', { filename_stem: 'co-ahr-con-t055', stem_reserved: true, record_count: 3 });
const stemless = vol(23, 'Tomo 221', { filename_stem: null, stem_reserved: false, record_count: 2 });
const other = vol(24, 'Tomo 100', { filename_stem: 'co-ahr-jud-t100', stem_reserved: false });

let listSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	locale.set('es');
	pageUrl.href = 'http://localhost/dashboard/projects/1';
	authStore.setSession('tok', admin);
	vi.spyOn(projectsApi, 'get').mockResolvedValue({ id: 1, name: 'Rionegro' } as Project);
	vi.spyOn(recordsApi, 'count').mockResolvedValue(3);
	vi.spyOn(projectMembersApi, 'list').mockResolvedValue([]);
	listSpy = vi.spyOn(collectionsApi, 'listAll').mockResolvedValue([reserved, stemless, other]);
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function openRowMenu(name: string) {
	const row = page.getByRole('row').filter({ hasText: name });
	await userEvent.click(row.getByTitle(es.common_actions));
}

describe('project page: stems', () => {
	it('marks a volume without a stem, and the mark opens its form', async () => {
		render(ProjectPage);
		const badge = page.getByRole('button', { name: es.pd_no_stem_badge });
		await expect.element(badge).toBeInTheDocument();
		expect(badge.elements()).toHaveLength(1);

		await userEvent.click(badge);
		await expect.element(page.getByText(es.pd_modal_edit_title)).toBeInTheDocument();
		await expect.element(page.getByLabelText(es.pd_field_stem)).toHaveValue('');
	});

	it('opens the form of the volume named by ?editVolume', async () => {
		pageUrl.href = 'http://localhost/dashboard/projects/1?editVolume=23';
		render(ProjectPage);
		await expect.element(page.getByText(es.pd_modal_edit_title)).toBeInTheDocument();
		await expect.element(page.getByPlaceholder(es.pd_ph_title)).toHaveValue('Tomo 221');
	});

	it('shows the stem read-only when editing a volume that reserves it', async () => {
		render(ProjectPage);
		await openRowMenu('Tomo 55');
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		const stem = page.getByLabelText(es.pd_field_stem);
		await expect.element(stem).toHaveAttribute('readonly');
		await expect.element(page.getByText(es.pd_stem_locked)).toBeInTheDocument();
	});

	it('gives a stem to a volume that has none, and leaves a reserved one out of the update', async () => {
		const updateSpy = vi.spyOn(collectionsApi, 'update').mockResolvedValue(stemless);
		render(ProjectPage);

		await openRowMenu('Tomo 221');
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		await userEvent.type(page.getByLabelText(es.pd_field_stem), 'co-ahr-jud-t221');
		await userEvent.click(page.getByRole('button', { name: es.common_save_changes }));
		await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
		expect(updateSpy.mock.calls[0][0]).toBe(23);
		expect(updateSpy.mock.calls[0][1]).toMatchObject({ filename_stem: 'co-ahr-jud-t221' });

		await openRowMenu('Tomo 55');
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		await userEvent.click(page.getByRole('button', { name: es.common_save_changes }));
		await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2));
		expect(updateSpy.mock.calls[1][1]).not.toHaveProperty('filename_stem');
	});

	it('requires a valid stem to create a volume, and sends it', async () => {
		const createSpy = vi.spyOn(collectionsApi, 'create').mockResolvedValue(other);
		render(ProjectPage);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await userEvent.type(page.getByPlaceholder(es.pd_ph_title), 'Tomo 25');
		const create = page.getByRole('button', { name: es.pd_create_btn });
		await expect.element(create).toBeDisabled();

		await userEvent.type(page.getByLabelText(es.pd_field_stem), 'co-ahr-con-t078');
		await expect.element(create).toBeEnabled();
		await userEvent.click(create);
		await vi.waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
		expect(createSpy.mock.calls[0][0]).toMatchObject({ name: 'Tomo 25', filename_stem: 'co-ahr-con-t078' });
	});

	it('shows a duplicate stem 409 as the catalogue message, not the backend text', async () => {
		const backend = 'Another volume already uses this file name stem.';
		vi.spyOn(collectionsApi, 'create').mockRejectedValue(
			new ApiError(backend, { message: backend, constraint: 'collections_filename_stem_key' }, 409)
		);
		render(ProjectPage);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await userEvent.type(page.getByPlaceholder(es.pd_ph_title), 'Tomo 25');
		await userEvent.type(page.getByLabelText(es.pd_field_stem), 'co-ahr-con-t055');
		await userEvent.click(page.getByRole('button', { name: es.pd_create_btn }));
		await expect.element(page.getByText(es.pd_err_stem_taken)).toBeInTheDocument();
		expect(page.getByText(backend, { exact: false }).elements()).toHaveLength(0);
	});

	it('disables the delete of a volume that reserves its stem, says why, and moves nothing', async () => {
		const moveSpy = vi.spyOn(collectionsApi, 'moveRecords').mockResolvedValue({ moved: 0, target_collection_id: 0 });
		const deleteSpy = vi.spyOn(collectionsApi, 'delete').mockResolvedValue();
		render(ProjectPage);
		await openRowMenu('Tomo 55');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));

		await expect.element(page.getByText(es.pd_delete_stem_reserved)).toBeInTheDocument();
		// No move-records choice is offered.
		expect(page.getByText(es.pd_move_label).elements()).toHaveLength(0);
		const confirm = page.getByRole('button', { name: es.pd_delete_collection_title });
		await expect.element(confirm).toBeDisabled();
		expect(moveSpy).not.toHaveBeenCalled();
		expect(deleteSpy).not.toHaveBeenCalled();
	});

	it('reads the volume again before moving records, and stops if it now reserves its stem', async () => {
		// The list says not reserved; the volume captured since.
		const stale = vol(25, 'Tomo 73', { filename_stem: 'co-ahr-jud-t073', stem_reserved: false, record_count: 2 });
		listSpy.mockResolvedValue([stale, other]);
		vi.spyOn(collectionsApi, 'get').mockResolvedValue({ ...stale, stem_reserved: true });
		const moveSpy = vi.spyOn(collectionsApi, 'moveRecords').mockResolvedValue({ moved: 2, target_collection_id: 24 });
		const deleteSpy = vi.spyOn(collectionsApi, 'delete').mockResolvedValue();
		render(ProjectPage);

		await openRowMenu('Tomo 73');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await userEvent.selectOptions(page.getByRole('combobox'), 'Tomo 100');
		await userEvent.click(page.getByRole('button', { name: es.proj_move_and_delete }));

		await expect.element(page.getByText(es.pd_delete_stem_reserved)).toBeInTheDocument();
		expect(moveSpy).not.toHaveBeenCalled();
		expect(deleteSpy).not.toHaveBeenCalled();
	});

	it('maps a refused delete 409 to the reserved notice', async () => {
		const message =
			'This volume has a file name stem and has captured images, so it cannot be ' +
			'deleted; it keeps its stem so the name is never issued again.';
		const empty = vol(26, 'Tomo 25', { filename_stem: 'co-ahr-jud-t025', stem_reserved: false, record_count: 0 });
		listSpy.mockResolvedValue([empty, other]);
		vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
		vi.spyOn(collectionsApi, 'delete').mockRejectedValue(new ApiError(message, { message }, 409));
		render(ProjectPage);

		await openRowMenu('Tomo 25');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await userEvent.click(page.getByRole('button', { name: es.pd_delete_collection_title }));

		await expect.element(page.getByText(es.pd_delete_stem_reserved)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: es.pd_delete_collection_title })).toBeDisabled();
		expect(page.getByText(message, { exact: false }).elements()).toHaveLength(0);
	});
});

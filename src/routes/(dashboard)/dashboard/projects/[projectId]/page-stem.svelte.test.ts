// The project page's volume list and forms, as the stem changes them: the
// "Sin raíz" mark, the stem sent on create, the translated 409 for a
// duplicate stem, and the delete refused for a volume that reserves its stem
// without moving its records first.
// Its Status column shows each volume's pipeline stage, from
// GET /activity/collections.
//
// Version: 0.2.0
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
	activityApi,
	collectionsApi,
	projectMembersApi,
	projectsApi,
	recordsApi,
	type Collection,
	type Project,
	type StatusCounts
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
	vi.spyOn(activityApi, 'collections').mockResolvedValue([]);
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

	it('shows a volume\'s own signatura, and no code for a volume without one', async () => {
		vi.mocked(projectsApi.get).mockResolvedValue({ id: 1, name: 'Rionegro', signatura: 'CO.AHR' } as Project);
		listSpy.mockResolvedValue([
			vol(30, 'Con signatura', { archival_metadata: { signatura: 'CO.AHR.JUD.198' } }),
			vol(31, 'Sin signatura')
		]);
		const screen = render(ProjectPage);
		await expect.element(page.getByText('CO.AHR.JUD.198')).toBeInTheDocument();
		const codes = [...screen.container.querySelectorAll('.col-code')].map((el) => el.textContent?.trim());
		expect(codes).toEqual(['CO.AHR.JUD.198']);
		expect(screen.container.textContent).not.toMatch(/CO\.AHR-0\d\d/);
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

	it('does not let an edit blank a stem, and never sends null', async () => {
		const updateSpy = vi.spyOn(collectionsApi, 'update').mockResolvedValue(other);
		render(ProjectPage);
		await openRowMenu('Tomo 100');
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		const stem = page.getByLabelText(es.pd_field_stem);
		await expect.element(stem).toHaveValue('co-ahr-jud-t100');
		await userEvent.clear(stem);
		await expect.element(page.getByRole('alert')).toHaveTextContent(es.pd_val_stem_required);
		await expect.element(page.getByRole('button', { name: es.common_save_changes })).toBeDisabled();

		await userEvent.type(stem, 'co-ahr-jud-t101');
		await userEvent.click(page.getByRole('button', { name: es.common_save_changes }));
		await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
		expect(updateSpy.mock.calls[0][1]).toMatchObject({ filename_stem: 'co-ahr-jud-t101' });
	});

	it('saves a volume without a stem without sending one', async () => {
		const updateSpy = vi.spyOn(collectionsApi, 'update').mockResolvedValue(stemless);
		render(ProjectPage);
		await openRowMenu('Tomo 221');
		await userEvent.click(page.getByRole('button', { name: es.common_edit }));
		await userEvent.click(page.getByRole('button', { name: es.common_save_changes }));
		await vi.waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
		expect(updateSpy.mock.calls[0][1]).not.toHaveProperty('filename_stem');
	});

	it('requires a valid stem to create a volume, and sends it', async () => {
		const createSpy = vi.spyOn(collectionsApi, 'create').mockResolvedValue(other);
		render(ProjectPage);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await userEvent.type(page.getByPlaceholder(es.pd_ph_title), 'Tomo 25');
		const create = page.getByRole('button', { name: es.pd_create_btn });
		await expect.element(create).toBeDisabled();
		// The reason the button is disabled is on screen.
		await expect.element(page.getByText(es.pd_val_stem_required)).toBeInTheDocument();

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

	it('shows a generic message for an unknown create error, and keeps the backend text out', async () => {
		const backend = 'Project 1 not found';
		vi.spyOn(collectionsApi, 'create').mockRejectedValue(new ApiError(backend, undefined, 404));
		render(ProjectPage);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await userEvent.type(page.getByPlaceholder(es.pd_ph_title), 'Tomo 25');
		await userEvent.type(page.getByLabelText(es.pd_field_stem), 'co-ahr-con-t078');
		await userEvent.click(page.getByRole('button', { name: es.pd_create_btn }));
		await expect.element(page.getByText(es.pd_err_create_collection)).toBeInTheDocument();
		expect(page.getByText(backend, { exact: false }).elements()).toHaveLength(0);
	});

	it('says a volume with records cannot be deleted until they are moved', async () => {
		const plain = vol(27, 'Tomo 30', { filename_stem: null, stem_reserved: false, record_count: 3 });
		listSpy.mockResolvedValue([plain, other]);
		render(ProjectPage);
		await openRowMenu('Tomo 30');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await expect.element(page.getByText(es.pd_move_hint_none)).toBeInTheDocument();
	});

	it('requires a target for a volume with records, and offers no choice to delete them', async () => {
		const plain = vol(27, 'Tomo 30', { filename_stem: null, stem_reserved: false, record_count: 3 });
		listSpy.mockResolvedValue([plain, other]);
		const moveSpy = vi.spyOn(collectionsApi, 'moveRecords').mockResolvedValue({ moved: 3, target_collection_id: 24 });
		const deleteSpy = vi.spyOn(collectionsApi, 'delete').mockResolvedValue();
		render(ProjectPage);
		await openRowMenu('Tomo 30');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));

		await expect.element(page.getByText(es.pd_delete_warning)).toBeInTheDocument();
		const select = page.getByLabelText(es.pd_move_label);
		await expect.element(select).toHaveAttribute('required');
		const placeholder = page.getByRole('option', { name: es.pd_move_none });
		await expect.element(placeholder).toBeDisabled();
		await expect.element(page.getByRole('button', { name: es.pd_delete_collection_title })).toBeDisabled();

		vi.spyOn(collectionsApi, 'get').mockResolvedValue(plain);
		await userEvent.selectOptions(select, 'Tomo 100');
		const confirm = page.getByRole('button', { name: es.proj_move_and_delete });
		await expect.element(confirm).toBeEnabled();
		await userEvent.click(confirm);
		await vi.waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(27));
		expect(moveSpy).toHaveBeenCalledWith(27, 24);
	});

	it('reads the count again when a volume believed empty is refused for its records, and shows the target select', async () => {
		const stale = vol(29, 'Tomo 32', { filename_stem: null, stem_reserved: false, record_count: 0 });
		listSpy.mockResolvedValue([stale, other]);
		// The project's own count is read on mount; the volume's is 0 when the
		// modal opens and 2 when it is read again after the refusal.
		const volumeCounts = [0, 2];
		const countSpy = vi
			.spyOn(recordsApi, 'count')
			.mockImplementation(async (params) => (params?.collection_id === 29 ? (volumeCounts.shift() ?? 2) : 0));
		const notEmpty =
			'Cannot delete a non-empty collection: 0 sub-collection(s) and 2 record(s) remain. Move or delete them first.';
		vi.spyOn(collectionsApi, 'delete').mockRejectedValue(new ApiError(notEmpty, undefined, 409));
		render(ProjectPage);
		await openRowMenu('Tomo 32');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await userEvent.click(page.getByRole('button', { name: es.pd_delete_collection_title }));

		await expect.element(page.getByLabelText(es.pd_move_label)).toBeInTheDocument();
		expect(countSpy.mock.calls.filter(([p]) => p?.collection_id === 29)).toHaveLength(2);
		expect(page.getByText(notEmpty, { exact: false }).elements()).toHaveLength(0);
		expect(page.getByText(es.pd_err_delete_collection).elements()).toHaveLength(0);
	});

	it('says the volume still contains sub-volumes when they are what blocks the delete', async () => {
		const parent = vol(30, 'Caja 2', { filename_stem: null, stem_reserved: false, record_count: 0 });
		listSpy.mockResolvedValue([parent, other]);
		vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
		const subs =
			'Cannot delete a non-empty collection: 2 sub-collection(s) and 0 record(s) remain. Move or delete them first.';
		vi.spyOn(collectionsApi, 'delete').mockRejectedValue(new ApiError(subs, undefined, 409));
		render(ProjectPage);
		await openRowMenu('Caja 2');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await userEvent.click(page.getByRole('button', { name: es.pd_delete_collection_title }));

		await expect.element(page.getByText(es.pd_err_delete_has_subvolumes)).toBeInTheDocument();
		expect(page.getByText(subs, { exact: false }).elements()).toHaveLength(0);
	});

	it('says the records are under review when the move is refused, and deletes nothing', async () => {
		const plain = vol(31, 'Tomo 33', { filename_stem: null, stem_reserved: false, record_count: 3 });
		listSpy.mockResolvedValue([plain, other]);
		vi.spyOn(collectionsApi, 'get').mockResolvedValue(plain);
		const message =
			'Cannot move: 3 record(s) have been handed over for review: [7, 8, 9]. Take this collection back first.';
		vi.spyOn(collectionsApi, 'moveRecords').mockRejectedValue(
			new ApiError(message, { message, blocking_record_ids: [7, 8, 9] }, 409)
		);
		const deleteSpy = vi.spyOn(collectionsApi, 'delete').mockResolvedValue();
		render(ProjectPage);
		await openRowMenu('Tomo 33');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await userEvent.selectOptions(page.getByLabelText(es.pd_move_label), 'Tomo 100');
		await userEvent.click(page.getByRole('button', { name: es.proj_move_and_delete }));

		await expect.element(page.getByText(es.pd_err_move_under_review(3))).toBeInTheDocument();
		expect(page.getByText(message, { exact: false }).elements()).toHaveLength(0);
		expect(page.getByText(es.pd_err_delete_collection).elements()).toHaveLength(0);
		expect(deleteSpy).not.toHaveBeenCalled();
	});

	it('offers no target and moves nothing when sub-volumes and records both block the delete', async () => {
		const parent = vol(32, 'Caja 3', { filename_stem: null, stem_reserved: false, record_count: 0 });
		listSpy.mockResolvedValue([parent, other]);
		vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
		const both =
			'Cannot delete a non-empty collection: 1 sub-collection(s) and 2 record(s) remain. Move or delete them first.';
		const deleteSpy = vi.spyOn(collectionsApi, 'delete').mockRejectedValue(new ApiError(both, undefined, 409));
		const moveSpy = vi.spyOn(collectionsApi, 'moveRecords').mockResolvedValue({ moved: 2, target_collection_id: 24 });
		render(ProjectPage);
		await openRowMenu('Caja 3');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		const confirm = page.getByRole('button', { name: es.pd_delete_collection_title });
		await userEvent.click(confirm);

		await expect.element(page.getByText(es.pd_err_delete_has_subvolumes)).toBeInTheDocument();
		expect(page.getByLabelText(es.pd_move_label).elements()).toHaveLength(0);
		await expect.element(confirm).toBeDisabled();
		expect(moveSpy).not.toHaveBeenCalled();
		expect(deleteSpy).toHaveBeenCalledTimes(1);
	});

	it('blocks a further try when sub-volumes refuse the delete after the records were moved', async () => {
		const plain = vol(33, 'Caja 4', { filename_stem: null, stem_reserved: false, record_count: 2 });
		listSpy.mockResolvedValue([plain, other]);
		vi.spyOn(recordsApi, 'count').mockResolvedValue(2);
		vi.spyOn(collectionsApi, 'get').mockResolvedValue(plain);
		const subs =
			'Cannot delete a non-empty collection: 1 sub-collection(s) and 0 record(s) remain. Move or delete them first.';
		const deleteSpy = vi.spyOn(collectionsApi, 'delete').mockRejectedValue(new ApiError(subs, undefined, 409));
		const moveSpy = vi.spyOn(collectionsApi, 'moveRecords').mockResolvedValue({ moved: 2, target_collection_id: 24 });
		render(ProjectPage);
		await openRowMenu('Caja 4');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await userEvent.selectOptions(page.getByLabelText(es.pd_move_label), 'Tomo 100');
		await userEvent.click(page.getByRole('button', { name: es.proj_move_and_delete }));

		await expect.element(page.getByText(es.pd_err_delete_has_subvolumes)).toBeInTheDocument();
		expect(page.getByLabelText(es.pd_move_label).elements()).toHaveLength(0);
		await expect.element(page.getByRole('button', { name: es.pd_delete_collection_title })).toBeDisabled();
		expect(moveSpy).toHaveBeenCalledTimes(1);
		expect(deleteSpy).toHaveBeenCalledTimes(1);
	});

	it('leaves the delete enabled for an empty volume', async () => {
		const empty = vol(28, 'Tomo 31', { filename_stem: null, stem_reserved: false, record_count: 0 });
		listSpy.mockResolvedValue([empty, other]);
		vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
		render(ProjectPage);
		await openRowMenu('Tomo 31');
		await userEvent.click(page.getByRole('button', { name: es.common_delete }));
		await expect.element(page.getByRole('button', { name: es.pd_delete_collection_title })).toBeEnabled();
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

describe('project page: stage', () => {
	const act = (id: number, c: Partial<StatusCounts>) => ({
		collection_id: id,
		status_counts: { captured: 0, in_review: 0, rejected: 0, approved: 0, ...c },
		record_count: 0,
		last_status_change_at: null
	});

	it('shows each volume\'s pipeline stage, from one request for the project', async () => {
		const spy = vi.mocked(activityApi.collections).mockResolvedValue([
			act(22, { captured: 1, approved: 2 }),
			act(23, { rejected: 2, approved: 1 }),
			act(24, { approved: 5 })
		]);
		render(ProjectPage);
		const stage = (name: string) => page.getByRole('row').filter({ hasText: name });
		await expect.element(stage('Tomo 55').getByText(es.dash_stage_capture)).toBeInTheDocument();
		await expect.element(stage('Tomo 221').getByText(es.dash_stage_recapture)).toBeInTheDocument();
		await expect.element(stage('Tomo 100').getByText(es.dash_stage_approved)).toBeInTheDocument();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith({ project_id: 1 });
	});

	it('puts an empty volume in capture and never shows the placeholder statuses', async () => {
		vi.mocked(activityApi.collections).mockResolvedValue([act(22, {}), act(23, {}), act(24, {})]);
		render(ProjectPage);
		await expect.element(page.getByRole('row').filter({ hasText: 'Tomo 55' }).getByText(es.dash_stage_capture)).toBeInTheDocument();
		await expect.element(page.getByText(es.pd_status_completed)).not.toBeInTheDocument();
		await expect.element(page.getByText(es.proj_status_paused)).not.toBeInTheDocument();
		await expect.element(page.getByText(es.pd_status_active)).not.toBeInTheDocument();
	});

	it('shows no stage, and keeps the list, when the counts cannot be loaded', async () => {
		vi.mocked(activityApi.collections).mockRejectedValue(new ApiError('boom', undefined, 500));
		render(ProjectPage);
		await expect.element(page.getByText('Tomo 55')).toBeInTheDocument();
		await expect.element(page.getByText(es.dash_stage_capture)).not.toBeInTheDocument();
		await expect.element(page.getByText(es.pd_status_completed)).not.toBeInTheDocument();
	});
});

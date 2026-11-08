// The project page and the volume form in Fisqua mode (NEH-311). Projects
// are hidden in Fisqua mode, so the form's cases run on Volúmenes, which
// the project page sends to. An
// operator has no Nuevo volumen, and edits a volume with its stem
// read-only (the signatura stays editable, as the backend gates only the
// stem and external_id); a 403 volumes_from_fisqua that still arrives
// is shown translated. An admin keeps the controls, with the note that the
// stem must be a Fisqua reference code; Fisqua's refusals show under the
// stem field or as the notice that points to the list import in Cola.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { readable } from 'svelte/store';

const gotoMock = vi.hoisted(() => vi.fn());
const pageUrl = vi.hoisted(() => ({ href: 'http://localhost/dashboard/projects/1' }));
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', () => ({
	page: readable({ params: { projectId: '1' }, get url() { return new URL(pageUrl.href); } })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	ApiError,
	AuthError,
	activityApi,
	collectionsApi,
	projectMembersApi,
	projectsApi,
	recordsApi,
	systemApi,
	type Collection,
	type Project
} from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
// The global stylesheet, as the app loads it (src/routes/+layout.svelte): the
// form's .dialog-fit, which caps the card at the viewport and scrolls it, is there.
import '../../../../../app.css';
import ProjectPage from './+page.svelte';
// In Fisqua mode projects are hidden, so the volume form is reached from Volúmenes.
import Volumes from '../../volumes/+page.svelte';

function vol(id: number, name: string, extra: Partial<Collection> = {}): Collection {
	return { id, name, project_id: 1, created_at: '2026-10-01T00:00:00', record_count: 0, ...extra };
}

const tomo = vol(22, 'Tomo 097', {
	filename_stem: 'co-ahr-not-t097',
	stem_reserved: false,
	archival_metadata: { signatura: 'CO.AHR.NOT.97' }
});

function unit(mode: string) {
	return { mode, projectsEnabled: true, projectsShown: mode === 'offline', defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

async function openEdit() {
	await userEvent.click(page.getByRole('row').filter({ hasText: 'Tomo 097' }).getByTitle(es.common_actions));
	await userEvent.click(page.getByRole('button', { name: es.common_edit }));
}

async function fillNew(stem: string) {
	await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
	await userEvent.fill(page.getByPlaceholder(es.pd_ph_title), 'Tomo 099');
	await userEvent.fill(page.getByLabelText(es.pd_field_stem_fisqua), stem);
	await userEvent.click(page.getByRole('button', { name: es.pd_create_btn }));
}

beforeEach(async () => {
	// The unit's kiosk screen (800x480), where the new-volume form is taller
	// than the screen and scrolls inside its card.
	await page.viewport(800, 480);
	locale.set('es');
	gotoMock.mockClear();
	pageUrl.href = 'http://localhost/dashboard/projects/1';
	vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('fisqua') as never);
	vi.spyOn(projectsApi, 'get').mockResolvedValue({ id: 1, name: 'Rionegro' } as Project);
	vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
	vi.spyOn(projectMembersApi, 'list').mockResolvedValue([]);
	vi.spyOn(activityApi, 'collections').mockResolvedValue([]);
	vi.spyOn(collectionsApi, 'listAll').mockResolvedValue([tomo]);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('the project page while projects are hidden (NEH-313)', () => {
	beforeEach(() => signIn('operator'));

	it('goes to Volúmenes', async () => {
		render(ProjectPage);
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard/volumes', { replaceState: true }));
	});

	it('carries ?editVolume through to Volúmenes', async () => {
		pageUrl.href = 'http://localhost/dashboard/projects/1?editVolume=22';
		render(ProjectPage);
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard/volumes?editVolume=22', { replaceState: true }));
		// The project page does not open the form itself.
		expect(page.getByText(es.pd_modal_edit_title).elements()).toHaveLength(0);
	});

	it('never renders the page, Nuevo volumen included, before going', async () => {
		signIn('admin');
		let answer!: (v: unknown) => void;
		vi.mocked(systemApi.unit).mockReturnValue(new Promise((r) => (answer = r)) as never);
		const screen = render(ProjectPage);
		await new Promise((r) => setTimeout(r, 50));
		expect(page.getByRole('button', { name: es.pd_new_collection }).elements()).toHaveLength(0);
		expect(screen.container.textContent).not.toContain('Tomo 097');
		answer(unit('fisqua'));
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard/volumes', { replaceState: true }));
		await new Promise((r) => setTimeout(r, 50));
		expect(page.getByRole('button', { name: es.pd_new_collection }).elements()).toHaveLength(0);
		expect(collectionsApi.listAll).not.toHaveBeenCalled();
	});

	it('does not go once the route has changed', async () => {
		let answer!: (v: unknown) => void;
		vi.mocked(systemApi.unit).mockReturnValue(new Promise((r) => (answer = r)) as never);
		const screen = render(ProjectPage);
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		pageUrl.href = 'http://localhost/dashboard/queue';
		screen.unmount();
		answer(unit('fisqua'));
		await new Promise((r) => setTimeout(r, 50));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('gives a reviewer no row actions (the backend refuses their edits and deletes)', async () => {
		signIn('reviewer');
		vi.mocked(systemApi.unit).mockResolvedValue(unit('offline') as never);
		render(ProjectPage);
		await expect.element(page.getByText('Tomo 097')).toBeInTheDocument();
		expect(page.getByTitle(es.common_actions).elements()).toHaveLength(0);
	});

	for (const [what, settle] of [
		['cannot be read', (answer: (v: unknown) => void, fail: (e: unknown) => void) => fail(new Error('boom'))],
		['shows projects', (answer: (v: unknown) => void) => answer(unit('offline'))]
	] as const) {
		it(`is blank while the unit read is pending, and renders once it ${what}`, async () => {
			signIn('admin');
			let answer!: (v: unknown) => void;
			let fail!: (e: unknown) => void;
			vi.mocked(systemApi.unit).mockReturnValue(new Promise((r, j) => { answer = r; fail = j; }) as never);
			const screen = render(ProjectPage);
			await new Promise((r) => setTimeout(r, 50));
			expect(screen.container.textContent?.trim()).toBe('');
			settle(answer, fail);
			await expect.element(page.getByText('Tomo 097')).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: es.pd_new_collection })).toBeInTheDocument();
			expect(gotoMock).not.toHaveBeenCalled();
		});
	}

	it('stays while projects are shown', async () => {
		vi.mocked(systemApi.unit).mockResolvedValue(unit('offline') as never);
		render(ProjectPage);
		await expect.element(page.getByText('Tomo 097')).toBeInTheDocument();
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		expect(gotoMock).not.toHaveBeenCalledWith(expect.stringContaining('/dashboard/volumes'), expect.anything());
	});
});

describe('Fisqua mode, operator', () => {
	beforeEach(() => signIn('operator'));

	it('shows no Nuevo volumen', async () => {
		render(Volumes);
		await expect.element(page.getByText('Tomo 097')).toBeInTheDocument();
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		await expect.element(page.getByRole('button', { name: es.pd_new_collection })).not.toBeInTheDocument();
	});

	it('edits a volume with its stem read-only and its signatura editable, and sends no stem', async () => {
		const update = vi.spyOn(collectionsApi, 'update').mockResolvedValue(tomo);
		render(Volumes);
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		await openEdit();
		await expect.element(page.getByLabelText(es.pd_field_stem)).toHaveAttribute('readonly');
		await expect.element(page.getByLabelText(es.pd_field_refcode)).not.toHaveAttribute('readonly');
		await expect.element(page.getByText(es.pd_fisqua_codes_readonly)).toBeInTheDocument();
		await userEvent.fill(page.getByPlaceholder(es.pd_ph_title), 'Tomo 097 bis');
		await userEvent.fill(page.getByLabelText(es.pd_field_refcode), 'CO.AHR.NOT.97a');
		await userEvent.click(page.getByRole('button', { name: es.common_save_changes }));
		await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
		const body = update.mock.calls[0][1];
		expect(body).not.toHaveProperty('filename_stem');
		expect(body.archival_metadata).toEqual({ signatura: 'CO.AHR.NOT.97a' });
	});

	it('shows a 403 volumes_from_fisqua translated', async () => {
		vi.mocked(systemApi.unit).mockResolvedValue(unit('backup') as never);
		vi.spyOn(collectionsApi, 'create').mockRejectedValue(
			Object.assign(new AuthError(403, "In Fisqua mode, volumes come from Fisqua's queue."), {
				detail: { code: 'volumes_from_fisqua', message: "In Fisqua mode, volumes come from Fisqua's queue." }
			})
		);
		const screen = render(Volumes);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await userEvent.fill(page.getByPlaceholder(es.pd_ph_title), 'Tomo 099');
		await userEvent.fill(page.getByLabelText(es.pd_field_stem), 'co-ahr-not-t099');
		await userEvent.click(page.getByRole('button', { name: es.pd_create_btn }));
		await expect.element(page.getByText(es.pd_err_volumes_from_fisqua)).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain("Fisqua's queue");
	});
});

describe('Fisqua mode, admin', () => {
	beforeEach(() => signIn('admin'));

	it('keeps Nuevo volumen, with the Fisqua note and the reference-code label', async () => {
		render(Volumes);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await expect.element(page.getByText(es.pd_fisqua_admin_note)).toBeInTheDocument();
		await expect.element(page.getByLabelText(es.pd_field_stem_fisqua)).toBeInTheDocument();
	});

	it('shows unknown_reference_code under the stem field', async () => {
		vi.spyOn(collectionsApi, 'create').mockRejectedValue(
			new ApiError('x', { code: 'unknown_reference_code', message: 'Fisqua has no description', referenceCode: 'co-ahr-not-t099' }, 422)
		);
		render(Volumes);
		await fillNew('co-ahr-not-t099');
		const stem = page.getByLabelText(es.pd_field_stem_fisqua);
		await expect.element(page.getByText(es.pd_err_unknown_reference_code('co-ahr-not-t099'))).toBeInTheDocument();
		await expect.element(stem).toHaveAttribute('aria-invalid', 'true');
		await expect.element(stem).toHaveAccessibleDescription(new RegExp(es.pd_err_unknown_reference_code('co-ahr-not-t099').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		// Typing a new code takes the refusal away.
		await userEvent.fill(stem, 'co-ahr-not-t098');
		await expect.element(page.getByText(es.pd_err_unknown_reference_code('co-ahr-not-t099'))).not.toBeInTheDocument();
	});

	it('shows stem_required under the stem field', async () => {
		vi.spyOn(collectionsApi, 'update').mockRejectedValue(
			new ApiError('x', { code: 'stem_required', message: 'In Fisqua mode a stem cannot be empty' }, 422)
		);
		render(Volumes);
		await openEdit();
		await userEvent.fill(page.getByPlaceholder(es.pd_ph_title), 'Tomo 097 bis');
		await userEvent.click(page.getByRole('button', { name: es.common_save_changes }));
		await expect.element(page.getByText(es.pd_err_stem_required_fisqua)).toBeInTheDocument();
	});

	for (const [code, title] of [
		['fisqua_unreachable', es.pd_fisqua_unreachable_title],
		['fisqua_no_lookup', es.pd_fisqua_no_lookup_title]
	] as const) {
		it(`shows ${code} as the notice that points to the list import in Cola`, async () => {
			vi.spyOn(collectionsApi, 'create').mockRejectedValue(
				new ApiError('x', { code, message: 'English', referenceCode: 'co-ahr-not-t099' }, 409)
			);
			const screen = render(Volumes);
			await fillNew('co-ahr-not-t099');
			await expect.element(page.getByText(title)).toBeInTheDocument();
			await expect.element(page.getByText(es.pd_fisqua_list_instead)).toBeInTheDocument();
			expect(screen.container.textContent).not.toContain('English');
		});
	}
});

describe('keeping a new volume on the unit (NEH-320)', () => {
	const box = () => page.getByRole('checkbox', { name: es.pd_kept_on_unit });

	it('lets an admin in Fisqua mode keep it, with the plain stem field and no Fisqua note', async () => {
		signIn('admin');
		const create = vi.spyOn(collectionsApi, 'create').mockResolvedValue(vol(30, 'Tomo 099'));
		render(Volumes);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await expect.element(box()).not.toBeChecked();
		await userEvent.click(box());
		await expect.element(page.getByText(es.pd_fisqua_admin_note)).not.toBeInTheDocument();
		await userEvent.fill(page.getByPlaceholder(es.pd_ph_title), 'Tomo 099');
		await userEvent.fill(page.getByLabelText(es.pd_field_stem), 'xx-test-099');
		await userEvent.click(page.getByRole('button', { name: es.pd_create_btn }));
		await vi.waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
			filename_stem: 'xx-test-099', kept_on_unit: true
		})));
	});

	it('sends no flag when the admin leaves it unticked', async () => {
		signIn('admin');
		const create = vi.spyOn(collectionsApi, 'create').mockResolvedValue(vol(30, 'Tomo 099'));
		render(Volumes);
		await fillNew('co-ahr-not-t099');
		await vi.waitFor(() => expect(create).toHaveBeenCalled());
		expect(create.mock.calls[0][0]).not.toHaveProperty('kept_on_unit');
	});

	it('is ticked and fixed in "Solo en el escáner"', async () => {
		signIn('admin');
		// Projects off, so the form is on Volúmenes.
		vi.mocked(systemApi.unit).mockResolvedValue({ ...unit('offline'), projectsEnabled: false, projectsShown: false } as never);
		render(Volumes);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await expect.element(box()).toBeChecked();
		await expect.element(box()).toBeDisabled();
		await expect.element(page.getByText(es.pd_kept_on_unit_offline)).toBeInTheDocument();
	});

	it('is not shown to an operator', async () => {
		signIn('operator');
		vi.mocked(systemApi.unit).mockResolvedValue(unit('backup') as never);
		render(Volumes);
		await userEvent.click(page.getByRole('button', { name: es.pd_new_collection }));
		await expect.element(page.getByPlaceholder(es.pd_ph_title)).toBeInTheDocument();
		expect(box().elements()).toHaveLength(0);
	});
});

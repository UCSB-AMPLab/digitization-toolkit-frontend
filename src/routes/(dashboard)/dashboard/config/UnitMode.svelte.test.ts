// Configuración → Modo del equipo (NEH-311, NEH-313): the three modes as a
// radio group, Guardar only for a change, the projects switch only with
// "Solo en el escáner" picked, a confirmation before leaving Fisqua mode,
// and a refused switch shown as translated lines with the mode the unit
// stays in. GET and PUT /system/unit are mocked.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, systemApi } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import '../../../../app.css';
import UnitModeCard from './UnitModeCard.svelte';
import ConfigPage from './+page.svelte';

type Mode = 'offline' | 'backup' | 'fisqua';

function unit(mode: Mode, projectsEnabled = false) {
	return {
		mode,
		projectsEnabled,
		projectsShown: mode === 'offline' && projectsEnabled,
		defaultProjectId: 1,
		prerequisites: { backup: [], fisqua: [] }
	};
}

const KEPT = [
	{ id: 4, name: 'Tomo 4', files: 120 },
	{ id: 9, name: 'Tomo 9', files: 1 }
];

function withKept(mode: Mode, keptVolumes = KEPT) {
	return { ...unit(mode), keptVolumes };
}

function refused(codes: string[]) {
	return new ApiError(
		'The unit cannot switch to fisqua mode.',
		{ message: 'The unit cannot switch to fisqua mode.', problems: codes.map((code) => ({ code, message: `English ${code}` })) },
		409
	);
}

const radio = (label: string) => page.getByRole('radio', { name: new RegExp(`^${label}`) });
const save = () => page.getByRole('button', { name: es.common_save, exact: true });
const projects = () => page.getByRole('checkbox', { name: es.unit_projects_toggle });

beforeEach(() => {
	locale.set('es');
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('Modo del equipo', () => {
	it('shows the three modes with their descriptions, the current one checked', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		render(UnitModeCard);
		await expect.element(radio('Solo copia externa')).toBeChecked();
		await expect.element(radio('Solo en el escáner')).not.toBeChecked();
		await expect.element(radio('Fisqua')).not.toBeChecked();
		await expect.element(page.getByText(es.unit_mode_offline_desc)).toBeInTheDocument();
		await expect.element(page.getByText(es.unit_mode_backup_desc)).toBeInTheDocument();
		await expect.element(page.getByText(es.unit_mode_fisqua_desc)).toBeInTheDocument();
		await expect.element(page.getByRole('group', { name: es.unit_mode_legend })).toBeInTheDocument();
	});

	it('enables Guardar only once a different mode is picked, and sends it', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit('offline') as never);
		render(UnitModeCard);
		await expect.element(save()).toBeDisabled();
		await userEvent.click(radio('Solo en el escáner'));
		await expect.element(save()).toBeEnabled();
		await userEvent.click(radio('Solo copia externa'));
		await expect.element(save()).toBeDisabled();
		await userEvent.click(radio('Solo en el escáner'));
		await userEvent.click(save());
		await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ mode: 'offline' }));
		await expect.element(radio('Solo en el escáner')).toBeChecked();
		await expect.element(save()).toBeDisabled();
	});

	it('enables the projects switch only with "Solo en el escáner" picked, and saves it with the same PUT', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit('offline', true) as never);
		render(UnitModeCard);
		await expect.element(projects()).toBeDisabled();
		await userEvent.click(radio('Solo en el escáner'));
		await expect.element(projects()).toBeEnabled();
		await userEvent.click(projects());
		await userEvent.click(save());
		await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ mode: 'offline', projectsEnabled: true }));
	});

	it('saves the projects switch alone in "Solo en el escáner"', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('offline') as never);
		const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit('offline', true) as never);
		render(UnitModeCard);
		await expect.element(projects()).toBeEnabled();
		await expect.element(save()).toBeDisabled();
		await userEvent.click(projects());
		await expect.element(save()).toBeEnabled();
		await userEvent.click(save());
		await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ projectsEnabled: true }));
	});

	it('asks before leaving Fisqua mode, and sends nothing on Cancelar', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('fisqua') as never);
		const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit('backup') as never);
		render(UnitModeCard);
		await userEvent.click(radio('Solo copia externa'));
		await userEvent.click(save());
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.unit_leave_fisqua_title)).toBeInTheDocument();
		await expect.element(dialog.getByText(es.unit_leave_fisqua_body)).toBeInTheDocument();
		await userEvent.click(dialog.getByRole('button', { name: es.common_cancel }));
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(put).not.toHaveBeenCalled();

		await userEvent.click(save());
		await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.unit_leave_fisqua_confirm('Solo copia externa') }));
		await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ mode: 'backup' }));
	});

	it('shows a refused switch as translated lines and the mode the unit stays in', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		vi.spyOn(systemApi, 'setUnit').mockRejectedValue(refused(['fisqua_unreachable', 'catalogue_dump_not_configured']));
		const screen = render(UnitModeCard);
		await userEvent.click(radio('Fisqua'));
		await userEvent.click(save());
		const alert = page.getByRole('alert');
		await expect.element(alert.getByText(es.unit_refused_title('Fisqua', 'Solo copia externa'))).toBeInTheDocument();
		await expect.element(alert.getByText(es.unit_problem_fisqua_unreachable)).toBeInTheDocument();
		await expect.element(alert.getByText(es.unit_problem_catalogue_dump_not_configured)).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('English');

		// Cancelar goes back to the stored mode; Reintentar sends again.
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
		await expect.element(radio('Solo copia externa')).toBeChecked();
		await userEvent.click(radio('Fisqua'));
		await userEvent.click(save());
		await userEvent.click(page.getByRole('button', { name: es.unit_try_again }));
		await vi.waitFor(() => expect(systemApi.setUnit).toHaveBeenCalledTimes(3));
	});

	it('says someone else changed the mode, reads the state again, and lets the admin pick again', async () => {
		const get = vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		const put = vi.spyOn(systemApi, 'setUnit').mockRejectedValueOnce(refused(['mode_changed']));
		render(UnitModeCard);
		await expect.element(radio('Solo copia externa')).toBeChecked();
		get.mockResolvedValue(unit('fisqua') as never);
		await userEvent.click(radio('Solo en el escáner'));
		await userEvent.click(save());
		await expect.element(page.getByRole('alert').getByText(es.unit_problem_mode_changed)).toBeInTheDocument();
		await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
		// The selection follows the stored mode; no refusal panel, no retry.
		await expect.element(radio('Fisqua')).toBeChecked();
		expect(page.getByRole('button', { name: es.unit_try_again }).elements()).toHaveLength(0);
		expect(page.getByText(es.unit_refused_title('Solo en el escáner', 'Fisqua')).elements()).toHaveLength(0);
		await expect.element(save()).toBeDisabled();

		// A new pick goes through Guardar, and leaving Fisqua asks first.
		put.mockResolvedValue(unit('offline') as never);
		await userEvent.click(radio('Solo en el escáner'));
		await expect.element(page.getByText(es.unit_problem_mode_changed)).not.toBeInTheDocument();
		await userEvent.click(save());
		await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.unit_leave_fisqua_confirm('Solo en el escáner') }));
		await vi.waitFor(() => expect(put).toHaveBeenLastCalledWith({ mode: 'offline' }));
		expect(put).toHaveBeenCalledTimes(2);
	});

	it('shows a translated message for any other failure', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		vi.spyOn(systemApi, 'setUnit').mockRejectedValue(new ApiError('Internal Server Error', undefined, 500));
		const screen = render(UnitModeCard);
		await userEvent.click(radio('Solo en el escáner'));
		await userEvent.click(save());
		await expect.element(page.getByText(es.unit_err_save)).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('Internal');
	});

	it('is the first section of Configuración', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
		const screen = render(ConfigPage);
		await expect.element(radio('Solo copia externa')).toBeChecked();
		const first = screen.container.querySelector('.config-section .section-title');
		expect(first?.textContent?.trim()).toBe(es.unit_section_title);
	});

	describe('leaving "Solo en el escáner" with volumes Captua keeps on the unit (NEH-320)', () => {
		it('lists the kept volumes with their files and says what the catalogue copy carries', async () => {
			vi.spyOn(systemApi, 'unit').mockResolvedValue(withKept('offline') as never);
			const put = vi.spyOn(systemApi, 'setUnit');
			render(UnitModeCard);
			await userEvent.click(radio('Solo copia externa'));
			await userEvent.click(save());
			const dialog = page.getByRole('dialog');
			await expect.element(dialog.getByText(es.unit_kept_title)).toBeInTheDocument();
			await expect.element(dialog.getByText(es.unit_kept_body('Solo copia externa'))).toBeInTheDocument();
			await expect.element(dialog.getByText('Tomo 4')).toBeInTheDocument();
			await expect.element(dialog.getByText(es.unit_kept_files(120))).toBeInTheDocument();
			await expect.element(dialog.getByText(es.unit_kept_files(1))).toBeInTheDocument();
			await expect.element(dialog.getByText(es.unit_kept_catalogue)).toBeInTheDocument();
			expect(put).not.toHaveBeenCalled();
		});

		it.each([
			['include', () => es.unit_kept_include],
			['keep', () => es.unit_kept_keep]
		] as const)('sends keptVolumes: %s with the switch', async (decision, label) => {
			vi.spyOn(systemApi, 'unit').mockResolvedValue(withKept('offline') as never);
			const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(withKept('backup', decision === 'keep' ? KEPT : []) as never);
			render(UnitModeCard);
			await userEvent.click(radio('Solo copia externa'));
			await userEvent.click(save());
			await userEvent.click(page.getByRole('dialog').getByRole('button', { name: label(), exact: true }));
			await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ mode: 'backup', keptVolumes: decision }));
			await expect.element(radio('Solo copia externa')).toBeChecked();
		});

		it('sends nothing on Cancelar', async () => {
			vi.spyOn(systemApi, 'unit').mockResolvedValue(withKept('offline') as never);
			const put = vi.spyOn(systemApi, 'setUnit');
			render(UnitModeCard);
			await userEvent.click(radio('Fisqua'));
			await userEvent.click(save());
			await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.common_cancel }));
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(put).not.toHaveBeenCalled();
		});

		it('does not ask with no kept volume, nor when switching into "Solo en el escáner"', async () => {
			const get = vi.spyOn(systemApi, 'unit').mockResolvedValue(withKept('offline', []) as never);
			const put = vi.spyOn(systemApi, 'setUnit').mockResolvedValue(unit('backup') as never);
			render(UnitModeCard);
			await userEvent.click(radio('Solo copia externa'));
			await userEvent.click(save());
			await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ mode: 'backup' }));
			expect(get).toHaveBeenCalledTimes(1);
		});

		it('on a 409 kept_volumes_decision reads the state again and asks with the new list', async () => {
			const get = vi.spyOn(systemApi, 'unit').mockResolvedValue(withKept('offline', []) as never);
			const put = vi
				.spyOn(systemApi, 'setUnit')
				.mockRejectedValueOnce(refused(['kept_volumes_decision']))
				.mockResolvedValue(unit('backup') as never);
			render(UnitModeCard);
			await userEvent.click(radio('Solo copia externa'));
			get.mockResolvedValue(withKept('offline') as never);
			await userEvent.click(save());
			await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ mode: 'backup' }));
			const dialog = page.getByRole('dialog');
			await expect.element(dialog.getByText('Tomo 9')).toBeInTheDocument();
			await userEvent.click(dialog.getByRole('button', { name: es.unit_kept_include, exact: true }));
			await vi.waitFor(() => expect(put).toHaveBeenLastCalledWith({ mode: 'backup', keptVolumes: 'include' }));
		});

		it('with other problems shows the refusal, and Reintentar asks the kept volumes question before resending', async () => {
			const get = vi.spyOn(systemApi, 'unit').mockResolvedValue(withKept('offline', []) as never);
			const put = vi
				.spyOn(systemApi, 'setUnit')
				.mockRejectedValueOnce(refused(['offsite_not_configured', 'kept_volumes_decision']))
				.mockResolvedValue(unit('backup') as never);
			render(UnitModeCard);
			await userEvent.click(radio('Solo copia externa'));
			get.mockResolvedValue(withKept('offline') as never);
			await userEvent.click(save());
			await vi.waitFor(() => expect(put).toHaveBeenCalledWith({ mode: 'backup' }));
			await expect.element(page.getByText(es.unit_problem_offsite_not_configured)).toBeInTheDocument();
			await expect.element(page.getByText(es.unit_problem_kept_volumes_decision)).toBeInTheDocument();
			await expect.element(radio('Solo copia externa')).toBeChecked();
			await userEvent.click(page.getByRole('button', { name: es.unit_try_again }));
			const dialog = page.getByRole('dialog');
			await expect.element(dialog.getByText('Tomo 4')).toBeInTheDocument();
			expect(put).toHaveBeenCalledTimes(1);
			await userEvent.click(dialog.getByRole('button', { name: es.unit_kept_keep, exact: true }));
			await vi.waitFor(() => expect(put).toHaveBeenLastCalledWith({ mode: 'backup', keptVolumes: 'keep' }));
		});

		it('shows the decision problem as a translated line beside others', async () => {
			vi.spyOn(systemApi, 'unit').mockResolvedValue(withKept('offline') as never);
			vi.spyOn(systemApi, 'setUnit').mockRejectedValue(refused(['offsite_not_configured']));
			const screen = render(UnitModeCard);
			await userEvent.click(radio('Solo copia externa'));
			await userEvent.click(save());
			await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.unit_kept_keep, exact: true }));
			await expect.element(page.getByText(es.unit_problem_offsite_not_configured)).toBeInTheDocument();
			expect(screen.container.textContent).not.toContain('English');
		});
	});
});

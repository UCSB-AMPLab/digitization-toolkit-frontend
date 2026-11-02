// Cola and the unit's mode (NEH-311): the mode beside the title in every
// mode and for every role; in Fisqua mode the line that volumes come from
// Fisqua's queue, and no list import for an operator, while an admin keeps
// it; a 403 volumes_from_fisqua on an import is shown translated.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { AuthError, importsApi, recordsApi, systemApi, type RetakeSummary } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import '../../../../app.css';
import Queue from './+page.svelte';

const FREE: RetakeSummary = { pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } };

function unit(mode: string) {
	return { mode, projectsEnabled: false, projectsShown: false, defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

function signIn(role: UserRole) {
	authStore.setSession('tok', { id: 1, username: role, email: null, role, is_active: true });
}

const importButton = () => page.getByRole('button', { name: es.queue_import });

beforeEach(() => {
	locale.set('es');
	vi.spyOn(importsApi, 'lists').mockResolvedValue([]);
	vi.spyOn(recordsApi, 'toRetake').mockResolvedValue([]);
	vi.spyOn(recordsApi, 'toRetakeSummary').mockResolvedValue(FREE);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('Cola and the unit mode', () => {
	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		for (const [mode, label] of [
			['offline', 'Solo en el escáner'],
			['backup', 'Solo copia externa'],
			['fisqua', 'Fisqua']
		] as const) {
			it(`shows "${label}" beside the title to the ${role} role`, async () => {
				signIn(role);
				vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(mode) as never);
				render(Queue);
				await expect.element(page.getByText(es.queue_unit_mode(label))).toBeVisible();
				const line = page.getByText(es.queue_fisqua_volumes_line);
				if (mode === 'fisqua') await expect.element(line).toBeVisible();
				else expect(line.elements()).toHaveLength(0);
			});
		}
	}

	it('shows no mode when the unit’s state cannot be read', async () => {
		signIn('operator');
		vi.spyOn(systemApi, 'unit').mockRejectedValue(new Error('boom'));
		const screen = render(Queue);
		await expect.element(importButton()).toBeVisible();
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		expect(screen.container.textContent).not.toContain('Modo del equipo');
	});

	it('gives an operator no list import in Fisqua mode', async () => {
		signIn('operator');
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('fisqua') as never);
		render(Queue);
		await expect.element(page.getByText(es.queue_unit_mode('Fisqua'))).toBeVisible();
		expect(importButton().elements()).toHaveLength(0);
	});

	it('keeps an operator’s list import in the other modes', async () => {
		signIn('operator');
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		render(Queue);
		await expect.element(page.getByText(es.queue_unit_mode('Solo copia externa'))).toBeVisible();
		await expect.element(importButton()).toBeVisible();
	});

	it('keeps an admin’s list import in Fisqua mode', async () => {
		signIn('admin');
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('fisqua') as never);
		render(Queue);
		await expect.element(page.getByText(es.queue_unit_mode('Fisqua'))).toBeVisible();
		await expect.element(importButton()).toBeVisible();
	});

	it('shows a 403 volumes_from_fisqua on an import translated', async () => {
		signIn('operator');
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		const detail = { code: 'volumes_from_fisqua', message: "In Fisqua mode, volumes come from Fisqua's queue." };
		vi.spyOn(importsApi, 'importList').mockRejectedValue(Object.assign(new AuthError(403, detail.message), { detail }));
		const screen = render(Queue);
		await expect.element(importButton()).toBeVisible();
		const input = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
		await userEvent.upload(input, new File(['{}'], 'lista.json', { type: 'application/json' }));
		await expect.element(page.getByText(es.queue_import_err_volumes_from_fisqua)).toBeVisible();
		expect(screen.container.textContent).not.toContain(es.queue_import_err_needs_admin);
	});
});

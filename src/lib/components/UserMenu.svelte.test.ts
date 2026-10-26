// NEH-189: every signed-in role can shut down or restart the unit from the
// avatar menu, through the same confirmation as Settings.
//
// Version: 0.1.0-beta
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { systemApi, PowerControlError } from '$lib/api';
import { authStore, type UserRole } from '$lib/stores/auth';
import UserMenu from './UserMenu.svelte';

function signIn(role: UserRole) {
	authStore.setSession('token', { id: 1, username: role, email: null, role, is_active: true });
}

describe('UserMenu power entries', () => {
	let powerSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		powerSpy = vi.spyOn(systemApi, 'powerControl');
	});
	afterEach(() => {
		powerSpy.mockRestore();
		authStore.clearSession();
	});

	const openMenu = async () => {
		const screen = render(UserMenu, { label: 'Usuario actual' });
		await screen.getByRole('button', { name: 'Usuario actual' }).click();
		return screen;
	};

	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		it(`offers shutdown and restart to the ${role} role`, async () => {
			signIn(role);
			const screen = await openMenu();
			await expect.element(screen.getByRole('menuitem', { name: 'Apagar el equipo' })).toBeInTheDocument();
			await expect.element(screen.getByRole('menuitem', { name: 'Reiniciar el equipo' })).toBeInTheDocument();
		});
	}

	it('closes the menu, asks for confirmation, then sends the order', async () => {
		signIn('operator');
		powerSpy.mockResolvedValue({ message: 'ok' });
		const screen = await openMenu();
		await screen.getByRole('menuitem', { name: 'Apagar el equipo' }).click();

		await expect.element(screen.getByRole('menu')).not.toBeInTheDocument();
		const dialog = page.getByRole('dialog', { name: '¿Apagar el equipo?' });
		await expect.element(dialog).toBeInTheDocument();
		expect(powerSpy).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Sí, apagar' }).click();
		expect(powerSpy).toHaveBeenCalledWith('poweroff');
		await expect.element(page.getByText('Apagando el equipo…')).toBeInTheDocument();
	});

	it('says power control is unavailable on a 501', async () => {
		signIn('reviewer');
		powerSpy.mockRejectedValue(new PowerControlError(501, 'Not Implemented'));
		const screen = await openMenu();
		await screen.getByRole('menuitem', { name: 'Reiniciar el equipo' }).click();
		await page.getByRole('button', { name: 'Sí, reiniciar' }).click();

		expect(powerSpy).toHaveBeenCalledWith('reboot');
		await expect
			.element(page.getByRole('alertdialog'))
			.toHaveTextContent('El control de energía no está disponible en este equipo.');
		await expect.element(page.getByText('Reiniciando el equipo…')).not.toBeInTheDocument();
	});
});

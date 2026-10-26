// NEH-189: the shared shutdown and restart flow — the confirmation, the
// request, the blocking state after a 200, and where a failure is shown.
//
// Version: 0.1.0-beta
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { get } from 'svelte/store';
import { page } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { systemApi, PowerControlError } from '$lib/api';
import { powerControlOpen } from '$lib/stores/power';
import PowerControl from './PowerControl.svelte';

describe('PowerControl', () => {
	let powerSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		powerSpy = vi.spyOn(systemApi, 'powerControl');
	});
	afterEach(() => {
		powerSpy.mockRestore();
	});

	it('asks before shutting down, sends the order on confirmation, and blocks the screen', async () => {
		powerSpy.mockResolvedValue({ message: 'ok' });
		const screen = render(PowerControl);
		screen.component.ask('poweroff');

		const dialog = page.getByRole('dialog', { name: '¿Apagar el equipo?' });
		await expect.element(dialog).toBeInTheDocument();
		expect(powerSpy).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Sí, apagar' }).click();
		expect(powerSpy).toHaveBeenCalledWith('poweroff');
		await expect.element(page.getByText('Apagando el equipo…')).toBeInTheDocument();
		await expect.element(dialog).not.toBeInTheDocument();
	});

	it('sends nothing when the confirmation is cancelled', async () => {
		const screen = render(PowerControl);
		screen.component.ask('reboot');

		const dialog = page.getByRole('dialog', { name: '¿Reiniciar el equipo?' });
		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		expect(powerSpy).not.toHaveBeenCalled();
	});

	it('reports itself open while the confirmation is up, so the capture key stays off', async () => {
		const screen = render(PowerControl);
		expect(get(powerControlOpen)).toBe(false);
		screen.component.ask('poweroff');
		await expect.poll(() => get(powerControlOpen)).toBe(true);

		await page.getByRole('button', { name: 'Cancelar' }).click();
		await expect.poll(() => get(powerControlOpen)).toBe(false);
	});

	it('on a 501, says power control is unavailable and does not block the screen', async () => {
		powerSpy.mockRejectedValue(new PowerControlError(501, 'Not Implemented'));
		const screen = render(PowerControl);
		screen.component.ask('poweroff');
		await page.getByRole('button', { name: 'Sí, apagar' }).click();

		const notice = page.getByRole('alertdialog');
		await expect.element(notice).toHaveTextContent('El control de energía no está disponible en este equipo.');
		await expect.element(page.getByText('Apagando el equipo…')).not.toBeInTheDocument();

		await notice.getByRole('button', { name: 'Cerrar' }).click();
		await expect.element(notice).not.toBeInTheDocument();
	});

	it('hands the failure to onError instead of showing its own notice', async () => {
		powerSpy.mockRejectedValue(new PowerControlError(501, 'Not Implemented'));
		const onError = vi.fn<(message: string | null) => void>();
		const screen = render(PowerControl, { onError });
		screen.component.ask('poweroff');
		await page.getByRole('button', { name: 'Sí, apagar' }).click();

		await expect.poll(() => onError.mock.calls.at(-1)?.[0]).toBe('El control de energía no está disponible en este equipo.');
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});
});

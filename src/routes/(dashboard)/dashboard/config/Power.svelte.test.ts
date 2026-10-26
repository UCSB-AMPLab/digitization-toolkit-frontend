// Configuración → Energía after the move to PowerControl (NEH-189): the
// buttons open the shared confirmation, and a failure is still shown inside
// the Power card rather than in a dialog.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { systemApi, PowerControlError } from '$lib/api';
import ConfigPage from './+page.svelte';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Configuración power section', () => {
	it('confirms, sends the order and shows a 501 inside the card', async () => {
		// Every other request the page makes fails, which it already tolerates.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
		const powerSpy = vi
			.spyOn(systemApi, 'powerControl')
			.mockRejectedValue(new PowerControlError(501, 'Not Implemented'));
		const { container } = render(ConfigPage);

		await page.getByRole('button', { name: 'Apagar', exact: true }).click();
		await page.getByRole('dialog', { name: '¿Apagar el equipo?' }).getByRole('button', { name: 'Sí, apagar' }).click();

		expect(powerSpy).toHaveBeenCalledWith('poweroff');
		await expect
			.poll(() => container.querySelector('.power-error-row')?.textContent?.trim())
			.toBe('El control de energía no está disponible en este equipo.');
		await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument();
	});
});

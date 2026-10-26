// NEH-189: shutting down and restarting from the dashboard sidebar, for every
// role. Operators and reviewers have no Settings page and the avatar menu is
// not on the dashboard, so the sidebar footer is their only way to do it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import { readable, get } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/dashboard') })
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { systemApi } from '$lib/api';
import { locale } from '$lib/i18n';
import { powerControlOpen, holdPowerControlOpen } from '$lib/stores/power';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

function signIn(role: UserRole) {
	const user = { id: 1, username: role, email: null, role, is_active: true };
	authStore.setSession('tok', user);
	vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () =>
			new Response(JSON.stringify(user), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
	);
}

async function mount(role: UserRole) {
	signIn(role);
	const screen = render(Layout, { children });
	await expect.element(screen.getByText('protected content')).toBeVisible();
	return screen;
}

beforeEach(() => locale.set('es'));
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('dashboard sidebar power entries', () => {
	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		it(`shows shutdown and restart to the ${role} role`, async () => {
			const screen = await mount(role);
			await expect.element(screen.getByRole('button', { name: 'Apagar el equipo' })).toBeVisible();
			await expect.element(screen.getByRole('button', { name: 'Reiniciar el equipo' })).toBeVisible();
		});
	}

	it('opens the confirmation without sending anything, and sends only after confirming', async () => {
		const powerSpy = vi.spyOn(systemApi, 'powerControl').mockResolvedValue({ message: 'ok' });
		const screen = await mount('operator');
		await screen.getByRole('button', { name: 'Reiniciar el equipo' }).click();

		const dialog = page.getByRole('dialog', { name: '¿Reiniciar el equipo?' });
		await expect.element(dialog).toBeInTheDocument();
		expect(powerSpy).not.toHaveBeenCalled();
		expect(get(powerControlOpen)).toBe(true);

		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		expect(powerSpy).not.toHaveBeenCalled();
		await expect.poll(() => get(powerControlOpen)).toBe(false);
	});

	it('keeps the labels reachable when the sidebar is collapsed', async () => {
		const screen = await mount('reviewer');
		await screen.getByRole('button', { name: /menú lateral/ }).click();

		const off = screen.getByRole('button', { name: 'Apagar el equipo' });
		const reboot = screen.getByRole('button', { name: 'Reiniciar el equipo' });
		await expect.element(off).toHaveAttribute('title', 'Apagar el equipo');
		await expect.element(reboot).toHaveAttribute('title', 'Reiniciar el equipo');
		// Icon only: the visible text is gone.
		expect(screen.container.querySelector('.s-footer')!.textContent).not.toContain('Apagar el equipo');
	});

	it('keeps Salir reachable at 800x480 by scrolling, expanded and collapsed', async () => {
		await page.viewport(800, 480);
		const screen = await mount('admin');
		const q = (sel: string) => screen.container.querySelector(sel) as HTMLElement;
		const check = () => {
			const scroll = q('.s-scroll');
			scroll.scrollTop = scroll.scrollHeight;
			const aside = q('.sidebar').getBoundingClientRect();
			const logout = q('.logout-btn').getBoundingClientRect();
			expect(logout.top).toBeGreaterThanOrEqual(aside.top);
			expect(logout.bottom).toBeLessThanOrEqual(aside.bottom);
		};
		check();
		await screen.getByRole('button', { name: /menú lateral/ }).click();
		await expect.poll(() => q('.sidebar').getBoundingClientRect().width).toBeLessThan(100);
		check();
	});

	it('counts two PowerControl instances without releasing early', () => {
		const releaseA = holdPowerControlOpen();
		const releaseB = holdPowerControlOpen();
		releaseA();
		expect(get(powerControlOpen)).toBe(true);
		releaseB();
		expect(get(powerControlOpen)).toBe(false);
	});
});

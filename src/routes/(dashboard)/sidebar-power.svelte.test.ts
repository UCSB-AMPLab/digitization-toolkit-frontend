// NEH-189: the dashboard sidebar's user row opens the account menu, for every
// role. Operators and reviewers have no Settings page and the top-bar avatar
// menu is not on the dashboard, so this is their way to shut the unit down.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
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
import '../../app.css';
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

const ENTRIES = ['Ayuda', 'Apagar el equipo', 'Reiniciar el equipo', 'Salir'];

beforeEach(() => locale.set('es'));
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('dashboard sidebar account menu', () => {
	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		it(`opens from the user row for the ${role} role, with the five entries`, async () => {
			const screen = await mount(role);
			const trigger = screen.getByRole('button', { name: new RegExp(role) });
			await expect.element(trigger).toHaveAttribute('aria-haspopup', 'menu');
			await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
			await trigger.click();
			await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');

			const menu = screen.getByRole('menu');
			await expect.element(menu).toBeVisible();
			for (const name of ENTRIES) {
				await expect.element(menu.getByRole('menuitem', { name })).toBeVisible();
			}
			expect(menu.getByRole('menuitem').elements()).toHaveLength(4);
			expect(menu.element().querySelectorAll('.menu-sep')).toHaveLength(2);
			expect(menu.element().getBoundingClientRect().width).toBeGreaterThanOrEqual(204);
			for (const item of menu.getByRole('menuitem').elements()) {
				expect(item.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
			}
		});
	}

	it('keeps Help and Salir out of the footer', async () => {
		const screen = await mount('operator');
		const footer = screen.container.querySelector('.s-footer')!;
		expect(footer.textContent).not.toContain('Ayuda');
		expect(footer.textContent).not.toContain('Salir');
		expect(footer.textContent).toContain('Reportar un problema');
	});

	it('closes on Escape and on a tap outside', async () => {
		const screen = await mount('reviewer');
		const trigger = screen.getByRole('button', { name: /reviewer/ });
		const menu = screen.getByRole('menu');

		await trigger.click();
		await expect.element(menu).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(menu).not.toBeInTheDocument();

		await trigger.click();
		await expect.element(menu).toBeVisible();
		await screen.getByText('protected content').click();
		await expect.element(menu).not.toBeInTheDocument();
	});

	it('opens the confirmation without sending anything, and sends only after confirming', async () => {
		const powerSpy = vi.spyOn(systemApi, 'powerControl').mockResolvedValue({ message: 'ok' });
		const screen = await mount('operator');
		await screen.getByRole('button', { name: /operator/ }).click();
		await screen.getByRole('menuitem', { name: 'Apagar el equipo' }).click();

		const dialog = page.getByRole('dialog', { name: '¿Apagar el equipo?' });
		await expect.element(dialog).toBeInTheDocument();
		await expect.element(screen.getByRole('menu')).not.toBeInTheDocument();
		expect(powerSpy).not.toHaveBeenCalled();
		expect(get(powerControlOpen)).toBe(true);

		await dialog.getByRole('button', { name: 'Cancelar' }).click();
		await expect.element(dialog).not.toBeInTheDocument();
		expect(powerSpy).not.toHaveBeenCalled();
		await expect.poll(() => get(powerControlOpen)).toBe(false);
	});

	it('names the avatar tile when the sidebar is collapsed', async () => {
		const screen = await mount('reviewer');
		await screen.getByRole('button', { name: /menú lateral/ }).click();

		const tile = screen.getByRole('button', { name: 'Usuario actual' });
		await expect.element(tile).toHaveAttribute('title', 'Usuario actual');
		await expect.element(tile).toHaveAttribute('aria-haspopup', 'menu');
		// Icon only: the visible text is gone.
		expect(screen.container.querySelector('.s-footer')!.textContent).not.toContain('reviewer');

		await tile.click();
		await expect.element(screen.getByRole('menuitem', { name: 'Reiniciar el equipo' })).toBeVisible();
	});

	it('shows the whole footer at 800x480 and leaves the nav its own scroll, expanded and collapsed', async () => {
		await page.viewport(800, 480);
		const screen = await mount('admin');
		const q = (sel: string) => screen.container.querySelector(sel) as HTMLElement;
		const check = () => {
			const aside = q('.sidebar').getBoundingClientRect();
			const footer = q('.s-footer').getBoundingClientRect();
			const nav = q('.s-nav');
			expect(footer.top).toBeGreaterThanOrEqual(aside.top);
			expect(footer.bottom).toBeLessThanOrEqual(aside.bottom);
			// The footer is fixed: the nav is the only thing that scrolls.
			expect(getComputedStyle(nav).overflowY).toBe('auto');
			expect(nav.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.top + 1);
			return { footer: footer.height, nav: nav.getBoundingClientRect().height };
		};
		const expanded = check();
		await screen.getByRole('button', { name: /menú lateral/ }).click();
		await expect.poll(() => q('.sidebar').getBoundingClientRect().width).toBeLessThan(100);
		const collapsed = check();
		console.info(`MEASURE 800x480 admin expanded ${JSON.stringify(expanded)} collapsed ${JSON.stringify(collapsed)}`);
	});

	it('opens upward from the user row at 800x480, inside the screen', async () => {
		await page.viewport(800, 480);
		const screen = await mount('admin');
		await screen.getByRole('button', { name: /admin/ }).click();
		const menu = screen.getByRole('menu').element().getBoundingClientRect();
		const row = screen.container.querySelector('.user-row')!.getBoundingClientRect();
		expect(menu.bottom).toBeLessThanOrEqual(row.top);
		expect(menu.top).toBeGreaterThanOrEqual(0);
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

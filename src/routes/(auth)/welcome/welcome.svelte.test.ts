// The welcome splash offers both languages whatever the current one is. Each
// button sets its language and then goes where the setup status says.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

const { setLanguage } = vi.hoisted(() => ({ setLanguage: vi.fn() }));
vi.mock('$lib/i18n', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/i18n')>()),
	setLanguage
}));

import { authApi } from '$lib/api';
import { locale } from '$lib/i18n';
import Page from './+page.svelte';

beforeEach(() => {
	setLanguage.mockReset();
	vi.restoreAllMocks();
});

describe('welcome splash', () => {
	for (const current of ['es', 'en'] as const) {
		it(`shows both buttons when the language is ${current}`, async () => {
			locale.set(current);
			const screen = await render(Page);
			const es = screen.getByRole('button', { name: 'Empezar en español' });
			const en = screen.getByRole('button', { name: 'Get started in English' });
			await expect.element(es).toHaveAttribute('lang', 'es');
			await expect.element(en).toHaveAttribute('lang', 'en');
		});
	}

	for (const [name, code] of [
		['Get started in English', 'en'],
		['Empezar en español', 'es']
	] as const) {
		it(`${name} sets ${code} and goes to setup on a first install`, async () => {
			vi.spyOn(authApi, 'setupStatus').mockResolvedValue({ needs_setup: true });
			const screen = await render(Page);
			await userEvent.click(screen.getByRole('button', { name }));
			await vi.waitFor(() => expect(setLanguage).toHaveBeenCalledTimes(1));
			expect(setLanguage).toHaveBeenCalledWith(code, '/setup');
		});
	}

	it('puts the English button first', async () => {
		const screen = await render(Page);
		const labels = screen.getByRole('button').elements().map((b) => b.textContent?.trim());
		expect(labels).toEqual(['Get started in English', 'Empezar en español']);
	});

	it('credits the NEH award and links to the credits page', async () => {
		const screen = await render(Page);
		await expect.element(screen.getByText('HAA-304052-25', { exact: false })).toBeVisible();
		await expect.element(screen.getByRole('img', { name: 'National Endowment for the Humanities' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Credits / Créditos' })).toHaveAttribute('href', '/credits');
	});

	it('goes to login when setup is done', async () => {
		vi.spyOn(authApi, 'setupStatus').mockResolvedValue({ needs_setup: false });
		const screen = await render(Page);
		await userEvent.click(screen.getByRole('button', { name: 'Empezar en español' }));
		await vi.waitFor(() => expect(setLanguage).toHaveBeenCalledWith('es', '/login'));
	});

	it('goes to login when the status check fails', async () => {
		vi.spyOn(authApi, 'setupStatus').mockRejectedValue(new Error('offline'));
		const screen = await render(Page);
		await userEvent.click(screen.getByRole('button', { name: 'Get started in English' }));
		await vi.waitFor(() => expect(setLanguage).toHaveBeenCalledWith('en', '/login'));
	});

	it('runs the start once on a double press', async () => {
		const status = vi.spyOn(authApi, 'setupStatus').mockResolvedValue({ needs_setup: false });
		const screen = await render(Page);
		const button = screen.getByRole('button', { name: 'Empezar en español' });
		await userEvent.click(button);
		await userEvent.click(button, { force: true }).catch(() => {});
		await vi.waitFor(() => expect(setLanguage).toHaveBeenCalledTimes(1));
		expect(status).toHaveBeenCalledTimes(1);
	});
});

// The credits page is public and shows the grant text and the five logos.
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto }));

import Page from './+page.svelte';

describe('credits page', () => {
	it('does not redirect a visitor with no session', async () => {
		localStorage.clear();
		const screen = await render(Page);
		await expect.element(screen.getByRole('heading', { name: /Credits/ })).toBeVisible();
		expect(goto).not.toHaveBeenCalled();
	});

	it('shows the three paragraphs and the project link', async () => {
		const screen = await render(Page);
		await expect.element(screen.getByText('Captua is developed by Adelaida Ávila', { exact: false })).toBeVisible();
		await expect.element(screen.getByText('(NEH Award HAA-304052-25: "Digitization Toolkit', { exact: false })).toBeVisible();
		await expect.element(screen.getByText('Any views, findings, conclusions', { exact: false })).toBeVisible();
	});

	const LAB = 'Learn more about the Digitization Toolkit project';

	it('opens the QR dialog and closes it with the button', async () => {
		const screen = await render(Page);
		const opener = screen.getByRole('button', { name: LAB });
		await userEvent.click(opener);
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		await expect.element(screen.getByRole('img', { name: 'QR code for the Digitization Toolkit project page' })).toBeVisible();
		await expect.element(screen.getByText('Scan with your phone to learn more about the Digitization Toolkit project.')).toBeVisible();
		await userEvent.click(screen.getByRole('button', { name: 'Close / Cerrar' }));
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(opener).toHaveFocus();
	});

	it('closes on Escape and returns focus to the button', async () => {
		const screen = await render(Page);
		const opener = screen.getByRole('button', { name: LAB });
		await userEvent.click(opener);
		await expect.element(screen.getByRole('button', { name: 'Close / Cerrar' })).toHaveFocus();
		await userEvent.keyboard('{Escape}');
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(opener).toHaveFocus();
	});

	it('shows the five logos with their alts', async () => {
		const screen = await render(Page);
		for (const alt of [
			'National Endowment for the Humanities',
			'AMP Lab, University of California, Santa Barbara',
			'Department of History, University of Texas at Austin',
			'Burdick Global Scholars Program',
			'Neogranadina'
		]) {
			await expect.element(screen.getByRole('img', { name: alt })).toBeVisible();
		}
	});

	it('links back to the welcome screen', async () => {
		const screen = await render(Page);
		await expect.element(screen.getByRole('link', { name: 'Back / Volver' })).toHaveAttribute('href', '/welcome');
	});
});

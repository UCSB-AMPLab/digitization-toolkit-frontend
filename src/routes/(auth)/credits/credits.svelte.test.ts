// The credits page is public and shows the grant text and the five logos.
//
// Version: 0.1.0-beta
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

	it('shows the three paragraphs', async () => {
		const screen = await render(Page);
		await expect.element(screen.getByText('Captua is developed by Adelaida Ávila', { exact: false })).toBeVisible();
		await expect.element(screen.getByText('(NEH Award HAA-304052-25: "Digitization Toolkit', { exact: false })).toBeVisible();
		await expect.element(screen.getByText('Any views, findings, conclusions', { exact: false })).toBeVisible();
	});

	it('shows the QR code for the project page beside the text', async () => {
		const screen = await render(Page);
		await expect.element(screen.getByRole('img', { name: 'QR code for the Digitization Toolkit project page on the AMPL website' })).toBeVisible();
		await expect.element(screen.getByText('Scan to learn more about the project on the AMPL website')).toBeVisible();
		expect(screen.container.querySelector('a[href^="http"]')).toBeNull();
	});

	it('shows the five logos with their alts', async () => {
		const screen = await render(Page);
		for (const alt of [
			'National Endowment for the Humanities',
			'AMPL, University of California, Santa Barbara',
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

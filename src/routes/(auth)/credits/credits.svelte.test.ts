// The credits page is public and shows the grant text and the five logos.
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
const { goto, isKiosk } = vi.hoisted(() => ({ goto: vi.fn(), isKiosk: vi.fn(() => false) }));
vi.mock('$lib/kiosk', () => ({ isKiosk }));
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
		const link = screen.getByRole('link', { name: 'Learn more about the Digitization Toolkit project' });
		await expect.element(link).toHaveAttribute('href', 'https://ampl.clair.ucsb.edu/project/digitization-toolkit');
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	it('hides the project link on the kiosk', async () => {
		isKiosk.mockReturnValueOnce(true);
		const screen = await render(Page);
		await expect.element(screen.getByText('Any views, findings', { exact: false })).toBeVisible();
		expect(screen.getByRole('link', { name: 'Learn more about the Digitization Toolkit project' }).elements()).toHaveLength(0);
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

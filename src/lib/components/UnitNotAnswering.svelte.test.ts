// NEH-186: the banner for a unit that is not answering. Shown while the
// watcher's `unitNotAnswering` is raised, unless a restart is being awaited
// (PowerControl's overlay says so already); "Reload" reloads. It fits the
// unit's 800x480 screen and 1280x800 in both languages, as a slim band.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { unitNotAnswering } from '$lib/unit-watch';
import { holdRestartAwaited } from '$lib/stores/power';
import '../../app.css';
import UnitNotAnswering from './UnitNotAnswering.svelte';

beforeEach(() => locale.set('en'));
afterEach(() => {
	unitNotAnswering.set(false);
	vi.restoreAllMocks();
});

describe('unit not answering banner', () => {
	it('shows while raised, and Reload reloads', async () => {
		const onReload = vi.fn();
		const { container } = render(UnitNotAnswering, { props: { onReload } });
		expect(container.textContent?.trim()).toBe('');
		unitNotAnswering.set(true);
		await expect.element(page.getByText(en.unit_not_answering)).toBeVisible();
		await page.getByRole('button', { name: en.unit_not_answering_reload }).click();
		expect(onReload).toHaveBeenCalledTimes(1);
		unitNotAnswering.set(false);
		await expect.poll(() => container.textContent?.trim()).toBe('');
	});

	it('stays away while a restart is being awaited', async () => {
		const release = holdRestartAwaited();
		unitNotAnswering.set(true);
		const { container } = render(UnitNotAnswering, { props: { onReload: vi.fn() } });
		await expect.poll(() => container.querySelector('[data-unit-not-answering]')).toBeNull();
		release();
		await expect.element(page.getByText(en.unit_not_answering)).toBeVisible();
	});

	for (const lang of ['en', 'es'] as Locale[]) {
		for (const [w, h] of [
			[800, 480],
			[1280, 800]
		] as const) {
			it(`fits at ${w}x${h} in ${lang}`, async () => {
				await page.viewport(w, h);
				locale.set(lang);
				unitNotAnswering.set(true);
				const { container } = render(UnitNotAnswering, { props: { onReload: vi.fn() } });
				const msgs = lang === 'en' ? en : es;
				await expect.element(page.getByText(msgs.unit_not_answering)).toBeVisible();
				const band = container.ownerDocument.querySelector('[data-unit-not-answering]')!;
				const box = band.getBoundingClientRect();
				expect(box.width).toBeLessThanOrEqual(w);
				expect(box.height).toBeLessThanOrEqual(h * 0.2);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);
				const button = band.querySelector('button')!.getBoundingClientRect();
				expect(button.height).toBeGreaterThanOrEqual(44);
				expect(button.right).toBeLessThanOrEqual(w);
			});
		}
	}
});

// NEH-340: the volume page's top bar carries the volume's colour card flag
// beside its name, from the volume's summary, and for the operator the flag
// opens the list of the volume's sets. The bar keeps its one row at 800x480
// and 1280x800, in both languages, with the longest flag; the flag's button
// is at least 44px tall. With the setting off nothing shows.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';

const nav = vi.hoisted(() => ({ data: {} as { [k: string]: unknown } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable({
			params: { projectId: '1', collectionId: '7' },
			url: new URL('http://localhost/dashboard/projects/1/collections/7'),
			get data() {
				return nav.data;
			}
		})
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { colourCardApi } from '$lib/api';
import { readColourCardState } from '$lib/colour-card';
import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import '../../../../../../../app.css';
import Layout from './+layout@.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>volume</p>' }));

beforeEach(() => {
	resetUnit();
	authStore.setSession({
		id: 1,
		username: 'operator',
		email: null,
		role: 'operator',
		is_active: true
	});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () => new Response(JSON.stringify({ detail: 'x' }), { status: 404 })
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	document.querySelectorAll('.vcc-backdrop').forEach((n) => n.remove());
});

for (const [w, h] of [
	[800, 480],
	[1280, 800]
] as const) {
	for (const [lang, msgs] of [
		['en', en],
		['es', es]
	] as const) {
		it(`at ${w}x${h}, ${lang}: the flag beside the volume name, the bar on one row`, async () => {
			await page.viewport(w, h);
			locale.set(lang as Locale);
			nav.data = {
				projectName: 'Archivo Histórico de Rionegro',
				collectionName: 'Notaría primera, tomo 1834-1836',
				collectionColourCard: { enabled: true, status: 'skipped', sets: 1 }
			};
			vi.spyOn(colourCardApi, 'state').mockResolvedValue(
				readColourCardState({ enabled: true, needed: false, status: 'skipped', sets: [] })!
			);
			const { container } = render(Layout, { children });
			const flag = () => container.querySelector('.topbar [data-colour-card-flag]');
			await expect.poll(() => flag()?.textContent?.trim()).toBe(msgs.cc_flag_skipped);
			const bar = container.querySelector('.topbar') as HTMLElement;
			expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth + 1);
			const fb = flag()!.getBoundingClientRect();
			expect(fb.right).toBeLessThanOrEqual(w);
			const button = flag()!.closest('button')!;
			expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
			button.click();
			await expect.element(page.getByText(msgs.cc_sets_empty)).toBeVisible();
			const card = document.querySelector('.vcc-card')!.getBoundingClientRect();
			expect(card.bottom).toBeLessThanOrEqual(h);
			expect(card.right).toBeLessThanOrEqual(w);
		});
	}
}

it('nothing with the setting off', async () => {
	locale.set('en');
	nav.data = {
		projectName: 'P',
		collectionName: 'V',
		collectionColourCard: { enabled: false }
	};
	const { container } = render(Layout, { children });
	await expect.element(page.getByText('V', { exact: true })).toBeVisible();
	expect(container.querySelector('[data-colour-card-flag]')).toBeNull();
	expect(container.textContent).not.toContain(en.cc_sets_open);
});

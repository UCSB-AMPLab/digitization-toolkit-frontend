// NEH-186: the banner for a unit that is not answering takes its own space
// at the top and covers nothing in the dashboard: at 800x480 and 1280x800,
// in both languages, the banner's Reload and every button and link of the
// sidebar (an item of the navigation, which scrolls on a short screen, once
// scrolled to) are on screen and the topmost element at their centre; and
// on the Settings page the section tabs are too.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { page } from 'vitest/browser';

const pageStore = vi.hoisted(() => ({ value: null as null | { set: (v: { url: URL }) => void } }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ url: new URL('http://localhost/dashboard/config') });
	pageStore.value = store;
	return { page: store };
});
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetNetworkStatus } from '$lib/stores/network';
import { resetUnit } from '$lib/unit-mode';
import { resetCameraKind } from '$lib/camera-kind';
import { unitNotAnswering } from '$lib/unit-watch';
import UnitNotAnswering from '$lib/components/UnitNotAnswering.svelte';
import '../../app.css';
import Layout from './+layout.svelte';
import ConfigPage from './dashboard/config/+page.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

function serve() {
	const user = { id: 1, username: 'admin', email: null, role: 'admin' as const, is_active: true };
	authStore.setSession(user);
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.endsWith('/users/me'))
			return new Response(JSON.stringify(user), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		return new Response('{}', { status: 500 });
	});
}

function onScreen(el: Element, w: number, h: number): boolean {
	const r = el.getBoundingClientRect();
	if (r.width <= 0 || r.left < -0.5 || r.top < -0.5 || r.right > w + 0.5 || r.bottom > h + 0.5)
		return false;
	const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
	return !!hit && (hit === el || el.contains(hit));
}

function uncovered(el: Element, w: number, h: number) {
	expect(onScreen(el, w, h), el.getAttribute('aria-label') ?? el.textContent?.trim()).toBe(true);
}

function sidebarControls(): Element[] {
	return [...document.querySelectorAll('.sidebar a[href], .sidebar button')].filter(
		(el) => (el as HTMLElement).offsetParent !== null
	);
}

beforeEach(() => serve());
afterEach(() => {
	unitNotAnswering.set(false);
	vi.restoreAllMocks();
	authStore.clearSession();
	resetNetworkStatus();
	resetUnit();
	resetCameraKind();
});

describe('banner in the dashboard', () => {
	for (const lang of ['en', 'es'] as Locale[]) {
		const msgs = lang === 'en' ? en : es;
		for (const [w, h] of [
			[800, 480],
			[1280, 800]
		] as const) {
			it(`covers none of the sidebar at ${w}x${h} in ${lang}`, async () => {
				locale.set(lang);
				await page.viewport(w, h);
				unitNotAnswering.set(true);
				render(UnitNotAnswering, { props: { onReload: vi.fn() } });
				const screen = render(Layout, { children });
				await expect.element(screen.getByText('protected content')).toBeVisible();
				uncovered(
					page.getByRole('button', { name: msgs.unit_not_answering_reload }).element(),
					w,
					h
				);
				const controls = sidebarControls();
				expect(controls.length).toBeGreaterThan(0);
				for (const c of controls) {
					// The navigation scrolls on a short screen (nav-settings.svelte.test.ts):
					// each of its items is checked once scrolled to the middle of it.
					if (c.closest('.s-nav')) c.scrollIntoView({ block: 'center' });
					uncovered(c, w, h);
				}
			});

			it(`covers none of the Settings tabs at ${w}x${h} in ${lang}`, async () => {
				locale.set(lang);
				await page.viewport(w, h);
				unitNotAnswering.set(true);
				render(UnitNotAnswering, { props: { onReload: vi.fn() } });
				render(ConfigPage);
				await expect
					.element(page.getByRole('heading', { name: msgs.config_section_network, level: 2 }))
					.toBeVisible();
				uncovered(
					page.getByRole('button', { name: msgs.unit_not_answering_reload }).element(),
					w,
					h
				);
				const tab = document.querySelector('[data-settings-section="network"]')!;
				uncovered(tab, w, h);
			});
		}
	}
});

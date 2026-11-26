// NEH-186: the banner for a unit that is not answering takes its own space
// at the top and covers nothing. On the capture screen, and in "Which camera
// is this?" over it, at the unit's 800x480 screen and at 1280x800, in both
// languages: the banner's Reload, the top bar's buttons and the Capture
// button (or the step's buttons) are on screen and the topmost element at
// their centre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

const current = vi.hoisted(() => ({ url: '' }));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL(current.url) });
			return () => {};
		}
	}
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { unitNotAnswering } from '$lib/unit-watch';
import { resetCameraKind } from '$lib/camera-kind';
import UnitNotAnswering from '$lib/components/UnitNotAnswering.svelte';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function serve(setupNeeded: boolean) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/cameras/setup'))
			return json({ needs_setup: setupNeeded, reasons: [], confirmed_pair: null });
		if (path.endsWith('/collections/9')) {
			return json({
				id: 9,
				name: 'Tomo 6',
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: 'co-ahr-6',
				custom_attributes: null
			});
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.includes('/cameras/capabilities')) return json({});
		return json([]);
	});
}

beforeEach(() => {
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	authStore.setSession({ id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
});
afterEach(() => {
	unitNotAnswering.set(false);
	vi.restoreAllMocks();
	authStore.clearSession();
	resetCameraKind();
});

/** On screen, and the topmost element at its centre is itself or inside it. */
function uncovered(el: Element, w: number, h: number) {
	const r = el.getBoundingClientRect();
	expect(r.width).toBeGreaterThan(0);
	expect(r.left).toBeGreaterThanOrEqual(-0.5);
	expect(r.top).toBeGreaterThanOrEqual(-0.5);
	expect(r.right).toBeLessThanOrEqual(w + 0.5);
	expect(r.bottom).toBeLessThanOrEqual(h + 0.5);
	const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
	expect(hit && (hit === el || el.contains(hit))).toBe(true);
}

describe('banner on the capture screen', () => {
	for (const lang of ['en', 'es'] as Locale[]) {
		const msgs = lang === 'en' ? en : es;
		for (const [w, h] of [
			[800, 480],
			[1280, 800]
		] as const) {
			it(`covers nothing at ${w}x${h} in ${lang}`, async () => {
				locale.set(lang);
				serve(false);
				await browserPage.viewport(w, h);
				unitNotAnswering.set(true);
				render(UnitNotAnswering, { props: { onReload: vi.fn() } });
				const screen = render(LivePreview);
				const capture = screen.getByRole('button', { name: msgs.common_capture, exact: true });
				await expect.element(capture).toBeVisible();
				await expect.element(browserPage.getByText(msgs.unit_not_answering)).toBeVisible();
				const reload = browserPage
					.getByRole('button', { name: msgs.unit_not_answering_reload })
					.element();
				uncovered(reload, w, h);
				for (const b of document.querySelectorAll('.topbar button')) uncovered(b, w, h);
				uncovered(capture.element(), w, h);
				expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(h);
			});

			it(`covers nothing in "Which camera is this?" at ${w}x${h} in ${lang}`, async () => {
				locale.set(lang);
				serve(true);
				await browserPage.viewport(w, h);
				unitNotAnswering.set(true);
				render(UnitNotAnswering, { props: { onReload: vi.fn() } });
				render(LivePreview);
				await expect.element(browserPage.getByRole('dialog')).toBeVisible();
				await expect.element(browserPage.getByText(msgs.unit_not_answering)).toBeVisible();
				const reload = browserPage
					.getByRole('button', { name: msgs.unit_not_answering_reload })
					.element();
				uncovered(reload, w, h);
				const step = document.querySelector('[data-which-camera]')!;
				const buttons = [...step.querySelectorAll('button')];
				expect(buttons.length).toBeGreaterThan(0);
				for (const b of buttons) uncovered(b, w, h);
			});
		}
	}
});

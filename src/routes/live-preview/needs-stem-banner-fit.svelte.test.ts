// NEH-324: at the unit's 800x480 screen the banners at the top of the feed
// must not shrink to a column of one word per line. Run on the real page with
// app.css, in single and double mode, for a volume without a stem.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

const current = vi.hoisted(() => ({ url: '', stem: null as string | null }));
const BASE_URL = 'http://localhost/live-preview?projectId=2&collectionId=9';

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
import { locale } from '$lib/i18n';
import { cameraStatus } from '$lib/stores/cameras';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: current.stem, custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.includes('/cameras/capabilities')) return json({});
		return json([]);
	});
}

beforeEach(() => {
	current.url = BASE_URL;
	current.stem = null;
	authStore.setSession({ id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	cameraStatus.reportSuccess();
	authStore.clearSession();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fits(screen: { container: HTMLElement }, selector: string) {
	const feed = screen.container.querySelector('.camera-viewport') as HTMLElement;
	const viewport = feed.getBoundingClientRect();
	const banner = screen.container.querySelector(selector) as HTMLElement;
	expect(banner).not.toBeNull();
	const b = banner.getBoundingClientRect();
	// Uses the room max-width allows (80% of the feed's padding box, its
	// clientWidth) instead of half the feed's width.
	expect(b.width).toBeGreaterThan(feed.clientWidth * 0.8 - 1);
	// Centred on the feed.
	expect(Math.abs((b.left + b.right) / 2 - (viewport.left + viewport.right) / 2)).toBeLessThan(1);
	// Clear of the floating controls, which start 75px below the top of the
	// feed's container.
	const panel = (screen.container.querySelector('.floating-controls') as HTMLElement).getBoundingClientRect();
	expect(b.bottom > panel.top && b.right > panel.left && b.left < panel.right).toBe(false);
}

async function open(mode: 'single' | 'double') {
	await browserPage.viewport(800, 480);
	const screen = render(LivePreview);
	await expect.element(screen.getByRole('button', { name: /^(Capture|Capturar)$/ })).toBeVisible();
	if (mode === 'single') {
		(document.querySelector('.strip-btn.toggle') as HTMLElement).click();
		await wait(200);
		(document.querySelectorAll('input[type=radio]')[0] as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
		await wait(200);
		(document.querySelector('.collapse-btn') as HTMLElement).click();
	}
	await wait(500);
	return screen;
}

describe('the needs-stem banner keeps its width on a narrow feed (NEH-324)', () => {
	for (const lang of ['es', 'en'] as const) {
		for (const mode of ['single', 'double'] as const) {
			it(`${lang}, ${mode} mode, 800x480`, async () => {
				locale.set(lang);
				const screen = await open(mode);
				fits(screen, '.needs-stem-banner');
			});
		}
	}
});

describe('the capture-error banner keeps its width on a narrow feed (NEH-324)', () => {
	for (const mode of ['single', 'double'] as const) {
		it(`es, ${mode} mode, 800x480, a long error`, async () => {
			locale.set('es');
			current.stem = 'co-ahr-6';
			const screen = await open(mode);
			cameraStatus.reportFailure('La cámara 1 no respondió a tiempo. Revisa el cable USB y vuelve a intentarlo.');
			await wait(200);
			fits(screen, '.capture-error-banner');
		});
	}
});

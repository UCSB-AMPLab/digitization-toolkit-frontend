// NEH-323: the floating controls of the capture page fold into more than one
// column when the viewport is too short, so that every button is reachable.
// Run on the real page at the unit's 800x480 screen (top bar and thumbnail
// strip leave the viewport about 268px) with app.css, and at 1280x800 where
// they stay in one column with dividers.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

const current = vi.hoisted(() => ({ url: '' }));
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
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.includes('/cameras/capabilities')) return json({});
		return json([]);
	});
}

function signInAdmin() {
	authStore.setSession({ id: 1, username: 'admin', email: null, role: 'admin', is_active: true });
}

beforeEach(() => {
	current.url = BASE_URL;
	locale.set('en');
	signInAdmin();
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(mode: 'single' | 'double', w: number, h: number) {
	await browserPage.viewport(w, h);
	const screen = render(LivePreview);
	await expect.element(screen.getByRole('button', { name: 'Capture', exact: true })).toBeVisible();
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

function boxes(screen: { container: HTMLElement }) {
	const outer = screen.container.querySelector('.viewport-outer')!.getBoundingClientRect();
	const panel = screen.container.querySelector('.floating-controls') as HTMLElement;
	const buttons = Array.from(panel.querySelectorAll('button')).map((b) => ({
		label: b.getAttribute('aria-label'),
		r: b.getBoundingClientRect()
	}));
	return { outer, panel, buttons };
}

describe('floating controls fit the viewport (NEH-323)', () => {
	// Around the height where the panel changes from one column to a grid:
	// the single panel is 308px tall and the double 361px, under a 75px top
	// offset inside the board, which sits 16px inside `.viewport-outer`.
	for (const [mode, heights] of [['single', [606, 611, 616, 621, 626, 627, 628]], ['double', [659, 664, 669, 674, 679, 680, 681]]] as const) {
		for (const h of heights) {
			it(`at 800x${h}, ${mode} mode: the whole panel lies inside the board`, async () => {
				const screen = await open(mode, 800, h);
				const board = screen.container.querySelector('.mat-board')!.getBoundingClientRect();
				const panel = (screen.container.querySelector('.floating-controls') as HTMLElement).getBoundingClientRect();
				expect(panel.bottom).toBeLessThanOrEqual(board.bottom + 0.5);
				expect(panel.left).toBeGreaterThanOrEqual(board.left - 0.5);
			});
		}
	}

	for (const mode of ['single', 'double'] as const) {
		it(`at 800x480, ${mode} mode: every button lies inside the viewport, 44px tall`, async () => {
			const screen = await open(mode, 800, 480);
			const { outer, buttons } = boxes(screen);
			expect(buttons.length).toBe(mode === 'double' ? 7 : 6);
			const outside = buttons
				.filter(({ r }) => r.top < outer.top - 0.5 || r.bottom > outer.bottom + 0.5 || r.left < outer.left - 0.5 || r.right > outer.right + 0.5)
				.map(({ label }) => label);
			expect(outside).toEqual([]);
			for (const { r } of buttons) expect(Math.round(r.height)).toBe(44);
		});

		it(`at 800x480, ${mode} mode: the buttons keep their order and no divider is shown`, async () => {
			const screen = await open(mode, 800, 480);
			const { panel, buttons } = boxes(screen);
			const labels = buttons.map((b) => b.label);
			expect(labels.slice(0, 6)).toEqual(['Hide controls', 'Zoom in', 'Zoom out', 'Fit to screen', 'Grid settings', 'Capture pedal and key']);
			if (mode === 'double') expect(labels[6]).toBe('Swap left and right');
			expect(panel.querySelector('.float-divider')).toBeNull();
			// The toggle stays on the panel's right edge, which stays at the viewport's.
			const toggle = buttons[0].r;
			expect(Math.max(...buttons.map(({ r }) => r.right))).toBeCloseTo(toggle.right, 0);
		});
	}

	it('at 1280x800 the panel stays one column with its dividers', async () => {
		const screen = await open('double', 1280, 800);
		const { panel, buttons, outer } = boxes(screen);
		expect(panel.querySelectorAll('.float-divider').length).toBe(3);
		expect(new Set(buttons.map(({ r }) => Math.round(r.left))).size).toBe(1);
		expect(buttons.every(({ r }) => r.bottom <= outer.bottom + 0.5)).toBe(true);
	});

	it('collapsed, it shows only the toggle', async () => {
		const screen = await open('double', 800, 480);
		await screen.getByRole('button', { name: 'Hide controls' }).click();
		await wait(200);
		const { panel, buttons, outer } = boxes(screen);
		expect(buttons.map((b) => b.label)).toEqual(['Show controls']);
		expect(panel.querySelector('.float-divider')).toBeNull();
		expect(buttons[0].r.bottom).toBeLessThanOrEqual(outer.bottom);
	});
});

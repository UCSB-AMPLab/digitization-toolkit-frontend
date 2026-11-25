// The Overview fits both layouts of the design rules (NEH-377), drawn in
// the approved mock-up (NEH-350): Compact, the unit's 800x480 screen with
// the sidebar expanded (a content area 574 px wide), in one column; and
// Wide, 1920x1080 (a content area 1694 px wide), in two columns, the right
// one 646 px. In each, for the states that change the layout, nothing runs
// past the content area sideways, and every button is at least 44 px high.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { resetUnit } from '$lib/unit-mode';
import { resetCameraKind } from '$lib/camera-kind';
import '../../../app.css';
import Overview from './+page.svelte';
import {
	hideProjects,
	serveOverview,
	signIn,
	type OverviewRole,
	type OverviewState
} from './overview-fixtures';

// The layout's sidebar: 216 px with a 10 px margin.
const SIDEBAR = 226;
const SIZES = {
	compact: { w: 800, h: 480 },
	wide: { w: 1920, h: 1080 }
} as const;

let host: HTMLElement | null = null;

// A stand-in for the layout's `.content`: the rest of the screen beside the
// sidebar, scrolling vertically.
function contentArea(w: number, h: number): HTMLElement {
	const el = document.createElement('main');
	el.style.cssText = `position:fixed;top:0;left:${SIDEBAR}px;width:${w - SIDEBAR}px;height:${h}px;overflow-y:auto;overflow-x:hidden;background:var(--color-bg)`;
	document.body.appendChild(el);
	return el;
}

const controls = (root: HTMLElement) =>
	[...root.querySelectorAll<HTMLElement>('button, a.btn, .cam-actions a, a.on-own-line')].filter(
		(el) => el.offsetParent !== null
	);

beforeEach(async () => {
	localStorage.clear();
	await hideProjects();
});
afterEach(() => {
	host?.remove();
	host = null;
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	resetCameraKind();
	locale.set('es');
});

const CASES: [OverviewState, OverviewRole][] = [
	['ok', 'admin'],
	['notices', 'admin'],
	['notices', 'reviewer'],
	['camera', 'operator'],
	['nocams', 'admin'],
	['kind', 'admin'],
	['unusable1', 'operator'],
	['unusable2', 'admin']
];

for (const [layout, { w, h }] of Object.entries(SIZES)) {
	describe(`Overview fit, ${layout} (${w}x${h})`, () => {
		for (const lang of ['es', 'en'] as Locale[]) {
			for (const [state, role] of CASES) {
				it(`${state}, ${role}, ${lang}: within the content area, 44 px controls, ${layout === 'wide' ? 'two columns' : 'one column'}`, async () => {
					locale.set(lang);
					await page.viewport(w, h);
					signIn(role);
					serveOverview(state);
					host = contentArea(w, h);
					render(Overview, { target: host });
					await expect.element(page.getByText('Tomo 1', { exact: true })).toBeVisible();
					if (state !== 'ok' && !(role === 'reviewer' && state !== 'notices'))
						await expect
							.poll(() => host!.querySelectorAll('[data-attention-notice]').length)
							.toBeGreaterThan(0);
					if (role !== 'reviewer')
						await expect.poll(() => host!.querySelectorAll('[data-camera-row]').length).toBe(2);

					const area = host.getBoundingClientRect();
					expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
					for (const el of controls(host)) {
						const r = el.getBoundingClientRect();
						const label = el.textContent?.trim() || el.getAttribute('aria-label');
						expect(r.left, `${label} left`).toBeGreaterThanOrEqual(area.left - 0.5);
						expect(r.right, `${label} right`).toBeLessThanOrEqual(area.right + 0.5);
						expect(r.height, `${label} height`).toBeGreaterThanOrEqual(44 - 0.5);
					}

					const inProgress = host.querySelector('.ip-header')!.getBoundingClientRect();
					const figures = host.querySelector('.kpi-grid')!.getBoundingClientRect();
					const calendar = host.querySelector('.activity')!.getBoundingClientRect();
					const cams = host.querySelector('[data-camera-block]')?.getBoundingClientRect();
					if (layout === 'compact') {
						// One column: in progress, cameras, figures, calendar, one under the other.
						expect(figures.top).toBeGreaterThan(inProgress.bottom);
						if (cams) {
							expect(cams.top).toBeGreaterThan(inProgress.bottom);
							expect(figures.top).toBeGreaterThan(cams.bottom);
						}
						expect(calendar.top).toBeGreaterThan(figures.bottom);
					} else {
						// Two columns: the right one, 646 px, holds cameras, figures and calendar.
						expect(figures.left).toBeGreaterThan(inProgress.right);
						expect(Math.round(figures.width)).toBe(646);
						if (cams) expect(cams.left).toBe(figures.left);
						expect(calendar.left).toBe(figures.left);
						const wrap = host.querySelector('.activity .act-scroll') as HTMLElement | null;
						// The map is 604 px; 646 less 20 px of padding and a 1 px border
						// each side leaves it exactly that, so it does not scroll.
						expect(wrap).not.toBeNull();
						expect(wrap!.scrollWidth - wrap!.clientWidth).toBe(0);
					}
				});
			}
		}
	});
}

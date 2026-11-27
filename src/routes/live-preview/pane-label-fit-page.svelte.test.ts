// The label on each live picture of the capture screen, in double mode with
// the cameras' set-up confirmed. It names the camera and the page in words
// where the pane is wide enough for them on one line, and in the badge form
// (camera symbol, camera letter, page term) where it is not; the words stay
// as its accessible name and title. Run on the real page at the unit's
// 800x480 screen and at 1920x1080, with frames served.
//
// Version: 0.3.0
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
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { layoutSettled } from '$lib/test-support/layout-settled';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

async function framePng() {
	const canvas = document.createElement('canvas');
	canvas.width = 640;
	canvas.height = 480;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = '#888';
	ctx.fillRect(0, 0, 640, 480);
	return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

const body = (index: number, hardware_id: string) => ({
	index,
	model: 'Canon PowerShot A2500',
	hardware_id,
	calibrated: false
});

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/cameras/capabilities')) {
			return json({
				backend: 'gphoto2',
				live_preview: true,
				focus_control: false,
				live_controls: false,
				zoom: false,
				autofocus_calibration: false,
				dslr_settings: false,
				continuous_preview: false,
				zoom_steps: false
			});
		}
		if (path.includes('/cameras/preview/')) return new Response(await framePng(), { status: 200 });
		if (path.endsWith('/cameras/setup'))
			return json({ needs_setup: false, reasons: [], confirmed_pair: { left: 'a', right: 'b' } });
		if (path.endsWith('/cameras/devices') || path.endsWith('/cameras/rescan'))
			return json([body(0, 'a'), body(1, 'b')]);
		if (path.endsWith('/records/to-retake/summary'))
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
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
		return json([]);
	});
}

beforeEach(() => {
	localStorage.clear();
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	authStore.setSession(
		{ id: 3, username: 'operator', email: null, role: 'operator', is_active: true },
		{ signIn: true }
	);
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	localStorage.clear();
	locale.set('en');
});

// The left pane shows the role-left camera, which is the right camera (even
// page, letter R / D); the right pane the left camera (odd page, L / I).
async function open(lang: 'en' | 'es', w: number, h: number) {
	locale.set(lang);
	await browserPage.viewport(w, h);
	render(LivePreview);
	const t = lang === 'en' ? en : es;
	await expect
		.poll(
			() => document.querySelector('.camera-feed img')?.getAttribute('alt') === t.lv_camera_left_alt
		)
		.toBe(true);
	await expect.poll(() => document.querySelectorAll('.camera-feed img').length).toBe(2);
	await expect.poll(() => document.querySelectorAll('.feed-source').length).toBe(2);
	await layoutSettled(['.camera-feed', '.feed-label', '.feed-source']);
	const q = (s: string) => document.querySelector(s) as HTMLElement;
	return {
		t,
		panes: [q('.camera-feed'), document.querySelectorAll<HTMLElement>('.camera-feed')[1]],
		labels: [q('.feed-label:not(.right)'), q('.feed-label.right')],
		sources: [q('.feed-source:not(.right)'), q('.feed-source.right')]
	};
}

const hit = (a: DOMRect, b: DOMRect) =>
	a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const text = (el: HTMLElement) => el.innerText.replace(/\s+/g, ' ').trim();

describe('pane labels fit their panes (confirmed pair, double mode)', () => {
	for (const lang of ['en', 'es'] as const) {
		it(`at 800x480 in ${lang}: one line, inside the pane, clear of the source label, in the badge form`, async () => {
			const { t, panes, labels, sources } = await open(lang, 800, 480);
			const rects = labels.map((l) => l.getBoundingClientRect());
			console.log(
				`${lang} 800x480 panes`,
				panes.map((p) => p.clientWidth),
				'labels',
				rects.map((r) => Math.round(r.width)),
				rects.map((r) => Math.round(r.height))
			);
			rects.forEach((r, i) => {
				const pane = panes[i].getBoundingClientRect();
				expect(r.height).toBeLessThan(40);
				expect(r.left - pane.left).toBeGreaterThanOrEqual(8);
				expect(pane.right - r.right).toBeGreaterThanOrEqual(8);
				expect(hit(r, sources[i].getBoundingClientRect())).toBe(false);
			});
			expect(hit(rects[0], rects[1])).toBe(false);
			expect(text(labels[0])).toContain(`${t.badge_cam_right} · ${t.page_term_even}`);
			expect(text(labels[1])).toContain(`${t.badge_cam_left} · ${t.page_term_odd}`);
			expect(
				labels[0].querySelector('.material-symbols-outlined')?.getAttribute('aria-hidden')
			).toBe('true');
			expect(text(labels[0])).not.toContain(t.lv_camera_left_alt);
			expect(labels[0].getAttribute('aria-label')).toBe(t.lv_camera_left_alt);
			expect(labels[1].getAttribute('aria-label')).toBe(t.lv_camera_right_alt);
			expect(labels[0].getAttribute('title')).toMatch(
				new RegExp(`^${t.lv_camera_left_alt.replace('/', '\\/')}`)
			);
			expect(labels[1].getAttribute('title')).toMatch(
				new RegExp(`^${t.lv_camera_right_alt.replace('/', '\\/')}`)
			);
			expect(panes[0].querySelector('img')?.getAttribute('alt')).toBe(t.lv_camera_left_alt);
		});

		it(`at 1920x1080 in ${lang}: the words on one line, nothing overlapping`, async () => {
			const { t, panes, labels, sources } = await open(lang, 1920, 1080);
			const rects = labels.map((l) => l.getBoundingClientRect());
			console.log(
				`${lang} 1920x1080 panes`,
				panes.map((p) => p.clientWidth),
				'labels',
				rects.map((r) => Math.round(r.width))
			);
			expect(text(labels[0])).toBe(t.lv_camera_left_alt);
			expect(text(labels[1])).toBe(t.lv_camera_right_alt);
			rects.forEach((r, i) => {
				const pane = panes[i].getBoundingClientRect();
				expect(r.height).toBeLessThan(40);
				expect(r.left - pane.left).toBeGreaterThanOrEqual(8);
				expect(pane.right - r.right).toBeGreaterThanOrEqual(8);
				expect(hit(r, sources[i].getBoundingClientRect())).toBe(false);
			});
			expect(hit(rects[0], rects[1])).toBe(false);
		});
	}
});

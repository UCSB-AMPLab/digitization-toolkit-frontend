// NEH-252/348: the capture screen reads the kind of camera when it opens and
// shows the notice under the top bar, with the camera panel collapsed, and
// inside "Which camera is this?" when that step covers the screen. With its
// longest sentence (cameras of three kinds, the administrator's link) the
// notice fits the unit's 800x480 screen and 1280x800 in both languages, and
// the Capture button, or the step's own buttons, stay on screen.
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
import { resetCameraKind } from '$lib/camera-kind';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const KIND = {
	configured: 'picamera2',
	source: 'last_used',
	stored: null,
	pending_restart: false,
	detected: null,
	connected: { picamera2: 1, gphoto2: 2, chdk: 1 },
	available: { picamera2: true, gphoto2: true, chdk: true },
	mixed: true,
	mismatch: false
};

let kindCalls = 0;

function serve(setupNeeded: boolean) {
	kindCalls = 0;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/system/camera-kind')) {
			kindCalls += 1;
			return json(KIND);
		}
		if (path.endsWith('/cameras/setup'))
			return json({ needs_setup: setupNeeded, reasons: [], confirmed_pair: null });
		if (path.endsWith('/imports/digitisation-lists')) return json([]);
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
	vi.restoreAllMocks();
	authStore.clearSession();
	resetCameraKind();
});

function mixedText(msgs: typeof en) {
	return msgs.camera_kind_mixed([
		msgs.camera_kind_count_picamera2(1),
		msgs.camera_kind_count_gphoto2(2),
		msgs.camera_kind_count_chdk(1)
	]);
}

function inside(el: Element, w: number, h: number) {
	const r = el.getBoundingClientRect();
	expect(r.left).toBeGreaterThanOrEqual(-0.5);
	expect(r.right).toBeLessThanOrEqual(w + 0.5);
	expect(r.top).toBeGreaterThanOrEqual(-0.5);
	expect(r.bottom).toBeLessThanOrEqual(h + 0.5);
}

describe('capture screen: camera kind notice', () => {
	for (const lang of ['en', 'es'] as Locale[]) {
		const msgs = lang === 'en' ? en : es;
		for (const [w, h] of [
			[800, 480],
			[1280, 800]
		] as const) {
			it(`shows under the top bar with the panel collapsed, at ${w}x${h} in ${lang}`, async () => {
				locale.set(lang);
				serve(false);
				await browserPage.viewport(w, h);
				const screen = render(LivePreview);
				await expect.element(screen.getByText(mixedText(msgs))).toBeVisible();
				expect(kindCalls).toBe(1);
				const notice = document.querySelector('[data-camera-kind-notice]')!;
				inside(notice, w, h);
				inside(document.querySelector('[data-camera-kind-notice] a')!, w, h);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w);
				const capture = screen.getByRole('button', { name: msgs.common_capture, exact: true });
				await expect.element(capture).toBeVisible();
				inside(capture.element(), w, h);
			});

			it(`shows inside "Which camera is this?", at ${w}x${h} in ${lang}`, async () => {
				locale.set(lang);
				serve(true);
				await browserPage.viewport(w, h);
				render(LivePreview);
				const step = browserPage.getByRole('dialog');
				await expect.element(step.getByText(mixedText(msgs))).toBeVisible();
				const root = document.querySelector('[data-which-camera]')!;
				inside(root.querySelector('[data-camera-kind-notice]')!, w, h);
				for (const b of root.querySelectorAll('button')) inside(b, w, h);
			});
		}
	}
});

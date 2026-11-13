// NEH-339: "Check cameras" in the capture screen's top bar opens the camera
// check over the screen, and "Back to capturing" closes it. Nothing opens it
// by itself. While it is open the capture key takes no capture, and the
// focus check does not open over it by itself. "Turn" in the check saves the
// camera's orientation through the capture screen's own writer: the same
// PUT, one at a time per camera, optimistic and logged on failure.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

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
import { recordFocusActivity } from '$lib/focus-check';
import { clearChord } from '$lib/capture-key';
import '../../app.css';
import LivePreview from './+page.svelte';

const USER = 3;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle() {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 20));
	}
}

type Put = { path: string; body: unknown; answer: ReturnType<typeof deferredResponse> };
let puts: Put[] = [];

function deferredResponse() {
	let resolve!: (r: Response) => void;
	const promise = new Promise<Response>((r) => (resolve = r));
	return { promise, resolve };
}

function serve(dslr: boolean, captureGate?: Promise<void>) {
	const captures: string[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/cameras/capabilities')) {
			return json({ backend: 'gphoto2', live_preview: true, focus_control: false, live_controls: false, zoom: false, autofocus_calibration: false, dslr_settings: dslr, continuous_preview: false, zoom_steps: !dslr });
		}
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (/\/cameras\/\d\/orientation$/.test(path)) {
			const answer = deferredResponse();
			puts.push({ path, body: JSON.parse(String((init as RequestInit | undefined)?.body)), answer });
			return answer.promise;
		}
		if (/\/cameras\/dslr\/\d\/settings$/.test(path)) return json({ focus_mode: 'Manual' });
		if (path.endsWith('/cameras/devices')) {
			return json([
				{ index: 0, model: 'Canon PowerShot A2500', hardware_id: 'a', calibrated: false, zoom_steps: 64, zoom_step: 24 },
				{ index: 1, model: 'Canon PowerShot A2500', hardware_id: 'b', calibrated: false, zoom_steps: 64, zoom_step: 24 }
			]);
		}
		if (path.endsWith('/records/to-retake/summary')) return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.includes('/cameras/test-capture/')) return new Promise<Response>(() => {});
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records')) return json([]);
		if (path.endsWith('/cameras/capture/dual') || path.endsWith('/cameras/capture')) {
			captures.push(path);
			await captureGate;
			return json({ success: true, record_id: 42, image_ids: [] });
		}
		return json([]);
	});
	return captures;
}

// A button's name: its aria-label, or its text without the icon ligatures.
function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}

const openButton = () => [...document.querySelectorAll<HTMLButtonElement>('.topbar button')].find((b) => nameOf(b) === en.camcheck_open) ?? null;
const check = () => document.querySelector('[data-camera-check]');
const refocusDialog = () => [...document.querySelectorAll('[role="dialog"]')].find((d) => d.textContent?.includes(en.focus_af_title)) ?? null;
const captureButton = () => document.querySelector('.capture-btn') as HTMLButtonElement | null;

function pressCaptureKey() {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
	window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
}

beforeEach(() => {
	puts = [];
	localStorage.clear();
	clearChord();
	locale.set('en');
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	authStore.setSession({ id: USER, username: 'operator', email: null, role: 'operator', is_active: true }, { signIn: true });
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	localStorage.clear();
});

describe('capture screen: "Check cameras" (NEH-339)', () => {
	it('opens the camera check over the capture screen, and "Back to capturing" closes it', async () => {
		serve(false);
		render(LivePreview);
		await expect.poll(() => openButton()).not.toBeNull();
		await settle();
		// Nothing opens it by itself.
		expect(check()).toBeNull();

		openButton()!.click();
		await expect.poll(() => check()).not.toBeNull();
		expect(check()?.textContent).toContain(en.camcheck_title);
		// The volume it was opened from, in its top bar.
		expect(check()?.textContent).toContain('Tomo 6');

		const back = [...check()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => nameOf(b) === en.camcheck_back)!;
		back.click();
		await expect.poll(() => check()).toBeNull();
		expect(captureButton()).not.toBeNull();
	});

	it('the capture key takes no capture while the check is open', async () => {
		const captures = serve(false);
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		openButton()!.click();
		await expect.poll(() => check()).not.toBeNull();
		pressCaptureKey();
		await settle();
		expect(captures.length).toBe(0);
	});

	it('on a DSLR unit the due focus check waits while the camera check is open', async () => {
		// Recent activity: the focus check is not due when the screen opens.
		recordFocusActivity(USER, Date.now());
		serve(true);
		render(LivePreview);
		await expect.poll(() => openButton()).not.toBeNull();
		await settle();
		openButton()!.click();
		await expect.poll(() => check()).not.toBeNull();

		// The focus check falls due while the camera check is open.
		localStorage.setItem(`captua_focus_check:${USER}`, String(Date.now() - 16 * 60 * 1000));
		document.dispatchEvent(new Event('visibilitychange'));
		await settle();
		expect(refocusDialog()).toBeNull();
	});

	it('is disabled while the viewport has a capture in flight, and opens the check once the capture is done', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const captures = serve(false, gate);
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		await expect.poll(() => openButton()?.disabled).toBe(false);

		pressCaptureKey();
		await expect.poll(() => captures.length).toBe(1);
		await expect.poll(() => openButton()?.disabled).toBe(true);
		openButton()!.click();
		await settle();
		expect(check()).toBeNull();

		release();
		await expect.poll(() => openButton()?.disabled).toBe(false);
		openButton()!.click();
		await expect.poll(() => check()).not.toBeNull();
	});
});

describe('the camera check: "Turn" (NEH-339)', () => {
	const turn = (side: 'left' | 'right') => check()?.querySelector(`[data-frame="${side}"] button[data-turn]`) as HTMLButtonElement | null;
	const viewportDegrees = () => [...document.querySelectorAll('.feed-rotate-deg')].map((el) => el.textContent?.trim());

	it('saves the turned orientation of that camera, as the capture screen does, one save at a time', async () => {
		serve(false);
		render(LivePreview);
		await expect.poll(() => openButton()).not.toBeNull();
		// The device list seeds the default 90° for both cameras.
		await expect.poll(() => viewportDegrees()).toEqual(['90°', '90°']);
		openButton()!.click();
		await expect.poll(() => turn('right')?.disabled).toBe(false);

		turn('right')!.click();
		await expect.poll(() => puts.length).toBe(1);
		expect(puts[0].path.endsWith('/cameras/1/orientation')).toBe(true);
		expect(puts[0].body).toEqual({ orientation: 180, hardware_id: 'b' });
		// Optimistic: the capture screen shows it at once.
		await expect.poll(() => viewportDegrees()).toEqual(['90°', '180°']);
		await expect.poll(() => turn('right')?.disabled).toBe(true);
		expect(turn('left')?.disabled).toBe(false);

		puts[0].answer.resolve(new Response(JSON.stringify({ index: 1, hardware_id: 'b', orientation: 180 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		await expect.poll(() => turn('right')?.disabled).toBe(false);
	});

	it('a save that fails is logged and the turn stays, as on the capture screen', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		serve(false);
		render(LivePreview);
		await expect.poll(() => viewportDegrees()).toEqual(['90°', '90°']);
		openButton()!.click();
		await expect.poll(() => turn('left')?.disabled).toBe(false);
		turn('left')!.click();
		await expect.poll(() => puts.length).toBe(1);
		puts[0].answer.resolve(new Response(JSON.stringify({ detail: 'nope' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
		await expect.poll(() => errors.mock.calls.some((c) => String(c[0]).includes('Error saving orientation'))).toBe(true);
		expect(viewportDegrees()).toEqual(['180°', '90°']);
		await expect.poll(() => turn('left')?.disabled).toBe(false);
	});
});

// NEH-339: the capture screen of a DSLR unit offers "Refocus", and asks for a
// focus check by itself when the screen is opened or returned to with no
// check or capture since the sign-in, or none in the last 15 minutes. While
// the check is open the capture key does not capture.
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
import { FOCUS_CHECK_AFTER_MS, readFocusActivity, recordFocusActivity } from '$lib/focus-check';
import { clearChord } from '$lib/capture-key';
import '../../app.css';
import LivePreview from './+page.svelte';

const USER = 3;
const MIN = 60 * 1000;

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

type Served = {
	records?: unknown[];
	summary?: unknown;
	// Held until released: the capabilities answer, and a real capture's answer.
	capsGate?: Promise<void>;
	captureGate?: Promise<void>;
	// When set, the capture answers with this error status once released.
	captureFails?: boolean;
};

function serve(dslr: boolean, served: Served = {}) {
	const captures: string[] = [];
	const testCaptures: number[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/cameras/capabilities')) {
			await served.capsGate;
			return json({ backend: dslr ? 'gphoto2' : 'picamera2', live_preview: true, focus_control: !dslr, live_controls: !dslr, zoom: false, autofocus_calibration: !dslr, dslr_settings: dslr, continuous_preview: !dslr });
		}
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (/\/cameras\/dslr\/\d\/settings$/.test(path)) return json({ focus_mode: 'Manual' });
		if (path.endsWith('/cameras/devices')) {
			return json([{ index: 0, model: 'Canon EOS Rebel T7', hardware_id: 'a' }, { index: 1, model: 'Canon EOS Rebel T7', hardware_id: 'b' }]);
		}
		if (path.endsWith('/records/to-retake/summary')) {
			return json(served.summary ?? { pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		}
		if (path.includes('/cameras/test-capture/')) {
			testCaptures.push(Number(path.split('/').pop()));
			return new Promise<Response>(() => {});
		}
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records')) return json(served.records ?? [{ id: 41, title: 'Par 1', status: 'captured', sequence: 1, capture_mode: 'dual', collection_id: 9, images: [] }]);
		if (path.endsWith('/cameras/capture/dual') || path.endsWith('/cameras/capture')) {
			captures.push(path);
			await served.captureGate;
			if (served.captureFails) return json({ detail: 'camera error' }, 500);
			return json({ success: true, record_id: 42, image_ids: [] });
		}
		return json([]);
	});
	return Object.assign(captures, { testCaptures });
}

const refocusButton = () => document.querySelector(`button[aria-label="${en.focus_refocus}"]`) as HTMLButtonElement | null;
const refocusDialog = () =>
	[...document.querySelectorAll('[role="dialog"]')].find((d) => d.textContent?.includes(en.focus_af_title)) ?? null;
const captureButton = () => document.querySelector('.capture-btn') as HTMLButtonElement | null;

function pressCaptureKey() {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
	window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
}

function dialogButton(name: string) {
	return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
		(x) => (x.getAttribute('aria-label') ?? x.textContent ?? '').trim() === name
	);
}

function skip() {
	const b = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
		(x) => x.textContent?.trim() === en.focus_skip
	);
	b!.click();
}

beforeEach(() => {
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

describe('capture screen: "Refocus" (NEH-339)', () => {
	it('a DSLR unit shows the button and asks for a focus check on the first opening after the sign-in', async () => {
		serve(true);
		render(LivePreview);
		await expect.poll(() => refocusButton()).not.toBeNull();
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});

	it('a unit without DSLR settings shows no button and never asks', async () => {
		serve(false);
		render(LivePreview);
		await expect.poll(() => captureButton()).not.toBeNull();
		await settle();
		expect(refocusButton()).toBeNull();
		expect(refocusDialog()).toBeNull();
	});

	it('does not ask again within 15 minutes of the last check, and the button still opens it', async () => {
		recordFocusActivity(USER, Date.now() - 5 * MIN);
		serve(true);
		render(LivePreview);
		await expect.poll(() => refocusButton()).not.toBeNull();
		await settle();
		expect(refocusDialog()).toBeNull();

		refocusButton()!.click();
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});

	it('asks when the last check is more than 15 minutes old', async () => {
		recordFocusActivity(USER, Date.now() - FOCUS_CHECK_AFTER_MS - MIN);
		serve(true);
		render(LivePreview);
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});

	it('asks on returning to the screen after more than 15 minutes', async () => {
		recordFocusActivity(USER, Date.now() - MIN);
		serve(true);
		render(LivePreview);
		await expect.poll(() => refocusButton()).not.toBeNull();
		await settle();
		expect(refocusDialog()).toBeNull();

		// The tab comes back after a break.
		localStorage.setItem(`captua_focus_check:${USER}`, String(Date.now() - FOCUS_CHECK_AFTER_MS - MIN));
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});

	it('"Skip" records the dismissal, so the screen does not ask again', async () => {
		serve(true);
		render(LivePreview);
		await expect.poll(() => refocusDialog()).not.toBeNull();
		const before = Date.now();
		skip();
		await expect.poll(() => refocusDialog()).toBeNull();
		expect(readFocusActivity(USER)).toBeGreaterThanOrEqual(before);

		document.dispatchEvent(new Event('visibilitychange'));
		await settle();
		expect(refocusDialog()).toBeNull();
	});

	it('the capture key does not capture while the check is open, and does after it closes; a capture counts as activity', async () => {
		const captures = serve(true);
		render(LivePreview);
		await expect.poll(() => refocusDialog()).not.toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);

		pressCaptureKey();
		await settle();
		expect(captures.length).toBe(0);

		skip();
		await expect.poll(() => refocusDialog()).toBeNull();
		localStorage.removeItem(`captua_focus_check:${USER}`);
		pressCaptureKey();
		await expect.poll(() => captures.length).toBe(1);
		await expect.poll(() => readFocusActivity(USER)).not.toBeNull();
	});

	it('on the test-pictures stage the pedal takes the test pair, never a real capture', async () => {
		const captures = serve(true);
		render(LivePreview);
		await expect.poll(() => refocusDialog()).not.toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		dialogButton(en.focus_next)!.click();
		await settle();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'b', code: 'KeyB' }));
		await expect.poll(() => captures.testCaptures.length).toBe(2);
		await settle();
		expect(captures.length).toBe(0);
	});

	it('waits for the retake viewer opened by recordId, and opens once it closes', async () => {
		current.url = 'http://localhost/live-preview?projectId=2&collectionId=9&recordId=41';
		serve(true);
		render(LivePreview);
		const viewer = () => document.querySelector('.img-viewer-content[aria-labelledby="lv-img-viewer-title"]');
		await expect.poll(() => viewer()).not.toBeNull();
		await expect.poll(() => refocusButton()).not.toBeNull();
		await settle();
		expect(refocusDialog()).toBeNull();

		(viewer()!.querySelector('.img-viewer-close-btn') as HTMLButtonElement).click();
		await expect.poll(() => viewer()).toBeNull();
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});

	it('waits for the recapture-turn block panel, and opens once an admin captures anyway', async () => {
		authStore.setSession({ id: USER, username: 'admin', email: null, role: 'admin', is_active: true }, { signIn: true });
		serve(true, {
			records: [],
			summary: {
				pendingRecords: 3,
				volumes: [{ collectionId: 30, projectId: 2, name: 'Tomo 030', filenameStem: 'co-30', pending: 3, total: 3, excluded: 0, firstPendingRecordId: 300, pendingRecordIds: [300, 301, 302] }],
				turn: { state: 'recaptures', unlockedBy: null }
			}
		});
		render(LivePreview);
		const admin = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === en.block_admin);
		await expect.poll(() => admin()).toBeTruthy();
		await settle();
		expect(refocusDialog()).toBeNull();

		admin()!.click();
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});
});

function gate() {
	let open!: () => void;
	const promise = new Promise<void>((resolve) => (open = resolve));
	return { promise, open };
}

describe('the check waits for a capture in flight (NEH-339)', () => {
	it('capabilities arriving during a capture do not open it; it opens once the capture has failed and the check is still due', async () => {
		const caps = gate();
		const shutter = gate();
		const captures = serve(true, { capsGate: caps.promise, captureGate: shutter.promise, captureFails: true });
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		pressCaptureKey();
		await expect.poll(() => captures.length).toBe(1);

		caps.open();
		await expect.poll(() => refocusButton()).not.toBeNull();
		await settle();
		expect(refocusDialog()).toBeNull();

		shutter.open();
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});

	it('capabilities arriving during a capture that succeeds: the capture counts as activity, so the check does not open', async () => {
		const caps = gate();
		const shutter = gate();
		const captures = serve(true, { capsGate: caps.promise, captureGate: shutter.promise });
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		pressCaptureKey();
		await expect.poll(() => captures.length).toBe(1);

		caps.open();
		await expect.poll(() => refocusButton()).not.toBeNull();
		await settle();
		expect(refocusDialog()).toBeNull();

		shutter.open();
		await expect.poll(() => readFocusActivity(USER)).not.toBeNull();
		await settle();
		expect(refocusDialog()).toBeNull();
	});

	it('the tab becoming visible during a capture does not open it; it opens after the capture, if still due', async () => {
		recordFocusActivity(USER, Date.now() - MIN);
		const shutter = gate();
		const captures = serve(true, { captureGate: shutter.promise, captureFails: true });
		render(LivePreview);
		await expect.poll(() => refocusButton()).not.toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		pressCaptureKey();
		await expect.poll(() => captures.length).toBe(1);

		localStorage.setItem(`captua_focus_check:${USER}`, String(Date.now() - FOCUS_CHECK_AFTER_MS - MIN));
		document.dispatchEvent(new Event('visibilitychange'));
		await settle();
		expect(refocusDialog()).toBeNull();

		shutter.open();
		await expect.poll(() => refocusDialog()).not.toBeNull();
	});

	it('the tab becoming visible during a capture that succeeds: no longer due, so it does not open', async () => {
		recordFocusActivity(USER, Date.now() - MIN);
		const shutter = gate();
		const captures = serve(true, { captureGate: shutter.promise });
		render(LivePreview);
		await expect.poll(() => refocusButton()).not.toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		pressCaptureKey();
		await expect.poll(() => captures.length).toBe(1);

		localStorage.setItem(`captua_focus_check:${USER}`, String(Date.now() - FOCUS_CHECK_AFTER_MS - MIN));
		document.dispatchEvent(new Event('visibilitychange'));
		await settle();
		expect(refocusDialog()).toBeNull();

		shutter.open();
		await expect.poll(() => readFocusActivity(USER)).toBeGreaterThan(Date.now() - MIN);
		await settle();
		expect(refocusDialog()).toBeNull();
	});

	it('the "Refocus" button does not open it during a capture', async () => {
		recordFocusActivity(USER, Date.now() - MIN);
		const shutter = gate();
		const captures = serve(true, { captureGate: shutter.promise });
		render(LivePreview);
		await expect.poll(() => refocusButton()).not.toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		pressCaptureKey();
		await expect.poll(() => captures.length).toBe(1);

		expect(refocusButton()!.disabled).toBe(true);
		refocusButton()!.click();
		await settle();
		expect(refocusDialog()).toBeNull();
		shutter.open();
	});
});

// A failed save of a camera's orientation on the capture screen. The screen
// keeps the new orientation, which captures already use, and a notice under
// the viewer says that the orientation was not saved and offers "Retry".
// Retry sends that camera's current orientation again through the same
// writer, without turning anything. A successful save of that camera's
// orientation removes its notice; each camera has its own.
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
import { es } from '$lib/i18n/es';
import { recordFocusActivity } from '$lib/focus-check';
import { clearChord } from '$lib/capture-key';
import '../../app.css';
import LivePreview from './+page.svelte';

const USER = 3;
const NAME0 = 'Canon PowerShot A2500 [0]';
const NAME1 = 'Canon PowerShot A2500 [1]';

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

function deferredResponse() {
	let resolve!: (r: Response) => void;
	const promise = new Promise<Response>((r) => (resolve = r));
	return { promise, resolve };
}

type Put = { path: string; body: unknown; answer: ReturnType<typeof deferredResponse> };
let puts: Put[] = [];

const body = (index: number, hardware_id: string) => ({ index, model: 'Canon PowerShot A2500', hardware_id, calibrated: false });
// The bodies the next device listing reports.
let deviceList: ReturnType<typeof body>[] = [];
let listings = 0;

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/cameras/capabilities')) {
			return json({ backend: 'gphoto2', live_preview: true, focus_control: false, live_controls: false, zoom: false, autofocus_calibration: false, dslr_settings: false, continuous_preview: false, zoom_steps: false });
		}
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (/\/cameras\/\d\/orientation$/.test(path)) {
			const answer = deferredResponse();
			puts.push({ path, body: JSON.parse(String((init as RequestInit | undefined)?.body)), answer });
			return answer.promise;
		}
		if (path.endsWith('/cameras/devices') || path.endsWith('/cameras/rescan')) {
			listings += 1;
			return json(deviceList);
		}
		if (path.endsWith('/records/to-retake/summary')) return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records')) return json([]);
		return json([]);
	});
}

const fail = (put: Put) => put.answer.resolve(json({ detail: 'nope' }, 500));
const succeed = (put: Put, orientation: number) =>
	put.answer.resolve(json({ index: 0, hardware_id: 'a', orientation }));

// The feed whose label names that camera.
const feed = (name: string) =>
	[...document.querySelectorAll('.camera-feed')].find((f) => f.querySelector('.feed-label')?.textContent?.trim() === name) ?? null;
const rotateCw = (name: string) => feed(name)?.querySelector(`button[aria-label="${en.lv_rotate_cw}"]`) as HTMLButtonElement | null;
const degreesOf = (name: string) => feed(name)?.querySelector('.feed-rotate-deg')?.textContent?.trim();

// "Reconnect cameras" in the camera panel, opened first if it is collapsed.
async function reconnect() {
	const expand = document.querySelector<HTMLButtonElement>(`button[aria-label="${en.cam_panel_expand_aria}"]`);
	if (expand) {
		expand.click();
		await settle();
	}
	const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => {
		const copy = b.cloneNode(true) as Element;
		copy.querySelectorAll('.material-symbols-outlined, svg').forEach((icon) => icon.remove());
		return (copy.textContent ?? '').trim() === en.cam_reconnect;
	});
	button!.click();
}
const alerts = () => [...document.querySelectorAll('[role="alert"]')];
const notice = (text: string) => alerts().find((a) => a.textContent?.includes(text)) ?? null;
const notices = () =>
	alerts().filter((a) =>
		[NAME0, NAME1].some((n) => a.textContent?.includes(en.lv_orientation_save_failed(n)) || a.textContent?.includes(es.lv_orientation_save_failed(n)))
	);
const retryIn = (el: Element | null, label = en.common_retry) =>
	(el ? [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label) : null) ?? null;

beforeEach(() => {
	puts = [];
	deviceList = [body(0, 'a'), body(1, 'b')];
	listings = 0;
	localStorage.clear();
	clearChord();
	locale.set('en');
	recordFocusActivity(USER, Date.now());
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	authStore.setSession({ id: USER, username: 'operator', email: null, role: 'operator', is_active: true }, { signIn: true });
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	localStorage.clear();
	locale.set('en');
});

async function ready() {
	render(LivePreview);
	await expect.poll(() => degreesOf(NAME0)).toBe('90°');
	await expect.poll(() => degreesOf(NAME1)).toBe('90°');
}

describe('capture screen: an orientation that could not be saved', () => {
	it('keeps the new orientation, logs the error and shows a notice naming the camera with Retry', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await ready();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(1);
		expect(notice(en.lv_orientation_save_failed(NAME0))).toBeNull();
		fail(puts[0]);
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).not.toBeNull();
		expect(errors.mock.calls.some((c) => String(c[0]).includes('Error saving orientation'))).toBe(true);
		expect(degreesOf(NAME0)).toBe('180°');
		expect(retryIn(notice(en.lv_orientation_save_failed(NAME0)))).not.toBeNull();
		expect(notices().length).toBe(1);
	});

	it('Retry sends the same orientation and hardware id again and turns nothing', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await ready();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(1);
		fail(puts[0]);
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).not.toBeNull();
		await expect.poll(() => retryIn(notice(en.lv_orientation_save_failed(NAME0)))?.disabled).toBe(false);

		retryIn(notice(en.lv_orientation_save_failed(NAME0)))!.click();
		await expect.poll(() => puts.length).toBe(2);
		expect(puts[1].path.endsWith('/cameras/0/orientation')).toBe(true);
		expect(puts[1].body).toEqual({ orientation: 180, hardware_id: 'a' });
		expect(degreesOf(NAME0)).toBe('180°');
		expect(degreesOf(NAME1)).toBe('90°');
	});

	it('a successful Retry removes the notice', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await ready();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(1);
		fail(puts[0]);
		await expect.poll(() => retryIn(notice(en.lv_orientation_save_failed(NAME0)))?.disabled).toBe(false);
		retryIn(notice(en.lv_orientation_save_failed(NAME0)))!.click();
		await expect.poll(() => puts.length).toBe(2);
		succeed(puts[1], 180);
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).toBeNull();
		expect(degreesOf(NAME0)).toBe('180°');
	});

	it('a later turn that saves removes the notice too', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await ready();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(1);
		fail(puts[0]);
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).not.toBeNull();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(2);
		expect(puts[1].body).toEqual({ orientation: 270, hardware_id: 'a' });
		succeed(puts[1], 270);
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).toBeNull();
	});

	it('each camera has its own notice', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await ready();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(1);
		fail(puts[0]);
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).not.toBeNull();
		expect(notice(en.lv_orientation_save_failed(NAME1))).toBeNull();

		rotateCw(NAME1)!.click();
		await expect.poll(() => puts.length).toBe(2);
		expect(puts[1].path.endsWith('/cameras/1/orientation')).toBe(true);
		fail(puts[1]);
		await expect.poll(() => notices().length).toBe(2);
		expect(notice(en.lv_orientation_save_failed(NAME1))).not.toBeNull();

		// Camera 1's retry saves; camera 0's notice stays.
		await expect.poll(() => retryIn(notice(en.lv_orientation_save_failed(NAME1)))?.disabled).toBe(false);
		retryIn(notice(en.lv_orientation_save_failed(NAME1)))!.click();
		await expect.poll(() => puts.length).toBe(3);
		expect(puts[2].body).toEqual({ orientation: 180, hardware_id: 'b' });
		puts[2].answer.resolve(json({ index: 1, hardware_id: 'b', orientation: 180 }));
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME1))).toBeNull();
		await settle();
		expect(notice(en.lv_orientation_save_failed(NAME0))).not.toBeNull();
		expect(notices().length).toBe(1);
	});

	it('belongs to the body whose save failed: another body at that index has no notice and no Retry', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await ready();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(1);
		fail(puts[0]);
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).not.toBeNull();

		// Another body is connected at index 0 and the cameras are listed again.
		deviceList = [body(0, 'c'), body(1, 'b')];
		await reconnect();
		await expect.poll(() => notice(en.lv_orientation_save_failed(NAME0))).toBeNull();
		await settle();
		expect(notices().length).toBe(0);
		expect(retryIn(document.querySelector('.center-column'))).toBeNull();
	});

	it('a save for the previous body that fails after another body is connected puts no notice on the new one', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await ready();
		rotateCw(NAME0)!.click();
		await expect.poll(() => puts.length).toBe(1);
		expect(puts[0].body).toEqual({ orientation: 180, hardware_id: 'a' });

		deviceList = [body(0, 'c'), body(1, 'b')];
		await reconnect();
		await expect.poll(() => listings).toBeGreaterThan(1);
		await settle();
		fail(puts[0]);
		await settle();
		expect(notice(en.lv_orientation_save_failed(NAME0))).toBeNull();
		expect(notices().length).toBe(0);
	});

	it('shows the Spanish text from the Spanish catalogue', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		locale.set('es');
		render(LivePreview);
		await expect.poll(() => degreesOf(NAME0)).toBe('90°');
		feed(NAME0)!.querySelector<HTMLButtonElement>(`button[aria-label="${es.lv_rotate_cw}"]`)!.click();
		await expect.poll(() => puts.length).toBe(1);
		fail(puts[0]);
		await expect.poll(() => notice(es.lv_orientation_save_failed(NAME0))).not.toBeNull();
		expect(retryIn(notice(es.lv_orientation_save_failed(NAME0)), es.common_retry)).not.toBeNull();
	});
});

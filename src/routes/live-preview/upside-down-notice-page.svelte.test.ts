// NEH-389: a turn that leaves a camera's orientation 180° from the default
// of its page (`default_orientation` in the device rows: 270 for the camera
// whose role is left, 90 for right), on a unit whose two cameras have their
// pages confirmed, shows a notice on the capture screen: an upside-down image
// usually means the cameras are stored the wrong way round, with a button to
// the camera step. It stays until it is closed or the orientation is other
// than 180° off; it holds no capture. Without `default_orientation` (an
// older backend), or without confirmed pages, there is none; the testing
// account, which turns nothing, never gets it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

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
import { es } from '$lib/i18n/es';
import { recordFocusActivity } from '$lib/focus-check';
import '../../app.css';
import LivePreview from './+page.svelte';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

type Device = Record<string, unknown>;
const served = {
	devices: [] as Device[],
	setup: {} as Record<string, unknown>,
	puts: [] as { path: string; body: { orientation: number } }[]
};

// Camera 0 (body a) photographs the even/verso page (role left, default
// 270), camera 1 (body b) the odd/recto page (role right, default 90).
function devices(withDefault = true): Device[] {
	return [
		{ index: 0, hardware_id: 'a', role: 'left', orientation: 270, default_orientation: 270 },
		{ index: 1, hardware_id: 'b', role: 'right', orientation: 90, default_orientation: 90 }
	].map((d) => {
		const row: Device = {
			...d,
			model: 'Canon PowerShot A2500',
			calibrated: false,
			orientation_saved: false,
			role_confirmed: true
		};
		if (!withDefault) delete row.default_orientation;
		return row;
	});
}

const CONFIRMED = { needs_setup: false, reasons: [], confirmed_pair: { left: 'a', right: 'b' } };

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		if (path.endsWith('/cameras/capabilities'))
			return json({ backend: 'chdk', live_preview: true, continuous_preview: false });
		if (path.endsWith('/cameras/setup')) return json(served.setup);
		if (path.endsWith('/cameras/devices')) return json(served.devices);
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (/\/cameras\/\d\/orientation$/.test(path)) {
			const body = JSON.parse(String((init as RequestInit | undefined)?.body));
			served.puts.push({ path, body });
			return json({ index: Number(path.split('/')[2]), orientation: body.orientation });
		}
		if (path.endsWith('/records/to-retake/summary'))
			return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.endsWith('/collections/9'))
			return json({
				id: 9,
				name: 'Tomo 6',
				project_id: 2,
				created_at: '2026-01-01T00:00:00',
				filename_stem: 'co-ahr-6',
				custom_attributes: null
			});
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		return json([]);
	});
}

function words(el: Element): string {
	const copy = el.cloneNode(true) as HTMLElement;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return copy.textContent?.trim() ?? '';
}
const notice = () => document.querySelector('.lv-upside-down') as HTMLElement | null;
const noticeButton = (name: string) =>
	[...(notice()?.querySelectorAll('button') ?? [])].find((b) => words(b) === name);
// The rotate buttons over the pane of camera 0 (the left pane: not swapped).
const rotate = (name: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('.feed-rotate-btn')].find(
		(b) => b.getAttribute('aria-label') === name
	)!;
const captureButton = () => document.querySelector('button.capture-btn') as HTMLButtonElement;

// A turn of camera 0, done once its PUT is sent and the pane's overlay shows
// the new angle: the screen has been drawn with it, notice or not.
async function turn(name: string) {
	const n = served.puts.length;
	rotate(name).click();
	await vi.waitFor(() => expect(served.puts).toHaveLength(n + 1));
	const deg = served.puts[n].body.orientation;
	await vi.waitFor(() =>
		expect(document.querySelector('.feed-rotate-deg')?.textContent?.trim()).toBe(`${deg}°`)
	);
}

async function screenReady() {
	await vi.waitFor(() => expect(captureButton()?.disabled).toBe(false));
	await vi.waitFor(() => expect(rotate(es.lv_rotate_cw)).toBeTruthy());
}

beforeEach(() => {
	locale.set('es');
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	served.devices = devices();
	served.setup = CONFIRMED;
	served.puts = [];
	authStore.setSession({ id: 1, username: 'op', email: null, role: 'operator', is_active: true });
	recordFocusActivity(1, Date.now() + 60 * 60 * 1000);
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('the upside-down notice (NEH-389)', () => {
	it('shows after a turn that leaves a camera 180° from its default, and goes when it is no longer', async () => {
		render(LivePreview);
		await screenReady();
		// 270 → 0: a quarter turn from the default, no notice.
		await turn(es.lv_rotate_cw);
		expect(served.puts[0].body.orientation).toBe(0);
		expect(notice()).toBeNull();
		// 0 → 90: 180° from 270.
		await turn(es.lv_rotate_cw);
		expect(served.puts[1].body.orientation).toBe(90);
		await vi.waitFor(() => expect(notice()).not.toBeNull());
		expect(notice()!.textContent).toContain(es.lv_upside_down);
		// It holds no capture.
		expect(captureButton().disabled).toBe(false);
		// 90 → 180: 90° from the default.
		await turn(es.lv_rotate_cw);
		await vi.waitFor(() => expect(notice()).toBeNull());
		// Back to 90 by a turn: it shows again.
		await turn(es.lv_rotate_ccw);
		await vi.waitFor(() => expect(notice()).not.toBeNull());
	});

	it('Close removes it until the next turn that leaves the camera upside down', async () => {
		render(LivePreview);
		await screenReady();
		await turn(es.lv_rotate_cw);
		await turn(es.lv_rotate_cw);
		await vi.waitFor(() => expect(notice()).not.toBeNull());
		noticeButton(es.common_close)!.click();
		await vi.waitFor(() => expect(notice()).toBeNull());
		await turn(es.lv_rotate_cw);
		await turn(es.lv_rotate_ccw);
		await vi.waitFor(() => expect(notice()).not.toBeNull());
	});

	it('its button opens the camera step', async () => {
		render(LivePreview);
		await screenReady();
		await turn(es.lv_rotate_cw);
		await turn(es.lv_rotate_cw);
		await vi.waitFor(() => expect(noticeButton(es.camwhich_open)).toBeTruthy());
		noticeButton(es.camwhich_open)!.click();
		await vi.waitFor(() => expect(document.body.textContent).toContain(es.camwhich_ask_title));
	});

	it('an older backend, with no default_orientation: no notice', async () => {
		served.devices = devices(false);
		render(LivePreview);
		await screenReady();
		await turn(es.lv_rotate_cw);
		await turn(es.lv_rotate_cw);
		await turn(es.lv_rotate_cw);
		await turn(es.lv_rotate_cw);
		expect(served.puts.map((p) => p.body.orientation)).toEqual([0, 90, 180, 270]);
		expect(notice()).toBeNull();
	});

	it('without confirmed pages: no notice', async () => {
		served.setup = { needs_setup: false, reasons: [], confirmed_pair: null };
		render(LivePreview);
		await screenReady();
		await turn(es.lv_rotate_cw);
		await turn(es.lv_rotate_cw);
		expect(served.puts[1].body.orientation).toBe(90);
		expect(notice()).toBeNull();
	});
});

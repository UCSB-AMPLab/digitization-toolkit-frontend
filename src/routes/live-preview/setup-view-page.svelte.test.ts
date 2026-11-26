// NEH-351: the capture screen opened with no volume is a set-up view. The
// previews, "Check cameras" and the camera step work as with a volume;
// nothing that captures into a volume is on screen (the capture button, the
// capture key, the thumbnail strip, retake), one line says a volume must be
// chosen to capture, and no request that needs a volume is sent. Opened with
// `check=1`, the camera check opens on arrival. The capture gate still
// serialises the dialogs' test captures, which need no volume.
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

const served = {
	paths: [] as string[],
	setup: { needs_setup: false, reasons: [], confirmed_pair: null } as Record<string, unknown>,
	testCaptures: [] as string[]
};

const DEVICES = [0, 1].map((index) => ({
	index,
	model: 'Canon PowerShot A2500',
	hardware_id: `hw${index}`,
	calibrated: false
}));

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		served.paths.push(path);
		if (path.endsWith('/cameras/capabilities'))
			return json({ backend: 'chdk', live_preview: true, continuous_preview: false });
		if (path.endsWith('/cameras/setup')) return json(served.setup);
		if (path.endsWith('/cameras/devices')) return json(DEVICES);
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (path.includes('/cameras/test-capture/')) {
			served.testCaptures.push(path);
			return new Promise<Response>(() => {});
		}
		return json([]);
	});
}

// Requests that name or need a volume or a project.
const VOLUME_PATHS = [
	/\/records\//,
	/\/records$/,
	/\/projects\//,
	/\/collections\//,
	/\/imports\/digitisation-lists/,
	/\/cameras\/capture/
];

function words(el: Element): string {
	const copy = el.cloneNode(true) as HTMLElement;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return copy.textContent?.trim() ?? '';
}
const buttonNamed = (name: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('button')].find(
		(b) => words(b) === name || b.getAttribute('aria-label') === name
	);
const press = () => {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
	window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
};
const checkOpen = () => document.querySelector('[data-camera-check]') !== null;

beforeEach(() => {
	locale.set('es');
	current.url = 'http://localhost/live-preview';
	served.paths = [];
	served.setup = { needs_setup: false, reasons: [], confirmed_pair: null };
	served.testCaptures = [];
	authStore.setSession({
		id: 1,
		username: 'operator',
		email: null,
		role: 'operator',
		is_active: true
	});
	recordFocusActivity(1, Date.now() + 60 * 60 * 1000);
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('the capture screen with no volume (NEH-351)', () => {
	it('shows the set-up view: the line about the volume, no capture button, no strip, no review button', async () => {
		render(LivePreview);
		await vi.waitFor(() => expect(document.body.textContent).toContain(es.lv_setup_no_volume));
		// The previews' panel is there, with the controls of the cameras.
		expect(document.querySelector('.camera-viewport')).not.toBeNull();
		expect(buttonNamed(es.camcheck_open)).toBeTruthy();
		expect(buttonNamed(es.tb_back)).toBeTruthy();
		expect(document.querySelector('button.capture-btn')).toBeNull();
		expect(document.querySelector('.thumbnail-strip')).toBeNull();
		expect(buttonNamed(es.tb_go_to_review)).toBeUndefined();
		expect(buttonNamed(es.lv_retake_last(false))).toBeUndefined();
	});

	it('sends no request that needs a volume, and the capture key sends no capture', async () => {
		render(LivePreview);
		await vi.waitFor(() =>
			expect(served.paths.some((p) => p.endsWith('/cameras/devices'))).toBe(true)
		);
		await vi.waitFor(() =>
			expect(served.paths.some((p) => p.endsWith('/cameras/setup'))).toBe(true)
		);
		await vi.waitFor(() => expect(document.body.textContent).toContain(es.lv_setup_no_volume));
		press();
		// On to a later point: the camera check open and its test captures sent.
		await vi.waitFor(() => expect(buttonNamed(es.camcheck_open)?.disabled).toBe(false));
		buttonNamed(es.camcheck_open)!.click();
		await vi.waitFor(() => expect(buttonNamed(es.camcheck_take)?.disabled).toBe(false));
		buttonNamed(es.camcheck_take)!.click();
		await vi.waitFor(() => expect(served.testCaptures.length).toBeGreaterThan(0));
		const sent = served.paths.filter((p) => VOLUME_PATHS.some((re) => re.test(p)));
		expect(sent).toEqual([]);
	});

	it('"Check cameras" opens the camera check, whose test captures are sent', async () => {
		render(LivePreview);
		await vi.waitFor(() => expect(buttonNamed(es.camcheck_open)?.disabled).toBe(false));
		buttonNamed(es.camcheck_open)!.click();
		await vi.waitFor(() => expect(checkOpen()).toBe(true));
		await vi.waitFor(() => expect(buttonNamed(es.camcheck_take)?.disabled).toBe(false));
		buttonNamed(es.camcheck_take)!.click();
		await vi.waitFor(() => expect(served.testCaptures.length).toBeGreaterThan(0));
	});

	it('opened with check=1, the camera check opens on arrival', async () => {
		current.url = 'http://localhost/live-preview?check=1';
		render(LivePreview);
		await vi.waitFor(() => expect(checkOpen()).toBe(true));
		expect(document.body.textContent).toContain(es.camcheck_title);
	});

	it('when the cameras need set-up, the camera step opens over the set-up view', async () => {
		served.setup = {
			needs_setup: true,
			reasons: [{ code: 'role_unconfirmed', message: '', hardware_ids: ['hw0', 'hw1'] }],
			confirmed_pair: null
		};
		render(LivePreview);
		await vi.waitFor(() => expect(document.body.textContent).toContain(es.camwhich_ask_title));
		const sent = served.paths.filter((p) => VOLUME_PATHS.some((re) => re.test(p)));
		expect(sent).toEqual([]);
	});

	it('with a volume, nothing of the set-up view shows', async () => {
		current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
		render(LivePreview);
		await vi.waitFor(() => expect(document.querySelector('button.capture-btn')).not.toBeNull());
		expect(document.querySelector('.thumbnail-strip')).not.toBeNull();
		expect(document.body.textContent).not.toContain(es.lv_setup_no_volume);
	});
});

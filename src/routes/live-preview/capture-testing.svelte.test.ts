// The capture screen for the testing account (NEH-391): it opens; it sends
// nothing the backend refuses it, on mount, on a timer, after a capture or
// in the camera check; it shows no control that saves the camera set-up
// and no recapture-turn, review or digitisation-list element; a set-up the
// cameras still need blocks it with a note in place of "Which camera is
// this?"; a capture sends the operator's body; and each refusal shows its
// own message. The operator keeps every control (which-camera-page and the
// other page tests assert the rest of the operator's screen).
//
// Version: 0.1.1
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

const current = vi.hoisted(() => ({ url: '' }));
const nav = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: nav.goto }));
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
import { resetUnit } from '$lib/unit-mode';
import { json, recordRequests, refusal, TESTING_UNIT, TESTING_USER, type Recorder } from '$lib/test-support/testing-routes';
import '../../app.css';
import LivePreview from './+page.svelte';

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle(n = 5) {
	for (let i = 0; i < n; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 20));
	}
}

const NOT_NEEDED = { needs_setup: false, reasons: [], confirmed_pair: { left: 'a', right: 'b' } };
const NEEDED = { needs_setup: true, reasons: [{ code: 'role_unconfirmed', message: 'English', hardware_ids: ['b'] }], confirmed_pair: null };
const CAPS = { backend: 'gphoto2', live_preview: true, focus_control: true, live_controls: true, zoom: true,
	autofocus_calibration: true, dslr_settings: false, continuous_preview: true, zoom_steps: true, image_formats: ['JPEG', 'RAW+JPEG'] };
const row = (index: number, hardware_id: string, role: string) => ({ index, hardware_id, model: 'Canon PowerShot A2500', calibrated: false,
	role, role_confirmed: true, role_guess: null, has_aperture_control: true, zoom_step: 0, zoom_steps: 5 });

let rec: Recorder;
let captureAnswer: () => Response;

function serve(setup: object = NOT_NEEDED) {
	rec = recordRequests({
		'GET /system/unit': TESTING_UNIT,
		'GET /cameras/setup': setup,
		'GET /cameras/capabilities': CAPS,
		'GET /cameras/devices': [row(0, 'a', 'left'), row(1, 'b', 'right')],
		'GET /cameras/preview/{camera_index}': () => new Response(null, { status: 404 }),
		'GET /cameras/dslr/{camera_index}/settings': {},
		'GET /projects/{project_id}': { id: 2, name: 'Practice', testing: true, capture_format: 'JPEG' },
		'GET /collections/{collection_id}': { id: 9, name: 'Tomo practice', project_id: 2, created_at: '2026-11-01T00:00:00',
			filename_stem: 'testing-000009', testing: true, testing_expires_at: '2026-12-20T00:00:00Z', custom_attributes: null },
		'GET /records/': [],
		'POST /cameras/capture/dual': () => captureAnswer(),
		'POST /cameras/capture': () => captureAnswer(),
		'POST /cameras/test-capture/{camera_index}': () => new Response(new Blob(['jpeg']), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
	} as never);
}

const captureButton = () => document.querySelector('.capture-btn') as HTMLButtonElement | null;
const text = () => document.body.textContent ?? '';
function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => nameOf(b) === name) ?? null;

beforeEach(() => {
	localStorage.clear();
	clearChord();
	locale.set('en');
	resetUnit();
	nav.goto.mockReset();
	captureAnswer = () => json({ success: true, record_id: 42, image_ids: [] });
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	authStore.setSession(TESTING_USER, { signIn: true });
	recordFocusActivity(TESTING_USER.id, Date.now());
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	localStorage.clear();
});

describe('capture screen, testing account', () => {
	it('opens, carries the Testing marker, and requests nothing refused while it polls', async () => {
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(nav.goto).not.toHaveBeenCalledWith('/dashboard');
		expect(document.querySelector('.topbar .testing-badge')?.textContent?.trim()).toBe('Testing');
		// The preview polls every 2 s.
		await new Promise((r) => realSetTimeout(r, 2500));
		expect(rec.to('GET /cameras/preview/{camera_index}').length).toBeGreaterThan(1);
		expect(rec.refusedList()).toEqual([]);
	});

	it('shows no control that saves the camera set-up, and no review button', async () => {
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		button(en.cam_panel_expand_aria)!.click();
		await expect.poll(() => button(en.cam_histogram)).not.toBeNull();
		await settle();
		for (const name of [en.cam_reconnect, en.cam_section_basic, en.cam_section_focus, en.cam_section_settings,
			en.lv_rotate_ccw, en.lv_rotate_cw, en.cam_rotate_ccw, en.cam_rotate_cw, en.tb_go_to_review]) {
			expect(button(name), name).toBeNull();
		}
		expect(button(en.cam_histogram)).not.toBeNull();
		expect(document.querySelector('.turn-unlock')).toBeNull();
		expect(text()).not.toContain(en.block_title);
	});

	it('captures with the operator\'s body, the project\'s name as the API gives it, and nothing refused after', async () => {
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		captureButton()!.click();
		await expect.poll(() => rec.to('POST /cameras/capture/dual').length + rec.to('POST /cameras/capture').length).toBe(1);
		const body = [...rec.to('POST /cameras/capture/dual'), ...rec.to('POST /cameras/capture')][0].body as { [k: string]: unknown };
		expect(body.project_name).toBe('Practice');
		expect(body.collection_id).toBe(9);
		expect('capture_format' in body).toBe(false);
		await settle();
		expect(rec.to('GET /records/').length).toBeGreaterThan(1);
		expect(rec.refusedList()).toEqual([]);
	});

	const cases: [string, () => Response, string][] = [
		['testing_reserve', () => refusal(507, 'testing_reserve'), en.testing_err_reserve],
		['not_found', () => refusal(404, 'not_found'), en.testing_err_not_found],
		['anything else', () => json({ detail: 'Backend text that is never shown.' }, 500), en.lv_capture_error]
	];
	for (const [label, answer, message] of cases) {
		it(`shows its own message when a capture is refused for ${label}`, async () => {
			serve();
			captureAnswer = answer;
			render(LivePreview);
			await expect.poll(() => captureButton()?.disabled).toBe(false);
			captureButton()!.click();
			await expect.poll(() => text()).toContain(message);
			expect(text()).not.toContain('Backend text');
			await settle();
			expect(rec.refusedList()).toEqual([]);
		});
	}

	it('blocks capture with a note when the cameras need set-up, without "Which camera is this?"', async () => {
		serve(NEEDED);
		render(LivePreview);
		await expect.poll(() => text()).toContain(en.testing_cameras_not_set_up);
		expect(document.querySelector('[data-which-camera]')).toBeNull();
		expect(captureButton()).toBeNull();
		expect(button(en.camwhich_leave)).not.toBeNull();
		await settle();
		expect(rec.refusedList()).toEqual([]);
	});

	it('the camera check takes test captures and offers no Turn, zoom or change of roles', async () => {
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		button(en.camcheck_open)!.click();
		await expect.poll(() => document.querySelector('[data-camera-check]')).not.toBeNull();
		await settle();
		expect(document.querySelectorAll('[data-camera-check] [data-turn]')).toHaveLength(0);
		expect(text()).not.toContain(en.camcheck_zoom_both);
		expect(text()).not.toContain(en.camcheck_zoom_each);
		(document.querySelector('[data-camera-check] [data-chip="left"]') as HTMLButtonElement).click();
		await expect.poll(() => text()).toContain(en.camcheck_details_title);
		expect(button(en.camwhich_open)).toBeNull();
		button(en.common_close)?.click();
		await settle();
		button(en.camcheck_take)!.click();
		await expect.poll(() => rec.to('POST /cameras/test-capture/{camera_index}').length).toBeGreaterThan(0);
		await settle();
		expect(rec.refusedList()).toEqual([]);
	});
});

describe('capture screen, operator, unchanged', () => {
	it('keeps the set-up controls and the review button, and reads the lists and the retake summary', async () => {
		authStore.setSession({ id: 3, username: 'operator', email: null, role: 'operator', is_active: true }, { signIn: true });
		recordFocusActivity(3, Date.now());
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		button(en.cam_panel_expand_aria)!.click();
		await expect.poll(() => button(en.cam_histogram)).not.toBeNull();
		await settle();
		for (const name of [en.cam_reconnect, en.cam_section_basic, en.cam_section_focus, en.tb_go_to_review]) expect(button(name), name).not.toBeNull();
		expect(rec.to('GET /imports/digitisation-lists').length).toBe(1);
		expect(rec.to('GET /records/to-retake/summary').length).toBeGreaterThan(0);
		expect(document.querySelector('.topbar .testing-badge')).toBeNull();
	});
});

describe('capture screen, operator: each control the testing account does not get', () => {
	beforeEach(() => {
		authStore.setSession({ id: 3, username: 'operator', email: null, role: 'operator', is_active: true }, { signIn: true });
		recordFocusActivity(3, Date.now());
	});

	it('the panel: reconnect, Basic with its rotation, Focus, Colour and exposure', async () => {
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		button(en.cam_panel_expand_aria)!.click();
		await expect.poll(() => button(en.cam_reconnect)).not.toBeNull();
		for (const name of [en.cam_section_basic, en.cam_section_focus, en.cam_section_settings]) expect(button(name), name).not.toBeNull();
		button(en.cam_reconnect)!.click();
		await expect.poll(() => rec.requests.filter((r) => r.method === 'POST' && r.path === '/cameras/rescan').length).toBe(1);
		// Basic is open by default.
		await expect.poll(() => button(en.cam_rotate_cw)).not.toBeNull();
		button(en.cam_rotate_cw)!.click();
		await expect.poll(() => rec.requests.filter((r) => r.method === 'PUT' && /\/cameras\/\d\/orientation$/.test(r.path)).length).toBeGreaterThan(0);
	});

	it('the viewport rotation', async () => {
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		expect(button(en.lv_rotate_ccw)).not.toBeNull();
		button(en.lv_rotate_cw)!.click();
		await expect.poll(() => rec.requests.filter((r) => r.method === 'PUT' && /\/cameras\/\d\/orientation$/.test(r.path)).length).toBeGreaterThan(0);
	});

	it('the camera check: Turn, the zoom steps and "which camera is which"', async () => {
		serve();
		render(LivePreview);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		button(en.camcheck_open)!.click();
		await expect.poll(() => document.querySelector('[data-camera-check]')).not.toBeNull();
		await settle();
		expect(text()).toContain(en.camcheck_zoom_both);
		button(en.camcheck_take)!.click();
		await expect.poll(() => document.querySelectorAll('[data-camera-check] [data-turn]').length).toBeGreaterThan(0);
		await expect.poll(() => (document.querySelector('[data-camera-check] [data-turn]') as HTMLButtonElement).disabled).toBe(false);
		(document.querySelector('[data-camera-check] [data-turn]') as HTMLButtonElement).click();
		await expect.poll(() => rec.requests.filter((r) => r.method === 'PUT' && /\/cameras\/\d\/orientation$/.test(r.path)).length).toBeGreaterThan(0);
		(document.querySelector('[data-camera-check] [data-chip="left"]') as HTMLButtonElement).click();
		await expect.poll(() => button(en.camwhich_open)?.disabled).toBe(false);
		button(en.camwhich_open)!.click();
		await expect.poll(() => document.querySelector('[data-which-camera]')).not.toBeNull();
	});
});

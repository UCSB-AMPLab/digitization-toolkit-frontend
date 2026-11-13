// NEH-343: "Which camera is this?" on the capture screen. The page asks GET
// /cameras/setup once it has its devices, after "Reconnect cameras", when
// the camera check opens, when the tab comes back into view, and when a
// device listing shows other bodies than before; never on a timer. When the
// backend says set-up is needed the step opens by itself over the screen,
// nothing dismisses it, and the capture button and the capture key take no
// capture until the roles are saved. A backend without the route (404)
// changes nothing. From the camera check's details the step opens by hand,
// can be cancelled, and goes back to the check.
//
// Version: 0.3.3
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

type Row = { index: number; hardware_id: string; role?: string | null; role_confirmed?: boolean; orientation?: number | null };
const NOT_NEEDED = { needs_setup: false, reasons: [], confirmed_pair: { left: 'a', right: 'b' } };
const needed = (code: string) => ({ needs_setup: true, reasons: [{ code, message: 'English', hardware_ids: ['b'] }], confirmed_pair: null });

let setupAnswers: (() => Response | Promise<Response>)[];
let setupCalls: number;
let roleAnswers: (() => Response)[];
let rolePuts: unknown[];
let deviceLists: Row[][];
let captures: string[];
let captureBodies: Record<string, unknown>[];

const row = (index: number, hardware_id: string, over: Partial<Row> = {}) => ({
	index,
	hardware_id,
	model: 'Canon PowerShot A2500',
	calibrated: false,
	role: null,
	role_confirmed: false,
	role_guess: null,
	...over
});

function serve() {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const path = new URL(String(input), 'http://localhost').pathname;
		const method = (init as RequestInit | undefined)?.method ?? 'GET';
		if (path.endsWith('/cameras/capabilities')) {
			return json({ backend: 'gphoto2', live_preview: true, focus_control: false, live_controls: false, zoom: false, autofocus_calibration: false, dslr_settings: false, continuous_preview: false, zoom_steps: false });
		}
		if (path.endsWith('/cameras/setup')) {
			setupCalls += 1;
			const next = setupAnswers.length > 1 ? setupAnswers.shift()! : setupAnswers[0];
			return next();
		}
		if (path.endsWith('/cameras/roles') && method === 'PUT') {
			rolePuts.push(JSON.parse(String((init as RequestInit).body)));
			return (roleAnswers.shift() ?? (() => json({ devices: [], setup: NOT_NEEDED })))();
		}
		if (path.includes('/cameras/preview/')) return new Response(null, { status: 404 });
		if (path.endsWith('/cameras/devices') || path.endsWith('/cameras/rescan')) {
			const list = deviceLists.length > 1 ? deviceLists.shift()! : deviceLists[0];
			return json(list);
		}
		if (/\/cameras\/\d\/orientation$/.test(path)) return json({});
		if (path.endsWith('/records/to-retake/summary')) return json({ pendingRecords: 0, volumes: [], turn: { state: 'free', unlockedBy: null } });
		if (path.endsWith('/collections/9')) {
			return json({ id: 9, name: 'Tomo 6', project_id: 2, created_at: '2026-01-01T00:00:00', filename_stem: 'co-ahr-6', custom_attributes: null });
		}
		if (path.endsWith('/projects/2')) return json({ id: 2, name: 'Rionegro' });
		if (path.endsWith('/records')) return json([]);
		if (path.endsWith('/cameras/capture/dual') || path.endsWith('/cameras/capture')) {
			captures.push(path);
			captureBodies.push(JSON.parse(String((init as RequestInit).body)));
			return json({ success: true, record_id: 42, image_ids: [] });
		}
		return json([]);
	});
}

function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}

const buttonIn = (root: ParentNode | null, name: string) =>
	root ? ([...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => nameOf(b) === name) ?? null) : null;
const step = () => document.querySelector('[data-which-camera]') as HTMLElement | null;
const check = () => document.querySelector('[data-camera-check]') as HTMLElement | null;
const openCheck = () => buttonIn(document.querySelector('.topbar'), en.camcheck_open);
const captureButton = () => document.querySelector('.capture-btn') as HTMLButtonElement | null;
const card = (index: number) => document.querySelector(`[data-card="${index}"]`) as HTMLElement | null;

// On the focused element, as a real key press.
function press(key: string, code = key) {
	const target = document.activeElement ?? document.body;
	target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
	target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
}

beforeEach(() => {
	setupAnswers = [() => json(NOT_NEEDED)];
	setupCalls = 0;
	roleAnswers = [];
	rolePuts = [];
	captures = [];
	captureBodies = [];
	nav.goto.mockReset();
	deviceLists = [[row(0, 'a', { role: 'left', role_confirmed: true }), row(1, 'b', { role: 'right', role_confirmed: true })]];
	localStorage.clear();
	clearChord();
	locale.set('en');
	// No focus check over the screen.
	recordFocusActivity(USER, Date.now());
	current.url = 'http://localhost/live-preview?projectId=2&collectionId=9';
	authStore.setSession({ id: USER, username: 'operator', email: null, role: 'operator', is_active: true }, { signIn: true });
	serve();
});

afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	localStorage.clear();
});

describe('capture screen: a backend without /cameras/setup', () => {
	it('a 404 changes nothing: no step, and the capture key captures', async () => {
		setupAnswers = [() => json({ detail: 'Not Found' }, 404)];
		render(LivePreview);
		await expect.poll(() => setupCalls).toBe(2);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		await settle();
		expect(step()).toBeNull();
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
	});

	it('a failed read changes nothing either', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		setupAnswers = [() => json({ detail: 'boom' }, 500)];
		render(LivePreview);
		await expect.poll(() => setupCalls).toBe(2);
		await settle();
		expect(step()).toBeNull();
		expect(captureButton()?.disabled).toBe(false);
	});
});

describe('capture screen: set-up needed', () => {
	it('the step opens by itself; the capture button is disabled and the capture key takes no capture', async () => {
		setupAnswers = [() => json(needed('role_unconfirmed'))];
		render(LivePreview);
		await expect.poll(() => step()).not.toBeNull();
		expect(step()?.textContent).toContain(en.camwhich_ask_title);
		expect(captureButton()?.disabled).toBe(true);
		press(' ', 'Space');
		await settle();
		expect(captures.length).toBe(0);
	});

	it('nothing dismisses it: no Cancel, no way back, Escape and the backdrop do nothing', async () => {
		setupAnswers = [() => json(needed('role_conflict'))];
		render(LivePreview);
		await expect.poll(() => step()).not.toBeNull();
		expect(buttonIn(step(), en.common_cancel)).toBeNull();
		expect(buttonIn(step(), en.camcheck_back)).toBeNull();
		press('Escape');
		step()!.click();
		await settle();
		expect(step()).not.toBeNull();
	});

	it('Confirm saves the roles, the step closes, and the capture screen captures again', async () => {
		setupAnswers = [() => json(needed('role_unconfirmed'))];
		roleAnswers = [() => json({ devices: [row(0, 'a', { role: 'right' }), row(1, 'b', { role: 'left' })], setup: NOT_NEEDED })];
		render(LivePreview);
		await expect.poll(() => card(1)).not.toBeNull();
		(card(1)!.querySelector('button[data-pick]') as HTMLButtonElement).click();
		await settle();
		buttonIn(step(), en.camwhich_confirm)!.click();
		await expect.poll(() => step()).toBeNull();
		expect(rolePuts).toEqual([{ left: { hardware_id: 'b' }, right: { hardware_id: 'a' } }]);
		expect(check()).toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
	});

	it('a read started before a save that answers after it does not reopen the step', async () => {
		let release!: () => void;
		const held = new Promise<void>((r) => (release = r));
		setupAnswers = [
			() => json(needed('role_unconfirmed')),
			() => json(needed('role_unconfirmed')),
			async () => {
				await held;
				return json(needed('role_unconfirmed'));
			},
			() => json(NOT_NEEDED)
		];
		roleAnswers = [() => json({ devices: [row(0, 'a', { role: 'right', role_confirmed: true }), row(1, 'b', { role: 'left', role_confirmed: true })], setup: NOT_NEEDED })];
		render(LivePreview);
		await expect.poll(() => card(1)).not.toBeNull();
		await expect.poll(() => setupCalls).toBe(2);
		// The tab comes back: a read that is still pending when the save answers.
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => setupCalls).toBe(3);
		(card(1)!.querySelector('button[data-pick]') as HTMLButtonElement).click();
		await settle();
		buttonIn(step(), en.camwhich_confirm)!.click();
		await expect.poll(() => step()).toBeNull();
		release();
		await settle();
		await settle();
		expect(step()).toBeNull();
		expect(captureButton()?.disabled).toBe(false);
	});

	it('a 503 on saving says so and capture stays blocked', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		setupAnswers = [() => json(needed('role_unconfirmed'))];
		roleAnswers = [() => json({ detail: 'Storage unavailable' }, 503)];
		render(LivePreview);
		await expect.poll(() => card(0)).not.toBeNull();
		(card(0)!.querySelector('button[data-pick]') as HTMLButtonElement).click();
		await settle();
		buttonIn(step(), en.camwhich_confirm)!.click();
		await expect.poll(() => step()?.textContent ?? '').toContain(en.camwhich_err_unavailable);
		expect(captureButton()?.disabled).toBe(true);
		press(' ', 'Space');
		await settle();
		expect(captures.length).toBe(0);
	});

	it('a 409 camera not connected reads the set-up again', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		setupAnswers = [() => json(needed('role_unconfirmed'))];
		roleAnswers = [() => json({ detail: { code: 'camera_not_connected', message: 'English' } }, 409)];
		render(LivePreview);
		await expect.poll(() => card(0)).not.toBeNull();
		const before = setupCalls;
		(card(0)!.querySelector('button[data-pick]') as HTMLButtonElement).click();
		await settle();
		buttonIn(step(), en.camwhich_confirm)!.click();
		await expect.poll(() => step()?.textContent ?? '').toContain(en.camwhich_err_not_connected);
		expect(setupCalls).toBe(before + 1);
	});

	it('a camera Captua cannot identify keeps capture blocked, with nothing to confirm', async () => {
		setupAnswers = [() => json(needed('identity_missing'))];
		render(LivePreview);
		await expect.poll(() => step()?.textContent ?? '').toContain(en.camwhich_identity_title);
		expect(buttonIn(step(), en.camwhich_confirm)).toBeNull();
		expect(captureButton()?.disabled).toBe(true);
	});

	it('one camera connected keeps capture blocked', async () => {
		deviceLists = [[row(0, 'a')]];
		setupAnswers = [() => json(needed('role_unconfirmed'))];
		render(LivePreview);
		await expect.poll(() => step()?.textContent ?? '').toContain(en.camwhich_one_title);
		expect(captureButton()?.disabled).toBe(true);
	});
});

describe('capture screen: when the page asks', () => {
	it('on loading, after the devices, on visibility, when the check opens, after a rescan and after a listing of other bodies; never on a timer', async () => {
		// The first listing lacks camera 1, so the panel reads again after a second.
		deviceLists = [[row(0, 'a')], [row(0, 'a'), row(1, 'b')]];
		render(LivePreview);
		// On loading, and once the page has its first listing.
		await expect.poll(() => setupCalls).toBe(2);
		// The second listing shows another set of bodies.
		await expect.poll(() => setupCalls, { timeout: 3000 }).toBe(3);

		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => setupCalls).toBe(4);

		await expect.poll(() => openCheck()?.disabled).toBe(false);
		openCheck()!.click();
		await expect.poll(() => setupCalls).toBe(5);
		buttonIn(check(), en.camcheck_back)!.click();
		await expect.poll(() => check()).toBeNull();

		(document.querySelector(`button[aria-label="${en.cam_panel_expand_aria}"]`) as HTMLButtonElement).click();
		await settle();
		buttonIn(document, en.cam_reconnect)!.click();
		await expect.poll(() => setupCalls).toBe(6);

		// Nothing more by itself.
		await new Promise((r) => realSetTimeout(r, 2500));
		expect(setupCalls).toBe(6);
	});

	it('a listing of the same bodies does not ask again', async () => {
		deviceLists = [[row(0, 'a'), row(1, 'A2500_idx1')], [row(0, 'a'), row(1, 'A2500_idx1')]];
		render(LivePreview);
		await expect.poll(() => setupCalls).toBe(2);
		await new Promise((r) => realSetTimeout(r, 1500));
		expect(setupCalls).toBe(2);
	});

	it('needed after the tab comes back: the step opens over the camera check, which waits under it', async () => {
		setupAnswers = [() => json(NOT_NEEDED), () => json(NOT_NEEDED), () => json(NOT_NEEDED), () => json(needed('pair_changed'))];
		render(LivePreview);
		await expect.poll(() => setupCalls).toBe(2);
		await expect.poll(() => openCheck()?.disabled).toBe(false);
		openCheck()!.click();
		await expect.poll(() => setupCalls).toBe(3);
		expect(step()).toBeNull();
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => step()).not.toBeNull();
		expect(step()?.textContent).toContain(en.camwhich_lead_pair_changed);
		expect(check()).not.toBeNull();
		press('Escape');
		await settle();
		expect(step()).not.toBeNull();
		expect(check()).not.toBeNull();
	});
});

describe('the camera check: "Change which camera is which"', () => {
	async function openByHand() {
		render(LivePreview);
		await expect.poll(() => openCheck()?.disabled).toBe(false);
		openCheck()!.click();
		await expect.poll(() => check()).not.toBeNull();
		(check()!.querySelector('[data-chip="left"]') as HTMLButtonElement).click();
		await settle();
		const details = document.querySelector('[role="dialog"][aria-labelledby="cd-title"]');
		buttonIn(details, en.camwhich_open)!.click();
		await expect.poll(() => step()).not.toBeNull();
	}

	it('opens the step by hand, which Cancel closes, back to the check', async () => {
		await openByHand();
		expect(step()?.textContent).not.toContain(en.camwhich_needed);
		expect(buttonIn(step(), en.camwhich_leave)).toBeNull();
		buttonIn(step(), en.common_cancel)!.click();
		await expect.poll(() => step()).toBeNull();
		expect(check()).not.toBeNull();
		expect(document.querySelector('[role="dialog"][aria-labelledby="cd-title"]')).toBeNull();
	});

	it('Escape cancels it too, and leaves the check open', async () => {
		await openByHand();
		press('Escape');
		await expect.poll(() => step()).toBeNull();
		expect(check()).not.toBeNull();
	});

	it('a save goes back to the check', async () => {
		await openByHand();
		await expect.poll(() => card(0)).not.toBeNull();
		(card(0)!.querySelector('button[data-pick]') as HTMLButtonElement).click();
		await settle();
		buttonIn(step(), en.camwhich_confirm)!.click();
		await expect.poll(() => step()).toBeNull();
		expect(rolePuts).toEqual([{ left: { hardware_id: 'a' }, right: { hardware_id: 'b' } }]);
		expect(check()).not.toBeNull();
	});
});

describe('capture screen: "Leave the capture screen" while set-up is needed', () => {
	it("goes where the top bar's back button goes, and capture is never enabled meanwhile; coming back shows the step again", async () => {
		setupAnswers = [() => json(needed('identity_missing'))];
		const first = render(LivePreview);
		await expect.poll(() => step()).not.toBeNull();
		const button = captureButton()!;
		let enabled = false;
		const watch = new MutationObserver(() => {
			if (!button.disabled) enabled = true;
		});
		watch.observe(button, { attributes: true, attributeFilter: ['disabled'] });
		expect(button.disabled).toBe(true);
		press(' ', 'Space');

		buttonIn(step(), en.camwhich_leave)!.click();
		await settle();
		expect(nav.goto).toHaveBeenCalledWith('/dashboard/projects/2/collections/9');
		nav.goto.mockClear();
		first.unmount();
		watch.disconnect();
		expect(enabled).toBe(false);
		expect(captures.length).toBe(0);

		render(LivePreview);
		await expect.poll(() => step()?.textContent ?? '').toContain(en.camwhich_identity_title);
		// The same target as the top bar's back button.
		(document.querySelector(`button[aria-label="${en.tb_back}"]`) as HTMLButtonElement).click();
		expect(nav.goto).toHaveBeenCalledWith('/dashboard/projects/2/collections/9');
	});
});

describe('capture screen: the saved roles decide left and right', () => {
	const swapControl = () => document.querySelector(`button[aria-label="${en.lv_swap_orientation}"]`) as HTMLButtonElement | null;
	const viewportDegrees = () => [...document.querySelectorAll('.feed-rotate-deg')].map((el) => el.textContent?.trim());

	it('the body confirmed as the left page is on the left and in the captures; no swap control', async () => {
		deviceLists = [[row(0, 'a', { role: 'right', role_confirmed: true, orientation: 90 }), row(1, 'b', { role: 'left', role_confirmed: true, orientation: 180 })]];
		render(LivePreview);
		await expect.poll(() => viewportDegrees()).toEqual(['180°', '90°']);
		expect(swapControl()).toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		press(' ', 'Space');
		await expect.poll(() => captureBodies.length).toBe(1);
		expect(captureBodies[0].left_camera_index).toBe(1);
	});

	it('after a confirm that makes camera 2 the left page, the next capture and the panes follow', async () => {
		deviceLists = [[row(0, 'a', { orientation: 90 }), row(1, 'b', { orientation: 180 })]];
		setupAnswers = [() => json(needed('role_unconfirmed'))];
		roleAnswers = [() => json({ devices: [row(0, 'a', { role: 'right', role_confirmed: true, orientation: 90 }), row(1, 'b', { role: 'left', role_confirmed: true, orientation: 180 })], setup: NOT_NEEDED })];
		render(LivePreview);
		await expect.poll(() => card(1)).not.toBeNull();
		expect(viewportDegrees()).toEqual(['90°', '180°']);
		(card(1)!.querySelector('button[data-pick]') as HTMLButtonElement).click();
		await settle();
		buttonIn(step(), en.camwhich_confirm)!.click();
		await expect.poll(() => step()).toBeNull();
		await expect.poll(() => viewportDegrees()).toEqual(['180°', '90°']);
		expect(swapControl()).toBeNull();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		press(' ', 'Space');
		await expect.poll(() => captureBodies.length).toBe(1);
		expect(captureBodies[0].left_camera_index).toBe(1);
	});

	it('the camera check then has the left page camera on its left', async () => {
		deviceLists = [[row(0, 'a', { role: 'right', role_confirmed: true }), row(1, 'b', { role: 'left', role_confirmed: true })]];
		render(LivePreview);
		await expect.poll(() => setupCalls).toBe(2);
		await settle();
		expect(swapControl()).toBeNull();
		await expect.poll(() => openCheck()?.disabled).toBe(false);
		openCheck()!.click();
		await expect.poll(() => check()).not.toBeNull();
		// "Turn" on the check's left pane saves camera 2's orientation.
		const orientationPuts = () =>
			vi.mocked(globalThis.fetch).mock.calls.map((c) => new URL(String(c[0]), 'http://localhost').pathname).filter((p) => p.endsWith('/orientation'));
		await expect.poll(() => (check()!.querySelector('[data-frame="left"] button[data-turn]') as HTMLButtonElement | null)?.disabled).toBe(false);
		(check()!.querySelector('[data-frame="left"] button[data-turn]') as HTMLButtonElement).click();
		await expect.poll(() => orientationPuts().length).toBe(1);
		expect(orientationPuts()[0].endsWith('/cameras/1/orientation')).toBe(true);
	});

	it('with a backend without /cameras/setup the swap control is there and works as before', async () => {
		setupAnswers = [() => json({ detail: 'Not Found' }, 404)];
		deviceLists = [[row(0, 'a', { orientation: 90 }), row(1, 'b', { orientation: 180 })]];
		render(LivePreview);
		await expect.poll(() => swapControl()).not.toBeNull();
		await expect.poll(() => viewportDegrees()).toEqual(['90°', '180°']);
		swapControl()!.click();
		await expect.poll(() => viewportDegrees()).toEqual(['180°', '90°']);
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		press(' ', 'Space');
		await expect.poll(() => captureBodies.length).toBe(1);
		expect(captureBodies[0].left_camera_index).toBe(1);
	});

	it('with roles that are not both confirmed the swap control stays', async () => {
		deviceLists = [[row(0, 'a', { role: 'left', role_confirmed: true }), row(1, 'b', { role: 'right', role_confirmed: false })]];
		render(LivePreview);
		await expect.poll(() => setupCalls).toBe(2);
		await settle();
		expect(swapControl()).not.toBeNull();
	});
});

describe('capture screen: capture waits for the first set-up answer', () => {
	let release!: () => void;
	function gate(answer: () => Response) {
		const held = new Promise<void>((r) => (release = r));
		setupAnswers = [async () => {
			await held;
			return answer();
		}];
	}
	// Records whether the capture button was ever enabled, from now on.
	function watchEnabled() {
		const button = captureButton()!;
		const seen = { enabled: !button.disabled };
		const watch = new MutationObserver(() => {
			if (!button.disabled) seen.enabled = true;
		});
		watch.observe(button, { attributes: true, attributeFilter: ['disabled'] });
		return { seen, stop: () => watch.disconnect() };
	}

	async function heldUntilAnswer(answer: () => Response) {
		gate(answer);
		render(LivePreview);
		await expect.poll(() => setupCalls).toBeGreaterThanOrEqual(1);
		await expect.poll(() => captureButton()).not.toBeNull();
		// The records, the volume and the devices are in; only the answer is not.
		await settle();
		await settle();
		const watcher = watchEnabled();
		expect(captureButton()!.disabled).toBe(true);
		press(' ', 'Space');
		await settle();
		expect(captures.length).toBe(0);
		// Nothing on screen says so.
		expect(step()).toBeNull();
		return watcher;
	}

	it('the capture key before the answer is ignored; after "not needed" it captures', async () => {
		const w = await heldUntilAnswer(() => json(NOT_NEEDED));
		release();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		w.stop();
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
	});

	it('a 404 is an answer: capture works', async () => {
		const w = await heldUntilAnswer(() => json({ detail: 'Not Found' }, 404));
		release();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		w.stop();
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
	});

	it('a 500 ends the hold: capture works and the step does not open', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const w = await heldUntilAnswer(() => json({ detail: 'boom' }, 500));
		release();
		await expect.poll(() => captureButton()?.disabled).toBe(false);
		w.stop();
		expect(step()).toBeNull();
		press(' ', 'Space');
		await expect.poll(() => captures.length).toBe(1);
	});

	it('after "needed" the step opens, and capture was never enabled', async () => {
		const w = await heldUntilAnswer(() => json(needed('role_unconfirmed')));
		release();
		await expect.poll(() => step()).not.toBeNull();
		await settle();
		w.stop();
		expect(w.seen.enabled).toBe(false);
		expect(captureButton()!.disabled).toBe(true);
		expect(captures.length).toBe(0);
	});

});

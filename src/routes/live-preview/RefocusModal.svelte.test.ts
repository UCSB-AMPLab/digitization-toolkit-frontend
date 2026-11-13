// NEH-339: the focus check of a two-DSLR unit, in three stages. The operator
// sets both lenses to AF and puts a page with text under the cameras, takes a
// pair of test pictures (never saved; the pedal takes them too) and checks
// them at 1:1, then sets both lenses to MF and goes on once both read MF.
// The focus mode each camera reports is read every 3 s on the first and last
// stages, never while a test capture runs.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { camerasApi, type DSLRSettings, type TestCaptureResult } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { clearChord, writeChord } from '$lib/capture-key';
import { REQUIRE_MF_READING } from '$lib/focus-check';
import '../../app.css';
import RefocusModal from './RefocusModal.svelte';

const realSetTimeout = globalThis.setTimeout.bind(globalThis);

async function settle() {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 20));
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

async function jpeg(w: number, h: number): Promise<Blob> {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#888';
	ctx.fillRect(0, 0, w, h);
	return new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.5));
}

async function shot(w: number, h: number, focalLength: number | null = null): Promise<TestCaptureResult> {
	return { blob: await jpeg(w, h), seconds: 1.2, bytes: 1000, focalLength };
}

function failure(status: number): Error {
	return Object.assign(new Error('Capture failed'), { status });
}

// The focus mode each camera reports; tests change it to follow a lens switch.
// A camera set to 'fail' throws.
let modes: Record<number, string | undefined>;
let settingsSpy: MockInstance<typeof camerasApi.getDSLRSettings>;
let captureSpy: MockInstance<typeof camerasApi.testCapture>;

function renderModal(props: Partial<{ leftIndex: number; requireMfReading: boolean }> = {}) {
	const onClose = vi.fn();
	const screen = render(RefocusModal, { leftIndex: 0, onClose, ...props });
	return { screen, onClose };
}

const reading = (side: 'left' | 'right') =>
	document.querySelector(`[data-reading="${side}"] .rf-reading-value`)?.textContent?.trim() ?? '';
const ticked = (side: 'left' | 'right') => document.querySelector(`[data-reading="${side}"] .rf-tick`) !== null;
const pane = (side: 'left' | 'right') => document.querySelector(`[data-pane="${side}"]`) as HTMLElement | null;
const paneImg = (side: 'left' | 'right') => pane(side)?.querySelector('img') as HTMLImageElement | null;
const button = (name: string) =>
	[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
		(b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name
	) ?? null;
const heading = () => document.querySelector('[role="dialog"] h2')?.textContent?.trim();
const steps = () => [...document.querySelectorAll('[role="dialog"] ol.rf-steps li')].map((li) => li.textContent?.trim());
const lens = () => document.querySelector('[role="dialog"] svg.rf-lens');
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? '';

async function click(name: string) {
	const b = button(name);
	if (!b) throw new Error(`no button "${name}"`);
	b.click();
	await settle();
}

function press(key: string, repeat = false): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true });
	window.dispatchEvent(event);
	window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
	return event;
}

function scaleOf(img: HTMLImageElement | null): number {
	const match = img?.getAttribute('style')?.match(/scale\(([\d.]+)\)/);
	return match ? Number(match[1]) : NaN;
}

beforeEach(() => {
	locale.set('en');
	clearChord();
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
	modes = { 0: 'One Shot', 1: 'Manual' };
	settingsSpy = vi.spyOn(camerasApi, 'getDSLRSettings').mockImplementation(async (i: number) => {
		if (modes[i] === 'fail') throw new Error('not connected');
		return { focus_mode: modes[i] } as DSLRSettings;
	});
	captureSpy = vi.spyOn(camerasApi, 'testCapture');
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function toTestStage(props: Partial<{ leftIndex: number }> = {}) {
	const r = renderModal(props);
	await settle();
	await click(en.focus_next);
	return r;
}

async function toMfStage(props: Partial<{ requireMfReading: boolean }> = {}) {
	const r = renderModal(props);
	await settle();
	await click(en.focus_next);
	await click(en.focus_next);
	await settle();
	return r;
}

describe('RefocusModal: stages', () => {
	it('goes from AF to the test pictures to MF, and back, with numbered steps on each', async () => {
		renderModal();
		await settle();
		expect(heading()).toBe(en.focus_af_title);
		expect(steps()).toEqual([en.focus_af_step_light, en.focus_af_step_switch, en.focus_af_step_tick]);
		expect(lens()).not.toBeNull();

		await click(en.focus_next);
		expect(heading()).toBe(en.focus_test_title);
		expect(steps()).toEqual([en.focus_test_step_hold, en.focus_test_step_take, en.focus_test_step_zoom, en.focus_test_step_again]);
		expect(dialogText()).toContain(en.focus_test_not_saved);
		expect(lens()).toBeNull();

		await click(en.focus_next);
		expect(heading()).toBe(en.focus_mf_title);
		expect(steps()).toEqual([en.focus_mf_step_switch, en.focus_mf_step_ring, en.focus_mf_step_tick]);
		expect(lens()).not.toBeNull();

		await click(en.focus_back);
		expect(heading()).toBe(en.focus_test_title);
		await click(en.focus_back);
		expect(heading()).toBe(en.focus_af_title);
		expect(button(en.focus_back)).toBeNull();
	});

	it('the AF stage shows each camera\'s mode by side, with a tick for each camera on AF', async () => {
		renderModal({ leftIndex: 1 });
		await settle();
		// Camera 1 takes the left page here.
		expect(reading('left')).toBe(en.focus_mode_manual);
		expect(reading('right')).toBe(en.focus_mode_auto);
		expect(ticked('left')).toBe(false);
		expect(ticked('right')).toBe(true);
		// "Next" never waits for the readings.
		expect(button(en.focus_next)?.disabled).toBe(false);
	});

	it('a camera that cannot be read shows no reading, and "Next" stays enabled', async () => {
		modes[1] = 'fail';
		renderModal();
		await settle();
		expect(reading('right')).toBe(en.focus_mode_unknown);
		expect(ticked('right')).toBe(false);
		expect(button(en.focus_next)?.disabled).toBe(false);
	});
});

describe('RefocusModal: reading the focus mode', () => {
	it('reads both cameras every 3 s on the AF stage, and follows a change', async () => {
		renderModal();
		await settle();
		expect(settingsSpy.mock.calls.map((c) => c[0]).sort()).toEqual([0, 1]);

		modes[1] = 'One Shot';
		await vi.advanceTimersByTimeAsync(3000);
		await settle();
		expect(settingsSpy).toHaveBeenCalledTimes(4);
		expect(ticked('right')).toBe(true);
	});

	it('does not read on the test-pictures stage, nor while a capture runs', async () => {
		const answers = [deferred<TestCaptureResult>(), deferred<TestCaptureResult>()];
		captureSpy.mockImplementation((i: number) => answers[i].promise);
		await toTestStage();
		const before = settingsSpy.mock.calls.length;

		await click(en.focus_take);
		await vi.advanceTimersByTimeAsync(9000);
		await settle();
		expect(settingsSpy.mock.calls.length).toBe(before);
		expect(button(en.focus_back)?.disabled).toBe(true);
		expect(button(en.focus_next)?.disabled).toBe(true);

		answers[0].resolve(await shot(40, 30));
		answers[1].resolve(await shot(40, 30));
		await settle();
		await vi.advanceTimersByTimeAsync(9000);
		expect(settingsSpy.mock.calls.length).toBe(before);
	});

	it('stops reading once the dialog is closed', async () => {
		const { screen } = renderModal();
		await settle();
		screen.unmount();
		const before = settingsSpy.mock.calls.length;
		await vi.advanceTimersByTimeAsync(9000);
		await settle();
		expect(settingsSpy.mock.calls.length).toBe(before);
	});
});

describe('RefocusModal: test pictures', () => {
	it('asks both cameras at the same time, in the bounded focus-check mode, and shows them left and right', async () => {
		const answers = [deferred<TestCaptureResult>(), deferred<TestCaptureResult>()];
		captureSpy.mockImplementation((i: number) => answers[i].promise);
		await toTestStage({ leftIndex: 1 });

		await click(en.focus_take);
		// Both requests are out before either has answered.
		expect(captureSpy.mock.calls.map((c) => c[0]).sort()).toEqual([0, 1]);
		for (const call of captureSpy.mock.calls) expect(call[1]).toEqual({ focusCheck: true });

		answers[0].resolve(await shot(400, 300));
		answers[1].resolve(await shot(300, 400));
		await expect.poll(() => paneImg('left')?.naturalWidth ?? 0).toBe(300);
		await expect.poll(() => paneImg('right')?.naturalWidth ?? 0).toBe(400);
	});

	it('shows the seconds elapsed; "Take again" and the primary "Next" wait for a picture to arrive', async () => {
		const answers = [deferred<TestCaptureResult>(), deferred<TestCaptureResult>()];
		captureSpy.mockImplementation((i: number) => answers[i].promise);
		await toTestStage();
		expect(button(en.focus_next)?.classList.contains('btn-primary')).toBe(false);

		await click(en.focus_take);
		expect(dialogText()).toContain(en.focus_taking(0));
		await vi.advanceTimersByTimeAsync(2000);
		await settle();
		expect(dialogText()).toContain(en.focus_taking(2));
		// Still the first capture: no "Take again" yet, and "Next" is not the main action.
		expect(button(en.focus_take_again)).toBeNull();
		expect(button(en.focus_take)?.disabled).toBe(true);
		expect(button(en.focus_next)?.classList.contains('btn-primary')).toBe(false);

		answers[0].resolve(await shot(400, 300));
		answers[1].reject(failure(500));
		await settle();
		expect(button(en.focus_take_again)?.disabled).toBe(false);
		expect(button(en.focus_next)?.classList.contains('btn-primary')).toBe(true);
	});

	it('two failures leave "Take test pictures" as it was', async () => {
		captureSpy.mockRejectedValue(failure(500));
		await toTestStage();
		await click(en.focus_take);
		await settle();
		// The steps fold once the pair has answered, picture or not.
		expect(steps()).toHaveLength(0);
		expect(button(en.focus_steps_show)).not.toBeNull();
		expect(button(en.focus_take_again)).toBeNull();
		expect(button(en.focus_take)?.disabled).toBe(false);
		expect(button(en.focus_next)?.classList.contains('btn-primary')).toBe(false);
	});

	it('a 504 says the camera could not focus and what to try; other failures keep the general message', async () => {
		captureSpy.mockImplementation(async (i: number) => {
			throw failure(i === 0 ? 504 : 500);
		});
		await toTestStage();
		await click(en.focus_take);
		await expect.poll(() => pane('left')?.textContent ?? '').toContain(en.focus_no_focus_lead);
		const items = [...pane('left')!.querySelectorAll('.rf-pane-error ul li')].map((li) => li.textContent?.trim());
		expect(items).toEqual([en.focus_no_focus_cap, en.focus_no_focus_light, en.focus_no_focus_glass, en.focus_no_focus_page]);
		expect(pane('left')?.textContent).toContain(en.focus_no_focus_again);
		expect(pane('right')?.textContent).toContain(en.focus_test_failed(undefined));
		expect(pane('right')?.textContent).not.toContain(en.focus_no_focus_lead);
		expect(pane('right')?.querySelector('ul')).toBeNull();
	});

	it('a camera that fails shows why on its side; the other shows its picture', async () => {
		captureSpy.mockImplementation(async (i: number) => {
			if (i === 1) throw Object.assign(new Error('Camera 1 is not connected'), { status: 404 });
			return shot(400, 300);
		});
		await toTestStage();
		await click(en.focus_take);
		await expect.poll(() => paneImg('left')?.naturalWidth ?? 0).toBe(400);
		expect(paneImg('right')).toBeNull();
		expect(pane('right')?.textContent).toContain(en.focus_test_failed(en.dash_camera_capture_not_connected));
	});

	it('"Take again" takes a new pair and revokes the URLs it replaces; closing revokes the rest', async () => {
		captureSpy.mockImplementation(() => shot(400, 300));
		const created: string[] = [];
		const realCreate = URL.createObjectURL.bind(URL);
		vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
			const url = realCreate(b);
			created.push(url);
			return url;
		});
		const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
		const { screen } = await toTestStage();

		await click(en.focus_take);
		await expect.poll(() => created.length).toBe(2);
		const first = [...created];
		expect(revokeSpy).not.toHaveBeenCalled();

		await click(en.focus_take_again);
		await expect.poll(() => created.length).toBe(4);
		expect(captureSpy).toHaveBeenCalledTimes(4);
		const revoked = revokeSpy.mock.calls.map((c) => c[0]);
		expect(revoked).toEqual(expect.arrayContaining(first));
		expect(revoked).not.toContain(created[2]);

		screen.unmount();
		expect(revokeSpy.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(created));
	});

	it('opens at 1:1 on the centre, both panes together, with Fit, 1:1 and the zoom steps', async () => {
		captureSpy.mockImplementation(() => shot(3000, 2000));
		await toTestStage();
		await click(en.focus_take);
		await expect.poll(() => paneImg('left')?.naturalWidth ?? 0).toBe(3000);
		await expect.poll(() => paneImg('right')?.naturalWidth ?? 0).toBe(3000);
		await expect.poll(() => scaleOf(paneImg('left'))).toBeGreaterThan(1);
		const left = paneImg('left')!;
		const frame = pane('left')!.querySelector('.rf-frame') as HTMLElement;
		// At 1:1 one image pixel is one device pixel.
		const fitted = Math.min(frame.clientWidth / 3000, frame.clientHeight / 2000, 1) * 3000;
		expect(scaleOf(left)).toBeCloseTo(3000 / (fitted * (window.devicePixelRatio || 1)), 1);
		expect(scaleOf(paneImg('right'))).toBeCloseTo(scaleOf(left), 5);
		expect(left.getAttribute('style')).toContain('translate(0px, 0px)');

		await click(en.col_fit_screen_aria);
		expect(scaleOf(paneImg('left'))).toBe(1);
		expect(scaleOf(paneImg('right'))).toBe(1);
		await click(en.col_zoom_actual_aria);
		const oneToOne = scaleOf(paneImg('left'));
		expect(oneToOne).toBeGreaterThan(1);
		await click(en.lv_zoom_out);
		const smaller = scaleOf(paneImg('left'));
		expect(smaller).toBeLessThan(oneToOne);
		await click(en.lv_zoom_in);
		expect(scaleOf(paneImg('left'))).toBeGreaterThan(smaller);
	});

	it('dragging one pane pans both', async () => {
		captureSpy.mockImplementation(() => shot(3000, 2000));
		await toTestStage();
		await click(en.focus_take);
		await expect.poll(() => scaleOf(paneImg('left'))).toBeGreaterThan(1);
		await expect.poll(() => scaleOf(paneImg('right'))).toBeGreaterThan(1);
		const frame = pane('left')!.querySelector('.rf-frame') as HTMLElement;
		const opts = { pointerId: 5, bubbles: true, button: 0, clientX: 100, clientY: 100 };
		frame.dispatchEvent(new PointerEvent('pointerdown', opts));
		frame.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 60, clientY: 80 }));
		frame.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 60, clientY: 80 }));
		await settle();
		expect(paneImg('left')?.getAttribute('style')).not.toContain('translate(0px, 0px)');
		expect(paneImg('right')?.getAttribute('style')).not.toContain('translate(0px, 0px)');
	});

	it('the step list folds to "Show steps" once a picture exists', async () => {
		captureSpy.mockImplementation(() => shot(400, 300));
		await toTestStage();
		expect(steps()).toHaveLength(4);
		expect(button(en.focus_steps_show)).toBeNull();
		await click(en.focus_take);
		await expect.poll(() => paneImg('left')?.naturalWidth ?? 0).toBe(400);
		expect(steps()).toHaveLength(0);
		await click(en.focus_steps_show);
		expect(steps()).toHaveLength(4);
		await click(en.focus_steps_hide);
		expect(steps()).toHaveLength(0);
	});
});

describe('RefocusModal: focal length', () => {
	const focal = (side: 'left' | 'right') => pane(side)?.querySelector('.rf-focal')?.textContent?.trim() ?? null;
	const mismatch = () => document.querySelector('.rf-focal-mismatch')?.textContent?.trim() ?? null;

	it('shows each camera\'s focal length under its picture, and nothing more when they match', async () => {
		captureSpy.mockImplementation(() => shot(400, 300, 27));
		await toTestStage();
		await click(en.focus_take);
		await expect.poll(() => focal('left')).toBe(en.focus_focal(27));
		expect(focal('right')).toBe('27 mm');
		expect(mismatch()).toBeNull();
	});

	it('names both values when the two cameras are at different zoom settings', async () => {
		captureSpy.mockImplementation((i: number) => shot(400, 300, i === 0 ? 27.5 : 35));
		await toTestStage({ leftIndex: 1 });
		await click(en.focus_take);
		// Camera 1 is the left one here.
		await expect.poll(() => mismatch()).toBe(en.focus_focal_mismatch(35, 27.5));
		expect(focal('left')).toBe('35 mm');
		expect(focal('right')).toBe('27.5 mm');
	});

	it('no line, and no label, for a camera that sends no focal length', async () => {
		captureSpy.mockImplementation((i: number) => shot(400, 300, i === 0 ? 27 : null));
		await toTestStage();
		await click(en.focus_take);
		await expect.poll(() => focal('left')).toBe('27 mm');
		expect(focal('right')).toBeNull();
		expect(mismatch()).toBeNull();
	});
});

describe('RefocusModal: the pedal and the capture key', () => {
	it('on the test-pictures stage they take the pair, once per press, never while a capture runs', async () => {
		const answers = [deferred<TestCaptureResult>(), deferred<TestCaptureResult>()];
		captureSpy.mockImplementation((i: number) => answers[i].promise);
		await toTestStage();

		const event = press('b');
		await settle();
		expect(event.defaultPrevented).toBe(true);
		expect(captureSpy).toHaveBeenCalledTimes(2);
		press('b');
		press(' ', true);
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(2);

		answers[0].resolve(await shot(40, 30));
		answers[1].resolve(await shot(40, 30));
		await settle();
		press(' ');
		await settle();
		// "Take again" by the space bar.
		expect(captureSpy).toHaveBeenCalledTimes(4);
	});

	it('a held key (repeat) does not take the pair', async () => {
		captureSpy.mockImplementation(() => shot(40, 30));
		await toTestStage();
		press('b', true);
		await settle();
		expect(captureSpy).not.toHaveBeenCalled();
	});

	it('on the AF and MF stages they do nothing, not even press the focused button', async () => {
		const { onClose } = renderModal();
		await settle();
		const first = press('b');
		const second = press(' ');
		await settle();
		expect(first.defaultPrevented).toBe(true);
		expect(second.defaultPrevented).toBe(true);
		expect(heading()).toBe(en.focus_af_title);
		expect(captureSpy).not.toHaveBeenCalled();

		await click(en.focus_next);
		await click(en.focus_next);
		press('b');
		press(' ');
		await settle();
		expect(heading()).toBe(en.focus_mf_title);
		expect(captureSpy).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe('RefocusModal: manual focus', () => {
	it('MF is required by default', () => {
		expect(REQUIRE_MF_READING).toBe(true);
	});

	it('"Continue" waits until both cameras read MF, with a warning naming the one on AF', async () => {
		const { onClose } = await toMfStage();
		expect(dialogText()).toContain(en.focus_mf_warning('left'));
		expect(ticked('left')).toBe(false);
		expect(ticked('right')).toBe(true);
		expect(button(en.focus_continue)?.disabled).toBe(true);

		modes[0] = 'Manual';
		await vi.advanceTimersByTimeAsync(3000);
		await settle();
		expect(dialogText()).not.toContain(en.focus_mf_warning('left'));
		expect(ticked('left')).toBe(true);
		expect(button(en.focus_continue)?.disabled).toBe(false);
		await click(en.focus_continue);
		expect(onClose).toHaveBeenCalledWith('completed');
	});

	it('a camera with no reading keeps "Continue" disabled; after two failed readings in a row "Continue anyway" appears', async () => {
		modes = { 0: 'Manual', 1: 'fail' };
		const { onClose } = await toMfStage();
		// Entering this stage clears the count: one failed reading so far.
		expect(reading('right')).toBe(en.focus_mode_unknown);
		expect(button(en.focus_continue)?.disabled).toBe(true);
		expect(button(en.focus_continue_anyway)).toBeNull();
		await vi.advanceTimersByTimeAsync(3000);
		await settle();
		const anyway = button(en.focus_continue_anyway);
		expect(anyway).not.toBeNull();
		expect(anyway?.classList.contains('btn-secondary')).toBe(true);
		await click(en.focus_continue_anyway);
		expect(onClose).toHaveBeenCalledWith('completed');
	});

	it('one failed reading followed by a good one does not offer "Continue anyway"', async () => {
		let calls = 0;
		settingsSpy.mockImplementation(async (i: number) => {
			if (i === 1 && calls++ === 0) throw new Error('busy');
			return { focus_mode: i === 1 ? 'One Shot' : 'Manual' } as DSLRSettings;
		});
		await toMfStage();
		expect(reading('right')).toBe(en.focus_mode_auto);
		expect(button(en.focus_continue_anyway)).toBeNull();
		expect(button(en.focus_continue)?.disabled).toBe(true);
	});

	it('with the MF reading not required, "Continue" only warns', async () => {
		const { onClose } = await toMfStage({ requireMfReading: false });
		expect(dialogText()).toContain(en.focus_mf_warning('left'));
		expect(button(en.focus_continue)?.disabled).toBe(false);
		await click(en.focus_continue);
		expect(onClose).toHaveBeenCalledWith('completed');
	});
});

describe('RefocusModal: slow and stale readings', () => {
	type Pending = { cam: number; answer: ReturnType<typeof deferred<DSLRSettings>> };
	let pending: Pending[];

	// Every request waits until the test answers it.
	function holdRequests() {
		pending = [];
		settingsSpy.mockImplementation((i: number) => {
			const answer = deferred<DSLRSettings>();
			pending.push({ cam: i, answer });
			return answer.promise;
		});
	}
	const open = (cam: number) => pending.filter((p) => p.cam === cam);
	const mode = (focus_mode: string) => ({ focus_mode }) as DSLRSettings;

	it('records an answer that takes longer than a poll, with one request per camera pending at a time', async () => {
		holdRequests();
		renderModal();
		await settle();
		expect(pending.map((p) => p.cam).sort()).toEqual([0, 1]);

		await vi.advanceTimersByTimeAsync(3000);
		await vi.advanceTimersByTimeAsync(3000);
		await settle();
		expect(settingsSpy).toHaveBeenCalledTimes(2);

		pending[0].answer.resolve(mode('One Shot'));
		pending[1].answer.resolve(mode('One Shot'));
		await settle();
		expect(ticked('left')).toBe(true);
		expect(ticked('right')).toBe(true);

		await vi.advanceTimersByTimeAsync(3000);
		await settle();
		expect(settingsSpy).toHaveBeenCalledTimes(4);
	});

	it('slow failures still count, so "Continue anyway" appears on the MF stage', async () => {
		holdRequests();
		renderModal();
		await settle();
		await click(en.focus_next);
		await click(en.focus_next);
		await settle();
		// Entering the MF stage started a fresh pair; the AF stage's are void.
		// A poll tick goes by before they fail, and starts nothing.
		const fresh = pending.slice(-2);
		await vi.advanceTimersByTimeAsync(3000);
		await settle();
		expect(pending.length).toBe(fresh.length + 2);
		for (const p of fresh) p.answer.reject(new Error('slow'));
		await settle();
		expect(button(en.focus_continue_anyway)).toBeNull();

		await vi.advanceTimersByTimeAsync(3000);
		await settle();
		for (const p of pending.slice(-2)) p.answer.reject(new Error('slow'));
		await settle();
		expect(button(en.focus_continue_anyway)).not.toBeNull();
		expect(button(en.focus_continue)?.disabled).toBe(true);
	});

	it('entering the MF stage drops the cached readings: "Continue" waits for a fresh answer', async () => {
		modes = { 0: 'Manual', 1: 'Manual' };
		renderModal();
		await settle();
		expect(ticked('left')).toBe(false);
		expect(reading('left')).toBe(en.focus_mode_manual);
		await click(en.focus_next);
		holdRequests();
		await click(en.focus_next);
		await settle();
		expect(reading('left')).toBe(en.focus_mode_unknown);
		expect(button(en.focus_continue)?.disabled).toBe(true);
		expect(pending.map((p) => p.cam).sort()).toEqual([0, 1]);

		pending[0].answer.resolve(mode('Manual'));
		pending[1].answer.resolve(mode('Manual'));
		await settle();
		expect(button(en.focus_continue)?.disabled).toBe(false);
	});

	it('an answer to a request sent before the MF stage is ignored', async () => {
		holdRequests();
		renderModal();
		await settle();
		const old = [...pending];
		await click(en.focus_next);
		await click(en.focus_next);
		await settle();
		expect(pending.length).toBe(4);

		old[0].answer.resolve(mode('Manual'));
		old[1].answer.resolve(mode('Manual'));
		await settle();
		expect(reading('left')).toBe(en.focus_mode_unknown);
		expect(button(en.focus_continue)?.disabled).toBe(true);

		pending[2].answer.resolve(mode('Manual'));
		pending[3].answer.resolve(mode('Manual'));
		await settle();
		expect(button(en.focus_continue)?.disabled).toBe(false);
	});
});

describe('RefocusModal: closing', () => {
	it('"Skip" closes as dismissed, at any stage', async () => {
		const { onClose } = renderModal();
		await settle();
		await click(en.focus_next);
		await click(en.focus_skip);
		expect(onClose).toHaveBeenCalledWith('dismissed');
	});

	it('Escape closes as dismissed', async () => {
		const { onClose } = renderModal();
		await settle();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(onClose).toHaveBeenCalledWith('dismissed');
	});

	it('nothing closes it while a test capture runs', async () => {
		captureSpy.mockImplementation(() => new Promise(() => {}));
		const { onClose } = await toTestStage();
		await click(en.focus_take);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(button(en.focus_skip)?.disabled).toBe(true);
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe('RefocusModal: Escape as the assigned capture key', () => {
	const escapeChord = { key: 'Escape', ctrl: false, alt: false, meta: false, shift: false };

	afterEach(() => clearChord());

	// A real key press starts at the focused element, so the window's capture
	// listener (the dialog's Escape) runs before the page's own. Dispatching on
	// the window itself would reverse that order.
	function pressEscape(): KeyboardEvent {
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		document.body.dispatchEvent(event);
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
		return event;
	}

	it('takes the test pair on the test-pictures stage and does not close the dialog', async () => {
		writeChord(escapeChord);
		captureSpy.mockImplementation(() => new Promise(() => {}));
		const { onClose } = await toTestStage();
		const event = pressEscape();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		expect(onClose).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	it('does nothing on a stage without a capture action: no close, no request', async () => {
		writeChord(escapeChord);
		const { onClose } = renderModal();
		await settle();
		pressEscape();
		await settle();
		expect(onClose).not.toHaveBeenCalled();
		expect(captureSpy).not.toHaveBeenCalled();
		await click(en.focus_next);
		await click(en.focus_next);
		pressEscape();
		await settle();
		expect(onClose).not.toHaveBeenCalled();
		expect(captureSpy).not.toHaveBeenCalled();
	});

	it('when Escape is not the assigned key, it closes the dialog and starts no request', async () => {
		writeChord({ ...escapeChord, key: 'F7' });
		const { onClose } = await toTestStage();
		pressEscape();
		await settle();
		expect(onClose).toHaveBeenCalledWith('dismissed');
		expect(captureSpy).not.toHaveBeenCalled();
	});

	it('with no key assigned, Escape closes the dialog and starts no request', async () => {
		const { onClose } = await toTestStage();
		const event = pressEscape();
		await settle();
		expect(onClose).toHaveBeenCalledWith('dismissed');
		expect(captureSpy).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	// The whole chord decides, modifiers included: with the pedal on
	// Ctrl+Escape, plain Escape is no capture key and closes the dialog.
	describe('with the pedal on Ctrl+Escape', () => {
		function pressCtrlEscape(): KeyboardEvent {
			const event = new KeyboardEvent('keydown', { key: 'Escape', ctrlKey: true, bubbles: true, cancelable: true });
			document.body.dispatchEvent(event);
			document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
			return event;
		}

		it('plain Escape closes the dialog and starts no request', async () => {
			writeChord({ ...escapeChord, ctrl: true });
			const { onClose } = await toTestStage();
			pressEscape();
			await settle();
			expect(onClose).toHaveBeenCalledWith('dismissed');
			expect(captureSpy).not.toHaveBeenCalled();
		});

		it('Ctrl+Escape takes the test pair and does not close the dialog', async () => {
			writeChord({ ...escapeChord, ctrl: true });
			captureSpy.mockImplementation(() => new Promise(() => {}));
			const { onClose } = await toTestStage();
			const event = pressCtrlEscape();
			await settle();
			expect(captureSpy).toHaveBeenCalledTimes(2);
			expect(onClose).not.toHaveBeenCalled();
			expect(event.defaultPrevented).toBe(true);
		});

		it('Ctrl+Escape on a stage without a capture action neither closes nor requests', async () => {
			writeChord({ ...escapeChord, ctrl: true });
			const { onClose } = renderModal();
			await settle();
			pressCtrlEscape();
			await settle();
			expect(onClose).not.toHaveBeenCalled();
			expect(captureSpy).not.toHaveBeenCalled();
		});
	});
});

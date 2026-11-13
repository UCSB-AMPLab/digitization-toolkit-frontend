// NEH-339: the camera check, opened from the capture screen. Two panes, left
// page and right page, filled by a pair of test captures (POST
// /cameras/test-capture/{n}, never saved); the zoom of the two cameras, set
// from here in steps on a CHDK camera and read from the pictures on a DSLR;
// the pictures at 1:1 and, on a DSLR unit, the Refocus dialog; and a chip
// for each camera with its details. Each capture is shown turned by its
// camera's saved orientation, as Captua saves it, and "Turn" turns that
// camera by 90° through the capture screen's own orientation writer.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	camerasApi,
	type CameraCapabilities,
	type CameraDevice,
	type DSLRSettings,
	type TestCaptureResult,
	type ZoomStepResponse
} from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { clearChord, writeChord } from '$lib/capture-key';
import '../../app.css';
import CameraCheck from './CameraCheck.svelte';

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

async function shot(w = 400, h = 600, focalLength: number | null = null): Promise<TestCaptureResult> {
	return { blob: await jpeg(w, h), seconds: 1.2, bytes: 1000, focalLength };
}

function failure(status: number, message = 'failed', detail?: unknown): Error {
	return Object.assign(new Error(message), { status, detail });
}

const T7 = 'Canon EOS Rebel T7';
const A2500 = 'Canon PowerShot A2500';

function caps(over: Partial<CameraCapabilities> = {}): CameraCapabilities {
	return {
		backend: 'gphoto2',
		live_preview: true,
		focus_control: false,
		live_controls: false,
		zoom: false,
		autofocus_calibration: false,
		dslr_settings: false,
		continuous_preview: false,
		...over
	};
}

function device(index: number, over: Partial<CameraDevice> = {}): CameraDevice {
	return { index, hardware_id: `hw${index}`, model: A2500, calibrated: false, location: `usb:001,00${index + 4}`, ...over };
}

// A CHDK pair at step `steps[i]`, 64 steps each; null steps until shooting mode.
function a2500(steps: [number | null, number | null] = [24, 24]): CameraDevice[] {
	return steps.map((s, i) => device(i, { zoom_steps: s === null ? null : 64, zoom_step: s }));
}

let devices: CameraDevice[];
let capsSpy: MockInstance<typeof camerasApi.getCapabilities>;
let listSpy: MockInstance<typeof camerasApi.listDevices>;
let captureSpy: MockInstance<typeof camerasApi.testCapture>;
let zoomSpy: MockInstance<typeof camerasApi.setZoomStep>;

type Props = {
	leftIndex: number;
	rotateDeg: Record<number, number>;
	savingOrientation: Record<number, boolean>;
};

function renderCheck(props: Partial<Props> = {}) {
	const onClose = vi.fn();
	const onRefocusClosed = vi.fn();
	const onRotateDegChange = vi.fn();
	const screen = render(CameraCheck, {
		leftIndex: 0,
		projectName: 'Rionegro',
		collectionName: 'Tomo 6',
		rotateDeg: { 0: 0, 1: 0 },
		onClose,
		onRefocusClosed,
		onRotateDegChange,
		...props
	});
	return { screen, onClose, onRefocusClosed, onRotateDegChange };
}

const view = () => document.querySelector('[data-camera-check]') as HTMLElement | null;
const frame = (side: 'left' | 'right') => document.querySelector(`[data-frame="${side}"]`) as HTMLElement | null;
const frameImg = (side: 'left' | 'right') => frame(side)?.querySelector('img') as HTMLImageElement | null;
const zoomControl = (which: 'both' | 'left' | 'right') => document.querySelector(`[data-zoom="${which}"]`) as HTMLElement | null;
const zoomValue = (which: 'both' | 'left' | 'right') => zoomControl(which)?.querySelector('.zc-val')?.textContent?.trim() ?? null;
const zoomButton = (which: 'both' | 'left' | 'right', dir: 'in' | 'out') =>
	zoomControl(which)?.querySelector(`button[data-dir="${dir}"]`) as HTMLButtonElement | null;
const chip = (side: 'left' | 'right') => document.querySelector(`[data-chip="${side}"]`) as HTMLButtonElement | null;
const text = () => view()?.textContent ?? '';
const dialogs = () => [...document.querySelectorAll('[role="dialog"]')];
const dialogWith = (s: string) => dialogs().find((d) => d.textContent?.includes(s)) ?? null;

// A button's name: its aria-label, or its text without the icon ligatures.
function nameOf(b: Element): string {
	const label = b.getAttribute('aria-label');
	if (label) return label.trim();
	const copy = b.cloneNode(true) as Element;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return (copy.textContent ?? '').trim();
}

function button(name: string, root: ParentNode = document): HTMLButtonElement | null {
	return [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => nameOf(b) === name) ?? null;
}

async function click(name: string, root: ParentNode = document) {
	const b = button(name, root);
	if (!b) throw new Error(`no button "${name}"`);
	b.click();
	await settle();
}

async function press(b: HTMLButtonElement | null) {
	if (!b) throw new Error('no button');
	b.click();
	await settle();
}

beforeEach(() => {
	locale.set('en');
	clearChord();
	devices = a2500();
	capsSpy = vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps({ zoom_steps: true }));
	listSpy = vi.spyOn(camerasApi, 'listDevices').mockImplementation(async () => devices.map((d) => ({ ...d })));
	captureSpy = vi.spyOn(camerasApi, 'testCapture').mockImplementation(() => shot());
	zoomSpy = vi
		.spyOn(camerasApi, 'setZoomStep')
		.mockImplementation(async (_i: number, step: number) => ({ detail: 'Zoom step applied', zoom_step: step }) as ZoomStepResponse);
	vi.spyOn(camerasApi, 'getDSLRSettings').mockResolvedValue({ focus_mode: 'Manual' } as DSLRSettings);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('CameraCheck: at rest and closing', () => {
	it('shows the two panes empty, the note that test captures are discarded, and the way back', async () => {
		const { onClose } = renderCheck();
		await settle();
		expect(view()).not.toBeNull();
		expect(view()?.getAttribute('role')).toBe('dialog');
		expect(text()).toContain(en.camcheck_title);
		expect(frame('left')?.textContent).toContain(en.camcheck_left_page);
		expect(frame('right')?.textContent).toContain(en.camcheck_right_page);
		expect(frame('left')?.textContent).toContain(en.camcheck_no_capture);
		expect(frame('right')?.textContent).toContain(en.camcheck_no_capture);
		expect(text()).toContain(en.camcheck_discarded);
		expect(captureSpy).not.toHaveBeenCalled();

		await click(en.camcheck_back);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('Escape closes it too', async () => {
		const { onClose } = renderCheck();
		await settle();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

describe('CameraCheck: test captures', () => {
	it('takes one test capture from each camera, not in the focus-check mode, and shows it on its side', async () => {
		captureSpy.mockImplementation((i: number) => shot(i === 0 ? 400 : 300, 600));
		renderCheck({ leftIndex: 1 });
		await settle();
		await click(en.camcheck_take);
		expect(captureSpy.mock.calls.map((c) => c[0]).sort()).toEqual([0, 1]);
		for (const call of captureSpy.mock.calls) expect(call[1]?.focusCheck).toBeFalsy();
		// Camera 1 takes the left page here.
		await expect.poll(() => frameImg('left')?.naturalWidth ?? 0).toBe(300);
		await expect.poll(() => frameImg('right')?.naturalWidth ?? 0).toBe(400);
	});

	it('while the cameras work: the panes say so, and nothing else starts or closes the view', async () => {
		const answers = [deferred<TestCaptureResult>(), deferred<TestCaptureResult>()];
		captureSpy.mockImplementation((i: number) => answers[i].promise);
		const { onClose } = renderCheck();
		await settle();
		await click(en.camcheck_take);
		expect(frame('left')?.textContent).toContain(en.camcheck_taking);
		expect(button(en.camcheck_take)?.disabled).toBe(true);
		expect(button(en.camcheck_back)?.disabled).toBe(true);
		expect(zoomButton('both', 'in')?.disabled).toBe(true);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(onClose).not.toHaveBeenCalled();

		answers[0].resolve(await shot());
		answers[1].resolve(await shot());
		await settle();
		expect(button(en.camcheck_take)?.disabled).toBe(false);
		expect(button(en.camcheck_back)?.disabled).toBe(false);
	});

	it('a camera that fails shows the catalogued reason on its side; taking them again retries both', async () => {
		captureSpy.mockImplementation(async (i: number) => {
			if (i === 1) throw failure(404, 'Camera 1 is not connected');
			return shot();
		});
		renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => frameImg('left')?.naturalWidth ?? 0).toBe(400);
		expect(frameImg('right')).toBeNull();
		expect(frame('right')?.textContent).toContain(en.camcheck_test_failed(en.dash_camera_capture_not_connected));

		captureSpy.mockImplementation(() => shot(500, 600));
		await click(en.camcheck_take);
		expect(captureSpy).toHaveBeenCalledTimes(4);
		await expect.poll(() => frameImg('right')?.naturalWidth ?? 0).toBe(500);
		expect(frame('right')?.textContent).not.toContain(en.camcheck_test_failed(en.dash_camera_capture_not_connected));
	});

	it('another failure keeps the general message, never the backend\'s English', async () => {
		captureSpy.mockRejectedValue(failure(500, 'gphoto2 error -53'));
		renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => frame('left')?.textContent ?? '').toContain(en.camcheck_test_failed());
		expect(text()).not.toContain('gphoto2');
	});

	it('the pedal and the capture key take the test captures', async () => {
		renderCheck();
		await settle();
		const event = new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true });
		window.dispatchEvent(event);
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'b', bubbles: true }));
		await settle();
		expect(event.defaultPrevented).toBe(true);
		expect(captureSpy).toHaveBeenCalledTimes(2);
	});

	it('revokes the object URLs it replaces, and the rest on closing', async () => {
		const created: string[] = [];
		const realCreate = URL.createObjectURL.bind(URL);
		vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
			const url = realCreate(b);
			created.push(url);
			return url;
		});
		const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
		const { screen } = renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => created.length).toBe(2);
		const first = [...created];
		expect(revokeSpy).not.toHaveBeenCalled();

		await click(en.camcheck_take);
		await expect.poll(() => created.length).toBe(4);
		const revoked = revokeSpy.mock.calls.map((c) => c[0]);
		expect(revoked).toEqual(expect.arrayContaining(first));
		expect(revoked).not.toContain(created[2]);

		screen.unmount();
		expect(revokeSpy.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(created));
	});

	it('reads the device list again after the test captures', async () => {
		renderCheck();
		await settle();
		const before = listSpy.mock.calls.length;
		await click(en.camcheck_take);
		await expect.poll(() => listSpy.mock.calls.length).toBeGreaterThan(before);
	});
});

describe('CameraCheck: stepped zoom (CHDK)', () => {
	it('one linked control shows the step and its range; a press sends the new step to both cameras, one after the other', async () => {
		const answers: ReturnType<typeof deferred<ZoomStepResponse>>[] = [];
		zoomSpy.mockImplementation(() => {
			const d = deferred<ZoomStepResponse>();
			answers.push(d);
			return d.promise;
		});
		renderCheck();
		await settle();
		expect(text()).toContain(en.camcheck_zoom_both);
		expect(zoomValue('both')).toBe('24');
		expect(zoomControl('both')?.textContent).toContain(en.camcheck_zoom_of(63));
		expect(zoomControl('left')).toBeNull();

		await press(zoomButton('both', 'in'));
		expect(zoomSpy.mock.calls).toEqual([[0, 25]]);
		// The control waits while a request is in flight.
		expect(zoomButton('both', 'in')?.disabled).toBe(true);
		expect(zoomButton('both', 'out')?.disabled).toBe(true);
		expect(button(en.camcheck_take)?.disabled).toBe(true);

		answers[0].resolve({ detail: 'Zoom step applied', zoom_step: 25 });
		await settle();
		expect(zoomSpy.mock.calls).toEqual([
			[0, 25],
			[1, 25]
		]);
		expect(zoomButton('both', 'in')?.disabled).toBe(true);

		answers[1].resolve({ detail: 'Zoom step applied', zoom_step: 25 });
		await settle();
		expect(zoomValue('both')).toBe('25');
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
	});

	it('shows the step the cameras confirmed, not the one asked for', async () => {
		zoomSpy.mockImplementation(async () => ({ detail: 'Zoom step applied', zoom_step: 27 }));
		renderCheck();
		await settle();
		await press(zoomButton('both', 'in'));
		await expect.poll(() => zoomValue('both')).toBe('27');
	});

	it('the left page camera goes first when the viewport is swapped', async () => {
		renderCheck({ leftIndex: 1 });
		await settle();
		await press(zoomButton('both', 'out'));
		expect(zoomSpy.mock.calls).toEqual([
			[1, 23],
			[0, 23]
		]);
	});

	it('no step past the range: minus at 0 and plus at the last step are disabled', async () => {
		devices = a2500([63, 63]);
		renderCheck();
		await settle();
		expect(zoomButton('both', 'in')?.disabled).toBe(true);
		expect(zoomButton('both', 'out')?.disabled).toBe(false);
	});

	it('"Adjust separately" gives each camera its own control; "Match" sets the right page to the left page and links them again', async () => {
		renderCheck({ leftIndex: 1 });
		await settle();
		await click(en.camcheck_adjust_separately);
		expect(text()).toContain(en.camcheck_zoom_each);
		expect(zoomControl('both')).toBeNull();
		expect(zoomValue('left')).toBe('24');
		expect(zoomValue('right')).toBe('24');
		expect(button(en.camcheck_match)).toBeNull();

		// The right page is camera 0 here.
		await press(zoomButton('right', 'in'));
		expect(zoomSpy.mock.calls).toEqual([[0, 25]]);
		expect(zoomValue('right')).toBe('25');
		expect(zoomValue('left')).toBe('24');
		expect(button(en.camcheck_adjust_together)?.disabled).toBe(true);

		await click(en.camcheck_match);
		expect(zoomSpy.mock.calls.at(-1)).toEqual([0, 24]);
		await settle();
		expect(zoomControl('both')).not.toBeNull();
		expect(zoomValue('both')).toBe('24');
	});

	it('"Adjust together" links the controls again when the steps are equal', async () => {
		renderCheck();
		await settle();
		await click(en.camcheck_adjust_separately);
		await press(zoomButton('left', 'in'));
		await press(zoomButton('right', 'in'));
		expect(button(en.camcheck_match)).toBeNull();
		expect(button(en.camcheck_adjust_together)?.disabled).toBe(false);
		await click(en.camcheck_adjust_together);
		expect(zoomValue('both')).toBe('25');
	});

	it('opens in the separate state when the two cameras are at different steps', async () => {
		devices = a2500([24, 26]);
		renderCheck();
		await settle();
		expect(zoomControl('both')).toBeNull();
		expect(zoomValue('left')).toBe('24');
		expect(zoomValue('right')).toBe('26');
		expect(button(en.camcheck_match)).not.toBeNull();
	});

	it('a 502 shows the backend\'s detail under the control and reads the device list again', async () => {
		renderCheck();
		await settle();
		const before = listSpy.mock.calls.length;
		zoomSpy.mockRejectedValue(failure(502, 'The camera on usb:001,004 did not move the lens'));
		await press(zoomButton('both', 'in'));
		const message = zoomControl('both')?.closest('.ck-sec')?.querySelector('[role="alert"]')?.textContent?.trim();
		expect(message).toBe(en.camcheck_zoom_failed('left', 'The camera on usb:001,004 did not move the lens'));
		// Nothing goes to the second camera after the first refused.
		expect(zoomSpy).toHaveBeenCalledTimes(1);
		expect(listSpy.mock.calls.length).toBeGreaterThan(before);
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
	});

	it('a 422 in pydantic\'s list form shows its message', async () => {
		renderCheck();
		await settle();
		const list = [{ type: 'int_type', loc: ['body', 'zoom_step'], msg: 'Input should be a valid integer' }];
		zoomSpy.mockRejectedValue(failure(422, JSON.stringify(list), list));
		await press(zoomButton('both', 'in'));
		expect(text()).toContain(en.camcheck_zoom_failed('left', 'Input should be a valid integer'));
	});

	it('with no step known yet the control is disabled with the hint; after test captures it is enabled', async () => {
		devices = a2500([null, null]);
		renderCheck();
		await settle();
		expect(zoomButton('both', 'in')?.disabled).toBe(true);
		expect(zoomButton('both', 'out')?.disabled).toBe(true);
		expect(text()).toContain(en.camcheck_zoom_first);

		devices = a2500([30, 30]);
		await click(en.camcheck_take);
		await expect.poll(() => zoomButton('both', 'in')?.disabled).toBe(false);
		expect(zoomValue('both')).toBe('30');
		expect(text()).not.toContain(en.camcheck_zoom_first);
	});

	it('a zoom change marks the pictures on screen out of date until new ones are taken', async () => {
		renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => frameImg('left')?.naturalWidth ?? 0).toBe(400);
		expect(text()).not.toContain(en.camcheck_stale);

		await press(zoomButton('both', 'in'));
		expect(text()).toContain(en.camcheck_stale);
		expect(frame('left')?.hasAttribute('data-stale')).toBe(true);

		await click(en.camcheck_take);
		await settle();
		expect(text()).not.toContain(en.camcheck_stale);
		expect(frame('left')?.hasAttribute('data-stale')).toBe(false);
	});
});

describe('CameraCheck: zoom read from the pictures (DSLR)', () => {
	beforeEach(() => {
		capsSpy.mockResolvedValue(caps({ dslr_settings: true }));
		devices = [device(0, { model: T7 }), device(1, { model: T7 })];
	});

	it('no control; the hint until the pictures arrive, then each camera\'s focal length', async () => {
		captureSpy.mockImplementation(() => shot(400, 600, 27));
		renderCheck();
		await settle();
		expect(zoomControl('both')).toBeNull();
		expect(button(en.camcheck_adjust_separately)).toBeNull();
		expect(text()).toContain(en.camcheck_focal_hint);

		await click(en.camcheck_take);
		await expect.poll(() => document.querySelector('[data-focal="left"]')?.textContent?.trim()).toBe(
			`${en.camcheck_focal_value(27)}${en.camcheck_mm}`
		);
		expect(document.querySelector('[data-focal="right"]')?.textContent?.trim()).toBe(`${en.camcheck_focal_value(27)}${en.camcheck_mm}`);
		expect(text()).toContain(en.camcheck_focal_read);
		expect(text()).not.toContain(en.camcheck_focal_differ_title);
	});

	it('says so when the two focal lengths differ', async () => {
		captureSpy.mockImplementation((i: number) => shot(400, 600, i === 0 ? 35 : 27));
		renderCheck({ leftIndex: 1 });
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => text()).toContain(en.camcheck_focal_differ_title);
		expect(text()).toContain(en.camcheck_focal_differ_body);
		// Camera 1 is the left one here; the right page's value is marked.
		expect(document.querySelector('[data-focal="left"]')?.textContent?.trim()).toBe(`${en.camcheck_focal_value(27)}${en.camcheck_mm}`);
		expect(document.querySelector('[data-focal="right"]')?.classList.contains('is-off')).toBe(true);
	});

	it('"Refocus" opens the Refocus dialog over the check, and its closing is reported', async () => {
		const { onRefocusClosed } = renderCheck();
		await settle();
		await click(en.focus_refocus);
		await expect.poll(() => dialogWith(en.focus_af_title)).not.toBeNull();
		await click(en.focus_skip, dialogWith(en.focus_af_title)!);
		expect(dialogWith(en.focus_af_title)).toBeNull();
		expect(onRefocusClosed).toHaveBeenCalledTimes(1);
		expect(view()).not.toBeNull();
	});

	it('the capture key goes to the Refocus dialog while it is open, not to the check', async () => {
		renderCheck();
		await settle();
		await click(en.focus_refocus);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
		await settle();
		expect(captureSpy).not.toHaveBeenCalled();
	});
});

describe('CameraCheck: focus at full size', () => {
	it('no "Refocus" without DSLR settings', async () => {
		renderCheck();
		await settle();
		expect(text()).toContain(en.camcheck_focus_hint);
		expect(button(en.focus_refocus)).toBeNull();
	});

	it('1:1 on a picture opens both at full size, under one zoom; Close and Escape close the viewer only', async () => {
		captureSpy.mockImplementation(() => shot(3000, 2000));
		const { onClose } = renderCheck();
		await settle();
		expect(button(en.camcheck_full_size_aria('left'))).toBeNull();
		await click(en.camcheck_take);
		await expect.poll(() => button(en.camcheck_full_size_aria('left'))).not.toBeNull();

		await click(en.camcheck_full_size_aria('right'));
		const viewer = () => document.querySelector('[role="dialog"][aria-labelledby="fv-title"]');
		await expect.poll(() => viewer()?.querySelectorAll('img').length).toBe(2);
		const scale = (img: Element) => Number(img.getAttribute('style')?.match(/scale\(([\d.]+)\)/)?.[1] ?? NaN);
		await expect.poll(() => scale(viewer()!.querySelectorAll('img')[0])).toBeGreaterThan(1);
		const imgs = viewer()!.querySelectorAll('img');
		expect(scale(imgs[1])).toBeCloseTo(scale(imgs[0]), 5);
		await click(en.col_fit_screen_aria, viewer()!);
		expect(scale(viewer()!.querySelectorAll('img')[0])).toBe(1);

		await click(en.common_close, viewer()!);
		expect(viewer()).toBeNull();
		expect(view()).not.toBeNull();

		await click(en.camcheck_full_size_aria('left'));
		expect(viewer()).not.toBeNull();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await settle();
		expect(viewer()).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe('CameraCheck: are my cameras OK', () => {
	it('a chip for each camera, by role, with its model; pressing one shows the details', async () => {
		renderCheck({ leftIndex: 1 });
		await settle();
		expect(chip('left')?.getAttribute('aria-label')).toBe(en.camcheck_chip_aria('left'));
		expect(chip('left')?.textContent).toContain(en.camcheck_left_page);
		expect(chip('left')?.textContent).toContain(A2500);
		expect(chip('left')?.querySelector('.cam-badge.ok')).not.toBeNull();
		expect(chip('right')?.querySelector('.cam-badge.ok')).not.toBeNull();

		await press(chip('left'));
		const details = document.querySelector('[role="dialog"][aria-labelledby="cd-title"]')!;
		expect(details).not.toBeNull();
		const left = details.querySelector('[data-details="left"]')!;
		expect(left.textContent).toContain(en.camcheck_details_camera('left'));
		expect(left.textContent).toContain(en.camcheck_connected);
		expect(left.textContent).toContain(A2500);
		// No USB row until the backend reports a stable socket name.
		expect(details.textContent).not.toContain('usb:001');
		expect(details.querySelectorAll('dt')).toHaveLength(4);

		await click(en.common_close, details);
		expect(document.querySelector('[role="dialog"][aria-labelledby="cd-title"]')).toBeNull();
	});

	it('a camera missing from the device list: the chip, the notice, the pane and the details say Captua cannot reach it', async () => {
		devices = [device(0)];
		renderCheck();
		await settle();
		expect(chip('right')?.querySelector('.cam-badge.err')).not.toBeNull();
		expect(chip('right')?.textContent).toContain(en.camcheck_not_reachable);
		expect(chip('left')?.querySelector('.cam-badge.ok')).not.toBeNull();
		expect(text()).toContain(en.camcheck_unreachable_title('right'));
		expect(text()).toContain(en.camcheck_unreachable_body);
		expect(frame('right')?.textContent).toContain(en.camcheck_frame_unreachable);

		await press(chip('right'));
		const details = document.querySelector('[role="dialog"][aria-labelledby="cd-title"]')!;
		expect(details.querySelector('[data-details="right"]')?.textContent).toContain(en.camcheck_cannot_reach);
	});

	it('a device list that cannot be read says so, and claims nothing about the cameras', async () => {
		listSpy.mockRejectedValue(failure(503, 'down'));
		renderCheck();
		await settle();
		expect(text()).toContain(en.camcheck_devices_failed);
		expect(chip('left')?.querySelector('.cam-badge.ok, .cam-badge.err')).toBeNull();
		expect(text()).not.toContain(en.camcheck_unreachable_title('right'));
	});
});

describe('CameraCheck: orientation', () => {
	const turn = (side: 'left' | 'right') => frame(side)?.querySelector('button[data-turn]') as HTMLButtonElement | null;
	const rotationOf = (img: Element | null | undefined) => img?.getAttribute('style')?.match(/rotate\((-?\d+)deg\)/)?.[1] ?? null;

	it('shows each capture turned by its camera\'s saved orientation, the frame keeping its size', async () => {
		captureSpy.mockImplementation(() => shot(600, 400));
		// Camera 1 takes the left page here.
		renderCheck({ leftIndex: 1, rotateDeg: { 0: 180, 1: 90 } });
		await settle();
		const before = frame('left')!.getBoundingClientRect();
		await click(en.camcheck_take);
		await expect.poll(() => frameImg('left')?.naturalWidth ?? 0).toBe(600);
		expect(rotationOf(frameImg('left'))).toBe('90');
		expect(rotationOf(frameImg('right'))).toBe('180');
		// At 90° the picture gets the frame's size with width and height swapped.
		const f = frame('left')!;
		await expect.poll(() => frameImg('left')?.getAttribute('style') ?? '').toContain(`width: ${f.clientHeight}px`);
		expect(frameImg('left')!.getAttribute('style')).toContain(`height: ${f.clientWidth}px`);
		const after = frame('left')!.getBoundingClientRect();
		expect(after.width).toBeCloseTo(before.width, 0);
		expect(after.height).toBeCloseTo(before.height, 0);
	});

	it('"Turn" turns that camera by 90° clockwise through the orientation writer, before any capture too', async () => {
		const { screen, onRotateDegChange } = renderCheck({ rotateDeg: { 0: 90, 1: 270 } });
		await settle();
		expect(turn('left')?.disabled).toBe(false);
		expect(turn('left')?.getAttribute('aria-label')).toBe(en.camcheck_turn_aria('left'));
		await press(turn('right'));
		expect(onRotateDegChange).toHaveBeenCalledWith(1, 0);
		await press(turn('left'));
		expect(onRotateDegChange).toHaveBeenCalledWith(0, 180);

		captureSpy.mockImplementation(() => shot(600, 400));
		await click(en.camcheck_take);
		await expect.poll(() => rotationOf(frameImg('left'))).toBe('90');
		await screen.rerender({ rotateDeg: { 0: 180, 1: 0 } });
		await settle();
		expect(rotationOf(frameImg('left'))).toBe('180');
		expect(rotationOf(frameImg('right'))).toBe('0');
	});

	it('"Turn" waits while a test capture, a zoom step or that camera\'s orientation save is in flight', async () => {
		const answers = [deferred<TestCaptureResult>(), deferred<TestCaptureResult>()];
		captureSpy.mockImplementation((i: number) => answers[i].promise);
		const { screen } = renderCheck();
		await settle();
		await click(en.camcheck_take);
		expect(turn('left')?.disabled).toBe(true);
		expect(turn('right')?.disabled).toBe(true);
		answers[0].resolve(await shot());
		answers[1].resolve(await shot());
		await settle();
		expect(turn('left')?.disabled).toBe(false);

		const step = deferred<ZoomStepResponse>();
		zoomSpy.mockImplementation(() => step.promise);
		await press(zoomButton('both', 'in'));
		expect(turn('left')?.disabled).toBe(true);
		step.resolve({ detail: 'Zoom step applied', zoom_step: 25 });
		await settle();

		await screen.rerender({ savingOrientation: { 1: true } });
		await settle();
		// Camera 1 takes the right page.
		expect(turn('right')?.disabled).toBe(true);
		expect(turn('left')?.disabled).toBe(false);
	});

	it('no "Turn" for a camera Captua cannot reach', async () => {
		devices = [device(0)];
		renderCheck();
		await settle();
		expect(turn('left')?.disabled).toBe(false);
		expect(turn('right')?.disabled ?? true).toBe(true);
	});

	it('the 1:1 viewer shows the captures turned, at 1:1, and pans on a turned capture', async () => {
		captureSpy.mockImplementation(() => shot(3000, 2000));
		renderCheck({ rotateDeg: { 0: 90, 1: 270 } });
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => button(en.camcheck_full_size_aria('left'))).not.toBeNull();
		await click(en.camcheck_full_size_aria('left'));
		const viewer = () => document.querySelector('[role="dialog"][aria-labelledby="fv-title"]')!;
		const imgs = () => viewer().querySelectorAll('img');
		const scale = (img: Element) => Number(img.getAttribute('style')?.match(/scale\(([\d.]+)\)/)?.[1] ?? NaN);
		await expect.poll(() => scale(imgs()[0])).toBeGreaterThan(1);
		expect(rotationOf(imgs()[0])).toBe('90');
		expect(rotationOf(imgs()[1])).toBe('270');
		const pane = viewer().querySelector('[data-viewer-pane="left"]') as HTMLElement;
		expect(imgs()[0].getAttribute('style')).toContain(`width: ${pane.clientHeight}px`);
		expect(imgs()[0].getAttribute('style')).toContain('translate(0px, 0px)');

		const opts = { pointerId: 7, bubbles: true, button: 0, clientX: 100, clientY: 100 };
		pane.dispatchEvent(new PointerEvent('pointerdown', opts));
		pane.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 70, clientY: 60 }));
		pane.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: 70, clientY: 60 }));
		await settle();
		expect(imgs()[0].getAttribute('style')).not.toContain('translate(0px, 0px)');
		expect(imgs()[1].getAttribute('style')).not.toContain('translate(0px, 0px)');
	});
});

describe('CameraCheck: EXIF orientation', () => {
	// A Canon T7's test capture carries its own EXIF orientation tag (6 was
	// seen), which a browser applies by default; the check turns the pixels
	// by the saved orientation only.
	it('the test captures in the panes and in the 1:1 viewer ignore the EXIF orientation', async () => {
		renderCheck({ rotateDeg: { 0: 90, 1: 0 } });
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => frameImg('left')?.naturalWidth ?? 0).toBe(400);
		for (const side of ['left', 'right'] as const) expect(getComputedStyle(frameImg(side)!).imageOrientation).toBe('none');
		await click(en.camcheck_full_size_aria('left'));
		const imgs = document.querySelectorAll('[role="dialog"][aria-labelledby="fv-title"] img');
		expect(imgs).toHaveLength(2);
		for (const img of imgs) expect(getComputedStyle(img).imageOrientation).toBe('none');
	});
});

describe('CameraCheck: Escape as the assigned capture key', () => {
	const chord = (over: Partial<{ ctrl: boolean }> = {}) => ({ key: 'Escape', ctrl: false, alt: false, meta: false, shift: false, ...over });
	// On the focused element, as a real key press: the window's capture-phase
	// listener (dismissible) then runs before its bubble-phase one (the key).
	function escape(ctrlKey = false) {
		const target = document.activeElement ?? document.body;
		const event = new KeyboardEvent('keydown', { key: 'Escape', ctrlKey, bubbles: true, cancelable: true });
		target.dispatchEvent(event);
		target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', ctrlKey, bubbles: true }));
		return event;
	}

	afterEach(() => clearChord());

	it('with the pedal on Escape, Escape takes the test captures and the check stays open', async () => {
		writeChord(chord());
		const { onClose } = renderCheck();
		await settle();
		escape();
		await settle();
		expect(onClose).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		expect(view()).not.toBeNull();
	});

	it('with the pedal on Escape, Escape closes the 1:1 viewer without taking captures; a second Escape takes them', async () => {
		writeChord(chord());
		captureSpy.mockImplementation(() => shot(3000, 2000));
		const { onClose } = renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => button(en.camcheck_full_size_aria('left'))).not.toBeNull();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		await click(en.camcheck_full_size_aria('left'));
		const viewer = () => document.querySelector('[role="dialog"][aria-labelledby="fv-title"]');
		expect(viewer()).not.toBeNull();

		escape();
		await settle();
		expect(viewer()).toBeNull();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		expect(onClose).not.toHaveBeenCalled();

		escape();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(4);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('with the pedal on Escape, Escape closes the camera details without taking captures; a second Escape takes them', async () => {
		writeChord(chord());
		const { onClose } = renderCheck();
		await settle();
		await press(chip('left'));
		const details = () => document.querySelector('[role="dialog"][aria-labelledby="cd-title"]');
		expect(details()).not.toBeNull();

		escape();
		await settle();
		expect(details()).toBeNull();
		expect(captureSpy).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();

		escape();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('with the pedal on Ctrl+Escape, plain Escape closes and Ctrl+Escape takes the test captures', async () => {
		writeChord(chord({ ctrl: true }));
		const { onClose } = renderCheck();
		await settle();
		escape(true);
		await settle();
		expect(onClose).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(2);

		escape();
		await settle();
		expect(onClose).toHaveBeenCalledTimes(1);
		// The press that closed it started nothing.
		expect(captureSpy).toHaveBeenCalledTimes(2);
	});

	it('with no pedal on Escape, Escape closes and starts no request', async () => {
		writeChord({ ...chord(), key: 'F7' });
		const { onClose } = renderCheck();
		await settle();
		escape();
		await settle();
		expect(onClose).toHaveBeenCalledTimes(1);
		expect(captureSpy).not.toHaveBeenCalled();
	});

	it('while the cameras work, the pedal on Escape neither closes the check nor takes captures', async () => {
		writeChord(chord());
		captureSpy.mockImplementation(() => new Promise(() => {}));
		const { onClose } = renderCheck();
		await settle();
		await click(en.camcheck_take);
		expect(captureSpy).toHaveBeenCalledTimes(2);
		escape();
		await settle();
		expect(onClose).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(2);
	});

	it('while the cameras work, with no pedal on Escape, Escape does not close the check', async () => {
		captureSpy.mockImplementation(() => new Promise(() => {}));
		const { onClose } = renderCheck();
		await settle();
		await click(en.camcheck_take);
		escape();
		await settle();
		expect(onClose).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(2);
	});
});

describe('CameraCheck: a device listing never overwrites a newer zoom step', () => {
	// Every listing after the first waits until the test answers it.
	function holdListings() {
		const held: ReturnType<typeof deferred<CameraDevice[]>>[] = [];
		let first = true;
		listSpy.mockImplementation(async () => {
			if (first) {
				first = false;
				return devices.map((d) => ({ ...d }));
			}
			const d = deferred<CameraDevice[]>();
			held.push(d);
			return d.promise;
		});
		return held;
	}

	it('the zoom controls wait while the listing that follows the test captures is pending', async () => {
		const held = holdListings();
		renderCheck();
		await settle();
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
		await click(en.camcheck_take);
		await expect.poll(() => held.length).toBe(1);
		expect(zoomButton('both', 'in')?.disabled).toBe(true);
		expect(zoomButton('both', 'out')?.disabled).toBe(true);

		held[0].resolve(a2500([30, 30]));
		await settle();
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
		expect(zoomValue('both')).toBe('30');
	});

	it('a refused zoom step keeps the controls disabled until its re-read arrives, and that listing applies', async () => {
		const held = holdListings();
		renderCheck();
		await settle();
		zoomSpy.mockRejectedValueOnce(failure(502, 'The camera did not answer'));
		await press(zoomButton('both', 'in'));
		await expect.poll(() => held.length).toBe(1);
		expect(zoomButton('both', 'in')?.disabled).toBe(true);
		held[0].resolve(a2500([26, 26]));
		await settle();
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
		expect(zoomValue('both')).toBe('26');
	});
});

describe('CameraCheck: "Change which camera is which" (NEH-343)', () => {
	it('the camera details offer it; pressing it closes the details and asks the capture screen', async () => {
		const onChangeRoles = vi.fn();
		render(CameraCheck, { leftIndex: 0, rotateDeg: { 0: 0, 1: 0 }, onClose: vi.fn(), onChangeRoles });
		await settle();
		await press(chip('right'));
		const details = document.querySelector('[role="dialog"][aria-labelledby="cd-title"]')!;
		await click(en.camwhich_open, details);
		expect(onChangeRoles).toHaveBeenCalledTimes(1);
		expect(document.querySelector('[role="dialog"][aria-labelledby="cd-title"]')).toBeNull();
	});

	it('no such button when the capture screen does not offer it', async () => {
		renderCheck();
		await settle();
		await press(chip('left'));
		expect(button(en.camwhich_open)).toBeNull();
	});

	it('while the step covers it, the capture key takes no test captures', async () => {
		const screen = renderCheck();
		await settle();
		await screen.screen.rerender({ covered: true });
		await settle();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'b', bubbles: true }));
		await settle();
		expect(captureSpy).not.toHaveBeenCalled();
	});
});

describe('CameraCheck: one operation at a time', () => {
	const turnBtn = (side: 'left' | 'right') => frame(side)?.querySelector('button[data-turn]') as HTMLButtonElement | null;
	const takeBtn = () => button(en.camcheck_take);

	// Every listing after the first waits until the test answers it.
	function holdListings() {
		const held: ReturnType<typeof deferred<CameraDevice[]>>[] = [];
		let first = true;
		listSpy.mockImplementation(async () => {
			if (first) {
				first = false;
				return devices.map((d) => ({ ...d }));
			}
			const d = deferred<CameraDevice[]>();
			held.push(d);
			return d.promise;
		});
		return held;
	}

	function captureKey() {
		const event = new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true });
		document.body.dispatchEvent(event);
		document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'F9', bubbles: true }));
	}

	afterEach(() => clearChord());

	it('a second pair of test captures cannot start while the first pair\'s listing is pending', async () => {
		writeChord({ key: 'F9', ctrl: false, alt: false, meta: false, shift: false });
		const held = holdListings();
		renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => held.length).toBe(1);
		expect(captureSpy).toHaveBeenCalledTimes(2);

		expect(takeBtn()?.disabled).toBe(true);
		takeBtn()!.click();
		captureKey();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		expect(held.length).toBe(1);

		held[0].resolve(a2500([30, 30]));
		await settle();
		expect(takeBtn()?.disabled).toBe(false);
		captureKey();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(4);
	});

	it('the zoom controls stay disabled for the whole operation, then show the steps from the listing', async () => {
		const held = holdListings();
		renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => held.length).toBe(1);
		for (const dir of ['in', 'out'] as const) expect(zoomButton('both', dir)?.disabled).toBe(true);
		takeBtn()!.click();
		await settle();
		for (const dir of ['in', 'out'] as const) expect(zoomButton('both', dir)?.disabled).toBe(true);
		expect(button(en.camcheck_adjust_separately)?.disabled).toBe(true);

		held[0].resolve(a2500([30, 30]));
		await settle();
		for (const dir of ['in', 'out'] as const) expect(zoomButton('both', dir)?.disabled).toBe(false);
		expect(zoomValue('both')).toBe('30');
	});

	it('a zoom write disables the test captures and "Turn" until it and its re-read finish', async () => {
		const held = holdListings();
		const step = deferred<ZoomStepResponse>();
		zoomSpy.mockImplementation(() => step.promise);
		renderCheck();
		await settle();
		await press(zoomButton('both', 'in'));
		expect(takeBtn()?.disabled).toBe(true);
		expect(turnBtn('left')?.disabled).toBe(true);
		expect(turnBtn('right')?.disabled).toBe(true);

		// A refused step reads the devices again; the operation is still open.
		step.reject(failure(502, 'The camera did not answer'));
		await expect.poll(() => held.length).toBe(1);
		expect(takeBtn()?.disabled).toBe(true);
		expect(turnBtn('left')?.disabled).toBe(true);
		expect(zoomButton('both', 'in')?.disabled).toBe(true);

		held[0].resolve(a2500([24, 24]));
		await settle();
		expect(takeBtn()?.disabled).toBe(false);
		expect(turnBtn('left')?.disabled).toBe(false);
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
	});

	it('an orientation save disables the test captures and the zoom until it finishes', async () => {
		const { screen } = renderCheck();
		await settle();
		await screen.rerender({ savingOrientation: { 0: true } });
		await settle();
		expect(takeBtn()?.disabled).toBe(true);
		expect(zoomButton('both', 'in')?.disabled).toBe(true);
		expect(turnBtn('left')?.disabled).toBe(true);
		await screen.rerender({ savingOrientation: { 0: false } });
		await settle();
		expect(takeBtn()?.disabled).toBe(false);
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
		expect(turnBtn('left')?.disabled).toBe(false);
	});

	it('a failed listing ends the operation and the controls come back, with the failure message', async () => {
		const held = holdListings();
		renderCheck();
		await settle();
		await click(en.camcheck_take);
		await expect.poll(() => held.length).toBe(1);
		expect(takeBtn()?.disabled).toBe(true);
		held[0].reject(new Error('unreachable'));
		await settle();
		expect(takeBtn()?.disabled).toBe(false);
		expect(zoomButton('both', 'in')?.disabled).toBe(false);
		expect(text()).toContain(en.camcheck_devices_failed);
	});
});

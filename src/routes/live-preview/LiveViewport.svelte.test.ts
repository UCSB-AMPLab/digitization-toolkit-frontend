// NEH-222: the live viewport takes its shape from the frames instead of a
// hardcoded 4:3 box. These are the browser-mode assertions the pure
// src/lib/viewport-aspect.ts tests can't reach — actual layout in a real
// <img>/ResizeObserver/flexbox pipeline, driven by real (canvas-drawn) PNG
// frames fetched through the component's own polling code path.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from '@vitest/browser/context';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

// The app-wide reset (border-box, zeroed margin/padding) isn't loaded by
// default in an isolated component test, but the pixel geometry these
// assertions check for is only exact under it in the real app — a
// content-box .camera-viewport pads its 1px border on top of the inline
// pixel size, throwing height off by 2px.
import '../../app.css';

import LiveViewport from './LiveViewport.svelte';
import { ApiError, camerasApi, type CameraDevice, type CaptureResponse } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { cameraStatus } from '$lib/stores/cameras';
import { clearChord, readChords, writeChord } from '$lib/capture-key';
import { resetUnit } from '$lib/unit-mode';
import { createCaptureGate } from '$lib/capture-check';
import { get } from 'svelte/store';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function baseProps(overrides: Record<string, unknown> = {}) {
	return {
		cameraMode: 'single' as const,
		shutterSpeed: '1/125s',
		iso: '100',
		aperture: '5.6',
		projectId: 1,
		projectName: 'Test project',
		collectionId: 1,
		onCaptureDone: vi.fn(),
		devices: [],
		rotateDeg: { 0: 0, 1: 0 },
		onRotateDegChange: vi.fn(),
		...overrides
	};
}

// A real PNG, drawn on an offscreen canvas, so the <img> the component
// renders from the resulting blob URL actually decodes and reports
// naturalWidth/naturalHeight — a fabricated non-image Blob wouldn't.
async function framePng(w: number, h: number): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.fillStyle = '#606060';
		ctx.fillRect(0, 0, w, h);
	}
	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
			'image/png'
		);
	});
}

// Stubs the same GET /cameras/preview/{index} the component's own polling
// code calls (see fetchPreview in LiveViewport.svelte) — one frame size per
// camera index; a missing index 404s, same as an unconnected camera.
function stubPreviewFetch(sizes: Partial<Record<number, { w: number; h: number }>>) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) => {
			const url =
				typeof input === 'string'
					? input
					: input instanceof URL
						? input.href
						: (input as Request).url;
			const match = url.match(/\/cameras\/preview\/(\d+)/);
			const size = match ? sizes[Number(match[1])] : undefined;
			if (!size) return new Response(null, { status: 404 });
			const blob = await framePng(size.w, size.h);
			return new Response(blob, { status: 200 });
		})
	);
}

// Mounts into a generously-sized target, then pins .mat-board to an exact
// 1000x600 (the board the fitBox tests use) by setting its size directly — sidesteps having
// to fight the component's own flex/padding chain (.viewport-outer's
// padding, centering, etc.) to land on an exact pixel board size.
function renderViewport(props: ReturnType<typeof baseProps>) {
	const target = document.createElement('div');
	target.style.cssText = 'width: 2000px; height: 2000px;';
	document.body.appendChild(target);
	const screen = render(LiveViewport, { target, props });
	const matBoard = screen.container.querySelector('.mat-board') as HTMLElement;
	matBoard.style.cssText = 'width: 1000px; height: 600px; flex-shrink: 0;';
	return screen;
}

function withinPx(actual: number, expected: number, eps = 1): boolean {
	return Math.abs(actual - expected) <= eps;
}

function isInside(inner: DOMRect, outer: DOMRect, eps = 1): boolean {
	return (
		inner.left >= outer.left - eps &&
		inner.top >= outer.top - eps &&
		inner.right <= outer.right + eps &&
		inner.bottom <= outer.bottom + eps
	);
}

async function waitForNaturalWidth(
	screen: { container: HTMLElement },
	selector: string,
	expected: number
) {
	await expect
		.poll(
			() => {
				const img = screen.container.querySelector(selector) as HTMLImageElement | null;
				return img?.naturalWidth ?? 0;
			},
			{ timeout: 5000 }
		)
		.toBe(expected);
}

describe('LiveViewport — the viewport takes its shape from the frames (NEH-222)', () => {
	it('single mode, rotation 0: a 16:9 frame in a 1000x600 board is height-limited (1000x562.5)', async () => {
		stubPreviewFetch({ 0: { w: 1600, h: 900 } });
		const screen = renderViewport(baseProps({ cameraMode: 'single', rotateDeg: { 0: 0 } }));

		await waitForNaturalWidth(screen, '.camera-feed:first-child img.feed-img', 1600);

		await expect
			.poll(
				() => {
					const rect = (
						screen.container.querySelector('.camera-viewport') as HTMLElement
					).getBoundingClientRect();
					return withinPx(rect.width, 1000) && withinPx(rect.height, 562.5);
				},
				{ timeout: 5000 }
			)
			.toBe(true);

		const viewportRect = (
			screen.container.querySelector('.camera-viewport') as HTMLElement
		).getBoundingClientRect();
		const boardRect = (
			screen.container.querySelector('.mat-board') as HTMLElement
		).getBoundingClientRect();
		expect(isInside(viewportRect, boardRect)).toBe(true);
	});

	it('single mode, rotation 90: the same 16:9 frame inverts and is width-limited (337.5x600)', async () => {
		stubPreviewFetch({ 0: { w: 1600, h: 900 } });
		const screen = renderViewport(baseProps({ cameraMode: 'single', rotateDeg: { 0: 90 } }));

		await waitForNaturalWidth(screen, '.camera-feed:first-child img.feed-img', 1600);

		await expect
			.poll(
				() => {
					const rect = (
						screen.container.querySelector('.camera-viewport') as HTMLElement
					).getBoundingClientRect();
					return withinPx(rect.width, 337.5) && withinPx(rect.height, 600);
				},
				{ timeout: 5000 }
			)
			.toBe(true);

		const viewportRect = (
			screen.container.querySelector('.camera-viewport') as HTMLElement
		).getBoundingClientRect();
		const boardRect = (
			screen.container.querySelector('.mat-board') as HTMLElement
		).getBoundingClientRect();
		expect(isInside(viewportRect, boardRect)).toBe(true);
	});

	it("double mode: panels split proportionally to each camera's own displayed aspect", async () => {
		// cam0 (left) rotated 90: a 3:2 frame displays at 2:3 ≈ 0.6667.
		// cam1 (right) at 0: a 16:9 frame displays at 16:9 ≈ 1.7778.
		stubPreviewFetch({ 0: { w: 1200, h: 800 }, 1: { w: 1600, h: 900 } });
		const screen = renderViewport(baseProps({ cameraMode: 'double', rotateDeg: { 0: 90, 1: 0 } }));

		await waitForNaturalWidth(screen, '.camera-feed:first-child img.feed-img', 1200);
		await waitForNaturalWidth(screen, '.camera-feed:last-child img.feed-img', 1600);

		const expectedRatio = 2 / 3 / (16 / 9);

		await expect
			.poll(
				() => {
					const feeds = screen.container.querySelectorAll('.camera-feed');
					const left = (feeds[0] as HTMLElement).getBoundingClientRect().width;
					const right = (feeds[1] as HTMLElement).getBoundingClientRect().width;
					return Math.abs(left / right - expectedRatio) < 0.01;
				},
				{ timeout: 5000 }
			)
			.toBe(true);
	});
});

// NEH-228: a capture key the appliance can learn — the ownsEvent/shouldTrigger
// wiring in a real browser, dispatched against window the way svelte:window
// receives it. stubPreviewFetch({}) 404s both camera indices: these tests
// don't care what the feed shows, only that fetch never hits a real network.
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((yes) => {
		resolve = yes;
	});
	return { promise, resolve };
}

describe('LiveViewport — capture key (NEH-228)', () => {
	beforeEach(() => {
		locale.set('en');
	});

	// A stored chord set by one test must not bleed into the next — most of
	// this describe block relies on the default (space) chord.
	afterEach(() => {
		clearChord();
	});

	it('the configured key fires exactly one capture', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
		await tick();
		expect(captureSpy.mock.calls.length).toBe(1);
	});

	it('a held key (repeat) fires once', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		// The pedal held down: the browser keeps sending keydown with repeat=true.
		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
		await tick();
		expect(captureSpy.mock.calls.length).toBe(1);
	});

	it('a key pressed while a capture is in flight does not fire a second', async () => {
		const pending = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(pending.promise);
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		// Release arrives (clears the held latch) but the capture itself is
		// still in flight — a fresh press must not start a second one.
		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await tick();
		expect(captureSpy.mock.calls.length).toBe(1);

		pending.resolve({ success: true });
	});

	it('a key pressed with a focused button fires a capture and does not activate the button', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		const screen = renderViewport(baseProps());

		const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
		await zoomIn.click();
		const transform = () =>
			(screen.container.querySelector('.camera-feeds-wrapper') as HTMLElement).style.transform;
		const afterClick = transform();

		// A real, trusted keyboard event — only this proves preventDefault
		// actually suppressed the button's own Space-activates-button default;
		// a script-dispatched KeyboardEvent never carries a native default to
		// suppress in the first place.
		await userEvent.keyboard(' ');
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
		expect(transform()).toBe(afterClick);
	});

	it('releasing the modifier before the key still clears the latch (a shifted chord)', async () => {
		// Shift+2 decodes to '@' on a US layout — the chord that fires is keyed
		// on that, but the physical key never changes: code 'Digit2' throughout.
		writeChord({ key: '@', ctrl: false, alt: false, meta: false, shift: true });
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: '@', code: 'Digit2', shiftKey: true })
		);
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		// Shift lets go first: the key's own release now reports key '2', not
		// '@'. Matching against chord.key would miss this and leave the latch
		// stuck — matching against the physical code ('Digit2') still catches it.
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft' }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: '2', code: 'Digit2' }));
		await tick();

		// The latch cleared, so a fresh press of the same chord fires again.
		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: '@', code: 'Digit2', shiftKey: true })
		);
		await expect.poll(() => captureSpy.mock.calls.length).toBe(2);
	});

	it('with nothing stored, b starts exactly one capture', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'b', code: 'KeyB' }));
		await tick();
		expect(captureSpy.mock.calls.length).toBe(1);
	});

	it('with nothing stored, B with shift off (Caps Lock on) starts one capture', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', code: 'KeyB' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
	});

	it('Shift+B does not start a capture', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', code: 'KeyB', shiftKey: true }));
		await tick();
		await new Promise((r) => setTimeout(r, 100));
		expect(captureSpy.mock.calls.length).toBe(0);
	});

	it('a keyup that reports a different case from the keydown still releases the latch', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		// Caps Lock was switched on while the key was down: the release reports 'B'.
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'B', code: 'KeyB' }));
		await tick();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(2);
	});

	it('after another key is stored, neither space nor b starts a capture', async () => {
		writeChord({ key: 'x', ctrl: false, alt: false, meta: false, shift: false });
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'b', code: 'KeyB' }));
		await tick();
		await new Promise((r) => setTimeout(r, 100));
		expect(captureSpy.mock.calls.length).toBe(0);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
	});

	it('a keyup for a different physical key leaves the latch alone', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		// Some other key's release must not clear the space's latch.
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter' }));
		await tick();

		// The latch is still armed, so a fresh (non-repeat) press of the
		// configured chord must not fire a second capture.
		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
		await tick();
		expect(captureSpy.mock.calls.length).toBe(1);

		// Releasing the key that actually holds the latch clears it normally.
		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(2);
	});

	it('a press and release that both report no usable code still clears the latch (fires twice)', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
		await tick();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(2);
	});

	it('a press with a code but a release without one still clears the latch (fires twice)', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		renderViewport(baseProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);

		// The release itself carries no usable code — an unidentifiable
		// release is still a release, so the latch must not survive it.
		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
		await tick();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(2);
	});
});

// NEH-181: the record title is archival data, so the title sent at capture
// is a timestamp whatever language the operator's interface is in.
describe('LiveViewport — default record title (NEH-181)', () => {
	const ISO_LOCAL = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/;

	afterEach(() => {
		clearChord();
		locale.set('en');
	});

	for (const lang of ['es', 'en'] as const) {
		it(`single capture sends a timestamp title with the UI in ${lang}`, async () => {
			locale.set(lang);
			const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
			stubPreviewFetch({});
			renderViewport(baseProps());

			window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
			await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
			expect(captureSpy.mock.calls[0][0].record_title).toMatch(ISO_LOCAL);
		});

		it(`dual capture sends a timestamp title with the UI in ${lang}`, async () => {
			locale.set(lang);
			const dualSpy = vi.spyOn(camerasApi, 'captureDual').mockResolvedValue({ success: true });
			stubPreviewFetch({});
			renderViewport(baseProps({ cameraMode: 'double' }));

			window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
			await expect.poll(() => dualSpy.mock.calls.length).toBe(1);
			expect(dualSpy.mock.calls[0][0].record_title).toMatch(ISO_LOCAL);
		});
	}
});

describe('LiveViewport — a volume without a stem', () => {
	beforeEach(() => {
		locale.set('es');
		cameraStatus.reportSuccess();
	});

	afterEach(() => {
		clearChord();
		cameraStatus.reportSuccess();
		locale.set('en');
	});

	it('disables capture, says why and links to the volume form', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		stubPreviewFetch({});
		const screen = renderViewport(
			baseProps({
				needsStem: true,
				stemFormHref: '/dashboard/projects/1?editVolume=1'
			})
		);

		const button = screen.container.querySelector('.capture-btn') as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(button.title).toBe(es.lv_needs_stem);
		const banner = screen.container.querySelector('.needs-stem-banner') as HTMLElement;
		expect(banner.textContent).toContain(es.lv_needs_stem);
		const link = banner.querySelector('a') as HTMLAnchorElement;
		expect(link.textContent?.trim()).toBe(es.lv_needs_stem_link);
		expect(link.getAttribute('href')).toBe('/dashboard/projects/1?editVolume=1');

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
		await tick();
		expect(captureSpy).not.toHaveBeenCalled();
	});

	it('shows the note it is given in place of the link to the form (NEH-311)', async () => {
		stubPreviewFetch({});
		const screen = renderViewport(
			baseProps({
				needsStem: true,
				stemFormHref: '',
				stemNote: es.pd_fisqua_codes_readonly
			})
		);
		const banner = screen.container.querySelector('.needs-stem-banner') as HTMLElement;
		expect(banner.textContent).toContain(es.lv_needs_stem);
		expect(banner.textContent).toContain(es.pd_fisqua_codes_readonly);
		expect(banner.querySelector('a')).toBeNull();
	});

	it('on a 409 for a volume without a stem, shows no backend text in the error banner', async () => {
		const backend = 'This volume has no file name stem. Give it one before capturing into it.';
		vi.spyOn(camerasApi, 'capture').mockRejectedValue(new ApiError(backend, undefined, 409));
		const onStemRefused = vi.fn(async () => true);
		stubPreviewFetch({});
		const screen = renderViewport(baseProps({ onStemRefused }));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect.poll(() => onStemRefused.mock.calls.length).toBe(1);
		await tick();
		expect(screen.container.querySelector('.capture-error-banner')).toBeNull();
		expect(screen.container.textContent).not.toContain(backend);
	});

	it('on the 409 for a capture that names no volume, shows the catalogue error, not the backend text', async () => {
		const backend = 'Captures must go into a volume.';
		vi.spyOn(camerasApi, 'capture').mockRejectedValue(new ApiError(backend, undefined, 409));
		const onStemRefused = vi.fn(async () => false);
		stubPreviewFetch({});
		const screen = renderViewport(baseProps({ onStemRefused }));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect
			.poll(() => screen.container.querySelector('.capture-error-banner')?.textContent ?? '')
			.toContain(es.lv_err_no_volume);
		expect(screen.container.textContent).not.toContain(backend);
	});

	it('on the 409 for a retake into another volume, shows the catalogue error, not the backend text', async () => {
		const backend = "A retake must go into the record's own volume.";
		vi.spyOn(camerasApi, 'capture').mockRejectedValue(new ApiError(backend, undefined, 409));
		const onStemRefused = vi.fn(async () => false);
		stubPreviewFetch({});
		const screen = renderViewport(baseProps({ onStemRefused }));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect
			.poll(() => screen.container.querySelector('.capture-error-banner')?.textContent ?? '')
			.toContain(es.lv_err_retake_volume);
		expect(screen.container.textContent).not.toContain(backend);
	});

	it('on the no-stem 409 when the volume reads back with a stem, shows the needs-stem message', async () => {
		const backend = 'This volume has no file name stem. Give it one before capturing into it.';
		vi.spyOn(camerasApi, 'capture').mockRejectedValue(new ApiError(backend, undefined, 409));
		const onStemRefused = vi.fn(async () => false);
		stubPreviewFetch({});
		const screen = renderViewport(baseProps({ onStemRefused }));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect
			.poll(() => screen.container.querySelector('.capture-error-banner')?.textContent ?? '')
			.toContain(es.lv_needs_stem);
		expect(screen.container.textContent).not.toContain(backend);
	});

	it('on the 404 for an unknown volume, shows the catalogue error, not the backend text', async () => {
		const backend = 'Collection 7 not found';
		vi.spyOn(camerasApi, 'capture').mockRejectedValue(new ApiError(backend, undefined, 404));
		stubPreviewFetch({});
		const screen = renderViewport(baseProps({}));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect
			.poll(() => screen.container.querySelector('.capture-error-banner')?.textContent ?? '')
			.toContain(es.lv_err_volume_not_found);
		expect(screen.container.textContent).not.toContain(backend);
	});

	it('on a 409 for another reason, shows the generic capture error, not the backend text', async () => {
		const backend = 'Some other conflict';
		vi.spyOn(camerasApi, 'capture').mockRejectedValue(
			new ApiError(backend, { message: backend }, 409)
		);
		const onStemRefused = vi.fn(async () => false);
		stubPreviewFetch({});
		const screen = renderViewport(baseProps({ onStemRefused }));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect.poll(() => onStemRefused.mock.calls.length).toBe(1);
		await expect
			.poll(() => screen.container.querySelector('.capture-error-banner')?.textContent ?? '')
			.toContain(es.lv_capture_error);
		expect(screen.container.textContent).not.toContain(backend);
	});

	it('on a capture answered with success false, shows the catalogue message, not the backend error', async () => {
		vi.spyOn(camerasApi, 'capture').mockResolvedValue({
			success: false,
			error: 'Camera 0 is not connected'
		});
		stubPreviewFetch({});
		const screen = renderViewport(baseProps({}));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		await expect
			.poll(() => screen.container.querySelector('.capture-error-banner')?.textContent ?? '')
			.toContain(es.lv_err_camera_not_connected(0));
		expect(screen.container.textContent).not.toContain('Camera 0 is not connected');
	});
});

// NEH-336: the capture key is the unit's, assigned in Settings > Capture key.
// The capture screen has no control for it; it captures with the unit's key.
describe('LiveViewport — the capture key is assigned in Settings (NEH-336)', () => {
	beforeEach(() => {
		locale.set('en');
		resetUnit();
	});
	afterEach(() => {
		resetUnit();
		clearChord();
	});

	it('has no capture-key button or dialog', async () => {
		stubPreviewFetch({});
		renderViewport(baseProps());
		await expect.element(page.getByRole('button', { name: en.lv_grid_settings })).toBeVisible();
		const icons = [...document.querySelectorAll('.float-btn .material-symbols-outlined')].map(
			(el) => el.textContent?.trim()
		);
		expect(icons).not.toContain('keyboard');
		expect(document.querySelector('#capture-key-modal-title')).toBeNull();
		expect(document.body.textContent).not.toContain(en.lv_capture_key_learn);
	});

	it("captures with the unit's key, and no longer with the defaults", async () => {
		stubPreviewFetch({});
		const preview = globalThis.fetch as unknown as (input: RequestInfo | URL) => Promise<Response>;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url =
					typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
				if (new URL(url).pathname === '/system/unit')
					return new Response(
						JSON.stringify({
							mode: 'offline',
							projectsEnabled: true,
							projectsShown: true,
							defaultProjectId: null,
							prerequisites: { backup: [], fisqua: [] },
							captureKey: { key: 'F7', ctrl: false, alt: false, meta: false, shift: false }
						}),
						{ status: 200, headers: { 'Content-Type': 'application/json' } }
					);
				return preview(input);
			})
		);
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		renderViewport(baseProps());
		await expect
			.poll(() => readChords())
			.toEqual([{ key: 'F7', ctrl: false, alt: false, meta: false, shift: false }]);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7', code: 'F7', cancelable: true }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
		window.dispatchEvent(new KeyboardEvent('keyup', { key: 'F7', code: 'F7' }));
		const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', cancelable: true });
		window.dispatchEvent(space);
		expect(space.defaultPrevented).toBe(false);
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});
});

// In single-camera mode the pane, the preview and the capture use camera
// index 0; `swapped` orders a pair only, and is kept for the return to dual.
describe('LiveViewport — the swap orders a pair only', () => {
	beforeEach(() => {
		locale.set('en');
		stubPreviewFetch({ 0: { w: 40, h: 30 }, 1: { w: 40, h: 30 } });
	});

	const degrees = () =>
		[...document.querySelectorAll('.feed-rotate-deg')].map((el) => el.textContent?.trim());
	const swapButton = () =>
		document.querySelector(
			`button[aria-label="${en.lv_swap_orientation}"]`
		) as HTMLButtonElement | null;

	it('swapped in dual mode, then single: shows, turns and captures camera 0; back in dual it is still swapped', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		const dualSpy = vi.spyOn(camerasApi, 'captureDual').mockResolvedValue({ success: true });
		const onRotateDegChange = vi.fn();
		const screen = renderViewport(
			baseProps({ cameraMode: 'double', rotateDeg: { 0: 90, 1: 180 }, onRotateDegChange })
		);
		await expect.poll(() => degrees()).toEqual(['90°', '180°']);
		swapButton()!.click();
		await expect.poll(() => degrees()).toEqual(['180°', '90°']);

		await screen.rerender({ cameraMode: 'single' });
		await expect.poll(() => degrees()).toEqual(['90°']);
		(
			document.querySelector(
				`.feed-rotate-btn[aria-label="${en.lv_rotate_cw}"]`
			) as HTMLButtonElement
		).click();
		expect(onRotateDegChange).toHaveBeenLastCalledWith(0, 180);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
		await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
		expect(captureSpy.mock.calls[0][0].camera_index).toBe(0);

		await screen.rerender({ cameraMode: 'double' });
		await expect.poll(() => degrees()).toEqual(['180°', '90°']);
		expect(swapButton()?.classList.contains('float-btn-active')).toBe(true);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
		window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));
		await expect.poll(() => dualSpy.mock.calls.length).toBe(1);
		expect(dualSpy.mock.calls[0][0].left_camera_index).toBe(1);
	});
});

// NEH-379: once the roles are confirmed (`swapLocked`), the left pane shows
// the even/verso page and names the right camera, the right pane the
// odd/recto page and the left camera. Before that, capture is blocked by the
// camera step and the panes name their camera by number only; in
// single-camera mode they name neither a side nor a page.
describe('LiveViewport — pane names', () => {
	const alts = () =>
		[...document.querySelectorAll<HTMLImageElement>('img.feed-img')].map((i) =>
			i.getAttribute('alt')
		);
	const noSignal = () =>
		[...document.querySelectorAll('.no-stream > span')].map((s) => s.textContent?.trim());
	// Frames that never arrive: the panes show "No signal".
	const hangPreviews = () =>
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>(() => {}))
		);

	beforeEach(() => locale.set('en'));

	it('roles confirmed: both facts on each picture, the camera on "No signal"', async () => {
		stubPreviewFetch({ 0: { w: 40, h: 30 }, 1: { w: 40, h: 30 } });
		renderViewport(baseProps({ cameraMode: 'double', swapLocked: true, swapped: true }));
		await expect.poll(() => alts()).toEqual([en.lv_camera_left_alt, en.lv_camera_right_alt]);
		expect(alts()).toEqual(['Right camera · even/verso', 'Left camera · odd/recto']);
	});

	it('roles confirmed, no frame yet: "No signal" names the camera', async () => {
		hangPreviews();
		renderViewport(baseProps({ cameraMode: 'double', swapLocked: true }));
		await expect.poll(() => noSignal()).toEqual([en.lv_no_signal_left, en.lv_no_signal_right]);
	});

	it('roles not confirmed: the plain camera name and number of the camera in each pane', async () => {
		stubPreviewFetch({ 0: { w: 40, h: 30 }, 1: { w: 40, h: 30 } });
		renderViewport(baseProps({ cameraMode: 'double', swapLocked: false, swapped: true }));
		await expect
			.poll(() => alts())
			.toEqual([`${en.cam_fallback_name} 2`, `${en.cam_fallback_name} 1`]);
	});

	it('roles not confirmed, no frame yet: "No signal" alone', async () => {
		hangPreviews();
		renderViewport(baseProps({ cameraMode: 'double', swapLocked: false }));
		await expect.poll(() => noSignal()).toEqual([en.lv_no_signal, en.lv_no_signal]);
	});

	const feedLabels = () =>
		[...document.querySelectorAll<HTMLElement>('.feed-label')].map((l) => [
			l.textContent?.trim(),
			l.getAttribute('title')
		]);
	const cams = [
		{ index: 0, label: 'Cam A', model: 'ModelA' },
		{ index: 1, label: '', model: 'ModelB' }
	] as unknown as CameraDevice[];

	it('roles confirmed: the visible label under each picture is the both-facts label, the words and then the camera as its title', async () => {
		stubPreviewFetch({ 0: { w: 40, h: 30 }, 1: { w: 40, h: 30 } });
		renderViewport(baseProps({ cameraMode: 'double', swapLocked: true, devices: cams }));
		await expect
			.poll(() => feedLabels())
			.toEqual([
				[en.lv_camera_left_alt, `${en.lv_camera_left_alt} · Cam A`],
				[en.lv_camera_right_alt, `${en.lv_camera_right_alt} · ModelB`]
			]);
	});

	it('roles not confirmed: the visible label is the camera name and number, as the alt, the camera as its title', async () => {
		stubPreviewFetch({ 0: { w: 40, h: 30 }, 1: { w: 40, h: 30 } });
		renderViewport(baseProps({ cameraMode: 'double', swapLocked: false, devices: cams }));
		await expect
			.poll(() => feedLabels())
			.toEqual([
				[`${en.cam_fallback_name} 1`, 'Cam A'],
				[`${en.cam_fallback_name} 2`, 'ModelB']
			]);
	});

	it('single-camera mode: the camera label, no number and no brackets', async () => {
		stubPreviewFetch({ 0: { w: 40, h: 30 } });
		renderViewport(baseProps({ cameraMode: 'single', swapLocked: true, devices: cams }));
		await expect.poll(() => feedLabels()).toEqual([['Cam A', null]]);
	});

	it('single-camera mode without a device: the fallback name alone', async () => {
		stubPreviewFetch({ 0: { w: 40, h: 30 } });
		renderViewport(baseProps({ cameraMode: 'single', swapLocked: true }));
		await expect.poll(() => feedLabels()).toEqual([[en.cam_fallback_name, null]]);
	});

	it('single-camera mode: neither a side nor a page, in Spanish too', async () => {
		locale.set('es');
		stubPreviewFetch({ 0: { w: 40, h: 30 } });
		const screen = renderViewport(baseProps({ cameraMode: 'single', swapLocked: true }));
		await expect.poll(() => alts()).toEqual([es.cam_fallback_name]);
		screen.unmount();
		hangPreviews();
		renderViewport(baseProps({ cameraMode: 'single', swapLocked: true }));
		await expect.poll(() => noSignal()).toEqual([es.lv_no_signal]);
	});
});

// NEH-388: "Retake the last opening" names what it retakes by the mode on
// screen: a pair of pages with two cameras, an image with one.
describe('LiveViewport — the retake button names the mode', () => {
	for (const [lang, msgs] of [
		['en', en],
		['es', es]
	] as const) {
		for (const mode of ['double', 'single'] as const) {
			it(`${lang}, ${mode}`, async () => {
				locale.set(lang);
				vi.stubGlobal(
					'fetch',
					vi.fn(async () => new Response(null, { status: 404 }))
				);
				render(LiveViewport, {
					props: baseProps({ cameraMode: mode, retakeLast: vi.fn(async () => {}), retakeLastId: 5 })
				});
				await expect
					.element(
						page.getByRole('button', {
							name: msgs.lv_retake_last(mode === 'single'),
							exact: true
						})
					)
					.toBeVisible();
				vi.unstubAllGlobals();
			});
		}
	}
});

// NEH-388: a capture refused with a 409 asks the page to read the volume's
// stem again; when the screen leaves the volume, or goes, during that read,
// the capture writes nothing to the banner once the read answers. The gate
// is free again only after the capture's last write would have been made.
describe('LiveViewport — a 409 whose stem re-read outlives the volume', () => {
	for (const how of ['another volume', 'the viewport gone'] as const) {
		it(`${how}: nothing is written to the banner`, async () => {
			locale.set('es');
			cameraStatus.reportSuccess();
			vi.spyOn(camerasApi, 'capture').mockRejectedValue(
				new ApiError('Captures must go into a volume.', undefined, 409)
			);
			let answerStem!: (refused: boolean) => void;
			const onStemRefused = vi.fn(() => new Promise<boolean>((resolve) => (answerStem = resolve)));
			const captureGate = createCaptureGate();
			stubPreviewFetch({});
			const screen = renderViewport(baseProps({ onStemRefused, captureGate }));

			window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
			await expect.poll(() => onStemRefused.mock.calls.length).toBe(1);
			expect(captureGate.isBusy()).toBe(true);
			if (how === 'another volume') await screen.rerender({ collectionId: 2 });
			else screen.unmount();
			answerStem(false);
			// The gate is released after the capture's last write.
			await expect.poll(() => captureGate.isBusy()).toBe(false);
			expect(get(cameraStatus).captureError).toBe(false);
			expect(get(cameraStatus).errorMessage).toBeNull();
		});
	}
});

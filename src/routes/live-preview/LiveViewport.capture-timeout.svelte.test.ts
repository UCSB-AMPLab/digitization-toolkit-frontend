// NEH-381: a capture from the viewport that runs long, or ends in a timeout.
// After 10 s in flight the viewport says the unit is still working. A
// timeout of either kind, the proxy's 504 or the request layer's
// TimeoutError, is not reported as a failure: the viewport says the capture
// may have been saved, keeps the button and the capture key locked, and
// reads the volume's records again every 5 s until the capture appears (it
// then behaves as after a successful capture), or until a read that
// succeeded 180 s or more after the check began has not found it (it then
// says nothing was saved and frees the controls).
// Every other failure behaves as before. Timers are faked; the records are
// read through the `captureCheck` the page passes.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import '../../app.css';

import LiveViewport from './LiveViewport.svelte';
import { ApiError, camerasApi, type CaptureResponse } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { cameraStatus } from '$lib/stores/cameras';
import { captureBefore, createCaptureGate } from '$lib/capture-check';
import { get } from 'svelte/store';
import { clearChord } from '$lib/capture-key';

// Captured before any test fakes timers.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

async function settle() {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 10));
	}
}

// Advances the faked clock in steps, letting promises and Svelte settle.
async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
	await settle();
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

type Rec = { id: number; images: { id: number; role?: string }[] };

// The volume's records as the page holds them, and the page's read of them.
function recordsHolder(initial: Rec[]) {
	const state = { records: initial, answers: [] as (Rec[] | Error)[] };
	const read = vi.fn(async () => {
		const next = state.answers.shift();
		if (next instanceof Error) return null;
		if (next) state.records = next;
		return state.records;
	});
	const confirmed = vi.fn();
	return {
		state,
		read,
		confirmed,
		captureCheck: {
			records: () => state.records,
			snapshot: () => captureBefore(state.records),
			confirmed,
			read
		}
	};
}

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
		...overrides
	};
}

function renderViewport(props: ReturnType<typeof baseProps>) {
	const target = document.createElement('div');
	target.style.cssText = 'width: 1200px; height: 800px;';
	document.body.appendChild(target);
	return render(LiveViewport, { target, props });
}

const captureButton = () => document.querySelector('button.capture-btn') as HTMLButtonElement;
// A banner's words, without the text of its icon.
function bannerText(selector: string): string {
	const banner = document.querySelector(selector);
	if (!banner) return '';
	const copy = banner.cloneNode(true) as HTMLElement;
	copy.querySelectorAll('.material-symbols-outlined').forEach((icon) => icon.remove());
	return copy.textContent?.trim() ?? '';
}
const noteText = () => bannerText('.capture-note-banner');
const errorText = () => bannerText('.capture-error-banner');
const press = () => {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
	window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
};

const gatewayTimeout = () => new ApiError('HTTP 504', undefined, 504);
const requestTimeout = () => new DOMException(en.api_request_failed, 'TimeoutError');

beforeEach(() => {
	locale.set('en');
	cameraStatus.reportSuccess();
	// Every preview and capabilities request fails at once; the capture
	// itself is mocked on camerasApi.
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(null, { status: 404 }))
	);
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	clearChord();
	cameraStatus.reportSuccess();
});

describe('LiveViewport — a capture that runs long (NEH-381)', () => {
	it('after 10 s says the unit is still working, then succeeds normally at 12 s', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const { read, captureCheck } = recordsHolder([]);
		const props = baseProps({ captureCheck });
		renderViewport(props);
		await settle();

		press();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(1);
		await advance(9_999);
		expect(noteText()).toBe('');
		await advance(1);
		expect(noteText()).toBe(en.lv_capture_still_working);
		expect(captureButton().disabled).toBe(true);

		await advance(2_000);
		answer.resolve({ success: true, record_id: 1, image_ids: [10] });
		await settle();
		expect(noteText()).toBe('');
		expect(errorText()).toBe('');
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(captureButton().disabled).toBe(false);
		expect(read).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});
});

describe('LiveViewport — a capture that ends in a timeout (NEH-381)', () => {
	for (const [name, timeout] of [
		["the proxy's 504", gatewayTimeout],
		["the request layer's TimeoutError", requestTimeout]
	] as const) {
		it(`${name} at 120 s, then the record at the second read: a success, and no second capture`, async () => {
			const answer = deferred<CaptureResponse>();
			const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
			const holder = recordsHolder([{ id: 1, images: [{ id: 10 }] }]);
			const props = baseProps({ captureCheck: holder.captureCheck });
			renderViewport(props);
			await settle();

			press();
			await settle();
			await advance(120_000);
			answer.reject(timeout());
			await settle();
			expect(noteText()).toBe(en.lv_capture_maybe_saved);
			expect(errorText()).toBe('');
			expect(document.body.textContent).not.toContain(en.lv_capture_error);
			expect(captureButton().disabled).toBe(true);

			holder.state.answers = [
				[{ id: 1, images: [{ id: 10 }] }],
				[
					{ id: 1, images: [{ id: 10 }] },
					{ id: 2, images: [{ id: 20 }] }
				]
			];
			await advance(4_999);
			expect(holder.read).toHaveBeenCalledTimes(0);
			await advance(1);
			expect(holder.read).toHaveBeenCalledTimes(1);
			expect(noteText()).toBe(en.lv_capture_maybe_saved);
			await advance(5_000);
			expect(holder.read).toHaveBeenCalledTimes(2);
			expect(noteText()).toBe(en.lv_capture_found);
			expect(errorText()).toBe('');
			expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
			expect(captureButton().disabled).toBe(false);

			await advance(60_000);
			expect(holder.read).toHaveBeenCalledTimes(2);
			expect(captureSpy).toHaveBeenCalledTimes(1);
		});
	}

	it('a dual capture: the new record with both pages counts, as a pair', async () => {
		const answer = deferred<CaptureResponse>();
		const dualSpy = vi.spyOn(camerasApi, 'captureDual').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		const props = baseProps({ cameraMode: 'double', captureCheck: holder.captureCheck });
		renderViewport(props);
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		holder.state.answers = [
			[
				{
					id: 7,
					images: [
						{ id: 70, role: 'left' },
						{ id: 71, role: 'right' }
					]
				}
			]
		];
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_found);
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(dualSpy).toHaveBeenCalledTimes(1);
	});

	it('nothing appears: still locked just before 180 s from the start of the check, then freed with the not-saved message', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([{ id: 1, images: [{ id: 10 }] }]);
		const props = baseProps({ captureCheck: holder.captureCheck });
		renderViewport(props);
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(179_999);
		expect(captureButton().disabled).toBe(true);
		expect(noteText()).toBe(en.lv_capture_maybe_saved);
		await advance(1);
		expect(captureButton().disabled).toBe(false);
		expect(noteText()).toBe('');
		expect(errorText()).toBe(en.lv_capture_not_saved);
		expect(props.onCaptureDone).not.toHaveBeenCalled();
		// Reads at 125 s, 130 s ... 300 s.
		expect(holder.read).toHaveBeenCalledTimes(36);
		expect(captureSpy).toHaveBeenCalledTimes(1);

		// The controls are free: the next press sends the next capture.
		captureSpy.mockResolvedValue({ success: true, record_id: 2, image_ids: [20] });
		press();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(2);
	});

	it("the request layer's TimeoutError at 300 s: the whole loop runs, and a capture committed 60 s later is found", async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		const props = baseProps({ captureCheck: holder.captureCheck });
		renderViewport(props);
		await settle();

		press();
		await settle();
		await advance(300_000);
		answer.reject(requestTimeout());
		await settle();
		await advance(55_000);
		expect(noteText()).toBe(en.lv_capture_maybe_saved);
		expect(errorText()).toBe('');
		expect(captureButton().disabled).toBe(true);
		holder.state.answers = [[{ id: 4, images: [{ id: 40 }] }]];
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_found);
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(holder.read).toHaveBeenCalledTimes(12);
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});

	it('a failed read at the end of the window does not show not-saved: the next successful read decides', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(179_999);
		// The read at the end of the window and the next one fail.
		holder.state.answers = [new Error('offline'), new Error('offline')];
		await advance(1);
		await advance(5_000);
		expect(errorText()).toBe('');
		expect(noteText()).toBe(en.lv_capture_maybe_saved);
		expect(captureButton().disabled).toBe(true);
		await advance(5_000);
		expect(errorText()).toBe(en.lv_capture_not_saved);
		expect(captureButton().disabled).toBe(false);
	});

	it('a failed read does not end the check', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		holder.state.answers = [new Error('offline'), [{ id: 3, images: [{ id: 30 }] }]];
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_maybe_saved);
		expect(captureButton().disabled).toBe(true);
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_found);
	});

	it('while checking, neither the button nor the capture key sends a request', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);

		captureButton().click();
		press();
		await settle();
		await advance(5_000);
		press();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});

	it('leaving during the check stops its timers: no read after the viewport is gone', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(holder.read).toHaveBeenCalledTimes(1);

		screen.unmount();
		await settle();
		expect(vi.getTimerCount()).toBe(0);
		await advance(240_000);
		expect(holder.read).toHaveBeenCalledTimes(1);
	});

	it('another volume during the check stops it: no read after the change, the controls free', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(holder.read).toHaveBeenCalledTimes(1);

		await screen.rerender({ collectionId: 2 });
		await settle();
		await advance(240_000);
		expect(holder.read).toHaveBeenCalledTimes(1);
		expect(noteText()).toBe('');
		expect(errorText()).toBe('');
		expect(captureButton().disabled).toBe(false);
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});
});

describe('LiveViewport — a capture belongs to the volume it began in (NEH-381)', () => {
	it('another volume while the request is pending: its timeout starts no check, shows nothing and locks nothing', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(60_000);
		await screen.rerender({ collectionId: 2 });
		await settle();
		await advance(60_000);
		answer.reject(gatewayTimeout());
		await settle();
		expect(noteText()).toBe('');
		expect(errorText()).toBe('');
		expect(captureButton().disabled).toBe(false);
		await advance(60_000);
		expect(holder.read).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});

	it('another volume before 10 s: the still-working line never shows', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(5_000);
		await screen.rerender({ collectionId: 2 });
		await settle();
		await advance(10_000);
		expect(get(cameraStatus).notice).toBeNull();
		expect(noteText()).toBe('');
	});

	it('unmounted before 10 s: the still-working timer writes nothing into the shared camera status', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = recordsHolder([]);
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(5_000);
		screen.unmount();
		await settle();
		await advance(10_000);
		expect(get(cameraStatus).notice).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('LiveViewport — the capture gate (NEH-381)', () => {
	it('with the gate held elsewhere and the button not disabled, neither the button nor the key sends a capture', async () => {
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true });
		const captureGate = createCaptureGate();
		const hold = captureGate.acquire()!;
		const holder = recordsHolder([]);
		renderViewport(
			baseProps({ captureCheck: holder.captureCheck, captureGate, captureBusy: false })
		);
		await settle();
		expect(captureButton().disabled).toBe(false);
		captureButton().click();
		press();
		await settle();
		expect(captureSpy).not.toHaveBeenCalled();
		hold();
	});
});

describe('LiveViewport — every other failure behaves as before (NEH-381)', () => {
	const cases: [string, () => Promise<CaptureResponse>, string][] = [
		[
			'a 500',
			() => Promise.reject(new ApiError('Internal Server Error', undefined, 500)),
			en.lv_capture_error
		],
		['a 502', () => Promise.reject(new ApiError('HTTP 502', undefined, 502)), en.lv_capture_error],
		[
			'a 409',
			() => Promise.reject(new ApiError('Some other conflict', undefined, 409)),
			en.lv_capture_error
		],
		[
			'a 404',
			() => Promise.reject(new ApiError('Collection 7 not found', undefined, 404)),
			en.lv_err_volume_not_found
		],
		[
			'success false',
			() => Promise.resolve({ success: false, error: 'Camera 0 is not connected' }),
			en.lv_err_camera_not_connected(0)
		],
		['a network error', () => Promise.reject(new TypeError('Failed to fetch')), en.lv_capture_error]
	];
	for (const [name, answer, message] of cases) {
		it(`${name}: the failure message at once, the controls free, no read of the records`, async () => {
			const captureSpy = vi.spyOn(camerasApi, 'capture').mockImplementation(answer);
			const holder = recordsHolder([]);
			const props = baseProps({
				captureCheck: holder.captureCheck,
				onStemRefused: vi.fn(async () => false)
			});
			renderViewport(props);
			await settle();

			press();
			await settle();
			expect(errorText()).toBe(message);
			expect(noteText()).toBe('');
			expect(captureButton().disabled).toBe(false);
			await advance(240_000);
			expect(holder.read).not.toHaveBeenCalled();
			expect(props.onCaptureDone).not.toHaveBeenCalled();
			expect(captureSpy).toHaveBeenCalledTimes(1);
		});
	}
});

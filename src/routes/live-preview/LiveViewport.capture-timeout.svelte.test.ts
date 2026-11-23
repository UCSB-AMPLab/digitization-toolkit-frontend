// NEH-381, NEH-401: a capture from the viewport that runs long, or ends in a
// timeout. After 10 s in flight the viewport says the unit is still working.
// Every capture request carries a fresh client_capture_id. A timeout of
// either kind, the proxy's 504 or the request layer's TimeoutError, or a 409
// capture_in_progress, is not reported as a failure: the viewport says the
// capture may have been saved, keeps the button and the capture key locked,
// and asks GET /cameras/capture-requests/{id} for that id every 5 s. Stored,
// it behaves as after a successful capture; a 404 not_found says nothing
// was saved; asks that fail for 180 s, an answer of in progress for 15
// minutes, or a backend without the route say the outcome is unknown.
// Every other failure behaves as before. Timers are faked; the capture and
// the ask are mocked on camerasApi.
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
import { createCaptureGate } from '$lib/capture-check';
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The answers of GET /cameras/capture-requests/{id}, and the ask: each call
// takes the next of `answers` (an Error rejects), the last one again once
// they run out.
const stored = (recordId: number, imageIds: number[]) => ({
	success: true,
	record_id: recordId,
	image_ids: imageIds,
	timing: null,
	error: null,
	replayed: true,
	in_progress: false as const
});
const running = { in_progress: true as const };
const gone = () =>
	new ApiError(
		'An image of the capture saved with this id has been deleted.',
		{ code: 'capture_no_longer_stored', message: 'x' },
		410
	);
const notFound = () =>
	new ApiError('Not found.', { code: 'not_found', message: 'Not found.' }, 404);
// FastAPI's 404 for a route it does not have: a string detail, not kept.
const noRoute = () => new ApiError('Not Found', undefined, 404);
const inProgress = () =>
	new ApiError(
		'A capture with this id is still running.',
		{ code: 'capture_in_progress', message: 'A capture with this id is still running.' },
		409
	);

function asker(...initial: unknown[]) {
	const answers = [...initial];
	const lookup = vi.spyOn(camerasApi, 'captureRequest').mockImplementation(async () => {
		const next = answers.length > 1 ? answers.shift() : answers[0];
		if (next instanceof Error) throw next;
		return next as Awaited<ReturnType<typeof camerasApi.captureRequest>>;
	});
	const confirmed = vi.fn();
	// The page's read of the records; records whether the capture button was still locked.
	const lockedAtReread: boolean[] = [];
	const reread = vi.fn(async () => {
		lockedAtReread.push(
			(document.querySelector('button.capture-btn') as HTMLButtonElement | null)?.disabled ?? false
		);
		return true;
	});
	return {
		answers,
		lookup,
		confirmed,
		reread,
		lockedAtReread,
		captureCheck: { confirmed, reread }
	};
}

// The client_capture_id each capture request carried.
const sentIds = (spy: { mock: { calls: unknown[][] } }) =>
	spy.mock.calls.map((c) => (c[0] as { client_capture_id?: string }).client_capture_id);

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
	// The check measures its durations on the monotonic clock (performance).
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
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
		const { lookup, captureCheck } = asker(running);
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
		expect(lookup).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});
});

describe('LiveViewport — every capture carries its own id (NEH-401)', () => {
	it('single and dual: a lower-case UUID, a new one for each attempt', async () => {
		const single = vi
			.spyOn(camerasApi, 'capture')
			.mockResolvedValue({ success: true, record_id: 1, image_ids: [10] });
		const screen = renderViewport(baseProps());
		await settle();
		press();
		await settle();
		press();
		await settle();
		const [a, b] = sentIds(single);
		expect(a).toMatch(UUID);
		expect(b).toMatch(UUID);
		expect(a).not.toBe(b);
		screen.unmount();

		const dual = vi
			.spyOn(camerasApi, 'captureDual')
			.mockResolvedValue({ success: true, record_id: 2, image_ids: [20, 21] });
		renderViewport(baseProps({ cameraMode: 'double' }));
		await settle();
		press();
		await settle();
		const [c] = sentIds(dual);
		expect(c).toMatch(UUID);
		expect([a, b]).not.toContain(c);
	});
});

describe('LiveViewport — a capture that ends in a timeout (NEH-381, NEH-401)', () => {
	for (const [name, timeout] of [
		["the proxy's 504", gatewayTimeout],
		["the request layer's TimeoutError", requestTimeout]
	] as const) {
		it(`${name} at 120 s, then the capture stored at the second ask: a success, and no second capture`, async () => {
			const answer = deferred<CaptureResponse>();
			const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
			const holder = asker(running, stored(2, [20]));
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

			await advance(4_999);
			expect(holder.lookup).toHaveBeenCalledTimes(0);
			await advance(1);
			expect(holder.lookup).toHaveBeenCalledTimes(1);
			expect(noteText()).toBe(en.lv_capture_maybe_saved);
			await advance(5_000);
			expect(holder.lookup).toHaveBeenCalledTimes(2);
			// The ask names the id the request carried.
			const [id] = sentIds(captureSpy);
			expect(id).toMatch(UUID);
			expect(holder.lookup.mock.calls.map((c) => c[0])).toEqual([id, id]);
			expect(noteText()).toBe(en.lv_capture_found);
			expect(errorText()).toBe('');
			expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
			expect(holder.confirmed).toHaveBeenCalledWith(2, [20]);
			expect(captureButton().disabled).toBe(false);

			await advance(60_000);
			expect(holder.lookup).toHaveBeenCalledTimes(2);
			expect(captureSpy).toHaveBeenCalledTimes(1);
		});
	}

	it('a dual capture: the stored answer counts as the pair, its image ids in camera order', async () => {
		const answer = deferred<CaptureResponse>();
		const dualSpy = vi.spyOn(camerasApi, 'captureDual').mockReturnValue(answer.promise);
		const holder = asker(stored(7, [70, 71]));
		const props = baseProps({ cameraMode: 'double', captureCheck: holder.captureCheck });
		renderViewport(props);
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_found);
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(holder.confirmed).toHaveBeenCalledWith(7, [70, 71]);
		expect(holder.lookup.mock.calls[0][0]).toBe(sentIds(dualSpy)[0]);
		expect(dualSpy).toHaveBeenCalledTimes(1);
	});

	it('the backend no longer knows the id: not saved at the first ask, the controls free, the next capture a new id', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(notFound());
		const props = baseProps({ captureCheck: holder.captureCheck });
		renderViewport(props);
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		expect(captureButton().disabled).toBe(true);
		await advance(5_000);
		expect(captureButton().disabled).toBe(false);
		expect(noteText()).toBe('');
		expect(errorText()).toBe(en.lv_capture_not_saved);
		expect(props.onCaptureDone).not.toHaveBeenCalled();
		expect(holder.lookup).toHaveBeenCalledTimes(1);

		captureSpy.mockResolvedValue({ success: true, record_id: 2, image_ids: [20] });
		press();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		const [first, second] = sentIds(captureSpy);
		expect(second).toMatch(UUID);
		expect(second).not.toBe(first);
	});

	it('in progress past 180 s: still locked, nothing captured by button or key, then the capture stored at 400 s', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(running);
		const props = baseProps({ captureCheck: holder.captureCheck });
		renderViewport(props);
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(200_000);
		expect(noteText()).toBe(en.lv_capture_maybe_saved);
		expect(errorText()).toBe('');
		expect(captureButton().disabled).toBe(true);
		captureButton().click();
		press();
		await settle();
		await advance(195_000);
		press();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(1);

		holder.answers.splice(0, holder.answers.length, stored(4, [40]));
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_found);
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(holder.lookup).toHaveBeenCalledTimes(80);
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});

	it('in progress for 15 minutes: the outcome is unknown, never not saved, and the controls free', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(running);
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(899_999);
		expect(captureButton().disabled).toBe(true);
		await advance(1);
		expect(errorText()).toBe(en.lv_capture_unknown('new', true));
		expect(errorText()).not.toBe(en.lv_capture_not_saved);
		expect(captureButton().disabled).toBe(false);
	});

	it('asks that fail (a 500, the network): locked until 180 s from the start of the check, then unknown, never not saved', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(
			new ApiError('Internal Server Error', undefined, 500),
			new TypeError('Failed to fetch')
		);
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
		expect(errorText()).toBe('');
		await advance(1);
		expect(captureButton().disabled).toBe(false);
		expect(noteText()).toBe('');
		expect(errorText()).toBe(en.lv_capture_unknown('new', true));
		expect(props.onCaptureDone).not.toHaveBeenCalled();
		// Asks at 125 s, 130 s ... 300 s.
		expect(holder.lookup).toHaveBeenCalledTimes(36);
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});

	it('a failed ask does not end the check: the next answer decides', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(new TypeError('Failed to fetch'), stored(3, [30]));
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_maybe_saved);
		expect(captureButton().disabled).toBe(true);
		await advance(5_000);
		expect(noteText()).toBe(en.lv_capture_found);
	});

	it('a backend without the lookup route: unknown at the first ask, never not saved', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(noRoute());
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(errorText()).toBe(en.lv_capture_unknown('new', true));
		expect(captureButton().disabled).toBe(false);
		expect(holder.lookup).toHaveBeenCalledTimes(1);
	});

	it('a 409 capture_in_progress (the request sent twice) is checked as a timeout is', async () => {
		vi.spyOn(camerasApi, 'capture').mockRejectedValue(inProgress());
		const holder = asker(running, stored(5, [50]));
		const onStemRefused = vi.fn(async () => false);
		const props = baseProps({ captureCheck: holder.captureCheck, onStemRefused });
		renderViewport(props);
		await settle();

		press();
		await settle();
		expect(noteText()).toBe(en.lv_capture_maybe_saved);
		expect(errorText()).toBe('');
		await advance(10_000);
		expect(noteText()).toBe(en.lv_capture_found);
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(onStemRefused).not.toHaveBeenCalled();
	});

	it('a 409 capture_abandoned: not saved for this attempt, with no ask; the next press a new id', async () => {
		const abandoned = () => new ApiError('x', { code: 'capture_abandoned', message: 'x' }, 409);
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockRejectedValue(abandoned());
		const holder = asker(running);
		const onStemRefused = vi.fn(async () => false);
		renderViewport(baseProps({ captureCheck: holder.captureCheck, onStemRefused }));
		await settle();

		press();
		await settle();
		expect(errorText()).toBe(en.lv_capture_not_saved);
		expect(noteText()).toBe('');
		expect(captureButton().disabled).toBe(false);
		expect(onStemRefused).not.toHaveBeenCalled();

		captureSpy.mockResolvedValue({ success: true, record_id: 2, image_ids: [20] });
		press();
		await settle();
		const [first, second] = sentIds(captureSpy);
		expect(second).toMatch(UUID);
		expect(second).not.toBe(first);
		await advance(60_000);
		expect(holder.lookup).not.toHaveBeenCalled();
	});

	it('a late 409 capture_abandoned, after the screen moved to another volume, writes nothing and leaves the newer capture alone', async () => {
		const late = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValueOnce(late.promise);
		const holder = asker(running);
		const props = baseProps({ captureCheck: holder.captureCheck });
		const screen = renderViewport(props);
		await settle();

		press();
		await settle();
		await screen.rerender({ collectionId: 2 });
		await settle();
		late.reject(new ApiError('x', { code: 'capture_abandoned', message: 'x' }, 409));
		await settle();
		expect(errorText()).toBe('');
		expect(noteText()).toBe('');

		// The newer capture, on the volume now on screen, succeeds; nothing of the old one shows.
		captureSpy.mockResolvedValue({ success: true, record_id: 9, image_ids: [90] });
		press();
		await settle();
		expect(captureSpy).toHaveBeenCalledTimes(2);
		expect(errorText()).toBe('');
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(holder.confirmed).toHaveBeenCalledWith(9, [90]);
		expect(holder.lookup).not.toHaveBeenCalled();
	});

	for (const code of ['client_capture_id_in_use', 'capture_no_longer_stored']) {
		it(`a 409 ${code}: the generic failure at once, logged, with no ask`, async () => {
			const refusal = new ApiError('x', { code, message: 'x' }, 409);
			vi.spyOn(camerasApi, 'capture').mockRejectedValue(refusal);
			const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
			const holder = asker(running);
			renderViewport(
				baseProps({ captureCheck: holder.captureCheck, onStemRefused: vi.fn(async () => false) })
			);
			await settle();

			press();
			await settle();
			expect(errorText()).toBe(en.lv_capture_error);
			expect(captureButton().disabled).toBe(false);
			expect(logged.mock.calls.some((c) => c.includes(refusal))).toBe(true);
			await advance(60_000);
			expect(holder.lookup).not.toHaveBeenCalled();
		});
	}

	// A capture whose check ends as unknown: the asks fail for 180 s.
	async function endsUnknown(holder: ReturnType<typeof asker>) {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValueOnce(answer.promise);
		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(180_000);
		expect(errorText()).toBe(en.lv_capture_unknown('new', true));
		return { captureSpy, id: sentIds(captureSpy)[0] as string };
	}

	it('unknown: the records are read again before the controls are free', async () => {
		const holder = asker(new TypeError('Failed to fetch'));
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();
		await endsUnknown(holder);
		expect(holder.reread).toHaveBeenCalledTimes(1);
		expect(holder.lockedAtReread).toEqual([true]);
		expect(captureButton().disabled).toBe(false);
	});

	it('unknown, then the capture stored two minutes later: found in the background, with the records read and the last record set', async () => {
		const holder = asker(new TypeError('Failed to fetch'));
		const props = baseProps({ captureCheck: holder.captureCheck });
		renderViewport(props);
		await settle();
		const { id } = await endsUnknown(holder);
		const asks = holder.lookup.mock.calls.length;
		holder.answers.splice(0, holder.answers.length, running);
		await advance(105_000);
		expect(holder.lookup.mock.calls.length).toBe(asks + 7);
		expect(captureButton().disabled).toBe(false);
		holder.answers.splice(0, holder.answers.length, stored(6, [60]));
		await advance(15_000);
		expect(holder.lookup.mock.calls.every((c) => c[0] === id)).toBe(true);
		// Completed as a success is: confirmed, and the records read through onCaptureDone.
		expect(holder.confirmed).toHaveBeenCalledWith(6, [60]);
		expect(props.onCaptureDone).toHaveBeenCalledTimes(1);
		expect(holder.reread).toHaveBeenCalledTimes(1);
		expect(errorText()).toBe('');
		expect(noteText()).toBe(en.lv_capture_found);
		await advance(120_000);
		expect(holder.lookup.mock.calls.length).toBe(asks + 8);
	});

	it("unknown, then a newer capture fails: the background answer refreshes the records but leaves the newer capture's banner", async () => {
		const holder = asker(new TypeError('Failed to fetch'));
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();
		const { captureSpy } = await endsUnknown(holder);
		captureSpy.mockRejectedValueOnce(new ApiError('Internal Server Error', undefined, 500));
		press();
		await settle();
		expect(errorText()).toBe(en.lv_capture_error);
		holder.answers.splice(0, holder.answers.length, stored(6, [60]));
		await advance(15_000);
		// Only the records are read again: the newer capture keeps the last record and the banner.
		expect(holder.reread).toHaveBeenCalledTimes(2);
		expect(holder.confirmed).not.toHaveBeenCalledWith(6, [60]);
		expect(errorText()).toBe(en.lv_capture_error);
		expect(noteText()).toBe('');
	});

	it('unknown, then another failure in the banner: the capture found later leaves that failure', async () => {
		const holder = asker(new TypeError('Failed to fetch'));
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();
		await endsUnknown(holder);
		cameraStatus.reportFailure('Another failure');
		await settle();
		holder.answers.splice(0, holder.answers.length, stored(6, [60]));
		await advance(15_000);
		expect(holder.confirmed).toHaveBeenCalledWith(6, [60]);
		expect(errorText()).toBe('Another failure');
	});

	it('unknown, then the viewport goes: the background asks stop, with no timer left', async () => {
		const holder = asker(new TypeError('Failed to fetch'));
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();
		await endsUnknown(holder);
		await advance(15_000);
		const asks = holder.lookup.mock.calls.length;
		screen.unmount();
		await settle();
		expect(vi.getTimerCount()).toBe(0);
		await advance(600_000);
		expect(holder.lookup.mock.calls.length).toBe(asks);
	});

	it('unknown, then another volume: the background asks stop', async () => {
		const holder = asker(new TypeError('Failed to fetch'));
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();
		await endsUnknown(holder);
		const asks = holder.lookup.mock.calls.length;
		await screen.rerender({ collectionId: 2 });
		await settle();
		holder.answers.splice(0, holder.answers.length, stored(6, [60]));
		await advance(600_000);
		expect(holder.lookup.mock.calls.length).toBe(asks);
		expect(holder.confirmed).not.toHaveBeenCalled();
	});

	it('a stored capture with an image deleted since (410): unknown, the records read again, and no background asks', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(gone());
		renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();
		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(errorText()).toBe(en.lv_capture_unknown('new', true));
		expect(errorText()).not.toBe(en.lv_capture_not_saved);
		expect(holder.reread).toHaveBeenCalledTimes(1);
		await advance(600_000);
		expect(holder.lookup).toHaveBeenCalledTimes(1);
	});

	it('dual mode: the unknown message names the last opening', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'captureDual').mockReturnValue(answer.promise);
		const holder = asker(noRoute());
		renderViewport(baseProps({ cameraMode: 'double', captureCheck: holder.captureCheck }));
		await settle();
		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(errorText()).toBe(en.lv_capture_unknown('new', false));
	});

	it('leaving during the check stops its timers: no ask after the viewport is gone', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(running);
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(holder.lookup).toHaveBeenCalledTimes(1);

		screen.unmount();
		await settle();
		expect(vi.getTimerCount()).toBe(0);
		await advance(240_000);
		expect(holder.lookup).toHaveBeenCalledTimes(1);
	});

	it('another volume during the check stops it: no ask after the change, the controls free', async () => {
		const answer = deferred<CaptureResponse>();
		const captureSpy = vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(running);
		const screen = renderViewport(baseProps({ captureCheck: holder.captureCheck }));
		await settle();

		press();
		await settle();
		await advance(120_000);
		answer.reject(gatewayTimeout());
		await settle();
		await advance(5_000);
		expect(holder.lookup).toHaveBeenCalledTimes(1);

		await screen.rerender({ collectionId: 2 });
		await settle();
		await advance(240_000);
		expect(holder.lookup).toHaveBeenCalledTimes(1);
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
		const holder = asker(running);
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
		expect(holder.lookup).not.toHaveBeenCalled();
		expect(captureSpy).toHaveBeenCalledTimes(1);
	});

	it('another volume before 10 s: the still-working line never shows', async () => {
		const answer = deferred<CaptureResponse>();
		vi.spyOn(camerasApi, 'capture').mockReturnValue(answer.promise);
		const holder = asker(running);
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
		const holder = asker(running);
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
		const holder = asker(running);
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
		it(`${name}: the failure message at once, the controls free, no ask for the capture`, async () => {
			const captureSpy = vi.spyOn(camerasApi, 'capture').mockImplementation(answer);
			const holder = asker(running);
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
			expect(holder.lookup).not.toHaveBeenCalled();
			expect(props.onCaptureDone).not.toHaveBeenCalled();
			expect(captureSpy).toHaveBeenCalledTimes(1);
		});
	}
});

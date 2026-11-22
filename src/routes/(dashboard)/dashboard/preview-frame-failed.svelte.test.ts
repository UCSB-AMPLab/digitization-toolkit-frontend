// NEH-349: on the overview's camera test panel, a camera that is connected
// but sent no preview frame answers 503 with detail.code
// preview_frame_failed. The panel keeps the last frame and goes on polling;
// only a run of such answers lasting 30 s (the same as on the capture screen) shows the
// "connected, no image" text, with the badge still saying OK, and one good
// frame clears it. A no-frame answer also clears "Not detected" left by an
// earlier 404. A 404 and a 503 without the code behave as they did before.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/stores/auth', () => ({
	authStore: {
		subscribe: (run: (state: unknown) => void) => {
			run({ user: { username: 'Operator', role: 'operator' } });
			return () => {};
		},
		isAuthenticated: () => true
	}
}));

import Dashboard from './+page.svelte';
import { camerasApi, projectsApi, collectionsApi, recordsApi, type CameraDevice } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';

// The overview's PREVIEW_INTERVAL_MS and the shared NO_FRAME_SECONDS. The
// run's first answer starts the clock, so the text shows with the answer
// that arrives NO_FRAME_SECONDS later: the RUN_LIMIT-th.
const INTERVAL_MS = 2500;
const NO_FRAME_SECONDS = 30;
const RUN_LIMIT = (NO_FRAME_SECONDS * 1000) / INTERVAL_MS + 1;
const NO_IMAGE_EN =
	'The camera is connected but is not sending an image. Turn the camera off and on again. If that does not help, unplug its USB cable and plug it back in.';

const devices: CameraDevice[] = [
	{ index: 0, model: 'Body left', hardware_id: 'left', calibrated: false },
	{ index: 1, model: 'Body right', hardware_id: 'right', calibrated: false }
];
const FAILED = {
	code: 'preview_frame_failed',
	message: 'The camera is connected but did not send a preview frame.'
};

type Answer = 'frame' | 'no-frame' | 'busy-503' | 'missing' | 'network';

function stubCameras(answers: Record<number, Answer>) {
	const calls: number[] = [];
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
			if (!match) return new Response('{}', { status: 500 });
			const idx = Number(match[1]);
			calls.push(idx);
			const json = (body: unknown, status: number) =>
				new Response(JSON.stringify(body), {
					status,
					headers: { 'Content-Type': 'application/json' }
				});
			switch (answers[idx]) {
				case 'frame':
					return new Response(new Blob([`frame ${calls.length}`], { type: 'image/jpeg' }), {
						status: 200
					});
				case 'no-frame':
					return json({ detail: FAILED }, 503);
				case 'busy-503':
					return json({ detail: 'Capture system not available: no module' }, 503);
				case 'network':
					throw new TypeError('Failed to fetch');
				default:
					return json({ detail: `Camera ${idx} not found` }, 404);
			}
		})
	);
	return calls;
}

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle() {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise((r) => realSetTimeout(r, 20));
	}
}

async function poll(n: number) {
	for (let i = 0; i < n; i++) {
		vi.advanceTimersByTime(INTERVAL_MS);
		await settle();
	}
}

// Panel `left` (camera 1 when no set-up is confirmed) open and its preview running.
async function testing(answers: Record<number, Answer>) {
	const calls = stubCameras(answers);
	const screen = render(Dashboard);
	const left = screen.getByRole('button', { name: /Camera 1/ });
	const right = screen.getByRole('button', { name: /Camera 2/ });
	await expect.element(left).toHaveTextContent('OK');
	await left.click();
	await screen.getByRole('button', { name: en.dash_camera_test, exact: true }).click();
	await expect.poll(() => screen.container.querySelector('img.preview-img')).not.toBeNull();
	await settle();
	return { calls, screen, left, right };
}

const issueLine = (c: HTMLElement) =>
	[...c.querySelectorAll('.capture-status')].map((e) => e.textContent ?? '').join(' ');
const hint = (c: HTMLElement) => c.querySelector('.cam-hint')?.textContent ?? null;
const count = (calls: number[], cam: number) => calls.filter((c) => c === cam).length;

beforeEach(() => {
	locale.set('en');
	vi.spyOn(projectsApi, 'list').mockResolvedValue([]);
	vi.spyOn(collectionsApi, 'count').mockResolvedValue(0);
	vi.spyOn(collectionsApi, 'listAll').mockResolvedValue([]);
	vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
	vi.spyOn(recordsApi, 'toRetakeSummary').mockRejectedValue(new Error('not needed'));
	vi.spyOn(camerasApi, 'getCapabilities').mockRejectedValue(new Error('not needed'));
	vi.spyOn(camerasApi, 'listDevices').mockResolvedValue(devices);
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('overview camera panel — a connected camera that sent no frame (NEH-349)', () => {
	it('keeps the last frame, goes on polling and says nothing is wrong', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { calls, screen, left } = await testing(answers);
		const shown = (screen.container.querySelector('img.preview-img') as HTMLImageElement).src;
		answers[0] = 'no-frame';
		const before = count(calls, 0);
		await poll(RUN_LIMIT - 1);
		expect(count(calls, 0) - before).toBe(RUN_LIMIT - 1);
		expect(
			(screen.container.querySelector('img.preview-img') as HTMLImageElement | null)?.src
		).toBe(shown);
		expect(issueLine(screen.container)).not.toContain(en.dash_camera_preview_error);
		await expect.element(left).toHaveTextContent('OK');
		expect(screen.container.querySelector('.cam-hint')).toBeNull();
	});

	it(`after ${RUN_LIMIT} answers in a row says the camera is connected without an image, badge not "not detected", keeps polling, leaves the other camera alone`, async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { calls, screen, left, right } = await testing(answers);
		answers[0] = 'no-frame';
		await poll(RUN_LIMIT - 1);
		expect(hint(screen.container)).toBeNull();
		await poll(1);
		await expect.poll(() => hint(screen.container)).toBe(en.lv_camera_no_image);
		expect(hint(screen.container)).toBe(NO_IMAGE_EN);
		expect(hint(screen.container)).not.toContain('not detected');
		await expect.element(left).not.toHaveTextContent(en.camera_not_detected);
		await expect.element(left).toHaveTextContent('OK');
		await expect.element(right).toHaveTextContent('OK');
		expect(screen.container.querySelector('img.preview-img')).not.toBeNull();
		const before = count(calls, 0);
		await poll(2);
		expect(count(calls, 0) - before).toBe(2);
	});

	it('the text is in Spanish when the interface is', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen } = await testing(answers);
		locale.set('es');
		answers[0] = 'no-frame';
		await poll(RUN_LIMIT);
		await expect.poll(() => hint(screen.container)).toBe(es.lv_camera_no_image);
	});

	it('one good frame clears it', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen, left } = await testing(answers);
		answers[0] = 'no-frame';
		await poll(RUN_LIMIT);
		await expect.poll(() => hint(screen.container)).toBe(en.lv_camera_no_image);
		answers[0] = 'frame';
		await poll(1);
		await expect.poll(() => hint(screen.container)).toBeNull();
		await expect.element(left).toHaveTextContent('OK');
	});

	it('a 404 then a no-frame answer removes "Not detected" at once', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen, left } = await testing(answers);
		answers[0] = 'missing';
		await poll(1);
		await expect.element(left).toHaveTextContent(en.camera_not_detected);
		expect(hint(screen.container)).toBe(en.dash_camera_missing_hint(en.dash_camera_n(1)));
		answers[0] = 'no-frame';
		await screen.getByRole('button', { name: en.dash_camera_test, exact: true }).click();
		await expect.element(left).not.toHaveTextContent(en.camera_not_detected);
		await expect.element(left).toHaveTextContent('OK');
		expect(hint(screen.container)).toBeNull();
	});

	it('Reconnect starts the count again, so the next answer does not bring the text back', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen } = await testing(answers);
		vi.spyOn(camerasApi, 'rescan').mockResolvedValue(devices);
		answers[0] = 'no-frame';
		await poll(RUN_LIMIT - 1);
		await screen.getByRole('button', { name: en.dash_camera_reconnect, exact: true }).click();
		await settle();
		await poll(1);
		expect(hint(screen.container)).toBeNull();
		await poll(RUN_LIMIT - 2);
		expect(hint(screen.container)).toBeNull();
		await poll(1);
		await expect.poll(() => hint(screen.container)).toBe(en.lv_camera_no_image);
	});

	it('a 404 marks the camera not detected and stops the preview, as before', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { calls, screen, left } = await testing(answers);
		answers[0] = 'missing';
		await poll(1);
		await expect.element(left).toHaveTextContent(en.camera_not_detected);
		await expect
			.element(screen.getByRole('button', { name: en.dash_camera_test, exact: true }))
			.toBeVisible();
		const before = count(calls, 0);
		await poll(2);
		expect(count(calls, 0)).toBe(before);
	});

	it('a 503 without the code says the preview failed at once, as before', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen, left } = await testing(answers);
		answers[0] = 'busy-503';
		await poll(1);
		await expect.poll(() => issueLine(screen.container)).toContain(en.dash_camera_preview_error);
		await expect.element(left).toHaveTextContent('OK');
	});
});

// Each answer puts the camera in one state and clears the others' marks.
describe('overview camera panel — one state per answer (NEH-349)', () => {
	it('a network error shows the preview error line; no-frame answers then remove it and show nothing else until the run limit', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen, left } = await testing(answers);
		answers[0] = 'network';
		await poll(1);
		await expect.poll(() => issueLine(screen.container)).toContain(en.dash_camera_preview_error);
		answers[0] = 'no-frame';
		await poll(1);
		await expect
			.poll(() => issueLine(screen.container))
			.not.toContain(en.dash_camera_preview_error);
		await poll(RUN_LIMIT - 2);
		expect(issueLine(screen.container)).not.toContain(en.dash_camera_preview_error);
		expect(hint(screen.container)).toBeNull();
		await expect.element(left).toHaveTextContent('OK');
		await poll(1);
		await expect.poll(() => hint(screen.container)).toBe(en.lv_camera_no_image);
		expect(issueLine(screen.container)).not.toContain(en.dash_camera_preview_error);
	});

	it('an ordinary 503 shows the error line too, and a no-frame answer removes it', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen } = await testing(answers);
		answers[0] = 'busy-503';
		await poll(1);
		await expect.poll(() => issueLine(screen.container)).toContain(en.dash_camera_preview_error);
		answers[0] = 'no-frame';
		await poll(1);
		await expect
			.poll(() => issueLine(screen.container))
			.not.toContain(en.dash_camera_preview_error);
	});

	it('a no-frame answer does not clear a focus failure', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen } = await testing(answers);
		vi.spyOn(camerasApi, 'calibrate').mockRejectedValue(new Error('focus failed'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await screen.getByRole('button', { name: en.dash_camera_focus, exact: true }).click();
		await expect.poll(() => issueLine(screen.container)).toContain(en.dash_camera_focus_error);
		answers[0] = 'no-frame';
		await poll(3);
		expect(issueLine(screen.container)).toContain(en.dash_camera_focus_error);
	});

	it('a network error after a no-image notice removes the notice', async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen } = await testing(answers);
		answers[0] = 'no-frame';
		await poll(RUN_LIMIT);
		await expect.poll(() => hint(screen.container)).toBe(en.lv_camera_no_image);
		answers[0] = 'network';
		await poll(1);
		await expect.poll(() => hint(screen.container)).toBeNull();
		expect(issueLine(screen.container)).toContain(en.dash_camera_preview_error);
	});
});

const panelHint = (c: HTMLElement, panel: number) =>
	c.querySelectorAll('.camera-panel')[panel]?.querySelector('.cam-hint')?.textContent ?? null;

// Only the expanded side streams, and the no-image text belongs to the side
// it is about.
describe("overview camera panel — one side streams, the text sits in its side's panel (NEH-349)", () => {
	it("expanding the other panel stops the first side's stream: no further preview requests for it", async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { calls, right } = await testing(answers);
		await right.click();
		await settle();
		const before = count(calls, 0);
		await poll(3);
		expect(count(calls, 0)).toBe(before);
	});

	it("the left side's no-image text is in the left panel and not in the right one", async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen } = await testing(answers);
		answers[0] = 'no-frame';
		await poll(RUN_LIMIT);
		await expect.poll(() => panelHint(screen.container, 0)).toBe(en.lv_camera_no_image);
		expect(panelHint(screen.container, 1)).toBeNull();
	});

	it("the right side's no-image text is in the right panel and not in the left one", async () => {
		const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
		const { screen, right } = await testing(answers);
		await right.click();
		await screen.getByRole('button', { name: en.dash_camera_test, exact: true }).click();
		await settle();
		answers[1] = 'no-frame';
		await poll(RUN_LIMIT);
		await expect.poll(() => panelHint(screen.container, 1)).toBe(en.lv_camera_no_image);
		expect(panelHint(screen.container, 0)).toBeNull();
	});
});

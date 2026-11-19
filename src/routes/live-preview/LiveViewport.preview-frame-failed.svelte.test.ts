// NEH-349: a camera that is connected but sent no preview frame answers
// 503 with detail.code preview_frame_failed, per camera. The continuous
// preview keeps that camera's last frame and goes on polling at the same
// pace; only a run of such answers lasting about 30 s (15 polls at 2 s)
// shows that camera's "connected, no image" notice (not the missing-camera
// one), and one good frame clears it. A no-frame answer also clears a missing
// notice left by an earlier 404. A 404, a 503 without the code and a network
// error behave as they did before. Last-pair mode shows the notice after 3
// such answers in a row.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import '../../app.css';

import LiveViewport from './LiveViewport.svelte';
import { camerasApi, type CameraCapabilities } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { clearChord } from '$lib/capture-key';

// LiveViewport's PREVIEW_INTERVAL_MS and NO_FRAME_RUN_LIMIT.
const INTERVAL_MS = 2000;
const RUN_LIMIT = 15;
// LiveViewport's LAST_PAIR_NO_FRAME_LIMIT.
const LAST_PAIR_LIMIT = 3;
const NO_IMAGE_EN =
  'The camera is connected but is not sending an image. Turn the camera off and on again. If that does not help, unplug its USB cable and plug it back in.';

const CAPS: CameraCapabilities = {
  backend: 'gphoto2',
  live_preview: true,
  focus_control: false,
  live_controls: false,
  zoom: false,
  autofocus_calibration: false,
  dslr_settings: true,
};

function capsWith(continuous: boolean) {
  return vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue({ ...CAPS, continuous_preview: continuous });
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    cameraMode: 'double' as const,
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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
  });
}

// What each camera answers to GET /cameras/preview/{n}, changeable mid-test:
// a frame (camera 0 400x300, camera 1 300x400, so the panes can be told
// apart), the NEH-349 503, a 503 with a string detail as the backend sends
// when the capture system is not loaded, a 404, or a network error.
type Answer = 'frame' | 'no-frame' | 'busy-503' | 'missing' | 'network';
const SIZES: Record<number, { w: number; h: number }> = { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } };
const FAILED = { code: 'preview_frame_failed', message: 'The camera is connected but did not send a preview frame.' };

function stubCameras(answers: Record<number, Answer>) {
  const calls: number[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const match = url.match(/\/cameras\/preview\/(\d+)/);
      if (!match) return new Response(null, { status: 404 });
      const idx = Number(match[1]);
      calls.push(idx);
      const json = (body: unknown, status: number) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      switch (answers[idx]) {
        case 'frame': return new Response(await framePng(SIZES[idx].w, SIZES[idx].h), { status: 200 });
        case 'no-frame': return json({ detail: FAILED }, 503);
        case 'busy-503': return json({ detail: 'Capture system not available: no module' }, 503);
        case 'network': throw new TypeError('Failed to fetch');
        default: return json({ detail: `Camera ${idx} not found` }, 404);
      }
    })
  );
  return calls;
}

function renderViewport(props: ReturnType<typeof baseProps>) {
  const target = document.createElement('div');
  target.style.cssText = 'width: 2000px; height: 2000px;';
  document.body.appendChild(target);
  const screen = render(LiveViewport, { target, props });
  const matBoard = screen.container.querySelector('.mat-board') as HTMLElement;
  matBoard.style.cssText = 'width: 1000px; height: 600px; flex-shrink: 0;';
  return screen;
}

const feeds = (c: HTMLElement) => c.querySelectorAll('.camera-feed');
const paneImg = (c: HTMLElement, pane: number) =>
  (feeds(c)[pane]?.querySelector('img.feed-img') as HTMLImageElement | null) ?? null;
// The notice over a pane, whichever of the two states it shows.
const paneMissing = (c: HTMLElement, pane: number) => feeds(c)[pane]?.querySelector('.camera-missing') ?? null;
const paneText = (c: HTMLElement, pane: number) => paneMissing(c, pane)?.textContent ?? null;
const reconnecting = () => page.getByText(en.lv_reconnecting).elements().length > 0;
const count = (calls: number[], cam: number) => calls.filter((c) => c === cam).length;

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
async function settle() {
  for (let i = 0; i < 5; i++) {
    await tick();
    await new Promise((r) => realSetTimeout(r, 20));
  }
}

// Runs `n` polling intervals, letting each round of requests answer.
async function poll(n: number) {
  for (let i = 0; i < n; i++) {
    vi.advanceTimersByTime(INTERVAL_MS);
    await settle();
  }
}

async function waitForPane(c: HTMLElement, pane: number, naturalWidth: number) {
  await expect.poll(() => paneImg(c, pane)?.naturalWidth ?? 0, { timeout: 5000 }).toBe(naturalWidth);
}

// Every camera of the mode showing a frame, the continuous preview polling.
async function polling(answers: Record<number, Answer>, cameraMode: 'single' | 'double' = 'double') {
  capsWith(true);
  const calls = stubCameras(answers);
  const screen = renderViewport(baseProps({ cameraMode }));
  await waitForPane(screen.container, 0, 400);
  if (cameraMode === 'double') await waitForPane(screen.container, 1, 300);
  await settle();
  return { calls, c: screen.container, screen };
}

beforeEach(() => {
  locale.set('en');
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearChord();
});

describe('LiveViewport — a connected camera that sent no frame (NEH-349)', () => {
  it('keeps the last frame, goes on polling at the same pace and shows nothing missing or reconnecting', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { calls, c } = await polling(answers);
    const shown = paneImg(c, 0)!.src;
    answers[0] = 'no-frame';
    const before = count(calls, 0);
    await poll(RUN_LIMIT - 1);
    expect(count(calls, 0) - before).toBe(RUN_LIMIT - 1);
    expect(paneImg(c, 0)?.src).toBe(shown);
    expect(paneMissing(c, 0)).toBeNull();
    expect(paneMissing(c, 1)).toBeNull();
    expect(reconnecting()).toBe(false);
  });

  it('single mode: the run does not count toward the reconnect banner', async () => {
    const answers: Record<number, Answer> = { 0: 'frame' };
    const { c } = await polling(answers, 'single');
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT - 1);
    expect(reconnecting()).toBe(false);
    expect(paneImg(c, 0)?.naturalWidth).toBe(400);
    expect(paneMissing(c, 0)).toBeNull();
  });

  it(`after ${RUN_LIMIT} answers in a row shows that camera as connected without an image, the other camera untouched`, async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { calls, c } = await polling(answers);
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT);
    await expect.poll(() => paneMissing(c, 0)).not.toBeNull();
    expect(paneText(c, 0)).toBe(en.lv_camera_no_image);
    expect(paneText(c, 0)).toBe(NO_IMAGE_EN);
    expect(paneText(c, 0)).not.toBe(en.lv_camera_missing);
    expect(feeds(c)[0].querySelector('.camera-missing')?.getAttribute('role')).toBe('status');
    expect(paneMissing(c, 1)).toBeNull();
    expect(paneImg(c, 1)?.naturalWidth).toBe(300);
    expect(reconnecting()).toBe(false);
    // Polling goes on, at the same pace.
    const before = count(calls, 0);
    await poll(2);
    expect(count(calls, 0) - before).toBe(2);
  });

  it('the notice is in Spanish when the interface is', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { c } = await polling(answers);
    locale.set('es');
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT);
    await expect.poll(() => paneText(c, 0)).toBe(es.lv_camera_no_image);
    expect(paneText(c, 0)).not.toBe(es.lv_camera_missing);
  });

  it('a 404 then a no-frame answer removes "Camera not detected" at once; the run then counts from nothing', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { c } = await polling(answers);
    answers[0] = 'missing';
    await poll(1);
    await expect.poll(() => paneText(c, 0)).toBe(en.lv_camera_missing);
    answers[0] = 'no-frame';
    await poll(1);
    await expect.poll(() => paneText(c, 0)).toBeNull();
    await poll(RUN_LIMIT - 2);
    expect(paneText(c, 0)).toBeNull();
    await poll(1);
    await expect.poll(() => paneText(c, 0)).toBe(en.lv_camera_no_image);
    // A 404 replaces the no-image notice.
    answers[0] = 'missing';
    await poll(1);
    await expect.poll(() => paneText(c, 0)).toBe(en.lv_camera_missing);
  });

  it('switching the camera mode starts every camera\'s count again', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { c, screen } = await polling(answers);
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT - 1);
    expect(paneText(c, 0)).toBeNull();
    await screen.rerender({ cameraMode: 'single' });
    await settle();
    await screen.rerender({ cameraMode: 'double' });
    await settle();
    await poll(1);
    expect(paneText(c, 0)).toBeNull();
    await poll(RUN_LIMIT - 3);
    expect(paneText(c, 0)).toBeNull();
  });

  it('one good frame ends the run and clears the missing state', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { c } = await polling(answers);
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT);
    await expect.poll(() => paneMissing(c, 0)).not.toBeNull();
    answers[0] = 'frame';
    await poll(1);
    await expect.poll(() => paneMissing(c, 0)).toBeNull();
    // The run starts again from nothing.
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT - 1);
    expect(paneMissing(c, 0)).toBeNull();
  });

  it('a good frame inside the run starts the count again', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { c } = await polling(answers);
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT - 1);
    answers[0] = 'frame';
    await poll(1);
    answers[0] = 'no-frame';
    await poll(RUN_LIMIT - 1);
    expect(paneMissing(c, 0)).toBeNull();
  });

  it('a 404 shows the camera missing at the first answer, as before', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { c } = await polling(answers);
    answers[1] = 'missing';
    await poll(1);
    await expect.poll(() => paneMissing(c, 1)).not.toBeNull();
    expect(paneMissing(c, 0)).toBeNull();
    expect(reconnecting()).toBe(false);
  });

  it('a 503 without the code counts toward the reconnect banner, as before', async () => {
    const answers: Record<number, Answer> = { 0: 'frame' };
    const { c } = await polling(answers, 'single');
    answers[0] = 'busy-503';
    await poll(2);
    expect(reconnecting()).toBe(false);
    await poll(1);
    await expect.poll(reconnecting).toBe(true);
    expect(paneMissing(c, 0)).toBeNull();
  });

  it('a network error counts toward the reconnect banner, as before', async () => {
    const answers: Record<number, Answer> = { 0: 'frame' };
    await polling(answers, 'single');
    answers[0] = 'network';
    await poll(3);
    await expect.poll(reconnecting).toBe(true);
  });

  it('last-pair mode: a refresh answered with it keeps the picture and asks for another refresh, not missing', async () => {
    capsWith(false);
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    stubCameras(answers);
    const screen = renderViewport(baseProps());
    const c = screen.container;
    await waitForPane(c, 0, 400);
    await waitForPane(c, 1, 300);
    answers[0] = 'no-frame';
    await page.getByRole('button', { name: en.lv_refresh_preview, exact: true }).click();
    await expect.element(page.getByText(en.lv_preview_failed)).toBeInTheDocument();
    expect(paneImg(c, 0)?.naturalWidth).toBe(400);
    expect(paneMissing(c, 0)).toBeNull();
    expect(paneMissing(c, 1)).toBeNull();
  });
});

describe('LiveViewport last-pair mode — a connected camera that sent no frame (NEH-349)', () => {
  async function lastPair(answers: Record<number, Answer>) {
    capsWith(false);
    stubCameras(answers);
    const screen = renderViewport(baseProps());
    const c = screen.container;
    await waitForPane(c, 0, 400);
    await waitForPane(c, 1, 300);
    await settle();
    return c;
  }
  async function refresh(n = 1) {
    for (let i = 0; i < n; i++) {
      await page.getByRole('button', { name: en.lv_refresh_preview, exact: true }).click();
      await settle();
    }
  }

  it(`shows the notice for that camera after ${LAST_PAIR_LIMIT} failed refreshes in a row, not after ${LAST_PAIR_LIMIT - 1}; the refresh banner stays`, async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const c = await lastPair(answers);
    answers[0] = 'no-frame';
    await refresh(LAST_PAIR_LIMIT - 1);
    expect(paneText(c, 0)).toBeNull();
    await refresh(1);
    await expect.poll(() => paneText(c, 0)).toBe(NO_IMAGE_EN);
    expect(paneText(c, 1)).toBeNull();
    await expect.element(page.getByText(en.lv_preview_failed)).toBeInTheDocument();
    expect(paneImg(c, 0)?.naturalWidth).toBe(400);
  });

  it('a good frame in between starts the count again', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const c = await lastPair(answers);
    answers[0] = 'no-frame';
    await refresh(LAST_PAIR_LIMIT - 1);
    answers[0] = 'frame';
    await refresh(1);
    answers[0] = 'no-frame';
    await refresh(LAST_PAIR_LIMIT - 1);
    expect(paneText(c, 0)).toBeNull();
  });

  it('a good frame clears the notice', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const c = await lastPair(answers);
    answers[0] = 'no-frame';
    await refresh(LAST_PAIR_LIMIT);
    await expect.poll(() => paneText(c, 0)).toBe(NO_IMAGE_EN);
    answers[0] = 'frame';
    await refresh(1);
    await expect.poll(() => paneText(c, 0)).toBeNull();
  });

  it('a 404 resets the count and shows the camera missing; a no-frame answer then removes that at once', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const c = await lastPair(answers);
    answers[0] = 'no-frame';
    await refresh(LAST_PAIR_LIMIT - 1);
    answers[0] = 'missing';
    await refresh(1);
    await expect.poll(() => paneText(c, 0)).toBe(en.lv_camera_missing);
    answers[0] = 'no-frame';
    await refresh(1);
    await expect.poll(() => paneText(c, 0)).toBeNull();
    await refresh(LAST_PAIR_LIMIT - 2);
    expect(paneText(c, 0)).toBeNull();
    await refresh(1);
    await expect.poll(() => paneText(c, 0)).toBe(NO_IMAGE_EN);
  });
});

// Each answer for a camera puts it in one state and clears the marks of the
// others.
describe('LiveViewport — one state per answer (NEH-349)', () => {
  it('3 network errors show the reconnect banner; a no-frame answer then removes it', async () => {
    const answers: Record<number, Answer> = { 0: 'frame' };
    const { c } = await polling(answers, 'single');
    answers[0] = 'network';
    await poll(3);
    await expect.poll(reconnecting).toBe(true);
    answers[0] = 'no-frame';
    await poll(1);
    await expect.poll(reconnecting).toBe(false);
    expect(paneMissing(c, 0)).toBeNull();
  });

  it('errors separated by a no-frame answer do not add up to the banner', async () => {
    const answers: Record<number, Answer> = { 0: 'frame' };
    await polling(answers, 'single');
    answers[0] = 'network';
    await poll(2);
    answers[0] = 'no-frame';
    await poll(1);
    answers[0] = 'network';
    await poll(2);
    expect(reconnecting()).toBe(false);
    await poll(1);
    await expect.poll(reconnecting).toBe(true);
  });

  type State = 'ok' | 'missing' | 'no-frame' | 'error';
  const ANSWER: Record<State, Answer> = { ok: 'frame', missing: 'missing', 'no-frame': 'no-frame', error: 'network' };
  // Answers that bring a camera into the state: a run for the two that
  // need one.
  const RUN: Record<State, number> = { ok: 1, missing: 1, 'no-frame': RUN_LIMIT, error: 3 };
  const shown = (c: HTMLElement): State | 'none' | string => {
    const marks: string[] = [];
    const text = paneText(c, 0);
    if (text === en.lv_camera_missing) marks.push('missing');
    if (text === en.lv_camera_no_image) marks.push('no-frame');
    if (reconnecting()) marks.push('error');
    return marks.length === 0 ? 'none' : marks.join('+');
  };
  const states: State[] = ['ok', 'missing', 'no-frame', 'error'];
  const pairs = states.flatMap((a) => states.filter((b) => b !== a).map((b) => [a, b] as const));

  it.each(pairs)('%s then %s: only the later state shows', async (first, second) => {
    const answers: Record<number, Answer> = { 0: 'frame' };
    const { c } = await polling(answers, 'single');
    answers[0] = ANSWER[first];
    await poll(RUN[first]);
    await expect.poll(() => shown(c)).toBe(first === 'ok' ? 'none' : first);
    answers[0] = ANSWER[second];
    await poll(RUN[second]);
    await expect.poll(() => shown(c)).toBe(second === 'ok' ? 'none' : second);
  });
});

// The reconnect banner counts errors per camera: any other answer from a
// camera ends that camera's run only, and the banner shows while any
// camera's run has reached the limit.
describe('LiveViewport — the error run is per camera (NEH-349)', () => {
  it('double mode: camera 0 always 404 and camera 1 always a network error show the banner after 3 errors from camera 1, and camera 0 its missing notice', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { c } = await polling(answers);
    answers[0] = 'missing';
    answers[1] = 'network';
    await poll(2);
    expect(reconnecting()).toBe(false);
    await poll(1);
    await expect.poll(reconnecting).toBe(true);
    expect(paneText(c, 0)).toBe(en.lv_camera_missing);
  });

  it('double mode: camera 0 good frames and camera 1 always 503 show the banner', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    await polling(answers);
    answers[1] = 'busy-503';
    await poll(3);
    await expect.poll(reconnecting).toBe(true);
  });

  it('double mode: a good frame from the failing camera removes the banner', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    await polling(answers);
    answers[1] = 'busy-503';
    await poll(3);
    await expect.poll(reconnecting).toBe(true);
    answers[1] = 'frame';
    await poll(1);
    await expect.poll(reconnecting).toBe(false);
  });

  it('double mode: two errors from each camera (four in all) show no banner', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    await polling(answers);
    answers[0] = 'network';
    answers[1] = 'network';
    await poll(2);
    expect(reconnecting()).toBe(false);
  });

  it('switching to single mode ends the other camera\'s error run, and the banner goes', async () => {
    const answers: Record<number, Answer> = { 0: 'frame', 1: 'frame' };
    const { screen } = await polling(answers);
    answers[1] = 'busy-503';
    await poll(3);
    await expect.poll(reconnecting).toBe(true);
    await screen.rerender({ cameraMode: 'single' });
    await settle();
    await poll(1);
    await expect.poll(reconnecting).toBe(false);
  });
});

// NEH-334: on a unit whose cameras report no continuous preview (DSLR and
// compact bodies), the capture screen shows the last captured pair and
// fetches a live frame only when asked, through "Refresh preview". On a unit
// that reports one, or says nothing, the preview is polled as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from '@vitest/browser/context';
import { tick } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import '../../app.css';

import LiveViewport from './LiveViewport.svelte';
import { camerasApi, type CameraCapabilities, type CaptureResponse } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { clearChord } from '$lib/capture-key';

const CAPS: CameraCapabilities = {
  backend: 'gphoto2',
  live_preview: true,
  focus_control: false,
  live_controls: false,
  zoom: false,
  autofocus_calibration: false,
  dslr_settings: true,
};

function capsWith(continuous: boolean | undefined) {
  const caps: CameraCapabilities = { ...CAPS };
  if (continuous !== undefined) caps.continuous_preview = continuous;
  return vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps);
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

type Size = { w: number; h: number };

// Answers GET /cameras/preview/{index} with a frame of the size given for
// that camera and GET /records/images/{id}/thumbnail with one of the size
// given for that image; anything else 404s. `hold` and `thumbHold`, when
// set, are awaited before a preview or a thumbnail answers, so a test can
// keep a request in flight. A status in `previewStatus` or `thumbStatus`
// answers that camera or image with it instead of a frame.
function stubFetch(opts: {
  preview?: Partial<Record<number, Size>>;
  thumbs?: Partial<Record<number, Size>>;
  hold?: { promise: Promise<void> } | null;
  thumbHold?: { promise: Promise<void> } | null;
  previewStatus?: Partial<Record<number, number>>;
  thumbStatus?: Partial<Record<number, number>>;
}) {
  const previewCalls: number[] = [];
  const thumbCalls: number[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const preview = url.match(/\/cameras\/preview\/(\d+)/);
    if (preview) {
      const idx = Number(preview[1]);
      previewCalls.push(idx);
      if (opts.hold) await opts.hold.promise;
      const status = opts.previewStatus?.[idx];
      if (status) return new Response(null, { status });
      const size = opts.preview?.[idx];
      if (!size) return new Response(null, { status: 404 });
      return new Response(await framePng(size.w, size.h), { status: 200 });
    }
    const thumb = url.match(/\/records\/images\/(\d+)\/thumbnail/);
    if (thumb) {
      const id = Number(thumb[1]);
      thumbCalls.push(id);
      if (opts.thumbHold) await opts.thumbHold.promise;
      const status = opts.thumbStatus?.[id];
      if (status) return new Response(null, { status });
      const size = opts.thumbs?.[id];
      if (!size) return new Response(null, { status: 404 });
      return new Response(await framePng(size.w, size.h), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return { previewCalls, thumbCalls };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

const refreshButton = () => page.getByRole('button', { name: en.lv_refresh_preview, exact: true });

function paneImg(container: HTMLElement, pane: number): HTMLImageElement | null {
  const feeds = container.querySelectorAll('.camera-feed');
  return (feeds[pane]?.querySelector('img.feed-img') as HTMLImageElement | null) ?? null;
}

function paneSource(container: HTMLElement, pane: number): string {
  const feeds = container.querySelectorAll('.camera-feed');
  return feeds[pane]?.querySelector('.feed-source')?.textContent?.trim() ?? '';
}

async function waitForPane(container: HTMLElement, pane: number, naturalWidth: number) {
  await expect
    .poll(() => paneImg(container, pane)?.naturalWidth ?? 0, { timeout: 5000 })
    .toBe(naturalWidth);
}

// Lets the capabilities answer and the first fetches settle.
// Captured before any test fakes timers, so settle() keeps working in the
// tests that fake setTimeout as well.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

// Fakes setTimeout too, for the tests that drive the 5 s capabilities
// timeout by hand instead of waiting for it.
function fakeTimeoutToo() {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
}

// Runs the 5 s capabilities timeout: nothing is fetched a millisecond
// before it, and the continuous preview starts on it.
async function runCapabilitiesTimeout(previewCalls: number[]) {
  vi.advanceTimersByTime(4999);
  await settle();
  expect(previewCalls).toEqual([]);
  vi.advanceTimersByTime(1);
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await tick();
    await new Promise((r) => realSetTimeout(r, 20));
  }
}

beforeEach(() => {
  locale.set('en');
  // Only the interval is faked: the polling runs on setInterval, while
  // expect.poll and the image decoding need real timeouts.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearChord();
});

describe('LiveViewport — last pair, no continuous preview (NEH-334)', () => {
  it('double mode: one preview request per camera on mount and none in the next 10 s', async () => {
    capsWith(false);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } } });
    const screen = renderViewport(baseProps({ cameraMode: 'double' }));

    await waitForPane(screen.container, 0, 400);
    await waitForPane(screen.container, 1, 300);
    expect([...previewCalls].sort()).toEqual([0, 1]);

    vi.advanceTimersByTime(10_000);
    await settle();
    expect(previewCalls.length).toBe(2);
    expect(paneSource(screen.container, 0)).toBe(en.lv_preview_unsaved);
    expect(paneSource(screen.container, 1)).toBe(en.lv_preview_unsaved);
  });

  it('single mode: one preview request, for camera 0 only, and none in the next 10 s', async () => {
    capsWith(false);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } } });
    const screen = renderViewport(baseProps({ cameraMode: 'single' }));

    await waitForPane(screen.container, 0, 400);
    vi.advanceTimersByTime(10_000);
    await settle();
    expect(previewCalls).toEqual([0]);
    expect(screen.container.querySelectorAll('.camera-feed').length).toBe(1);
  });

  it('a hidden and visible tab again does not start polling', async () => {
    capsWith(false);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } } });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10_000);
    await settle();
    expect(previewCalls).toEqual([0]);
  });

  it('"Refresh preview" sends one request per active camera and shows the frames as not saved', async () => {
    capsWith(false);
    const sizes: Record<number, Size> = { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } };
    const { previewCalls } = stubFetch({ preview: sizes });
    const screen = renderViewport(baseProps({ cameraMode: 'double' }));
    await waitForPane(screen.container, 0, 400);
    await waitForPane(screen.container, 1, 300);

    sizes[0] = { w: 420, h: 300 };
    sizes[1] = { w: 320, h: 400 };
    await userEvent.click(refreshButton());
    await waitForPane(screen.container, 0, 420);
    await waitForPane(screen.container, 1, 320);
    expect(previewCalls.length).toBe(4);
    expect([...previewCalls.slice(2)].sort()).toEqual([0, 1]);
    expect(paneSource(screen.container, 0)).toBe(en.lv_preview_unsaved);
    expect(paneSource(screen.container, 1)).toBe(en.lv_preview_unsaved);

    vi.advanceTimersByTime(10_000);
    await settle();
    expect(previewCalls.length).toBe(4);
  });

  it('single mode: "Refresh preview" asks camera 0 only', async () => {
    capsWith(false);
    const sizes: Record<number, Size> = { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } };
    const { previewCalls } = stubFetch({ preview: sizes });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    sizes[0] = { w: 420, h: 300 };
    await userEvent.click(refreshButton());
    await waitForPane(screen.container, 0, 420);
    expect(previewCalls).toEqual([0, 0]);
  });

  it('the refresh button is disabled while a refresh is in flight', async () => {
    capsWith(false);
    const opts: { preview: Partial<Record<number, Size>>; hold: { promise: Promise<void>; resolve: () => void } | null } = {
      preview: { 0: { w: 400, h: 300 } },
      hold: null,
    };
    stubFetch(opts);
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);
    await expect.element(refreshButton()).toBeEnabled();

    const hold = deferred<void>();
    opts.hold = { promise: hold.promise, resolve: () => hold.resolve() };
    await userEvent.click(refreshButton());
    await expect.element(refreshButton()).toBeDisabled();

    hold.resolve();
    await expect.element(refreshButton()).toBeEnabled();
  });

  it('the refresh button is disabled while a capture is in flight', async () => {
    capsWith(false);
    stubFetch({ preview: { 0: { w: 400, h: 300 } } });
    const pending = deferred<CaptureResponse>();
    vi.spyOn(camerasApi, 'capture').mockReturnValue(pending.promise);
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);
    await expect.element(refreshButton()).toBeEnabled();

    await userEvent.click(page.getByRole('button', { name: en.lv_capture_btn, exact: true }));
    await expect.element(refreshButton()).toBeDisabled();

    pending.resolve({ success: true });
    await expect.element(refreshButton()).toBeEnabled();
  });

  it('after a dual capture the panes show the captured pair as the last capture', async () => {
    capsWith(false);
    const { previewCalls } = stubFetch({
      preview: { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } },
      // Image 11 is camera 0's, image 12 camera 1's.
      thumbs: { 11: { w: 222, h: 300 }, 12: { w: 233, h: 300 } },
    });
    const dualSpy = vi.spyOn(camerasApi, 'captureDual').mockResolvedValue({ success: true, record_id: 5, image_ids: [11, 12] });
    const screen = renderViewport(baseProps({ cameraMode: 'double' }));
    await waitForPane(screen.container, 0, 400);

    await userEvent.click(page.getByRole('button', { name: en.lv_capture_btn, exact: true }));
    await waitForPane(screen.container, 0, 222);
    await waitForPane(screen.container, 1, 233);
    expect(dualSpy.mock.calls[0][0].left_camera_index).toBe(0);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
    expect(paneSource(screen.container, 1)).toBe(en.lv_last_capture);
    // No live frame is asked for after the capture.
    expect(previewCalls.length).toBe(2);
  });

  it('swapped: camera 1 takes the left page, and its image shows in the left pane', async () => {
    capsWith(false);
    stubFetch({
      preview: { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } },
      thumbs: { 11: { w: 222, h: 300 }, 12: { w: 233, h: 300 } },
    });
    const dualSpy = vi.spyOn(camerasApi, 'captureDual').mockResolvedValue({ success: true, record_id: 5, image_ids: [11, 12] });
    const screen = renderViewport(baseProps({ cameraMode: 'double', swapped: true }));
    // Swapped: camera 1's frame is on the left.
    await waitForPane(screen.container, 0, 300);
    await waitForPane(screen.container, 1, 400);

    await userEvent.click(page.getByRole('button', { name: en.lv_capture_btn, exact: true }));
    await waitForPane(screen.container, 0, 233);
    await waitForPane(screen.container, 1, 222);
    expect(dualSpy.mock.calls[0][0].left_camera_index).toBe(1);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
  });

  it('a refresh after a capture replaces the pair with frames marked not saved', async () => {
    capsWith(false);
    const sizes: Record<number, Size> = { 0: { w: 400, h: 300 } };
    stubFetch({ preview: sizes, thumbs: { 11: { w: 222, h: 300 } } });
    vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    await userEvent.click(page.getByRole('button', { name: en.lv_capture_btn, exact: true }));
    await waitForPane(screen.container, 0, 222);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);

    sizes[0] = { w: 410, h: 300 };
    await userEvent.click(refreshButton());
    await waitForPane(screen.container, 0, 410);
    expect(paneSource(screen.container, 0)).toBe(en.lv_preview_unsaved);
  });

  it('the capture key does not refresh, and the refresh button does not capture', async () => {
    capsWith(false);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } }, thumbs: { 11: { w: 222, h: 300 } } });
    const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    await userEvent.click(refreshButton());
    await expect.poll(() => previewCalls.length).toBe(2);
    await settle();
    expect(captureSpy).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
    await waitForPane(screen.container, 0, 222);
    expect(previewCalls.length).toBe(2);
  });

  it('a 404 on a refresh marks that camera missing and nothing asks again by itself', async () => {
    capsWith(false);
    const sizes: Partial<Record<number, Size>> = { 0: { w: 400, h: 300 } };
    const { previewCalls } = stubFetch({ preview: sizes });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    delete sizes[0];
    await userEvent.click(refreshButton());
    await expect.poll(() => screen.container.querySelector('.camera-missing')).not.toBeNull();
    vi.advanceTimersByTime(10_000);
    await settle();
    expect(previewCalls).toEqual([0, 0]);
  });
});

describe('LiveViewport — continuous preview stays as it was (NEH-334)', () => {
  for (const continuous of [true, undefined] as const) {
    it(`continuous_preview ${String(continuous)}: polls every 2 s and shows no refresh button or source label`, async () => {
      capsWith(continuous);
      const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } } });
      const screen = renderViewport(baseProps({ cameraMode: 'double' }));
      await waitForPane(screen.container, 0, 400);
      expect(previewCalls.length).toBe(2);

      vi.advanceTimersByTime(2000);
      await expect.poll(() => previewCalls.length).toBe(4);
      await settle();
      vi.advanceTimersByTime(2000);
      await expect.poll(() => previewCalls.length).toBe(6);

      expect(screen.container.querySelector('.refresh-preview-btn')).toBeNull();
      expect(screen.container.querySelector('.feed-source')).toBeNull();
    });
  }

  it('a failed capabilities request keeps the continuous preview', async () => {
    vi.spyOn(camerasApi, 'getCapabilities').mockRejectedValue(new Error('503'));
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } } });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    vi.advanceTimersByTime(2000);
    await expect.poll(() => previewCalls.length).toBe(2);
    expect(screen.container.querySelector('.refresh-preview-btn')).toBeNull();
  });

  it('a capture leaves the live preview in the panes', async () => {
    capsWith(true);
    const { thumbCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } }, thumbs: { 11: { w: 222, h: 300 } } });
    const captureSpy = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    await userEvent.click(page.getByRole('button', { name: en.lv_capture_btn, exact: true }));
    await expect.poll(() => captureSpy.mock.calls.length).toBe(1);
    await settle();
    expect(thumbCalls).toEqual([]);
    expect(paneImg(screen.container, 0)?.naturalWidth).toBe(400);
  });
});

// The review round: what a pane may say it shows, and the paths into and out
// of last-pair mode.
describe('LiveViewport — last pair, review round (NEH-334)', () => {
  const realHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  let hidden = false;
  function setHidden(value: boolean) {
    hidden = value;
    document.dispatchEvent(new Event('visibilitychange'));
  }
  beforeEach(() => {
    hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  });
  afterEach(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    if (realHidden) expect(Object.getOwnPropertyDescriptor(document, 'hidden')).toBeUndefined();
  });

  const captureButton = () => page.getByRole('button', { name: en.lv_capture_btn, exact: true });

  it('item 1: after dual, single, then double again, camera 1 shows a fresh frame, not the older pair', async () => {
    capsWith(false);
    const sizes: Record<number, Size> = { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } };
    const { previewCalls } = stubFetch({
      preview: sizes,
      thumbs: { 11: { w: 222, h: 300 }, 12: { w: 233, h: 300 }, 13: { w: 244, h: 300 } },
    });
    vi.spyOn(camerasApi, 'captureDual').mockResolvedValue({ success: true, record_id: 5, image_ids: [11, 12] });
    vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 6, image_ids: [13] });
    const screen = renderViewport(baseProps({ cameraMode: 'double' }));
    await waitForPane(screen.container, 1, 300);

    await userEvent.click(captureButton());
    await waitForPane(screen.container, 1, 233);

    await screen.rerender({ cameraMode: 'single' });
    await userEvent.click(captureButton());
    await waitForPane(screen.container, 0, 244);

    sizes[1] = { w: 310, h: 400 };
    await screen.rerender({ cameraMode: 'double' });
    await waitForPane(screen.container, 1, 310);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
    expect(paneSource(screen.container, 1)).toBe(en.lv_preview_unsaved);
    expect(previewCalls.filter((c) => c === 1).length).toBe(2);
  });

  it('item 2: a thumbnail that fails drops the older capture and shows a fresh frame as not saved', async () => {
    capsWith(false);
    const sizes: Record<number, Size> = { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } };
    stubFetch({
      preview: sizes,
      thumbs: { 11: { w: 222, h: 300 }, 12: { w: 233, h: 300 }, 13: { w: 244, h: 300 } },
      thumbStatus: { 14: 500 },
    });
    const dual = vi.spyOn(camerasApi, 'captureDual').mockResolvedValue({ success: true, record_id: 5, image_ids: [11, 12] });
    const screen = renderViewport(baseProps({ cameraMode: 'double' }));
    await waitForPane(screen.container, 1, 300);
    await userEvent.click(captureButton());
    await waitForPane(screen.container, 1, 233);

    dual.mockResolvedValue({ success: true, record_id: 6, image_ids: [13, 14] });
    sizes[1] = { w: 310, h: 400 };
    await userEvent.click(captureButton());
    await waitForPane(screen.container, 0, 244);
    await waitForPane(screen.container, 1, 310);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
    expect(paneSource(screen.container, 1)).toBe(en.lv_preview_unsaved);
  });

  it('item 3: a capture made by the page clears the last capture and fetches a frame per active camera', async () => {
    capsWith(false);
    const sizes: Record<number, Size> = { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } };
    const { previewCalls } = stubFetch({ preview: sizes, thumbs: { 11: { w: 222, h: 300 }, 12: { w: 233, h: 300 } } });
    vi.spyOn(camerasApi, 'captureDual').mockResolvedValue({ success: true, record_id: 5, image_ids: [11, 12] });
    const screen = renderViewport(baseProps({ cameraMode: 'double', pageCaptures: 0 }));
    await waitForPane(screen.container, 1, 300);
    await userEvent.click(captureButton());
    await waitForPane(screen.container, 0, 222);
    expect(previewCalls.length).toBe(2);

    sizes[0] = { w: 410, h: 300 };
    sizes[1] = { w: 310, h: 400 };
    await screen.rerender({ pageCaptures: 1 });
    await waitForPane(screen.container, 0, 410);
    await waitForPane(screen.container, 1, 310);
    expect(previewCalls.length).toBe(4);
    expect(paneSource(screen.container, 0)).toBe(en.lv_preview_unsaved);
    expect(paneSource(screen.container, 1)).toBe(en.lv_preview_unsaved);
  });

  it('item 4: one failed entry fetch shows the refresh message, not the reconnect banner; a good refresh clears it', async () => {
    capsWith(false);
    const opts = { preview: { 0: { w: 400, h: 300 } }, previewStatus: { 0: 500 } as Partial<Record<number, number>> };
    stubFetch(opts);
    const screen = renderViewport(baseProps());
    await expect.poll(() => screen.container.textContent ?? '').toContain(en.lv_preview_failed);
    expect(screen.container.textContent).not.toContain(en.lv_reconnecting);

    opts.previewStatus = {};
    await userEvent.click(refreshButton());
    await waitForPane(screen.container, 0, 400);
    expect(screen.container.textContent).not.toContain(en.lv_preview_failed);
  });

  it('item 4: a failed refresh shows the message and a capture clears it', async () => {
    capsWith(false);
    const opts = { preview: { 0: { w: 400, h: 300 } }, thumbs: { 11: { w: 222, h: 300 } }, previewStatus: {} as Partial<Record<number, number>> };
    stubFetch(opts);
    vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    opts.previewStatus = { 0: 503 };
    await userEvent.click(refreshButton());
    await expect.poll(() => screen.container.textContent ?? '').toContain(en.lv_preview_failed);
    await userEvent.click(captureButton());
    await waitForPane(screen.container, 0, 222);
    expect(screen.container.textContent).not.toContain(en.lv_preview_failed);
  });

  for (const continuous of [false, undefined, true] as const) {
    it(`item 5: live_preview false (continuous_preview ${String(continuous)}): no fetch, no refresh button, the capture shows`, async () => {
      const caps: CameraCapabilities = { ...CAPS, live_preview: false };
      if (continuous !== undefined) caps.continuous_preview = continuous;
      vi.spyOn(camerasApi, 'getCapabilities').mockResolvedValue(caps);
      const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } }, thumbs: { 11: { w: 222, h: 300 } } });
      vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
      const screen = renderViewport(baseProps());
      await settle();
      vi.advanceTimersByTime(10_000);
      await settle();
      expect(previewCalls).toEqual([]);
      expect(screen.container.querySelector('.refresh-preview-btn')).toBeNull();
      expect(screen.container.querySelector('.no-stream')).not.toBeNull();

      await userEvent.click(captureButton());
      await waitForPane(screen.container, 0, 222);
      expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
      expect(previewCalls).toEqual([]);
    });
  }

  it('item 6: no answer within 5 s means the continuous preview, and a late true changes nothing', async () => {
    fakeTimeoutToo();
    const caps = deferred<CameraCapabilities>();
    vi.spyOn(camerasApi, 'getCapabilities').mockReturnValue(caps.promise);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } } });
    const screen = renderViewport(baseProps());
    await runCapabilitiesTimeout(previewCalls);
    await waitForPane(screen.container, 0, 400);
    expect(previewCalls).toEqual([0]);

    caps.resolve({ ...CAPS, continuous_preview: true });
    await settle();
    expect(screen.container.querySelector('.refresh-preview-btn')).toBeNull();
    vi.advanceTimersByTime(2000);
    await expect.poll(() => previewCalls.length).toBe(2);
  });

  it('item B: a late false after the timeout stops the polling and switches to last-pair mode', async () => {
    fakeTimeoutToo();
    const caps = deferred<CameraCapabilities>();
    vi.spyOn(camerasApi, 'getCapabilities').mockReturnValue(caps.promise);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } } });
    const screen = renderViewport(baseProps({ cameraMode: 'double' }));
    await runCapabilitiesTimeout(previewCalls);
    await waitForPane(screen.container, 0, 400);
    await waitForPane(screen.container, 1, 300);
    await settle();
    const polled = previewCalls.length;

    caps.resolve({ ...CAPS, continuous_preview: false });
    await expect.element(refreshButton()).toBeVisible();
    expect(paneSource(screen.container, 0)).toBe(en.lv_preview_unsaved);
    expect(paneSource(screen.container, 1)).toBe(en.lv_preview_unsaved);
    vi.advanceTimersByTime(10_000);
    await settle();
    expect(previewCalls.length).toBe(polled);
  });

  it('item B: a late live_preview false after the timeout stops the polling and shows no refresh button', async () => {
    fakeTimeoutToo();
    const caps = deferred<CameraCapabilities>();
    vi.spyOn(camerasApi, 'getCapabilities').mockReturnValue(caps.promise);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } } });
    const screen = renderViewport(baseProps());
    await runCapabilitiesTimeout(previewCalls);
    await waitForPane(screen.container, 0, 400);
    await settle();
    const polled = previewCalls.length;

    caps.resolve({ ...CAPS, live_preview: false });
    await settle();
    vi.advanceTimersByTime(10_000);
    await settle();
    expect(previewCalls.length).toBe(polled);
    expect(screen.container.querySelector('.refresh-preview-btn')).toBeNull();
  });

  it('item 9: no preview request before the capabilities answer', async () => {
    const caps = deferred<CameraCapabilities>();
    vi.spyOn(camerasApi, 'getCapabilities').mockReturnValue(caps.promise);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } } });
    const screen = renderViewport(baseProps());
    await new Promise((r) => setTimeout(r, 300));
    expect(previewCalls).toEqual([]);
    caps.resolve({ ...CAPS, continuous_preview: false });
    await waitForPane(screen.container, 0, 400);
    expect(previewCalls).toEqual([0]);
  });

  for (const continuous of [false, true] as const) {
    it(`item 9: unmounted while the capabilities are pending, a late answer (continuous ${continuous}) starts nothing`, async () => {
      // The timeout is faked too here, so the 5 s fallback is covered; only
      // microtasks are flushed, since expect.poll needs a real setTimeout.
      vi.useRealTimers();
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
      const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
      const caps = deferred<CameraCapabilities>();
      vi.spyOn(camerasApi, 'getCapabilities').mockReturnValue(caps.promise);
      const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } } });
      const screen = renderViewport(baseProps());
      await flush();
      expect(vi.getTimerCount()).toBe(1);
      screen.unmount();
      expect(vi.getTimerCount()).toBe(0);
      caps.resolve({ ...CAPS, continuous_preview: continuous });
      await flush();
      vi.advanceTimersByTime(10_000);
      await flush();
      expect(previewCalls).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    });
  }

  it('item A: the refresh button is disabled while a capture\'s thumbnails load, and a click then fetches nothing', async () => {
    capsWith(false);
    const thumbHold = deferred<void>();
    const opts = {
      preview: { 0: { w: 400, h: 300 } },
      thumbs: { 11: { w: 222, h: 300 }, 12: { w: 233, h: 300 } },
      thumbHold: null as { promise: Promise<void> } | null,
      previewStatus: {} as Partial<Record<number, number>>,
    };
    const { previewCalls } = stubFetch(opts);
    const capture = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);
    await userEvent.click(captureButton());
    await waitForPane(screen.container, 0, 222);

    capture.mockResolvedValue({ success: true, record_id: 6, image_ids: [12] });
    opts.thumbHold = { promise: thumbHold.promise };
    opts.previewStatus = { 0: 500 };
    await userEvent.click(captureButton());
    await expect.poll(() => capture.mock.calls.length).toBe(2);
    await expect.element(refreshButton()).toBeDisabled();
    (refreshButton().element() as HTMLButtonElement).click();
    await settle();

    thumbHold.resolve();
    await waitForPane(screen.container, 0, 233);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
    expect(previewCalls).toEqual([0]);
    await expect.element(refreshButton()).toBeEnabled();
  });

  it('item 9: a slow capture result superseded by a newer capture is discarded and its object URL revoked', async () => {
    capsWith(false);
    const thumbHold = deferred<void>();
    const opts = {
      preview: { 0: { w: 400, h: 300 } },
      thumbs: { 11: { w: 222, h: 300 }, 12: { w: 233, h: 300 } },
      thumbHold: { promise: thumbHold.promise } as { promise: Promise<void> } | null,
    };
    const { thumbCalls } = stubFetch(opts);
    const capture = vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
    const createSpy = vi.spyOn(URL, 'createObjectURL');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);

    await userEvent.click(captureButton());
    await expect.poll(() => thumbCalls).toEqual([11]);
    opts.thumbHold = null;
    capture.mockResolvedValue({ success: true, record_id: 6, image_ids: [12] });
    await userEvent.click(captureButton());
    await waitForPane(screen.container, 0, 233);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);

    const before = createSpy.mock.results.length;
    thumbHold.resolve();
    await expect.poll(() => createSpy.mock.results.length).toBe(before + 1);
    const staleUrl = createSpy.mock.results[before].value as string;
    await expect.poll(() => revokeSpy.mock.calls.some(([u]) => u === staleUrl)).toBe(true);
    await settle();
    expect(paneImg(screen.container, 0)?.naturalWidth).toBe(233);
    expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
  });

  it('item 7 and 9: last-pair, hidden on entry, then visible: one frame per empty pane and no polling', async () => {
    const caps = deferred<CameraCapabilities>();
    vi.spyOn(camerasApi, 'getCapabilities').mockReturnValue(caps.promise);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 }, 1: { w: 300, h: 400 } } });
    const screen = renderViewport(baseProps({ cameraMode: 'double' }));
    setHidden(true);
    caps.resolve({ ...CAPS, continuous_preview: false });
    await settle();
    expect(previewCalls).toEqual([]);

    setHidden(false);
    await waitForPane(screen.container, 0, 400);
    await waitForPane(screen.container, 1, 300);
    vi.advanceTimersByTime(10_000);
    await settle();
    expect([...previewCalls].sort()).toEqual([0, 1]);

    // A second hide and show with both panes full asks for nothing.
    setHidden(true);
    setHidden(false);
    await settle();
    expect(previewCalls.length).toBe(2);
  });

  it('item 9: continuous, hidden then visible: polling stops and resumes', async () => {
    capsWith(true);
    const { previewCalls } = stubFetch({ preview: { 0: { w: 400, h: 300 } } });
    const screen = renderViewport(baseProps());
    await waitForPane(screen.container, 0, 400);
    expect(previewCalls).toEqual([0]);

    setHidden(true);
    vi.advanceTimersByTime(6000);
    await settle();
    expect(previewCalls).toEqual([0]);

    setHidden(false);
    await expect.poll(() => previewCalls.length).toBe(2);
    await settle();
    vi.advanceTimersByTime(2000);
    await expect.poll(() => previewCalls.length).toBe(3);
  });

  it('item 8: the refresh button is disabled while the entry fetch is in flight', async () => {
    capsWith(false);
    const hold = deferred<void>();
    stubFetch({ preview: { 0: { w: 400, h: 300 } }, hold: { promise: hold.promise } });
    const screen = renderViewport(baseProps());
    await expect.element(refreshButton()).toBeDisabled();
    hold.resolve();
    await waitForPane(screen.container, 0, 400);
    await expect.element(refreshButton()).toBeEnabled();
  });
});

// External review: a fetch that lost its pane to a capture must not raise a
// failure notice over that capture.
describe('LiveViewport — a stale fetch changes no notice (NEH-334)', () => {
  const captureButton = () => page.getByRole('button', { name: en.lv_capture_btn, exact: true });

  for (const status of [500, 404] as const) {
    it(`an entry fetch that answers ${status} after a capture took the pane leaves the capture as it is`, async () => {
      capsWith(false);
      const hold = deferred<void>();
      const { previewCalls } = stubFetch({
        thumbs: { 11: { w: 222, h: 300 } },
        hold: { promise: hold.promise },
        previewStatus: { 0: status },
      });
      vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
      const screen = renderViewport(baseProps());
      await expect.poll(() => previewCalls).toEqual([0]);

      await userEvent.click(captureButton());
      await waitForPane(screen.container, 0, 222);
      expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);

      hold.resolve();
      await settle();
      expect(screen.container.textContent).not.toContain(en.lv_preview_failed);
      expect(screen.container.querySelector('.camera-missing')).toBeNull();
      expect(paneImg(screen.container, 0)?.naturalWidth).toBe(222);
      expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
    });

    it(`a refresh that answers ${status} after a capture took the pane leaves the capture as it is`, async () => {
      capsWith(false);
      const opts = {
        preview: { 0: { w: 400, h: 300 } },
        thumbs: { 11: { w: 222, h: 300 } },
        hold: null as { promise: Promise<void> } | null,
        previewStatus: {} as Partial<Record<number, number>>,
      };
      const { previewCalls } = stubFetch(opts);
      vi.spyOn(camerasApi, 'capture').mockResolvedValue({ success: true, record_id: 5, image_ids: [11] });
      const screen = renderViewport(baseProps());
      await waitForPane(screen.container, 0, 400);

      const hold = deferred<void>();
      opts.hold = { promise: hold.promise };
      opts.previewStatus = { 0: status };
      await userEvent.click(refreshButton());
      await expect.poll(() => previewCalls.length).toBe(2);

      await userEvent.click(captureButton());
      await waitForPane(screen.container, 0, 222);
      expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);

      hold.resolve();
      await settle();
      expect(screen.container.textContent).not.toContain(en.lv_preview_failed);
      expect(screen.container.querySelector('.camera-missing')).toBeNull();
      expect(paneImg(screen.container, 0)?.naturalWidth).toBe(222);
      expect(paneSource(screen.container, 0)).toBe(en.lv_last_capture);
    });
  }
});

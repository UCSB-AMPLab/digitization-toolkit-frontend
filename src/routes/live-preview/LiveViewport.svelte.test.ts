// NEH-222: the live viewport takes its shape from the frames instead of a
// hardcoded 4:3 box. These are the browser-mode assertions the pure
// src/lib/viewport-aspect.ts tests can't reach — actual layout in a real
// <img>/ResizeObserver/flexbox pipeline, driven by real (canvas-drawn) PNG
// frames fetched through the component's own polling code path.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

// The app-wide reset (border-box, zeroed margin/padding) isn't loaded by
// default in an isolated component test, but the pixel geometry these
// assertions check for is only exact under it in the real app — a
// content-box .camera-viewport pads its 1px border on top of the inline
// pixel size, throwing height off by 2px.
import '../../app.css';

import LiveViewport from './LiveViewport.svelte';

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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), 'image/png');
  });
}

// Stubs the same GET /cameras/preview/{index} the component's own polling
// code calls (see fetchPreview in LiveViewport.svelte) — one frame size per
// camera index; a missing index 404s, same as an unconnected camera.
function stubPreviewFetch(sizes: Partial<Record<number, { w: number; h: number }>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const match = url.match(/\/cameras\/preview\/(\d+)/);
      const size = match ? sizes[Number(match[1])] : undefined;
      if (!size) return new Response(null, { status: 404 });
      const blob = await framePng(size.w, size.h);
      return new Response(blob, { status: 200 });
    })
  );
}

// Mounts into a generously-sized target, then pins .mat-board to an exact
// 1000x600 (R39-3's board) by setting its size directly — sidesteps having
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
          const rect = (screen.container.querySelector('.camera-viewport') as HTMLElement).getBoundingClientRect();
          return withinPx(rect.width, 1000) && withinPx(rect.height, 562.5);
        },
        { timeout: 5000 }
      )
      .toBe(true);

    const viewportRect = (screen.container.querySelector('.camera-viewport') as HTMLElement).getBoundingClientRect();
    const boardRect = (screen.container.querySelector('.mat-board') as HTMLElement).getBoundingClientRect();
    expect(isInside(viewportRect, boardRect)).toBe(true);
  });

  it('single mode, rotation 90: the same 16:9 frame inverts and is width-limited (337.5x600, R39-3)', async () => {
    stubPreviewFetch({ 0: { w: 1600, h: 900 } });
    const screen = renderViewport(baseProps({ cameraMode: 'single', rotateDeg: { 0: 90 } }));

    await waitForNaturalWidth(screen, '.camera-feed:first-child img.feed-img', 1600);

    await expect
      .poll(
        () => {
          const rect = (screen.container.querySelector('.camera-viewport') as HTMLElement).getBoundingClientRect();
          return withinPx(rect.width, 337.5) && withinPx(rect.height, 600);
        },
        { timeout: 5000 }
      )
      .toBe(true);

    const viewportRect = (screen.container.querySelector('.camera-viewport') as HTMLElement).getBoundingClientRect();
    const boardRect = (screen.container.querySelector('.mat-board') as HTMLElement).getBoundingClientRect();
    expect(isInside(viewportRect, boardRect)).toBe(true);
  });

  it('double mode: panels split proportionally to each camera\'s own displayed aspect (R39-2)', async () => {
    // cam0 (left) rotated 90: a 3:2 frame displays at 2:3 ≈ 0.6667.
    // cam1 (right) at 0: a 16:9 frame displays at 16:9 ≈ 1.7778.
    stubPreviewFetch({ 0: { w: 1200, h: 800 }, 1: { w: 1600, h: 900 } });
    const screen = renderViewport(baseProps({ cameraMode: 'double', rotateDeg: { 0: 90, 1: 0 } }));

    await waitForNaturalWidth(screen, '.camera-feed:first-child img.feed-img', 1200);
    await waitForNaturalWidth(screen, '.camera-feed:last-child img.feed-img', 1600);

    const expectedRatio = (2 / 3) / (16 / 9);

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

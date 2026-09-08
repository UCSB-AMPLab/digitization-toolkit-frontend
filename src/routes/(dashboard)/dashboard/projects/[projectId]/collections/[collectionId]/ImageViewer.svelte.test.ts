// NEH-230: drag-to-pan in the spread viewer, and the filename/side caption
// moved out of the image frame (below it, in static flow) so it never
// covers foliation or marginalia at any zoom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord, type RecordImage } from '$lib/api';
import ImageViewer from './ImageViewer.svelte';

// A real, decodable 1200x800 PNG (drawn on a canvas) so naturalWidth/Height
// resolve once the <img> loads — a 1x1 placeholder would report 1x1 and
// never exercise the "zoomed past the frame" geometry this feature is for.
function make1200x800DataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 100, 100);
  return canvas.toDataURL('image/png');
}

function makeImage(overrides: Partial<RecordImage> = {}): RecordImage {
  return {
    id: 1,
    record_id: 1,
    filename: 'left.jpg',
    file_path: '/x',
    format: 'jpeg',
    is_current: true,
    role: 'left',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<ApiRecord> = {}): ApiRecord {
  return {
    id: 1,
    title: 'Test record',
    status: 'in_review',
    capture_mode: 'dual',
    images: [
      makeImage({ id: 1, role: 'left', filename: 'left.jpg' }),
      makeImage({ id: 2, role: 'right', filename: 'right.jpg' }),
    ],
    ...overrides,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    viewMode: 'spread' as const,
    records: [makeRecord()],
    selectedRecordId: 1,
    zoom: 2,
    rotation: 0,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onZoomChange: vi.fn(),
    ...overrides,
  };
}

describe('ImageViewer — drag-to-pan and out-of-frame caption (NEH-230)', () => {
  let getImageFileUrlSpy: ReturnType<typeof vi.spyOn>;
  const dataUrl = make1200x800DataUrl();

  beforeEach(() => {
    // The real getImageFileUrl builds a URL against the API host, which
    // won't resolve to a real image in a headless browser test — point it
    // at a canvas-drawn data URL instead, so naturalWidth/Height are real.
    getImageFileUrlSpy = vi.spyOn(recordsApi, 'getImageFileUrl').mockReturnValue(dataUrl);
  });

  afterEach(() => {
    getImageFileUrlSpy.mockRestore();
  });

  it('dragging the left frame pans the left image (translate is nonzero after a drag)', async () => {
    const screen = render(ImageViewer, baseProps({ zoom: 2 }));
    const img = screen.container.querySelector('img.spread-image.left') as HTMLImageElement;
    const frame = img.closest('.spread-frame') as HTMLElement;

    // Wait for the image to load so naturalWidth/Height resolve and the
    // frame has been measured (frame elements are laid out synchronously,
    // but naturalWidth needs a decode tick).
    await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);
    await expect.poll(() => (frame.getBoundingClientRect().width > 0)).toBe(true);
    // bind:clientWidth/clientHeight is driven by a ResizeObserver callback,
    // which can land a frame or two after the raw DOM already has a size —
    // give it real animation-frame ticks to catch up before starting the
    // drag, or the frame's measured bounds are still 0 and the drag is a
    // no-op (dragToFraction leaves an axis with bounds 0 unmoved).
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    frame.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, bubbles: true }));
    frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, button: 0, isPrimary: true, clientX: 60, clientY: 80, bubbles: true }));
    frame.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0, isPrimary: true, clientX: 60, clientY: 80, bubbles: true }));

    await expect.poll(() => img.style.transform).not.toBe('translate(0px, 0px) scale(2) rotate(0deg)');
    expect(img.style.transform.startsWith('translate(')).toBe(true);
  });

  it('at zoom 1 (fit) the transform is translate(0px, 0px) scale(1) rotate(0deg)', async () => {
    const screen = render(ImageViewer, baseProps({ zoom: 1 }));
    const img = screen.container.querySelector('img.spread-image.left') as HTMLImageElement;

    await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);
    await expect.poll(() => img.style.transform).toBe('translate(0px, 0px) scale(1) rotate(0deg)');
  });

  it('the caption is not absolutely positioned and sits below the image frame', async () => {
    const screen = render(ImageViewer, baseProps());
    const img = screen.container.querySelector('img.spread-image.left') as HTMLImageElement;
    const frame = img.closest('.spread-frame') as HTMLElement;
    const label = screen.container.querySelector('.spread-label') as HTMLElement;

    await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);

    expect(getComputedStyle(label).position).not.toBe('absolute');
    expect(label.getBoundingClientRect().top).toBeGreaterThanOrEqual(frame.getBoundingClientRect().bottom);
  });

  it('a second finger does not corrupt an in-progress drag', async () => {
    // Chromium only treats pointerId 1 (the system mouse) as a real "active
    // pointer" for setPointerCapture purposes when the pointerdown is a
    // synthetic dispatchEvent rather than a real touch — a genuine second
    // touch point (id 2) has no such standing HW state, so
    // setPointerCapture(2) throws NotFoundError regardless of app logic.
    // Stub it so this test exercises the component's own pointer-id
    // bookkeeping (the actual thing under test) rather than that browser
    // capture precondition.
    const captureSpy = vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => {});

    const screen = render(ImageViewer, baseProps({ zoom: 2 }));
    const img = screen.container.querySelector('img.spread-image.left') as HTMLImageElement;
    const frame = img.closest('.spread-frame') as HTMLElement;

    await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);
    await expect.poll(() => (frame.getBoundingClientRect().width > 0)).toBe(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    function translateX(): number {
      const match = img.style.transform.match(/^translate\(([-\d.]+)px/);
      return match ? Number(match[1]) : NaN;
    }

    const before = translateX();

    // First finger goes down and starts the drag.
    frame.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, bubbles: true }));
    // A second finger touches down on the same frame mid-drag — this must
    // be ignored (not overwrite the first pointer's last coordinates), or
    // the next move computes its delta against the second finger's down
    // position instead of the first finger's, producing a huge spurious
    // jump (the review's reproduction: -290px for a 10px move).
    frame.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, button: 0, isPrimary: false, clientX: 400, clientY: 100, bubbles: true }));

    frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, button: 0, isPrimary: true, clientX: 110, clientY: 100, bubbles: true }));
    await expect.poll(translateX).not.toBeNaN();
    const afterFirstMove = translateX();
    expect(afterFirstMove).toBeCloseTo(before + 10, 0); // tolerance ~1px, not -290

    // The second finger lifts — the first finger's drag must survive it.
    frame.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, button: 0, isPrimary: false, clientX: 400, clientY: 100, bubbles: true }));

    frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, button: 0, isPrimary: true, clientX: 120, clientY: 100, bubbles: true }));
    await expect.poll(translateX).toBeCloseTo(afterFirstMove + 10, 0);
    const afterSecondMove = translateX();

    // First finger lifts — the drag ends; a further move for that same
    // (now stale) pointer id changes nothing.
    frame.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0, isPrimary: true, clientX: 120, clientY: 100, bubbles: true }));
    frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, button: 0, isPrimary: true, clientX: 200, clientY: 200, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(translateX()).toBeCloseTo(afterSecondMove, 0);

    captureSpy.mockRestore();
  });
});

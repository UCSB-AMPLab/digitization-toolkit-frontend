// NEH-230: the gallery inspection modal gains fit/1:1 zoom controls (it had
// none before — a plain <img> with no zoom at all), and drag-to-pan on the
// image itself.
//
// Version: 0.2.1
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import '../../../../../../../app.css';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, recordsApi, type Record as ApiRecord, type RecordImage } from '$lib/api';
import ImageViewerModal from './ImageViewerModal.svelte';
import { es } from '$lib/i18n/es';

// A real, decodable 1200x800 PNG so naturalWidth/Height resolve — matches
// ImageViewer.svelte.test.ts's approach for the same reason.
function make1200x800DataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(0, 0, 1200, 800);
  return canvas.toDataURL('image/png');
}

function makeImage(overrides: Partial<RecordImage> = {}): RecordImage {
  return {
    id: 1,
    record_id: 1,
    filename: 'single.jpg',
    file_path: '/x',
    format: 'jpeg',
    is_current: true,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<ApiRecord> = {}): ApiRecord {
  return {
    id: 1,
    title: 'Test record',
    status: 'in_review',
    capture_mode: 'single',
    images: [makeImage()],
    ...overrides,
  };
}

describe('ImageViewerModal — fit / 1:1 zoom controls (NEH-230)', () => {
  let getImagePreviewUrlSpy: ReturnType<typeof vi.spyOn>;
  const dataUrl = make1200x800DataUrl();

  beforeEach(() => {
    // Point getImagePreviewUrl at a canvas-drawn data URL so naturalWidth/
    // Height are real, same approach as ImageViewer.svelte.test.ts.
    getImagePreviewUrlSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(dataUrl);
  });

  afterEach(() => {
    getImagePreviewUrlSpy.mockRestore();
  });

  it('clicking 1:1 scales the image past 1, and fit brings it back to scale(1)', async () => {
    const screen = render(ImageViewerModal, {
      record: makeRecord(),
      onClose: vi.fn(),
      onRetake: vi.fn(),
      onDelete: vi.fn(),
    });

    const img = screen.container.querySelector('img.img-viewer-img') as HTMLImageElement;
    await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);
    // Let bind:clientWidth/clientHeight (ResizeObserver-driven) catch up —
    // see the matching comment in ImageViewer.svelte.test.ts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    // Real click path: through the locator, same as a user tapping the
    // button — this is exactly what regressed when the frame's
    // pointerdown captured the pointer unconditionally (see
    // handlePointerDown's button/link guard).
    await screen.getByRole('button', { name: 'Tamaño real (1:1)' }).click();
    await expect.poll(() => {
      const match = img.style.transform.match(/scale\(([^)]+)\)/);
      return match ? Number(match[1]) : NaN;
    }).toBeGreaterThan(1);

    await screen.getByRole('button', { name: 'Ajustar a pantalla' }).click();
    await expect.poll(() => img.style.transform).toMatch(/scale\(1\)/);
  });

  it('dragging the image (not a control) still pans it at zoom > 1', async () => {
    const screen = render(ImageViewerModal, {
      record: makeRecord(),
      onClose: vi.fn(),
      onRetake: vi.fn(),
      onDelete: vi.fn(),
    });

    const img = screen.container.querySelector('img.img-viewer-img') as HTMLImageElement;
    const frame = img.closest('.img-viewer-frame') as HTMLElement;
    await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    await screen.getByRole('button', { name: 'Tamaño real (1:1)' }).click();
    await expect.poll(() => {
      const match = img.style.transform.match(/scale\(([^)]+)\)/);
      return match ? Number(match[1]) : NaN;
    }).toBeGreaterThan(1);
    const transformAfterZoom = img.style.transform;

    frame.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, bubbles: true }));
    frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, button: 0, isPrimary: true, clientX: 60, clientY: 80, bubbles: true }));
    frame.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0, isPrimary: true, clientX: 60, clientY: 80, bubbles: true }));

    await expect.poll(() => img.style.transform).not.toBe(transformAfterZoom);
    expect(img.style.transform.startsWith('translate(')).toBe(true);
    expect(img.style.transform).not.toMatch(/^translate\(0px, 0px\)/);
  });

  it('a second finger is ignored and does not corrupt an in-progress drag', async () => {
    // See the matching comment in ImageViewer.svelte.test.ts: a genuine
    // second touch point has no real "active pointer" standing in
    // Chromium for a synthetic dispatchEvent, so setPointerCapture(2)
    // would throw regardless of app logic — stub it to test the
    // component's own pointer-id bookkeeping instead.
    const captureSpy = vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => {});

    const screen = render(ImageViewerModal, {
      record: makeRecord(),
      onClose: vi.fn(),
      onRetake: vi.fn(),
      onDelete: vi.fn(),
    });

    const img = screen.container.querySelector('img.img-viewer-img') as HTMLImageElement;
    const frame = img.closest('.img-viewer-frame') as HTMLElement;
    await expect.poll(() => img.naturalWidth).toBeGreaterThan(0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    await screen.getByRole('button', { name: 'Tamaño real (1:1)' }).click();
    await expect.poll(() => {
      const match = img.style.transform.match(/scale\(([^)]+)\)/);
      return match ? Number(match[1]) : NaN;
    }).toBeGreaterThan(1);

    function translateX(): number {
      const match = img.style.transform.match(/^translate\(([-\d.]+)px/);
      return match ? Number(match[1]) : NaN;
    }
    const before = translateX();

    frame.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, bubbles: true }));
    // Second finger touches down mid-drag — must be ignored.
    frame.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, button: 0, isPrimary: false, clientX: 400, clientY: 100, bubbles: true }));
    frame.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, button: 0, isPrimary: true, clientX: 110, clientY: 100, bubbles: true }));

    await expect.poll(translateX).not.toBeNaN();
    expect(translateX()).toBeCloseTo(before + 10, 0); // not a huge jump toward 400

    captureSpy.mockRestore();
  });
});

describe('ImageViewerModal — retake only for a captured or rejected record', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(make1200x800DataUrl());
  });
  afterEach(() => spy.mockRestore());

  function footerButtons(status: 'captured' | 'in_review' | 'approved' | 'rejected', userRole: string) {
    const screen = render(ImageViewerModal, {
      record: makeRecord({ status }),
      onClose: vi.fn(),
      onRetake: vi.fn(),
      onDelete: vi.fn(),
      userRole,
    });
    const footer = screen.container.querySelector('.img-viewer-footer') as HTMLElement;
    return Array.from(footer.querySelectorAll('button')).map((b) => b.textContent ?? '');
  }

  for (const role of ['operator', 'admin']) {
    for (const status of ['captured', 'rejected'] as const) {
      it(`offers the retake to an ${role} on a ${status} record`, () => {
        expect(footerButtons(status, role).some((t) => t.includes(es.col_retake))).toBe(true);
      });
    }
    for (const status of ['in_review', 'approved'] as const) {
      it(`offers no retake to an ${role} on a record ${status}`, () => {
        expect(footerButtons(status, role).some((t) => t.includes(es.col_retake))).toBe(false);
      });
    }
  }

  it('still lets an admin delete a record in review', () => {
    expect(footerButtons('in_review', 'admin').some((t) => t.includes(es.common_delete))).toBe(true);
  });
});

// An excluded record (Fisqua contract 1.6) takes no retake, and only an admin
// may delete it (the backend's 409 otherwise); the modal says what the
// exclusion means.
describe('ImageViewerModal — a record Fisqua excluded', () => {
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let changesSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(make1200x800DataUrl());
    changesSpy = vi.spyOn(collectionsApi, 'statusChanges').mockResolvedValue([]);
  });
  afterEach(() => {
    previewSpy.mockRestore();
    changesSpy.mockRestore();
  });

  function mount(userRole: string) {
    return render(ImageViewerModal, {
      record: makeRecord({ status: 'excluded', collection_id: 7 }),
      onClose: vi.fn(),
      onRetake: vi.fn(),
      onDelete: vi.fn(),
      userRole,
    });
  }
  const buttons = (screen: ReturnType<typeof mount>) =>
    Array.from((screen.container.querySelector('.img-viewer-footer') as HTMLElement).querySelectorAll('button')).map(
      (b) => b.textContent ?? ''
    );

  it('offers an operator neither retake nor delete, and shows the hint', async () => {
    const screen = mount('operator');
    await expect.element(screen.getByText(es.status_excluded_hint)).toBeInTheDocument();
    expect(buttons(screen).some((t) => t.includes(es.col_retake))).toBe(false);
    expect(buttons(screen).some((t) => t.includes(es.common_delete))).toBe(false);
  });

  it('lets an admin delete it, with no retake', async () => {
    const screen = mount('admin');
    await expect.element(screen.getByText(es.status_excluded_hint)).toBeInTheDocument();
    expect(buttons(screen).some((t) => t.includes(es.col_retake))).toBe(false);
    expect(buttons(screen).some((t) => t.includes(es.common_delete))).toBe(true);
  });
});

describe('ImageViewerModal — the footer at phone and monitor widths', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(make1200x800DataUrl());
  });
  afterEach(() => spy.mockRestore());

  async function renderFooter(width: number) {
    await page.viewport(width, 800);
    await document.fonts.load('18px "Material Symbols Outlined"');
    await document.fonts.load('600 16px Mulish');
    const screen = render(ImageViewerModal, {
      record: makeRecord({ status: 'captured' }),
      onClose: vi.fn(),
      onRetake: vi.fn(),
      onDelete: vi.fn(),
      userRole: 'operator',
    });
    const content = screen.container.querySelector('.img-viewer-content') as HTMLElement;
    const footer = content.querySelector('.img-viewer-footer') as HTMLElement;
    const buttons = Array.from(footer.querySelectorAll('button')) as HTMLElement[];
    return { content, footer, buttons };
  }

  // How many lines a button's label takes: the distinct tops of its text's line boxes.
  function labelLines(b: HTMLElement): number {
    const text = Array.from(b.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    const range = document.createRange();
    const tops = new Set<number>();
    for (const node of text) {
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) if (r.width > 0) tops.add(Math.round(r.top));
    }
    return tops.size;
  }

  for (const width of [320, 360, 390]) {
    it(`at ${width}px, overflows nothing and keeps every label on one line`, async () => {
      const { content, footer, buttons } = await renderFooter(width);
      expect(footer.scrollWidth).toBeLessThanOrEqual(footer.clientWidth);
      const frame = content.getBoundingClientRect();
      for (const b of buttons) {
        expect(b.getBoundingClientRect().right).toBeLessThanOrEqual(frame.right);
        expect(labelLines(b), b.textContent ?? '').toBe(1);
      }
    });
  }

  it('keeps close, retake and delete on one row on a monitor', async () => {
    const { buttons } = await renderFooter(1400);
    expect(buttons.map((b) => b.textContent ?? '').some((t) => t.includes(es.col_retake))).toBe(true);
    const tops = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(tops.size).toBe(1);
  });
});

// NEH-139: a RAW (.cr2) record must never put its file URL straight into an
// <img> in either inspection modal — Chromium cannot decode CR2, the operator
// sees a broken image and retakes, and the retake supersedes the master.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord, type RecordImage } from '$lib/api';
import GalleryModal from '../../routes/(dashboard)/dashboard/projects/[projectId]/collections/[collectionId]/ImageViewerModal.svelte';
import LiveModal from '../../routes/live-preview/ImageViewerModal.svelte';

const FILE_URL = 'http://dtk.invalid/records/images/1/file';
const BROKEN_THUMB = 'data:image/png;base64,AAAA';

function canvasPng(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(0, 0, w, h);
  return c;
}
const THUMB_URL = canvasPng(60, 40).toDataURL('image/png');
async function previewBlob(): Promise<Blob> {
  return new Promise((resolve) => canvasPng(120, 80).toBlob((b) => resolve(b!), 'image/png'));
}

function makeImage(overrides: Partial<RecordImage> = {}): RecordImage {
  return { id: 1, record_id: 1, filename: 'IMG_0001.cr2', file_path: '/x', format: 'cr2', is_current: true, ...overrides };
}
function makeRecord(images: RecordImage[]): ApiRecord {
  return { id: 1, title: 'Folio 1', status: 'captured', capture_mode: 'single', images } as ApiRecord;
}

// Every src any <img> under the container has ever had, not just the last one.
function recordImgSrcs(container: HTMLElement): string[] {
  const seen: string[] = [];
  const collect = () => container.querySelectorAll('img').forEach((i) => seen.push(i.getAttribute('src') ?? ''));
  collect();
  new MutationObserver(collect).observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  return seen;
}

const modals = [
  ['gallery modal', (record: ApiRecord) => render(GalleryModal, { record, onClose: vi.fn(), onRetake: vi.fn(), onDelete: vi.fn() })],
  ['live-preview modal', (record: ApiRecord) => render(LiveModal, { record, cameraMode: 'single', onClose: vi.fn(), onRetake: vi.fn() })],
] as const;

describe.each(modals)('%s — RAW images (NEH-139)', (_name, renderModal) => {
  let fileSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fileSpy = vi.spyOn(recordsApi, 'getImageFileUrl').mockReturnValue(FILE_URL);
    thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB_URL);
  });
  afterEach(() => {
    fileSpy.mockRestore();
    thumbSpy.mockRestore();
    fetchSpy?.mockRestore();
  });

  it('shows the JPEG preview the backend sends, labelled, never the file URL', async () => {
    const blob = await previewBlob();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(blob, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
    const screen = renderModal(makeRecord([makeImage()]));
    const srcs = recordImgSrcs(screen.container);

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src') ?? '').toMatch(/^blob:/);
    await expect.element(screen.getByText('Vista previa (RAW)')).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledWith(FILE_URL, expect.anything());
    expect(srcs).not.toContain(FILE_URL);
  });

  it('falls back to the thumbnail when /file streams RAW bytes', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('II*\u0000raw', { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
    );
    const screen = renderModal(makeRecord([makeImage()]));
    const srcs = recordImgSrcs(screen.container);

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB_URL);
    await expect.element(screen.getByText('Miniatura (RAW)')).toBeVisible();
    expect(srcs).not.toContain(FILE_URL);
  });

  it('shows an explicit state with the filename, and no <img>, when nothing can be displayed', async () => {
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('raw', { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
    );
    const screen = renderModal(makeRecord([makeImage()]));
    const srcs = recordImgSrcs(screen.container);

    await expect.element(screen.getByText('No se puede mostrar este formato')).toBeVisible();
    await expect.element(screen.getByText('IMG_0001.cr2')).toBeVisible();
    expect(screen.container.querySelector('img')).toBeNull();
    expect(srcs).not.toContain(FILE_URL);
  });

  it('a dual pair with one RAW side: the JPEG side keeps its file URL, the RAW side does not', async () => {
    fileSpy.mockImplementation((id: number) => `http://dtk.invalid/records/images/${id}/file`);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('raw', { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
    );
    const screen = renderModal({
      ...makeRecord([
        makeImage({ id: 1, role: 'left', format: 'jpg', filename: 'L.jpg' }),
        makeImage({ id: 2, role: 'right', format: 'cr2', filename: 'R.cr2' }),
      ]),
      capture_mode: 'dual',
    } as ApiRecord);
    const srcs = recordImgSrcs(screen.container);

    await expect.element(screen.getByText('Miniatura (RAW)')).toBeVisible();
    const now = [...screen.container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(now).toContain('http://dtk.invalid/records/images/1/file');
    expect(now).toContain(THUMB_URL);
    expect(srcs).not.toContain('http://dtk.invalid/records/images/2/file');
  });
});

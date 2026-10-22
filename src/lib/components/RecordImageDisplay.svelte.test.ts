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
// Two different undecodable URLs: an <img> whose src is set to the value it
// already has does not fire a second error.
const BROKEN = 'data:image/png;base64,AAAA';
const BROKEN_THUMB = 'data:image/png;base64,BBBB';

function canvasPng(w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}
const PREVIEW_URL = canvasPng(120, 80);
const THUMB_URL = canvasPng(60, 40);

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
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fileSpy = vi.spyOn(recordsApi, 'getImageFileUrl').mockImplementation((id: number) => `http://dtk.invalid/records/images/${id}/file`);
    previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(PREVIEW_URL);
    thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB_URL);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  });
  afterEach(() => {
    fileSpy.mockRestore();
    previewSpy.mockRestore();
    thumbSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('shows the JPEG preview from /preview, labelled, never the /file URL', async () => {
    const screen = renderModal(makeRecord([makeImage()]));
    const srcs = recordImgSrcs(screen.container);

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(PREVIEW_URL);
    await expect.element(screen.getByText('Vista previa (RAW)')).toBeVisible();
    expect(srcs).not.toContain(FILE_URL);
  });

  it('falls back to the thumbnail when /preview fails (no sidecar)', async () => {
    previewSpy.mockReturnValue(BROKEN);
    const screen = renderModal(makeRecord([makeImage()]));
    const srcs = recordImgSrcs(screen.container);

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB_URL);
    await expect.element(screen.getByText('Miniatura (RAW)')).toBeVisible();
    expect(srcs).not.toContain(FILE_URL);
  });

  it('nothing displayable, master confirmed by /file: explicit state, filename, and the original is stored', async () => {
    previewSpy.mockReturnValue(BROKEN);
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    const screen = renderModal(makeRecord([makeImage()]));
    const srcs = recordImgSrcs(screen.container);

    await expect.element(screen.getByText('No se puede mostrar este formato')).toBeVisible();
    await expect.element(screen.getByText('IMG_0001.cr2')).toBeVisible();
    await expect.element(screen.getByText('El archivo original está guardado en el equipo.')).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledWith(FILE_URL, expect.anything());
    expect(screen.container.querySelector('img')).toBeNull();
    expect(srcs).not.toContain(FILE_URL);
  });

  it('nothing displayable, master not confirmed: no claim that the original is stored', async () => {
    previewSpy.mockReturnValue(BROKEN);
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    fetchSpy.mockResolvedValue(new Response('', { status: 401 }));
    const screen = renderModal(makeRecord([makeImage()]));

    await expect.element(screen.getByText('No se puede mostrar este formato')).toBeVisible();
    await expect.poll(() => fetchSpy.mock.calls.length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.container.textContent).not.toContain('El archivo original está guardado');
  });

  it('nothing displayable and /file answers 404: says the file was not found', async () => {
    previewSpy.mockReturnValue(BROKEN);
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }));
    const screen = renderModal(makeRecord([makeImage()]));

    await expect.element(screen.getByText('No se encontró el archivo de esta imagen.')).toBeVisible();
    expect(screen.container.textContent).not.toContain('El archivo original está guardado');
  });

  it('a dual pair with one RAW side: neither side ever puts /file in an <img>', async () => {
    previewSpy.mockImplementation((id: number) => (id === 1 ? PREVIEW_URL : BROKEN));
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
    expect(now).toEqual(expect.arrayContaining([PREVIEW_URL, THUMB_URL]));
    expect(srcs.some((u) => u.endsWith('/file'))).toBe(false);
  });
});

describe('gallery modal — download link', () => {
  it('keeps the download link on /file, so it fetches the real master', async () => {
    const fileSpy = vi.spyOn(recordsApi, 'getImageFileUrl').mockReturnValue(FILE_URL);
    const previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(PREVIEW_URL);
    const screen = render(GalleryModal, { record: makeRecord([makeImage()]), onClose: vi.fn(), onRetake: vi.fn(), onDelete: vi.fn() });
    expect(screen.container.querySelector('a.img-viewer-download')?.getAttribute('href')).toBe(FILE_URL);
    fileSpy.mockRestore();
    previewSpy.mockRestore();
  });
});

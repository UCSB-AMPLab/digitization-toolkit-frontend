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

describe.each(modals)('%s — non-RAW images (NEH-139)', (_name, renderModal) => {
  let fileSpy: ReturnType<typeof vi.spyOn>;
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fileSpy = vi.spyOn(recordsApi, 'getImageFileUrl').mockReturnValue(FILE_URL);
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

  it('a TIFF is shown by its thumbnail, labelled without RAW, and /preview is never tried', async () => {
    const screen = renderModal(makeRecord([makeImage({ format: 'tiff', filename: 'scan.tiff' })]));
    const srcs = recordImgSrcs(screen.container);

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB_URL);
    await expect.element(screen.getByText('Miniatura', { exact: true })).toBeVisible();
    expect(screen.container.textContent).not.toContain('RAW');
    expect(srcs).not.toContain(PREVIEW_URL);
    expect(srcs).not.toContain(FILE_URL);
  });

  it('a TIFF whose thumbnail fails: format-neutral state naming the format, and the original is stored', async () => {
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    const screen = renderModal(makeRecord([makeImage({ format: 'tiff', filename: 'scan.tiff' })]));

    await expect.element(screen.getByText('No se puede mostrar esta imagen')).toBeVisible();
    await expect.element(screen.getByText('scan.tiff')).toBeVisible();
    await expect.element(screen.getByText('El navegador no puede mostrar archivos TIFF', { exact: false })).toBeVisible();
    await expect.element(screen.getByText('El archivo original está guardado en el equipo.')).toBeVisible();
    expect(screen.container.textContent).not.toContain('RAW');
    expect(screen.container.querySelector('img')).toBeNull();
  });

  it('a JPEG whose /preview fails falls back to the thumbnail instead of staying broken', async () => {
    previewSpy.mockReturnValue(BROKEN);
    const screen = renderModal(makeRecord([makeImage({ format: 'jpg', filename: 'f.jpg' })]));

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB_URL);
    await expect.element(screen.getByText('Miniatura', { exact: true })).toBeVisible();
  });

  it('unmounting aborts the in-flight existence check', async () => {
    previewSpy.mockReturnValue(BROKEN);
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    let signal: AbortSignal | undefined;
    fetchSpy.mockImplementation((_u: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const screen = renderModal(makeRecord([makeImage({ format: 'jpg', filename: 'f.jpg' })]));

    await expect.poll(() => signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
    screen.unmount();
    expect(signal!.aborted).toBe(true);
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

// NEH-248: a file freed from the card is answered 410 with a body that says it
// is stored offsite (_freed in app/api/records.py). It must never look missing.
function freed410(kind: 'capture' | 'preview'): Response {
  const detail = {
    message: 'This file is stored offsite and has been freed from the card to make room. An admin can restore the volume to bring it back.',
    stored_offsite: true,
    image_id: 1,
    kind,
    key: 'rionegro/co-x/captures/IMG_0001.cr2',
    freed_at: '2026-10-20T14:03:00+00:00',
  };
  return new Response(JSON.stringify({ detail }), { status: 410, headers: { 'Content-Type': 'application/json' } });
}

describe.each(modals)('%s — images freed from the card (NEH-248)', (_name, renderModal) => {
  let fileSpy: ReturnType<typeof vi.spyOn>;
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fileSpy = vi.spyOn(recordsApi, 'getImageFileUrl').mockImplementation((id: number) => `http://dtk.invalid/records/images/${id}/file`);
    // The <img> cannot load the freed preview; fetch reads its 410.
    previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(BROKEN);
    thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB_URL);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((u: RequestInfo | URL) =>
      Promise.resolve(String(u) === BROKEN ? freed410('preview') : freed410('capture')),
    );
  });
  afterEach(() => {
    fileSpy.mockRestore();
    previewSpy.mockRestore();
    thumbSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('a freed RAW preview: the thumbnail, with the calm panel instead of the thumbnail badge', async () => {
    const screen = renderModal(makeRecord([makeImage()]));

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB_URL);
    await expect.element(screen.getByText('Imagen guardada en la copia externa')).toBeVisible();
    await expect.element(screen.getByText('No se perdió nada', { exact: false })).toBeVisible();
    await expect.element(screen.getByText('un administrador puede restaurar el volumen', { exact: false })).toBeVisible();
    await expect.element(screen.getByText('Lo que ves es la miniatura, que Captua conserva en el equipo.')).toBeVisible();
    expect(screen.container.textContent).not.toContain('Miniatura (RAW)');
    expect(fetchSpy).toHaveBeenCalledWith(BROKEN, expect.anything());
  });

  it('a freed JPEG master: the same panel over its thumbnail', async () => {
    const screen = renderModal(makeRecord([makeImage({ format: 'jpg', filename: 'f.jpg' })]));

    await expect.element(screen.getByText('Imagen guardada en la copia externa')).toBeVisible();
    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB_URL);
    expect(screen.container.textContent).not.toContain('Miniatura');
  });

  it('a freed file with no thumbnail: the panel alone, never "not found" or "cannot display"', async () => {
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    const screen = renderModal(makeRecord([makeImage()]));

    await expect.element(screen.getByText('Imagen guardada en la copia externa')).toBeVisible();
    await expect.element(screen.getByTestId('image-freed')).toBeVisible();
    expect(screen.container.querySelector('img')).toBeNull();
    expect(screen.container.textContent).not.toContain('Lo que ves es la miniatura');
    expect(screen.container.textContent).not.toContain('No se encontró el archivo');
    expect(screen.container.textContent).not.toContain('No se puede mostrar');
  });

  it('a master /file answers 410 for, with nothing else to show: the panel', async () => {
    thumbSpy.mockReturnValue(BROKEN_THUMB);
    // The preview probe says nothing; only /file says the master is freed.
    fetchSpy.mockImplementation((u: RequestInfo | URL) =>
      Promise.resolve(String(u) === BROKEN ? new Response('', { status: 404 }) : freed410('capture')),
    );
    const screen = renderModal(makeRecord([makeImage({ format: 'jpg', filename: 'f.jpg' })]));

    await expect.element(screen.getByTestId('image-freed')).toBeVisible();
    expect(screen.container.textContent).not.toContain('No se encontró el archivo');
  });

  it('a /preview that fails for another reason keeps the ordinary thumbnail badge', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 404 }));
    const screen = renderModal(makeRecord([makeImage()]));

    await expect.element(screen.getByText('Miniatura (RAW)')).toBeVisible();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.container.textContent).not.toContain('Imagen guardada en la copia externa');
  });
});

describe.each(modals)('%s — a freed image shown only by its thumbnail (NEH-248)', (_name, renderModal) => {
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(PREVIEW_URL);
    thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB_URL);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  });
  afterEach(() => {
    previewSpy.mockRestore();
    thumbSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('a TIFF whose master is freed: the panel over its thumbnail, read from the record', async () => {
    const screen = renderModal(makeRecord([makeImage({ format: 'tif', filename: 'f.tif', master_freed_at: '2026-10-20T14:03:00' })]));

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB_URL);
    await expect.element(screen.getByText('Imagen guardada en la copia externa')).toBeVisible();
    await expect.element(screen.getByText('Lo que ves es la miniatura, que Captua conserva en el equipo.')).toBeVisible();
    expect(screen.container.textContent).not.toContain('Miniatura');
  });

  it('a TIFF whose master is on the card keeps the ordinary thumbnail badge', async () => {
    const screen = renderModal(makeRecord([makeImage({ format: 'tif', filename: 'f.tif' })]));

    await expect.element(screen.getByText('Miniatura', { exact: true })).toBeVisible();
    expect(screen.container.textContent).not.toContain('Imagen guardada en la copia externa');
  });

  it('a JPEG with the field set but a /preview that loads: the image, no panel (the 410 decides)', async () => {
    const screen = renderModal(makeRecord([makeImage({ format: 'jpg', filename: 'f.jpg', master_freed_at: '2026-10-20T14:03:00' })]));

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(PREVIEW_URL);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.container.textContent).not.toContain('Imagen guardada en la copia externa');
  });
});

describe('gallery modal — a RAW preview restored on its own (NEH-248)', () => {
  it('drops the freed panel and shows the preview once preview_freed_at is cleared', async () => {
    const previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(BROKEN);
    const thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB_URL);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(freed410('preview')));
    const freedAt = '2026-10-20T14:03:00';
    // The master's restore failed, so it stays freed; only the preview is back.
    const before = makeRecord([makeImage({ master_freed_at: freedAt, preview_freed_at: freedAt })]);
    const after = makeRecord([makeImage({ master_freed_at: freedAt, preview_freed_at: null })]);
    const screen = render(GalleryModal, { record: before, onClose: vi.fn(), onRetake: vi.fn(), onDelete: vi.fn() });
    await expect.element(screen.getByTestId('image-freed')).toBeVisible();

    previewSpy.mockReturnValue(PREVIEW_URL);
    await screen.rerender({ record: after });

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(PREVIEW_URL);
    await expect.element(screen.getByTestId('image-freed')).not.toBeInTheDocument();
    await expect.element(screen.getByText('Vista previa (RAW)')).toBeVisible();
    previewSpy.mockRestore();
    thumbSpy.mockRestore();
    fetchSpy.mockRestore();
  });
});

describe('gallery modal — download link of a freed master (NEH-248)', () => {
  it('offers no download for a master freed from the card', async () => {
    const previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(PREVIEW_URL);
    const screen = render(GalleryModal, {
      record: makeRecord([makeImage({ master_freed_at: '2026-10-20T14:03:00' })]),
      onClose: vi.fn(),
      onRetake: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(screen.container.querySelector('a.img-viewer-download')).toBeNull();
    previewSpy.mockRestore();
  });
});

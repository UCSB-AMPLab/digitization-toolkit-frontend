// The live-preview inspection modal: a rejected record shows why it was
// rejected (the newest rejection), so the operator retaking it sees the note
// without going back to Por recapturar. Other records make no request.
// The modal opens on the thumbnails (0.3.1) and loads /preview only when the
// operator asks for full size, which shows the images under a shared zoom.
//
// Version: 0.3.1
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, recordsApi, type Record as ApiRecord, type RecordRejection } from '$lib/api';
import { es } from '$lib/i18n/es';
import { locale } from '$lib/i18n';
import ImageViewerModal from './ImageViewerModal.svelte';

const THUMB = (() => {
  const c = document.createElement('canvas');
  c.width = 60;
  c.height = 40;
  return c.toDataURL('image/png');
})();

function makeRecord(status: string): ApiRecord {
  return {
    id: 7,
    title: 'Folio 7',
    status,
    capture_mode: 'single',
    images: [{ id: 1, record_id: 7, filename: 'IMG_0001.jpg', file_path: '/x', format: 'jpg', is_current: true }],
  } as ApiRecord;
}

function makeRejection(overrides: Partial<RecordRejection> = {}): RecordRejection {
  return { id: 2, record_id: 7, predefined_reason: 'blur', comment: 'Folios 28r, 27v: movidos', rejected_by: 'Ana', rejected_at: '2026-10-27T15:30:00', images: [], ...overrides };
}

function renderModal(record: ApiRecord) {
  return render(ImageViewerModal, { record, cameraMode: 'single', onClose: vi.fn(), onRetake: vi.fn() });
}

describe('live-preview ImageViewerModal — latest rejection', () => {
  let listSpy: ReturnType<typeof vi.spyOn>;
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    locale.set('es');
    listSpy = vi.spyOn(recordsApi, 'listRejections');
    previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(THUMB);
    thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB);
  });
  afterEach(() => {
    listSpy.mockRestore();
    previewSpy.mockRestore();
    thumbSpy.mockRestore();
  });

  it('a rejected record shows the newest rejection: reason, comment, who and when', async () => {
    listSpy.mockResolvedValue([
      makeRejection(),
      makeRejection({ id: 1, predefined_reason: 'glare', comment: 'una nota antigua', rejected_by: 'Luis' }),
    ]);
    const screen = renderModal(makeRecord('rejected'));

    expect(listSpy).toHaveBeenCalledWith(7);
    await expect.element(screen.getByText('Imagen movida')).toBeVisible();
    await expect.element(screen.getByText('Folios 28r, 27v: movidos')).toBeVisible();
    await expect.element(screen.getByText('Rechazado por Ana', { exact: false })).toBeVisible();
    expect(screen.container.textContent).not.toContain('una nota antigua');
    expect(screen.container.textContent).not.toContain('Luis');
  });

  it('a rejection with no reason says so; with no comment, shows no note', async () => {
    listSpy.mockResolvedValue([makeRejection({ predefined_reason: '', comment: null, rejected_by: null })]);
    const screen = renderModal(makeRecord('rejected'));

    await expect.element(screen.getByText('No quedó registrado el motivo de este rechazo.')).toBeVisible();
    await expect.element(screen.getByText('Rechazado el', { exact: false })).toBeVisible();
    expect(screen.container.querySelector('.lv-rejection-comment')).toBeNull();
  });

  it('a captured record makes no listRejections call', async () => {
    listSpy.mockResolvedValue([makeRejection()]);
    const screen = renderModal(makeRecord('captured'));

    await expect.element(screen.getByText('Folio 7')).toBeVisible();
    await new Promise((r) => setTimeout(r, 50));
    expect(listSpy).not.toHaveBeenCalled();
    expect(screen.container.querySelector('[data-testid="lv-rejection"]')).toBeNull();
  });

  it('a captured record marked pending (prepared for retake) shows the newest rejection (0.2.0)', async () => {
    listSpy.mockResolvedValue([makeRejection()]);
    const screen = render(ImageViewerModal, { record: makeRecord('captured'), cameraMode: 'single', onClose: vi.fn(), onRetake: vi.fn(), pending: true });
    await expect.element(screen.getByText('Folios 28r, 27v: movidos')).toBeVisible();
    expect(listSpy).toHaveBeenCalledWith(7);
  });

  it('a failing listRejections leaves the modal usable, with nothing extra', async () => {
    listSpy.mockRejectedValue(new Error('network'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const screen = renderModal(makeRecord('rejected'));

    await expect.poll(() => listSpy.mock.calls.length).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    await expect.element(screen.getByText('Folio 7')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Cerrar' }).first()).toBeVisible();
    expect(screen.container.querySelector('[data-testid="lv-rejection"]')).toBeNull();
    consoleSpy.mockRestore();
  });

  it('an empty history shows nothing extra', async () => {
    listSpy.mockResolvedValue([]);
    const screen = renderModal(makeRecord('rejected'));

    await expect.poll(() => listSpy.mock.calls.length).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.container.querySelector('[data-testid="lv-rejection"]')).toBeNull();
  });
});

// A record Fisqua excluded (contract 1.6) takes no retake: the backend answers
// the capture with a 409. The modal offers none and says why.
describe('live-preview ImageViewerModal — a record Fisqua excluded', () => {
  let changesSpy: ReturnType<typeof vi.spyOn>;
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    locale.set('es');
    changesSpy = vi.spyOn(collectionsApi, 'statusChanges').mockResolvedValue([]);
    previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(THUMB);
    thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB);
  });
  afterEach(() => {
    changesSpy.mockRestore();
    previewSpy.mockRestore();
    thumbSpy.mockRestore();
  });

  it('offers no retake and shows the exclusion hint', async () => {
    const screen = renderModal({ ...makeRecord('excluded'), collection_id: 9 } as ApiRecord);
    await expect.element(screen.getByText(es.status_excluded_hint)).toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: es.lvm_retake })).not.toBeInTheDocument();
    // The footer keeps its Close button.
    const footer = screen.container.querySelector('.img-viewer-footer') as HTMLElement;
    expect(Array.from(footer.querySelectorAll('button')).map((b) => b.textContent ?? '').some((t) => t.includes(es.common_close))).toBe(true);
  });

  it('still offers the retake on a captured record', async () => {
    const screen = renderModal(makeRecord('captured'));
    await expect.element(screen.getByRole('button', { name: es.lvm_retake })).toBeInTheDocument();
    await expect.element(screen.getByText(es.status_excluded_hint)).not.toBeInTheDocument();
  });
});

// 0.3.1: the modal opens on each image's thumbnail and requests no /preview
// until the operator asks for full size; full size goes through
// RecordImageDisplay, with the gallery modal's fit and 1:1 controls.
function msg(key: string): string {
  const value = (es as unknown as { [k: string]: unknown })[key];
  if (typeof value !== 'string') throw new Error(`missing message ${key}`);
  return value;
}

const PREVIEW = (() => {
  const c = document.createElement('canvas');
  c.width = 120;
  c.height = 80;
  return c.toDataURL('image/png');
})();
const BROKEN = 'data:image/png;base64,AAAA';

function freed410(): Response {
  const detail = {
    message: 'This file is stored offsite and has been freed from the card to make room.',
    stored_offsite: true,
    image_id: 1,
    kind: 'capture',
    key: 'rionegro/co-x/captures/IMG_0001.jpg',
    freed_at: '2026-10-20T14:03:00+00:00',
  };
  return new Response(JSON.stringify({ detail }), { status: 410, headers: { 'Content-Type': 'application/json' } });
}

describe('live-preview ImageViewerModal — thumbnails first, full size on request (0.3.1)', () => {
  let previewSpy: ReturnType<typeof vi.spyOn>;
  let thumbSpy: ReturnType<typeof vi.spyOn>;
  let fileSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    locale.set('es');
    previewSpy = vi.spyOn(recordsApi, 'getImagePreviewUrl').mockReturnValue(PREVIEW);
    thumbSpy = vi.spyOn(recordsApi, 'getImageThumbnailUrl').mockReturnValue(THUMB);
    fileSpy = vi.spyOn(recordsApi, 'getImageFileUrl').mockReturnValue('http://dtk.invalid/records/images/1/file');
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
  });
  afterEach(() => {
    previewSpy.mockRestore();
    thumbSpy.mockRestore();
    fileSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it('opens on the thumbnail and requests no /preview', async () => {
    const screen = renderModal(makeRecord('captured'));
    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB);
    expect(thumbSpy).toHaveBeenCalledWith(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(previewSpy).not.toHaveBeenCalled();
    // No zoom controls on the thumbnails.
    expect(screen.container.querySelector('.img-viewer-zoom-controls')).toBeNull();
  });

  it('full size loads /preview with the fit and 1:1 controls, and going back returns to the thumbnails', async () => {
    const screen = renderModal(makeRecord('captured'));
    await screen.getByRole('button', { name: msg('lvm_full_size') }).click();

    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(PREVIEW);
    expect(previewSpy).toHaveBeenCalledWith(1);
    await expect.element(screen.getByRole('button', { name: es.col_fit_screen_aria })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: es.col_zoom_actual_aria })).toBeVisible();

    await screen.getByRole('button', { name: msg('lvm_thumbnails') }).click();
    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB);
    expect(screen.container.querySelector('.img-viewer-zoom-controls')).toBeNull();
    await expect.element(screen.getByRole('button', { name: msg('lvm_full_size') })).toBeVisible();
  });

  it('a freed master in full size shows the calm notice over the thumbnail, never an error', async () => {
    previewSpy.mockReturnValue(BROKEN);
    fetchSpy.mockImplementation(() => Promise.resolve(freed410()));
    const screen = renderModal(makeRecord('captured'));
    await screen.getByRole('button', { name: msg('lvm_full_size') }).click();

    await expect.element(screen.getByTestId('image-freed')).toBeVisible();
    await expect.poll(() => screen.container.querySelector('img')?.getAttribute('src')).toBe(THUMB);
    expect(screen.container.querySelector('[data-testid="image-missing"]')).toBeNull();
    expect(screen.container.querySelector('[data-testid="image-unviewable"]')).toBeNull();
  });
});

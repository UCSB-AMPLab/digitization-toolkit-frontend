// The live-preview inspection modal: a rejected record shows why it was
// rejected (the newest rejection), so the operator retaking it sees the note
// without going back to Por recapturar. Other records make no request.
//
// Version: 0.2.0
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord, type RecordRejection } from '$lib/api';
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

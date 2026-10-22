// NEH-139: what a viewer may display for a record image.
import { describe, it, expect, vi } from 'vitest';
import { displayCandidates, isRawImage, probeImage, type ImageUrlSource } from './image-display';

const api: ImageUrlSource = {
  getImageFileUrl: (id) => `/api/records/images/${id}/file`,
  getImageThumbnailUrl: (id) => `/api/records/images/${id}/thumbnail`,
};

describe('isRawImage', () => {
  it('reads the backend format field, in any case', () => {
    expect(isRawImage({ format: 'cr2', filename: 'a.cr2' })).toBe(true);
    expect(isRawImage({ format: 'CR2', filename: 'a.CR2' })).toBe(true);
    for (const f of ['nef', 'arw', 'raf', 'dng', 'raw']) {
      expect(isRawImage({ format: f, filename: `a.${f}` })).toBe(true);
    }
    expect(isRawImage({ format: 'jpg', filename: 'a.jpg' })).toBe(false);
    expect(isRawImage({ format: 'jpeg', filename: 'a.jpeg' })).toBe(false);
  });

  it('falls back to the filename extension when format is empty', () => {
    expect(isRawImage({ format: '', filename: 'IMG_0001.CR2' })).toBe(true);
    expect(isRawImage({ format: '', filename: 'IMG_0001.jpg' })).toBe(false);
    expect(isRawImage({ format: '', filename: 'noext' })).toBe(false);
  });
});

describe('displayCandidates', () => {
  it('shows a JPEG from its file URL, and nothing else', () => {
    expect(displayCandidates({ id: 7, format: 'jpg', filename: 'f.jpg' }, api)).toEqual([
      { kind: 'original', url: '/api/records/images/7/file' },
    ]);
  });

  it('never offers a CR2 file URL as an original: preview to probe, then thumbnail', () => {
    const c = displayCandidates({ id: 9, format: 'cr2', filename: 'f.cr2' }, api);
    expect(c).toEqual([
      { kind: 'preview', url: '/api/records/images/9/file', probe: true },
      { kind: 'thumbnail', url: '/api/records/images/9/thumbnail' },
    ]);
    expect(c.some((x) => x.kind === 'original')).toBe(false);
  });

  it('decides per image in a dual pair where one side is RAW', () => {
    const left = { id: 1, format: 'jpg', filename: 'L.jpg' };
    const right = { id: 2, format: 'cr2', filename: 'R.cr2' };
    expect(displayCandidates(left, api).map((c) => c.kind)).toEqual(['original']);
    expect(displayCandidates(right, api).map((c) => c.kind)).toEqual(['preview', 'thumbnail']);
  });
});

function response(status: number, contentType: string | null, body = 'x'): Response {
  const headers = new Headers();
  if (contentType) headers.set('content-type', contentType);
  return new Response(status === 204 ? null : body, { status, headers });
}

describe('probeImage', () => {
  it('keeps the body when the backend sends the JPEG preview', async () => {
    const f = vi.fn().mockResolvedValue(response(200, 'image/jpeg', 'jpegbytes'));
    const r = await probeImage('/u', f as unknown as typeof fetch);
    expect(r.status).toBe('image');
    if (r.status === 'image') expect(await r.blob.text()).toBe('jpegbytes');
  });

  it('reports not-image and aborts when the backend streams the RAW bytes (no preview)', async () => {
    let signal: AbortSignal | undefined;
    const f = vi.fn().mockImplementation((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(response(200, 'application/octet-stream'));
    });
    const r = await probeImage('/u', f as unknown as typeof fetch);
    expect(r).toEqual({ status: 'not-image' });
    expect(signal?.aborted).toBe(true);
  });

  it('reports missing on 404', async () => {
    const f = vi.fn().mockResolvedValue(response(404, 'application/json'));
    expect(await probeImage('/u', f as unknown as typeof fetch)).toEqual({ status: 'missing' });
  });

  it('reports error on other HTTP errors and on network failure', async () => {
    const f500 = vi.fn().mockResolvedValue(response(500, 'application/json'));
    expect(await probeImage('/u', f500 as unknown as typeof fetch)).toEqual({ status: 'error' });
    const fNet = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await probeImage('/u', fNet as unknown as typeof fetch)).toEqual({ status: 'error' });
  });
});

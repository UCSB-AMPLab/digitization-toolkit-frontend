// NEH-139: what a viewer may display for a record image.
import { describe, it, expect, vi } from 'vitest';
import {
  checkMasterStored,
  displayCandidates,
  formatOf,
  freedFromBody,
  isBrowserDisplayable,
  isRawImage,
  probeFreed,
  type ImageUrlSource,
} from './image-display';

const api: ImageUrlSource = {
  getImagePreviewUrl: (id) => `/api/records/images/${id}/preview`,
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

describe('formatOf / isBrowserDisplayable', () => {
  it('mirrors the backend displayable set: jpg, jpeg, png, webp', () => {
    expect(['jpg', 'jpeg', 'png', 'webp'].every((f) => isBrowserDisplayable({ format: f, filename: '' }))).toBe(true);
    expect(['tif', 'tiff', 'cr2', 'gif'].some((f) => isBrowserDisplayable({ format: f, filename: '' }))).toBe(false);
    expect(formatOf({ format: '', filename: 'scan.TIFF' })).toBe('tiff');
  });
});

describe('displayCandidates', () => {
  const isFileUrl = (u: string) => u.endsWith('/file');

  it('shows a JPEG, PNG or WebP from /preview, then its thumbnail', () => {
    for (const format of ['jpg', 'jpeg', 'png', 'webp']) {
      expect(displayCandidates({ id: 7, format, filename: `f.${format}` }, api)).toEqual([
        { kind: 'original', url: '/api/records/images/7/preview' },
        { kind: 'thumbnail', url: '/api/records/images/7/thumbnail' },
      ]);
    }
  });

  it('shows a TIFF (which /preview answers with 404) by its thumbnail only', () => {
    for (const format of ['tif', 'tiff']) {
      expect(displayCandidates({ id: 5, format, filename: `f.${format}` }, api)).toEqual([
        { kind: 'thumbnail', url: '/api/records/images/5/thumbnail' },
      ]);
    }
  });

  it('shows a CR2 by its preview, then its thumbnail, never by /file', () => {
    const c = displayCandidates({ id: 9, format: 'cr2', filename: 'f.cr2' }, api);
    expect(c).toEqual([
      { kind: 'preview', url: '/api/records/images/9/preview' },
      { kind: 'thumbnail', url: '/api/records/images/9/thumbnail' },
    ]);
    expect(c.some((x) => isFileUrl(x.url))).toBe(false);
  });

  it('decides per image in a dual pair where one side is RAW', () => {
    const left = { id: 1, format: 'jpg', filename: 'L.jpg' };
    const right = { id: 2, format: 'cr2', filename: 'R.cr2' };
    expect(displayCandidates(left, api).map((c) => c.kind)).toEqual(['original', 'thumbnail']);
    expect(displayCandidates(right, api).map((c) => c.kind)).toEqual(['preview', 'thumbnail']);
  });

  it('a RAW image whose preview is missing still has the thumbnail to fall back to', () => {
    // /preview answers 404 for a RAW master without a sidecar; the viewer then
    // moves to the next candidate.
    const c = displayCandidates({ id: 3, format: 'cr2', filename: 'nosidecar.cr2' }, api);
    expect(c[1]).toEqual({ kind: 'thumbnail', url: '/api/records/images/3/thumbnail' });
  });
});

function response(status: number): Response {
  return new Response('x', { status });
}

describe('checkMasterStored', () => {
  it('stored on 200, and the request is aborted once the headers arrive', async () => {
    let signal: AbortSignal | undefined;
    const f = vi.fn().mockImplementation((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(response(200));
    });
    expect(await checkMasterStored('/file', f as unknown as typeof fetch)).toBe('stored');
    expect(signal?.aborted).toBe(true);
  });

  it('missing on 404', async () => {
    const f = vi.fn().mockResolvedValue(response(404));
    expect(await checkMasterStored('/file', f as unknown as typeof fetch)).toBe('missing');
  });

  it('unknown on auth, server and network errors', async () => {
    for (const status of [401, 403, 500]) {
      const f = vi.fn().mockResolvedValue(response(status));
      expect(await checkMasterStored('/file', f as unknown as typeof fetch)).toBe('unknown');
    }
    const fNet = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await checkMasterStored('/file', fNet as unknown as typeof fetch)).toBe('unknown');
  });

  it("aborts the request when the caller's signal aborts", async () => {
    let signal: AbortSignal | undefined;
    const f = vi.fn().mockImplementation((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    const caller = new AbortController();
    const pending = checkMasterStored('/file', f as unknown as typeof fetch, caller.signal);
    caller.abort();
    expect(await pending).toBe('unknown');
    expect(signal?.aborted).toBe(true);
  });

  it("does not fetch at all when the caller's signal is already aborted", async () => {
    const f = vi.fn();
    const caller = new AbortController();
    caller.abort();
    expect(await checkMasterStored('/file', f as unknown as typeof fetch, caller.signal)).toBe('unknown');
    expect(f).not.toHaveBeenCalled();
  });
});

// NEH-248: the 410 of /file, /preview and /thumbnail for a file freed from the
// card, as _freed in app/api/records.py sends it (freed_detail in
// app/core/offsite_free.py): FastAPI puts the detail under "detail".
function freed(kind: 'capture' | 'preview' = 'capture', status = 410): Response {
  const detail = {
    message: 'This file is stored offsite and has been freed from the card to make room. An admin can restore the volume to bring it back.',
    stored_offsite: true,
    image_id: 9,
    kind,
    key: 'rionegro/co-x/captures/f1.CR2',
    freed_at: '2026-10-20T14:03:00+00:00',
  };
  return new Response(JSON.stringify({ detail }), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('freedFromBody', () => {
  it('reads the kind and the time of a 410 that says the file is stored offsite', () => {
    expect(freedFromBody(410, { detail: { stored_offsite: true, kind: 'preview', freed_at: '2026-10-20T14:03:00+00:00' } }))
      .toEqual({ kind: 'preview', freedAt: '2026-10-20T14:03:00+00:00' });
  });

  it('is null for a 410 without stored_offsite, for any other status, and for a body that is not the detail', () => {
    expect(freedFromBody(410, { detail: 'Gone' })).toBeNull();
    expect(freedFromBody(410, { detail: { stored_offsite: false, kind: 'capture' } })).toBeNull();
    expect(freedFromBody(404, { detail: { stored_offsite: true, kind: 'capture' } })).toBeNull();
    expect(freedFromBody(410, null)).toBeNull();
    expect(freedFromBody(410, 'x')).toBeNull();
  });

  it('accepts a missing time and an unknown kind as a master', () => {
    expect(freedFromBody(410, { detail: { stored_offsite: true } })).toEqual({ kind: 'capture', freedAt: null });
  });
});

describe('probeFreed', () => {
  it('reads the 410 body of a freed file', async () => {
    const f = vi.fn().mockResolvedValue(freed('preview'));
    expect(await probeFreed('/preview', f as unknown as typeof fetch)).toEqual({
      kind: 'preview',
      freedAt: '2026-10-20T14:03:00+00:00',
    });
  });

  it('is null for any other answer, and aborts the request once the headers of a 200 arrive', async () => {
    let signal: AbortSignal | undefined;
    const ok = vi.fn().mockImplementation((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(response(200));
    });
    expect(await probeFreed('/preview', ok as unknown as typeof fetch)).toBeNull();
    expect(signal?.aborted).toBe(true);
    for (const status of [404, 500]) {
      const f = vi.fn().mockResolvedValue(response(status));
      expect(await probeFreed('/preview', f as unknown as typeof fetch)).toBeNull();
    }
    const fNet = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await probeFreed('/preview', fNet as unknown as typeof fetch)).toBeNull();
    const notJson = vi.fn().mockResolvedValue(response(410));
    expect(await probeFreed('/preview', notJson as unknown as typeof fetch)).toBeNull();
  });

  it("does not fetch when the caller's signal is already aborted", async () => {
    const f = vi.fn();
    const caller = new AbortController();
    caller.abort();
    expect(await probeFreed('/preview', f as unknown as typeof fetch, caller.signal)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('checkMasterStored, for a freed master', () => {
  it('is freed on the 410 of a master stored offsite, never missing', async () => {
    const f = vi.fn().mockResolvedValue(freed('capture'));
    expect(await checkMasterStored('/file', f as unknown as typeof fetch)).toBe('freed');
  });

  it('is unknown on a 410 that does not say so', async () => {
    const f = vi.fn().mockResolvedValue(response(410));
    expect(await checkMasterStored('/file', f as unknown as typeof fetch)).toBe('unknown');
  });
});

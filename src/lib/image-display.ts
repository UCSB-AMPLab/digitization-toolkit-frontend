// ============================================================================
// What to display for a record image (NEH-139)
//
// Chromium cannot decode RAW masters (Canon CR2 and the like). Put a RAW file
// URL in an <img> and the operator sees a broken image, reads it as a failed
// capture, and retakes — and a retake supersedes the master.
//
// What the backend offers (backend app/api/records.py):
//   - GET /records/images/{id}/file: the stored master, unchanged, as a
//     download. For a RAW master these are RAW bytes. Never for an <img>.
//   - GET /records/images/{id}/preview: something a browser can display — a
//     JPEG/PNG/WebP master itself, or a RAW master's `_preview.jpg` sidecar.
//     404 when there is none (RAW without a sidecar, TIFF); never RAW bytes.
//   - GET /records/images/{id}/thumbnail: a JPEG thumbnail (600 px max),
//     the fallback for whatever /preview does not send, such as a TIFF.
// The image object carries `format` (the lower-cased file suffix, e.g. "cr2")
// and `filename`.
//
// A file freed from the card (NEH-248) is answered 410 by all three, with a
// body that says it is stored offsite (_freed in records.py). An <img> that
// fails says nothing about why, so the viewer asks again with fetch
// (probeFreed) and shows a freed file as stored offsite, never as missing.
// ============================================================================
//
// Version: 0.1.0-beta

import type { RecordImage } from '$lib/api';

/** RAW suffixes, the same list as the backend's `_RAW_SUFFIXES`. */
export const RAW_FORMATS: ReadonlySet<string> = new Set(['cr2', 'nef', 'arw', 'raf', 'dng', 'raw']);

/** Masters /preview sends as they are, the same list as the backend's
 *  `_BROWSER_DISPLAYABLE_SUFFIXES`. Anything else that is not RAW (TIFF, for
 *  one) gets a 404 from /preview. */
export const BROWSER_DISPLAYABLE_FORMATS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp']);

type ImageLike = Pick<RecordImage, 'format' | 'filename'>;

/** The image's format: the backend's `format` field (the stored file's
 *  lower-cased suffix), or the filename's extension when it is empty. */
export function formatOf(img: ImageLike): string {
  const fmt = (img.format ?? '').toLowerCase().replace(/^\./, '');
  if (fmt) return fmt;
  return img.filename?.includes('.') ? img.filename.split('.').pop()!.toLowerCase() : '';
}

export function isRawImage(img: ImageLike): boolean {
  return RAW_FORMATS.has(formatOf(img));
}

export function isBrowserDisplayable(img: ImageLike): boolean {
  return BROWSER_DISPLAYABLE_FORMATS.has(formatOf(img));
}

/**
 * One way of showing an image, in the order the viewer tries them; the next
 * one is used when the <img> fails to load the current one, and after the
 * last comes the explicit nothing-to-show state.
 *  - `original`:  /preview of a JPEG/PNG/WebP image, which is the master itself.
 *  - `preview`:   /preview of a RAW image: its JPEG sidecar.
 *  - `thumbnail`: /thumbnail, for any image.
 * The /file URL is never a candidate.
 */
export type DisplayCandidate =
  | { kind: 'original'; url: string }
  | { kind: 'preview'; url: string }
  | { kind: 'thumbnail'; url: string };

export interface ImageUrlSource {
  getImagePreviewUrl(imageId: number): string;
  getImageThumbnailUrl(imageId: number): string;
}

export function displayCandidates(img: Pick<RecordImage, 'id' | 'format' | 'filename'>, api: ImageUrlSource): DisplayCandidate[] {
  const thumbnail: DisplayCandidate = { kind: 'thumbnail', url: api.getImageThumbnailUrl(img.id) };
  if (isRawImage(img)) {
    return [{ kind: 'preview', url: api.getImagePreviewUrl(img.id) }, thumbnail];
  }
  if (isBrowserDisplayable(img)) {
    return [{ kind: 'original', url: api.getImagePreviewUrl(img.id) }, thumbnail];
  }
  return [thumbnail];
}

/** A file freed from the card: the master ("capture") or a RAW master's preview, and when. */
export interface FreedFile {
  kind: 'capture' | 'preview';
  freedAt: string | null;
}

/**
 * The freed file a response describes, or null: a 410 whose JSON body's
 * `detail` has `stored_offsite: true` (freed_detail in
 * app/core/offsite_free.py). Any other answer is not read as freed.
 */
export function freedFromBody(status: number, body: unknown): FreedFile | null {
  if (status !== 410 || typeof body !== 'object' || body === null) return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== 'object' || detail === null) return null;
  const d = detail as { stored_offsite?: unknown; kind?: unknown; freed_at?: unknown };
  if (d.stored_offsite !== true) return null;
  return { kind: d.kind === 'preview' ? 'preview' : 'capture', freedAt: typeof d.freed_at === 'string' ? d.freed_at : null };
}

/**
 * The freed master the record says it has, for a format shown only by its
 * thumbnail (TIFF and the like): no /preview is asked of such a format, so no
 * 410 can say so. Null for any other format, where the 410 of /preview
 * decides, and when the master is not freed.
 */
export function freedFromMetadata(
  img: Pick<RecordImage, 'format' | 'filename' | 'master_freed_at' | 'preview_freed_at'>,
): FreedFile | null {
  if (isRawImage(img) || isBrowserDisplayable(img)) return null;
  return img.master_freed_at ? { kind: 'capture', freedAt: img.master_freed_at } : null;
}

/**
 * Whether the record says /preview now answers 410: a JPEG, PNG or WebP
 * whose master is freed (it is its own preview), or a RAW whose preview is.
 * A RAW whose master alone is freed is still shown by its preview. The 410
 * stays the rule; this only says when to ask /preview again, as after an
 * in-place reload, when the <img> already holds the preview it loaded.
 */
export function previewFreedByMetadata(
  img: Pick<RecordImage, 'format' | 'filename' | 'master_freed_at' | 'preview_freed_at'>,
): boolean {
  if (isRawImage(img)) return !!img.preview_freed_at;
  if (isBrowserDisplayable(img)) return !!img.master_freed_at;
  return false;
}

/**
 * Ask `url` again and return the freed file its 410 describes, or null for
 * any other answer, a network error, or an already aborted `signal`. Only a
 * 410's small JSON body is read; any other request is aborted as soon as the
 * headers arrive.
 */
export async function probeFreed(url: string, fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<FreedFile | null> {
  const controller = new AbortController();
  if (signal?.aborted) return null;
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (res.status !== 410) {
      controller.abort();
      return null;
    }
    const body = await res.json().catch(() => null);
    controller.abort();
    return freedFromBody(res.status, body);
  } catch {
    return null;
  }
}

/**
 * Whether the stored master is on disk, asked of GET /file: the backend
 * answers 200 only after finding the image row, its file path inside the
 * storage roots, and the file itself; 404 when any of those is missing; 410
 * when the master was freed from the card and is stored offsite (`freed`).
 * The request is aborted as soon as the headers arrive, so the master is not
 * downloaded. Anything else (auth, network, server error) is `unknown`.
 */
export type MasterCheck = 'stored' | 'missing' | 'freed' | 'unknown';

export async function checkMasterStored(
  fileUrl: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<MasterCheck> {
  const controller = new AbortController();
  // The caller's signal (e.g. the component unmounting) cancels the request too.
  if (signal?.aborted) return 'unknown';
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetchFn(fileUrl, { signal: controller.signal });
    if (res.status === 410) {
      const body = await res.json().catch(() => null);
      controller.abort();
      return freedFromBody(410, body) ? 'freed' : 'unknown';
    }
    controller.abort();
    if (res.status === 200) return 'stored';
    if (res.status === 404) return 'missing';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

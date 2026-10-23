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
// ============================================================================

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

/**
 * Whether the stored master is on disk, asked of GET /file: the backend
 * answers 200 only after finding the image row, its file path inside the
 * storage roots, and the file itself; 404 when any of those is missing.
 * The request is aborted as soon as the headers arrive, so the master is not
 * downloaded. Anything else (auth, network, server error) is `unknown`.
 */
export type MasterCheck = 'stored' | 'missing' | 'unknown';

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
    controller.abort();
    if (res.status === 200) return 'stored';
    if (res.status === 404) return 'missing';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

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
//   - GET /records/images/{id}/thumbnail: a JPEG thumbnail (600 px max).
// The image object carries `format` (the lower-cased file suffix, e.g. "cr2")
// and `filename`.
// ============================================================================

import type { RecordImage } from '$lib/api';

/** RAW suffixes, the same list as the backend's `_RAW_SUFFIXES`. */
export const RAW_FORMATS: ReadonlySet<string> = new Set(['cr2', 'nef', 'arw', 'raf', 'dng', 'raw']);

type ImageLike = Pick<RecordImage, 'format' | 'filename'>;

export function isRawImage(img: ImageLike): boolean {
  const fmt = (img.format ?? '').toLowerCase().replace(/^\./, '');
  if (fmt) return RAW_FORMATS.has(fmt);
  const ext = img.filename?.includes('.') ? img.filename.split('.').pop()!.toLowerCase() : '';
  return RAW_FORMATS.has(ext);
}

/**
 * One way of showing an image, in the order the viewer tries them; the next
 * one is used when the <img> fails to load the current one.
 *  - `original`:  /preview of a non-RAW image, which is the master itself.
 *  - `preview`:   /preview of a RAW image: its JPEG sidecar.
 *  - `thumbnail`: /thumbnail of a RAW image.
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
  if (!isRawImage(img)) {
    return [{ kind: 'original', url: api.getImagePreviewUrl(img.id) }];
  }
  return [
    { kind: 'preview', url: api.getImagePreviewUrl(img.id) },
    { kind: 'thumbnail', url: api.getImageThumbnailUrl(img.id) },
  ];
}

/**
 * Whether the stored master is on disk, asked of GET /file: the backend
 * answers 200 only after finding the image row, its file path inside the
 * storage roots, and the file itself; 404 when any of those is missing.
 * The request is aborted as soon as the headers arrive, so the master is not
 * downloaded. Anything else (auth, network, server error) is `unknown`.
 */
export type MasterCheck = 'stored' | 'missing' | 'unknown';

export async function checkMasterStored(fileUrl: string, fetchFn: typeof fetch = fetch): Promise<MasterCheck> {
  const controller = new AbortController();
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

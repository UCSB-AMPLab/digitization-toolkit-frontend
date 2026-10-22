// ============================================================================
// What to display for a record image (NEH-139)
//
// Chromium cannot decode RAW masters (Canon CR2 and the like). Put a RAW file
// URL in an <img> and the operator sees a broken image, reads it as a failed
// capture, and retakes — and a retake supersedes the master.
//
// What the backend offers for a RAW master (backend app/api/records.py):
//   - GET /records/images/{id}/file serves the `<stem>_preview.jpg` sidecar
//     instead of the master when the sidecar exists (suffixes .cr2, .nef,
//     .arw, .raf, .dng). When it does not exist, the same URL streams the RAW
//     bytes as application/octet-stream.
//   - GET /records/images/{id}/thumbnail serves a JPEG thumbnail (600 px max).
//     At capture time it is built from the sidecar; when regenerated on
//     demand it is built from the master itself, which may fail for RAW.
// The image object carries `format` (the lower-cased file suffix, e.g. "cr2")
// and `filename`, but nothing that says whether a sidecar exists. So the only
// way to know what /file will return for a RAW image is to ask it: the
// viewer fetches it and checks the Content-Type before showing anything.
// ============================================================================

import type { RecordImage } from '$lib/api';

/** RAW suffixes: the ones /file substitutes a preview for, plus `.raw`, which
 *  the backend's integrity scan also treats as an image master. */
export const RAW_FORMATS: ReadonlySet<string> = new Set(['cr2', 'nef', 'arw', 'raf', 'dng', 'raw']);

type ImageLike = Pick<RecordImage, 'format' | 'filename'>;

export function isRawImage(img: ImageLike): boolean {
  const fmt = (img.format ?? '').toLowerCase().replace(/^\./, '');
  if (fmt) return RAW_FORMATS.has(fmt);
  const ext = img.filename?.includes('.') ? img.filename.split('.').pop()!.toLowerCase() : '';
  return RAW_FORMATS.has(ext);
}

/**
 * One way of showing an image, in the order the viewer tries them.
 *  - `original`: the file itself, straight into <img> (non-RAW images).
 *  - `preview`:  the /file URL of a RAW image; it may only go into <img> after
 *                a fetch has confirmed that the response is an image (the
 *                JPEG sidecar), never on the strength of the URL alone.
 *  - `thumbnail`: the /thumbnail JPEG of a RAW image.
 */
export type DisplayCandidate =
  | { kind: 'original'; url: string }
  | { kind: 'preview'; url: string; probe: true }
  | { kind: 'thumbnail'; url: string };

export interface ImageUrlSource {
  getImageFileUrl(imageId: number): string;
  getImageThumbnailUrl(imageId: number): string;
}

export function displayCandidates(img: Pick<RecordImage, 'id' | 'format' | 'filename'>, api: ImageUrlSource): DisplayCandidate[] {
  if (!isRawImage(img)) {
    return [{ kind: 'original', url: api.getImageFileUrl(img.id) }];
  }
  return [
    { kind: 'preview', url: api.getImageFileUrl(img.id), probe: true },
    { kind: 'thumbnail', url: api.getImageThumbnailUrl(img.id) },
  ];
}

/** Outcome of fetching a RAW image's /file URL. */
export type ProbeResult =
  | { status: 'image'; blob: Blob }   // the backend sent the JPEG sidecar
  | { status: 'not-image' }           // 200, but RAW bytes: no sidecar on disk
  | { status: 'missing' }             // 404: no file on disk for this image
  | { status: 'error' };              // network failure or another HTTP error

/**
 * Fetch `url` and keep the body only if it is an image. A response that is
 * not an image is aborted as soon as its headers arrive, so the viewer never
 * downloads a whole RAW master it cannot show.
 */
export async function probeImage(url: string, fetchFn: typeof fetch = fetch): Promise<ProbeResult> {
  const controller = new AbortController();
  let res: Response;
  try {
    res = await fetchFn(url, { signal: controller.signal });
  } catch {
    return { status: 'error' };
  }
  if (res.status === 404) {
    controller.abort();
    return { status: 'missing' };
  }
  if (!res.ok) {
    controller.abort();
    return { status: 'error' };
  }
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('image/')) {
    controller.abort();
    return { status: 'not-image' };
  }
  try {
    return { status: 'image', blob: await res.blob() };
  } catch {
    return { status: 'error' };
  }
}

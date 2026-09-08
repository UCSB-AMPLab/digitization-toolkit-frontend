// NEH-230 — shared pan/zoom geometry for the spread viewer and the
// inspection modal.
//
// Zoom 1 is "fit" (the image contained inside its frame at the current
// rotation). Each page/frame derives its OWN CSS scale and its OWN pixel
// pan from one shared zoom number and one shared pan fraction — that is
// what keeps the two views (and, in the spread, the two pages) from
// drifting apart: they all read the same two numbers and apply the same
// pure functions below to their own measured geometry.

export type Size = { w: number; h: number };
export type Pan = { x: number; y: number };

export const ZOOM_MIN = 0.5;
export const ZOOM_STEP = 1.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// True for 90 and 270 (after normalising a negative or >=360 input) — the
// angles where the CSS rotate() swaps the element's visual width/height.
export function isSwapped(rotation: number): boolean {
  const normalised = ((rotation % 360) + 360) % 360;
  return normalised === 90 || normalised === 270;
}

// The rendered image size, in the IMAGE's own (unrotated) axes, when
// contained in the box the component gives it. The box is `container`
// unrotated, or {w: container.h, h: container.w} when swapped — this
// matches spreadImageStyle, which sets the rotated element's width/height
// to the swapped container dimensions with object-fit: contain doing the
// rest.
//
// The unrotated branch never upscales past `natural`: the plain <img> only
// carries max-width/max-height (no explicit width/height), so the browser
// never enlarges a small image past its intrinsic size. The rotated
// (swapped) branch instead gives the element explicit width/height, so a
// natural image smaller than the swapped box WOULD be upscaled there — a
// pre-existing quirk of spreadImageStyle that this function reproduces on
// purpose. It never triggers for camera files, which are always far
// larger than the viewer frame.
export function fittedSize(natural: Size, container: Size, rotation: number): Size {
  if (!natural.w || !natural.h || !container.w || !container.h) {
    return { w: 0, h: 0 };
  }
  const swapped = isSwapped(rotation);
  const box = swapped ? { w: container.h, h: container.w } : container;
  const containScale = Math.min(box.w / natural.w, box.h / natural.h);
  const scale = swapped ? containScale : Math.min(containScale, 1);
  return { w: natural.w * scale, h: natural.h * scale };
}

// The on-screen bounding box after scale and rotate: fitted*zoom, with
// width/height swapped when the rotation swaps them visually.
export function screenExtent(fitted: Size, rotation: number, zoom: number): Size {
  const scaled: Size = { w: fitted.w * zoom, h: fitted.h * zoom };
  return isSwapped(rotation) ? { w: scaled.h, h: scaled.w } : scaled;
}

// The zoom (relative to fit) at which one image pixel maps to one device
// pixel. Returns 1 when nothing is measured yet (fitted width 0).
export function oneToOneZoom(natural: Size, container: Size, rotation: number, dpr = 1): number {
  const fitted = fittedSize(natural, container, rotation);
  if (!fitted.w) return 1;
  return natural.w / (fitted.w * dpr);
}

export function maxZoom(oneToOne: number): number {
  return Math.max(3, 2 * oneToOne);
}

// Multiplies or divides by ZOOM_STEP, clamps to [ZOOM_MIN, maxZoom], and
// snaps to exactly 1 when the result lands within 2% of 1 — so "fit" is
// always reachable by stepping, not just by the dedicated fit button.
export function stepZoom(zoom: number, direction: 1 | -1, oneToOne: number): number {
  const next = direction === 1 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP;
  const clamped = clamp(next, ZOOM_MIN, maxZoom(oneToOne));
  return Math.abs(clamped - 1) <= 0.02 ? 1 : clamped;
}

// Clamps a page's own 1:1 zoom to at least 1 (R35-1, ruled in round 36):
// "1:1" means one image pixel per device pixel AND never below fit. A page
// with fewer pixels than its frame at device resolution stays at fit when
// 1:1 is pressed, so for that page the button shows more than one device
// pixel per image pixel. This is a stated limitation, not an oversight: no
// camera file is that small (the DSLR files, and the CR2 preview sidecar
// the review views load for them, are 6000 px wide; the Pi camera modules
// are thousands of pixels wide too), so it can only be reached with a small
// image on a high-DPR laptop, where showing the page smaller than its frame
// would help nobody. A page whose natural size is already smaller than its
// frame (or a very high-DPR device) can have a raw oneToOne below 1;
// without this clamp that page would shrink past fit as soon as the
// SHARED zoom moved past 1, and with an unclamped reference of 1 the "1:1"
// button would be indistinguishable from "fit". Callers apply this to
// every page's own oneToOne AND to the value used as the reference before
// calling pageScale — pageScale itself assumes both inputs are already
// effective (>= 1).
export function effectiveOneToOne(oneToOne: number): number {
  return Math.max(1, oneToOne);
}

// The CSS scale for one page given the SHARED zoom (R34-1), assuming
// `oneToOnePage` and `oneToOneRef` are already effective (>= 1, see
// effectiveOneToOne) and `oneToOneRef` is the LARGEST effective oneToOne
// among the pages sharing this zoom — so oneToOneRef >= oneToOnePage
// always. Three segments, continuous at both joins:
//
//   zoom <= 1            -> zoom             (both pages shrink together, below fit)
//   1 < zoom <= ref       -> zoom ** (log(page) / log(ref))   (fit -> 1:1, curved so the
//                                                               smaller/equal page reaches
//                                                               its OWN 1:1 exactly when the
//                                                               shared zoom reaches ref)
//   zoom > ref            -> page * (zoom / ref)              (beyond the largest page's
//                                                               1:1, every page magnifies by
//                                                               the same extra factor)
//
// The reference is the max (not the left page, and not an arbitrary page)
// because pageScale(zoom, page, ref) only makes sense for page <= ref: the
// middle segment's exponent log(page)/log(ref) must stay in [0, 1] for the
// curve to be monotonic between fit and ref's own 1:1. If ref were smaller
// than some page, that page would already be past ITS 1:1 while zoom is
// still short of ref's — the shared "1:1" zoom must be the largest one so
// every page has reached (or is still approaching) its own 1:1 by the time
// zoom gets there. When ref === 1 (every page's own oneToOne is <= 1, all
// clamped to 1), the middle segment degenerates to always 1, and beyond
// zoom > 1 the last segment is just page * zoom / 1 = zoom (since page is
// also 1) — i.e. the shared zoom applies directly, as before this fix.
//
// Two pages of a spread can be different shapes — one camera rotated 90°,
// the other not — so they fit their frames at different scales; one shared
// multiplier therefore cannot land both pages on their own 1:1 at the same
// zoom value, which is why each page re-derives its scale from the shared
// zoom instead of applying it directly.
export function pageScale(zoom: number, oneToOnePage: number, oneToOneRef: number): number {
  if (zoom <= 1) {
    return zoom;
  }
  if (zoom <= oneToOneRef && oneToOneRef > 1) {
    return zoom ** (Math.log(oneToOnePage) / Math.log(oneToOneRef));
  }
  return oneToOnePage * (zoom / oneToOneRef);
}

export function panBounds(extent: Size, container: Size): Size {
  return {
    w: Math.max(0, (extent.w - container.w) / 2),
    h: Math.max(0, (extent.h - container.h) / 2),
  };
}

// Pan stored NORMALISED (R34-2): each axis is a fraction in [-1, 1] of the
// page's OWN bounds, so the two pages of a spread move together
// proportionally and every edge of both stays reachable even when their
// bounds differ.
export type PanFraction = { x: number; y: number };

export function panPixels(fraction: PanFraction, bounds: Size): Pan {
  return { x: fraction.x * bounds.w, y: fraction.y * bounds.h };
}

export function dragToFraction(fraction: PanFraction, deltaPx: Pan, bounds: Size): PanFraction {
  const x = bounds.w > 0 ? clamp(fraction.x + deltaPx.x / bounds.w, -1, 1) : fraction.x;
  const y = bounds.h > 0 ? clamp(fraction.y + deltaPx.y / bounds.h, -1, 1) : fraction.y;
  return { x, y };
}

// The translate goes FIRST so it pans in screen axes at every rotation —
// CSS applies the functions right to left to the element, so scale/rotate
// happen to the coordinate space and only afterwards is the (unrotated,
// unscaled) translate applied on top.
export function transformFor(pan: Pan, scale: number, rotation: number): string {
  return `translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`;
}

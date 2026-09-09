// NEH-222: the live viewport takes its shape from the frames themselves
// instead of a hardcoded 4:3 box. A frame's displayed aspect depends on its
// own rotation, and in double mode the two panels sit side by side at a
// common height, so their aspects add rather than average.

export type Frame = { w: number; h: number; rotation: number };

// Folds any rotation (negative, or >= 360) down to [0, 360).
function normalizeRotation(rotation: number): number {
  const n = rotation % 360;
  return n < 0 ? n + 360 : n;
}

/**
 * The aspect ratio (width / height) a single frame is displayed at, taking
 * its rotation into account: a 90° or 270° rotation swaps the frame's own
 * width and height on screen, so the aspect is inverted. Returns null for a
 * missing frame or one with a zero-length side — both are "no usable frame"
 * to the caller, not a 0 or Infinity aspect.
 */
export function frameAspect(frame: Frame | null): number | null {
  if (!frame || !frame.w || !frame.h) return null;
  const aspect = frame.w / frame.h;
  const rotation = normalizeRotation(frame.rotation);
  return rotation === 90 || rotation === 270 ? 1 / aspect : aspect;
}

/**
 * The aspect ratio the viewport box should have so the feed(s) fill it
 * without cropping. In single mode this is just the one frame's displayed
 * aspect. In double mode the two panels sit side by side at a common
 * height, each as wide as its own aspect — so the viewport's aspect is the
 * SUM of the two panels' aspects, not their average. Frames that are null
 * or have a zero side are ignored; one usable frame in double mode counts
 * twice (both panels the same shape); with no usable frame at all, the
 * fallback (default 4:3) is returned.
 */
export function viewportAspect(
  frames: Array<Frame | null>,
  mode: 'single' | 'double',
  fallback = 4 / 3
): number {
  const usable = frames
    .map(frameAspect)
    .filter((aspect): aspect is number => aspect !== null);

  if (usable.length === 0) return fallback;

  if (mode === 'single') return usable[0];

  if (usable.length === 1) return usable[0] * 2;
  return usable.reduce((sum, aspect) => sum + aspect, 0);
}

/**
 * The flex-grow factor for one displayed panel in double mode (R39-2). When
 * this panel's own frame aspect isn't known yet, it borrows the OTHER
 * panel's aspect instead of an even flex:1 — so a panel still waiting on
 * its first frame (or showing "no signal") takes the same width as its
 * live neighbor rather than shrinking to a plain 1:1 split. Only when
 * neither panel's aspect is known yet does it fall back to 1 (equal split).
 */
export function panelGrowFactor(own: number | null, other: number | null, fallback = 1): number {
  return own ?? other ?? fallback;
}

/**
 * The largest box of the given aspect ratio that fits inside a board of
 * boardW x boardH. Used because a definite `width: 100%` defeats CSS
 * `aspect-ratio` when height is the limiting dimension (R39-3), so the
 * viewport gets explicit pixel dimensions instead of relying on CSS to
 * derive them. Returns a zero box when the board hasn't been measured yet
 * (width or height is 0).
 */
export function fitBox(aspect: number, boardW: number, boardH: number): { w: number; h: number } {
  if (!boardW || !boardH) return { w: 0, h: 0 };
  const w = Math.min(boardW, boardH * aspect);
  const h = w / aspect;
  return { w, h };
}

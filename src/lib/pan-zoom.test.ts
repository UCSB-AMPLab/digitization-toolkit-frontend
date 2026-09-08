// NEH-230 — shared pan/zoom geometry: fit sizing, zoom stepping, per-page
// scale (R34-1), and normalised pan (R34-2).
import { describe, it, expect } from 'vitest';
import {
  ZOOM_MIN,
  ZOOM_STEP,
  isSwapped,
  fittedSize,
  screenExtent,
  oneToOneZoom,
  effectiveOneToOne,
  maxZoom,
  stepZoom,
  pageScale,
  panBounds,
  panPixels,
  dragToFraction,
  transformFor,
  type PanFraction,
} from './pan-zoom';

describe('isSwapped', () => {
  it('is true for 90 and 270', () => {
    expect(isSwapped(90)).toBe(true);
    expect(isSwapped(270)).toBe(true);
  });
  it('is false for 0 and 180', () => {
    expect(isSwapped(0)).toBe(false);
    expect(isSwapped(180)).toBe(false);
  });
  it('normalises negative and >=360 angles first', () => {
    expect(isSwapped(-270)).toBe(true); // -270 -> 90
    expect(isSwapped(450)).toBe(true); // 450 -> 90
    expect(isSwapped(-90)).toBe(true); // -90 -> 270
    expect(isSwapped(720)).toBe(false); // 720 -> 0
  });
});

describe('fittedSize', () => {
  const landscape = { w: 6000, h: 4000 };

  it('contains a landscape image in a landscape frame, unrotated', () => {
    expect(fittedSize(landscape, { w: 900, h: 600 }, 0)).toEqual({ w: 900, h: 600 });
  });

  it('contains a landscape image in a portrait frame, unrotated', () => {
    expect(fittedSize(landscape, { w: 600, h: 900 }, 0)).toEqual({ w: 600, h: 400 });
  });

  it('swapped at 90 matches the unrotated fit in the container with axes swapped', () => {
    expect(fittedSize(landscape, { w: 900, h: 600 }, 90)).toEqual(
      fittedSize(landscape, { w: 600, h: 900 }, 0)
    );
  });

  it('swapped at 270 matches the unrotated fit in the container with axes swapped', () => {
    expect(fittedSize(landscape, { w: 900, h: 600 }, 270)).toEqual(
      fittedSize(landscape, { w: 600, h: 900 }, 0)
    );
  });

  it('never upscales a small image past its natural size, unrotated', () => {
    expect(fittedSize({ w: 200, h: 100 }, { w: 900, h: 600 }, 0)).toEqual({ w: 200, h: 100 });
  });

  it('returns {0,0} when any input dimension is 0', () => {
    expect(fittedSize({ w: 0, h: 4000 }, { w: 900, h: 600 }, 0)).toEqual({ w: 0, h: 0 });
    expect(fittedSize(landscape, { w: 0, h: 600 }, 0)).toEqual({ w: 0, h: 0 });
  });
});

describe('screenExtent', () => {
  it('scales without swapping when unrotated', () => {
    expect(screenExtent({ w: 900, h: 600 }, 0, 2)).toEqual({ w: 1800, h: 1200 });
  });

  it('scales and swaps width/height when rotated 90', () => {
    expect(screenExtent({ w: 900, h: 600 }, 90, 2)).toEqual({ w: 1200, h: 1800 });
  });

  it('scales and swaps width/height when rotated 270', () => {
    expect(screenExtent({ w: 900, h: 600 }, 270, 1)).toEqual({ w: 600, h: 900 });
  });
});

describe('oneToOneZoom', () => {
  const landscape = { w: 6000, h: 4000 };

  it('is natural width / fitted width at dpr 1', () => {
    expect(oneToOneZoom(landscape, { w: 900, h: 600 }, 0)).toBeCloseTo(6000 / 900, 10);
  });

  it('is halved at dpr 2', () => {
    expect(oneToOneZoom(landscape, { w: 900, h: 600 }, 0, 2)).toBeCloseTo(6000 / 900 / 2, 10);
  });

  it('returns 1 when any input is 0 (fitted width is 0)', () => {
    expect(oneToOneZoom({ w: 0, h: 0 }, { w: 900, h: 600 }, 0)).toBe(1);
    expect(oneToOneZoom(landscape, { w: 0, h: 0 }, 0)).toBe(1);
  });
});

describe('maxZoom', () => {
  it('is twice the 1:1 zoom, and never below twice fit for a 1:1 at or under 1', () => {
    expect(maxZoom(1)).toBe(2);
    expect(maxZoom(0.5)).toBe(2);
    expect(maxZoom(1.4)).toBeCloseTo(2.8, 10);
    expect(maxZoom(6.6667)).toBeCloseTo(13.3334, 4);
  });
});

describe('stepZoom', () => {
  it('steps up by ZOOM_STEP', () => {
    expect(stepZoom(1, 1, 1)).toBeCloseTo(ZOOM_STEP, 10);
  });

  it('steps down by ZOOM_STEP', () => {
    expect(stepZoom(1, -1, 1)).toBeCloseTo(1 / ZOOM_STEP, 10);
  });

  it('reaches exactly 1 stepping down from the ceiling of a page whose 1:1 is 1 (R37-1)', () => {
    // 2 -> 1.6 -> 1.28 -> 1.024 -> would be 0.8192: the closest value misses
    // the 2% band, so the step that crosses fit must snap to it.
    let z = maxZoom(1);
    const seen: number[] = [];
    for (let i = 0; i < 6 && z > ZOOM_MIN; i++) { z = stepZoom(z, -1, 1); seen.push(z); }
    expect(seen).toContain(1);
  });

  it('reaches exactly 1 stepping up from below fit (R37-1)', () => {
    // 0.78125 -> 0.9765625 -> would be 1.220703125: crosses fit, snaps to 1.
    expect(stepZoom(0.9765625, 1, 10)).toBe(1);
    expect(stepZoom(1.024, -1, 1)).toBe(1);
  });

  it('clamps at ZOOM_MIN stepping down from the floor', () => {
    expect(stepZoom(ZOOM_MIN, -1, 1)).toBe(ZOOM_MIN);
  });

  it('clamps at maxZoom stepping up past the ceiling', () => {
    const oneToOne = 1;
    expect(stepZoom(maxZoom(oneToOne), 1, oneToOne)).toBe(maxZoom(oneToOne));
  });

  it('snaps to exactly 1 when the stepped result lands exactly on 1', () => {
    expect(stepZoom(0.8, 1, 1)).toBe(1); // 0.8 * 1.25 = 1.0 exactly
  });

  it('snaps a genuine near-miss (within 2% of 1, not exactly 1) to exactly 1', () => {
    // 0.81 * 1.25 = 1.0125 — within 2% of 1, but not exactly 1.
    expect(stepZoom(0.81, 1, 10)).toBe(1);
  });

  it('does not snap a result outside the 2% band', () => {
    // 0.7 * 1.25 = 0.875 — well outside 2% of 1.
    expect(stepZoom(0.7, 1, 10)).toBeCloseTo(0.875, 10);
  });
});

describe('effectiveOneToOne', () => {
  it('clamps to at least 1 — 1:1 never shrinks a page below fit', () => {
    expect(effectiveOneToOne(0.5)).toBe(1);
    expect(effectiveOneToOne(1)).toBe(1);
  });

  it('leaves a real 1:1 above 1 untouched', () => {
    expect(effectiveOneToOne(5)).toBe(5);
  });
});

describe('pageScale (R34-1, R35-1: 1:1 never shrinks a page below fit)', () => {
  // pageScale expects both arguments already clamped through
  // effectiveOneToOne (>= 1) and `oneToOneRef` to be the MAX effective
  // oneToOne among the pages being shown — callers, not pageScale, do the
  // clamping and the max-selection (see the module doc on pageScale).

  // Two 500x600 frames: a 6000x4000 image needs oneToOne 12 to fill its
  // frame at 1:1, a 4000x6000 image needs oneToOne 10. ref = max(12,10) = 12.
  const oneToOneRef = 12;
  const oneToOnePage = 10;

  it('is zoom itself at zoom <= 1 (fit or below) for both pages regardless of their own oneToOne', () => {
    expect(pageScale(1, oneToOnePage, oneToOneRef)).toBe(1);
    expect(pageScale(1, oneToOneRef, oneToOneRef)).toBe(1);
    expect(pageScale(0.5, oneToOnePage, oneToOneRef)).toBe(0.5);
  });

  it('continuity at zoom === ref for the round-34 pair (12 and 10)', () => {
    expect(pageScale(oneToOneRef, oneToOnePage, oneToOneRef)).toBeCloseTo(oneToOnePage, 9);
    expect(pageScale(oneToOneRef * 1.25, oneToOnePage, oneToOneRef)).toBeCloseTo(12.5, 9);
  });

  it('two pages of equal size get exactly zoom at any zoom level', () => {
    expect(pageScale(5, 12, 12)).toBe(5);
  });

  it("the review's pair: reference 5, a page whose effective oneToOne is 1 stays at fit through the reference's 1:1, then magnifies beyond it in step with the reference", () => {
    expect(pageScale(5, 1, 5)).toBeCloseTo(1, 9); // stays at fit when 1:1 (zoom=ref) is pressed
    expect(pageScale(10, 1, 5)).toBeCloseTo(2, 9); // beyond ref, magnifies by zoom/ref same as the reference
  });

  it('ref === 1 (every page is effectively 1) collapses to the shared zoom directly beyond fit', () => {
    expect(pageScale(5, 1, 1)).toBe(5);
  });

  it('cannot see ref=1 with a non-trivial page any more (the caller always makes ref the max) — the equal-pages case at 10', () => {
    expect(pageScale(10, 10, 10)).toBe(10);
    expect(pageScale(1, 10, 10)).toBe(1);
  });

  it('is monotonic non-decreasing across a sweep from 0.5 to 24, for the 12/10 pair and the 5/1 pair', () => {
    function assertMonotonic(page: number, ref: number) {
      let prev = -Infinity;
      for (let zoom = 0.5; zoom <= 24; zoom += 0.25) {
        const value = pageScale(zoom, page, ref);
        expect(value).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = value;
      }
    }
    assertMonotonic(oneToOnePage, oneToOneRef); // 10, 12
    assertMonotonic(1, 5); // the review's pair, post-clamp
  });
});

describe('panBounds', () => {
  it('is 0 at fit (extent === container)', () => {
    expect(panBounds({ w: 900, h: 600 }, { w: 900, h: 600 })).toEqual({ w: 0, h: 0 });
  });

  it('is (extent-container)/2 above fit', () => {
    expect(panBounds({ w: 1300, h: 800 }, { w: 900, h: 600 })).toEqual({ w: 200, h: 100 });
  });

  it('never goes negative when extent is smaller than the container', () => {
    expect(panBounds({ w: 400, h: 300 }, { w: 900, h: 600 })).toEqual({ w: 0, h: 0 });
  });
});

describe('panPixels + dragToFraction (R34-2)', () => {
  const boundsLeft: import('./pan-zoom').Size = { w: 2750, h: 1700 };
  const boundsRight: import('./pan-zoom').Size = { w: 1750, h: 2700 };

  it('panPixels scales a fraction by each page bounds independently', () => {
    const fraction: PanFraction = { x: 1, y: 0 };
    expect(panPixels(fraction, boundsLeft)).toEqual({ x: 2750, y: 0 });
    expect(panPixels(fraction, boundsRight)).toEqual({ x: 1750, y: 0 });
  });

  it('a drag that reaches fraction x=1 on the left page puts the right page at its own x edge', () => {
    // Drag far enough right-ward that the fraction clamps to 1.
    const dragged = dragToFraction({ x: 0, y: 0 }, { x: boundsLeft.w * 2, y: 0 }, boundsLeft);
    expect(dragged.x).toBe(1);
    expect(panPixels(dragged, boundsRight)).toEqual({ x: boundsRight.w, y: 0 });
  });

  it('an axis with bounds 0 does not move', () => {
    const dragged = dragToFraction({ x: 0, y: 0.2 }, { x: 50, y: 50 }, { w: 0, h: 1000 });
    expect(dragged.x).toBe(0);
    expect(dragged.y).toBeGreaterThan(0.2);
  });

  it('clamps the fraction at +1 and -1', () => {
    expect(dragToFraction({ x: 0.9, y: -0.9 }, { x: 10000, y: -10000 }, { w: 1000, h: 1000 })).toEqual({
      x: 1,
      y: -1,
    });
  });
});

describe('transformFor', () => {
  it('puts translate first and formats rotation in deg', () => {
    expect(transformFor({ x: 12, y: -8 }, 1.5, 90)).toBe('translate(12px, -8px) scale(1.5) rotate(90deg)');
  });

  it('formats a zero pan and zero rotation', () => {
    expect(transformFor({ x: 0, y: 0 }, 1, 0)).toBe('translate(0px, 0px) scale(1) rotate(0deg)');
  });
});

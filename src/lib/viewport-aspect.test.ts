// NEH-222: the live viewport takes its shape from the frames instead of a
// hardcoded 4:3 box. `frameAspect`/`viewportAspect` compute the aspect ratio
// the on-screen box should have; `fitBox` turns that aspect into the largest
// pixel box that fits the measured board (R39-3).
import { describe, it, expect } from 'vitest';
import { fitBox, frameAspect, panelGrowFactor, viewportAspect } from './viewport-aspect';

describe('fitBox', () => {
  it('a 9:16 aspect in a 1000x600 board is width-limited (R39-3)', () => {
    expect(fitBox(9 / 16, 1000, 600)).toEqual({ w: 337.5, h: 600 });
  });

  it('a 16:9 aspect in a 1000x600 board is height-limited', () => {
    expect(fitBox(16 / 9, 1000, 600)).toEqual({ w: 1000, h: 562.5 });
  });

  it('a 4:3 aspect in an 800x600 board fills it exactly', () => {
    expect(fitBox(4 / 3, 800, 600)).toEqual({ w: 800, h: 600 });
  });

  it('an unmeasured board (0x0) returns a zero box', () => {
    expect(fitBox(4 / 3, 0, 0)).toEqual({ w: 0, h: 0 });
  });
});

describe('frameAspect', () => {
  it('a 16:9 frame at rotation 0', () => {
    expect(frameAspect({ w: 16, h: 9, rotation: 0 })).toBeCloseTo(1.7777777, 5);
  });

  it('a 16:9 frame at rotation 90 is inverted', () => {
    expect(frameAspect({ w: 16, h: 9, rotation: 90 })).toBeCloseTo(0.5625, 5);
  });

  it('a null frame has no aspect', () => {
    expect(frameAspect(null)).toBeNull();
  });

  it('a frame with a zero side has no aspect', () => {
    expect(frameAspect({ w: 0, h: 9, rotation: 0 })).toBeNull();
    expect(frameAspect({ w: 16, h: 0, rotation: 0 })).toBeNull();
  });

  it('rotation 450 counts as 90', () => {
    expect(frameAspect({ w: 16, h: 9, rotation: 450 })).toBeCloseTo(0.5625, 5);
  });

  it('rotation -90 counts as 270', () => {
    expect(frameAspect({ w: 16, h: 9, rotation: -90 })).toBeCloseTo(0.5625, 5);
  });
});

describe('viewportAspect', () => {
  it('single mode: a 16:9 frame', () => {
    expect(viewportAspect([{ w: 16, h: 9, rotation: 0 }], 'single')).toBeCloseTo(1.7777777, 5);
  });

  it('single mode: a 4:3 frame rotated 90', () => {
    expect(viewportAspect([{ w: 4, h: 3, rotation: 90 }], 'single')).toBeCloseTo(0.75, 5);
  });

  it('double mode: two 16:9 frames sum their aspects', () => {
    expect(
      viewportAspect([{ w: 16, h: 9, rotation: 0 }, { w: 16, h: 9, rotation: 0 }], 'double')
    ).toBeCloseTo(3.5555555, 5);
  });

  it('double mode: one 4:3 frame rotated 90 plus one 4:3 frame at 0', () => {
    expect(
      viewportAspect([{ w: 4, h: 3, rotation: 90 }, { w: 4, h: 3, rotation: 0 }], 'double')
    ).toBeCloseTo(0.75 + 4 / 3, 5);
  });

  it('double mode: one null frame doubles the other', () => {
    expect(
      viewportAspect([{ w: 16, h: 9, rotation: 0 }, null], 'double')
    ).toBeCloseTo(1.7777777 * 2, 5);
  });

  it('double mode: both null falls back', () => {
    expect(viewportAspect([null, null], 'double')).toBeCloseTo(4 / 3, 5);
  });

  it('single mode: no usable frame falls back', () => {
    expect(viewportAspect([null], 'single')).toBeCloseTo(4 / 3, 5);
  });

  it('a custom fallback is honored', () => {
    expect(viewportAspect([null], 'single', 16 / 9)).toBeCloseTo(16 / 9, 5);
  });

  it('a zero dimension is treated as missing', () => {
    expect(
      viewportAspect([{ w: 0, h: 9, rotation: 0 }, { w: 16, h: 9, rotation: 0 }], 'double')
    ).toBeCloseTo(1.7777777 * 2, 5);
  });

  it('rotation 450 counts as 90 in viewportAspect too', () => {
    expect(viewportAspect([{ w: 16, h: 9, rotation: 450 }], 'single')).toBeCloseTo(0.5625, 5);
  });

  it('rotation -90 counts as 270 in viewportAspect too', () => {
    expect(viewportAspect([{ w: 16, h: 9, rotation: -90 }], 'single')).toBeCloseTo(0.5625, 5);
  });
});

describe('panelGrowFactor', () => {
  it('a known aspect is used as-is, regardless of the other panel', () => {
    expect(panelGrowFactor(1.5, null)).toBe(1.5);
    expect(panelGrowFactor(1.5, 0.75)).toBe(1.5);
  });

  it('an unknown aspect borrows the other panel\'s aspect (known/unknown)', () => {
    expect(panelGrowFactor(null, 0.75)).toBe(0.75);
  });

  it('an unknown aspect borrows the other panel\'s aspect (unknown/known)', () => {
    // Same rule from the other panel's point of view.
    expect(panelGrowFactor(null, 1.7777777)).toBeCloseTo(1.7777777, 5);
  });

  it('both unknown falls back to 1 (equal panels) by default', () => {
    expect(panelGrowFactor(null, null)).toBe(1);
  });

  it('a custom fallback is honored when both are unknown', () => {
    expect(panelGrowFactor(null, null, 2)).toBe(2);
  });
});

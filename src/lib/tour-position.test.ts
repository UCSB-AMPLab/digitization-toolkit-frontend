// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { placeTourBox } from './tour-position';

// The unit's screen.
const VIEW = { width: 800, height: 480 };
const BOX = { width: 264, height: 180 };

function overlapsTarget(
	p: { left: number; top: number },
	r: { top: number; left: number; width: number; height: number }
) {
	return (
		p.left < r.left + r.width + 4 &&
		p.left + BOX.width > r.left - 4 &&
		p.top < r.top + r.height + 4 &&
		p.top + BOX.height > r.top - 4
	);
}

describe('placeTourBox', () => {
	it('centres the box at the bottom when there is no target', () => {
		const p = placeTourBox(null, 'left', BOX, VIEW);
		expect(p).toEqual({ left: (800 - 264) / 2, top: 480 - 180 - 24, side: null });
	});

	it('puts the box on the requested side when it fits', () => {
		// The approve button, in the open annotations panel on the left.
		const approve = { top: 400, left: 80, width: 120, height: 44 };
		const p = placeTourBox(approve, 'right', BOX, VIEW);
		expect(p.side).toBe('right');
		expect(p.left).toBe(80 + 120 + 12);
		expect(overlapsTarget(p, approve)).toBe(false);
	});

	it('puts the export step to the left of the right-hand toolbar', () => {
		const exportBtn = { top: 380, left: 732, width: 56, height: 56 };
		const p = placeTourBox(exportBtn, 'left', BOX, VIEW);
		expect(p.side).toBe('left');
		expect(p.left + BOX.width).toBeLessThanOrEqual(732 - 4);
		expect(p.top + BOX.height).toBeLessThanOrEqual(480 - 12);
	});

	it('falls back to the bottom when a box above would be clamped over the target', () => {
		const nearTop = { top: 20, left: 300, width: 100, height: 40 };
		const p = placeTourBox(nearTop, 'top', BOX, VIEW);
		expect(p.side).toBe('bottom');
		expect(p.top).toBe(20 + 40 + 12);
		expect(overlapsTarget(p, nearTop)).toBe(false);
	});

	it('falls back to the right when a box on the left would be clamped over the target', () => {
		const nearLeft = { top: 200, left: 10, width: 44, height: 44 };
		const p = placeTourBox(nearLeft, 'left', BOX, VIEW);
		expect(p.side).toBe('right');
		expect(overlapsTarget(p, nearLeft)).toBe(false);
	});

	it('falls back to the top when a box below would run off the bottom over the target', () => {
		const nearBottom = { top: 420, left: 300, width: 100, height: 44 };
		const p = placeTourBox(nearBottom, 'bottom', BOX, VIEW);
		expect(p.side).toBe('top');
		expect(overlapsTarget(p, nearBottom)).toBe(false);
	});

	it('keeps the requested side when neither side clears the target', () => {
		const huge = { top: 0, left: 0, width: 800, height: 480 };
		const p = placeTourBox(huge, 'left', BOX, VIEW);
		expect(p.side).toBe('left');
		expect(p.left).toBeGreaterThanOrEqual(12);
		expect(p.top).toBeGreaterThanOrEqual(12);
	});

	it('never places the box outside the viewport', () => {
		const p = placeTourBox({ top: 460, left: 790, width: 10, height: 10 }, 'right', BOX, VIEW);
		expect(p.left).toBeGreaterThanOrEqual(12);
		expect(p.left + BOX.width).toBeLessThanOrEqual(800 - 12);
		expect(p.top + BOX.height).toBeLessThanOrEqual(480 - 12);
	});
});

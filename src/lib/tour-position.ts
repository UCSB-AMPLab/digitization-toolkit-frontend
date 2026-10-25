// Where the guided tour puts its box next to the highlighted control.
//
// The unit's screen is 800x480, so the box often cannot sit on the side a
// step asks for: clamping it inside the viewport can push it back over the
// control it is pointing at, which then cannot be seen or tapped. When that
// happens the opposite side is tried before giving up.
//
// Pure, so that the placement can be tested without a browser.

export type TourSide = 'top' | 'bottom' | 'left' | 'right';

export type TourRect = { top: number; left: number; width: number; height: number };

export type TourPlacement = { left: number; top: number; side: TourSide | null };

const OPPOSITE: Record<TourSide, TourSide> = {
	top: 'bottom',
	bottom: 'top',
	left: 'right',
	right: 'left'
};

// The highlight is drawn 4px outside the control (GuidedTour .tour-spot),
// so the box has to clear that ring as well.
const SPOT_PAD = 4;

// On the left and right the box starts a little above the control, so that
// its title lines up with the control rather than its middle.
const SIDE_LIFT = 40;

function raw(rect: TourRect, side: TourSide, boxW: number, boxH: number, gap: number) {
	switch (side) {
		case 'left':
			return { left: rect.left - boxW - gap, top: rect.top - SIDE_LIFT };
		case 'right':
			return { left: rect.left + rect.width + gap, top: rect.top - SIDE_LIFT };
		case 'top':
			return { left: rect.left, top: rect.top - boxH - gap };
		case 'bottom':
			return { left: rect.left, top: rect.top + rect.height + gap };
	}
}

function clamp(
	p: { left: number; top: number },
	boxW: number,
	boxH: number,
	viewW: number,
	viewH: number,
	gap: number
) {
	return {
		left: Math.max(gap, Math.min(p.left, viewW - boxW - gap)),
		top: Math.max(gap, Math.min(p.top, viewH - boxH - gap))
	};
}

function overlaps(p: { left: number; top: number }, boxW: number, boxH: number, r: TourRect) {
	const rl = r.left - SPOT_PAD;
	const rt = r.top - SPOT_PAD;
	const rr = r.left + r.width + SPOT_PAD;
	const rb = r.top + r.height + SPOT_PAD;
	return p.left < rr && p.left + boxW > rl && p.top < rb && p.top + boxH > rt;
}

/**
 * Position of the tour box. Without a target the box sits centred at the
 * bottom, where it still explains the step and says where to go.
 */
export function placeTourBox(
	rect: TourRect | null,
	side: TourSide,
	box: { width: number; height: number },
	view: { width: number; height: number },
	gap = 12
): TourPlacement {
	const { width: boxW, height: boxH } = box;
	const { width: viewW, height: viewH } = view;

	if (!rect) {
		return {
			left: Math.max(gap, (viewW - boxW) / 2),
			top: Math.max(gap, viewH - boxH - gap * 2),
			side: null
		};
	}

	const first = clamp(raw(rect, side, boxW, boxH, gap), boxW, boxH, viewW, viewH, gap);
	if (!overlaps(first, boxW, boxH, rect)) return { ...first, side };

	const other = OPPOSITE[side];
	const second = clamp(raw(rect, other, boxW, boxH, gap), boxW, boxH, viewW, viewH, gap);
	if (!overlaps(second, boxW, boxH, rect)) return { ...second, side: other };

	// Neither side fits. Keep the side the step asked for: the operator can
	// still read the box, and the control stays reachable once it is closed.
	return { ...first, side };
}

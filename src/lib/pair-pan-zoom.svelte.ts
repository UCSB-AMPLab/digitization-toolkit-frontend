// NEH-339: one zoom and one pan shared by the two panes of a test pair, as in
// ImageViewerModal (src/lib/pan-zoom.ts has the geometry). Used by the
// Refocus dialog's test-pictures stage and by the camera check's full-size
// viewer. Pane 0 is the left page, pane 1 the right page.
//
// The component binds each pane's frame size and each picture's natural size
// to frameW/frameH/naturalW/naturalH, styles each picture with imageStyle(),
// and passes the frame's pointer events to pointerDown/pointerMove/endDrag.
// `pannable(i)` says whether pane i shows a picture that can be dragged, and
// `rotation(i)` the clockwise turn its picture is shown at (0, 90, 180 or
// 270; 0 when not given). Turned pictures follow the spread viewer in the
// volume view (spreadImageStyle there): at 90 and 270 the picture gets the
// frame's size with width and height swapped, centred, and the geometry of
// src/lib/pan-zoom.ts accounts for the swap, so 1:1 and the pan bounds hold.
//
// Version: 0.3.3

import {
	isSwapped,
	fittedSize,
	screenExtent,
	oneToOneZoom,
	effectiveOneToOne,
	pageScale,
	panBounds,
	panPixels,
	dragToFraction,
	stepZoom,
	transformFor,
	type Pan,
	type PanFraction
} from './pan-zoom';

function dpr(): number {
	return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}

export class PairPanZoom {
	zoom = $state(1);
	pan = $state<PanFraction>({ x: 0, y: 0 });
	frameW = $state<number[]>([0, 0]);
	frameH = $state<number[]>([0, 0]);
	naturalW = $state<number[]>([0, 0]);
	naturalH = $state<number[]>([0, 0]);
	// The pane being dragged, by the first pointer only.
	dragIndex = $state<number | null>(null);

	#pannable: (pane: number) => boolean;
	#rotation: (pane: number) => number;
	#pointerId: number | null = null;
	#lastX = 0;
	#lastY = 0;

	constructor(pannable: (pane: number) => boolean, rotation: (pane: number) => number = () => 0) {
		this.#pannable = pannable;
		this.#rotation = rotation;
	}

	rotations = $derived([0, 1].map((i) => this.#rotation(i)));

	oneToOnes = $derived(
		[0, 1].map((i) =>
			effectiveOneToOne(
				oneToOneZoom(
					{ w: this.naturalW[i] ?? 0, h: this.naturalH[i] ?? 0 },
					{ w: this.frameW[i] ?? 0, h: this.frameH[i] ?? 0 },
					this.rotations[i],
					dpr()
				)
			)
		)
	);

	oneToOneRef = $derived(Math.max(...this.oneToOnes));

	geoms = $derived(
		[0, 1].map((i) => {
			const fitted = fittedSize(
				{ w: this.naturalW[i] ?? 0, h: this.naturalH[i] ?? 0 },
				{ w: this.frameW[i] ?? 0, h: this.frameH[i] ?? 0 },
				this.rotations[i]
			);
			const scale = pageScale(this.zoom, this.oneToOnes[i] ?? 1, this.oneToOneRef);
			const bounds = panBounds(screenExtent(fitted, this.rotations[i], scale), { w: this.frameW[i] ?? 0, h: this.frameH[i] ?? 0 });
			return { scale, pan: panPixels(this.pan, bounds) as Pan, bounds };
		})
	);

	/** Every one of `panes` has its picture and its frame measured. */
	measured(panes: number[]): boolean {
		return panes.every((i) => this.naturalW[i] > 0 && this.frameW[i] > 0);
	}

	/** A new pair: nothing measured, at fit, on the centre. */
	reset() {
		this.naturalW = [0, 0];
		this.naturalH = [0, 0];
		this.zoom = 1;
		this.pan = { x: 0, y: 0 };
	}

	fit() {
		this.zoom = 1;
	}

	oneToOne() {
		this.zoom = this.oneToOneRef;
	}

	/** 1:1 on the centre of both pictures. */
	centreOneToOne() {
		this.zoom = this.oneToOneRef;
		this.pan = { x: 0, y: 0 };
	}

	step(direction: 1 | -1) {
		this.zoom = stepZoom(this.zoom, direction, this.oneToOneRef);
	}

	pointerDown(e: PointerEvent, i: number) {
		if (!this.#pannable(i) || e.button !== 0 || this.#pointerId !== null) return;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// A pointer that has already ended cannot be captured; the drag works without.
		}
		this.dragIndex = i;
		this.#pointerId = e.pointerId;
		this.#lastX = e.clientX;
		this.#lastY = e.clientY;
	}

	pointerMove(e: PointerEvent, i: number) {
		if (this.dragIndex !== i || e.pointerId !== this.#pointerId) return;
		const delta = { x: e.clientX - this.#lastX, y: e.clientY - this.#lastY };
		this.#lastX = e.clientX;
		this.#lastY = e.clientY;
		this.pan = dragToFraction(this.pan, delta, this.geoms[i]?.bounds ?? { w: 0, h: 0 });
	}

	endDrag(e: PointerEvent) {
		if (e.pointerId !== this.#pointerId) return;
		this.dragIndex = null;
		this.#pointerId = null;
	}

	imageStyle(i: number): string {
		const geom = this.geoms[i];
		const rotation = this.rotations[i];
		const transition = this.dragIndex === null ? 'transition: transform 0.15s ease;' : '';
		const transform = transformFor(geom.pan, geom.scale, rotation);
		const w = this.frameW[i] ?? 0;
		const h = this.frameH[i] ?? 0;
		if (isSwapped(rotation) && w && h) {
			// The swapped box is wider than the frame on one axis, so the
			// image's max-width/max-height must not crop it again.
			return `${transition} position: absolute; top: 50%; left: 50%; width: ${h}px; height: ${w}px; max-width: none; max-height: none; object-fit: contain; transform: translate(-50%, -50%) ${transform};`;
		}
		return `${transition} transform: ${transform};`;
	}
}

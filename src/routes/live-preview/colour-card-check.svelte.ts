// Whether the capture screen's volume needs colour card shots (NEH-340): the
// reads of GET /collections/{id}/colour-card?read_cameras=1, and one verdict
// drawn from them. The capture screen owns one per screen; ColourCardStep
// does the asking.
//
// - `need` has one owner, this check, and one way in, `evidence`. Every
//   piece of evidence carries a stamp from this check's clock (`stamp`):
//   for a state read (this check's own, or the step's recovery reads), the
//   moment its GET is sent; for the step's outcomes (set completed, skipped, refused
//   as not enabled) and for the unit's setting seen off, the moment the
//   outcome was known. An item is applied only when no item with a later
//   stamp has been applied; otherwise it is dropped, `evidence` says so, and
//   a dropped state answer requests one fresh read (coalesced with any
//   requested already), so the latest state always gets asked for.
// - What an item says: an answer enabled with needed === true is needed;
//   an answer not enabled, or needed false, is not; needed null (a camera
//   could not be read) is not needed only while the visit has no verdict
//   yet, and is dropped afterwards, as a failed read is. An outcome carries
//   its verdict. No answer is stored to be applied later.
// - The check is asked again after anything that can change the answer has
//   settled: a step outcome applied as "not needed" (set completed,
//   skipped) requests one fresh read, and so does the screen when a write
//   of camera settings settles (+page.svelte).
// - `firstPending` is true from the start of a visit until its first check
//   has settled (the fresh unit read, and the state read when the setting is
//   on), or FIRST_CHECK_HOLD_MS after that check was allowed to start,
//   whichever comes first; the check then goes on in the background.
// - The screen decides from these alone: capture is held while the volume
//   is eligible and `firstPending || need`, and the step is shown while
//   `need` and the capture gate is free (+page.svelte).
// - Reads: the screen tells the check whether it may read (`update`), from
//   one derived boolean, and nothing else starts one. A read is asked for
//   (`request`) at the start of a visit and at each point where a camera's
//   exposure or zoom can have changed; requests made while a read is in
//   flight come to one more read, which starts as soon as that read settles
//   and the screen allows it. Each read first gets the unit's settings
//   through a fresh queued read (reloadUnit, the serial queue of
//   $lib/unit-mode), then, when `asks` says the volume is asked, the state.
// - Each read belongs to the volume it was made for: `reset` (another
//   volume) stops it. After `destroy` every method does nothing and no
//   request or timer is created ($lib/page-life).
//
// Version: 0.3.0

import { colourCardApi } from '$lib/api';
import { createPageLife } from '$lib/page-life';
import { reloadUnit } from '$lib/unit-mode';
import { stepOpens, type ColourCardState } from '$lib/colour-card';

// The bound on the first check's hold of capture. Both reads answer in a
// second or two on a unit; the fresh unit read can wait in the serial queue
// behind a Settings write of up to 150 s (SLOW_REQUEST_TIMEOUT_MS in
// $lib/api), and a camera read behind another camera request. Ten seconds
// covers the usual answers with room to spare, and is as long as a pedal
// press may go without a capture before the screen lets it through.
export const FIRST_CHECK_HOLD_MS = 10_000;

export class ColourCardCheck {
	// The latest answer, for the step's reason.
	state = $state<ColourCardState | null>(null);
	need = $state(false);
	firstPending = $state(true);

	#requested = true;
	// The check's clock, and the stamp of the latest item applied.
	#clock = 0;
	#applied = 0;
	// Whether this visit has a verdict yet.
	#verdict = false;
	#reading = false;
	#may = false;
	#destroyed = false;
	#bound: ReturnType<typeof setTimeout> | null = null;
	readonly #life = createPageLife();
	readonly #collectionId: () => number;
	readonly #asks: () => boolean;

	constructor(o: {
		collectionId: () => number;
		// Whether the volume is asked, with the unit's settings as last read.
		asks: () => boolean;
	}) {
		this.#collectionId = o.collectionId;
		this.#asks = o.asks;
	}

	/** Whether a read may start now; called by the screen's one effect. */
	update(may: boolean): void {
		if (this.#destroyed) return;
		this.#may = may;
		this.#next();
	}

	/** Ask for a read: started now when it may, else as soon as it may. */
	request(): void {
		if (this.#destroyed) return;
		this.#requested = true;
		this.#next();
	}

	/** A moment of this check's clock, to stamp a request when it starts or an outcome when it is known. */
	stamp(): number {
		return ++this.#clock;
	}

	/**
	 * The one way in for evidence about whether shots are needed (module
	 * header). Returns whether the item was applied: a caller acts on an
	 * answer only when it was, and then only while `need` is true.
	 */
	evidence(item: {
		at: number;
		state?: ColourCardState;
		need?: boolean;
		outcome?: boolean;
	}): boolean {
		if (this.#destroyed) return false;
		if (item.at < this.#applied) {
			// An older state answer is never the end: the state is asked for
			// again, so the latest always gets asked.
			if (item.state) this.request();
			return false;
		}
		let verdict: boolean;
		if (item.state) {
			const s = item.state;
			if (s.enabled && s.needed === null && this.#verdict) return false;
			verdict = stepOpens(s);
		} else verdict = item.need === true;
		this.#applied = item.at;
		this.#verdict = true;
		this.need = verdict;
		if (item.state) this.state = item.state;
		// A step outcome applied as "not needed" (set completed, skipped) is
		// followed by one fresh read: the unit's state after it gets asked for.
		if (item.outcome && !verdict) this.request();
		return true;
	}

	/** Another volume: forget this one and ask again for the new one. */
	reset(): void {
		if (this.#destroyed) return;
		this.#life.stop('read');
		this.#clearBound();
		this.#reading = false;
		this.state = null;
		this.need = false;
		this.firstPending = true;
		this.#requested = true;
		// Nothing stamped for the volume before counts for this one.
		this.#applied = this.stamp();
		this.#verdict = false;
		// The screen says again, for the new volume, when a read may start.
		this.#may = false;
	}

	destroy(): void {
		this.#destroyed = true;
		this.#clearBound();
		this.#life.destroy();
	}

	#clearBound(): void {
		if (this.#bound !== null) clearTimeout(this.#bound);
		this.#bound = null;
	}

	#next(): void {
		if (this.#destroyed || !this.#may || this.#reading || !this.#requested) return;
		this.#requested = false;
		void this.#read();
	}

	async #read(): Promise<void> {
		const op = this.#life.begin('read');
		const id = this.#collectionId();
		this.#reading = true;
		if (this.firstPending && this.#bound === null)
			this.#bound = setTimeout(() => {
				this.#bound = null;
				this.firstPending = false;
			}, FIRST_CHECK_HOLD_MS);
		try {
			await reloadUnit();
			if (!op.current() || id !== this.#collectionId()) return;
			if (!this.#asks()) {
				this.evidence({ at: this.stamp(), need: false });
				return;
			}
			// Stamped when its own GET is sent.
			const at = this.stamp();
			const state = await colourCardApi.state(id, { readCameras: true }, op.signal);
			if (!op.current() || id !== this.#collectionId()) return;
			this.evidence({ at, state });
		} catch (error) {
			if (!op.current()) return;
			// The verdict before stays.
			console.error('[LivePreview] Error reading the colour card state:', error);
		} finally {
			if (op.current()) {
				this.#reading = false;
				this.#clearBound();
				this.firstPending = false;
				this.#next();
			}
		}
	}
}

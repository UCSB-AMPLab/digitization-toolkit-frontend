// Reading a state again while it is still changing (NEH-419, NEH-420): a
// move of captures, or its repair, that the unit is still working on, and
// an answer the page lost. `repeatRead` calls `read` once per interval
// while `wanted()` says the state is still open, and stops arming as soon as
// it is not. One read at a time: no read starts while one is in flight (a
// timer that falls due during a read is skipped, and the next is armed when
// the read ends), and a visibility change never arms a second timer. Its
// users still apply an answer only if it belongs to their latest read.
// Every read goes through it: `now()` asks for an immediate read, sharing
// the same guard (with a read in flight it marks one more as wanted, which
// starts when that one ends, so a direct read is never lost and never
// overlaps). A read that answers HALT (an authorization refusal) stops the
// repeat until the next now(). It pauses while the document is hidden (a background tab or a
// kiosk left idle asks nothing) and arms again when it is visible. `poke()`
// arms it after a read or a change of state; it keeps at most one timer.
// `stop()` ends it for good, including a timer already due, and removes
// its listener: a component calls it when it is destroyed.
//
// The scheduler is injected so that tests fire the timer by hand.
//
// Version: 0.3.0

export interface Scheduler {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export const browserScheduler: Scheduler = {
	setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
	clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** How often a state the unit is still working on is read again. */
export const REREAD_INTERVAL_MS = 5000;

/** What a read answers to stop the repeat (an authorization refusal) until now() is asked. */
export const HALT = Symbol('halt');

export interface RepeatRead {
	/** Arm the timer for the next read, if one is wanted and none is armed or in flight. */
	poke(): void;
	/** Queue an immediate automatic refresh, preserving an authorization halt. */
	refresh(): void;
	/**
	 * Read now. With a read in flight no second one starts: one more read is
	 * marked as wanted and starts when the current one ends. It also ends a
	 * halt.
	 */
	now(): void;
	stop(): void;
}

export function repeatRead(options: {
	read: () => Promise<unknown> | unknown;
	wanted: () => boolean;
	intervalMs?: number;
	scheduler?: Scheduler;
	doc?: Document;
	/** Refresh even an idle reader on visibility; an authorization halt still requires now(). */
	readOnVisible?: boolean;
}): RepeatRead {
	const scheduler = options.scheduler ?? browserScheduler;
	const doc = options.doc ?? globalThis.document;
	const intervalMs = options.intervalMs ?? REREAD_INTERVAL_MS;
	let handle: unknown = null;
	let stopped = false;
	let reading = false;
	// A direct read asked for while one was in flight.
	let more = false;
	// The last read answered HALT: nothing is armed until now().
	let halted = false;

	const hidden = () => !doc || doc.visibilityState === 'hidden';

	function cancel() {
		if (handle !== null) scheduler.clearTimeout(handle);
		handle = null;
	}

	async function start() {
		reading = true;
		try {
			if ((await options.read()) === HALT) {
				halted = true;
			}
		} catch {
			// A reader's own failure: the next read is armed as after any other.
		} finally {
			reading = false;
			if (more && !stopped && !halted) {
				more = false;
				start();
			} else arm();
		}
	}

	function arm() {
		if (stopped || halted || reading || handle !== null || hidden() || !options.wanted()) return;
		handle = scheduler.setTimeout(() => {
			handle = null;
			if (stopped || halted || reading || hidden() || !options.wanted()) return;
			start();
		}, intervalMs);
	}

	function onVisibility() {
		if (hidden()) cancel();
		else if (options.readOnVisible) request(false);
		else arm();
	}

	function request(resume: boolean) {
		if (stopped || (halted && !resume)) return;
		if (resume) halted = false;
		cancel();
		if (reading) more = true;
		else {
			// A manual Retry also satisfies a read queued before the halt.
			more = false;
			void start();
		}
	}
	doc?.addEventListener('visibilitychange', onVisibility);

	return {
		poke: arm,
		refresh() {
			request(false);
		},
		now() {
			request(true);
		},
		stop() {
			stopped = true;
			cancel();
			doc?.removeEventListener('visibilitychange', onVisibility);
		}
	};
}

// The run of preview answers without a frame, for one camera.
//
// A connected camera that sent no frame answers 503 preview_frame_failed. A
// continuous preview shows "connected, no image" once that has lasted
// NO_FRAME_SECONDS, whatever the pace at which a screen asks for frames, so
// the capture screen and the overview wait the same time. Last-pair mode has
// no pace (a frame is asked for only when the operator asks), so it counts
// answers: LAST_PAIR_NO_FRAME_ANSWERS.
//
// A run starts at its first answer without a frame and ends with a frame or
// with reset(). The timed limit needs at least two answers in the run, the
// last of them NO_FRAME_SECONDS or more after the first, so a tab that was in
// the background, or requests that stalled, show nothing by themselves: one
// late answer is the start of a run, not the end of one.
//
// The clock is injectable so tests need no real waiting. No import of
// anything else, so the tests run in plain node.
//
// Version: 0.3.0

export const NO_FRAME_SECONDS = 30;
export const LAST_PAIR_NO_FRAME_ANSWERS = 3;

export type NoFrameLimit = { seconds: number } | { answers: number };

export interface NoFrameRun {
	/** An answer without a frame arrived; true when the notice should show. */
	noFrame(limit: NoFrameLimit): boolean;
	/** A frame (or any answer that is not "no frame") arrived. */
	frame(): void;
	/** The run starts again from nothing (polling stopped or restarted). */
	reset(): void;
}

export function createNoFrameRun(now: () => number = Date.now): NoFrameRun {
	let answers = 0;
	let startedAt = 0;
	return {
		noFrame(limit) {
			const at = now();
			if (answers === 0) startedAt = at;
			answers += 1;
			if ('answers' in limit) return answers >= limit.answers;
			return answers >= 2 && at - startedAt >= limit.seconds * 1000;
		},
		frame() {
			answers = 0;
		},
		reset() {
			answers = 0;
		}
	};
}

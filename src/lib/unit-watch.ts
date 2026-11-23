// Watching whether the unit answers (NEH-186).
//
// While the unit is updated, its stack is stopped and a small server takes
// over port 80 (scripts/update-page/serve.py in the superproject): every
// /api/* request gets 503 with the body {"status": "unavailable", "detail":
// "Captua is stopped for an update."}, and every other path gets the update
// page. A page of Captua left open then shows what it showed before, with
// every request failing.
//
// The root layout starts this watcher on every page. It asks the health
// (healthApi.probe) at once and UNIT_WATCH_INTERVAL_MS after each answer,
// through pollPairing: one request at a time, none while the page is
// hidden, one at once when it is shown again. The answers:
// - `update`, the update page's own answer: the page reloads, while it is
//   visible; a hidden page reloads only after a check made once it is
//   visible again gives the same answer. This reload cannot loop: it
//   follows only the update page's own answer, and after it the document is
//   the update page, which does not contain this code. When the update is
//   over, the update page brings the person back to Captua itself.
// - anything else that is not a healthy answer (no answer, a timeout, 502,
//   504, a 503 without that body, any other error): never a reload, since
//   the page may hold work the person has not finished; after
//   UNIT_WATCH_FAILURES in a row, `unitNotAnswering` is raised, and the
//   banner (UnitNotAnswering.svelte) says so and offers a reload.
// - a healthy answer lowers it and starts the count again.
// A page shown again while a check is in flight checks again as soon as that
// check settles.
//
// One watcher runs at a time: starting one stops the one before, so a
// layout that mounts again still has exactly one.
//
// No Svelte components and no direct `window` or `document` references, so
// the node test project can test the module.

import { writable } from 'svelte/store';
import { pollPairing } from './fisqua-pairing';

export type HealthProbe = 'ok' | 'update' | 'unreachable';

export const UNIT_WATCH_INTERVAL_MS = 15_000;
export const UNIT_WATCH_FAILURES = 3;
// Longer than the health request's own limit (HEALTH_REQUEST_TIMEOUT_MS in
// api.ts), so that limit ends a slow check; past this the check is aborted.
const CHECK_LIMIT_MS = 30_000;

/** Raised after UNIT_WATCH_FAILURES failures in a row, lowered by a healthy answer. */
export const unitNotAnswering = writable(false);

interface VisibilitySource {
	visibilityState: string;
	addEventListener(type: 'visibilitychange', listener: () => void): void;
	removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface UnitWatchOptions {
	probe: (signal: AbortSignal) => Promise<HealthProbe>;
	reload: () => void;
	doc?: VisibilitySource;
}

let active: (() => void) | null = null;

/** Starts the watcher, stopping any other; returns the function that stops it. */
export function startUnitWatch(opts: UnitWatchOptions): () => void {
	active?.();
	let failures = 0;
	let done = false;
	let stopPolling: (() => void) | null = null;
	const visible = () => !opts.doc || opts.doc.visibilityState === 'visible';
	// pollPairing drops the check it starts on the page being shown when a
	// check is still in flight, and asks next only an interval after that
	// one. So a page shown during a check checks again as soon as it settles.
	let inFlight = false;
	let recheck = false;
	const onVisibility = () => {
		if (visible() && inFlight) recheck = true;
	};
	opts.doc?.addEventListener('visibilitychange', onVisibility);

	async function read(signal: AbortSignal) {
		do {
			recheck = false;
			inFlight = true;
			try {
				await check(signal);
			} finally {
				inFlight = false;
			}
		} while (recheck && !done && !signal.aborted);
	}

	async function check(signal: AbortSignal) {
		let answer: HealthProbe;
		try {
			answer = await opts.probe(signal);
		} catch {
			answer = 'unreachable';
		}
		if (done) return;
		if (answer === 'update') {
			if (!visible()) return;
			stop();
			opts.reload();
			return;
		}
		if (answer === 'ok') {
			failures = 0;
			unitNotAnswering.set(false);
			return;
		}
		failures += 1;
		if (failures >= UNIT_WATCH_FAILURES) unitNotAnswering.set(true);
	}

	function stop() {
		if (done) return;
		done = true;
		stopPolling?.();
		opts.doc?.removeEventListener('visibilitychange', onVisibility);
		unitNotAnswering.set(false);
		if (active === stop) active = null;
	}

	active = stop;
	stopPolling = pollPairing({
		read,
		intervalMs: UNIT_WATCH_INTERVAL_MS,
		hiddenStopMs: 0,
		timeoutMs: CHECK_LIMIT_MS,
		doc: opts.doc
	});
	return stop;
}

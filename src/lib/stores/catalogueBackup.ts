// Shared poll of GET /system/catalogue-backup (NEH-266).
//
// The sidebar indicator and the Configuración section both read
// `catalogueBackupNow`, so the page that shows both still makes one request
// per interval. Polling runs while at least one component is subscribed and
// stops when the last one unmounts (Svelte's readable start/stop).
//
// The last answer is held and re-classified against a clock that ticks every
// RECLASSIFY_INTERVAL_MS and whenever the page becomes visible again, so a
// copy turns amber or red, and an answer that could not be refreshed turns
// unknown, with no new answer (see classifySnapshot). Waking also asks again
// at once when the last answer is more than one poll interval old. A failed or timed-out request sets `failed`, which both
// components render as "state unknown" (NEH-138). A 401 or 403 stops the
// poll; apiRequest has already cleared a dead session and the layout sends
// the user to /login.

import { derived, readable } from 'svelte/store';
import { browser } from '$app/environment';
import { systemApi, AuthError } from '$lib/api';
import {
	POLL_INTERVAL_MS,
	RECLASSIFY_INTERVAL_MS,
	REQUEST_TIMEOUT_MS,
	startPolling,
	type CatalogueBackupSnapshot
} from '$lib/catalogue-backup';

export type { CatalogueBackupSnapshot };

/**
 * The page has just become visible again, or was restored from the
 * back-forward cache: after sleep, the wall clock may have jumped while no
 * timer fired.
 */
function onWake(handler: () => void): () => void {
	const onVisibility = () => {
		if (document.visibilityState === 'visible') handler();
	};
	document.addEventListener('visibilitychange', onVisibility);
	window.addEventListener('pageshow', handler);
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		window.removeEventListener('pageshow', handler);
	};
}

export const catalogueBackup = readable<CatalogueBackupSnapshot>({ kind: 'loading' }, (set) => {
	// SSR subscribes and unsubscribes in the same render; no request and no
	// listeners there.
	if (!browser) return;
	set({ kind: 'loading' });
	// When the last request settled, success or failure.
	let settledAt = Date.now();
	const poll = startPolling(
		(signal) => systemApi.getCatalogueBackup(signal),
		(result) => {
			settledAt = Date.now();
			set(result.ok ? { kind: 'loaded', status: result.status, receivedAt: settledAt } : { kind: 'failed' });
		},
		POLL_INTERVAL_MS,
		(error) => error instanceof AuthError,
		REQUEST_TIMEOUT_MS
	);
	// At wake, an answer older than one interval is refreshed at once rather
	// than when the timer next fires. pollNow skips this while a request is in
	// flight.
	const removeWake = onWake(() => {
		if (Date.now() - settledAt > POLL_INTERVAL_MS) poll.pollNow();
	});
	return () => {
		removeWake();
		poll();
	};
});

const clock = readable(Date.now(), (set) => {
	if (!browser) return;
	const tick = () => set(Date.now());
	tick();
	const id = setInterval(tick, RECLASSIFY_INTERVAL_MS);
	const removeWake = onWake(tick);
	return () => {
		clearInterval(id);
		removeWake();
	};
});

/**
 * The held answer and the time to classify it at. The time is never earlier
 * than the answer's arrival, since the clock can be up to one tick behind.
 */
export const catalogueBackupNow = derived([catalogueBackup, clock], ([snapshot, now]) => ({
	snapshot,
	now: snapshot.kind === 'loaded' ? Math.max(now, snapshot.receivedAt) : now
}));

// Shared poll of GET /system/catalogue-backup (NEH-266).
//
// The sidebar indicator and the Configuración section both read
// `catalogueBackupNow`, so the page that shows both still makes one request
// per interval. Polling runs while at least one component is subscribed and
// stops when the last one unmounts (Svelte's readable start/stop).
//
// The last answer is held and re-classified against a clock that ticks every
// RECLASSIFY_INTERVAL_MS, so a copy turns amber or red, and an answer that
// could not be refreshed turns unknown, with no new answer (see
// classifySnapshot). A failed or timed-out request sets `failed`, which both
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

export const catalogueBackup = readable<CatalogueBackupSnapshot>({ kind: 'loading' }, (set) => {
	// SSR subscribes and unsubscribes in the same render; no request there.
	if (!browser) return;
	set({ kind: 'loading' });
	return startPolling(
		(signal) => systemApi.getCatalogueBackup(signal),
		(result) =>
			set(result.ok ? { kind: 'loaded', status: result.status, receivedAt: Date.now() } : { kind: 'failed' }),
		POLL_INTERVAL_MS,
		(error) => error instanceof AuthError,
		REQUEST_TIMEOUT_MS
	);
});

const clock = readable(Date.now(), (set) => {
	set(Date.now());
	const id = setInterval(() => set(Date.now()), RECLASSIFY_INTERVAL_MS);
	return () => clearInterval(id);
});

/**
 * The held answer and the time to classify it at. The time is never earlier
 * than the answer's arrival, since the clock can be up to one tick behind.
 */
export const catalogueBackupNow = derived([catalogueBackup, clock], ([snapshot, now]) => ({
	snapshot,
	now: snapshot.kind === 'loaded' ? Math.max(now, snapshot.receivedAt) : now
}));

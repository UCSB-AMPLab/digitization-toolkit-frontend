// Shared poll of GET /system/catalogue-backup (NEH-266).
//
// The sidebar indicator and the Configuración section both read this store,
// so the page that shows both still makes one request per interval. Polling
// runs while at least one component is subscribed and stops when the last
// one unmounts (Svelte's readable start/stop).
//
// A failed request sets `failed`, which both components render as "state
// unknown": the last good answer is not kept, so nothing on screen claims a
// state the backend did not just report (NEH-138). A 401 or 403 stops the
// poll; apiRequest has already cleared a dead session and the layout sends
// the user to /login.

import { readable } from 'svelte/store';
import { browser } from '$app/environment';
import { systemApi, AuthError, type CatalogueBackupStatus } from '$lib/api';
import { POLL_INTERVAL_MS, startPolling } from '$lib/catalogue-backup';

export type CatalogueBackupSnapshot =
	| { kind: 'loading' }
	| { kind: 'failed' }
	| { kind: 'loaded'; status: CatalogueBackupStatus; receivedAt: number };

export const catalogueBackup = readable<CatalogueBackupSnapshot>({ kind: 'loading' }, (set) => {
	// SSR subscribes and unsubscribes in the same render; no request there.
	if (!browser) return;
	set({ kind: 'loading' });
	return startPolling(
		() => systemApi.getCatalogueBackup(),
		(result) =>
			set(result.ok ? { kind: 'loaded', status: result.status, receivedAt: Date.now() } : { kind: 'failed' }),
		POLL_INTERVAL_MS,
		(error) => error instanceof AuthError
	);
});

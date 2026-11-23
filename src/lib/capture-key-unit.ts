// The unit's capture key (NEH-336). The unit stores one key for every
// browser (GET /system/unit, captureKey; null means the built-in default),
// and administrators and operators change it in Settings > Capture key
// (PUT /system/unit/capture-key).
//
// `captureChords` follows the unit's state: on its first subscriber it gives
// this browser's cached copy of the unit's key (or the defaults), then the
// unit's key, or both default keys when it is null. Each value read is
// written to the cache for the next page's first paint. A backend that does
// not report the key leaves the cached one in place.
//
// The capture screen, the camera check and the refocus dialog, and Settings >
// Capture key, read it with `watchCaptureChords`, which reads the unit again
// each time one of them mounts: a key changed from another browser is seen
// when the screen or dialog opens. Until that answer arrives the key last
// known is used, and a failed read keeps it: blocking the pedal because the
// settings could not be read would stop capture for a lesser fault. A read
// and a save run one at a time in the unit's queue (unit-mode.ts), so no
// answer can put an older key back.
//
// carryOverCaptureKey: a browser may still hold a key assigned there before
// the unit held one. When an administrator or operator signs in on it, the
// unit is read for that purpose, never taken from the cached state; when that
// read answers that the unit has no key, the browser's key is sent once, and
// when the read fails nothing is done this time. Another browser can still
// set a key between that read and this write, and this write then replaces
// it: the backend has no conditional write. A save from this browser cannot:
// the read and the write are one item of the unit's queue (unit-mode.ts); the browser's copy
// is forgotten before the request, so a refusal or a failure (ignored) is not
// retried. The key is also forgotten when it is a default key or when the
// unit already has one. Reviewers and the testing account cannot set the
// key: their browser's copy stays for someone who can.

import { readable } from 'svelte/store';
import { browser } from '$app/environment';
import {
	DEFAULT_CHORDS,
	clearChord,
	clearLegacyChord,
	isDefaultChord,
	readChords,
	readLegacyChord,
	writeChord,
	type CaptureChord
} from './capture-key';
import {
	canSetCaptureKey,
	queueUnitItem,
	readUnitState,
	reloadUnit,
	unitState,
	writeUnit
} from './unit-mode';
import { systemApi } from './api';
import { authStore } from './stores/auth';

/** The chords that trigger a capture for the unit's key: it alone, or both defaults. */
export function chordsForUnit(key: CaptureChord | null): readonly CaptureChord[] {
	return key ? [key] : DEFAULT_CHORDS;
}

export const captureChords = readable<readonly CaptureChord[]>(DEFAULT_CHORDS, (set) => {
	set(readChords());
	const stop = unitState.subscribe((state) => {
		if (!state || state.captureKey === undefined) return;
		if (state.captureKey) writeChord(state.captureKey);
		else clearChord();
		set(chordsForUnit(state.captureKey));
	});
	return stop;
});

/** Follow the unit's capture key, reading the unit again first; returns the unsubscribe. */
export function watchCaptureChords(run: (chords: readonly CaptureChord[]) => void): () => void {
	const stop = captureChords.subscribe(run);
	if (browser) void reloadUnit();
	return stop;
}

/** Set the unit's capture key (null for the default); the answer becomes the unit's state. */
export async function setUnitCaptureKey(chord: CaptureChord | null): Promise<void> {
	await writeUnit(() => systemApi.setCaptureKey(chord));
}

/** Send this browser's own key to the unit once, when the unit has none (see above). */
export async function carryOverCaptureKey(role: string | null | undefined): Promise<void> {
	if (!canSetCaptureKey(role)) return;
	const legacy = readLegacyChord();
	if (!legacy) return;
	if (isDefaultChord(legacy)) {
		clearLegacyChord();
		return;
	}
	// The carry-over belongs to the session that started it: after the read,
	// nothing is done unless that person is still signed in. Its read and its
	// write are one item of the unit's queue (unit-mode.ts), so no save from
	// this browser falls between them.
	const started = authStore.getUser()?.id;
	try {
		await queueUnitItem(async (item) => {
			let state: ReturnType<typeof readUnitState>;
			try {
				state = item.keep(await systemApi.unit());
			} catch {
				// No answer: asked again next time.
				return;
			}
			if (started === undefined || authStore.getUser()?.id !== started) return;
			// A backend that does not hold the key: asked again next time.
			if (!state || state.captureKey === undefined) return;
			clearLegacyChord();
			if (state.captureKey !== null) return;
			try {
				item.keep(await systemApi.setCaptureKey(legacy));
			} catch {
				// A refusal or a failure leaves the unit's default.
			}
		});
	} catch {
		// The signed-in user changed before the item started.
	}
}

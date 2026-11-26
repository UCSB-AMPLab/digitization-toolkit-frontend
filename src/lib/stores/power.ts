// How many PowerControl instances have a dialog or the blocking state on
// screen. The capture screen reads it to keep the capture key away from the
// power confirmation: the account menu that opens it lives in the top bar, so
// the capture view has no other way to know it is up.
//
// Version: 0.3.0

import { writable, derived } from 'svelte/store';

const open = writable(0);

export const powerControlOpen = derived(open, (n) => n > 0);

// Counts one instance as open until the returned function is called.
export function holdPowerControlOpen(): () => void {
	open.update((n) => n + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		open.update((n) => n - 1);
	};
}

// How many restarts are being awaited: PowerControl's reboot, and the
// restart it waits for on behalf of another request (the camera kind's,
// awaitRestart). The banner for a unit that is not answering stays away
// meanwhile, since the restart overlay already says the unit is restarting.
const awaiting = writable(0);

export const restartAwaited = derived(awaiting, (n) => n > 0);

// Counts one restart as awaited until the returned function is called.
export function holdRestartAwaited(): () => void {
	awaiting.update((n) => n + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		awaiting.update((n) => n - 1);
	};
}

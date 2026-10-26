// How many PowerControl instances have a dialog or the blocking state on
// screen. The capture screen reads it to keep the capture key away from the
// power confirmation: the avatar menu that opens it lives in the top bar, so
// the capture view has no other way to know it is up.

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

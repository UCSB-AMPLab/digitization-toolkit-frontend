// The volume view's top bar lives in +layout@.svelte, but what an operator
// can do with the volume depends on the records, which the page loads. The
// layout puts this slot in context and renders whatever the page sets in it,
// so the page's controls sit in the bar without the layout loading the
// records a second time (NEH-260).
//
// Version: 0.1.0-beta

import { getContext, setContext, type Snippet } from 'svelte';

const KEY = Symbol('volume-topbar');

export interface VolumeTopbarSlot {
	actions: Snippet | null;
	/**
	 * Reloads the page's records, which carry each image's freed state; the
	 * layout calls it after a free or a restore of the volume (NEH-248).
	 * Resolves false if the list could not be refreshed.
	 */
	reloadRecords: (() => Promise<boolean>) | null;
}

export function setVolumeTopbar(slot: VolumeTopbarSlot): void {
	setContext(KEY, slot);
}

export function getVolumeTopbar(): VolumeTopbarSlot | undefined {
	return getContext<VolumeTopbarSlot | undefined>(KEY);
}

/** The context that holds `slot`, for rendering the page without its layout (tests). */
export function volumeTopbarContext(slot: VolumeTopbarSlot): Map<symbol, VolumeTopbarSlot> {
	return new Map([[KEY, slot]]);
}

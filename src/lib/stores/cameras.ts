// Version: 0.3.0

import { writable } from 'svelte/store';

// What the capture screen says about the capture in progress (NEH-381):
// still in flight after 10 s, ended in a timeout and being checked, or
// found once checked. Null when there is nothing to say.
export type CaptureNotice = 'still_working' | 'maybe_saved' | 'found';

interface CameraStatusState {
	captureError: boolean;
	errorMessage: string | null;
	notice: CaptureNotice | null;
}

const initialState: CameraStatusState = {
	captureError: false,
	errorMessage: null,
	notice: null
};

function createCameraStatusStore() {
	const { subscribe, set, update } = writable<CameraStatusState>(initialState);
	// Whose failure is shown, when its writer named one: clearFailure removes
	// it only while it is still that writer's (NEH-401).
	let owner: unknown = null;

	return {
		subscribe,
		/** Call after a capture succeeds — clears any previous error and notice. */
		reportSuccess() {
			owner = null;
			set(initialState);
		},
		/** Call after a capture fails — marks the status bar red. `by` names whose failure it is. */
		reportFailure(message: string, by: unknown = null) {
			owner = by;
			update((s) => ({ ...s, captureError: true, errorMessage: message }));
		},
		/** Removes the failure shown, only while it is still the one `by` reported. */
		clearFailure(by: unknown) {
			if (by === null || owner !== by) return;
			owner = null;
			update((s) => ({ ...s, captureError: false, errorMessage: null }));
		},
		/** Sets, or with null clears, what is said about the capture in progress. */
		reportNotice(notice: CaptureNotice | null) {
			update((s) => ({ ...s, notice }));
		}
	};
}

export const cameraStatus = createCameraStatusStore();

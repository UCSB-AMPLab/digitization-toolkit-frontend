// Version: 0.1.0-beta

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

	return {
		subscribe,
		/** Call after a capture succeeds — clears any previous error and notice. */
		reportSuccess() {
			set(initialState);
		},
		/** Call after a capture fails — marks the status bar red. */
		reportFailure(message: string) {
			update((s) => ({ ...s, captureError: true, errorMessage: message }));
		},
		/** Sets, or with null clears, what is said about the capture in progress. */
		reportNotice(notice: CaptureNotice | null) {
			update((s) => ({ ...s, notice }));
		}
	};
}

export const cameraStatus = createCameraStatusStore();

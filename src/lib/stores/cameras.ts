import { writable } from 'svelte/store';

interface CameraStatusState {
  captureError: boolean;
  errorMessage: string | null;
}

const initialState: CameraStatusState = {
  captureError: false,
  errorMessage: null,
};

function createCameraStatusStore() {
  const { subscribe, set, update } = writable<CameraStatusState>(initialState);

  return {
    subscribe,
    /** Call after a capture succeeds — clears any previous error. */
    reportSuccess() {
      set(initialState);
    },
    /** Call after a capture fails — marks the status bar red. */
    reportFailure(message: string) {
      update((s) => ({ ...s, captureError: true, errorMessage: message }));
    },
  };
}

export const cameraStatus = createCameraStatusStore();

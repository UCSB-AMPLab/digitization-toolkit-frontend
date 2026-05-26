import { writable } from 'svelte/store';

export interface WbSamplingState {
  /** Whether sampling mode is active — LiveViewport shows crosshair overlay. */
  active: boolean;
  /** Camera index (0 = left, 1 = right) whose feed should accept the click. */
  cameraIndex: number;
  /**
   * Callback invoked by LiveViewport when the user clicks a pixel.
   * Receives the averaged (R, G, B) values from a 3×3 sample around the click.
   * CameraControls sets this; LiveViewport calls it and then clears the store.
   */
  onSample: ((r: number, g: number, b: number) => void) | null;
}

export const wbSamplingStore = writable<WbSamplingState>({
  active: false,
  cameraIndex: 0,
  onSample: null,
});

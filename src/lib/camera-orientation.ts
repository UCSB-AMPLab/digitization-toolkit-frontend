import type { CameraDevice } from './api';

// Default clockwise capture rotation (degrees). Most digitisation rigs use
// vertical (portrait) orientation, so this mirrors the historical hardcoded
// default that lived on the live-preview page before NEH-71.
export const DEFAULT_ROTATION = 90;

// The only angles the capture path accepts. A stored value outside this set
// (a hand-edited registry, a bool that slipped through) must never reach the
// rotation state: the page would send it on every capture and get a 422, and
// every step would keep the bad remainder (45, 135, 225, 315, ...).
export const VALID_ROTATIONS: readonly number[] = [0, 90, 180, 270];

export function isValidRotation(value: unknown): value is number {
  return typeof value === 'number' && VALID_ROTATIONS.includes(value);
}

/**
 * Seeds the per-camera rotation state from the device list the appliance
 * reports (each device's `orientation`, as remembered by the backend), and
 * seeds it again after every device refresh (rescan or reconnect).
 *
 * A rotation the operator sets in this session survives later device
 * refreshes for as long as the same physical body (by `hardware_id`) is
 * still the one sitting at that camera index — `touched` records which body
 * was last rotated at each index, so a matching device there is left alone.
 * A replacement body at that index (or an index the operator never touched)
 * starts instead from its own stored `orientation`, or DEFAULT_ROTATION when
 * that device has none or reports an angle outside VALID_ROTATIONS.
 *
 * Never mutates `current` or `touched`; always returns new objects. Indices
 * with no corresponding device in `devices` keep whatever value `current`
 * already had for them.
 */
export function seedRotation(
  current: Record<number, number>,
  devices: Pick<CameraDevice, 'index' | 'hardware_id' | 'orientation'>[],
  touched: ReadonlyMap<number, string>
): { rotation: Record<number, number>; touched: Map<number, string> } {
  const rotation: Record<number, number> = { ...current };
  const nextTouched = new Map(touched);

  for (const { index, hardware_id, orientation } of devices) {
    if (touched.get(index) === hardware_id) {
      // Same body still there and it was rotated in this session — leave the
      // current value (and the touch) alone.
      continue;
    }
    rotation[index] = isValidRotation(orientation) ? orientation : DEFAULT_ROTATION;
    nextTouched.delete(index);
  }

  return { rotation, touched: nextTouched };
}

/**
 * Builds a `save(index, hardwareId, degrees)` function that persists a
 * rotation change with exactly one PUT in flight per camera index (R30-2).
 *
 * While a save for an index is in flight, a further call for the same index
 * doesn't start a second PUT — it just remembers the latest (hardwareId,
 * degrees) pair, which is sent the moment the in-flight one settles. Two (or
 * more) quick taps on the same camera therefore always end up persisting the
 * last value the operator picked, and never land out of order. Errors are
 * reported to `onError` and never surface as a rejection out of `save` —
 * the next call for that index still goes out normally.
 */
export function createOrientationSaver(
  put: (index: number, hardwareId: string, degrees: number) => Promise<unknown>,
  onError?: (index: number, err: unknown) => void
): (index: number, hardwareId: string, degrees: number) => void {
  const inFlight = new Set<number>();
  const pending = new Map<number, { hardwareId: string; degrees: number }>();

  function runSave(index: number, hardwareId: string, degrees: number): void {
    inFlight.add(index);
    put(index, hardwareId, degrees)
      .catch((err) => {
        onError?.(index, err);
      })
      .finally(() => {
        const next = pending.get(index);
        pending.delete(index);
        if (next) {
          runSave(index, next.hardwareId, next.degrees);
        } else {
          inFlight.delete(index);
        }
      });
  }

  return function save(index: number, hardwareId: string, degrees: number): void {
    if (inFlight.has(index)) {
      pending.set(index, { hardwareId, degrees });
      return;
    }
    runSave(index, hardwareId, degrees);
  };
}

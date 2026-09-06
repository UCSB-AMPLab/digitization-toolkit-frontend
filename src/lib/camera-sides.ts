import type { CameraDevice } from '$lib/api';

export type SideStatus = 'ok' | 'not-found';

export interface SideInfo {
  status: SideStatus;
  model: string | null;
}

/**
 * Derives per-side ('left' | 'right') camera status and model from the device
 * list returned by the backend. Sides are matched on each device's own `index`
 * field (0 = left, 1 = right), never on array position: when only the right
 * body is present it is the sole element of the list and must still be the
 * right side. Any other index is ignored.
 */
export function sidesFromDevices(devices: CameraDevice[]): { left: SideInfo; right: SideInfo } {
  const toSide = (index: number): SideInfo => {
    const device = devices.find((d) => d.index === index);
    return device ? { status: 'ok', model: device.model } : { status: 'not-found', model: null };
  };

  return {
    left: toSide(0),
    right: toSide(1)
  };
}

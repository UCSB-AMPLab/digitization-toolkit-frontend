// Version: 0.1.0-beta

import type { CameraDevice } from '$lib/api';

export type SideStatus = 'ok' | 'not-found';

export interface SideInfo {
	status: SideStatus;
	model: string | null;
	// The camera's confirmed role (`right`, the odd/recto page, is the left
	// camera; `left`, the even/verso page, the right camera), or null when
	// the listing confirms no set-up. A status write from a preview leaves it
	// out and keeps the one known.
	role?: 'left' | 'right' | null;
}

/**
 * Derives per-side ('left' | 'right') camera status and model from the device
 * list returned by the backend. Sides are matched on each device's own `index`
 * field (0 = left, 1 = right), never on array position: when only the right
 * body is present it is the sole element of the list and must still be the
 * right side. Any other index is ignored. Here `left` and `right` are the
 * Overview's two panels, by index; the camera's page role is `role`.
 */
export function sidesFromDevices(devices: CameraDevice[]): { left: SideInfo; right: SideInfo } {
	const first = devices.find((d) => d.index === 0);
	const second = devices.find((d) => d.index === 1);
	const confirmed = (d: CameraDevice | undefined) =>
		d?.role_confirmed && (d.role === 'left' || d.role === 'right') ? d.role : null;
	// Roles name the cameras only when both listed cameras hold the two
	// different confirmed roles; otherwise neither is named by its role.
	const named =
		confirmed(first) !== null &&
		confirmed(second) !== null &&
		confirmed(first) !== confirmed(second);
	const toSide = (device: CameraDevice | undefined): SideInfo =>
		device
			? { status: 'ok', model: device.model, role: named ? confirmed(device) : null }
			: { status: 'not-found', model: null, role: null };

	return {
		left: toSide(first),
		right: toSide(second)
	};
}

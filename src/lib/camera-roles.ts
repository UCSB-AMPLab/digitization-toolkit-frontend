// Which "Which camera is this?" screen the set-up calls for (NEH-343), the
// left camera the saved roles decide, and the key that tells one set of
// camera bodies from another.
//
// The backend may report several reasons at once; the screen shows the
// most specific, by the decided priority:
//   1. identity_missing, identity_ambiguous: a camera Captua cannot tell
//      apart. Nothing here can fix it; an administrator must give the
//      camera an identity.
//   2. fewer than two cameras listed: Captua needs both connected.
//   3. port_changed, only when it is the sole reason about roles: a known
//      camera on another USB socket. Ask only whether the cameras changed
//      sides, with the two under their current roles; without two distinct
//      roles on record, ask as in 6.
//   4. pair_changed: say the pair is not the one last confirmed, then ask.
//   5. role_conflict: say both cameras are on record for the same page,
//      then ask.
//   6. role_unconfirmed: say Captua does not know, then ask.
// port_changed together with another role reason asks by that reason. No
// reason (the step opened by hand, or a backend without set-up) asks with
// no lead. The decision reads the codes only, never the backend's English.
//
// No import of api.ts values, so the tests run in plain node.
//
// Version: 0.3.3

import type { CameraDevice, CameraSetup } from './api';

export type AskReason = 'conflict' | 'unconfirmed' | 'pair_changed' | 'by_hand';

export type WhichScreen =
	| { kind: 'identity' }
	| { kind: 'one_camera' }
	| { kind: 'ask'; reason: AskReason }
	| { kind: 'port'; left: CameraDevice; right: CameraDevice };

export function whichScreen(setup: CameraSetup | null, devices: CameraDevice[]): WhichScreen {
	const codes = new Set((setup?.reasons ?? []).map((r) => r.code));
	if (codes.has('identity_missing') || codes.has('identity_ambiguous')) return { kind: 'identity' };
	const cameras = [...devices].sort((a, b) => a.index - b.index).slice(0, 2);
	if (cameras.length < 2) return { kind: 'one_camera' };
	const pair = codes.has('pair_changed');
	const conflict = codes.has('role_conflict');
	const unconfirmed = codes.has('role_unconfirmed');
	if (codes.has('port_changed') && !pair && !conflict && !unconfirmed) {
		const left = cameras.find((d) => d.role === 'left');
		const right = cameras.find((d) => d.role === 'right');
		if (left && right && left !== right) return { kind: 'port', left, right };
		return { kind: 'ask', reason: 'unconfirmed' };
	}
	if (pair) return { kind: 'ask', reason: 'pair_changed' };
	if (conflict) return { kind: 'ask', reason: 'conflict' };
	if (unconfirmed) return { kind: 'ask', reason: 'unconfirmed' };
	return { kind: 'ask', reason: 'by_hand' };
}

// The camera index the saved roles put on the left page, or null when they
// decide nothing: while set-up is needed or unknown, and unless the listing
// has exactly one body confirmed as the left page and one as the right
// (an old backend reports no roles; a guess is never a role).
export function leftIndexFromRoles(devices: CameraDevice[], setup: CameraSetup | null): number | null {
	if (!setup || setup.needs_setup) return null;
	const confirmed = devices.filter((d) => d.role_confirmed === true);
	const left = confirmed.filter((d) => d.role === 'left');
	const right = confirmed.filter((d) => d.role === 'right');
	if (left.length !== 1 || right.length !== 1) return null;
	return left[0].index;
}

// The bodies a listing reports, whatever their order or index.
export function hardwareKey(devices: Pick<CameraDevice, 'hardware_id'>[]): string {
	return devices
		.map((d) => d.hardware_id)
		.sort()
		.join('\n');
}

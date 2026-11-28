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
// On a CHDK unit an administrator gives a camera its identity from the
// identity screen (NEH-363): identityToAssign says which body and which page
// parity POST /cameras/side/{index} writes onto its card.
//
// No import of api.ts values, so the tests run in plain node.
//
// Version: 0.4.0

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
// decide nothing: while set-up is needed or unknown, without a confirmed
// pair (an old backend), and unless both bodies of the pair are listed.
// The roles come from the set-up alone (its confirmed_pair, which the
// backend reports with needs_setup false only when the pair is exactly the
// bodies connected, each confirmed in its role); the listing only says at
// which index each body is. A listing's own role fields are never read, so
// a listing that started before a save cannot carry the roles from before it.
export function leftIndexFromRoles(
	devices: CameraDevice[],
	setup: CameraSetup | null
): number | null {
	if (!setup || setup.needs_setup || !setup.confirmed_pair) return null;
	const { left, right } = setup.confirmed_pair;
	if (left === right) return null;
	const leftBody = devices.find((d) => d.hardware_id === left);
	const rightBody = devices.find((d) => d.hardware_id === right);
	if (!leftBody || !rightBody) return null;
	return leftBody.index;
}

// The bodies a listing reports, whatever their order or index.
export function hardwareKey(devices: Pick<CameraDevice, 'hardware_id'>[]): string {
	return devices
		.map((d) => d.hardware_id)
		.sort()
		.join('\n');
}

export type PageParity = 'odd' | 'even';

// The body an administrator gives an identity to from the identity screen,
// and the parity written on its card with it (POST /cameras/side/{index}),
// or null when there is none to give. The body is the first by index that
// an identity reason names: one with no identity (identity_missing), or,
// of two that answer to one identity (identity_ambiguous), one without a
// USB serial, which the backend gives an identity of its own; a body with
// a serial answers to it whatever its card says. The parity is the one on
// the body's card when no other connected body shoots it, else even, else
// odd, whichever no other body shoots: two bodies on one parity is a 409.
// The parity is not the body's role, which the operator confirms after.
export function identityToAssign(
	setup: CameraSetup | null,
	devices: CameraDevice[]
): { index: number; side: PageParity } | null {
	const missing = new Set<string | null>();
	const ambiguous = new Set<string | null>();
	for (const reason of setup?.reasons ?? []) {
		const into =
			reason.code === 'identity_missing'
				? missing
				: reason.code === 'identity_ambiguous'
					? ambiguous
					: null;
		for (const id of reason.hardware_ids) into?.add(id);
	}
	const body = [...devices]
		.sort((a, b) => a.index - b.index)
		.find((d) => missing.has(d.hardware_id) || (ambiguous.has(d.hardware_id) && !d.serial));
	if (!body) return null;
	const held = new Set(devices.filter((d) => d.index !== body.index).map((d) => d.side ?? null));
	const own = body.side === 'odd' || body.side === 'even' ? body.side : null;
	const side = [own, 'even', 'odd'].find(
		(p): p is PageParity => p !== null && !held.has(p as PageParity)
	);
	return side ? { index: body.index, side } : null;
}

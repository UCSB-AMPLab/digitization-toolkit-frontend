// NEH-343: which "Which camera is this?" screen the set-up calls for. The
// most specific reason wins, by the decided priority: a camera whose
// identity Captua cannot use; then fewer than two cameras; then a known
// camera on another USB socket, only when that is the sole reason about
// roles, which asks only whether the cameras changed sides; then a pair
// other than the one last confirmed; then two cameras on the same page;
// then a role not confirmed. And the left camera the saved roles decide.
// NEH-363: the CHDK body an administrator gives an identity to from that
// screen, and the page parity written with it.
//
// Version: 0.4.0
import { describe, expect, it } from 'vitest';
import { hardwareKey, identityToAssign, leftIndexFromRoles, whichScreen } from './camera-roles';
import type { CameraDevice, CameraSetup, CameraSetupCode } from './api';

function device(index: number, over: Partial<CameraDevice> = {}): CameraDevice {
	return {
		index,
		hardware_id: `hw${index}`,
		model: 'Canon PowerShot A2500',
		calibrated: false,
		...over
	};
}

function setup(...codes: CameraSetupCode[]): CameraSetup {
	return {
		needs_setup: codes.length > 0,
		reasons: codes.map((code) => ({ code, message: 'English', hardware_ids: ['hw1'] })),
		confirmed_pair: null
	};
}

const pair = [
	device(0, { role: 'left', role_confirmed: true }),
	device(1, { role: 'right', role_confirmed: true })
];

describe('whichScreen', () => {
	it('a camera whose identity Captua cannot use comes first', () => {
		expect(whichScreen(setup('port_changed', 'identity_missing'), pair).kind).toBe('identity');
		expect(whichScreen(setup('role_conflict', 'identity_ambiguous'), pair).kind).toBe('identity');
	});

	it('fewer than two cameras: Captua needs both', () => {
		expect(whichScreen(setup('role_unconfirmed'), [device(0)]).kind).toBe('one_camera');
		expect(whichScreen(setup('role_unconfirmed'), []).kind).toBe('one_camera');
		expect(whichScreen(setup('identity_missing'), [device(0)]).kind).toBe('identity');
	});

	it('another pair outranks the other role reasons: a new pair is told it is not the pair last confirmed', () => {
		expect(whichScreen(setup('role_unconfirmed', 'pair_changed'), pair)).toEqual({
			kind: 'ask',
			reason: 'pair_changed'
		});
		expect(whichScreen(setup('role_conflict', 'pair_changed'), pair)).toEqual({
			kind: 'ask',
			reason: 'pair_changed'
		});
		expect(whichScreen(setup('port_changed', 'pair_changed'), pair)).toEqual({
			kind: 'ask',
			reason: 'pair_changed'
		});
	});

	it('the same role twice outranks a role not confirmed', () => {
		expect(whichScreen(setup('role_unconfirmed', 'role_conflict'), pair)).toEqual({
			kind: 'ask',
			reason: 'conflict'
		});
		expect(whichScreen(setup('role_unconfirmed'), pair)).toEqual({
			kind: 'ask',
			reason: 'unconfirmed'
		});
	});

	it('another socket with another role reason asks, by that reason', () => {
		expect(whichScreen(setup('port_changed', 'role_unconfirmed'), pair)).toEqual({
			kind: 'ask',
			reason: 'unconfirmed'
		});
		expect(whichScreen(setup('port_changed', 'role_conflict'), pair)).toEqual({
			kind: 'ask',
			reason: 'conflict'
		});
	});

	it('another socket asks whether the cameras changed sides, with the cameras by their current roles', () => {
		const swappedRows = [
			device(0, { role: 'right', role_confirmed: true }),
			device(1, { role: 'left', role_confirmed: true })
		];
		const screen = whichScreen(setup('port_changed'), swappedRows);
		expect(screen.kind).toBe('port');
		if (screen.kind !== 'port') return;
		expect(screen.left.hardware_id).toBe('hw1');
		expect(screen.right.hardware_id).toBe('hw0');
	});

	it('another socket without two distinct roles on record asks instead', () => {
		const rows = [device(0, { role: 'left' }), device(1, { role: null })];
		expect(whichScreen(setup('port_changed'), rows)).toEqual({
			kind: 'ask',
			reason: 'unconfirmed'
		});
	});

	it('no reason (opened by hand, or an old backend): asks', () => {
		expect(whichScreen(setup(), pair)).toEqual({ kind: 'ask', reason: 'by_hand' });
		expect(whichScreen(null, pair)).toEqual({ kind: 'ask', reason: 'by_hand' });
	});

	it("the backend's English message is never what decides", () => {
		const s = setup('role_conflict');
		s.reasons[0].message = 'port_changed';
		expect(whichScreen(s, pair)).toEqual({ kind: 'ask', reason: 'conflict' });
	});
});

describe('hardwareKey', () => {
	it('the same set of bodies gives the same key, whatever their order or indices', () => {
		expect(hardwareKey([device(0), device(1)])).toBe(
			hardwareKey([device(0, { hardware_id: 'hw1' }), device(1, { hardware_id: 'hw0' })])
		);
		expect(hardwareKey([device(0)])).not.toBe(hardwareKey([device(0), device(1)]));
		expect(hardwareKey([device(0), device(1, { hardware_id: 'other' })])).not.toBe(
			hardwareKey([device(0), device(1)])
		);
	});
});

describe('leftIndexFromRoles', () => {
	const notNeeded: CameraSetup = {
		needs_setup: false,
		reasons: [],
		confirmed_pair: { left: 'hw1', right: 'hw0' }
	};

	it('the index of the body the set-up names as the left page, when set-up is not needed', () => {
		expect(leftIndexFromRoles([device(0), device(1)], notNeeded)).toBe(1);
		expect(
			leftIndexFromRoles([device(0), device(1)], {
				...notNeeded,
				confirmed_pair: { left: 'hw0', right: 'hw1' }
			})
		).toBe(0);
		// The bodies are found by identity, whatever their index.
		expect(
			leftIndexFromRoles(
				[device(0, { hardware_id: 'hw1' }), device(1, { hardware_id: 'hw0' })],
				notNeeded
			)
		).toBe(0);
	});

	it('the roles a listing carries decide nothing: only the set-up does', () => {
		const older = [
			device(0, { role: 'left', role_confirmed: true }),
			device(1, { role: 'right', role_confirmed: true })
		];
		expect(leftIndexFromRoles(older, notNeeded)).toBe(1);
		expect(leftIndexFromRoles(older, { ...notNeeded, confirmed_pair: null })).toBeNull();
	});

	it('nothing while set-up is needed or unknown', () => {
		expect(
			leftIndexFromRoles([device(0), device(1)], { ...notNeeded, needs_setup: true })
		).toBeNull();
		expect(leftIndexFromRoles([device(0), device(1)], null)).toBeNull();
	});

	it('nothing without a confirmed pair whose two bodies are both listed (an old backend, one camera)', () => {
		expect(
			leftIndexFromRoles([device(0), device(1)], { ...notNeeded, confirmed_pair: null })
		).toBeNull();
		expect(leftIndexFromRoles([device(1)], notNeeded)).toBeNull();
		expect(leftIndexFromRoles([device(0), device(2)], notNeeded)).toBeNull();
		expect(
			leftIndexFromRoles([device(0), device(1)], {
				...notNeeded,
				confirmed_pair: { left: 'hw1', right: 'hw1' }
			})
		).toBeNull();
	});
});

describe('identityToAssign (NEH-363)', () => {
	function reasons(...rs: [CameraSetupCode, (string | null)[]][]): CameraSetup {
		return {
			needs_setup: rs.length > 0,
			reasons: rs.map(([code, hardware_ids]) => ({ code, message: 'English', hardware_ids })),
			confirmed_pair: null
		};
	}

	it('a body with no identity takes the parity no other body shoots', () => {
		const list = [
			device(0, { side: 'even' }),
			device(1, { hardware_id: 'a2500_idx1', side: null })
		];
		expect(identityToAssign(reasons(['identity_missing', ['a2500_idx1']]), list)).toEqual({
			index: 1,
			side: 'odd'
		});
	});

	it('keeps the parity already on the card when no other body shoots it', () => {
		const list = [device(0, { side: null }), device(1, { hardware_id: 'a2500_idx1', side: 'odd' })];
		expect(identityToAssign(reasons(['identity_missing', ['a2500_idx1']]), list)).toEqual({
			index: 1,
			side: 'odd'
		});
	});

	it('takes even when neither body has a parity, and the lower index first', () => {
		const list = [
			device(1, { hardware_id: 'a2500_idx1' }),
			device(0, { hardware_id: 'a2500_idx0' })
		];
		expect(
			identityToAssign(reasons(['identity_missing', ['a2500_idx0', 'a2500_idx1']]), list)
		).toEqual({ index: 0, side: 'even' });
	});

	it('two bodies with one identity: the one without a USB serial', () => {
		const list = [
			device(0, { hardware_id: 'cam_x', serial: 'S1', side: 'even' }),
			device(1, { hardware_id: 'cam_x', serial: null, side: 'even' })
		];
		expect(identityToAssign(reasons(['identity_ambiguous', ['cam_x']]), list)).toEqual({
			index: 1,
			side: 'odd'
		});
	});

	it('nothing when no identity reason names a listed body, or both parities are taken', () => {
		expect(identityToAssign(reasons(['role_unconfirmed', ['hw0']]), [device(0)])).toBeNull();
		expect(identityToAssign(null, [device(0)])).toBeNull();
		expect(identityToAssign(reasons(['identity_missing', ['gone_idx3']]), [device(0)])).toBeNull();
		expect(
			identityToAssign(reasons(['identity_ambiguous', ['cam_x']]), [
				device(0, { hardware_id: 'cam_x', serial: 'S1' }),
				device(1, { hardware_id: 'cam_x', serial: 'S2' })
			])
		).toBeNull();
		const full = [
			device(0, { side: 'even' }),
			device(1, { side: 'odd' }),
			device(2, { hardware_id: 'a2500_idx2', side: 'odd' })
		];
		expect(identityToAssign(reasons(['identity_missing', ['a2500_idx2']]), full)).toBeNull();
	});
});

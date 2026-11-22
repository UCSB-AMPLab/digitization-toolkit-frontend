// Version: 0.1.0-beta

import { describe, it, expect } from 'vitest';
import { sidesFromDevices } from './camera-sides';
import type { CameraDevice } from './api';

function device(overrides: Partial<CameraDevice> = {}): CameraDevice {
	return {
		hardware_id: 'hw-0',
		model: 'Test Camera',
		index: 0,
		calibrated: true,
		...overrides
	};
}

describe('sidesFromDevices', () => {
	it('maps index 0 to left and index 1 to right when both are present', () => {
		const devices = [
			device({ hardware_id: 'hw-left', model: 'Left Model', index: 0 }),
			device({ hardware_id: 'hw-right', model: 'Right Model', index: 1 })
		];

		const result = sidesFromDevices(devices);

		expect(result.left).toEqual({ status: 'ok', model: 'Left Model', role: null });
		expect(result.right).toEqual({ status: 'ok', model: 'Right Model', role: null });
	});

	it('reports only-left as not-found on the right', () => {
		const devices = [device({ hardware_id: 'hw-left', model: 'Left Model', index: 0 })];

		const result = sidesFromDevices(devices);

		expect(result.left).toEqual({ status: 'ok', model: 'Left Model', role: null });
		expect(result.right).toEqual({ status: 'not-found', model: null, role: null });
	});

	it('keeps a lone right camera on the right even though it is first in the list', () => {
		const devices = [device({ hardware_id: 'hw-right', model: 'Right Model', index: 1 })];

		const result = sidesFromDevices(devices);

		expect(result.left).toEqual({ status: 'not-found', model: null, role: null });
		expect(result.right).toEqual({ status: 'ok', model: 'Right Model', role: null });
	});

	it('matches on the index field regardless of list order', () => {
		const devices = [
			device({ hardware_id: 'hw-right', model: 'Right Model', index: 1 }),
			device({ hardware_id: 'hw-left', model: 'Left Model', index: 0 })
		];

		const result = sidesFromDevices(devices);

		expect(result.left.model).toBe('Left Model');
		expect(result.right.model).toBe('Right Model');
	});

	it('reports both sides as not-found when no devices are present', () => {
		const result = sidesFromDevices([]);

		expect(result.left).toEqual({ status: 'not-found', model: null, role: null });
		expect(result.right).toEqual({ status: 'not-found', model: null, role: null });
	});

	it('passes the model through unchanged', () => {
		const devices = [device({ model: 'ArduCam 64MP' })];

		const result = sidesFromDevices(devices);

		expect(result.left.model).toBe('ArduCam 64MP');
	});

	it("carries each camera's confirmed role when the two listed cameras hold the two roles", () => {
		const result = sidesFromDevices([
			device({ hardware_id: 'a', index: 0, role: 'right', role_confirmed: true }),
			device({ hardware_id: 'b', index: 1, role: 'left', role_confirmed: true })
		]);
		expect(result.left.role).toBe('right');
		expect(result.right.role).toBe('left');
	});

	it('carries no role without a confirmed set-up: a role not confirmed, both on one role, or one camera', () => {
		const unconfirmed = sidesFromDevices([
			device({ hardware_id: 'a', index: 0, role: 'right', role_confirmed: false }),
			device({ hardware_id: 'b', index: 1, role: 'left', role_confirmed: true })
		]);
		expect([unconfirmed.left.role, unconfirmed.right.role]).toEqual([null, null]);
		const conflict = sidesFromDevices([
			device({ hardware_id: 'a', index: 0, role: 'left', role_confirmed: true }),
			device({ hardware_id: 'b', index: 1, role: 'left', role_confirmed: true })
		]);
		expect([conflict.left.role, conflict.right.role]).toEqual([null, null]);
		const one = sidesFromDevices([
			device({ hardware_id: 'a', index: 0, role: 'right', role_confirmed: true })
		]);
		expect([one.left.role, one.right.role]).toEqual([null, null]);
	});

	it('ignores devices beyond index 1', () => {
		const devices = [
			device({ hardware_id: 'hw-left', model: 'Left Model', index: 0 }),
			device({ hardware_id: 'hw-right', model: 'Right Model', index: 1 }),
			device({ hardware_id: 'hw-extra', model: 'Extra Model', index: 2 })
		];

		const result = sidesFromDevices(devices);

		expect(result.left).toEqual({ status: 'ok', model: 'Left Model', role: null });
		expect(result.right).toEqual({ status: 'ok', model: 'Right Model', role: null });
	});
});

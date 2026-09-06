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

    expect(result.left).toEqual({ status: 'ok', model: 'Left Model' });
    expect(result.right).toEqual({ status: 'ok', model: 'Right Model' });
  });

  it('reports only-left as not-found on the right', () => {
    const devices = [device({ hardware_id: 'hw-left', model: 'Left Model', index: 0 })];

    const result = sidesFromDevices(devices);

    expect(result.left).toEqual({ status: 'ok', model: 'Left Model' });
    expect(result.right).toEqual({ status: 'not-found', model: null });
  });

  it('keeps a lone right camera on the right even though it is first in the list', () => {
    const devices = [device({ hardware_id: 'hw-right', model: 'Right Model', index: 1 })];

    const result = sidesFromDevices(devices);

    expect(result.left).toEqual({ status: 'not-found', model: null });
    expect(result.right).toEqual({ status: 'ok', model: 'Right Model' });
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

    expect(result.left).toEqual({ status: 'not-found', model: null });
    expect(result.right).toEqual({ status: 'not-found', model: null });
  });

  it('passes the model through unchanged', () => {
    const devices = [device({ model: 'ArduCam 64MP' })];

    const result = sidesFromDevices(devices);

    expect(result.left.model).toBe('ArduCam 64MP');
  });

  it('ignores devices beyond index 1', () => {
    const devices = [
      device({ hardware_id: 'hw-left', model: 'Left Model', index: 0 }),
      device({ hardware_id: 'hw-right', model: 'Right Model', index: 1 }),
      device({ hardware_id: 'hw-extra', model: 'Extra Model', index: 2 })
    ];

    const result = sidesFromDevices(devices);

    expect(result.left).toEqual({ status: 'ok', model: 'Left Model' });
    expect(result.right).toEqual({ status: 'ok', model: 'Right Model' });
  });
});

// NEH-71: seeding the per-camera rotation state from the device list, and
// coalescing the PUTs that persist a manual rotation change.
import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_ROTATION,
  seedRotation,
  createOrientationSaver,
  isPlaceholderHardwareId,
  isDeviceListComplete,
  canSaveRotation,
  settlePendingRotations
} from './camera-orientation';
import type { CameraDevice } from './api';

type Dev = Pick<CameraDevice, 'index' | 'hardware_id' | 'orientation'>;

function device(overrides: Partial<Dev> = {}): Dev {
  return { index: 0, hardware_id: 'hw-a', orientation: 90, ...overrides };
}

describe('seedRotation', () => {
  it('seeds rotation from the device orientation for an untouched index', () => {
    const result = seedRotation(
      { 0: 90 },
      [device({ index: 0, hardware_id: 'hw-a', orientation: 180 })],
      new Map()
    );
    expect(result.rotation).toEqual({ 0: 180 });
  });

  it('keeps a touched index unchanged while the same hardware id is still there', () => {
    const touched = new Map<number, string>([[0, 'hw-a']]);
    const result = seedRotation(
      { 0: 270 },
      [device({ index: 0, hardware_id: 'hw-a', orientation: 90 })],
      touched
    );
    expect(result.rotation).toEqual({ 0: 270 });
    expect(result.touched.get(0)).toBe('hw-a');
  });

  it('seeds DEFAULT_ROTATION when orientation is null and the index is untouched', () => {
    const result = seedRotation(
      {},
      [device({ index: 0, hardware_id: 'hw-a', orientation: null })],
      new Map()
    );
    expect(result.rotation).toEqual({ 0: DEFAULT_ROTATION });
  });

  it('seeds DEFAULT_ROTATION when orientation is undefined and the index is untouched', () => {
    const result = seedRotation(
      {},
      [device({ index: 0, hardware_id: 'hw-a', orientation: undefined })],
      new Map()
    );
    expect(result.rotation).toEqual({ 0: DEFAULT_ROTATION });
  });

  it('applies a new stored orientation for an untouched index on a second call (rescan)', () => {
    const first = seedRotation(
      {},
      [device({ index: 0, hardware_id: 'hw-a', orientation: 90 })],
      new Map()
    );
    const second = seedRotation(
      first.rotation,
      [device({ index: 0, hardware_id: 'hw-a', orientation: 270 })],
      first.touched
    );
    expect(second.rotation).toEqual({ 0: 270 });
  });

  it('a different hardware id at a touched index drops the touch and seeds that body\'s stored orientation', () => {
    const touched = new Map<number, string>([[0, 'hw-a']]);
    const result = seedRotation(
      { 0: 270 },
      [device({ index: 0, hardware_id: 'hw-b', orientation: 180 })],
      touched
    );
    expect(result.rotation).toEqual({ 0: 180 });
    expect(result.touched.has(0)).toBe(false);
  });

  it('a replacement body with no stored orientation seeds DEFAULT_ROTATION', () => {
    const touched = new Map<number, string>([[0, 'hw-a']]);
    const result = seedRotation(
      { 0: 270 },
      [device({ index: 0, hardware_id: 'hw-b', orientation: null })],
      touched
    );
    expect(result.rotation).toEqual({ 0: DEFAULT_ROTATION });
  });

  it('seeds DEFAULT_ROTATION for a stored angle outside the four the capture path accepts', () => {
    for (const bad of [45, 135, -90, 360, Number.NaN]) {
      const { rotation } = seedRotation({ 0: 90 }, [{ index: 0, hardware_id: 'A', orientation: bad }], new Map());
      expect(rotation[0]).toBe(DEFAULT_ROTATION);
    }
  });

  it('keeps the current value for indices with no matching device', () => {
    const result = seedRotation(
      { 0: 90, 1: 180 },
      [device({ index: 0, hardware_id: 'hw-a', orientation: 270 })],
      new Map()
    );
    expect(result.rotation).toEqual({ 0: 270, 1: 180 });
  });

  it('returns new objects and never mutates the inputs', () => {
    const current = { 0: 90 };
    const touched = new Map<number, string>([[0, 'hw-a']]);
    const devices = [device({ index: 0, hardware_id: 'hw-b', orientation: 180 })];

    const result = seedRotation(current, devices, touched);

    expect(result.rotation).not.toBe(current);
    expect(result.touched).not.toBe(touched);
    expect(current).toEqual({ 0: 90 });
    expect(touched.get(0)).toBe('hw-a');
  });
});

describe('createOrientationSaver', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('two saves before the first settles result in exactly two PUTs, the second carrying the last value', async () => {
    const d1 = deferred<unknown>();
    const d2 = deferred<unknown>();
    const put = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    const save = createOrientationSaver(put);

    save(0, 'hw-a', 90);
    save(0, 'hw-a', 180);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenNthCalledWith(1, 0, 'hw-a', 90);

    d1.resolve(undefined);
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenNthCalledWith(2, 0, 'hw-a', 180);
  });

  it('three quick saves result in two PUTs (the middle value coalesced away)', async () => {
    const d1 = deferred<unknown>();
    const d2 = deferred<unknown>();
    const put = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    const save = createOrientationSaver(put);

    save(0, 'hw-a', 90);
    save(0, 'hw-a', 180);
    save(0, 'hw-a', 270);
    expect(put).toHaveBeenCalledTimes(1);

    d1.resolve(undefined);
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenNthCalledWith(2, 0, 'hw-a', 270);
  });

  it('a rejected PUT calls onError, and the next save still goes out', async () => {
    const d1 = deferred<unknown>();
    const d2 = deferred<unknown>();
    const put = vi.fn().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    const onError = vi.fn();
    const save = createOrientationSaver(put, onError);

    save(0, 'hw-a', 90);
    d1.reject(new Error('boom'));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(0, expect.any(Error)));

    save(0, 'hw-a', 180);
    expect(put).toHaveBeenCalledTimes(2);
    d2.resolve(undefined);
  });

  it('two saves for different indices never interfere with each other', async () => {
    const d0 = deferred<unknown>();
    const d1 = deferred<unknown>();
    const put = vi.fn().mockReturnValueOnce(d0.promise).mockReturnValueOnce(d1.promise);
    const save = createOrientationSaver(put);

    save(0, 'hw-a', 90);
    save(1, 'hw-b', 180);

    expect(put).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenNthCalledWith(1, 0, 'hw-a', 90);
    expect(put).toHaveBeenNthCalledWith(2, 1, 'hw-b', 180);
    d0.resolve(undefined);
    d1.resolve(undefined);
  });
});

// NEH-300: `<model>_idx<N>` is what the backend reports when it could not
// read a body's serial. It names a USB position, so it must never stand in
// for a body the operator rotated.
describe('placeholder hardware ids (NEH-300)', () => {
  const placeholder = 'canoneos1500d_idx1';

  it('recognises the placeholder form and nothing else', () => {
    expect(isPlaceholderHardwareId(placeholder)).toBe(true);
    expect(isPlaceholderHardwareId('canoneos1500d_6eafa426b8e14c7b8c0614cd658a595a')).toBe(false);
    expect(isPlaceholderHardwareId('hw-a')).toBe(false);
  });

  it('counts a device list as complete only when every index the mode uses names its body', () => {
    const both = [device(), device({ index: 1, hardware_id: 'hw-b' })];
    expect(isDeviceListComplete([], 'single')).toBe(false);
    expect(isDeviceListComplete([device({ hardware_id: placeholder })], 'single')).toBe(false);
    expect(isDeviceListComplete([device({ index: 1, hardware_id: 'hw-b' })], 'double')).toBe(false);
    expect(isDeviceListComplete([device()], 'double')).toBe(false);
    expect(isDeviceListComplete([device()], 'single')).toBe(true);
    expect(isDeviceListComplete(both, 'double')).toBe(true);
    expect(isDeviceListComplete([both[0], device({ index: 1, hardware_id: placeholder })], 'double')).toBe(false);
  });

  it('does not let a rotation be saved, and so touched, under a placeholder id', () => {
    expect(canSaveRotation(undefined)).toBe(false);
    expect(canSaveRotation(device({ hardware_id: placeholder }))).toBe(false);
    expect(canSaveRotation(device({ hardware_id: 'hw-a' }))).toBe(true);
  });

  it('does not keep a rotation for another body that arrives under the same placeholder id', () => {
    const result = seedRotation(
      { 1: 180 },
      [device({ index: 1, hardware_id: placeholder, orientation: null })],
      new Map([[1, placeholder]])
    );
    expect(result.rotation).toEqual({ 1: DEFAULT_ROTATION });
    expect(result.touched.has(1)).toBe(false);
  });
});

describe('settlePendingRotations (NEH-300)', () => {
  it('keeps a pending rotation while the index has no identified body', () => {
    const pending = new Map([[0, 180], [1, 0]]);
    const result = settlePendingRotations(pending, [
      device({ index: 0, hardware_id: 'canoneos1500d_idx0', orientation: null })
    ]);
    expect(result.apply).toEqual([]);
    expect([...result.remaining]).toEqual([[0, 180], [1, 0]]);
  });

  it('applies it to the first identified body when that body has no saved orientation', () => {
    const result = settlePendingRotations(new Map([[0, 180]]), [
      device({ index: 0, hardware_id: 'hw-a', orientation: null })
    ]);
    expect(result.apply).toEqual([[0, 180]]);
    expect(result.remaining.size).toBe(0);
  });

  it('drops it when the first identified body already has a saved orientation', () => {
    const result = settlePendingRotations(new Map([[0, 180]]), [
      device({ index: 0, hardware_id: 'hw-a', orientation: 270 })
    ]);
    expect(result.apply).toEqual([]);
    expect(result.remaining.size).toBe(0);
  });

  it('never mutates the pending map it is given', () => {
    const pending = new Map([[0, 180]]);
    settlePendingRotations(pending, [device({ index: 0, hardware_id: 'hw-a', orientation: null })]);
    expect([...pending]).toEqual([[0, 180]]);
  });
});

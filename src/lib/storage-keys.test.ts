import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS, readStored, removeStored, writeStored } from './storage-keys';

const NEW = 'captua_activity_view';
const OLD = 'dtk_activity_view';

describe('storage-keys', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the new key when only it is present', () => {
    store[NEW] = 'reviews';
    expect(readStored(NEW)).toBe('reviews');
    expect(OLD in store).toBe(false);
  });

  it('copies the old value to the new key and keeps the old one', () => {
    store[OLD] = 'captures';
    expect(readStored(NEW)).toBe('captures');
    expect(store[NEW]).toBe('captures');
    expect(store[OLD]).toBe('captures');
  });

  it('prefers the new key when both are present', () => {
    store[NEW] = 'reviews';
    store[OLD] = 'captures';
    expect(readStored(NEW)).toBe('reviews');
    expect(store[OLD]).toBe('captures');
  });

  it('returns null when neither is present', () => {
    expect(readStored(NEW)).toBeNull();
    expect(Object.keys(store)).toEqual([]);
  });

  it('returns null when reading throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
      removeItem: () => { throw new Error('storage disabled'); }
    });
    expect(readStored(NEW)).toBeNull();
    expect(writeStored(NEW, 'x')).toBe(false);
    expect(() => removeStored(NEW)).not.toThrow();
  });

  it('still returns the old value when the copy cannot be written', () => {
    store[OLD] = 'captures';
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => {}
    });
    expect(readStored(NEW)).toBe('captures');
  });

  it('writes the new key only', () => {
    expect(writeStored(NEW, 'reviews')).toBe(true);
    expect(store).toEqual({ [NEW]: 'reviews' });
  });

  it('removes both names', () => {
    store[NEW] = 'a';
    store[OLD] = 'b';
    removeStored(NEW);
    expect(store).toEqual({});
  });

  it('derives the per-user tour key', () => {
    expect(STORAGE_KEYS.tourSeen(7)).toBe('captua_tour_visto:7');
    store['dtk_tour_visto:7'] = '2026-10-01T00:00:00Z';
    expect(readStored(STORAGE_KEYS.tourSeen(7))).toBe('2026-10-01T00:00:00Z');
  });
});

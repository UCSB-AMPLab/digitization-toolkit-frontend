// Browser storage under the `captua_` prefix. Releases before 0.1.0 used
// `dtk_`; code rolled back to one of them still reads those keys, so a value
// found only under the old name is copied across and the old entry stays.
// Writes go to the new name only.
//
// Version: 0.1.0-beta

const PREFIX = 'captua_';
const LEGACY_PREFIX = 'dtk_';

export const STORAGE_KEYS = {
  captureChord: `${PREFIX}capture_chord`,
  activityView: `${PREFIX}activity_view`,
  inProgressView: `${PREFIX}dashboard_in_progress_view`,
  tourSeen: (userId: number | string) => `${PREFIX}tour_visto:${userId}`
} as const;

function legacyName(key: string): string {
  return key.startsWith(PREFIX) ? LEGACY_PREFIX + key.slice(PREFIX.length) : key;
}

/**
 * Reads a `captua_` key. When it is absent and the `dtk_` one is present, the
 * value is copied to the new key and returned. Throws when storage cannot be
 * read, for a caller that must tell "nothing stored" from "storage broken".
 */
export function readStoredStrict(key: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyName(key));
  if (legacy === null) return null;
  try {
    localStorage.setItem(key, legacy);
  } catch {
    // Quota or private mode: the old value is still returned for this load.
  }
  return legacy;
}

/** As readStoredStrict, but a storage failure yields null. */
export function readStored(key: string): string | null {
  try {
    return readStoredStrict(key);
  } catch {
    return null;
  }
}

/** Writes the `captua_` key only. Returns false when storage refused. */
export function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes a key under both names, so that a cleared value is not carried back
 * from the old entry on the next read.
 */
export function removeStored(key: string): void {
  for (const name of [key, legacyName(key)]) {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing to clear when storage is unavailable.
    }
  }
}

// How full the drive that holds the projects root is, from GET /system/storage
// (`systemApi.getStorage()`). The backend reads the figures with
// `shutil.disk_usage` on the active projects root, so they describe the one
// filesystem where captures are written: the external drive when a storage
// override is active, the unit's own card otherwise.
//
// The reading is the Configuration page's: used over total (held in GiB),
// the percentage rounded and capped at 100, the alert from 85%. Every screen
// writes the figures with storageSize: decimal units, as formatBytes writes
// every size in the interface, so a disk reads the same everywhere. `used_bytes`
// counts allocated blocks and `free_bytes` only the blocks open to ordinary
// users, so the blocks a filesystem reserves for root are in neither; on such
// a drive the percentage stays a few points below 100 when it is full.
//
// The percentage counts the storage reserve (`reserve_bytes`, the space
// Captua keeps for its own work, CAPTUA_STORAGE_RESERVE_GB) as used, so it
// reads 100 when only the reserve is left: below it the backend refuses
// captures (507 `storage_reserve`). The "used / total" figures stay the
// real ones. An older backend that sends no reserve is read as reserve 0.
//
// Version: 0.3.0

import type { StorageInfo } from './api';
import { formatBytes } from './format-bytes';

/** Percent; the Configuration page applies the same threshold. */
export const STORAGE_ALERT_THRESHOLD = 85;

export interface StorageUsage {
	usedGB: number;
	totalGB: number;
	percent: number;
	alert: boolean;
	/** The space Captua keeps for its own work, in bytes; 0 when none is kept or the backend sends none. */
	reserveBytes: number;
}

const GIB = 1024 ** 3;

/**
 * The usage figures, or null when the answer carries none to trust: the
 * backend marks the root unavailable (it then sends zeros), or a figure is
 * missing, not a number, or impossible. A null shows no figures and no alert,
 * so the page never states a fill level it did not read.
 */
export function storageUsage(info: StorageInfo | null | undefined): StorageUsage | null {
	if (!info || info.available === false) return null;
	const { used_bytes: used, total_bytes: total } = info;
	if (typeof used !== 'number' || typeof total !== 'number') return null;
	if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0 || used < 0) return null;
	const reserve = info.reserve_bytes;
	const reserveBytes =
		typeof reserve === 'number' && Number.isFinite(reserve) && reserve > 0 ? reserve : 0;
	const percent = Math.min(100, Math.round(((used + reserveBytes) / total) * 100));
	return {
		usedGB: used / GIB,
		totalGB: total / GIB,
		percent,
		alert: percent >= STORAGE_ALERT_THRESHOLD,
		reserveBytes
	};
}

/** The reserve in whole GB of 10^9 bytes, as CAPTUA_STORAGE_RESERVE_GB states it. */
export function reserveGB(bytes: number): string {
	return String(Math.round(bytes / 10 ** 9));
}

/** A figure of StorageUsage (GiB) written as formatBytes writes sizes: "500 GB", "54,8 GB". */
export function storageSize(gib: number, locale: 'es' | 'en'): string {
	return formatBytes(gib * GIB, locale);
}

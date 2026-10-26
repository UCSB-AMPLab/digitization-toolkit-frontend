// How full the drive that holds the projects root is, from GET /system/storage
// (`systemApi.getStorage()`). The backend reads the figures with
// `shutil.disk_usage` on the active projects root, so they describe the one
// filesystem where captures are written: the external drive when a storage
// override is active, the unit's own card otherwise.
//
// The reading is the Configuration page's: used over total, in binary GB, the
// percentage rounded and capped at 100, the alert from 85%. `used_bytes`
// counts allocated blocks and `free_bytes` only the blocks open to ordinary
// users, so the blocks a filesystem reserves for root are in neither; on such
// a drive the percentage stays a few points below 100 when it is full.
//
// Version: 0.1.0-beta

import type { StorageInfo } from './api';

/** Percent; the Configuration page applies the same threshold. */
export const STORAGE_ALERT_THRESHOLD = 85;

export interface StorageUsage {
	usedGB: number;
	totalGB: number;
	percent: number;
	alert: boolean;
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
	const percent = Math.min(100, Math.round((used / total) * 100));
	return {
		usedGB: used / GIB,
		totalGB: total / GIB,
		percent,
		alert: percent >= STORAGE_ALERT_THRESHOLD
	};
}

/** A size in GB as the storage rows show it: "512 GB", or "1.2 TB" from 1000 GB. */
export function formatStorage(gb: number): string {
	if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
	return `${gb.toFixed(0)} GB`;
}

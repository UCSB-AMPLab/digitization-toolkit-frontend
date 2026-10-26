// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { formatStorage, storageUsage, STORAGE_ALERT_THRESHOLD } from './storage-usage';
import type { StorageInfo } from './api';

const GIB = 1024 ** 3;

function info(usedGB: number, totalGB: number, extra: Partial<StorageInfo> = {}): StorageInfo {
	return {
		projects_path: '/data/projects',
		is_override: false,
		total_bytes: totalGB * GIB,
		used_bytes: usedGB * GIB,
		free_bytes: (totalGB - usedGB) * GIB,
		available: true,
		...extra
	};
}

describe('storageUsage', () => {
	it('alerts at the threshold', () => {
		expect(STORAGE_ALERT_THRESHOLD).toBe(85);
		expect(storageUsage(info(85, 100))).toEqual({ usedGB: 85, totalGB: 100, percent: 85, alert: true });
	});

	it('does not alert below it', () => {
		expect(storageUsage(info(84, 100))).toMatchObject({ percent: 84, alert: false });
	});

	it('caps the percentage at 100', () => {
		expect(storageUsage(info(120, 100))).toMatchObject({ percent: 100, alert: true });
	});

	it('gives no figures for an unavailable root', () => {
		expect(storageUsage(info(0, 0, { available: false }))).toBeNull();
		expect(storageUsage(info(90, 100, { available: false }))).toBeNull();
	});

	it('gives no figures for a missing, zero or impossible total', () => {
		expect(storageUsage(null)).toBeNull();
		expect(storageUsage(undefined)).toBeNull();
		expect(storageUsage(info(0, 0))).toBeNull();
		expect(storageUsage({ ...info(10, 100), total_bytes: undefined as unknown as number })).toBeNull();
		expect(storageUsage({ ...info(10, 100), used_bytes: Number.NaN })).toBeNull();
		expect(storageUsage({ ...info(10, 100), used_bytes: -1 })).toBeNull();
	});
});

describe('formatStorage', () => {
	it('writes GB below 1000 and TB from it', () => {
		expect(formatStorage(512)).toBe('512 GB');
		expect(formatStorage(1228.8)).toBe('1.2 TB');
	});
});

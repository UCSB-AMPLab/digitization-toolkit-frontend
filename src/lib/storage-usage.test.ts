// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { formatStorage, reserveGB, storageUsage, STORAGE_ALERT_THRESHOLD } from './storage-usage';
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
		expect(storageUsage(info(85, 100))).toEqual({
			usedGB: 85,
			totalGB: 100,
			percent: 85,
			alert: true,
			reserveBytes: 0
		});
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
		expect(
			storageUsage({ ...info(10, 100), total_bytes: undefined as unknown as number })
		).toBeNull();
		expect(storageUsage({ ...info(10, 100), used_bytes: Number.NaN })).toBeNull();
		expect(storageUsage({ ...info(10, 100), used_bytes: -1 })).toBeNull();
	});
});

describe('storageUsage with the storage reserve (NEH-380)', () => {
	const GB = 10 ** 9;

	it('counts the reserve as used in the percentage, and keeps the real used figure', () => {
		const u = storageUsage(info(50, 100, { reserve_bytes: 2 * GB }));
		expect(u).toEqual({
			usedGB: 50,
			totalGB: 100,
			percent: Math.round(((50 * GIB + 2 * GB) / (100 * GIB)) * 100),
			alert: false,
			reserveBytes: 2 * GB
		});
		expect(u?.percent).toBe(52);
	});

	it('reads 100 when only the reserve is left', () => {
		const total = 100 * GIB;
		const u = storageUsage({
			...info(0, 100),
			used_bytes: total - 2 * GB,
			free_bytes: 2 * GB,
			reserve_bytes: 2 * GB
		});
		expect(u).toMatchObject({ percent: 100, alert: true });
	});

	it('alerts at the threshold with the reserve counted', () => {
		const u = storageUsage({
			...info(0, 100),
			used_bytes: 85 * GIB - 2 * GB,
			reserve_bytes: 2 * GB
		});
		expect(u).toMatchObject({ percent: 85, alert: true });
		expect(STORAGE_ALERT_THRESHOLD).toBe(85);
	});

	it('takes an older backend that sends no reserve as reserve 0', () => {
		const u = storageUsage(info(84, 100));
		expect(u).toMatchObject({ percent: 84, alert: false, reserveBytes: 0 });
	});

	it('takes a reserve that is not a number, or below 0, as 0', () => {
		expect(storageUsage(info(84, 100, { reserve_bytes: Number.NaN }))).toMatchObject({
			percent: 84,
			reserveBytes: 0
		});
		expect(storageUsage(info(84, 100, { reserve_bytes: -5 }))).toMatchObject({
			percent: 84,
			reserveBytes: 0
		});
	});
});

describe('reserveGB', () => {
	it('gives the reserve in whole GB of 10^9 bytes, as the setting has it', () => {
		expect(reserveGB(2 * 10 ** 9)).toBe('2');
		expect(reserveGB(10 * 10 ** 9)).toBe('10');
	});
});

describe('formatStorage', () => {
	it('writes GB below 1000 and TB from it', () => {
		expect(formatStorage(512)).toBe('512 GB');
		expect(formatStorage(1228.8)).toBe('1.2 TB');
	});
});

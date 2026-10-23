// Levels of the offsite catalogue copy (NEH-266), the day wording, and the
// polling schedule.
//
// A zone that is not UTC, so that the day boundaries for "hoy" / "ayer" are
// local and not UTC ones. Node applies a TZ change made at runtime; nothing
// here builds a Date before it.
process.env.TZ = 'America/Bogota';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	classifyBackup,
	dayRelation,
	formatBackupDate,
	startPolling,
	CURRENT_MAX_AGE_MS,
	LATE_MAX_AGE_MS,
	POLL_INTERVAL_MS,
	type CatalogueBackupStatus
} from './catalogue-backup';

const HOUR = 60 * 60 * 1000;
const SECOND = 1000;
const NOW = new Date('2026-10-22T17:00:00Z');

function status(ageMs: number | null, enabled = true): CatalogueBackupStatus {
	return {
		enabled,
		last_verified_at: ageMs === null ? null : new Date(NOW.getTime() - ageMs).toISOString(),
		object: 'catalogue-2026-10-22.sql.gz',
		detail: null
	};
}

describe('classifyBackup', () => {
	it('uses 36 h and 72 h as the thresholds', () => {
		expect(CURRENT_MAX_AGE_MS).toBe(36 * HOUR);
		expect(LATE_MAX_AGE_MS).toBe(72 * HOUR);
	});

	it('is current at exactly 36 h', () => {
		expect(classifyBackup(status(36 * HOUR), NOW).level).toBe('current');
	});

	it('is late at 36 h + 1 s', () => {
		expect(classifyBackup(status(36 * HOUR + SECOND), NOW).level).toBe('late');
	});

	it('is late at exactly 72 h', () => {
		expect(classifyBackup(status(72 * HOUR), NOW).level).toBe('late');
	});

	it('is overdue at 72 h + 1 s', () => {
		expect(classifyBackup(status(72 * HOUR + SECOND), NOW).level).toBe('overdue');
	});

	it('is overdue, with no date, when no copy has ever been verified', () => {
		expect(classifyBackup(status(null), NOW)).toEqual({ level: 'overdue', verifiedAt: null });
	});

	it('is off when the offsite copy is not configured, whatever the timestamp', () => {
		expect(classifyBackup(status(null, false), NOW).level).toBe('off');
		expect(classifyBackup(status(HOUR, false), NOW).level).toBe('off');
		expect(classifyBackup(status(100 * HOUR, false), NOW).level).toBe('off');
	});

	it('treats a timestamp in the future (clock skew) as current', () => {
		expect(classifyBackup(status(-10 * 60 * SECOND), NOW).level).toBe('current');
	});

	it('reads a naive timestamp as UTC, as the API sends them', () => {
		const s = { ...status(null), last_verified_at: '2026-10-21T05:00:00' }; // 36 h before NOW
		const r = classifyBackup(s, NOW);
		expect(r.level).toBe('current');
		expect(r.verifiedAt?.toISOString()).toBe('2026-10-21T05:00:00.000Z');
	});

	it('accepts now as a number of milliseconds', () => {
		expect(classifyBackup(status(37 * HOUR), NOW.getTime()).level).toBe('late');
	});

	it('is unknown for an answer it cannot read, never one of the four', () => {
		expect(classifyBackup({ ...status(HOUR), last_verified_at: 'not a date' }, NOW).level).toBe('unknown');
		expect(classifyBackup({ ...status(HOUR), enabled: 'yes' as unknown as boolean }, NOW).level).toBe('unknown');
		expect(classifyBackup(null as unknown as CatalogueBackupStatus, NOW).level).toBe('unknown');
	});
});

describe('dayRelation (local calendar days)', () => {
	// NOW is 12:00 on 22 October in Bogotá (UTC−5).
	it('is today from local midnight on', () => {
		expect(dayRelation(new Date(2026, 9, 22, 0, 0, 0), NOW)).toBe('today');
	});

	it('is yesterday one second before local midnight, though only 12 h earlier', () => {
		expect(dayRelation(new Date(2026, 9, 21, 23, 59, 59), NOW)).toBe('yesterday');
	});

	it('is yesterday from the start of the previous local day', () => {
		expect(dayRelation(new Date(2026, 9, 21, 0, 0, 0), NOW)).toBe('yesterday');
	});

	it('is earlier before that, even when under 36 h old', () => {
		// 30 h before 00:30 on the 22nd is 18:30 on the 20th.
		const justAfterMidnight = new Date(2026, 9, 22, 0, 30);
		expect(dayRelation(new Date(2026, 9, 20, 18, 30), justAfterMidnight)).toBe('earlier');
	});

	it('uses the local day, not the UTC one', () => {
		// 03:00 UTC on the 22nd is 22:00 on the 21st in Bogotá.
		expect(dayRelation(new Date('2026-10-22T03:00:00Z'), NOW)).toBe('yesterday');
	});

	it('is today for a timestamp after today (clock skew)', () => {
		expect(dayRelation(new Date(2026, 9, 23, 1, 0), NOW)).toBe('today');
	});
});

describe('formatBackupDate', () => {
	it('leaves out the year when it is this year', () => {
		expect(formatBackupDate(new Date(2026, 9, 20, 12), NOW, 'es')).toBe('20 de octubre');
		expect(formatBackupDate(new Date(2026, 9, 20, 12), NOW, 'en')).toBe('October 20');
	});

	it('includes the year when it is another year', () => {
		expect(formatBackupDate(new Date(2025, 11, 30, 12), NOW, 'es')).toBe('30 de diciembre de 2025');
	});
});

describe('startPolling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('fetches at once, then once per interval after each answer', async () => {
		const fetcher = vi.fn().mockResolvedValue(status(HOUR));
		const onResult = vi.fn();
		const stop = startPolling(fetcher, onResult);

		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenLastCalledWith({ ok: true, status: status(HOUR) });

		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
		expect(fetcher).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(fetcher).toHaveBeenCalledTimes(2);
		stop();
	});

	it('reports a failure and waits the same interval before trying again', async () => {
		const error = new Error('502');
		const fetcher = vi.fn().mockRejectedValue(error);
		const onResult = vi.fn();
		const stop = startPolling(fetcher, onResult);

		await vi.advanceTimersByTimeAsync(0);
		expect(onResult).toHaveBeenLastCalledWith({ ok: false, error });
		await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
		expect(fetcher).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(fetcher).toHaveBeenCalledTimes(2);
		stop();
	});

	it('stops for good when shouldStop says so (session gone)', async () => {
		const fetcher = vi.fn().mockRejectedValue(new Error('401'));
		const onResult = vi.fn();
		startPolling(fetcher, onResult, POLL_INTERVAL_MS, () => true);

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MS);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(onResult).toHaveBeenCalledTimes(1);
	});

	it('sends nothing more, and reports nothing late, once stopped', async () => {
		let resolve!: (s: CatalogueBackupStatus) => void;
		const fetcher = vi.fn(() => new Promise<CatalogueBackupStatus>((r) => (resolve = r)));
		const onResult = vi.fn();
		const stop = startPolling(fetcher, onResult);

		stop();
		resolve(status(HOUR));
		await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MS);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(onResult).not.toHaveBeenCalled();
	});

	it('never has two requests in flight', async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const fetcher = vi.fn(async () => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((r) => setTimeout(r, 2 * POLL_INTERVAL_MS));
			inFlight--;
			return status(HOUR);
		});
		const stop = startPolling(fetcher, vi.fn());

		await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MS);
		expect(maxInFlight).toBe(1);
		stop();
	});
});

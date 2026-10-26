// The activity calendar under named time zones: the zone the client sends to
// GET /activity/daily, and grid keys that stay on their calendar dates across
// daylight-saving changes whatever zone the code runs in. Each test sets
// process.env.TZ itself, which Node applies to Date and Intl at once.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { activityApi, browserTimeZone, type DailyActivity } from './api';
import { buildGrid, WEEKS } from './activity-calendar';

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
	vi.restoreAllMocks();
	if (ORIGINAL_TZ === undefined) delete process.env.TZ;
	else process.env.TZ = ORIGINAL_TZ;
});

/** `days` consecutive calendar dates ending on `end`, built without any local offset. */
function series(end: string, days: number): DailyActivity[] {
	const [y, m, d] = end.split('-').map(Number);
	return Array.from({ length: days }, (_, i) => {
		const t = new Date(Date.UTC(y, m - 1, d - (days - 1 - i)));
		const date = t.toISOString().slice(0, 10);
		return { date, captured_images: i, reviewed_records: 0 };
	});
}

function respondEmpty() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
	);
}

describe('activityApi.daily sends the zone', () => {
	it('sends the IANA zone and the offset by default', async () => {
		process.env.TZ = 'America/Los_Angeles';
		expect(browserTimeZone()).toBe('America/Los_Angeles');
		const fetchSpy = respondEmpty();
		await activityApi.daily(182);
		const url = new URL(String(fetchSpy.mock.calls[0][0]), 'http://x');
		expect(url.pathname).toMatch(/\/activity\/daily$/);
		expect(url.searchParams.get('days')).toBe('182');
		expect(url.searchParams.get('tz')).toBe('America/Los_Angeles');
		expect(url.searchParams.get('tz_offset_minutes')).toBe(String(new Date().getTimezoneOffset()));
	});

	it('sends the zone it is given, escaped', async () => {
		const fetchSpy = respondEmpty();
		await activityApi.daily(7, 'America/Bogota', 300);
		expect(String(fetchSpy.mock.calls[0][0])).toMatch(
			/\/activity\/daily\?days=7&tz=America%2FBogota&tz_offset_minutes=300$/
		);
	});

	it('sends only the offset when no zone is known', async () => {
		const fetchSpy = respondEmpty();
		await activityApi.daily(7, null, 300);
		expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/activity\/daily\?days=7&tz_offset_minutes=300$/);
	});

	it('reports no zone when Intl throws', () => {
		vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
			throw new Error('no Intl');
		});
		expect(browserTimeZone()).toBeNull();
	});
});

// Each window ends a couple of days after a change: Los Angeles back on
// 2026-11-01 and forward on 2026-03-08; Santiago forward at midnight on
// 2026-09-06, so that local midnight does not exist; Bogota has no change.
const WINDOWS = [
	{ end: '2026-11-03', change: '2026-11-01' },
	{ end: '2026-03-10', change: '2026-03-08' },
	{ end: '2026-09-08', change: '2026-09-06' }
];
const ZONES = ['UTC', 'America/Los_Angeles', 'America/Bogota', 'America/Santiago', 'Pacific/Kiritimati'];

describe('buildGrid keys across DST changes in a fixed zone', () => {
	for (const { end, change } of WINDOWS) {
		for (const zone of ZONES) {
			it(`keeps every date from the series, Monday-first, ending ${end} in ${zone}`, () => {
				process.env.TZ = zone;
				const input = series(end, 182);
				const grid = buildGrid(input, 'captured_images');

				const dates = grid.days.map((d) => d.date);
				// The shown days are the tail of the series, unchanged and in order.
				expect(dates).toEqual(input.slice(input.length - dates.length).map((s) => s.date));
				expect(dates).toContain(change);
				expect(dates[dates.length - 1]).toBe(end);
				expect(grid.weeks).toHaveLength(WEEKS);
				for (const week of grid.weeks) {
					const monday = week[0];
					expect(monday && new Date(`${monday.date}T00:00:00Z`).getUTCDay()).toBe(1);
				}
				// Counts stay with their own dates.
				const byDate = Object.fromEntries(input.map((s) => [s.date, s.captured_images]));
				expect(grid.days.every((d) => d.count === byDate[d.date])).toBe(true);
			});
		}

		it(`builds the same grid in every zone for the window ending ${end}`, () => {
			const grids = ZONES.map((zone) => {
				process.env.TZ = zone;
				return buildGrid(series(end, 182), 'captured_images');
			});
			for (const g of grids.slice(1)) expect(g).toEqual(grids[0]);
		});
	}
});

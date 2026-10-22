import { describe, it, expect } from 'vitest';

// The DST fixture below only fails under millisecond day arithmetic in a
// timezone that observes DST, so the file pins one.
process.env.TZ = 'America/Los_Angeles';

import { buildGrid, levelFor, moveFocus, parseLocalDate, WEEKS } from './activity-calendar';
import type { DailyActivity } from './api';

/** `days` consecutive local dates ending on `end` (YYYY-MM-DD), counts from `count(i)`. */
function series(end: string, days: number, count: (i: number) => number, reviews = (i: number) => 0): DailyActivity[] {
	const last = parseLocalDate(end);
	return Array.from({ length: days }, (_, i) => {
		const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() - (days - 1 - i));
		const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		return { date, captured_images: count(i), reviewed_records: reviews(i) };
	});
}

// 2026-10-22 is a Thursday. Its week starts on Monday 2026-10-19, and the
// 26th week back starts on Monday 2026-04-27, 179 days before the end.
const END = '2026-10-22';

describe('parseLocalDate', () => {
	it('reads a plain date as a local calendar day', () => {
		const d = parseLocalDate('2026-10-22');
		expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 22]);
		expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
	});
});

describe('levelFor', () => {
	it('is 0 only for a count of 0 and spans 1..4 relative to the maximum', () => {
		expect(levelFor(0, 100)).toBe(0);
		expect(levelFor(1, 100)).toBe(1);
		expect(levelFor(25, 100)).toBe(1);
		expect(levelFor(26, 100)).toBe(2);
		expect(levelFor(50, 100)).toBe(2);
		expect(levelFor(75, 100)).toBe(3);
		expect(levelFor(76, 100)).toBe(4);
		expect(levelFor(100, 100)).toBe(4);
	});
	it('is 0 when every count is 0', () => {
		expect(levelFor(0, 0)).toBe(0);
	});
});

describe('buildGrid', () => {
	const grid = buildGrid(series(END, 182, (i) => i), 'captured_images');

	it('lays 182 days out as 26 Monday-first weeks of 7', () => {
		expect(grid.weeks).toHaveLength(WEEKS);
		expect(grid.weeks.every((w) => w.length === 7)).toBe(true);
		expect(grid.weeks[0][0]?.date).toBe('2026-04-27');
		expect(grid.weeks[WEEKS - 1][0]?.date).toBe('2026-10-19');
		expect(grid.weeks[WEEKS - 1][3]?.date).toBe('2026-10-22');
	});

	it('leaves the days after the last one empty and drops the days before the first Monday', () => {
		expect(grid.weeks[WEEKS - 1].slice(4)).toEqual([null, null, null]);
		expect(grid.days).toHaveLength(179);
		expect(grid.days[0].date).toBe('2026-04-27');
		expect(grid.days[178].date).toBe(END);
	});

	it('totals only the days shown', () => {
		// Counts are the series index; the shown days are indexes 3..181.
		expect(grid.total).toBe(Array.from({ length: 179 }, (_, i) => i + 3).reduce((a, b) => a + b, 0));
		expect(grid.activeDays).toBe(179);
	});

	it('labels the month at the first column of each month', () => {
		const names = grid.months.map((m) => m.month);
		expect(names).toEqual([...names].sort((a, b) => ((a + 9) % 12) - ((b + 9) % 12)));
		expect(grid.months[grid.months.length - 1]).toMatchObject({ month: 9, year: 2026 });
		for (let i = 1; i < grid.months.length; i++) {
			expect(grid.months[i].column - grid.months[i - 1].column).toBeGreaterThanOrEqual(3);
		}
	});

	it('starts the labels at the column holding the first day of May', () => {
		// 2026-05-01 is a Friday in the week of Monday 2026-04-27, which is column 0:
		// the week is April's by its Monday, so May's label sits on the next column.
		const may = grid.months.find((m) => m.month === 4);
		expect(may?.column).toBe(1);
	});

	it('buckets levels by the busiest day', () => {
		const g = buildGrid(series(END, 182, (i) => (i === 100 ? 100 : i === 101 ? 30 : i === 102 ? 1 : 0)), 'captured_images');
		const byDate = Object.fromEntries(g.days.map((d) => [d.date, d.level]));
		const s = series(END, 182, () => 0);
		expect(byDate[s[100].date]).toBe(4);
		expect(byDate[s[101].date]).toBe(2);
		expect(byDate[s[102].date]).toBe(1);
		expect(byDate[s[103].date]).toBe(0);
	});

	it('gives level 0 everywhere and zero figures for all-zero data', () => {
		const g = buildGrid(series(END, 182, () => 0), 'captured_images');
		expect(g.days.every((d) => d.level === 0)).toBe(true);
		expect(g.activeDays).toBe(0);
		expect(g.total).toBe(0);
	});

	it('reads the other series for the reviews metric', () => {
		const g = buildGrid(series(END, 182, () => 5, (i) => (i === 181 ? 7 : 0)), 'reviewed_records');
		expect(g.total).toBe(7);
		expect(g.activeDays).toBe(1);
		expect(g.days[g.days.length - 1].level).toBe(4);
	});

	it('handles a series shorter than the window, with leading empty slots', () => {
		const g = buildGrid(series(END, 10, () => 1), 'captured_images'); // Tue 2026-10-13 .. Thu 10-22
		expect(g.days).toHaveLength(10);
		expect(g.weeks).toHaveLength(2);
		expect(g.weeks[0][0]).toBeNull();
		expect(g.weeks[0][1]?.date).toBe('2026-10-13');
	});

	it('returns an empty grid for an empty series', () => {
		expect(buildGrid([], 'captured_images')).toMatchObject({ days: [], weeks: [], total: 0 });
	});
});

describe('buildGrid across a DST change', () => {
	// US clocks go back on 2026-11-01; 2026-11-03 is a Tuesday.
	const grid = buildGrid(series('2026-11-03', 182, (i) => i), 'captured_images');

	it('keeps every day once, in order, with Mondays in the first row', () => {
		// 2026-05-11 .. 2026-11-03
		expect(grid.days).toHaveLength(177);
		expect(grid.weeks).toHaveLength(WEEKS);
		expect(grid.weeks[0][0]?.date).toBe('2026-05-11');
		for (const week of grid.weeks) {
			const monday = week[0];
			expect(monday && parseLocalDate(monday.date).getDay()).toBe(1);
		}
		const dates = grid.days.map((d) => d.date);
		expect(new Set(dates).size).toBe(dates.length);
		expect(dates).toContain('2026-11-01');
		expect(dates[dates.length - 1]).toBe('2026-11-03');
	});
});

describe('moveFocus', () => {
	it('moves by day with up/down and by week with left/right', () => {
		expect(moveFocus(50, 'ArrowDown', 100)).toBe(51);
		expect(moveFocus(50, 'ArrowUp', 100)).toBe(49);
		expect(moveFocus(50, 'ArrowRight', 100)).toBe(57);
		expect(moveFocus(50, 'ArrowLeft', 100)).toBe(43);
	});
	it('jumps to the first and last day with Home and End', () => {
		expect(moveFocus(50, 'Home', 100)).toBe(0);
		expect(moveFocus(50, 'End', 100)).toBe(99);
	});
	it('does not wrap from Sunday down or Monday up into the next or previous week', () => {
		// With day 0 on a Monday, index 6 is a Sunday and index 7 the next Monday.
		expect(moveFocus(6, 'ArrowDown', 100)).toBe(6);
		expect(moveFocus(7, 'ArrowUp', 100)).toBe(7);
		expect(moveFocus(5, 'ArrowDown', 100)).toBe(6);
		expect(moveFocus(8, 'ArrowUp', 100)).toBe(7);
		// With day 0 on a Wednesday (lead 2), index 4 is a Sunday and index 5 a Monday.
		expect(moveFocus(4, 'ArrowDown', 100, 2)).toBe(4);
		expect(moveFocus(5, 'ArrowUp', 100, 2)).toBe(5);
	});
	it('stays put at the edges', () => {
		expect(moveFocus(0, 'ArrowUp', 100)).toBe(0);
		expect(moveFocus(99, 'ArrowDown', 100)).toBe(99);
		expect(moveFocus(3, 'ArrowLeft', 100)).toBe(3);
		expect(moveFocus(95, 'ArrowRight', 100)).toBe(95);
	});
});

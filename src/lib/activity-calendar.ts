// Grid construction for the dashboard's activity calendar: a series of local
// calendar days (GET /activity/daily) becomes WEEKS columns of Monday-first
// weeks, with month labels and an intensity level per day.

import type { DailyActivity } from './api';

export const WEEKS = 26;
export type CalendarMetric = 'captured_images' | 'reviewed_records';
export type Level = 0 | 1 | 2 | 3 | 4;

export interface CalendarDay {
	date: string; // YYYY-MM-DD
	count: number;
	level: Level;
}

export interface MonthLabel {
	column: number; // 0-based week column
	year: number;
	month: number; // 0-11
}

export interface CalendarGrid {
	/** Visible days, oldest first (the focus order). */
	days: CalendarDay[];
	/** Week columns, each 7 slots Monday..Sunday; null past the last day. */
	weeks: (CalendarDay | null)[][];
	months: MonthLabel[];
	activeDays: number;
	total: number;
}

/** Parses YYYY-MM-DD as a local calendar date, not as a UTC instant. */
export function parseLocalDate(value: string): Date {
	const [y, m, d] = value.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** 0 = Monday ... 6 = Sunday. */
function mondayIndex(d: Date): number {
	return (d.getDay() + 6) % 7;
}

/** Intensity relative to the busiest day: 0 only for a count of 0. */
export function levelFor(count: number, max: number): Level {
	if (count <= 0 || max <= 0) return 0;
	return Math.min(4, Math.max(1, Math.ceil((4 * count) / max))) as Level;
}

/**
 * Lays the series out as the last WEEKS weeks ending with the week of the
 * final day. Days before the first Monday of that range are left out, and
 * the totals cover only the days that are shown.
 */
export function buildGrid(series: DailyActivity[], metric: CalendarMetric): CalendarGrid {
	if (series.length === 0) return { days: [], weeks: [], months: [], activeDays: 0, total: 0 };

	const last = parseLocalDate(series[series.length - 1].date);
	const start = new Date(last.getFullYear(), last.getMonth(), last.getDate() - mondayIndex(last) - 7 * (WEEKS - 1));
	const key = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	const visible = series.filter((s) => s.date >= key(start));
	const max = Math.max(0, ...visible.map((s) => s[metric]));
	const days: CalendarDay[] = visible.map((s) => ({
		date: s.date,
		count: s[metric],
		level: levelFor(s[metric], max)
	}));

	// Fewer than WEEKS weeks of data: the first column starts at the first
	// day's Monday, with leading slots empty.
	const first = parseLocalDate(days[0].date);
	const lead = mondayIndex(first);
	const slots: (CalendarDay | null)[] = [...Array(lead).fill(null), ...days];
	while (slots.length % 7 !== 0) slots.push(null);
	const weeks: (CalendarDay | null)[][] = [];
	for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

	const months: MonthLabel[] = [];
	weeks.forEach((week, column) => {
		const ref = week.find((d) => d !== null);
		if (!ref) return;
		const date = parseLocalDate(ref.date);
		const prev = months[months.length - 1];
		if (!prev || prev.month !== date.getMonth() || prev.year !== date.getFullYear()) {
			months.push({ column, year: date.getFullYear(), month: date.getMonth() });
		}
	});
	// A label for a month that lasts one or two columns would run into the next.
	const spaced = months.filter((mo, i) => i === months.length - 1 || months[i + 1].column - mo.column >= 3);

	return {
		days,
		weeks,
		months: spaced,
		activeDays: days.filter((d) => d.count > 0).length,
		total: days.reduce((sum, d) => sum + d.count, 0)
	};
}

/** Index of the day reached from `index` by a key, or `index` when the move leaves the map. */
export function moveFocus(index: number, key: string, count: number): number {
	const target =
		key === 'ArrowUp' ? index - 1
		: key === 'ArrowDown' ? index + 1
		: key === 'ArrowLeft' ? index - 7
		: key === 'ArrowRight' ? index + 7
		: key === 'Home' ? 0
		: key === 'End' ? count - 1
		: index;
	return target < 0 || target >= count ? index : target;
}

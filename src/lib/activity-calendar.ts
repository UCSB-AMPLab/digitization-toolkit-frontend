// Grid construction for the dashboard's activity calendar: a series of local
// calendar days (GET /activity/daily) becomes WEEKS columns of Monday-first
// weeks, with month labels and an intensity level per day.
//
// The series' dates are calendar days in the browser's IANA zone, as the
// backend counted them. The grid's own date arithmetic (the window's first
// Monday, weekdays, months) is done on those calendar dates as UTC midnights,
// so no local offset or daylight-saving change can move a key by a day,
// whatever zone the code runs in.

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

/** YYYY-MM-DD as UTC midnight of that calendar day, for date arithmetic. */
function utcDay(value: string): Date {
	const [y, m, d] = value.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

/** The YYYY-MM-DD key of a UTC-midnight calendar day. */
function dayKey(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 0 = Monday ... 6 = Sunday, of a UTC-midnight calendar day. */
function mondayIndex(d: Date): number {
	return (d.getUTCDay() + 6) % 7;
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

	const last = utcDay(series[series.length - 1].date);
	const start = new Date(Date.UTC(
		last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - mondayIndex(last) - 7 * (WEEKS - 1)
	));

	const visible = series.filter((s) => s.date >= dayKey(start));
	const max = Math.max(0, ...visible.map((s) => s[metric]));
	const days: CalendarDay[] = visible.map((s) => ({
		date: s.date,
		count: s[metric],
		level: levelFor(s[metric], max)
	}));

	// Fewer than WEEKS weeks of data: the first column starts at the first
	// day's Monday, with leading slots empty.
	const lead = mondayIndex(utcDay(days[0].date));
	const slots: (CalendarDay | null)[] = [...Array(lead).fill(null), ...days];
	while (slots.length % 7 !== 0) slots.push(null);
	const weeks: (CalendarDay | null)[][] = [];
	for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

	const months: MonthLabel[] = [];
	weeks.forEach((week, column) => {
		const ref = week.find((d) => d !== null);
		if (!ref) return;
		const date = utcDay(ref.date);
		const prev = months[months.length - 1];
		if (!prev || prev.month !== date.getUTCMonth() || prev.year !== date.getUTCFullYear()) {
			months.push({ column, year: date.getUTCFullYear(), month: date.getUTCMonth() });
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

/**
 * Index of the day reached from `index` by a key, or `index` when the move
 * leaves the map. `lead` is the weekday row (0 = Monday) of day 0; up and down
 * stay inside the week column, so ArrowUp on a Monday and ArrowDown on a
 * Sunday do nothing.
 */
export function moveFocus(index: number, key: string, count: number, lead = 0): number {
	const row = (lead + index) % 7;
	const target =
		key === 'ArrowUp' ? (row === 0 ? index : index - 1)
		: key === 'ArrowDown' ? (row === 6 ? index : index + 1)
		: key === 'ArrowLeft' ? index - 7
		: key === 'ArrowRight' ? index + 7
		: key === 'Home' ? 0
		: key === 'End' ? count - 1
		: index;
	return target < 0 || target >= count ? index : target;
}

// The pipeline board's placement rule, the stacked-bar segments, grouping
// and the naive-UTC date parsing the board relies on.
//
// Run in a zone that is not UTC, so that reading a naive string as local time
// would give a different instant and the parseApiDate tests could fail. Node
// applies a TZ change made at runtime; nothing here builds a Date before it.
//
// Version: 0.1.0-beta
process.env.TZ = 'America/Bogota';

import { describe, it, expect } from 'vitest';
import { placeVolume, barSegments, groupByStage, parseApiDate } from './pipeline';
import type { CollectionActivity, StatusCounts } from './api';

function counts(c: Partial<StatusCounts> = {}): StatusCounts {
	return { captured: 0, in_review: 0, rejected: 0, approved: 0, ...c };
}

function row(id: number, c: Partial<StatusCounts>, at: string | null = null): CollectionActivity {
	const sc = counts(c);
	return {
		collection_id: id,
		status_counts: sc,
		record_count: sc.captured + sc.in_review + sc.rejected + sc.approved,
		last_status_change_at: at
	};
}

describe('placeVolume', () => {
	it('puts a volume with any captured record in capture', () => {
		expect(placeVolume(counts({ captured: 1 }))).toBe('capture');
	});

	it('keeps a mostly finished volume in capture while one record is captured', () => {
		expect(placeVolume(counts({ captured: 1, rejected: 2, in_review: 3, approved: 40 }))).toBe('capture');
	});

	it('puts a volume with rejected records and nothing captured in recapture', () => {
		expect(placeVolume(counts({ rejected: 1 }))).toBe('recapture');
		expect(placeVolume(counts({ rejected: 1, in_review: 5, approved: 30 }))).toBe('recapture');
	});

	it('puts a volume with records in review, none captured or rejected, in review', () => {
		expect(placeVolume(counts({ in_review: 1 }))).toBe('review');
		expect(placeVolume(counts({ in_review: 9, approved: 11 }))).toBe('review');
	});

	it('puts a volume whose every record is approved in approved', () => {
		expect(placeVolume(counts({ approved: 1 }))).toBe('approved');
		expect(placeVolume(counts({ approved: 51 }))).toBe('approved');
	});

	it('puts a volume with no records in capture', () => {
		expect(placeVolume(counts())).toBe('capture');
	});
});

describe('barSegments', () => {
	it('returns no segments for an empty volume', () => {
		expect(barSegments(counts())).toEqual([]);
	});

	it('returns the non-empty statuses in captured, rejected, in_review, approved order', () => {
		const segs = barSegments(counts({ approved: 7, captured: 1, in_review: 2 }));
		expect(segs.map((s) => s.status)).toEqual(['captured', 'in_review', 'approved']);
		expect(segs.map((s) => s.count)).toEqual([1, 2, 7]);
		expect(segs.map((s) => s.percent)).toEqual([10, 20, 70]);
	});

	it('puts rejected before in_review when both are present', () => {
		const segs = barSegments(counts({ in_review: 1, rejected: 1, captured: 1, approved: 1 }));
		expect(segs.map((s) => s.status)).toEqual(['captured', 'rejected', 'in_review', 'approved']);
		expect(segs.map((s) => s.percent)).toEqual([25, 25, 25, 25]);
	});

	it('gives a single status the whole bar', () => {
		expect(barSegments(counts({ rejected: 3 }))).toEqual([{ status: 'rejected', count: 3, percent: 100 }]);
	});
});

describe('groupByStage', () => {
	it('returns every stage, empty ones included', () => {
		const g = groupByStage([row(1, { approved: 2 })]);
		expect(Object.keys(g)).toEqual(['capture', 'recapture', 'review', 'approved']);
		expect(g.capture).toEqual([]);
		expect(g.approved.map((r) => r.collection_id)).toEqual([1]);
	});

	it('places mixed volumes by the rule and orders each stage newest change first, never-changed last', () => {
		const g = groupByStage([
			row(1, { captured: 1, approved: 4 }, '2026-10-20T10:00:00'),
			row(2, {}, null),
			row(3, { captured: 2 }, '2026-10-22T09:00:00'),
			row(4, { rejected: 1, in_review: 1 }, '2026-10-21T09:00:00'),
			row(5, { in_review: 3, approved: 1 }, '2026-10-19T09:00:00'),
			row(6, { approved: 5 }, '2026-10-18T09:00:00'),
			row(7, {}, null)
		]);
		expect(g.capture.map((r) => r.collection_id)).toEqual([3, 1, 2, 7]);
		expect(g.recapture.map((r) => r.collection_id)).toEqual([4]);
		expect(g.review.map((r) => r.collection_id)).toEqual([5]);
		expect(g.approved.map((r) => r.collection_id)).toEqual([6]);
	});
});

describe('parseApiDate', () => {
	it('runs in a zone where local and UTC readings differ', () => {
		expect(new Date('2026-10-22T17:03:11').toISOString()).toBe('2026-10-22T22:03:11.000Z');
	});

	it('reads a naive ISO string as UTC', () => {
		expect(parseApiDate('2026-10-22T17:03:11').toISOString()).toBe('2026-10-22T17:03:11.000Z');
	});

	it('leaves a string with Z or an offset as given', () => {
		expect(parseApiDate('2026-10-22T17:03:11Z').toISOString()).toBe('2026-10-22T17:03:11.000Z');
		expect(parseApiDate('2026-10-22T12:03:11-05:00').toISOString()).toBe('2026-10-22T17:03:11.000Z');
	});
});

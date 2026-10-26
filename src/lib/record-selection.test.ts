// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { reconcileInspected, selectionAfterLoad } from './record-selection';

const recs = (...ids: number[]) => ids.map((id) => ({ id }));

describe('selectionAfterLoad', () => {
	it('selects the first record after an ordinary load, as the volume page always has', () => {
		expect(selectionAfterLoad(recs(1, 2, 5), 5, false)).toBe(1);
	});

	it('keeps the selected record after a refresh in place, when it is still there', () => {
		expect(selectionAfterLoad(recs(1, 2, 5), 5, true)).toBe(5);
	});

	it('falls back to the first record when the selected one is gone, or none was selected', () => {
		expect(selectionAfterLoad(recs(1, 2), 5, true)).toBe(1);
		expect(selectionAfterLoad(recs(1, 2), null, true)).toBe(1);
	});

	it('leaves the selection as it was when the volume has no records', () => {
		expect(selectionAfterLoad([], 5, false)).toBe(5);
		expect(selectionAfterLoad([], 5, true)).toBe(5);
	});
});

describe('reconcileInspected', () => {
	const recs = [{ id: 1, v: 'new' }, { id: 5, v: 'new' }];

	it('swaps the record being inspected for its reloaded copy, by id', () => {
		expect(reconcileInspected({ id: 5, v: 'old' }, recs)).toBe(recs[1]);
	});

	it('is null when the record is no longer in the volume, and stays null when none is inspected', () => {
		expect(reconcileInspected({ id: 9, v: 'old' }, recs)).toBeNull();
		expect(reconcileInspected(null, recs)).toBeNull();
	});
});

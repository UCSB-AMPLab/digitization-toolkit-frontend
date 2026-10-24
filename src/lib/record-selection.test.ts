import { describe, expect, it } from 'vitest';
import { selectionAfterLoad } from './record-selection';

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

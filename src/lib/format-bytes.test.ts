// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { formatBytes } from './format-bytes';

// A no-break space joins the number to its unit, so the two never part at a line end.
const NB = ' ';

describe('formatBytes', () => {
	it('counts in decimal units, as the card and the drives are sold', () => {
		expect(formatBytes(0, 'en')).toBe(`0${NB}B`);
		expect(formatBytes(999, 'en')).toBe(`999${NB}B`);
		expect(formatBytes(1000, 'en')).toBe(`1${NB}KB`);
		expect(formatBytes(2_500_000, 'en')).toBe(`2.5${NB}MB`);
		expect(formatBytes(12_300_000_000, 'en')).toBe(`12.3${NB}GB`);
		expect(formatBytes(1_500_000_000_000, 'en')).toBe(`1.5${NB}TB`);
	});

	it('writes the decimal with a comma in Spanish', () => {
		expect(formatBytes(12_300_000_000, 'es')).toBe(`12,3${NB}GB`);
		expect(formatBytes(2_500_000, 'es')).toBe(`2,5${NB}MB`);
	});

	it('keeps one decimal below 100 and none from 100 up, dropping a trailing zero', () => {
		expect(formatBytes(12_000_000_000, 'en')).toBe(`12${NB}GB`);
		expect(formatBytes(99_940_000, 'en')).toBe(`99.9${NB}MB`);
		expect(formatBytes(412_400_000, 'en')).toBe(`412${NB}MB`);
		expect(formatBytes(412_400_000, 'es')).toBe(`412${NB}MB`);
	});

	it('moves to the next unit when rounding would reach 1000', () => {
		expect(formatBytes(999_600_000, 'en')).toBe(`1${NB}GB`);
		expect(formatBytes(999_960, 'es')).toBe(`1${NB}MB`);
	});

	it('separates thousands of terabytes as formatCount does', () => {
		expect(formatBytes(1786e12, 'en')).toBe(`1,786${NB}TB`);
		expect(formatBytes(1786e12, 'es')).toBe(`1786${NB}TB`);
		expect(formatBytes(12345e12, 'es')).toBe(`12.345${NB}TB`);
	});

	it('treats a missing or negative size as zero', () => {
		expect(formatBytes(Number.NaN, 'en')).toBe(`0${NB}B`);
		expect(formatBytes(-5, 'es')).toBe(`0${NB}B`);
	});
});

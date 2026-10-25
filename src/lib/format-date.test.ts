import { describe, expect, it } from 'vitest';
import { formatApiDate } from './format-date';

// A fixed zone keeps the expected strings independent of the host's.
const utc = { timeZone: 'UTC' } as const;

describe('formatApiDate', () => {
	it('writes Spanish dates the Colombian way', () => {
		const iso = '2026-01-03T17:05:00';
		expect(formatApiDate(iso, 'es', { ...utc, day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('03/01/2026');
		expect(formatApiDate(iso, 'es', { ...utc, hour: '2-digit', minute: '2-digit' })).toMatch(/^05:05\sp\.\s?m\.$/);
	});

	it('writes English dates in the US order', () => {
		const iso = '2026-01-03T17:05:00';
		expect(formatApiDate(iso, 'en', { ...utc, day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('01/03/2026');
		expect(formatApiDate(iso, 'en', { ...utc, day: 'numeric', month: 'short', year: 'numeric' })).toBe('Jan 3, 2026');
	});

	it('reads a naive API datetime as UTC', () => {
		const naive = formatApiDate('2026-01-03T17:05:00', 'en', { ...utc, hour: '2-digit', minute: '2-digit', hour12: false });
		const zoned = formatApiDate('2026-01-03T17:05:00Z', 'en', { ...utc, hour: '2-digit', minute: '2-digit', hour12: false });
		expect(naive).toBe('17:05');
		expect(zoned).toBe(naive);
	});
});

// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { defaultRecordTitle } from './record-title';
import { locale } from './i18n';

describe('defaultRecordTitle', () => {
	it('formats local time as ISO 8601 without an offset', () => {
		expect(defaultRecordTitle(new Date(2026, 9, 22, 14, 5, 31))).toBe('2026-10-22T14:05:31');
	});

	it('zero-pads every field', () => {
		expect(defaultRecordTitle(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02T03:04:05');
	});

	it('is identical whatever the UI locale', () => {
		const when = new Date(2026, 9, 22, 14, 5, 31);
		locale.set('es');
		const es = defaultRecordTitle(when);
		locale.set('en');
		const en = defaultRecordTitle(when);
		expect(es).toBe(en);
		expect(es).not.toMatch(/captur/i);
	});
});

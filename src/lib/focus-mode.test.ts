import { describe, expect, it } from 'vitest';
import { describeFocusMode } from './focus-mode';

describe('describeFocusMode', () => {
	it('reports manual for "Manual"', () => {
		expect(describeFocusMode('Manual')).toBe('manual');
	});

	it('reports manual for "MF"', () => {
		expect(describeFocusMode('MF')).toBe('manual');
	});

	it('reports manual for " mf " (trimmed, case-insensitive)', () => {
		expect(describeFocusMode(' mf ')).toBe('manual');
	});

	it('reports auto for "One Shot"', () => {
		expect(describeFocusMode('One Shot')).toBe('auto');
	});

	it('reports auto for "AI Focus"', () => {
		expect(describeFocusMode('AI Focus')).toBe('auto');
	});

	it('reports unknown for an empty string', () => {
		expect(describeFocusMode('')).toBe('unknown');
	});

	it('reports unknown for undefined', () => {
		expect(describeFocusMode(undefined)).toBe('unknown');
	});

	it('reports unknown for null', () => {
		expect(describeFocusMode(null)).toBe('unknown');
	});
});

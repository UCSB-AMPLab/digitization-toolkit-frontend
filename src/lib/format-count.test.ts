import { describe, expect, it } from 'vitest';
import { formatCount } from './format-count';

describe('formatCount', () => {
	it('leaves four digits unseparated in Spanish and puts a period from five up', () => {
		expect(formatCount(0, 'es')).toBe('0');
		expect(formatCount(1786, 'es')).toBe('1786');
		expect(formatCount(9999, 'es')).toBe('9999');
		expect(formatCount(12345, 'es')).toBe('12.345');
		expect(formatCount(1234567, 'es')).toBe('1.234.567');
	});

	it('puts a comma from four digits up in English', () => {
		expect(formatCount(999, 'en')).toBe('999');
		expect(formatCount(1786, 'en')).toBe('1,786');
		expect(formatCount(12345, 'en')).toBe('12,345');
	});

	it('does not follow es-CO, which groups four digits ("9.999")', () => {
		expect(new Intl.NumberFormat('es-CO').format(9999)).toBe('9.999');
		expect(formatCount(9999, 'es')).not.toBe(new Intl.NumberFormat('es-CO').format(9999));
	});
});

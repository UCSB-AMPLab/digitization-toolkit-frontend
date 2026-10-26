// Version: 0.1.0-beta

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

describe('older count messages', () => {
	it('separate thousands as each language does', async () => {
		const { es } = await import('./i18n/es');
		const { en } = await import('./i18n/en');
		expect(es.dash_records_count(12345)).toBe('12.345 registros');
		expect(en.dash_records_count(12345)).toBe('12,345 records');
		expect(es.dash_cal_day_captures(1786, '3 de octubre')).toBe('1786 imágenes capturadas el 3 de octubre');
		expect(en.dash_cal_day_captures(1786, 'October 3')).toBe('1,786 images captured on October 3');
		expect(es.col_takeback_confirm_kept(1786, 12345)).toContain('Los 1786 registros aprobados y los 12.345 rechazados');
		expect(en.col_handover_sent(1786)).toContain('1,786');
		expect(es.pd_err_move_under_review(12345)).toContain('Hay 12.345 registros');
	});
});

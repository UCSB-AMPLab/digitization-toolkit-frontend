// The strings of the unit's mode (NEH-311) whose text was ruled on.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

describe('Fisqua mode: the read-only stem of an operator', () => {
	it('names only the stem', () => {
		expect(es.pd_fisqua_codes_readonly).toBe('El equipo está en modo Fisqua: la raíz viene de Fisqua y solo un administrador puede cambiarla.');
		expect(en.pd_fisqua_codes_readonly).toBe('The unit is in Fisqua mode: the stem comes from Fisqua, and only an administrator can change it.');
	});
});

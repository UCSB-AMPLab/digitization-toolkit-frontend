// Version: 0.1.0-beta

import { describe, expect, it } from 'vitest';
import { es } from './es';

// NEH-260: the take-back note names what a reviewer has already ruled on,
// leaves out a zero count, and agrees in number with each count.
describe('col_takeback_confirm_kept', () => {
	const kept = es.col_takeback_confirm_kept;
	it.each([
		[9, 4, 'Los 9 registros aprobados y los 4 rechazados se quedan como están, porque ya se revisaron.'],
		[1, 4, 'El registro aprobado y los 4 rechazados se quedan como están, porque ya se revisaron.'],
		[9, 1, 'Los 9 registros aprobados y el rechazado se quedan como están, porque ya se revisaron.'],
		[1, 1, 'El registro aprobado y el rechazado se quedan como están, porque ya se revisaron.'],
		[9, 0, 'Los 9 registros aprobados se quedan como están, porque ya se revisaron.'],
		[1, 0, 'El registro aprobado se queda como está, porque ya se revisó.'],
		[0, 4, 'Los 4 registros rechazados se quedan como están, porque ya se revisaron.'],
		[0, 1, 'El registro rechazado se queda como está, porque ya se revisó.']
	])('a=%i r=%i', (a, r, expected) => {
		expect(kept(a, r)).toBe(expected);
	});
});

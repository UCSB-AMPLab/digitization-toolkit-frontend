// The recapture turn's counted strings (0.2.0): each agrees in number with
// its count, and writes the count with formatCount.
//
// Version: 0.2.0
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

describe('retake turn strings, Spanish', () => {
	it('retake_band_title', () => {
		expect(es.retake_band_title(315, 20)).toBe('315 pares de páginas por recapturar en 20 volúmenes');
		expect(es.retake_band_title(1, 1)).toBe('Un par de páginas por recapturar en un volumen');
		expect(es.retake_band_title(5, 1)).toBe('5 pares de páginas por recapturar en un volumen');
		expect(es.retake_band_title(12345, 2)).toBe('12.345 pares de páginas por recapturar en 2 volúmenes');
	});

	it('the volume band, the handover button and the promotion refusal', () => {
		expect(es.vol_band_title(31)).toBe('31 pares de páginas por recapturar');
		expect(es.vol_band_title(1)).toBe('Un par de páginas por recapturar');
		expect(es.vol_handover_disabled(31)).toBe('Faltan 31 recapturas');
		expect(es.vol_handover_disabled(1)).toBe('Falta una recaptura');
		expect(es.err_recaptures_pending(3)).toBe('No se pudo enviar el volumen a revisión: faltan 3 recapturas.');
		expect(es.err_recaptures_pending(1)).toBe('No se pudo enviar el volumen a revisión: falta una recaptura.');
	});

	it('the block, the guide and the bands', () => {
		expect(es.block_next('Tomo 002', 2)).toBe('Siguiente en la cola: Tomo 002, con 2 pares de páginas por recapturar.');
		expect(es.block_next('Tomo 002', 1)).toBe('Siguiente en la cola: Tomo 002, con un par de páginas por recapturar.');
		expect(es.block_cta('Tomo 002')).toBe('Recapturar Tomo 002');
		expect(es.retake_band_most('Tomo 066', 31)).toBe('Con más pendientes: Tomo 066 (31).');
		expect(es.retake_pending_of(2, 31)).toBe('2 de 31 pendientes');
		expect(es.guide_header(2, 31, 'Tomo 066')).toBe('Recaptura 2 de 31 · Tomo 066');
		expect(es.guide_next('10r, 9v')).toBe('Siguiente: folios 10r, 9v');
		expect(es.guide_done(true)).toBe('Terminaste las recapturas de este volumen. Ya puedes empezar un volumen nuevo.');
		expect(es.guide_done(false)).toBe('Terminaste las recapturas de este volumen.');
		expect(es.turn_new_body('Tomo 002')).toBe('Ya se terminaron las recapturas del volumen Tomo 002. Puedes empezar un volumen nuevo.');
		expect(es.retake_band_body).toBe(
			'La lista de digitalización pide volver a capturarlos. Termina las recapturas antes de empezar volúmenes nuevos.'
		);
	});
});

describe('retake turn strings, English', () => {
	it('agree in number too', () => {
		expect(en.retake_band_title(315, 20)).toBe('315 page pairs to retake in 20 volumes');
		expect(en.retake_band_title(1, 1)).toBe('1 page pair to retake in 1 volume');
		expect(en.retake_band_title(1786, 2)).toBe('1,786 page pairs to retake in 2 volumes');
		expect(en.vol_band_title(1)).toBe('1 page pair to retake');
		expect(en.vol_handover_disabled(31)).toBe('31 retakes left');
		expect(en.vol_handover_disabled(1)).toBe('1 retake left');
		expect(en.block_next('Tomo 002', 2)).toBe('Next in the queue: Tomo 002, with 2 page pairs to retake.');
		expect(en.err_recaptures_pending(1)).toBe('The volume could not be sent to review: 1 retake left.');
		expect(en.guide_done(true)).toBe('You finished the retakes of this volume. You can now start a new volume.');
	});
});

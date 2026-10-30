// Cola's strings (0.3.1): the three section headings, numbered by the
// sections shown, and the done mark, which now says finished.
//
// Version: 0.3.1
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

describe('Cola section headings', () => {
	it('Spanish', () => {
		expect(es.section_progress_title(1)).toBe('Primero: termina lo que está en curso');
		expect(es.section_rework_title(1)).toBe('Primero: recapturas y reescaneos');
		expect(es.section_rework_title(2)).toBe('Segundo: recapturas y reescaneos');
		expect(es.section_new_title(1)).toBe('Primero: nuevos materiales');
		expect(es.section_new_title(2)).toBe('Segundo: nuevos materiales');
		expect(es.section_new_title(3)).toBe('Tercero: nuevos materiales');
		expect(es.section_progress_sub).toBe('Volúmenes que ya se empezaron a capturar en este equipo.');
		expect(es.section_rework_sub).toBe('Volúmenes con pares de páginas por recapturar y, después, los que hay que volver a digitalizar completos.');
		expect(es.section_new_sub).toBe('Volúmenes que nunca se han digitalizado.');
	});

	it('English', () => {
		expect(en.section_progress_title(1)).toBe("First: finish what's in progress");
		expect(en.section_rework_title(2)).toBe('Second: recaptures and rescans');
		expect(en.section_new_title(3)).toBe('Third: new material');
		expect(en.section_progress_sub).toBe('Volumes whose capture has already started on this unit.');
		expect(en.section_rework_sub).toBe('Volumes with page pairs to recapture, then the ones to digitise again in full.');
		expect(en.section_new_sub).toBe('Volumes never digitised before.');
	});
});

describe('the done mark says finished', () => {
	it('Spanish', () => {
		expect(es.queue_mark_done).toBe('Marcar como terminado');
		expect(es.queue_done).toBe('Terminado');
		expect(es.queue_done_by('revisora', '28 oct 2026')).toBe('Marcado como terminado por revisora el 28 oct 2026');
		expect(es.queue_done_by_who('revisora')).toBe('Marcado como terminado por revisora');
		expect(es.queue_done_on('28 oct 2026')).toBe('Marcado como terminado el 28 oct 2026');
		expect(es.queue_done_marked).toBe('Marcado como terminado');
	});

	it('English', () => {
		expect(en.queue_mark_done).toBe('Mark as finished');
		expect(en.queue_done).toBe('Finished');
		expect(en.queue_done_by('reviewer', '28 Oct 2026')).toBe('Marked finished by reviewer on 28 Oct 2026');
		expect(en.queue_done_by_who('reviewer')).toBe('Marked finished by reviewer');
		expect(en.queue_done_on('28 Oct 2026')).toBe('Marked finished on 28 Oct 2026');
		expect(en.queue_done_marked).toBe('Marked finished');
	});
});

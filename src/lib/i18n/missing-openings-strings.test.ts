// The strings of placeholder openings (NEH-317): the approved Spanish
// verbatim, and the variants used while the app has no folio for a record
// or no next capture number for a volume.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

describe('placeholder openings, Spanish (approved)', () => {
	it('the pills, the toolbar and the hover', () => {
		expect(es.pill_opening_missing).toBe('Par de páginas sin capturar');
		expect(es.pill_page_missing).toBe('Página sin capturar');
		expect(es.pill_closed).toBe('Cerrado');
		expect(es.toolbar_mark_missing).toBe('Marcar un par de páginas que falta');
		expect(es.hover_missing_here).toBe('Aquí falta un par de páginas');
	});

	it('the mark dialog', () => {
		expect(es.mark_title).toBe('Marcar un par de páginas que falta');
		expect(es.mark_body(95, '90r')).toBe(
			'El par que falta va después del registro 95, que termina en el folio 90r. Captua pone ahí un par de páginas vacío y lo agrega a la lista Por recapturar.'
		);
		expect(es.mark_count_legend).toBe('¿Cuántos pares de páginas faltan?');
		expect(es.mark_count_unknown).toBe('No se sabe: quien capture lo verá con el volumen abierto');
		expect(es.mark_count_one).toBe('Uno');
		expect(es.mark_count_more).toBe('Más de uno');
		expect(es.mark_expected).toBe('Qué debería haber (opcional)');
		expect(es.mark_note).toBe('Nota para quien captura');
		expect(es.mark_cancel).toBe('Cancelar');
		expect(es.mark_submit).toBe('Marcar como faltante');
	});

	it('the capture screen', () => {
		expect(es.cap_title('90r', 95)).toBe('Falta un par de páginas después del folio 90r');
		expect(es.cap_where).toBe('Dónde va');
		expect(es.cap_from_review).toBe('Marcado en la revisión de Fisqua');
		expect(es.cap_after).toBe('Después de capturar');
		expect(es.cap_another_q('92r')).toBe('Quedó capturado. ¿Falta otro par de páginas antes del folio 92r?');
		expect(es.cap_another).toBe('Capturar otro aquí');
		expect(es.cap_last).toBe('Ese era el último');
		expect(es.cap_order_note(95, 'img_0798')).toBe(
			'El orden y los nombres de archivo son independientes. Este par va después del registro 95; sus archivos llevan el siguiente número de captura del volumen, img_0798.'
		);
		expect(es.cap_nothing_link).toBe('Aquí no hay ningún par de páginas que capturar');
	});

	it('the close dialog', () => {
		expect(es.close_title).toBe('Aquí no hay nada que capturar');
		expect(es.close_body('90r')).toBe(
			'Al cerrarlo, el par de páginas vacío que va después del folio 90r queda en el volumen con tu motivo, para que quienes revisan sepan qué comprobaste.'
		);
		expect(es.close_legend).toBe('¿Qué encontraste?');
		expect(es.close_reason_skip).toBe('La foliación salta un número; no falta ninguna hoja');
		expect(es.close_reason_leaf_missing).toBe('Al volumen le falta esa hoja');
		expect(es.close_reason_elsewhere).toBe('Estas páginas ya están capturadas en otra parte del volumen');
		expect(es.close_reason_other).toBe('Otra cosa');
		expect(es.close_details).toBe('Detalles');
		expect(es.close_back).toBe('Volver a la captura');
		expect(es.close_submit).toBe('Cerrar el par de páginas');
		expect(es.close_after_note).toBe(
			'Un par de páginas cerrado ya no cuenta como recaptura, así que no impide enviar el volumen a revisión. Cuando envíes el volumen, ese par va con él a Fisqua, junto con el motivo.'
		);
	});

	it('the To retake list', () => {
		expect(es.retakes_subtitle).toBe(
			'Los pares de páginas que hay que capturar de nuevo o por primera vez, en el orden de cada volumen.'
		);
		expect(es.retakes_no_opening).toBe('Aquí no hay ningún par de páginas');
		expect(es.retakes_no_page).toBe('Aquí no hay ninguna página');
		expect(es.retakes_capture).toBe('Capturar');
		expect(es.retakes_page_missing_row('left')).toBe(
			'Nunca se fotografió la página izquierda. Vuelve a capturar el par completo con las dos cámaras: la captura nueva reemplaza la anterior.'
		);
		expect(es.retakes_page_missing_row('right')).toBe(
			'Nunca se fotografió la página derecha. Vuelve a capturar el par completo con las dos cámaras: la captura nueva reemplaza la anterior.'
		);
	});
});

describe('placeholder openings, without a folio or a capture number (new, not yet reviewed)', () => {
	it('Spanish', () => {
		expect(es.mark_body(95, null)).toBe(
			'El par que falta va después del registro 95. Captua pone ahí un par de páginas vacío y lo agrega a la lista Por recapturar.'
		);
		expect(es.cap_title(null, 95)).toBe('Falta un par de páginas después del registro 95');
		expect(es.cap_another_q(null)).toBe('Quedó capturado. ¿Falta otro par de páginas aquí?');
		expect(es.cap_order_note(1234, null)).toBe(
			'El orden y los nombres de archivo son independientes. Este par va después del registro 1234; sus archivos llevan el siguiente número de captura del volumen.'
		);
		expect(es.close_body(null)).toBe(
			'Al cerrarlo, el par de páginas vacío queda en el volumen con tu motivo, para que quienes revisan sepan qué comprobaste.'
		);
		expect(es.retakes_volume_pending(1)).toBe('1 pendiente');
		expect(es.retakes_volume_pending(4)).toBe('4 pendientes');
	});

	it('English', () => {
		expect(en.mark_body(95, '90r')).toBe(
			'After record 95, which ends at folio 90r. Captua puts an empty opening in its place, and it is listed with the retakes.'
		);
		expect(en.mark_body(95, null)).toBe(
			'After record 95. Captua puts an empty opening in its place, and it is listed with the retakes.'
		);
		expect(en.cap_title('90r', 95)).toBe('Missing opening after folio 90r');
		expect(en.cap_title(null, 95)).toBe('Missing opening after record 95');
		expect(en.cap_another_q('92r')).toBe('Captured. Is another opening missing before folio 92r?');
		expect(en.cap_another_q(null)).toBe('Captured. Is another opening missing here?');
		expect(en.cap_order_note(95, 'img_0798')).toBe(
			"Order and file names are separate. This opening's place is after record 95. Its files take the volume's next capture number, img_0798."
		);
		expect(en.cap_order_note(95, null)).toBe(
			"Order and file names are separate. This opening's place is after record 95. Its files take the volume's next capture number."
		);
		expect(en.close_body('90r')).toBe(
			'The empty opening after folio 90r is closed and stays in the volume with your reason, so reviewers can see what was checked.'
		);
		expect(en.retakes_page_missing_row('left')).toBe(
			'The left page was never photographed. A capture with both cameras replaces the opening.'
		);
		expect(en.retakes_volume_pending(1)).toBe('1 pending');
	});
});

describe('the close dialog for a missing page (new, not yet reviewed)', () => {
	it('Spanish', () => {
		expect(es.close_page_title).toBe('Aquí no hay ninguna página que capturar');
		expect(es.close_page_body).toBe(
			'Al cerrarla, la página que falta queda en el volumen con tu motivo, para que quienes revisan sepan qué comprobaste.'
		);
		expect(es.close_page_reason_elsewhere).toBe('Esta página ya está capturada en otra parte del volumen');
		expect(es.close_page_submit).toBe('Cerrar la página');
		expect(es.close_page_after_note).toBe(
			'Una página cerrada ya no cuenta como recaptura, así que no impide enviar el volumen a revisión. Cuando envíes el volumen, esa página va con él a Fisqua, junto con el motivo.'
		);
		expect(es.close_page_err_already_closed).toBe('Esta página ya estaba cerrada.');
		expect(es.close_page_err_failed).toBe('No se pudo cerrar la página. Inténtalo de nuevo.');
	});

	it('English', () => {
		expect(en.close_page_title).toBe('No page to capture here');
		expect(en.close_page_body).toBe(
			'The missing page is closed and stays in the volume with your reason, so reviewers can see what was checked.'
		);
		expect(en.close_page_reason_elsewhere).toBe('The page is already captured elsewhere in the volume');
		expect(en.close_page_submit).toBe('Close the page');
		expect(en.close_page_after_note).toBe(
			"A closed page no longer counts as a retake, so it doesn't hold the volume back. It goes to Fisqua with the volume, carrying its reason."
		);
		expect(en.close_page_err_already_closed).toBe('This page was already closed.');
		expect(en.close_page_err_failed).toBe('The page could not be closed. Try again.');
	});
});

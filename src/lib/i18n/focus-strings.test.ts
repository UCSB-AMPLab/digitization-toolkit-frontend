// NEH-339: the focus check's strings. The term is "test capture" /
// "captura de prueba", as on the dashboard (dash_camera_capture_*), made
// with "hacer" in Spanish; and the wording names the glass without saying
// whether the glass or the book moves.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

const focusStrings = (catalogue: Record<string, unknown>) =>
	Object.entries(catalogue)
		.filter(([key]) => key.startsWith('focus_'))
		.map(([key, value]) => [key, typeof value === 'function' ? String((value as (...a: unknown[]) => string)(27, 35)) : String(value)]);

describe('focus check strings', () => {
	it('say capture, never picture or foto', () => {
		for (const [key, text] of focusStrings(en)) expect(text, key).not.toMatch(/picture/i);
		for (const [key, text] of focusStrings(es)) expect(text, key).not.toMatch(/\bfotos?\b|\btomar\b|\btoma\b/i);
	});

	it('English', () => {
		expect(en.focus_test_title).toBe('Test captures');
		expect(en.focus_take).toBe('Take test captures');
		expect(en.focus_take_again).toBe('Take again');
		expect(en.focus_taking(4)).toBe('Taking the test captures… 4 s');
		expect(en.focus_test_failed()).toBe('Could not take the test capture');
		expect(en.focus_test_failed('the camera is not connected')).toBe('Could not take the test capture: the camera is not connected');
		expect(en.focus_test_empty).toBe('No test capture yet');
		expect(en.focus_test_step_take).toBe('Press the pedal or "Take test captures". Each camera focuses and then captures; this can take up to 20 seconds.');
		expect(en.focus_test_step_zoom).toBe('Zoom in on both captures: the text on the page must be sharp.');
		expect(en.focus_test_step_again).toBe('If it is not, take the captures again.');
		expect(en.focus_test_not_saved).toBe('These captures are not saved.');
		expect(en.focus_focal_mismatch(27, 35)).toMatch(/until they match, then take the captures again\.$/);
		expect(en.focus_no_focus_lead).toBe('The camera could not focus and did not capture. Check that:');
		expect(en.focus_no_focus_again).toBe('Then take the captures again.');
		expect(en.focus_test_step_hold).toBe('Bring the page against the glass, as you do to capture, and hold it there.');
		expect(en.focus_no_focus_glass).toBe('the page is against the glass');
		expect(en.focus_af_step_light).toBe(
			'Switch the scanner light on, open the book where both pages have text and put it under the cameras. Do not use a blank page: the camera would focus on the glass and not on the book.'
		);
	});

	it('Spanish', () => {
		expect(es.focus_test_title).toBe('Capturas de prueba');
		expect(es.focus_take).toBe('Hacer capturas de prueba');
		expect(es.focus_take_again).toBe('Repetir las capturas');
		expect(es.focus_taking(4)).toBe('Haciendo las capturas de prueba… 4 s');
		expect(es.focus_test_failed()).toBe('No se pudo hacer la captura de prueba');
		expect(es.focus_test_failed('la cámara no está conectada')).toBe('No se pudo hacer la captura de prueba: la cámara no está conectada');
		expect(es.focus_test_empty).toBe('Todavía no hay captura de prueba');
		expect(es.focus_test_step_take).toBe(
			'Presiona el pedal o "Hacer capturas de prueba". Cada cámara enfoca y luego hace la captura; esto puede tardar hasta 20 segundos.'
		);
		expect(es.focus_test_step_zoom).toBe('Acerca las dos capturas y revisa que el texto de la página se vea nítido.');
		expect(es.focus_test_step_again).toBe('Si el texto no se ve nítido, repite las capturas.');
		expect(es.focus_test_not_saved).toBe('Captua no guarda estas capturas.');
		expect(es.focus_focal_mismatch(27, 35)).toMatch(/hasta que las dos cifras coincidan y repite las capturas\.$/);
		expect(es.focus_no_focus_lead).toBe('La cámara no pudo enfocar y no hizo la captura. Revisa que:');
		expect(es.focus_no_focus_again).toBe('Luego repite las capturas.');
		expect(es.focus_test_step_hold).toBe('Pon la página contra el vidrio, como cuando capturas, y sostenla ahí.');
		expect(es.focus_no_focus_glass).toBe('la página esté contra el vidrio');
		expect(es.focus_af_step_light).toBe(
			'Enciende la luz del equipo, abre el libro en un par de páginas con texto y ponlo debajo de las cámaras. No uses una página en blanco: la cámara enfocaría el vidrio y no el libro.'
		);
	});

	it('the lowered-part name is gone', () => {
		expect('focus_no_focus_lowered' in es).toBe(false);
		expect('focus_no_focus_lowered' in en).toBe(false);
	});
});

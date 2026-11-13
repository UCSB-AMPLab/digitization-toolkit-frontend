// NEH-339: the camera check's strings (camcheck_), and those of its
// "Which camera is this?" step (camwhich_, NEH-343). Both catalogues have the
// same keys, of the same kind; the English is the approved mock-up's, with
// "test capture" / "capture" for "test picture" / "picture", as in the
// Refocus dialog (focus-strings.test.ts); neither
// language exclaims, names a collection or uses guillemets; the Spanish says
// "Presiona", "equipo" and "capturas de prueba", the terms already in use.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

const keys = (catalogue: Record<string, unknown>, prefix = 'camcheck_') =>
	Object.keys(catalogue).filter((k) => k.startsWith(prefix)).sort();

// Every string, functions called with sample arguments of each kind they take.
function texts(catalogue: Record<string, unknown>, prefix = 'camcheck_'): [string, string][] {
	return keys(catalogue, prefix).flatMap((key) => {
		const value = catalogue[key];
		if (typeof value !== 'function') return [[key, String(value)] as [string, string]];
		const fn = value as (...a: unknown[]) => string;
		return [
			[key, fn('left', 'The camera did not answer')],
			[key, fn('right')],
			[key, fn(63)],
			[key, fn(27.5)]
		] as [string, string][];
	});
}

describe('camera check strings', () => {
	it('the two catalogues have the same camcheck_ keys, each of the same kind', () => {
		expect(keys(en).length).toBeGreaterThan(20);
		expect(keys(es)).toEqual(keys(en));
		for (const key of keys(en)) {
			expect(typeof (es as Record<string, unknown>)[key], key).toBe(typeof (en as Record<string, unknown>)[key]);
		}
	});

	it('no exclamation marks, no collection, no guillemets', () => {
		for (const [key, text] of [...texts(en), ...texts(es)]) {
			expect(text, key).not.toMatch(/[!¡«»]/);
			expect(text, key).not.toMatch(/collection|colecci[oó]n/i);
		}
	});

	it('English: test captures, never pictures', () => {
		for (const [key, text] of texts(en)) expect(text, key).not.toMatch(/picture/i);
		expect(en.camcheck_open).toBe('Check cameras');
		expect(en.camcheck_title).toBe('Camera check');
		expect(en.camcheck_back).toBe('Back to capturing');
		expect(en.camcheck_take).toBe('Take test captures');
		expect(en.camcheck_discarded).toBe('Captua does not save test captures to the volume.');
		expect(en.camcheck_left_page).toBe('Left page');
		expect(en.camcheck_right_page).toBe('Right page');
		expect(en.camcheck_no_capture).toBe('No test capture yet');
		expect(en.camcheck_zoom_both).toBe('Zoom · both cameras');
		expect(en.camcheck_zoom_each).toBe('Zoom · each camera');
		expect(en.camcheck_adjust_separately).toBe('Adjust separately');
		expect(en.camcheck_adjust_together).toBe('Adjust together');
		expect(en.camcheck_match).toBe('Match');
		expect(en.camcheck_focus_hint).toBe('Press 1:1 on a capture to see it at full size. The text must be sharp.');
		expect(en.camcheck_focal_differ_title).toBe('The two cameras are at different focal lengths.');
		expect(en.camcheck_unreachable_title('right')).toBe('Captua could not reach the right page camera.');
		expect(en.camcheck_frame_unreachable).toBe('Captua could not reach this camera.');
		expect(en.camcheck_viewer_title).toBe('Test captures at full size');
		expect(en.camcheck_chip_aria('left')).toBe('Left page camera: show details');
		expect(en.camcheck_turn_aria('right')).toBe('Turn the right page capture 90° clockwise');
		expect(en.camcheck_turn_title).toBe('Turn 90° clockwise');
	});

	it('the reviewed wording, in both languages', () => {
		expect(es.camcheck_back).toBe('Volver a la pantalla de captura');
		expect(es.camcheck_unreachable_body).toBe('Revisa que la cámara esté encendida y que el cable USB esté conectado. Luego repite las capturas de prueba.');
		expect(es.camcheck_stale).toBe('Se cambió el zoom después de estas capturas. Repite las capturas de prueba.');
		expect(es.camcheck_focal_hint).toBe('Captua lee la distancia focal de cada cámara en las capturas de prueba. Para cambiarla, gira el anillo de zoom del lente.');
		expect(es.camcheck_focal_read).toBe('Captua leyó estas distancias en las capturas de prueba.');
		expect(es.camcheck_focal_differ_body).toBe('Gira el anillo de zoom de uno de los lentes hasta que las dos cifras coincidan. Luego repite las capturas de prueba.');
		expect(es.camcheck_discarded).toBe('Captua no guarda las capturas de prueba en el volumen.');
		expect(es.camcheck_cannot_reach).toBe('Captua no puede comunicarse con la cámara');
		expect(en.camcheck_focal_differ_body).toBe('Turn one zoom ring until the two numbers match. Then take test captures again.');
		expect(en.camcheck_stale).toBe('The zoom was changed after these captures. Take test captures again.');
		expect(en.camcheck_focal_hint).toBe("Captua reads each camera's focal length from the test captures. To change it, turn the zoom ring on the lens.");
	});

	it('the USB row is gone until the backend reports a stable socket name', () => {
		expect('camcheck_usb' in en).toBe(false);
		expect('camcheck_usb' in es).toBe(false);
	});

	it('Spanish: the house terms', () => {
		for (const [key, text] of texts(es)) {
			expect(text, key).not.toMatch(/\bfotos?\b|\bpulsa|\bapertura|unidad/i);
		}
		expect(es.camcheck_take).toMatch(/capturas de prueba/);
		expect(es.camcheck_focus_hint).toMatch(/^Presiona "1:1"/);
	});
});

describe('"Which camera is this?" strings (NEH-343)', () => {
	const W = 'camwhich_';

	it('the two catalogues have the same camwhich_ keys, each of the same kind', () => {
		expect(keys(en, W).length).toBeGreaterThan(20);
		expect(keys(es, W)).toEqual(keys(en, W));
		for (const key of keys(en, W)) {
			expect(typeof (es as Record<string, unknown>)[key], key).toBe(typeof (en as Record<string, unknown>)[key]);
		}
	});

	it('no exclamation marks, no collection, no guillemets, no socket name', () => {
		for (const [key, text] of [...texts(en, W), ...texts(es, W)]) {
			expect(text, key).not.toMatch(/[!¡«»]/);
			expect(text, key).not.toMatch(/collection|colecci[oó]n/i);
			expect(text, key).not.toMatch(/usb:|\/dev\/|\d+-\d+(\.\d+)+/i);
		}
	});

	it('English: never "picture" or "identification failed"; the decided labels', () => {
		for (const [key, text] of texts(en, W)) {
			expect(text, key).not.toMatch(/picture/i);
			expect(text, key).not.toMatch(/identification failed/i);
		}
		expect(en.camwhich_ask_title).toBe('Which camera sees the left page?');
		expect(en.camwhich_port_title).toBe('Have the cameras been swapped?');
		expect(en.camwhich_port_no).toBe('No, they are where they were');
		expect(en.camwhich_port_yes).toBe('Yes, they were swapped');
		expect(en.camwhich_confirm).toBe('Confirm');
		expect(en.camwhich_refresh).toBe('Refresh');
		expect(en.camwhich_open).toBe('Change the page of each camera');
		expect(en.camwhich_leave).toBe('Leave the capture screen');
		expect(es.camwhich_leave).toBe('Salir de la pantalla de captura');
		expect(en.camwhich_rescan_failed).toBe('Captua could not reconnect the cameras.');
		expect(es.camwhich_rescan_failed).toBe('Captua no pudo reconectar las cámaras.');
		expect(en.camwhich_check_again).toBe('Reconnect cameras');
		expect(en.camwhich_how).toBe('Press the image that shows the left page. Turn an image that is sideways or upside down.');
		expect(en.camwhich_err_failed).toBe('Captua could not save which page each camera photographs.');
		expect(es.camwhich_open).toBe('Cambiar la página de cada cámara');
		expect(es.camwhich_port_title).toBe('¿Alguien cambió las cámaras de lado?');
		expect(es.camwhich_port_yes).toBe('Sí, las cambiaron de lado');
		expect(es.camwhich_check_again).toBe('Reconectar cámaras');
		expect(es.camwhich_err_not_connected).toBe('Captua no pudo guardar la respuesta porque una cámara ya no estaba conectada. Revisa que las dos cámaras estén conectadas y vuelve a elegir la imagen de la página izquierda.');
		expect(es.camwhich_err_unavailable).toBe('Captua no pudo guardar qué página fotografía cada cámara. Intenta de nuevo en un momento.');
	});

	it('Spanish: the house terms', () => {
		for (const [key, text] of texts(es, W)) {
			expect(text, key).not.toMatch(/\bfotos?\b|\bpulsa|\bapertura|unidad|volver a capturar/i);
		}
	});
});

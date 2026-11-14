// The strings of the Fisqua link card (NEH-345): the same keys in both
// catalogues, "workspace" and "unit" in English (never "tenant", never
// "please"), "equipo" for the unit in Spanish, and no guillemets.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

const keys = (cat: object) => Object.keys(cat).filter((k) => k.startsWith('fisqua_link_')).sort();

function texts(cat: Record<string, unknown>): string[] {
	return keys(cat).map((k) => {
		const v = cat[k];
		return typeof v === 'function' ? String((v as (...a: unknown[]) => string)('archivo-x', 'production')) : String(v);
	});
}

describe('Fisqua link strings', () => {
	it('has the same keys in both catalogues', () => {
		expect(keys(es).length).toBeGreaterThan(30);
		expect(keys(en)).toEqual(keys(es));
	});

	it('English says workspace and unit, never tenant or please', () => {
		for (const t of texts(en as never)) {
			expect(t).not.toMatch(/tenant|please/i);
		}
		expect(en.fisqua_link_title).toBe('Connect to Fisqua');
		expect(en.fisqua_link_start).toBe('Get a code');
		expect(en.fisqua_link_restart_btn).toBe('Restart the unit');
		expect(en.fisqua_link_other_workspace('archivo-x')).toMatch(/workspace/);
	});

	it('Spanish says equipo for the unit and uses straight quotes', () => {
		for (const t of texts(es as never)) {
			expect(t).not.toMatch(/[«»]|unidad|inquilino|tenant/i);
		}
	});

	it('says which units can be linked, with the mode names of the unit-mode card', () => {
		for (const cat of [es, en]) {
			expect(cat.fisqua_link_not_eligible).toContain(`"${cat.unit_mode_fisqua}"`);
			expect(cat.fisqua_link_not_eligible).toContain(`"${cat.unit_mode_offline}"`);
		}
	});

	it('a missing script says what to do', () => {
		expect(en.fisqua_link_script_missing).toMatch(/Update Captua, or ask whoever installed the unit/);
	});

	it('Spanish says vincular and vinculación, never enlazar or enlace', () => {
		for (const t of texts(es as never)) {
			expect(t).not.toMatch(/enlaz|enlace/i);
		}
		expect(es.fisqua_link_title).toBe('Vincular con Fisqua');
		expect(es.fisqua_link_device_label).toBe('Identificador del dispositivo');
		expect(en.fisqua_link_device_label).toBe('Device id');
	});

	it('the linked line names the test service for staging and nothing for production', () => {
		expect(es.fisqua_link_linked('archivo-x', false)).toBe('Equipo vinculado con archivo-x.');
		expect(es.fisqua_link_linked('archivo-x', true)).toBe('Equipo vinculado con archivo-x (servicio de pruebas de Fisqua).');
		expect(en.fisqua_link_linked('archivo-x', false)).toBe('Unit linked to archivo-x.');
		expect(en.fisqua_link_linked('archivo-x', true)).toBe("Unit linked to archivo-x (Fisqua's test service).");
	});

	it('cannot_pair and device_id_invalid send the admin to whoever installed the unit', () => {
		for (const k of ['fisqua_link_cannot_pair', 'fisqua_link_device_id_invalid'] as const) {
			expect(es[k]).toMatch(/Pregúntale a quien instaló el equipo\.$/);
			expect(es[k]).not.toMatch(/a mano/);
			expect(en[k]).toMatch(/Ask whoever installed the unit\.$/);
			expect(en[k]).not.toMatch(/by hand/);
		}
	});

	it('Spanish never says "a mano" or "configuración de la vinculación"', () => {
		for (const t of texts(es as never)) {
			expect(t).not.toMatch(/a mano|configuración de la vinculación/i);
		}
	});

	it('the approved Spanish texts', () => {
		expect(es.fisqua_link_desc).toBe('Vincula este equipo con un espacio de trabajo de Fisqua. Un administrador de ese espacio de trabajo aprueba el código en la página "Escáner" de Fisqua.');
		expect(es.fisqua_link_restart_warning).toBe('Al vincular el equipo, Captua se reinicia, y eso tarda alrededor de un minuto. No lo vincules durante una captura.');
		expect(es.fisqua_link_mode_hint).toBe('El equipo no está en el modo "Fisqua". Captua solo envía volúmenes a Fisqua en ese modo.');
		expect(es.fisqua_link_cannot_pair).toBe('Esta instalación de Fisqua no permite vincular equipos con un código. Pregúntale a quien instaló el equipo.');
		expect(es.fisqua_link_lost).toBe('Fisqua envió los datos de la vinculación, pero no llegaron a este equipo. Obtén un código nuevo y vuelve a aprobarlo.');
		expect(es.fisqua_link_wrong_env).toBe('La respuesta llegó de otro servicio de Fisqua. Captua no cambió nada.');
		expect(es.fisqua_link_other_workspace('archivo-x')).toBe('Este equipo ya está vinculado con archivo-x y solo se puede volver a vincular con ese espacio de trabajo. Para pasarlo a otro, pregúntale a quien instaló el equipo.');
		expect(es.fisqua_link_other_workspace(null)).toBe('Este equipo ya está vinculado con un espacio de trabajo y solo se puede volver a vincular con ese mismo. Para pasarlo a otro, pregúntale a quien instaló el equipo.');
		expect(es.fisqua_link_failed).toBe('Captua no pudo guardar los datos de la vinculación y no cambió nada.');
		expect(es.fisqua_link_unverified).toBe('Captua guardó los datos de la vinculación, pero no pudo comprobarlos. Reinicia el equipo y vuelve a revisar esta sección.');
		expect(es.fisqua_link_overridden).toBe('Un ajuste del archivo .env del equipo tiene prioridad sobre la vinculación. Pregúntale a quien instaló el equipo.');
		expect(es.fisqua_link_rclone_missing).toBe('A este equipo le falta el programa que sube los archivos a la copia externa, así que no se puede vincular con un código. Pregúntale a quien instaló el equipo.');
		expect(es.fisqua_link_script_too_old).toBe('La instalación de este equipo es demasiado antigua para vincularlo con un código. Actualiza Captua o pregúntale a quien instaló el equipo.');
		expect(es.fisqua_link_script_missing).toBe('A este equipo le falta el programa que guarda los datos de la vinculación. Actualiza Captua o pregúntale a quien instaló el equipo.');
		expect(es.fisqua_link_finishing_uploads).toBe('Código aprobado. Antes de vincular el equipo, Captua está terminando una subida. Puede tardar unos minutos.');
		expect(es.fisqua_link_restart_required).toBe('Reinicia el equipo antes de obtener un código nuevo. Puede que Captua haya guardado los datos de la vinculación, que solo tienen efecto después de reiniciar el equipo.');
		expect(es.fisqua_link_finishing_offsite_jobs).toBe('Código aprobado. Antes de vincular el equipo, Captua está terminando de liberar espacio en la tarjeta o de restaurar archivos en ella. Puede tardar unos minutos.');
		expect(es.fisqua_link_offsite_jobs_still_running).toBe('Después de diez minutos, Captua todavía estaba liberando espacio en la tarjeta o restaurando archivos en ella, así que no cambió nada. Obtén un código nuevo cuando termine.');
		expect(es.fisqua_link_prepare_failed).toBe('Captua no pudo preparar los datos de la vinculación y no cambió nada. Obtén un código nuevo.');
		expect(es.fisqua_link_err_read).toBe('Captua no pudo comprobar si el equipo está vinculado. Lo vuelve a intentar cada pocos segundos.');
		expect(es.fisqua_link_shutting_down).toBe('Captua no cambió nada: la aprobación llegó durante el apagado. Obtén un código nuevo cuando Captua vuelva a estar en marcha.');
		expect(en.fisqua_link_shutting_down).toBe('Captua was shutting down and changed nothing. Get a new code once it is running again.');
	});

	it('English sends the admin to whoever installed the unit, never "by hand"', () => {
		for (const t of [en.fisqua_link_other_workspace('archivo-x'), en.fisqua_link_other_workspace(null), en.fisqua_link_rclone_missing, en.fisqua_link_script_too_old, en.fisqua_link_script_missing]) {
			expect(t).toMatch(/ask whoever installed the unit\.$/i);
			expect(t).not.toMatch(/by hand/);
		}
	});

	it('the restart warning says how long and when not to link', () => {
		expect(en.fisqua_link_restart_warning).toMatch(/minute/);
		expect(en.fisqua_link_restart_warning).toMatch(/capture/);
	});
});

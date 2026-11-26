// The strings of moving a hand-made volume's captures into a volume from
// Fisqua (NEH-419) and of a move the unit could not settle (NEH-420): the
// same `adopt_` and `unsettled_` keys in both catalogues, each with the text
// of the approved table, and the singular of each count written in the same
// words as its plural.
//
// Version: 0.3.0
import { describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';

const keys = (cat: object) =>
	Object.keys(cat)
		.filter((k) => k.startsWith('adopt_') || k.startsWith('unsettled_'))
		.sort();

// [key, arguments, Spanish, English], from the approved table with sample
// arguments: counts 7, 14 and 2; source "Fuente A", target "Destino B", a
// file name.
const TABLE: [string, (string | number)[], string, string][] = [
	[
		'adopt_action',
		[],
		'Mover las capturas a un volumen de Fisqua',
		'Move the captures into a volume from Fisqua'
	],
	[
		'adopt_action_desc',
		[],
		'Usa esta opción si las capturas se tomaron en este volumen, creado a mano, y después Fisqua asignó el volumen al que pertenecen. Captua las mueve a ese volumen y les pone los nombres de archivo que le corresponden.',
		'Use this when the captures were taken in this volume, made by hand, and Fisqua later assigned the volume they belong to. Captua moves the captures into that volume and gives them its file names.'
	],
	['adopt_target_heading', [], 'Elige el volumen de Fisqua', 'Choose the volume from Fisqua'],
	[
		'adopt_target_desc',
		[],
		'Captua muestra los volúmenes vacíos que asignó Fisqua, excepto los que guarda solo en este equipo.',
		'Captua lists the volumes that Fisqua assigned, that are empty, and that Captua does not keep only on this unit.'
	],
	[
		'adopt_target_empty',
		[],
		'No hay ningún volumen de Fisqua vacío al que se puedan mover estas capturas.',
		'There is no empty volume from Fisqua to move these captures into.'
	],
	['adopt_plan_heading', [], 'Lo que Captua va a hacer', 'What Captua will do'],
	[
		'adopt_plan_summary',
		[7, 14, 2, 'Fuente A', 'Destino B'],
		'Captua moverá 7 registros, con 14 imágenes y 2 grupos de fotos de la tarjeta de color, de Fuente A a Destino B.',
		'Captua will move 7 records, with 14 images and 2 groups of color card shots, from Fuente A to Destino B.'
	],
	[
		'adopt_plan_summary_no_sets',
		[7, 14, 'Fuente A', 'Destino B'],
		'Captua moverá 7 registros, con 14 imágenes, de Fuente A a Destino B.',
		'Captua will move 7 records, with 14 images, from Fuente A to Destino B.'
	],
	['adopt_plan_new_names', [], 'Nombres de archivo nuevos', 'New file names'],
	[
		'adopt_plan_next',
		[],
		'Captua les cambiará el nombre a los archivos en este equipo y los volverá a subir a la copia externa con los nombres nuevos.',
		'Captua will rename the files on this unit and upload them to the offsite copy again under the new names.'
	],
	[
		'adopt_plan_old_copies',
		[],
		'Los archivos que ya están en la copia externa con los nombres anteriores seguirán allí hasta que alguien los elimine a mano.',
		'The files already stored offsite under the old names will stay there until someone deletes them by hand.'
	],
	['adopt_plan_confirm', [], 'Mover las capturas', 'Move the captures'],
	[
		'adopt_refused_title',
		[],
		'Captua no puede mover estas capturas',
		'Captua cannot move these captures'
	],
	['adopt_refused_unchanged', [], 'Captua no cambió nada.', 'Captua changed nothing.'],
	[
		'adopt_err_unfinished',
		[],
		'En este equipo hay capturas que quedaron a medio mover: Captua se detuvo antes de terminar y no pudo devolverlas a donde estaban. Mientras eso no se repare, Captua no mueve más capturas.',
		'Some captures on this unit were left half moved: Captua stopped before it finished and could not put them back where they were. Until that is repaired, Captua moves no other captures.'
	],
	[
		'adopt_err_unfinished_do',
		[],
		'En Resumen aparece lo que hay que hacer.',
		'The Overview shows what to do.'
	],
	[
		'adopt_err_volume_gone',
		['x-img_0003_c1.cr2'],
		'x-img_0003_c1.cr2 ya no está en este equipo.',
		'x-img_0003_c1.cr2 is no longer on this unit.'
	],
	[
		'adopt_err_same_volume',
		[],
		'El volumen que elegiste es este mismo.',
		'The volume you chose is this same volume.'
	],
	['adopt_err_same_volume_do', [], 'Elige otro volumen.', 'Choose another volume.'],
	[
		'adopt_err_testing',
		['x-img_0003_c1.cr2'],
		'x-img_0003_c1.cr2 es un volumen de prueba, y Captua no mueve capturas entre volúmenes de prueba y volúmenes reales.',
		'x-img_0003_c1.cr2 is a testing volume, and Captua moves no captures between testing volumes and real ones.'
	],
	[
		'adopt_err_source_no_stem',
		['Fuente A'],
		'Fuente A no tiene raíz.',
		'Fuente A has no file name stem.'
	],
	[
		'adopt_err_target_no_stem',
		['Destino B'],
		'Destino B no tiene raíz, así que Captua no puede ponerles a las capturas sus nombres nuevos.',
		'Destino B has no file name stem, so Captua cannot give the captures their new names.'
	],
	[
		'adopt_err_target_no_stem_do',
		[],
		'Asígnale como raíz su código de referencia en Fisqua.',
		'Give it its stem: its Fisqua reference code.'
	],
	[
		'adopt_err_target_not_assigned',
		['Destino B'],
		'Destino B no tiene código de referencia en Fisqua, así que no lo asignó Fisqua.',
		'Destino B has no Fisqua reference code, so Fisqua did not assign it.'
	],
	[
		'adopt_err_target_not_assigned_do',
		[],
		'Elige un volumen de la cola de Fisqua.',
		"Choose a volume from Fisqua's queue."
	],
	[
		'adopt_err_target_withdrawn',
		['Destino B'],
		'Fisqua retiró Destino B de la cola.',
		'Fisqua withdrew Destino B from its queue.'
	],
	[
		'adopt_err_sent',
		['x-img_0003_c1.cr2'],
		'Captua ya envió x-img_0003_c1.cr2 a Fisqua o lo tiene pendiente de envío.',
		'Captua has already sent x-img_0003_c1.cr2 to Fisqua, or has it waiting to be sent.'
	],
	[
		'adopt_err_kept',
		['x-img_0003_c1.cr2'],
		'Captua guarda x-img_0003_c1.cr2 solo en este equipo, así que nunca sube sus archivos a la copia externa.',
		'Captua keeps x-img_0003_c1.cr2 only on this unit, so it never copies its files offsite.'
	],
	[
		'adopt_err_kept_do',
		[],
		'Inclúyelo primero en el modo actual.',
		'Include it in the current mode first.'
	],
	[
		'adopt_err_sub_volumes',
		['Fuente A'],
		'Fuente A contiene otros volúmenes.',
		'Fuente A contains other volumes.'
	],
	[
		'adopt_err_no_images',
		['Fuente A'],
		'Fuente A no tiene imágenes para mover.',
		'Fuente A has no images to move.'
	],
	[
		'adopt_err_open_set',
		['Fuente A'],
		'En Fuente A hay un grupo de fotos de la tarjeta de color sin terminar.',
		'A group of color card shots in Fuente A is not finished.'
	],
	[
		'adopt_err_open_set_do',
		['Fuente A'],
		'Primero toma u omite las fotos de la tarjeta de color de Fuente A.',
		'Take or skip the color card shots of Fuente A first.'
	],
	[
		'adopt_err_target_not_empty',
		['Destino B'],
		'Destino B no está vacío: tiene registros, imágenes o grupos de fotos de la tarjeta de color, tomados u omitidos, o ya se capturó en él.',
		'Destino B is not empty: it has records, images or groups of color card shots, taken or skipped, or captures were taken in it before.'
	],
	['adopt_err_target_not_empty_do', [], 'Elige un volumen vacío.', 'Choose an empty volume.'],
	[
		'adopt_err_target_names_held',
		['Destino B'],
		'En la copia externa ya hay archivos con los nombres de archivo de Destino B, así que Captua no puede subir las capturas con esos nombres.',
		"The offsite copy already holds files under Destino B's file names, so Captua cannot upload the captures under those names."
	],
	[
		'adopt_err_offsite_config',
		[],
		'La copia externa de los archivos de imagen no está bien configurada en este equipo.',
		'The offsite copy of the image files is not configured correctly on this unit.'
	],
	[
		'adopt_err_offsite_config_do',
		[],
		'Pregúntale a quien instaló el equipo.',
		'Ask whoever installed the unit.'
	],
	[
		'adopt_err_storage',
		[],
		'Captua no puede escribir en el almacenamiento donde guarda las imágenes, así que no puede cambiarles el nombre a los archivos.',
		'Captua cannot write to the storage where it keeps the images, so it cannot rename the files.'
	],
	[
		'adopt_err_outside_storage',
		['x-img_0003_c1.cr2'],
		'Algunos archivos de x-img_0003_c1.cr2 tienen una ruta fuera del almacenamiento del equipo, así que Captua no puede moverlos.',
		"Some files of x-img_0003_c1.cr2 have a path outside the unit's storage, so Captua cannot move them."
	],
	[
		'adopt_err_handed_over',
		['Fuente A'],
		'Algunos registros de Fuente A ya no están en estado Capturado: se enviaron a revisión o ya se revisaron.',
		'Some records of Fuente A are no longer in Captured: they were sent for review, or have been reviewed.'
	],
	[
		'adopt_err_handed_over_do',
		[],
		'Si están en revisión, primero retira el volumen con "Retirar de revisión".',
		'If they are in review, first withdraw the volume with "Withdraw from review".'
	],
	[
		'adopt_err_freed',
		['Fuente A'],
		'Algunos archivos de Fuente A están guardados en la copia externa y ya no están en la tarjeta.',
		'Some files of Fuente A are stored offsite and are not on the SD card.'
	],
	[
		'adopt_err_freed_do',
		[],
		'Primero restaura el volumen desde "Espacio en la tarjeta".',
		'Restore the volume first from "Space on the SD card".'
	],
	[
		'adopt_err_outside_own_folder',
		['Fuente A'],
		'Algunos archivos de Fuente A no están en la carpeta propia del volumen.',
		"Some files of Fuente A are not in the volume's own folder."
	],
	[
		'adopt_err_file_missing',
		['Fuente A'],
		'Faltan en este equipo algunos archivos de las imágenes o de las fotos de la tarjeta de color de Fuente A.',
		'Some files of the images or color card shots of Fuente A are not on this unit.'
	],
	[
		'adopt_err_not_verified',
		['Fuente A'],
		'Todavía hay archivos de Fuente A sin verificar en la copia externa.',
		'Not every file of Fuente A is verified in the offsite copy yet.'
	],
	[
		'adopt_err_not_verified_do',
		[],
		'Espera a que Captua termine de copiarlos y vuelve a intentarlo.',
		'Wait for Captua to finish copying them, then try again.'
	],
	[
		'adopt_err_capture_list',
		['Fuente A', 'Destino B'],
		'La lista que Captua tiene de las capturas de Fuente A no coincide con los archivos del volumen, así que Captua no puede pasarla a Destino B.',
		"Captua's list of the captures of Fuente A does not match the volume's files, so Captua cannot carry it over to Destino B."
	],
	[
		'adopt_err_names',
		['Fuente A'],
		'Algunos archivos de Fuente A tienen nombres que no corresponden a los nombres de archivo del volumen, así que Captua no puede ponerles nombres nuevos.',
		"Some files of Fuente A have names that do not follow the volume's file names, so Captua cannot give them new names."
	],
	[
		'adopt_err_thumbnail_shared',
		['Fuente A'],
		'Dos imágenes de Fuente A comparten una miniatura, así que Captua no puede mover esa miniatura con las dos imágenes.',
		'Two images of Fuente A share one thumbnail, so Captua cannot move it for both.'
	],
	[
		'adopt_err_unowned_files',
		['Fuente A'],
		'En las carpetas de Fuente A hay archivos que no son de ninguna de sus imágenes ni de sus fotos de la tarjeta de color.',
		'The folders of Fuente A hold files that belong to none of its images or color card shots.'
	],
	[
		'adopt_err_name_taken',
		[],
		'Algunos de los nombres de archivo nuevos ya están en uso en este equipo o en la copia externa.',
		'Some of the new file names are already taken, on this unit or in the offsite copy.'
	],
	[
		'adopt_err_volume_held',
		[],
		'Captua está exportando uno de estos volúmenes, copiándolo a una memoria USB o preparando sus archivos para la copia externa.',
		'Captua is exporting one of these volumes, copying it to a USB drive, or preparing its files for the offsite copy.'
	],
	[
		'adopt_err_volume_held_do',
		[],
		'Espera a que termine y vuelve a intentarlo.',
		'Wait until it finishes, then try again.'
	],
	['adopt_done_heading', [], 'Captua movió las capturas', 'Captua moved the captures'],
	[
		'adopt_done_summary',
		[7, 14, 2, 'Fuente A', 'Destino B'],
		'Captua movió 7 registros, con 14 imágenes y 2 grupos de fotos de la tarjeta de color, de Fuente A a Destino B.',
		'Captua moved 7 records, with 14 images and 2 groups of color card shots, from Fuente A to Destino B.'
	],
	[
		'adopt_done_summary_no_sets',
		[7, 14, 'Fuente A', 'Destino B'],
		'Captua movió 7 registros, con 14 imágenes, de Fuente A a Destino B.',
		'Captua moved 7 records, with 14 images, from Fuente A to Destino B.'
	],
	[
		'adopt_done_uploading',
		[],
		'Captua está volviendo a subir los archivos a la copia externa con sus nombres nuevos.',
		'Captua is uploading the files to the offsite copy again, under their new names.'
	],
	['adopt_done_delete', ['Fuente A'], 'Eliminar Fuente A', 'Delete Fuente A'],
	[
		'adopt_done_delete_desc',
		['Fuente A', 'Destino B'],
		'Fuente A quedó vacío. Si lo eliminas, no se pierde nada: las capturas están en Destino B.',
		'Fuente A is now empty. If you delete it, nothing is lost: the captures are in Destino B.'
	],
	[
		'adopt_closed_line',
		['Destino B'],
		'Captua movió las capturas de este volumen a Destino B. En este volumen ya no se pueden tomar capturas nuevas. Se puede eliminar.',
		"Captua moved this volume's captures into Destino B. No new captures can be taken in it, and it can be deleted."
	],
	[
		'adopt_closed_refusal',
		[],
		'Captua movió las capturas de este volumen a otro volumen, así que en este ya no se puede capturar nada más.',
		"Captua moved this volume's captures into another volume, so nothing more can be captured in it."
	],
	[
		'unsettled_heading',
		[],
		'Captua no terminó de mover unas capturas',
		'Captua did not finish moving some captures'
	],
	[
		'unsettled_what',
		['Fuente A', 'Destino B'],
		'Captua se detuvo mientras movía las capturas de Fuente A a Destino B y no pudo terminar de moverlas ni devolverlas a Fuente A.',
		'Captua stopped while it was moving the captures from Fuente A to Destino B, and it could not finish moving them or put them back in Fuente A.'
	],
	[
		'unsettled_missing',
		['x-img_0003_c1.cr2'],
		'Falta este archivo en el equipo: x-img_0003_c1.cr2',
		'This file is missing on the unit: x-img_0003_c1.cr2'
	],
	[
		'unsettled_blocked',
		['Fuente A', 'Destino B'],
		'Hasta que esto se repare, nadie puede capturar ni hacer cambios en Fuente A ni en Destino B. Esto no afecta a los demás volúmenes.',
		'Until this is repaired, no one can capture or make changes in Fuente A or Destino B. Other volumes are not affected.'
	],
	['unsettled_repair', [], 'Reparar', 'Repair'],
	[
		'unsettled_repair_desc',
		[],
		'Captua trae el archivo de la copia externa, lo comprueba y después termina de mover las capturas o las devuelve a donde estaban.',
		'Captua brings the file back from the offsite copy, checks it, and then finishes moving the captures or puts them back where they were.'
	],
	[
		'unsettled_repairing',
		[],
		'Captua está reparando las capturas que quedaron a medio mover…',
		'Captua is repairing the captures that were left half moved…'
	],
	[
		'unsettled_done_finished',
		['Destino B'],
		'Captua reparó el problema y terminó de mover las capturas: ya están en Destino B.',
		'Captua repaired the problem and finished moving the captures: they are in Destino B.'
	],
	[
		'unsettled_done_undone',
		['Fuente A'],
		'Captua reparó el problema y devolvió las capturas a Fuente A.',
		'Captua repaired the problem and put the captures back in Fuente A.'
	],
	[
		'unsettled_err_mismatch',
		['x-img_0003_c1.cr2'],
		'Captua no pudo reparar el problema: el archivo x-img_0003_c1.cr2 de la copia externa no coincide con su checksum.',
		'Captua could not repair the problem: the file x-img_0003_c1.cr2 in the offsite copy does not match its checksum.'
	],
	[
		'unsettled_err_absent',
		['x-img_0003_c1.cr2'],
		'Captua no pudo reparar el problema: x-img_0003_c1.cr2 no está en la copia externa.',
		'Captua could not repair the problem: x-img_0003_c1.cr2 is not in the offsite copy.'
	],
	[
		'unsettled_err_never_copied',
		['x-img_0003_c1.cr2'],
		'Captua no pudo reparar el problema: nunca subió x-img_0003_c1.cr2 a la copia externa.',
		'Captua could not repair the problem: it never uploaded x-img_0003_c1.cr2 to the offsite copy.'
	],
	[
		'unsettled_no_repair',
		[],
		'Captua no puede reparar el problema desde aquí. Pregúntale a quien instaló el equipo.',
		'Captua cannot repair the problem from here. Ask whoever installed the unit.'
	],
	[
		'unsettled_operator',
		[],
		'Por ahora no se puede trabajar en este volumen. Captua ya les indicó a los administradores qué hacer.',
		'No one can work in this volume for now. Captua has told the administrators what to do.'
	],
	[
		'adopt_err_in_progress',
		[],
		'Captua ya está moviendo las capturas de otro volumen en este equipo.',
		'Captua is already moving the captures of another volume on this unit.'
	],
	[
		'adopt_err_in_progress_do',
		[],
		'Espera a que termine y vuelve a intentarlo.',
		'Wait until it finishes, then try again.'
	],
	[
		'adopt_err_listing',
		[],
		'Captua no pudo consultar la copia externa, así que no puede saber si los nombres de archivo nuevos ya están en uso allí.',
		'Captua could not check the offsite copy, so it cannot tell whether the new file names are already in use there.'
	],
	[
		'adopt_err_listing_do',
		[],
		'Revisa la conexión a internet del equipo y vuelve a intentarlo.',
		"Check the unit's internet connection and try again."
	],
	[
		'adopt_err_records_changed',
		['Fuente A'],
		'Mientras Captua se preparaba para mover las capturas de Fuente A, se agregaron registros a ese volumen.',
		'Records were added to Fuente A while Captua was preparing to move its captures.'
	],
	[
		'adopt_err_records_changed_do',
		['Fuente A'],
		'Vuelve a intentarlo cuando nadie esté capturando en Fuente A.',
		'Try again when no one is capturing in Fuente A.'
	],
	[
		'adopt_failed_restored',
		[],
		'Captua no pudo mover las capturas y dejó todo como estaba.',
		'Captua could not move the captures and left everything as it was.'
	],
	[
		'adopt_failed_restored_do',
		[],
		'Vuelve a intentarlo. Si pasa otra vez, pregúntale a quien instaló el equipo.',
		'Try again. If it happens again, ask whoever installed the unit.'
	],
	[
		'adopt_failed_pending',
		[],
		'Captua se detuvo mientras movía las capturas, y quedaron a medio mover. Al arrancar de nuevo el equipo, Captua terminará de moverlas o las devolverá a donde estaban.',
		'Captua stopped while it was moving the captures, and they were left half moved. When the unit starts again, Captua will finish moving them or put them back where they were.'
	],
	['adopt_failed_pending_do', [], 'Reinicia el equipo.', 'Restart the unit.'],
	[
		'adopt_done_pending',
		[],
		'Captua movió las capturas. Le falta un último paso, que hará al arrancar de nuevo el equipo.',
		'Captua moved the captures. One last step is left, and Captua will do it when the unit starts again.'
	],
	[
		'adopt_plan_project',
		['Fuente A', 'Destino B'],
		'Fuente A y Destino B están en proyectos distintos. Los registros pasarán al proyecto de Destino B.',
		'Fuente A and Destino B are in different projects. The records will move to the project of Destino B.'
	],
	[
		'adopt_err_ask_installer',
		[],
		'Pregúntale a quien instaló el equipo.',
		'Ask whoever installed the unit.'
	]
];

type Fn = (...a: (string | number)[]) => string;
const text = (cat: Record<string, unknown>, key: string, args: (string | number)[]) => {
	const v = cat[key];
	return typeof v === 'function' ? (v as Fn)(...args) : v;
};

describe('adoption strings', () => {
	it('has the same keys in both catalogues, and exactly the approved ones', () => {
		expect(keys(en)).toEqual(keys(es));
		expect(keys(es)).toEqual(TABLE.map(([k]) => k).sort());
	});

	it.each(TABLE)('%s has the approved text', (key, args, esText, enText) => {
		expect(text(es as never, key, args)).toBe(esText);
		expect(text(en as never, key, args)).toBe(enText);
	});

	it('writes the singular of each count in the words of its plural', () => {
		expect(es.adopt_plan_summary(1, 1, 1, 'A', 'B')).toBe(
			'Captua moverá 1 registro, con 1 imagen y 1 grupo de fotos de la tarjeta de color, de A a B.'
		);
		expect(en.adopt_plan_summary(1, 1, 1, 'A', 'B')).toBe(
			'Captua will move 1 record, with 1 image and 1 group of color card shots, from A to B.'
		);
		expect(es.adopt_plan_summary_no_sets(1, 2, 'A', 'B')).toBe(
			'Captua moverá 1 registro, con 2 imágenes, de A a B.'
		);
		expect(en.adopt_plan_summary_no_sets(2, 1, 'A', 'B')).toBe(
			'Captua will move 2 records, with 1 image, from A to B.'
		);
		expect(es.adopt_done_summary(1, 1, 1, 'A', 'B')).toBe(
			'Captua movió 1 registro, con 1 imagen y 1 grupo de fotos de la tarjeta de color, de A a B.'
		);
		expect(en.adopt_done_summary(1, 1, 1, 'A', 'B')).toBe(
			'Captua moved 1 record, with 1 image and 1 group of color card shots, from A to B.'
		);
		expect(es.adopt_done_summary_no_sets(1, 1, 'A', 'B')).toBe(
			'Captua movió 1 registro, con 1 imagen, de A a B.'
		);
		expect(en.adopt_done_summary_no_sets(1, 1, 'A', 'B')).toBe(
			'Captua moved 1 record, with 1 image, from A to B.'
		);
	});

	it('groups thousands in counts as the catalogue does', () => {
		expect(es.adopt_plan_summary_no_sets(12345, 2, 'A', 'B')).toContain('12.345 registros');
		expect(en.adopt_plan_summary_no_sets(1786, 2, 'A', 'B')).toContain('1,786 records');
	});
});

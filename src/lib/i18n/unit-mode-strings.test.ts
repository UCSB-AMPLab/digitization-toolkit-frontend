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

describe('Scanner only mode: the catalogue copy (NEH-319)', () => {
	it('says where the catalogue is kept', () => {
		expect(es.backup_ind_local).toBe('Catálogo solo en el escáner');
		expect(en.backup_ind_local).toBe('Catalogue on the scanner only');
		expect(es.backup_cfg_local).toBe('En el modo actual, Captua guarda el catálogo solo en este equipo.');
		expect(en.backup_cfg_local).toBe('In the current mode, Captua keeps the catalogue only on this scanner.');
	});

	it('describes the copy and the catalogue in separate strings', () => {
		expect(es.backup_section_desc).toBe(
			'Una vez al día, Captua copia el catálogo al destino que se configuró al instalar el equipo y verifica que la copia está completa.'
		);
		expect(en.backup_section_desc).toBe(
			'Once a day, Captua copies the catalogue to the destination configured when the scanner was installed, and verifies that the copy is complete.'
		);
		expect(es.backup_section_catalogue).toBe(
			'El catálogo es la base de datos que relaciona cada imagen con su proyecto, su volumen y el lugar que ocupa en él.'
		);
		expect(en.backup_section_catalogue).toBe(
			'The catalogue is the database that links each image to its project, its volume and its place in that volume.'
		);
	});

	it('names who retries the copy', () => {
		expect(es.backup_cfg_retry).toBe('Mientras el equipo está encendido, Captua vuelve a intentar la copia cada cierto tiempo.');
		expect(en.backup_cfg_retry).toBe('While the scanner is on, Captua retries the copy from time to time.');
	});
});

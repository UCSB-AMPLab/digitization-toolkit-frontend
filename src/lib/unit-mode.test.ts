// The unit's mode (NEH-311) and projects setting (NEH-313) as the interface
// reads them: the GET /system/unit body checked for shape, the labels, the
// translated 409 problems, and the gates each screen asks.
//
// Version: 0.3.3

import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import {
	canCreateVolumes,
	canImportList,
	modeLabel,
	modeRefusal,
	readUnitState,
	unitProblemText,
	volumeBackPath,
	volumeCodesReadOnly,
	type UnitState
} from './unit-mode';

const body = {
	mode: 'fisqua',
	projectsEnabled: false,
	projectsShown: false,
	defaultProjectId: 3,
	prerequisites: { backup: [], fisqua: [] }
};

function state(over: Partial<UnitState> = {}): UnitState {
	return { ...(readUnitState(body) as UnitState), ...over };
}

// A stand-in for api.ts's ApiError, as in volume-errors.test.ts.
class ApiError extends Error {
	detail?: unknown;
	status?: number;
	constructor(message: string, detail?: unknown, status?: number) {
		super(message);
		this.detail = detail;
		this.status = status;
	}
}

describe('readUnitState', () => {
	it('reads the GET /system/unit body', () => {
		expect(readUnitState(body)).toEqual(body);
	});

	it('refuses a body of any other shape', () => {
		expect(readUnitState(null)).toBeNull();
		expect(readUnitState({ ...body, mode: 'online' })).toBeNull();
		expect(readUnitState({ ...body, projectsShown: 'no' })).toBeNull();
		expect(readUnitState({ id: 1, username: 'admin' })).toBeNull();
	});

	it('takes a missing default project and prerequisites as none', () => {
		const rest: { [k: string]: unknown } = { ...body };
		delete rest.defaultProjectId;
		delete rest.prerequisites;
		expect(readUnitState(rest)).toEqual({ ...rest, defaultProjectId: null, prerequisites: { backup: [], fisqua: [] } });
	});
});

describe('modeLabel', () => {
	it('uses the labels shared with Fisqua', () => {
		expect(modeLabel('offline', es)).toBe('Solo en el escáner');
		expect(modeLabel('backup', es)).toBe('Solo copia externa');
		expect(modeLabel('fisqua', es)).toBe('Fisqua');
		expect(modeLabel('offline', en)).toBe('Scanner only');
		expect(modeLabel('backup', en)).toBe('Offsite copy only');
		expect(modeLabel('fisqua', en)).toBe('Fisqua');
	});
});

describe('modeRefusal and unitProblemText', () => {
	const refused = new ApiError(
		'The unit cannot switch to fisqua mode.',
		{
			message: 'The unit cannot switch to fisqua mode.',
			problems: [
				{ code: 'fisqua_unreachable', message: 'Fisqua did not take the unit’s new mode', error: 'timeout' },
				{ code: 'catalogue_dump_not_configured', message: 'The offsite catalogue dump is not configured on this unit.' }
			]
		},
		409
	);

	it('reads the codes of a refused switch', () => {
		expect(modeRefusal(refused)).toEqual(['fisqua_unreachable', 'catalogue_dump_not_configured']);
	});

	it('is null for any other error', () => {
		expect(modeRefusal(new ApiError('x', { message: 'x' }, 409))).toBeNull();
		expect(modeRefusal(new ApiError('x', { problems: [{ code: 'fisqua_unreachable' }] }, 500))).toBeNull();
		expect(modeRefusal(new Error('x'))).toBeNull();
	});

	it('translates every problem code, and never shows the backend text', () => {
		const codes = [
			'offsite_not_configured',
			'catalogue_dump_not_configured',
			'fisqua_not_configured',
			'fisqua_unreachable',
			'offsite_held',
			'mode_changed'
		];
		const texts = codes.map((c) => unitProblemText(c, es));
		expect(new Set(texts).size).toBe(codes.length);
		for (const t of texts) expect(t).not.toMatch(/configured|reach|hold/i);
		expect(unitProblemText('fisqua_unreachable', es)).toBe(es.unit_problem_fisqua_unreachable);
		expect(unitProblemText('something_new', es)).toBe(es.unit_problem_other);
	});
});

describe('gates', () => {
	it('lets operators create volumes and import lists outside Fisqua mode only', () => {
		for (const mode of ['offline', 'backup'] as const) {
			expect(canCreateVolumes('operator', state({ mode }))).toBe(true);
			expect(canImportList('operator', state({ mode }))).toBe(true);
			expect(volumeCodesReadOnly('operator', state({ mode }))).toBe(false);
		}
		expect(canCreateVolumes('operator', state())).toBe(false);
		expect(canImportList('operator', state())).toBe(false);
		expect(volumeCodesReadOnly('operator', state())).toBe(true);
	});

	it('keeps an admin’s controls in Fisqua mode', () => {
		expect(canCreateVolumes('admin', state())).toBe(true);
		expect(canImportList('admin', state())).toBe(true);
		expect(volumeCodesReadOnly('admin', state())).toBe(false);
	});

	it('gives reviewers neither, in any mode', () => {
		expect(canCreateVolumes('reviewer', state({ mode: 'offline' }))).toBe(false);
		expect(canImportList('reviewer', state({ mode: 'offline' }))).toBe(false);
	});

	it('leaves the controls as they were when the mode could not be read', () => {
		expect(canCreateVolumes('operator', null)).toBe(true);
		expect(canImportList('operator', null)).toBe(true);
		expect(volumeCodesReadOnly('operator', null)).toBe(false);
	});
});

describe('volumeBackPath', () => {
	it('returns to Volúmenes while projects are hidden, to the project otherwise', () => {
		expect(volumeBackPath(state({ projectsShown: false }), 7)).toBe('/dashboard/volumes');
		expect(volumeBackPath(state({ mode: 'offline', projectsEnabled: true, projectsShown: true }), 7)).toBe('/dashboard/projects/7');
		expect(volumeBackPath(null, 7)).toBe('/dashboard/projects/7');
	});
});

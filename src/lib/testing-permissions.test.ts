// What the testing account may do (NEH-391), decided in one place
// (unit-mode.ts), and the helpers of its screens (testing-space.ts).
//
// Version: 0.3.0
import { describe, expect, it } from 'vitest';
import {
	canCapture,
	canCreateProjects,
	canCreateVolumes,
	canDeleteVolumes,
	canEditVolumes,
	canSaveCameraSetup,
	inTestingSpace,
	setsVolumeCodes,
	takesPartInWorkflow,
	type UnitState
} from './unit-mode';
import { testingExpiry, testingRefusalText } from './testing-space';
import { en } from './i18n/en';
import { es } from './i18n/es';

const fisqua = {
	mode: 'fisqua',
	projectsEnabled: false,
	projectsShown: false,
	defaultProjectId: null,
	prerequisites: { backup: [], fisqua: [] },
	keptVolumes: []
} as UnitState;

describe("the testing account's permissions", () => {
	it('creates projects, as the administrator does, and nobody else', () => {
		expect(canCreateProjects('testing')).toBe(true);
		expect(canCreateProjects('admin')).toBe(true);
		expect(canCreateProjects('operator')).toBe(false);
		expect(canCreateProjects('reviewer')).toBe(false);
	});

	it('creates volumes in every mode', () => {
		expect(canCreateVolumes('testing', null)).toBe(true);
		expect(canCreateVolumes('testing', fisqua)).toBe(true);
		expect(canCreateVolumes('operator', fisqua)).toBe(false);
		expect(canCreateVolumes('operator', null)).toBe(true);
		expect(canCreateVolumes('reviewer', null)).toBe(false);
	});

	it('deletes volumes as an operator does, and does not edit them', () => {
		expect(canDeleteVolumes('testing')).toBe(true);
		expect(canDeleteVolumes('operator')).toBe(true);
		expect(canDeleteVolumes('reviewer')).toBe(false);
		expect(canEditVolumes('testing')).toBe(false);
		expect(canEditVolumes('operator')).toBe(true);
		expect(canEditVolumes('admin')).toBe(true);
	});

	it('captures, and saves nothing of the camera set-up', () => {
		expect(canCapture('testing')).toBe(true);
		expect(canCapture('operator')).toBe(true);
		expect(canCapture('admin')).toBe(true);
		expect(canCapture('reviewer')).toBe(false);
		expect(canSaveCameraSetup('testing')).toBe(false);
		expect(canSaveCameraSetup('operator')).toBe(true);
		expect(canSaveCameraSetup('admin')).toBe(true);
	});

	it('sets no volume codes and takes no part in the workflow of real work', () => {
		expect(setsVolumeCodes('testing')).toBe(false);
		expect(setsVolumeCodes('admin')).toBe(true);
		expect(takesPartInWorkflow('testing')).toBe(false);
		for (const role of ['admin', 'operator', 'reviewer'])
			expect(takesPartInWorkflow(role)).toBe(true);
		expect(inTestingSpace('testing')).toBe(true);
		expect(inTestingSpace('admin')).toBe(false);
		expect(inTestingSpace(undefined)).toBe(false);
	});
});

const err = (status: number, detail: unknown) =>
	Object.assign(new Error('Backend text'), { status, detail });

describe('testingRefusalText', () => {
	it('gives each refusal its own message', () => {
		expect(
			testingRefusalText(err(507, { code: 'testing_reserve', message: 'x' }), en, 'testing')
		).toBe(en.testing_err_reserve);
		expect(
			testingRefusalText(err(409, { code: 'project_directory_taken', message: 'x' }), en, 'testing')
		).toBe(en.testing_err_project_directory_taken);
		expect(
			testingRefusalText(err(422, { code: 'project_name_invalid', message: 'x' }), en, 'testing')
		).toBe(en.testing_err_project_name_invalid);
		expect(
			testingRefusalText(err(409, { code: 'testing_volume_codes', message: 'x' }), en, 'testing')
		).toBe(en.testing_err_volume_codes);
		expect(testingRefusalText(err(404, { code: 'not_found', message: 'x' }), en, 'testing')).toBe(
			en.testing_err_not_found
		);
		expect(
			testingRefusalText(err(409, { code: 'testing_volume_busy', message: 'x' }), en, 'testing')
		).toBe(en.testing_err_volume_busy);
	});

	it('is null for anything else', () => {
		expect(testingRefusalText(err(500, 'boom'), en, 'testing')).toBeNull();
		expect(testingRefusalText(err(409, { code: 'other' }), en, 'testing')).toBeNull();
		expect(testingRefusalText(new Error('x'), en, 'testing')).toBeNull();
		expect(testingRefusalText(null, en, 'testing')).toBeNull();
	});
});

describe('testingExpiry', () => {
	const now = new Date('2026-11-20T12:00:00Z');
	it('is null without a date', () => {
		expect(testingExpiry(null, now)).toBeNull();
		expect(testingExpiry(undefined, now)).toBeNull();
		expect(testingExpiry('not a date', now)).toBeNull();
	});
	it('is soon within seven days', () => {
		expect(testingExpiry('2026-11-26T12:00:00Z', now)?.soon).toBe(true);
		expect(testingExpiry('2026-11-27T12:00:00Z', now)?.soon).toBe(true);
		expect(testingExpiry('2026-11-28T12:00:01Z', now)?.soon).toBe(false);
		expect(testingExpiry('2026-11-19T12:00:00Z', now)?.soon).toBe(true);
	});
});

describe('testing_cameras_not_set_up', () => {
	it('sends the testing account to an administrator, and names no operator', () => {
		expect(en.testing_cameras_not_set_up.endsWith('Ask an administrator to set them up.')).toBe(
			true
		);
		expect(en.testing_cameras_not_set_up).not.toMatch(/operator/i);
		expect(es.testing_cameras_not_set_up).not.toMatch(/operari/i);
	});
});

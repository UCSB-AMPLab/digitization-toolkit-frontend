// The testing account's messages are its own (NEH-391): every other role
// gets the text it got before; the removal line's three states; and the role
// decisions of the testing slice, each in unit-mode.ts.
//
// Version: 0.3.0
import { describe, expect, it } from 'vitest';
import { volumeDeleteErrorText, volumeSaveErrorText } from './volume-errors';
import { captureErrorText } from './capture-errors';
import { testingExpiry } from './testing-space';
import {
	canDeleteProjects,
	canHandOver,
	canManageMembers,
	canManageOffsite,
	canFreeVolumes,
	canRestoreVolumes,
	canMarkMissing,
	canOverrideRecaptureTurn,
	canReview,
	canSeeCameraPanels,
	canKeepOnUnit,
	checksStemWithFisqua,
	opensUnitSettings
} from './unit-mode';
import { en } from './i18n/en';

const err = (status: number, detail: unknown, message = 'Backend text') =>
	Object.assign(new Error(message), { status, detail });
const notFound = () => err(404, { code: 'not_found', message: 'Not found.' }, 'Not found.');
const reserve = () => err(507, { code: 'testing_reserve', message: 'x' });
const codes = () => err(409, { code: 'testing_volume_codes', message: 'x' });

describe("the testing messages are the testing account's only", () => {
	it('volume save', () => {
		expect(volumeSaveErrorText(notFound(), en, 'testing')).toBe(en.testing_err_not_found);
		expect(volumeSaveErrorText(codes(), en, 'testing')).toBe(en.testing_err_volume_codes);
		for (const role of ['admin', 'operator', undefined]) {
			expect(volumeSaveErrorText(notFound(), en, role)).toBe(en.pd_err_create_collection);
			expect(volumeSaveErrorText(codes(), en, role)).toBe(en.pd_err_create_collection);
		}
	});

	it('volume delete', () => {
		expect(volumeDeleteErrorText(notFound(), en, 'testing')).toBe(en.testing_err_not_found);
		for (const role of ['admin', 'operator', undefined])
			expect(volumeDeleteErrorText(notFound(), en, role)).toBe(en.pd_err_delete_collection);
	});

	it('capture', () => {
		expect(captureErrorText(reserve(), en, 'testing')).toBe(en.testing_err_reserve);
		expect(captureErrorText(notFound(), en, 'testing')).toBe(en.testing_err_not_found);
		for (const role of ['admin', 'operator', undefined]) {
			expect(captureErrorText(reserve(), en, role)).toBe(en.lv_capture_error);
			expect(captureErrorText(notFound(), en, role)).toBe(en.lv_capture_error);
		}
	});
});

describe('testingExpiry at its boundaries', () => {
	const now = new Date('2026-11-20T12:00:00Z');
	const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
	const DAY = 24 * 60 * 60 * 1000;
	it('seven days and one second: normal', () => {
		expect(testingExpiry(at(7 * DAY + 1000), now)).toMatchObject({ soon: false, due: false });
	});
	it('exactly seven days: warning', () => {
		expect(testingExpiry(at(7 * DAY), now)).toMatchObject({ soon: true, due: false });
	});
	it('one second past: due', () => {
		expect(testingExpiry(at(-1000), now)).toMatchObject({ soon: true, due: true });
	});
});

describe('the role decisions of the slice', () => {
	const roles = ['admin', 'operator', 'reviewer', 'testing', undefined] as const;
	const table = (f: (r: string | undefined) => boolean) => roles.map((r) => f(r));
	it('as the screens decided them inline', () => {
		expect(table(canReview)).toEqual([true, false, true, false, false]);
		expect(table(canMarkMissing)).toEqual([true, true, false, false, false]);
		expect(table(canManageMembers)).toEqual([true, false, false, false, false]);
		expect(table(canDeleteProjects)).toEqual([true, false, false, true, false]);
		expect(table(canHandOver)).toEqual([true, true, false, false, false]);
		expect(table(canManageOffsite)).toEqual([true, false, false, false, false]);
		expect(table(canFreeVolumes)).toEqual([true, true, false, false, false]);
		expect(table(canRestoreVolumes)).toEqual([true, false, false, false, false]);
		expect(table(canOverrideRecaptureTurn)).toEqual([true, false, false, false, false]);
		expect(table(canSeeCameraPanels)).toEqual([true, true, false, false, false]);
		expect(table(canKeepOnUnit)).toEqual([true, false, false, false, false]);
		expect(table(checksStemWithFisqua)).toEqual([true, false, false, false, false]);
		expect(table(opensUnitSettings)).toEqual([true, false, false, false, false]);
	});
});

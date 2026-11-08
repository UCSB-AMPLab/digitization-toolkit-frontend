// Keeping a volume on the unit, and releasing it (NEH-320): which action the
// volume page offers, and the message for each refusal.
//
// Version: 0.3.3

import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { keptActionErrorText, keptActionOf } from './kept-volumes';
import type { VolumeOffsiteState } from '$lib/api';

function volume(over: Partial<VolumeOffsiteState> = {}): VolumeOffsiteState {
	return {
		collection_id: 7,
		filename_stem: 'co-ahrb-aht-003',
		uploadable: true,
		total: 12,
		verified: 0,
		pending: 12,
		refused: 0,
		last_verified_at: null,
		received: false,
		refusals: [],
		kept_on_unit: false,
		...over
	};
}

class ApiError extends Error {
	detail?: unknown;
	status?: number;
	constructor(message: string, detail?: unknown, status?: number) {
		super(message);
		this.detail = detail;
		this.status = status;
	}
}

describe('keptActionOf', () => {
	it('offers an admin the release of a kept volume', () => {
		expect(keptActionOf(volume({ kept_on_unit: true, pending: 0 }), true, 'backup')).toBe('release');
	});

	it('offers an admin to keep a volume nothing of which is offsite', () => {
		expect(keptActionOf(volume(), true)).toBe('keep');
	});

	it('offers no keep once a file is verified or freed', () => {
		expect(keptActionOf(volume({ verified: 1 }), true)).toBeNull();
		expect(keptActionOf(volume({ freed_files: 1 }), true)).toBeNull();
	});

	it('offers no release until the mode is known, and the keep before it is', () => {
		expect(keptActionOf(volume({ kept_on_unit: true, pending: 0 }), true)).toBeNull();
		expect(keptActionOf(volume({ kept_on_unit: true, pending: 0 }), true, null)).toBeNull();
		expect(keptActionOf(volume(), true, null)).toBe('keep');
	});

	it('offers no release in Scanner only mode, and the keep in every mode', () => {
		expect(keptActionOf(volume({ kept_on_unit: true, pending: 0 }), true, 'offline')).toBeNull();
		expect(keptActionOf(volume({ kept_on_unit: true, pending: 0 }), true, 'backup')).toBe('release');
		expect(keptActionOf(volume({ kept_on_unit: true, pending: 0 }), true, 'fisqua')).toBe('release');
		for (const mode of ['offline', 'backup', 'fisqua'] as const) {
			expect(keptActionOf(volume(), true, mode)).toBe('keep');
		}
	});

	it('offers nothing to anyone but an admin, nor with an older backend', () => {
		expect(keptActionOf(volume({ kept_on_unit: true }), false)).toBeNull();
		expect(keptActionOf(volume(), false)).toBeNull();
		const older = volume();
		delete older.kept_on_unit;
		expect(keptActionOf(older, true)).toBeNull();
		expect(keptActionOf(null, true)).toBeNull();
	});
});

describe('keptActionErrorText', () => {
	it('has a message for each refusal of the two routes', () => {
		const e = (code: string) => new ApiError('x', { code, message: 'English' }, 409);
		expect(keptActionErrorText(e('already_left_unit'), es)).toBe(es.kept_err_already_left);
		expect(keptActionErrorText(e('already_kept_on_unit'), es)).toBe(es.kept_err_already_kept);
		expect(keptActionErrorText(e('not_kept_on_unit'), es)).toBe(es.kept_err_not_kept);
		expect(keptActionErrorText(e('kept_parent'), es)).toBe(es.kept_err_kept_parent);
	});

	it("shows Fisqua's refusal of a release in Fisqua mode", () => {
		const unknown = new ApiError('x', { code: 'unknown_reference_code', message: 'English', referenceCode: 'co-x-1' }, 422);
		expect(keptActionErrorText(unknown, es)).toBe(es.pd_err_unknown_reference_code('co-x-1'));
		const down = new ApiError('x', { code: 'fisqua_unreachable', message: 'English', referenceCode: 'co-x-1' }, 409);
		expect(keptActionErrorText(down, es)).toBe(es.pd_fisqua_unreachable_title);
	});

	it('has a generic message for anything else, never the English', () => {
		expect(keptActionErrorText(new ApiError('Boom', 'Boom', 500), es)).toBe(es.kept_err_other);
		expect(keptActionErrorText(new Error('Boom'), es)).toBe(es.kept_err_other);
	});
});

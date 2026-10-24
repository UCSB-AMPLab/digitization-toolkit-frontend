import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import { isNotEmptyRefusal, notEmptyCounts, volumeDeleteErrorText, volumeSaveErrorText } from './volume-errors';

// A stand-in for api.ts's ApiError, as in volume-stem.test.ts.
class ApiError extends Error {
	detail?: unknown;
	status?: number;
	constructor(message: string, detail?: unknown, status?: number) {
		super(message);
		this.name = 'ApiError';
		this.detail = detail;
		this.status = status;
	}
}

const notEmpty =
	'Cannot delete a non-empty collection: 0 sub-collection(s) and 3 record(s) remain. Move or delete them first.';

describe('volumeSaveErrorText', () => {
	it('maps the stem and constraint 409s to their messages', () => {
		const dup = new ApiError('x', { message: 'x', constraint: 'collections_filename_stem_key' }, 409);
		expect(volumeSaveErrorText(dup, es)).toBe(es.pd_err_stem_taken);
		const range = new ApiError('x', { message: 'x', constraint: 'check_collection_date_range' }, 409);
		expect(volumeSaveErrorText(range, es)).toBe(es.pd_val_date_range);
		const pattern = new ApiError('x', { message: 'x', constraint: 'check_collection_filename_stem_pattern' }, 409);
		expect(volumeSaveErrorText(pattern, es)).toBe(es.pd_val_stem_pattern);
		const length = new ApiError('x', { message: 'x', constraint: 'check_collection_filename_stem_length' }, 409);
		expect(volumeSaveErrorText(length, es)).toBe(es.pd_val_stem_too_long(27));
	});

	it('gives anything else the generic message, without the backend text', () => {
		for (const err of [
			new ApiError('Project 9 not found', undefined, 404),
			new ApiError('x', { message: 'x', constraint: 'ix_collections_external_id' }, 409),
			new Error('Failed to fetch'),
			'boom'
		]) {
			expect(volumeSaveErrorText(err, es)).toBe(es.pd_err_create_collection);
		}
		expect(volumeSaveErrorText(new Error('x'), en)).toBe(en.pd_err_create_collection);
	});
});

describe('volumeDeleteErrorText', () => {
	it('maps the non-empty refusal', () => {
		const err = new ApiError(notEmpty, undefined, 409);
		expect(isNotEmptyRefusal(err)).toBe(true);
		expect(volumeDeleteErrorText(err, es)).toBe(es.pd_err_delete_not_empty);
	});

	it('reads both counts from the not-empty refusal', () => {
		expect(notEmptyCounts(new ApiError(notEmpty, undefined, 409))).toEqual({ subVolumes: 0, records: 3 });
		expect(notEmptyCounts(new ApiError('Cannot delete a non-empty collection', undefined, 409))).toBeNull();
		expect(notEmptyCounts(new Error('x'))).toBeNull();
	});

	it('says sub-volumes block the delete when there are no records', () => {
		const subs =
			'Cannot delete a non-empty collection: 2 sub-collection(s) and 0 record(s) remain. Move or delete them first.';
		expect(volumeDeleteErrorText(new ApiError(subs, undefined, 409), es)).toBe(es.pd_err_delete_has_subvolumes);
	});

	it('maps the reserved-stem refusal', () => {
		const message =
			'This volume has a file name stem and has captured images, so it cannot be ' +
			'deleted; it keeps its stem so the name is never issued again.';
		expect(volumeDeleteErrorText(new ApiError(message, { message }, 409), es)).toBe(es.pd_delete_stem_reserved);
	});

	it('gives anything else the generic message, without the backend text', () => {
		const files = 'Collection directory still holds files referenced by other records. Move those records first.';
		for (const err of [new ApiError(files, undefined, 409), new ApiError(notEmpty, undefined, 500), new Error('x')]) {
			expect(volumeDeleteErrorText(err, es)).toBe(es.pd_err_delete_collection);
		}
	});
});

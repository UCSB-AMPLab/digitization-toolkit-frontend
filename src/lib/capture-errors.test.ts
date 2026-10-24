import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import { CaptureFailed, captureErrorText, isStemRequired } from './capture-errors';

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

// The backend's texts, as app/core/volume_stem.py and app/api/cameras.py send them.
const NO_VOLUME = 'Captures must go into a volume.';
const NO_STEM = 'This volume has no file name stem. Give it one before capturing into it.';
const RETAKE_VOLUME = "A retake must go into the record's own volume.";
const MODE_DUAL = "Record 12 was captured in 'dual' mode; use the dual-capture endpoint to recapture it.";
const NAME_TOO_LONG =
	"This capture's file name would be longer than the 36 characters a pair id holds. Nothing was captured.";
const MODE_SINGLE = "Record 12 was captured in 'single' mode; use the single-capture endpoint to recapture it.";

describe('captureErrorText', () => {
	it('maps each capture refusal to its own message', () => {
		const cases: [unknown, string][] = [
			[new ApiError(NO_VOLUME, undefined, 409), es.lv_err_no_volume],
			[new ApiError(NO_STEM, undefined, 409), es.lv_needs_stem],
			[new ApiError(RETAKE_VOLUME, undefined, 409), es.lv_err_retake_volume],
			[new ApiError('Collection 7 not found', undefined, 404), es.lv_err_volume_not_found],
			[new ApiError('Record 12 not found', undefined, 404), es.lv_err_record_not_found],
			[new ApiError(MODE_DUAL, undefined, 422), es.lv_err_retake_mode('dual')],
			[new ApiError(MODE_SINGLE, undefined, 422), es.lv_err_retake_mode('single')],
			[new CaptureFailed('Camera 1 is not connected'), es.lv_err_camera_not_connected(1)],
			[new ApiError(NAME_TOO_LONG, undefined, 409), es.lv_err_name_too_long]
		];
		for (const [error, text] of cases) expect(captureErrorText(error, es)).toBe(text);
	});

	it('uses the catalogue of the language asked for', () => {
		expect(captureErrorText(new ApiError(NO_VOLUME, undefined, 409), en)).toBe(en.lv_err_no_volume);
		expect(captureErrorText(new CaptureFailed('Camera 0 is not connected'), en)).toBe(
			en.lv_err_camera_not_connected(0)
		);
	});

	it('matches a refusal only on its status as well as its text', () => {
		expect(captureErrorText(new ApiError(NO_VOLUME, undefined, 422), es)).toBe(es.lv_capture_error);
		expect(captureErrorText(new ApiError('Collection 7 not found', undefined, 409), es)).toBe(es.lv_capture_error);
		expect(captureErrorText(new ApiError(MODE_DUAL, undefined, 409), es)).toBe(es.lv_capture_error);
		expect(captureErrorText(new Error(RETAKE_VOLUME), es)).toBe(es.lv_capture_error);
		expect(captureErrorText(new ApiError(NAME_TOO_LONG, undefined, 422), es)).toBe(es.lv_capture_error);
	});

	it('gives anything else the generic message, never the backend text', () => {
		for (const error of [
			new CaptureFailed('Dual capture failed on camera(s) cam1: DSLR capture failed: timeout'),
			new CaptureFailed('A file named co-x-img_0001_c0 already exists in /data/projects/co-x/captures'),
			new CaptureFailed(undefined),
			new CaptureFailed(null),
			new ApiError('Collection 7 is not attached to a project', undefined, 422),
			new ApiError('Some other conflict', { message: 'Some other conflict' }, 409),
			new ApiError('Internal Server Error', undefined, 500),
			new Error('Failed to fetch'),
			'boom',
			null
		]) {
			expect(captureErrorText(error, es)).toBe(es.lv_capture_error);
		}
	});
});

describe('isStemRequired', () => {
	it('recognises the no-stem 409 by its exact text', () => {
		expect(isStemRequired(new ApiError(NO_STEM, undefined, 409))).toBe(true);
		expect(isStemRequired(new ApiError(NO_STEM, undefined, 422))).toBe(false);
		expect(isStemRequired(new ApiError(NO_VOLUME, undefined, 409))).toBe(false);
	});
});

describe('the capture error strings', () => {
	it('end without a full stop, since lvm_retake_error puts them inside a sentence', () => {
		for (const msgs of [es, en]) {
			for (const text of [
				msgs.lv_err_no_volume,
				msgs.lv_err_volume_not_found,
				msgs.lv_err_record_not_found,
				msgs.lv_err_retake_volume,
				msgs.lv_err_retake_mode('dual'),
				msgs.lv_err_retake_mode('single'),
				msgs.lv_err_camera_not_connected(0),
				msgs.lv_err_name_too_long
			]) {
				expect(text.endsWith('.')).toBe(false);
			}
		}
	});
});

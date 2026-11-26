// Version: 0.3.0

import { describe, expect, it, vi } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import {
	CaptureFailed,
	CaptureNotSaved,
	CaptureOutcomeUnknown,
	captureErrorText,
	isStemRequired
} from './capture-errors';

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
const MODE_DUAL =
	"Record 12 was captured in 'dual' mode; use the dual-capture endpoint to recapture it.";
const NAME_TOO_LONG =
	"This capture's file name would be longer than the 36 characters a pair id holds. Nothing was captured.";
const NUMBERS_TAKEN =
	'The next capture numbers of this volume are already taken by files on disk. Nothing was captured.';
const CAPTURE_LIMIT =
	'This volume has reached the limit of 9999 captures. A new volume is needed. Nothing was captured.';
const RESOLUTION =
	"A capture's file name cannot carry its resolution: the exchange contract fixes the name.";
const RETAKE_STATUS = 'Only a captured or rejected record can be retaken.';
const MODE_SINGLE =
	"Record 12 was captured in 'single' mode; use the single-capture endpoint to recapture it.";

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
			[new ApiError(NAME_TOO_LONG, undefined, 409), es.lv_err_name_too_long],
			[new ApiError(NUMBERS_TAKEN, undefined, 409), es.lv_err_numbers_taken],
			[new ApiError(CAPTURE_LIMIT, undefined, 409), es.lv_err_capture_limit],
			[new ApiError(RESOLUTION, undefined, 422), es.lv_err_resolution_in_name],
			[new ApiError(RETAKE_STATUS, undefined, 409), es.lv_err_retake_status]
		];
		for (const [error, text] of cases) expect(captureErrorText(error, es)).toBe(text);
	});

	it('a capture the check after a timeout did not find: the not-saved message (NEH-381)', () => {
		expect(captureErrorText(new CaptureNotSaved(), es)).toBe(es.lv_capture_not_saved);
		expect(captureErrorText(new CaptureNotSaved(), en)).toBe(en.lv_capture_not_saved);
	});

	it('a capture whose fate the check could not learn: the unknown message, never not saved (NEH-401)', () => {
		for (const attempt of ['new', 'retake', 'another'] as const) {
			for (const single of [true, false]) {
				const error = new CaptureOutcomeUnknown(attempt, single);
				expect(captureErrorText(error, es)).toBe(es.lv_capture_unknown(attempt, single));
				expect(captureErrorText(error, en)).toBe(en.lv_capture_unknown(attempt, single));
				expect(en.lv_capture_unknown(attempt, single)).not.toBe(en.lv_capture_not_saved);
			}
		}
	});

	it('an unknown outcome found later runs the clears registered by the places that show it, once', () => {
		const error = new CaptureOutcomeUnknown('new', false);
		const a = vi.fn();
		const b = vi.fn();
		error.whenFound(a);
		error.whenFound(b);
		expect(a).not.toHaveBeenCalled();
		error.markFound();
		error.markFound();
		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
		// A place registered after it was found clears at once.
		const late = vi.fn();
		error.whenFound(late);
		expect(late).toHaveBeenCalledTimes(1);
	});

	it('the unknown message names what to check, by the kind of attempt and the mode', () => {
		const start = 'Captua could not find out whether the capture was saved. ';
		expect(en.lv_capture_unknown('new', false)).toBe(
			start + 'Check the last opening in the volume before you capture again.'
		);
		expect(en.lv_capture_unknown('new', true)).toBe(
			start + 'Check the last image in the volume before you capture again.'
		);
		expect(en.lv_capture_unknown('retake', false)).toBe(
			start + 'Check this opening before you capture it again.'
		);
		expect(en.lv_capture_unknown('retake', true)).toBe(
			start + 'Check this image before you capture it again.'
		);
		expect(en.lv_capture_unknown('another', false)).toBe(
			start + 'Check the openings around this one before you capture again.'
		);
		expect(en.lv_capture_unknown('another', true)).toBe(
			start + 'Check the images around this one before you capture again.'
		);
		expect(es.lv_capture_unknown('new', false)).toBe(
			'Captua no pudo comprobar si la captura se guardó. Revisa el último par de páginas del volumen antes de volver a capturar.'
		);
		const all = (['new', 'retake', 'another'] as const).flatMap((a) =>
			[true, false].map((single) => es.lv_capture_unknown(a, single))
		);
		expect(new Set(all).size).toBe(6);
	});

	it('a 409 capture_abandoned: the not-saved message (NEH-401)', () => {
		const abandoned = new ApiError('x', { code: 'capture_abandoned', message: 'x' }, 409);
		expect(captureErrorText(abandoned, en)).toBe(en.lv_capture_not_saved);
		expect(captureErrorText(abandoned, es)).toBe(es.lv_capture_not_saved);
	});

	it("the backend's refusals of a capture id: the generic message (NEH-401)", () => {
		for (const code of ['client_capture_id_in_use', 'capture_no_longer_stored']) {
			const refusal = new ApiError(
				'This capture id was already used.',
				{ code, message: 'x' },
				409
			);
			expect(captureErrorText(refusal, en)).toBe(en.lv_capture_error);
			expect(captureErrorText(refusal, es)).toBe(es.lv_capture_error);
		}
	});

	it('uses the catalogue of the language asked for', () => {
		expect(captureErrorText(new ApiError(NO_VOLUME, undefined, 409), en)).toBe(en.lv_err_no_volume);
		expect(captureErrorText(new CaptureFailed('Camera 0 is not connected'), en)).toBe(
			en.lv_err_camera_not_connected(0)
		);
	});

	it('matches a refusal only on its status as well as its text', () => {
		expect(captureErrorText(new ApiError(NO_VOLUME, undefined, 422), es)).toBe(es.lv_capture_error);
		expect(captureErrorText(new ApiError('Collection 7 not found', undefined, 409), es)).toBe(
			es.lv_capture_error
		);
		expect(captureErrorText(new ApiError(MODE_DUAL, undefined, 409), es)).toBe(es.lv_capture_error);
		expect(captureErrorText(new ApiError(CAPTURE_LIMIT, undefined, 422), es)).toBe(
			es.lv_capture_error
		);
		expect(captureErrorText(new Error(RETAKE_VOLUME), es)).toBe(es.lv_capture_error);
		expect(captureErrorText(new ApiError(NAME_TOO_LONG, undefined, 422), es)).toBe(
			es.lv_capture_error
		);
	});

	it('gives anything else the generic message, never the backend text', () => {
		for (const error of [
			new CaptureFailed('Dual capture failed on camera(s) cam1: DSLR capture failed: timeout'),
			new CaptureFailed(
				'A file named co-x-img_0001_c0 already exists in /data/projects/co-x/captures'
			),
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

describe('the recapture turn refusal (0.2.0)', () => {
	it('is read by its code, whatever the English text says', () => {
		const refusal = new ApiError(
			'Anything at all.',
			{ code: 'recapture_turn', message: 'Anything at all.' },
			409
		);
		expect(captureErrorText(refusal, es)).toBe(es.err_recapture_turn);
		expect(captureErrorText(refusal, en)).toBe(en.err_recapture_turn);
		expect(es.err_recapture_turn).toBe(
			'No se pudo empezar el volumen: es turno de recapturas. Termina las recapturas de un volumen e intenta de nuevo.'
		);
	});
});

describe('captureErrorText: the storage reserve (NEH-380)', () => {
	const refusal = () =>
		new ApiError(
			'nearly full',
			{ code: 'storage_reserve', message: 'nearly full', free_gb: 1.9, reserve_gb: 2 },
			507
		);

	it('tells an administrator and an operator to free space in Settings > Storage', () => {
		for (const msgs of [es, en]) {
			expect(captureErrorText(refusal(), msgs, 'admin')).toBe(msgs.lv_err_storage_reserve_free);
			expect(captureErrorText(refusal(), msgs, 'operator')).toBe(msgs.lv_err_storage_reserve_free);
		}
		expect(es.lv_err_storage_reserve_free).toContain('Configuración › Almacenamiento');
		expect(en.lv_err_storage_reserve_free).toContain('Settings › Storage');
	});

	it('tells every other role to ask an administrator or an operator', () => {
		for (const msgs of [es, en]) {
			for (const role of ['reviewer', 'testing', null, undefined]) {
				expect(captureErrorText(refusal(), msgs, role)).toBe(msgs.lv_err_storage_reserve);
			}
		}
	});

	it('is matched on the code and the 507, not on the text', () => {
		const other = new ApiError('nearly full', { code: 'storage_reserve' }, 409);
		expect(captureErrorText(other, es, 'admin')).toBe(es.lv_capture_error);
		const testing = new ApiError('x', { code: 'testing_reserve' }, 507);
		expect(captureErrorText(testing, es, 'admin')).toBe(es.lv_capture_error);
		expect(captureErrorText(testing, es, 'testing')).toBe(es.testing_err_reserve);
	});

	it('ends without a full stop, as the other capture errors do', () => {
		for (const msgs of [es, en]) {
			expect(msgs.lv_err_storage_reserve_free.endsWith('.')).toBe(false);
			expect(msgs.lv_err_storage_reserve.endsWith('.')).toBe(false);
		}
	});
});

describe('captureErrorText: a volume closed by a move of its captures (NEH-419)', () => {
	it('says the captures went into another volume, in both languages, for every role', () => {
		const refusal = () =>
			new ApiError('English', { code: 'captures_adopted_away', message: 'English' }, 409);
		for (const msgs of [es, en]) {
			for (const role of ['admin', 'operator']) {
				expect(captureErrorText(refusal(), msgs, role)).toBe(msgs.adopt_closed_refusal);
			}
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
	it('end without a full stop, as lv_capture_error does in the capture banner', () => {
		for (const msgs of [es, en]) {
			for (const text of [
				msgs.lv_err_no_volume,
				msgs.lv_err_volume_not_found,
				msgs.lv_err_record_not_found,
				msgs.lv_err_retake_volume,
				msgs.lv_err_retake_mode('dual'),
				msgs.lv_err_retake_mode('single'),
				msgs.lv_err_camera_not_connected(0),
				msgs.lv_err_name_too_long,
				msgs.lv_err_numbers_taken,
				msgs.lv_err_resolution_in_name,
				msgs.lv_err_retake_status
			]) {
				expect(text.endsWith('.')).toBe(false);
			}
		}
	});
});

describe('lvm_retake_error', () => {
	it('reads as sentences whether or not the message ends with a full stop', () => {
		for (const msgs of [es, en]) {
			for (const message of [
				msgs.lv_needs_stem,
				msgs.lv_capture_error,
				msgs.lv_err_retake_volume
			]) {
				const text = msgs.lvm_retake_error(message);
				expect(text).not.toContain('..');
				expect(text).toContain(message.endsWith('.') ? message : `${message}.`);
			}
		}
		expect(es.lvm_retake_error(es.lv_needs_stem)).toBe(
			'No se pudo volver a capturar el registro. Para capturar imágenes de este volumen, primero hay que asignarle una raíz. Se conservaron las imágenes originales.'
		);
	});
});

// Catalogue messages for every error a capture or a retake gets from the
// backend (POST /cameras/capture and /cameras/capture/dual in
// app/api/cameras.py). The backend's English text is never shown: each known
// case has its own message, anything else gets lv_capture_error, and the
// caller logs the original error to the console.
//
// Two kinds of failure reach the capture screen:
// - a refused request, thrown by api.ts as an ApiError carrying `status`
//   and the backend's `detail` as its message: the 409s for no volume, no
//   stem, a retake into another volume and a retake of a record in review
//   or approved (app/core/volume_stem.py), the
//   409s for a name longer than a pair id, for numbers already on disk and
//   for a volume at its 9999-capture limit (app/core/capture_naming.py), the
//   404s for an unknown volume or record, and the 422s for a retake in the
//   wrong capture mode and for a resolution in the file name;
// - a request answered 200 with `success: false`, which the capture screen
//   turns into a CaptureFailed carrying the backend's `error`: a camera that
//   is not connected, or the text of whatever failed during the capture.
//
// The backend texts are matched exactly or by their fixed start, so a change
// on the backend falls through to the generic message instead of being shown
// as the wrong one. No import of api.ts, so the tests run in plain node:
// errors are matched by shape (`status`, `message`), as volume-stem.ts does.

import type { Messages } from './i18n';
import { isConflict, isVolumeRequired, isWrongRetakeVolume } from './volume-stem';

// STEM_REQUIRED_DETAIL in app/core/volume_stem.py.
const STEM_REQUIRED_DETAIL = 'This volume has no file name stem. Give it one before capturing into it.';

// CAPTURE_NAME_TOO_LONG_DETAIL in app/core/capture_naming.py: the 409 for a
// capture whose `<stem>-img_<nnnn>` would be longer than a pair id holds.
const NAME_TOO_LONG_DETAIL =
	"This capture's file name would be longer than the 36 characters a pair id holds. Nothing was captured.";

// CAPTURE_NUMBERS_TAKEN_DETAIL in app/core/capture_naming.py: the 409 for a
// volume whose next capture numbers files on disk already carry.
const NUMBERS_TAKEN_DETAIL =
	'The next capture numbers of this volume are already taken by files on disk. Nothing was captured.';

// CAPTURE_LIMIT_DETAIL in app/core/capture_naming.py: the 409 for a volume
// whose next capture would pass its 9999th.
const CAPTURE_LIMIT_DETAIL =
	'This volume has reached the limit of 9999 captures. A new volume is needed. Nothing was captured.';

// RESOLUTION_IN_FILENAME_DETAIL in app/core/capture_naming.py: the 422 for a
// capture that asks for its resolution in the file name. The capture screen
// never asks for it; the mapping is there so the text is never shown.
const RESOLUTION_IN_FILENAME_DETAIL =
	"A capture's file name cannot carry its resolution: the exchange contract fixes the name.";

// RETAKE_STATUS_DETAIL in app/core/volume_stem.py: the 409 for a retake of a
// record that is in review or approved.
const RETAKE_STATUS_DETAIL = 'Only a captured or rejected record can be retaken.';

// The 404 details in app/api/cameras.py: "Collection {id} not found" from
// _refuse_capture_without_volume_or_stem, "Record {id} not found" from the
// retake lookup.
const VOLUME_NOT_FOUND = /^Collection \d+ not found$/;
const RECORD_NOT_FOUND = /^Record \d+ not found$/;

// The 422 for a retake in the other capture mode: "Record {id} was captured
// in '{mode}' mode; use the ...-capture endpoint to recapture it."
const RETAKE_MODE = /^Record \d+ was captured in '(single|dual)' mode;/;

// The `error` of a 200 with success false when a camera is not connected.
const CAMERA_NOT_CONNECTED = /^Camera (\d+) is not connected$/;

/** A capture the backend answered with `success: false`; `backendError` is its `error`, never shown. */
export class CaptureFailed extends Error {
	backendError?: string;
	constructor(backendError?: string | null) {
		super(backendError || 'Capture failed');
		this.name = 'CaptureFailed';
		this.backendError = backendError ?? undefined;
	}
}

function statusOf(error: unknown): unknown {
	return typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
}

/** Whether a capture was refused with the backend's 409 for a volume without a stem. */
export function isStemRequired(error: unknown): boolean {
	return isConflict(error) && error instanceof Error && error.message === STEM_REQUIRED_DETAIL;
}

/** The catalogue message for a failed capture or retake. */
export function captureErrorText(error: unknown, msgs: Messages): string {
	if (error instanceof CaptureFailed) {
		const camera = error.backendError?.match(CAMERA_NOT_CONNECTED);
		if (camera) return msgs.lv_err_camera_not_connected(Number(camera[1]));
		return msgs.lv_capture_error;
	}
	if (!(error instanceof Error)) return msgs.lv_capture_error;
	if (isVolumeRequired(error)) return msgs.lv_err_no_volume;
	if (isStemRequired(error)) return msgs.lv_needs_stem;
	if (isWrongRetakeVolume(error)) return msgs.lv_err_retake_volume;
	const status = statusOf(error);
	if (status === 409 && error.message === RETAKE_STATUS_DETAIL) return msgs.lv_err_retake_status;
	if (status === 409 && error.message === NAME_TOO_LONG_DETAIL) return msgs.lv_err_name_too_long;
	if (status === 409 && error.message === NUMBERS_TAKEN_DETAIL) return msgs.lv_err_numbers_taken;
	if (status === 409 && error.message === CAPTURE_LIMIT_DETAIL) return msgs.lv_err_capture_limit;
	if (status === 404 && VOLUME_NOT_FOUND.test(error.message)) return msgs.lv_err_volume_not_found;
	if (status === 404 && RECORD_NOT_FOUND.test(error.message)) return msgs.lv_err_record_not_found;
	if (status === 422 && error.message === RESOLUTION_IN_FILENAME_DETAIL) return msgs.lv_err_resolution_in_name;
	const mode = status === 422 ? error.message.match(RETAKE_MODE) : null;
	if (mode) return msgs.lv_err_retake_mode(mode[1] as 'single' | 'dual');
	return msgs.lv_capture_error;
}

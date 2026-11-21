// The testing account's screens (NEH-391): the catalogue message for each
// refusal the backend gives it, whether the cameras offer a choice of
// capture format, and when a testing volume is removed.
//
// The refusals carry a `{code, message}` detail (app/core/testing_space.py,
// app/core/project_names.py); they are matched on the code and status, and
// the backend's English text is never shown. Which role may do what is
// decided in unit-mode.ts, not here.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`).
//
// Version: 0.1.3

import type { Messages } from './i18n';
import { parseApiDate } from './pipeline';
import { inTestingSpace } from './unit-mode';

// Each refusal code at the status the backend gives it.
const REFUSALS: { [code: string]: { status: number[]; key: keyof Messages } } = {
	testing_reserve: { status: [507], key: 'testing_err_reserve' },
	project_directory_taken: { status: [409], key: 'testing_err_project_directory_taken' },
	project_name_invalid: { status: [422], key: 'testing_err_project_name_invalid' },
	testing_volume_codes: { status: [409], key: 'testing_err_volume_codes' },
	not_found: { status: [404], key: 'testing_err_not_found' },
	capture_format_unavailable: { status: [422], key: 'testing_err_capture_format_unavailable' },
	testing_volume_busy: { status: [409], key: 'testing_err_volume_busy' },
	usb_not_eligible: { status: [422], key: 'testing_usb_err_not_eligible' },
	usb_copy_busy: { status: [409], key: 'testing_usb_err_copy_busy' }
};

/** The code of a refusal with a `{code}` detail, or null. */
function refusalCode(error: unknown): { status: unknown; code: string } | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (typeof e.detail !== 'object' || e.detail === null || Array.isArray(e.detail)) return null;
	const code = (e.detail as { code?: unknown }).code;
	return typeof code === 'string' ? { status: e.status, code } : null;
}

/**
 * The message for a refusal of the testing account's (not enough space kept
 * for real work, a project name, a volume code, something outside the
 * testing space), or null for any other error, which the caller shows with
 * its own generic line. Null for every role but the testing account: an
 * administrator who names testing material gets the text it always got.
 */
export function testingRefusalText(error: unknown, msgs: Messages, role: string | null | undefined): string | null {
	if (!inTestingSpace(role)) return null;
	const found = refusalCode(error);
	if (!found) return null;
	const refusal = REFUSALS[found.code];
	if (!refusal || !refusal.status.includes(found.status as number)) return null;
	return msgs[refusal.key] as string;
}

// The failure codes of a copy to a USB drive, each with its message: the refusals of the start and the job's own codes.
const USB_FAILURES: { [code: string]: keyof Messages } = {
	usb_not_eligible: 'testing_usb_err_not_eligible',
	usb_copy_busy: 'testing_usb_err_copy_busy',
	usb_mount: 'testing_usb_err_mount',
	usb_full: 'testing_usb_err_full',
	usb_write: 'testing_usb_err_write',
	usb_name: 'testing_usb_err_name',
	usb_unmount: 'testing_usb_err_unmount',
	usb_volume_empty: 'testing_usb_err_volume_empty',
	usb_real_volume: 'testing_usb_err_real_volume',
	usb_read: 'testing_usb_err_read',
	usb_exists: 'testing_usb_err_exists',
	// Refusals of the start that are not usb_ codes.
	testing_volume_busy: 'testing_usb_err_volume_busy',
	not_found: 'testing_err_not_found'
};

/** The `detail.code` of a refusal of the start of a USB copy, or null. */
export function usbFailureCode(error: unknown): string | null {
	return refusalCode(error)?.code ?? null;
}

/** The message for a USB copy's failure code (from a refusal or from the job's status), or null for another code. */
export function usbFailureText(code: string | null | undefined, msgs: Messages): string | null {
	const key = code ? USB_FAILURES[code] : undefined;
	return key ? (msgs[key] as string) : null;
}

// The refusals of DELETE /projects/{id} carry no code: the backend sends
// fixed English text, so they are matched on status and that text (its fixed
// start for the first), as volume-refusals.ts does.
const PROJECT_NOT_EMPTY = /^Cannot delete a non-empty project: /;
const PROJECT_FILES_HELD = [
	'Project directory still holds files referenced by other records. Move those records first.',
	'Project directory holds a capture manifest other than its own. Move it out first.'
];

/**
 * The message for a refused delete of a testing project, for the testing
 * account: a project that still has volumes or records, files a volume
 * still holds, a storage drive that cannot be read (503), or one of the
 * coded refusals. Any other failure gets the generic testing line, so the
 * backend's English is never shown. Null for every other role.
 */
export function testingProjectDeleteText(error: unknown, msgs: Messages, role: string | null | undefined): string | null {
	if (!inTestingSpace(role)) return null;
	const coded = testingRefusalText(error, msgs, role);
	if (coded) return coded;
	const e = typeof error === 'object' && error !== null ? (error as { status?: unknown; message?: unknown }) : {};
	const text = typeof e.message === 'string' ? e.message : '';
	if (e.status === 503) return msgs.testing_err_project_storage;
	if (e.status === 409 && PROJECT_NOT_EMPTY.test(text)) return msgs.testing_err_project_not_empty;
	if (e.status === 409 && PROJECT_FILES_HELD.includes(text)) return msgs.testing_err_project_files_held;
	if (e.status === 404) return msgs.testing_err_not_found;
	return msgs.testing_err_other;
}

/** Whether an error is the 507 for captures refused below the reserve kept for real work. */
export function isTestingReserve(error: unknown): boolean {
	const found = refusalCode(error);
	return found?.code === 'testing_reserve' && found.status === 507;
}

/**
 * Whether the unit's cameras offer the choice of a testing project's capture
 * format: their `image_formats` (GET /cameras/capabilities) hold both JPEG
 * and RAW+JPEG.
 */
export function offersFormatChoice(imageFormats: string[] | null | undefined): boolean {
	return !!imageFormats && imageFormats.includes('JPEG') && imageFormats.includes('RAW+JPEG');
}

// Within this many days of its removal a volume's expiry line takes the warning colour.
export const EXPIRY_WARNING_DAYS = 7;

/**
 * When a testing volume is removed, from its `testing_expires_at`: the date;
 * `soon` within EXPIRY_WARNING_DAYS of it, and after it; `due` once it has
 * passed, when the backend removes the volume at its next clean-up. Null
 * without a readable date.
 */
export function testingExpiry(
	expiresAt: string | null | undefined,
	now: Date = new Date()
): { at: Date; soon: boolean; due: boolean } | null {
	if (!expiresAt) return null;
	const at = parseApiDate(expiresAt);
	if (Number.isNaN(at.getTime())) return null;
	const left = at.getTime() - now.getTime();
	return { at, soon: left <= EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000, due: left < 0 };
}

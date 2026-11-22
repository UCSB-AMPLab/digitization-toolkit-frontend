// The testing account's screens (NEH-391): the catalogue message for each
// refusal the backend gives it, whether the cameras offer a choice of
// capture format, and when a testing volume is removed.
//
// The refusals carry a `{code, message}` detail (app/core/testing_space.py,
// app/core/project_names.py, and delete_project in app/api/projects.py); they
// are matched on the code and status, and the backend's English text is never
// shown. The one refusal of a project delete without a code, a storage drive
// that cannot be read, is matched on its 503 status. Which role may do what is
// decided in unit-mode.ts, not here.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`).
//
// Version: 0.3.0

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
	usb_copy_busy: { status: [409], key: 'testing_usb_err_copy_busy' },
	// DELETE /projects/{id}: a capture manifest that is not the project's own is shown like files other records use.
	project_not_empty: { status: [409], key: 'testing_err_project_not_empty' },
	project_files_held: { status: [409], key: 'testing_err_project_files_held' },
	project_manifest_foreign: { status: [409], key: 'testing_err_project_files_held' },
	project_manifest_keep_failed: { status: [500], key: 'testing_err_other' },
	project_files_remove_failed: { status: [500], key: 'testing_err_other' }
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
export function testingRefusalText(
	error: unknown,
	msgs: Messages,
	role: string | null | undefined
): string | null {
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

/**
 * The message for a refused delete of a testing project, for the testing
 * account: chosen by the refusal's code (a project that still has volumes or
 * records, files a volume still holds, a capture manifest that is not its
 * own, a failure of the disk), by the 503 for a storage drive that cannot be
 * read (its detail is a plain string; the backend sends a 503 on this route
 * only for that), or by the 404 for a project that is gone. Any other failure
 * gets the generic testing line, so the backend's English is never shown.
 * Null for every other role.
 */
export function testingProjectDeleteText(
	error: unknown,
	msgs: Messages,
	role: string | null | undefined
): string | null {
	if (!inTestingSpace(role)) return null;
	const coded = testingRefusalText(error, msgs, role);
	if (coded) return coded;
	const status =
		typeof error === 'object' && error !== null
			? (error as { status?: unknown }).status
			: undefined;
	if (status === 503) return msgs.testing_err_project_storage;
	if (status === 404) return msgs.testing_err_not_found;
	return msgs.testing_err_other;
}

/**
 * The translated sentence for a coded refusal of a project delete, for the
 * Projects list's error line, or null for a refusal with no code or a code
 * not listed, or a not-empty refusal whose counts are missing, not numbers or both 0
 * (the caller then shows the backend's message).
 */
export function projectDeleteRefusalText(error: unknown, msgs: Messages): string | null {
	const found = refusalCode(error);
	if (!found || found.status !== 409) return null;
	const detail = (error as { detail: { collections?: unknown; records?: unknown } }).detail;
	if (found.code === 'project_not_empty') {
		if (typeof detail.collections !== 'number' || typeof detail.records !== 'number') return null;
		if (detail.collections <= 0 && detail.records <= 0) return null;
		return msgs.proj_err_delete_not_empty(detail.collections, detail.records);
	}
	if (found.code === 'project_files_held') return msgs.proj_err_delete_files_held;
	if (found.code === 'project_manifest_foreign') return msgs.proj_err_delete_manifest_foreign;
	return null;
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

// Catalogue messages for the refusals a volume's records and files get from
// the backend while something else is changing the volume:
// - the 422 of a reorder whose list does not name every record of the volume
//   exactly once (REORDER_IDS_MESSAGE in app/core/record_sequence.py),
//   which happens when records were added or removed meanwhile;
// - the 409 of a reorder or a renumber while records kept being added to the
//   volume (VOLUME_CHANGED_MESSAGE in app/core/record_sequence.py);
// - the 409s of a request that moves, renames or deletes files while an
//   export or the offsite upload reads them (app/core/export_jobs.py,
//   EXPORT_IN_SUBTREE_MESSAGE in app/api/collections.py and
//   EXPORT_IN_PROJECT_MESSAGE in app/api/projects.py), and the 409 of an
//   export asked for while files are being changed (FILES_CHANGING_MESSAGE);
// - the 409 of a move of records whose files are already stored offsite
//   under their volume (STORED_OFFSITE_MESSAGE in app/core/image_upload.py,
//   and the move-records refusal in app/api/collections.py).
//
// The backend sends these as fixed English text with no code, so they are
// matched on status plus the exact text (or its fixed start), as
// capture-errors.ts does: a change on the backend falls through to the
// caller's generic message instead of being shown as the wrong one. No import
// of api.ts, so the tests run in plain node.
//
// Version: 0.1.0-beta

import type { Messages } from './i18n';

const REORDER_IDS_MESSAGE = 'ordered_ids must name every record of the volume exactly once.';
const VOLUME_CHANGED_MESSAGE = 'The volume changed while it was being renumbered. Try again.';

const FILES_BEING_READ_MESSAGE =
	'Captua is preparing a file of this volume for the offsite copy. Try again in a moment.';
const EXPORT_RUNNING_MESSAGE = 'An export of this collection is running. Wait for it to finish, then try again.';
const EXPORT_IN_SUBTREE_MESSAGE =
	'An export of this collection, or of a collection inside it, is running. Wait for it to finish, then try again.';
const EXPORT_IN_PROJECT_MESSAGE =
	'An export of a collection in this project is running. Wait for it to finish, then try again.';
const FILES_CHANGING_MESSAGE =
	'The files of this collection are being moved or renamed. Try the export again in a moment.';

// The 409 of PATCH /records/{id} that moves a record to another volume.
const STORED_OFFSITE_MESSAGE =
	"This record's files are already stored offsite under this volume, so it cannot be moved to another volume.";
// The start of the move-records 409; the rest carries the count and the ids.
const STORED_OFFSITE_MOVE = /^Cannot move: \d+ record\(s\) have files already stored offsite under this volume: /;

function refusal(error: unknown, status: number): string | null {
	if (!(error instanceof Error)) return null;
	return (error as Error & { status?: unknown }).status === status ? error.message : null;
}

/** Whether a reorder was refused because its list does not match the volume's records. */
export function isReorderStale(error: unknown): boolean {
	return refusal(error, 422) === REORDER_IDS_MESSAGE;
}

/** Whether a reorder or a renumber was refused because records kept being added to the volume. */
export function isVolumeBusy(error: unknown): boolean {
	return refusal(error, 409) === VOLUME_CHANGED_MESSAGE;
}

/** The message for a failed reorder. The caller reloads the order in every case. */
export function reorderErrorText(error: unknown, msgs: Messages): string {
	if (isReorderStale(error)) return msgs.col_reorder_stale;
	if (isVolumeBusy(error)) return msgs.vol_err_volume_busy;
	return msgs.col_reorder_error;
}

/** The message for a failed renumber. */
export function renumberErrorText(error: unknown, msgs: Messages): string {
	if (isVolumeBusy(error)) return msgs.vol_err_volume_busy;
	return msgs.col_renumber_error;
}

/**
 * The message for a request refused because an export or the offsite upload
 * is reading the files it would change, or null for any other error. On the
 * projects page, `scope` 'project' words the offsite case for a volume of the
 * project, since the request there is about the project.
 */
export function fileHoldText(error: unknown, msgs: Messages, scope: 'volume' | 'project' = 'volume'): string | null {
	switch (refusal(error, 409)) {
		case FILES_BEING_READ_MESSAGE:
			return scope === 'project' ? msgs.vol_err_files_being_read_project : msgs.vol_err_files_being_read;
		case EXPORT_RUNNING_MESSAGE:
			return msgs.vol_err_export_running;
		case EXPORT_IN_SUBTREE_MESSAGE:
			return msgs.vol_err_export_in_subtree;
		case EXPORT_IN_PROJECT_MESSAGE:
			return msgs.vol_err_export_in_project;
		case FILES_CHANGING_MESSAGE:
			return msgs.vol_err_files_changing;
	}
	return null;
}

/**
 * How many records a move was refused for because their files are already
 * stored offsite under their volume, or null for any other error: 1 for the
 * single-record refusal, the length of `blocking_record_ids` for the
 * move-records one.
 */
export function storedOffsiteCount(error: unknown): number | null {
	const message = refusal(error, 409);
	if (message === null) return null;
	if (message === STORED_OFFSITE_MESSAGE) return 1;
	if (!STORED_OFFSITE_MOVE.test(message)) return null;
	const detail = (error as { detail?: unknown }).detail;
	const ids = typeof detail === 'object' && detail !== null ? (detail as { blocking_record_ids?: unknown }).blocking_record_ids : undefined;
	return Array.isArray(ids) && ids.length > 0 ? ids.length : null;
}

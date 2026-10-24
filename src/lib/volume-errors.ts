// Catalogue messages for the errors the volume form and the volume delete
// get from the backend. The backend's English text is never shown: each known
// case has its own message, anything else gets a generic one, and the caller
// logs the original error to the console.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`, `message`), as volume-stem.ts does.

import type { Messages } from './i18n';
import { FILENAME_STEM_MAX_LENGTH, stemConflict, stemConflictText } from './volume-stem';

// Constraint names app/core/db_errors.py reports in a 409's `constraint`.
function constraintOf(error: unknown): unknown {
	if (typeof error !== 'object' || error === null) return undefined;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409 || typeof e.detail !== 'object' || e.detail === null) return undefined;
	return (e.detail as { constraint?: unknown }).constraint;
}

/** The message for a failed create or update of a volume. */
export function volumeSaveErrorText(error: unknown, msgs: Messages): string {
	const conflict = stemConflict(error);
	if (conflict) return stemConflictText(conflict, msgs);
	switch (constraintOf(error)) {
		case 'check_collection_date_range':
			return msgs.pd_val_date_range;
		case 'check_collection_filename_stem_pattern':
			return msgs.pd_val_stem_pattern;
		case 'check_collection_filename_stem_length':
			return msgs.pd_val_stem_too_long(FILENAME_STEM_MAX_LENGTH);
	}
	return msgs.pd_err_create_collection;
}

// The start of the backend's 409 detail for a volume that still holds
// records or sub-volumes (delete_collection in app/api/collections.py). The
// rest of the text carries the counts, so only the start is matched.
const NOT_EMPTY_PREFIX = 'Cannot delete a non-empty collection';

/** Whether a delete was refused because the volume still has records or sub-volumes. */
export function isNotEmptyRefusal(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error as Error & { status?: unknown }).status === 409 &&
		error.message.startsWith(NOT_EMPTY_PREFIX)
	);
}

// The counts in that detail: "... {n} sub-collection(s) and {m} record(s) remain ...".
const NOT_EMPTY_COUNTS = /(\d+) sub-collection\(s\) and (\d+) record\(s\)/;

/**
 * The sub-volume and record counts a not-empty refusal reports, or null for
 * any other error. Both are null-safe: a detail without parsable counts
 * gives null, and the caller treats the refusal as one about records.
 */
export function notEmptyCounts(error: unknown): { subVolumes: number; records: number } | null {
	if (!isNotEmptyRefusal(error)) return null;
	const match = (error as Error).message.match(NOT_EMPTY_COUNTS);
	if (!match) return null;
	return { subVolumes: Number(match[1]), records: Number(match[2]) };
}

/** The message for a failed delete (or the move of records before it). */
export function volumeDeleteErrorText(error: unknown, msgs: Messages): string {
	const conflict = stemConflict(error);
	if (conflict) return stemConflictText(conflict, msgs);
	if (isNotEmptyRefusal(error)) {
		const counts = notEmptyCounts(error);
		if (counts && counts.records === 0 && counts.subVolumes > 0) return msgs.pd_err_delete_has_subvolumes;
		return msgs.pd_err_delete_not_empty;
	}
	return msgs.pd_err_delete_collection;
}

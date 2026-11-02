// Catalogue messages for the errors the volume form and the volume delete
// get from the backend. The backend's English text is never shown: each known
// case has its own message, anything else gets a generic one, and the caller
// logs the original error to the console.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`, `message`), as volume-stem.ts does.
//
// Version: 0.3.3

import type { Messages } from './i18n';
import { FILENAME_STEM_MAX_LENGTH, stemConflict, stemConflictText } from './volume-stem';
import { fileHoldText, storedOffsiteCount } from './volume-refusals';

// Constraint names app/core/db_errors.py reports in a 409's `constraint`.
function constraintOf(error: unknown): unknown {
	if (typeof error !== 'object' || error === null) return undefined;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409 || typeof e.detail !== 'object' || e.detail === null) return undefined;
	return (e.detail as { constraint?: unknown }).constraint;
}

/**
 * A volume's reference code and stem that would differ: the backend's 409
 * (ReferenceCodeDiffersFromStemError, app/main.py) carries both values in
 * its detail, {message, reason, external_id, filename_stem}. Null for any
 * other error.
 */
export function referenceCodeDiffers(error: unknown): { externalId: string; stem: string } | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409 || typeof e.detail !== 'object' || e.detail === null) return null;
	const d = e.detail as { reason?: unknown; external_id?: unknown; filename_stem?: unknown };
	if (d.reason !== 'reference_code_differs_from_stem') return null;
	if (typeof d.external_id !== 'string' || typeof d.filename_stem !== 'string') return null;
	return { externalId: d.external_id, stem: d.filename_stem };
}

// Fisqua mode's refusals of a volume create or update (NEH-311,
// app/api/collections.py): each code at the status the backend gives it.
const FISQUA_REFUSALS: { [code: string]: number } = {
	volumes_from_fisqua: 403,
	unknown_reference_code: 422,
	stem_required: 422,
	fisqua_no_lookup: 409,
	fisqua_unreachable: 409
};

export type FisquaVolumeRefusal =
	| { code: 'volumes_from_fisqua' | 'stem_required' | 'fisqua_no_lookup' | 'fisqua_unreachable' }
	| { code: 'unknown_reference_code'; referenceCode: string };

/**
 * A volume save refused in Fisqua mode: an operator (403
 * volumes_from_fisqua), a code Fisqua does not know (422, with the code), a
 * stem cleared (422 stem_required), or no answer from Fisqua (409
 * fisqua_no_lookup, fisqua_unreachable). Null for any other error.
 */
export function fisquaVolumeRefusal(error: unknown): FisquaVolumeRefusal | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (typeof e.detail !== 'object' || e.detail === null || Array.isArray(e.detail)) return null;
	const d = e.detail as { code?: unknown; referenceCode?: unknown };
	if (typeof d.code !== 'string' || FISQUA_REFUSALS[d.code] !== e.status) return null;
	if (d.code === 'unknown_reference_code') {
		return typeof d.referenceCode === 'string' ? { code: d.code, referenceCode: d.referenceCode } : null;
	}
	return { code: d.code as Exclude<FisquaVolumeRefusal['code'], 'unknown_reference_code'> };
}

/** The message for a Fisqua-mode refusal. */
export function fisquaRefusalText(refusal: FisquaVolumeRefusal, msgs: Messages): string {
	switch (refusal.code) {
		case 'volumes_from_fisqua': return msgs.pd_err_volumes_from_fisqua;
		case 'unknown_reference_code': return msgs.pd_err_unknown_reference_code(refusal.referenceCode);
		case 'stem_required': return msgs.pd_err_stem_required_fisqua;
		case 'fisqua_no_lookup': return msgs.pd_fisqua_no_lookup_title;
		case 'fisqua_unreachable': return msgs.pd_fisqua_unreachable_title;
	}
}

/** The message for a failed create or update of a volume. */
export function volumeSaveErrorText(error: unknown, msgs: Messages): string {
	const fisqua = fisquaVolumeRefusal(error);
	if (fisqua) return fisquaRefusalText(fisqua, msgs);
	const differs = referenceCodeDiffers(error);
	if (differs) return msgs.pd_err_stem_differs_from_reference_code(differs.externalId, differs.stem);
	const conflict = stemConflict(error);
	if (conflict) return stemConflictText(conflict, msgs);
	const hold = fileHoldText(error, msgs);
	if (hold) return hold;
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

/**
 * How many records blocked a move because they were handed over for review:
 * the length of `blocking_record_ids` in the move-records 409 (NEH-260), or
 * null for any other error. The 409 for records stored offsite carries
 * `blocking_record_ids` too, and is told apart by its text.
 */
export function moveBlockedCount(error: unknown): number | null {
	if (typeof error !== 'object' || error === null) return null;
	if (storedOffsiteCount(error) !== null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409 || typeof e.detail !== 'object' || e.detail === null) return null;
	const ids = (e.detail as { blocking_record_ids?: unknown }).blocking_record_ids;
	return Array.isArray(ids) && ids.length > 0 ? ids.length : null;
}

/** The message for a failed delete (or the move of records before it). */
export function volumeDeleteErrorText(error: unknown, msgs: Messages): string {
	const conflict = stemConflict(error);
	if (conflict) return stemConflictText(conflict, msgs);
	const stored = storedOffsiteCount(error);
	if (stored !== null) return msgs.vol_err_stored_offsite(stored);
	const hold = fileHoldText(error, msgs);
	if (hold) return hold;
	const blocked = moveBlockedCount(error);
	if (blocked !== null) return msgs.pd_err_move_under_review(blocked);
	if (isNotEmptyRefusal(error)) {
		const counts = notEmptyCounts(error);
		if (counts && counts.records === 0 && counts.subVolumes > 0) return msgs.pd_err_delete_has_subvolumes;
		return msgs.pd_err_delete_not_empty;
	}
	return msgs.pd_err_delete_collection;
}

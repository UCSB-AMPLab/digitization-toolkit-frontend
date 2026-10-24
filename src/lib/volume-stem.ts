// The volume's file name stem ("raíz" in the interface): the client-side copy
// of the backend's rule, and the mapping from the backend's 409s about stems
// to catalogue messages.
//
// The rule mirrors FILENAME_STEM_PATTERN and FILENAME_STEM_MAX_LENGTH in the
// backend's app/models/collection.py, which app/schemas/collection.py applies
// with a 422 and the table's CHECKs apply to every other writer. Keep the
// three in step.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`), as login-error.ts does.

import type { Messages } from './i18n';

export const FILENAME_STEM_MAX_LENGTH = 27;
export const FILENAME_STEM_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type StemProblem = 'required' | 'too_long' | 'pattern';

/**
 * What is wrong with a stem as typed, or null when it is acceptable.
 *
 * The value is checked after trimming, since surrounding whitespace is never
 * part of a stem; the caller sends the trimmed value. An empty value is a
 * problem only when `required` (a new volume); an existing volume without a
 * stem can be saved without one.
 */
export function stemProblem(value: string, required: boolean): StemProblem | null {
	const stem = value.trim();
	if (stem === '') return required ? 'required' : null;
	if (stem.length > FILENAME_STEM_MAX_LENGTH) return 'too_long';
	if (!FILENAME_STEM_PATTERN.test(stem)) return 'pattern';
	return null;
}

export function stemProblemText(problem: StemProblem, msgs: Messages): string {
	switch (problem) {
		case 'required':
			return msgs.pd_val_stem_required;
		case 'too_long':
			return msgs.pd_val_stem_too_long(FILENAME_STEM_MAX_LENGTH);
		case 'pattern':
			return msgs.pd_val_stem_pattern;
	}
}

// The backend's English texts for the 409s that carry no constraint name,
// identical to those in app/api/collections.py (_immutable_message) and
// app/models/collection.py (STEM_RESERVED_MESSAGE). Matched exactly, so a
// change on the backend falls through to the generic message instead of
// being shown as the wrong one.
const STEM_FIXED_MESSAGE =
	'The volume has already captured images, so its file name stem cannot be changed.';
const STEM_RESERVED_MESSAGE =
	'This volume has a file name stem and has captured images, so it cannot be ' +
	'deleted; it keeps its stem so the name is never issued again.';

// The unique constraint on collections.filename_stem, as app/core/db_errors.py
// reports it in the 409's `constraint` field on both Postgres and SQLite.
const STEM_UNIQUE_CONSTRAINT = 'collections_filename_stem_key';

export type StemConflict = 'stem_taken' | 'stem_fixed' | 'stem_reserved';

function conflictDetail(error: unknown): { message?: unknown; constraint?: unknown } | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409) return null;
	if (typeof e.detail !== 'object' || e.detail === null) return null;
	return e.detail as { message?: unknown; constraint?: unknown };
}

/** Which stem 409 an error from the collections API is, or null for any other error. */
export function stemConflict(error: unknown): StemConflict | null {
	const detail = conflictDetail(error);
	if (!detail) return null;
	if (detail.constraint === STEM_UNIQUE_CONSTRAINT) return 'stem_taken';
	if (detail.message === STEM_FIXED_MESSAGE) return 'stem_fixed';
	if (detail.message === STEM_RESERVED_MESSAGE) return 'stem_reserved';
	return null;
}

export function stemConflictText(conflict: StemConflict, msgs: Messages): string {
	switch (conflict) {
		case 'stem_taken':
			return msgs.pd_err_stem_taken;
		case 'stem_fixed':
			return msgs.pd_err_stem_fixed;
		case 'stem_reserved':
			return msgs.pd_delete_stem_reserved;
	}
}

// The 409 a capture or upload gets when it names no volume, identical to
// VOLUME_REQUIRED_DETAIL in the backend's app/core/volume_stem.py. A plain
// string detail, so ApiError carries it as its message.
const VOLUME_REQUIRED_DETAIL = 'Captures must go into a volume.';

/** Whether a capture was refused because it named no volume. */
export function isVolumeRequired(error: unknown): boolean {
	return isConflict(error) && error instanceof Error && error.message === VOLUME_REQUIRED_DETAIL;
}

// The 409 a retake gets when it names a volume other than its record's,
// identical to RETAKE_VOLUME_DETAIL in the backend's app/core/volume_stem.py.
const RETAKE_VOLUME_DETAIL = "A retake must go into the record's own volume.";

/** Whether a retake was refused because it named a volume other than its record's. */
export function isWrongRetakeVolume(error: unknown): boolean {
	return isConflict(error) && error instanceof Error && error.message === RETAKE_VOLUME_DETAIL;
}

/** Whether an error is an HTTP 409, matched by shape (ApiError carries `status`). */
export function isConflict(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { status?: unknown }).status === 409
	);
}

/** Whether a volume has no stem yet, and so cannot capture. */
export function needsStem(volume: { filename_stem?: string | null } | null | undefined): boolean {
	return !!volume && !volume.filename_stem;
}

/**
 * Whether the delete flow must refuse this volume before doing anything:
 * the backend refuses to delete a volume whose stem is reserved, so moving
 * its records out first would leave them moved and the volume still there.
 */
export function deleteRefused(volume: { stem_reserved?: boolean } | null | undefined): boolean {
	return !!volume?.stem_reserved;
}

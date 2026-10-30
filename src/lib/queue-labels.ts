// Interface text for a digitisation list's action field, and for the
// reasons an import skips an item. The codes come from the list file and
// from app/core/list_import.py's REASONS; a code the catalogue does not know
// is shown as it comes rather than hidden.
//
// Version: 0.2.0

import type { Messages } from '$lib/i18n';

const ACTION_KEYS: { [action: string]: keyof Messages } = {
	'spot-recapture': 'queue_action_spot_recapture',
	'full-rescan': 'queue_action_full_rescan',
	'full-digitisation': 'queue_action_full_digitisation',
	complete: 'queue_action_complete'
};

/** The label of a list item's action; an unknown value is returned as given. */
export function actionLabel(m: Messages, action: string): string {
	const key = ACTION_KEYS[action];
	return key ? (m[key] as string) : action;
}

const REASON_KEYS: { [reason: string]: keyof Messages } = {
	item_not_an_object: 'queue_reason_item_not_an_object',
	missing_reference_code: 'queue_reason_missing_reference_code',
	invalid_reference_code: 'queue_reason_invalid_reference_code',
	reference_code_padded: 'queue_reason_reference_code_padded',
	reference_code_duplicated_in_list: 'queue_reason_reference_code_duplicated_in_list',
	missing_filename_stem: 'queue_reason_missing_filename_stem',
	filename_stem_not_a_slug: 'queue_reason_filename_stem_not_a_slug',
	filename_stem_too_long: 'queue_reason_filename_stem_too_long',
	filename_stem_differs_from_reference_code: 'queue_reason_filename_stem_differs_from_reference_code',
	filename_stem_duplicated_in_list: 'queue_reason_filename_stem_duplicated_in_list',
	missing_title: 'queue_reason_missing_title',
	invalid_title: 'queue_reason_invalid_title',
	invalid_dates: 'queue_reason_invalid_dates',
	end_date_before_start: 'queue_reason_end_date_before_start',
	invalid_sequence: 'queue_reason_invalid_sequence',
	reference_code_on_unit: 'queue_reason_reference_code_on_unit',
	filename_stem_on_unit: 'queue_reason_filename_stem_on_unit',
	refused_by_database: 'queue_reason_refused_by_database',
	filename_stem_is_project_directory: 'queue_reason_filename_stem_is_project_directory',
	filename_stem_directory_occupied: 'queue_reason_filename_stem_directory_occupied',
	filename_stem_held_offsite: 'queue_reason_filename_stem_held_offsite'
};

/** The plain-language reason an import skipped an item. */
export function importReasonText(m: Messages, reason: string): string {
	const key = REASON_KEYS[reason];
	return key ? (m[key] as string) : m.queue_reason_unknown(reason);
}

/** The interface text for an import the backend refused, by HTTP status. */
export function importErrorText(m: Messages, status: number | undefined): string {
	switch (status) {
		case 400: return m.queue_import_err_unreadable;
		case 403: return m.queue_import_err_needs_admin;
		case 409: return m.queue_import_err_list_reused;
		case 413: return m.queue_import_err_too_large;
		case 422: return m.queue_import_err_refused;
		case 503: return m.queue_import_err_busy;
		default: return m.queue_import_err_other;
	}
}

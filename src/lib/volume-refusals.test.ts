// Version: 0.2.1

import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import {
	fileHoldText,
	isReorderStale,
	isVolumeBusy,
	excludedRefusalText,
	renumberErrorText,
	reorderErrorText,
	storedOffsiteCount
} from './volume-refusals';

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

// The backend's texts, as app/core/record_sequence.py, app/core/export_jobs.py,
// app/core/image_upload.py, app/api/collections.py and app/api/projects.py send them.
const REORDER_IDS = 'ordered_ids must name every record of the volume exactly once.';
const VOLUME_CHANGED = 'The volume changed while it was being renumbered. Try again.';
const FILES_BEING_READ = 'Captua is preparing a file of this volume for the offsite copy. Try again in a moment.';
const EXPORT_RUNNING = 'An export of this collection is running. Wait for it to finish, then try again.';
const EXPORT_IN_SUBTREE =
	'An export of this collection, or of a collection inside it, is running. Wait for it to finish, then try again.';
const EXPORT_IN_PROJECT =
	'An export of a collection in this project is running. Wait for it to finish, then try again.';
const FILES_CHANGING = 'The files of this collection are being moved or renamed. Try the export again in a moment.';
const STORED_OFFSITE =
	"This record's files are already stored offsite under this volume, so it cannot be moved to another volume.";
const storedOffsiteMove = (ids: number[]) =>
	`Cannot move: ${ids.length} record(s) have files already stored offsite under this volume: [${ids.join(', ')}].`;

describe('reorderErrorText', () => {
	it('tells the person the order changed elsewhere for the 422 of a stale list', () => {
		const err = new ApiError(REORDER_IDS, REORDER_IDS, 422);
		expect(isReorderStale(err)).toBe(true);
		expect(reorderErrorText(err, es)).toBe(es.col_reorder_stale);
		expect(reorderErrorText(err, en)).toBe(en.col_reorder_stale);
	});

	it('maps the 409 of a volume that kept changing', () => {
		const err = new ApiError(VOLUME_CHANGED, VOLUME_CHANGED, 409);
		expect(isVolumeBusy(err)).toBe(true);
		expect(reorderErrorText(err, es)).toBe(es.vol_err_volume_busy);
	});

	it('gives anything else the generic message, never the backend text', () => {
		for (const err of [
			new ApiError(REORDER_IDS, REORDER_IDS, 409),
			new ApiError(VOLUME_CHANGED, VOLUME_CHANGED, 422),
			new ApiError('[{"loc":["body","ordered_ids"]}]', [], 422),
			new ApiError('Collection 4 not found', undefined, 404),
			new Error('Failed to fetch'),
			'boom'
		]) {
			expect(reorderErrorText(err, es)).toBe(es.col_reorder_error);
		}
	});
});

describe('renumberErrorText', () => {
	it('maps the 409 of a volume that kept changing', () => {
		expect(renumberErrorText(new ApiError(VOLUME_CHANGED, VOLUME_CHANGED, 409), es)).toBe(es.vol_err_volume_busy);
	});

	it('gives anything else a whole sentence with no backend text in it', () => {
		const failed = new ApiError('The database update failed, so no record was renumbered. Please retry', undefined, 500);
		expect(renumberErrorText(failed, es)).toBe(es.col_renumber_error);
		expect(renumberErrorText(new Error('Failed to fetch'), en)).toBe(en.col_renumber_error);
		expect(typeof es.col_renumber_error).toBe('string');
	});
});

describe('fileHoldText', () => {
	it('maps each hold 409 to its message', () => {
		expect(fileHoldText(new ApiError(FILES_BEING_READ, FILES_BEING_READ, 409), es)).toBe(es.vol_err_files_being_read);
		expect(fileHoldText(new ApiError(EXPORT_RUNNING, EXPORT_RUNNING, 409), es)).toBe(es.vol_err_export_running);
		expect(fileHoldText(new ApiError(EXPORT_IN_SUBTREE, EXPORT_IN_SUBTREE, 409), es)).toBe(
			es.vol_err_export_in_subtree
		);
		expect(fileHoldText(new ApiError(EXPORT_IN_PROJECT, EXPORT_IN_PROJECT, 409), es)).toBe(
			es.vol_err_export_in_project
		);
		expect(fileHoldText(new ApiError(FILES_CHANGING, FILES_CHANGING, 409), es)).toBe(es.vol_err_files_changing);
	});

	it('words the files-being-read refusal for a project when asked to', () => {
		const err = new ApiError(FILES_BEING_READ, FILES_BEING_READ, 409);
		expect(fileHoldText(err, es, 'project')).toBe(es.vol_err_files_being_read_project);
		expect(fileHoldText(err, en, 'project')).toBe(en.vol_err_files_being_read_project);
	});

	it('is null for anything else', () => {
		expect(fileHoldText(new ApiError(FILES_BEING_READ, FILES_BEING_READ, 500), es)).toBeNull();
		expect(fileHoldText(new ApiError('Something else', undefined, 409), es)).toBeNull();
		expect(fileHoldText(new Error(FILES_BEING_READ), es)).toBeNull();
		expect(fileHoldText(null, es)).toBeNull();
	});
});

describe('storedOffsiteCount', () => {
	it('counts one record for the single-record move refusal', () => {
		expect(storedOffsiteCount(new ApiError(STORED_OFFSITE, STORED_OFFSITE, 409))).toBe(1);
	});

	it('counts the blocking records of the move-records refusal', () => {
		const message = storedOffsiteMove([3, 8, 9]);
		const err = new ApiError(message, { message, blocking_record_ids: [3, 8, 9] }, 409);
		expect(storedOffsiteCount(err)).toBe(3);
	});

	it('is null for the handed-over refusal, which carries blocking_record_ids too', () => {
		const message = 'Cannot move: 2 record(s) have been handed over for review: [4, 5]. Take this collection back first.';
		expect(storedOffsiteCount(new ApiError(message, { message, blocking_record_ids: [4, 5] }, 409))).toBeNull();
	});

	it('is null for anything else', () => {
		expect(storedOffsiteCount(new ApiError(STORED_OFFSITE, STORED_OFFSITE, 422))).toBeNull();
		expect(storedOffsiteCount(new Error(STORED_OFFSITE))).toBeNull();
		expect(storedOffsiteCount('boom')).toBeNull();
	});
});

// The 409s for a record Fisqua excluded (contract 1.6), as app/api/records.py
// sends them: an upload, refused for every role, and a delete of the record or
// of one of its images, refused for every role but admin.
const UPLOAD_EXCLUDED = "Cannot add an image to a record with status 'excluded': Fisqua excluded it from the volume.";
const DELETE_RECORD_EXCLUDED =
	"Cannot delete a record with status 'excluded': Fisqua excluded it from the volume, and only an admin can delete it.";
const DELETE_IMAGE_EXCLUDED =
	"Cannot delete an image from a record with status 'excluded': Fisqua excluded it from the volume, and only an admin can delete it.";

describe('excludedRefusalText', () => {
	it('maps the upload 409 to err_upload_excluded', () => {
		expect(excludedRefusalText(new ApiError(UPLOAD_EXCLUDED, undefined, 409), es)).toBe(es.err_upload_excluded);
		expect(excludedRefusalText(new ApiError(UPLOAD_EXCLUDED, undefined, 409), en)).toBe(en.err_upload_excluded);
	});

	it('maps both delete 409s to err_delete_excluded', () => {
		expect(excludedRefusalText(new ApiError(DELETE_RECORD_EXCLUDED, undefined, 409), es)).toBe(es.err_delete_excluded);
		expect(excludedRefusalText(new ApiError(DELETE_IMAGE_EXCLUDED, undefined, 409), en)).toBe(en.err_delete_excluded);
	});

	it('leaves the other delete 409 and other statuses alone', () => {
		const locked = "Cannot delete a record with status 'approved'. Move it to 'rejected' first.";
		expect(excludedRefusalText(new ApiError(locked, undefined, 409), es)).toBeNull();
		expect(excludedRefusalText(new ApiError(UPLOAD_EXCLUDED, undefined, 422), es)).toBeNull();
		expect(excludedRefusalText(new Error(UPLOAD_EXCLUDED), es)).toBeNull();
	});
});

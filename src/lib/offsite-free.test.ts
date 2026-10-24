import { describe, expect, it, vi } from 'vitest';
import { es } from './i18n/es';
import { en } from './i18n/en';
import type {
	FreePlan,
	OffsiteFileEntry,
	OffsiteJobResult,
	OffsiteJobStart,
	OffsiteJobStatus,
	VolumeOffsiteState
} from '$lib/api';
import {
	freedCountsChanged,
	freedCountsOf,
	freedExportCount,
	isJobLost,
	offsiteActionErrorText,
	offsiteJobErrorText,
	offsiteOffer,
	planSummary,
	pollOffsiteJob,
	refusalLines,
	resultSummary,
	runOffsiteJob
} from './offsite-free';

// A stand-in for api.ts's ApiError, as in volume-refusals.test.ts.
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

// The backend's texts, as app/core/offsite_free.py, app/core/export_jobs.py
// and app/core/storage_override.py send them.
const NO_STEM =
	'This volume has no file name stem, so none of its files are stored offsite and none can be freed or restored.';
const NOT_RECEIVED =
	'Not every file of this volume is verified in the offsite bucket yet, so its files cannot be freed from the card. Wait for the upload to finish.';
const EXPORT = 'An export of this volume is queued or running. Wait for it to finish, then try again.';
const FILES_BEING_READ = 'Captua is preparing a file of this volume for the offsite copy. Try again in a moment.';
const LISTING =
	'The offsite bucket could not be listed, so nothing could be checked against it and nothing was freed. Try again later.';
const NO_READ_REMOTE =
	'Restore is not set up on this unit: it needs read access to the offsite bucket (DTK_OFFSITE_READ_REMOTE), and none is configured.';
const NOT_IN_OWN_FOLDER =
	"Some of this volume's files have not yet been moved into the volume's own folder, so its files cannot be freed from the card or restored. Captua moves them the next time it starts. If they are still not moved after a restart, the backend's log says why (for example, the folder already holds files that are not this volume's); once that is cleared and Captua has restarted, the volume can be freed.";
const JOB_RUNNING = 'Files of this volume are already being freed or restored. Wait for that to finish.';
const DRIVE_UNAVAILABLE =
	'The storage drive set for projects is not available. Connect and activate the drive, or revert to internal storage, then try again.';
const NOT_A_DIRECTORY =
	'The storage path set for projects is not a directory. Activate the drive again, or revert to internal storage, then try again.';
const NOT_MOUNTED =
	'The storage path set for projects is not on a mounted drive. Connect and activate the drive, or revert to internal storage, then try again.';

const refused409 = (message: string, extra: object = {}) => new ApiError(message, { message, ...extra }, 409);

describe('offsiteActionErrorText', () => {
	it('maps each 409 of the free, the dry run and the restore', () => {
		expect(offsiteActionErrorText(refused409(NO_STEM), 'free', es)).toBe(es.offsite_err_no_stem);
		expect(offsiteActionErrorText(refused409(NOT_RECEIVED, { total: 4, verified: 3 }), 'plan', es)).toBe(
			es.offsite_err_not_received
		);
		expect(offsiteActionErrorText(refused409(EXPORT), 'free', es)).toBe(es.vol_err_export_running);
		expect(offsiteActionErrorText(refused409(FILES_BEING_READ), 'restore', es)).toBe(es.vol_err_files_being_read);
		expect(offsiteActionErrorText(refused409(LISTING, { error: 'rclone: timeout' }), 'plan', en)).toBe(
			en.offsite_err_listing
		);
		expect(offsiteActionErrorText(refused409(NO_READ_REMOTE), 'restore', es)).toBe(es.offsite_err_no_read_remote);
		expect(
			offsiteActionErrorText(refused409(NOT_IN_OWN_FOLDER, { folder: 'x/', images_outside_own_folder: 2 }), 'free', es)
		).toBe(es.offsite_err_not_in_own_folder);
		expect(offsiteActionErrorText(refused409(JOB_RUNNING, { job_id: 'abc' }), 'restore', es)).toBe(
			es.offsite_err_job_running
		);
	});

	it('maps the 503 of a storage root that cannot take writes, a string detail', () => {
		expect(offsiteActionErrorText(new ApiError(DRIVE_UNAVAILABLE, undefined, 503), 'restore', es)).toBe(
			es.offsite_err_drive_unavailable
		);
		expect(offsiteActionErrorText(new ApiError(NOT_A_DIRECTORY, undefined, 503), 'restore', es)).toBe(
			es.offsite_err_drive_not_directory
		);
		expect(offsiteActionErrorText(new ApiError(NOT_MOUNTED, undefined, 503), 'restore', en)).toBe(
			en.offsite_err_drive_not_mounted
		);
	});

	it('needs the status as well as the text', () => {
		expect(offsiteActionErrorText(new ApiError(NO_STEM, undefined, 422), 'free', es)).toBe(es.offsite_err_free);
		expect(offsiteActionErrorText(new ApiError(DRIVE_UNAVAILABLE, undefined, 409), 'restore', es)).toBe(
			es.offsite_err_restore
		);
	});

	it("gives an unknown text the action's generic message, never the backend text", () => {
		const changed = refused409('Something the backend says now.');
		expect(offsiteActionErrorText(changed, 'plan', es)).toBe(es.offsite_err_plan);
		expect(offsiteActionErrorText(changed, 'free', es)).toBe(es.offsite_err_free);
		expect(offsiteActionErrorText(changed, 'restore', en)).toBe(en.offsite_err_restore);
		expect(offsiteActionErrorText(new ApiError('Bad gateway', undefined, 503), 'restore', es)).toBe(
			es.offsite_err_restore
		);
		expect(offsiteActionErrorText(new TypeError('Failed to fetch'), 'free', es)).toBe(es.offsite_err_free);
		expect(offsiteActionErrorText('not an error', 'plan', es)).toBe(es.offsite_err_plan);
	});
});

describe('offsiteJobErrorText', () => {
	it('maps the listing failure, which carries the listing error after the message', () => {
		expect(offsiteJobErrorText(`${LISTING} (rclone lsjson: exit 1)`, 'free', es)).toBe(es.offsite_err_listing);
	});

	it('maps the refusals the job checks again, and a storage root lost during a restore', () => {
		expect(offsiteJobErrorText(NOT_IN_OWN_FOLDER, 'free', es)).toBe(es.offsite_err_not_in_own_folder);
		expect(offsiteJobErrorText(NO_STEM, 'restore', es)).toBe(es.offsite_err_no_stem);
		expect(offsiteJobErrorText(DRIVE_UNAVAILABLE, 'restore', en)).toBe(en.offsite_err_drive_unavailable);
	});

	it("gives anything else the action's job failure message", () => {
		expect(offsiteJobErrorText('KeyError: 7', 'free', es)).toBe(es.offsite_err_job_free);
		expect(offsiteJobErrorText(null, 'restore', en)).toBe(en.offsite_err_job_restore);
	});
});

describe('isJobLost', () => {
	it('is true for the 404 of a job the backend no longer knows, after a restart', () => {
		expect(isJobLost(new ApiError('Job not found', undefined, 404))).toBe(true);
		expect(isJobLost(new ApiError('Job not found', undefined, 500))).toBe(false);
		expect(isJobLost(new TypeError('Failed to fetch'))).toBe(false);
	});
});

const entry = (reason: string, n = 1): OffsiteFileEntry =>
	({ image_id: n, kind: 'capture', path: `/p/${n}`, key: `k/${n}`, reason }) as OffsiteFileEntry;

describe('refusalLines', () => {
	it('counts the files left on the card by reason, in a fixed order', () => {
		const refused = [
			entry('not_in_bucket', 1),
			entry('no_preview_digest', 2),
			entry('no_preview_digest', 3),
			entry('local_sha1_differs', 4)
		];
		expect(refusalLines(refused, es)).toEqual([
			es.offsite_reason_no_preview_digest(2),
			es.offsite_reason_not_in_bucket(1),
			es.offsite_reason_local_sha1_differs(1)
		]);
	});

	it("words the restore's reasons", () => {
		const refused = [entry('copy_failed'), entry('sha1_differs'), entry('local_file_differs'), entry('could_not_write')];
		expect(refusalLines(refused, en)).toEqual([
			en.offsite_reason_local_file_differs(1),
			en.offsite_reason_copy_failed(1),
			en.offsite_reason_sha1_differs(1),
			en.offsite_reason_could_not_write(1)
		]);
	});

	it('counts reasons it does not know, and those without one, together at the end', () => {
		const refused = [entry('something_new'), { ...entry('x'), reason: undefined }, entry('changed')];
		expect(refusalLines(refused, es)).toEqual([es.offsite_reason_changed(1), es.offsite_reason_other(2)]);
	});

	it('is empty when nothing was refused', () => {
		expect(refusalLines([], es)).toEqual([]);
	});
});

describe('freedExportCount', () => {
	const freedText = (n: number) =>
		`${n} file(s) of this volume are stored offsite and freed from the card. Restore the volume before exporting it.`;

	it("reads the count of the export's 409", () => {
		const err = new ApiError(freedText(3), { message: freedText(3), freed_image_ids: [1, 2, 3] }, 409);
		expect(freedExportCount(err)).toBe(3);
	});

	it("reads the count of the export job's failure, a plain string", () => {
		expect(freedExportCount(freedText(12))).toBe(12);
	});

	it('is null for any other refusal or text', () => {
		expect(freedExportCount(new ApiError(freedText(3), undefined, 422))).toBeNull();
		expect(freedExportCount(new ApiError(EXPORT, undefined, 409))).toBeNull();
		expect(freedExportCount('Cannot export: 2 record(s) have no image: [1, 2]')).toBeNull();
		expect(freedExportCount(null)).toBeNull();
	});
});

describe('pollOffsiteJob', () => {
	const status = (state: OffsiteJobStatus['state']): OffsiteJobStatus => ({
		job_id: 'j',
		collection_id: 7,
		action: 'free',
		state,
		result: null,
		error: null
	});
	const noWait = () => Promise.resolve();

	it('asks until the job is done, waiting between requests', async () => {
		const answers = [status('queued'), status('running'), status('done')];
		const fetchStatus = vi.fn(() => Promise.resolve(answers.shift()!));
		const wait = vi.fn(noWait);
		const final = await pollOffsiteJob(fetchStatus, { intervalMs: 1500, wait });
		expect(final.state).toBe('done');
		expect(fetchStatus).toHaveBeenCalledTimes(3);
		expect(wait).toHaveBeenCalledTimes(3);
		expect(wait).toHaveBeenCalledWith(1500);
	});

	it('stops at a failed job and returns it', async () => {
		const fetchStatus = vi.fn(() => Promise.resolve({ ...status('failed'), error: LISTING }));
		const final = await pollOffsiteJob(fetchStatus, { intervalMs: 10, wait: noWait });
		expect(final).toMatchObject({ state: 'failed', error: LISTING });
	});

	it('keeps asking through a few failed requests, such as a dropped connection', async () => {
		const answers: Array<() => Promise<OffsiteJobStatus>> = [
			() => Promise.reject(new TypeError('Failed to fetch')),
			() => Promise.reject(new ApiError('Bad gateway', undefined, 502)),
			() => Promise.resolve(status('done'))
		];
		const fetchStatus = vi.fn(() => answers.shift()!());
		expect((await pollOffsiteJob(fetchStatus, { intervalMs: 10, wait: noWait, maxFailures: 3 })).state).toBe('done');
	});

	it('gives up after that many failed requests in a row, with the last error', async () => {
		const last = new TypeError('Failed to fetch');
		const fetchStatus = vi.fn(() => Promise.reject(last));
		await expect(pollOffsiteJob(fetchStatus, { intervalMs: 10, wait: noWait, maxFailures: 3 })).rejects.toBe(last);
		expect(fetchStatus).toHaveBeenCalledTimes(3);
	});

	it('gives up at once when the backend no longer knows the job', async () => {
		const lost = new ApiError('Job not found', undefined, 404);
		const fetchStatus = vi.fn(() => Promise.reject(lost));
		await expect(pollOffsiteJob(fetchStatus, { intervalMs: 10, wait: noWait, maxFailures: 5 })).rejects.toBe(lost);
		expect(fetchStatus).toHaveBeenCalledTimes(1);
	});

	it('stops asking when the caller aborts', async () => {
		const controller = new AbortController();
		const fetchStatus = vi.fn(() => {
			controller.abort();
			return Promise.resolve(status('running'));
		});
		await expect(
			pollOffsiteJob(fetchStatus, { intervalMs: 10, wait: noWait, signal: controller.signal })
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetchStatus).toHaveBeenCalledTimes(1);
	});
});

describe('offsiteOffer', () => {
	const state = (over: Partial<VolumeOffsiteState> = {}): VolumeOffsiteState => ({
		collection_id: 7,
		filename_stem: 'co-x',
		uploadable: true,
		total: 10,
		verified: 10,
		pending: 0,
		refused: 0,
		last_verified_at: null,
		received: true,
		refusals: [],
		freed_files: 0,
		freed_bytes: 0,
		...over
	});

	it('offers freeing a received volume with files still on the card', () => {
		expect(offsiteOffer(state())).toEqual({ free: true, restore: false });
	});

	it('offers restoring a volume with freed files, and freeing what is left', () => {
		expect(offsiteOffer(state({ freed_files: 4, freed_bytes: 100 }))).toEqual({ free: true, restore: true });
		expect(offsiteOffer(state({ freed_files: 10, freed_bytes: 100 }))).toEqual({ free: false, restore: true });
	});

	it('offers no freeing before the volume is received, nor for a volume without a stem', () => {
		expect(offsiteOffer(state({ verified: 8, pending: 2, received: false })).free).toBe(false);
		expect(offsiteOffer(state({ uploadable: false, total: 0, verified: 0, received: false }))).toEqual({
			free: false,
			restore: false
		});
	});

	it('reads a backend without the freed counts as nothing freed', () => {
		const old: Partial<VolumeOffsiteState> = { ...state() };
		delete old.freed_files;
		delete old.freed_bytes;
		expect(offsiteOffer(old as VolumeOffsiteState)).toEqual({ free: true, restore: false });
	});
});

describe('planSummary', () => {
	const plan = (files: number, bytes: number, refused: OffsiteFileEntry[] = []): FreePlan => ({
		collection_id: 7,
		filename_stem: 'co-x',
		would_free: { files, bytes },
		files: [],
		refused,
		local_sha1_checked: false
	});

	it('says how many files and bytes would be removed, and what would be left and why', () => {
		const summary = planSummary(plan(412, 12_300_000_000, [entry('no_preview_digest'), entry('no_preview_digest', 2)]), es);
		expect(summary).toEqual({
			canFree: true,
			body: es.offsite_plan_will_free(412, 12_300_000_000),
			leftTitle: es.offsite_plan_left(2),
			leftLines: [es.offsite_reason_no_preview_digest(2)]
		});
	});

	it('says there is nothing to free when every file would stay', () => {
		const summary = planSummary(plan(0, 0, [entry('not_in_bucket')]), en);
		expect(summary.canFree).toBe(false);
		expect(summary.body).toBe(en.offsite_plan_nothing);
		expect(summary.leftLines).toEqual([en.offsite_reason_not_in_bucket(1)]);
	});

	it('has no left list when nothing would stay', () => {
		const summary = planSummary(plan(3, 3000), es);
		expect(summary.leftTitle).toBeNull();
		expect(summary.leftLines).toEqual([]);
	});
});

describe('resultSummary', () => {
	const result = (over: Partial<OffsiteJobResult>): OffsiteJobResult => ({
		collection_id: 7,
		filename_stem: 'co-x',
		files: [],
		refused: [],
		manifest: null,
		...over
	});

	it("reports a free's files and bytes, and the files it left", () => {
		const summary = resultSummary('free', result({ freed: { files: 410, bytes: 12e9 }, refused: [entry('local_sha1_differs')] }), es);
		expect(summary).toEqual({
			title: es.offsite_free_done_title,
			body: es.offsite_free_done(410, 12e9),
			leftTitle: es.offsite_done_left(1),
			leftLines: [es.offsite_reason_local_sha1_differs(1)]
		});
	});

	it("reports a restore's files and bytes, and the files it could not restore", () => {
		const summary = resultSummary('restore', result({ restored: { files: 2, bytes: 5e7 }, refused: [entry('copy_failed')] }), en);
		expect(summary).toEqual({
			title: en.offsite_restore_done_title,
			body: en.offsite_restore_done(2, 5e7),
			leftTitle: en.offsite_restore_left(1),
			leftLines: [en.offsite_reason_copy_failed(1)]
		});
	});

	it('reads a result without counts as nothing done', () => {
		expect(resultSummary('free', null, es).body).toBe(es.offsite_free_done(0, 0));
	});
});

describe('runOffsiteJob', () => {
	const job = (state: OffsiteJobStatus['state'], over: Partial<OffsiteJobStatus> = {}): OffsiteJobStatus => ({
		job_id: 'j1',
		collection_id: 7,
		action: 'free',
		state,
		result: null,
		error: null,
		...over
	});
	const start = (): Promise<OffsiteJobStart> =>
		Promise.resolve({ job_id: 'j1', state: 'queued', action: 'free', status_url: '/collections/7/offsite/jobs/j1' });
	const opts = { intervalMs: 10, wait: () => Promise.resolve() };

	it('starts the job, polls it by its id and returns its result', async () => {
		const done = job('done', { result: { collection_id: 7, filename_stem: 'co-x', freed: { files: 1, bytes: 9 }, files: [], refused: [], manifest: null } });
		const getJob = vi.fn(() => Promise.resolve(done));
		const outcome = await runOffsiteJob('free', start, getJob, opts, es);
		expect(getJob).toHaveBeenCalledWith('j1');
		expect(outcome).toEqual({ kind: 'done', result: done.result });
	});

	it('maps a refused start, a failed job, a lost job and an unreachable backend', async () => {
		const refused = () => Promise.reject(refused409(NO_READ_REMOTE));
		expect(await runOffsiteJob('restore', refused, vi.fn(), opts, es)).toEqual({
			kind: 'error',
			text: es.offsite_err_no_read_remote
		});

		const failed = () => Promise.resolve(job('failed', { error: DRIVE_UNAVAILABLE }));
		expect(await runOffsiteJob('restore', start, failed, opts, es)).toEqual({
			kind: 'error',
			text: es.offsite_err_drive_unavailable
		});

		const lost = () => Promise.reject(new ApiError('Job not found', undefined, 404));
		expect(await runOffsiteJob('free', start, lost, opts, es)).toEqual({ kind: 'error', text: es.offsite_err_job_lost });

		const down = () => Promise.reject(new TypeError('Failed to fetch'));
		expect(await runOffsiteJob('free', start, down, { ...opts, maxFailures: 2 }, es)).toEqual({
			kind: 'error',
			text: es.offsite_err_poll
		});
	});

	it('is aborted, not an error, when the caller stops it', async () => {
		const controller = new AbortController();
		controller.abort();
		expect(await runOffsiteJob('free', start, vi.fn(), { ...opts, signal: controller.signal }, es)).toEqual({ kind: 'aborted' });
	});
});

describe('freedCountsChanged', () => {
	const counts = (collectionId: number, files: number, bytes: number) => ({ collectionId, files, bytes });

	it('is false on the first reading of a volume: the page has just loaded its records', () => {
		expect(freedCountsChanged(null, counts(7, 4, 100), 7)).toBe(false);
	});

	it('is true when the files or the bytes freed change on the volume shown', () => {
		expect(freedCountsChanged(counts(7, 0, 0), counts(7, 4, 100), 7)).toBe(true);
		expect(freedCountsChanged(counts(7, 4, 100), counts(7, 0, 0), 7)).toBe(true);
		expect(freedCountsChanged(counts(7, 4, 100), counts(7, 4, 120), 7)).toBe(true);
	});

	it('is false when nothing changed', () => {
		expect(freedCountsChanged(counts(7, 4, 100), counts(7, 4, 100), 7)).toBe(false);
	});

	it('never acts for a volume other than the one shown, nor across a change of volume', () => {
		expect(freedCountsChanged(counts(7, 0, 0), counts(7, 4, 100), 8)).toBe(false);
		expect(freedCountsChanged(counts(7, 0, 0), counts(8, 4, 100), 8)).toBe(false);
	});
});

describe('freedCountsOf', () => {
	it('reads a backend without the freed counts as nothing freed', () => {
		const s = { collection_id: 7, freed_files: undefined, freed_bytes: undefined } as unknown as VolumeOffsiteState;
		expect(freedCountsOf(s)).toEqual({ collectionId: 7, files: 0, bytes: 0 });
	});
});

// Freeing a volume from the card and restoring it (NEH-248): the catalogue
// messages for what the backend answers, and the polling of its jobs.
//
// The routes are in app/api/collections.py (/{id}/offsite/free, GET for the
// dry run and POST to start; /{id}/offsite/restore; /{id}/offsite/jobs/{job});
// the work and its texts are in app/core/offsite_free.py. A refusal is a 409
// whose detail is {message, ...}; a restore under a storage root that cannot
// take writes is the app's 503 for StorageUnavailableError (app/main.py), whose
// detail is the plain text of app/core/storage_override.py. A job that fails
// carries a text in `error`.
//
// As in volume-refusals.ts, the backend sends fixed English text with no code,
// so each is matched on status plus the exact text (or its fixed start). A
// text the backend changes falls through to the action's generic message
// rather than being shown as the wrong one. No import of api.ts beyond types,
// so the tests run in plain node.

import type { Messages } from './i18n';
import { REQUEST_TIMEOUT_MS } from './catalogue-backup';
import type {
	FreePlan,
	OffsiteFileEntry,
	OffsiteJobResult,
	OffsiteJobStart,
	OffsiteJobStatus,
	VolumeOffsiteState
} from '$lib/api';

export type OffsiteAction = 'plan' | 'free' | 'restore';

// app/core/offsite_free.py
const NO_STEM_MESSAGE =
	'This volume has no file name stem, so none of its files are stored offsite and none can be freed or restored.';
const NOT_RECEIVED_MESSAGE =
	'Not every file of this volume is verified in the offsite bucket yet, so its files cannot be freed from the card. Wait for the upload to finish.';
const EXPORT_MESSAGE = 'An export of this volume is queued or running. Wait for it to finish, then try again.';
const LISTING_MESSAGE =
	'The offsite bucket could not be listed, so nothing could be checked against it and nothing was freed. Try again later.';
const NO_READ_REMOTE_MESSAGE =
	'Restore is not set up on this unit: it needs read access to the offsite bucket (DTK_OFFSITE_READ_REMOTE), and none is configured.';
const NOT_IN_OWN_FOLDER_MESSAGE =
	"Some of this volume's files have not yet been moved into the volume's own folder, so its files cannot be freed from the card or restored. Captua moves them the next time it starts. If they are still not moved after a restart, the backend's log says why (for example, the folder already holds files that are not this volume's); once that is cleared and Captua has restarted, the volume can be freed.";
const JOB_RUNNING_MESSAGE = 'Files of this volume are already being freed or restored. Wait for that to finish.';
// FREED_EXPORT_MESSAGE, with its count: the export's 409 (app/api/collections.py)
// and the export job's failure when a free followed the request (app/core/export_service.py).
const FREED_EXPORT = /^(\d+) file\(s\) of this volume are stored offsite and freed from the card\. Restore the volume before exporting it\.$/;

// app/core/export_jobs.py: the hold a free or a restore takes refuses with this too.
const FILES_BEING_READ_MESSAGE =
	'Captua is preparing a file of this volume for the offsite copy. Try again in a moment.';

// app/core/storage_override.py, override_root_problem.
const DRIVE_UNAVAILABLE_MESSAGE =
	'The storage drive set for projects is not available. Connect and activate the drive, or revert to internal storage, then try again.';
const DRIVE_NOT_DIRECTORY_MESSAGE =
	'The storage path set for projects is not a directory. Activate the drive again, or revert to internal storage, then try again.';
const DRIVE_NOT_MOUNTED_MESSAGE =
	'The storage path set for projects is not on a mounted drive. Connect and activate the drive, or revert to internal storage, then try again.';

function statusOf(error: unknown): number | undefined {
	if (!(error instanceof Error)) return undefined;
	const status = (error as Error & { status?: unknown }).status;
	return typeof status === 'number' ? status : undefined;
}

function refusalText(text: string, msgs: Messages): string | null {
	switch (text) {
		case NO_STEM_MESSAGE:
			return msgs.offsite_err_no_stem;
		case NOT_RECEIVED_MESSAGE:
			return msgs.offsite_err_not_received;
		case EXPORT_MESSAGE:
			return msgs.vol_err_export_running;
		case FILES_BEING_READ_MESSAGE:
			return msgs.vol_err_files_being_read;
		case LISTING_MESSAGE:
			return msgs.offsite_err_listing;
		case NO_READ_REMOTE_MESSAGE:
			return msgs.offsite_err_no_read_remote;
		case NOT_IN_OWN_FOLDER_MESSAGE:
			return msgs.offsite_err_not_in_own_folder;
		case JOB_RUNNING_MESSAGE:
			return msgs.offsite_err_job_running;
	}
	return null;
}

function storageText(text: string, msgs: Messages): string | null {
	switch (text) {
		case DRIVE_UNAVAILABLE_MESSAGE:
			return msgs.offsite_err_drive_unavailable;
		case DRIVE_NOT_DIRECTORY_MESSAGE:
			return msgs.offsite_err_drive_not_directory;
		case DRIVE_NOT_MOUNTED_MESSAGE:
			return msgs.offsite_err_drive_not_mounted;
	}
	return null;
}

function genericText(action: OffsiteAction, msgs: Messages): string {
	if (action === 'plan') return msgs.offsite_err_plan;
	return action === 'free' ? msgs.offsite_err_free : msgs.offsite_err_restore;
}

/** The message for a dry run, a free or a restore the backend refused, or that failed to reach it. */
export function offsiteActionErrorText(error: unknown, action: OffsiteAction, msgs: Messages): string {
	const status = statusOf(error);
	const text = error instanceof Error ? error.message : '';
	if (status === 409) return refusalText(text, msgs) ?? genericText(action, msgs);
	if (status === 503) return storageText(text, msgs) ?? genericText(action, msgs);
	return genericText(action, msgs);
}

/**
 * The message for a job that ended `failed`, from its `error`: the listing
 * failure (LISTING_MESSAGE followed by the listing's error in parentheses), a
 * refusal checked again inside the job, or a storage root lost during a
 * restore (str() of StorageUnavailableError).
 */
export function offsiteJobErrorText(error: string | null, action: 'free' | 'restore', msgs: Messages): string {
	if (typeof error === 'string') {
		if (error.startsWith(LISTING_MESSAGE)) return msgs.offsite_err_listing;
		const known = refusalText(error, msgs) ?? storageText(error, msgs);
		if (known) return known;
	}
	return action === 'free' ? msgs.offsite_err_job_free : msgs.offsite_err_job_restore;
}

/** Whether a poll was answered 404: the backend does not know the job, as after a restart. */
export function isJobLost(error: unknown): boolean {
	return statusOf(error) === 404;
}

// The reasons _Object.entry carries in `refused` (app/core/offsite_free.py):
// the dry run's and the free's first, then the restore's.
const REASONS = [
	'no_preview_digest',
	'not_in_bucket',
	'listed_without_sha1',
	'bucket_sha1_differs',
	'local_file_missing',
	'local_file_unreadable',
	'local_sha1_differs',
	'changed',
	'could_not_remove',
	'outside_storage',
	'local_file_differs',
	'copy_failed',
	'sha1_differs',
	'could_not_write'
] as const;

type Reason = (typeof REASONS)[number];

function reasonText(reason: Reason, n: number, msgs: Messages): string {
	switch (reason) {
		case 'no_preview_digest':
			return msgs.offsite_reason_no_preview_digest(n);
		case 'not_in_bucket':
			return msgs.offsite_reason_not_in_bucket(n);
		case 'listed_without_sha1':
			return msgs.offsite_reason_listed_without_sha1(n);
		case 'bucket_sha1_differs':
			return msgs.offsite_reason_bucket_sha1_differs(n);
		case 'local_file_missing':
			return msgs.offsite_reason_local_file_missing(n);
		case 'local_file_unreadable':
			return msgs.offsite_reason_local_file_unreadable(n);
		case 'local_sha1_differs':
			return msgs.offsite_reason_local_sha1_differs(n);
		case 'changed':
			return msgs.offsite_reason_changed(n);
		case 'could_not_remove':
			return msgs.offsite_reason_could_not_remove(n);
		case 'outside_storage':
			return msgs.offsite_reason_outside_storage(n);
		case 'local_file_differs':
			return msgs.offsite_reason_local_file_differs(n);
		case 'copy_failed':
			return msgs.offsite_reason_copy_failed(n);
		case 'sha1_differs':
			return msgs.offsite_reason_sha1_differs(n);
		case 'could_not_write':
			return msgs.offsite_reason_could_not_write(n);
	}
}

/** One line per reason a file was left as it was, with its count; reasons not known here are counted together last. */
export function refusalLines(refused: OffsiteFileEntry[], msgs: Messages): string[] {
	const counts = new Map<string, number>();
	let other = 0;
	for (const r of refused) {
		if (r.reason && (REASONS as readonly string[]).includes(r.reason)) {
			counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
		} else {
			other += 1;
		}
	}
	const lines = REASONS.filter((r) => counts.has(r)).map((r) => reasonText(r, counts.get(r)!, msgs));
	if (other > 0) lines.push(msgs.offsite_reason_other(other));
	return lines;
}

/**
 * How many masters an export was refused for because they are freed from the
 * card, or null for anything else: from the export's 409 (an ApiError) or
 * from a failed export job's `error` (a string).
 */
export function freedExportCount(error: unknown): number | null {
	let text: string | null = null;
	if (typeof error === 'string') text = error;
	else if (statusOf(error) === 409) text = (error as Error).message;
	const match = text === null ? null : FREED_EXPORT.exec(text);
	return match ? Number(match[1]) : null;
}

export interface PollOptions {
	intervalMs: number;
	/** Resolves after `ms`; a stand-in in tests. */
	wait?: (ms: number) => Promise<void>;
	signal?: AbortSignal;
	/** Failed requests in a row before giving up; a 404 gives up at once. */
	maxFailures?: number;
	/** A request with no answer after this long is aborted and counts as failed, as in startPolling. */
	requestTimeoutMs?: number;
}

function abortError(): DOMException {
	return new DOMException('The poll was stopped', 'AbortError');
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * `request` with a signal of its own, aborted when `signal` aborts or after
 * `timeoutMs`. Settles at either even if `request` ignores its signal: an
 * AbortError for the caller's abort, a TimeoutError for the timeout.
 */
async function bounded<T>(
	request: (signal: AbortSignal) => Promise<T>,
	signal: AbortSignal | undefined,
	timeoutMs: number | null
): Promise<T> {
	const controller = new AbortController();
	const onAbort = () => controller.abort(abortError());
	if (signal?.aborted) throw abortError();
	signal?.addEventListener('abort', onAbort, { once: true });
	const timer =
		timeoutMs === null
			? null
			: setTimeout(() => controller.abort(new DOMException('The request timed out', 'TimeoutError')), timeoutMs);
	try {
		return await Promise.race([
			request(controller.signal),
			new Promise<never>((_resolve, reject) =>
				controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
			)
		]);
	} finally {
		if (timer !== null) clearTimeout(timer);
		signal?.removeEventListener('abort', onAbort);
	}
}

/**
 * Ask for the job's state every `intervalMs` until it is done or failed, and
 * return that last state. A request that fails is tried again, up to
 * `maxFailures` in a row (the unit's link can drop for a moment while the
 * job runs); then, or at once for a 404, the error is thrown.
 */
export async function pollOffsiteJob(
	fetchStatus: (signal: AbortSignal) => Promise<OffsiteJobStatus>,
	{ intervalMs, wait = sleep, signal, maxFailures = 5, requestTimeoutMs = REQUEST_TIMEOUT_MS }: PollOptions
): Promise<OffsiteJobStatus> {
	let failures = 0;
	for (;;) {
		if (signal?.aborted) throw abortError();
		await wait(intervalMs);
		if (signal?.aborted) throw abortError();
		let status: OffsiteJobStatus;
		try {
			status = await bounded(fetchStatus, signal, requestTimeoutMs);
		} catch (error) {
			if (signal?.aborted) throw abortError();
			failures += 1;
			if (isJobLost(error) || failures >= maxFailures) throw error;
			continue;
		}
		if (signal?.aborted) throw abortError();
		failures = 0;
		if (status.state === 'done' || status.state === 'failed') return status;
	}
}

/**
 * Which actions an admin is offered for the volume: freeing once every file
 * is verified offsite and some verified file is still on the card, restoring
 * once any file is freed. The backend checks again and refuses with 409.
 */
export function offsiteOffer(state: VolumeOffsiteState): { free: boolean; restore: boolean } {
	const freed = state.freed_files ?? 0;
	return {
		free: state.uploadable && state.received && state.verified > freed,
		restore: state.uploadable && freed > 0
	};
}

export interface OffsiteSummary {
	body: string;
	/** "Captua will leave 2 files on the SD card:"; null when no file is left. */
	leftTitle: string | null;
	leftLines: string[];
}

/** What the dry run says freeing would do. */
export function planSummary(plan: FreePlan, msgs: Messages): OffsiteSummary & { canFree: boolean } {
	const canFree = plan.would_free.files > 0;
	const left = plan.refused.length;
	return {
		canFree,
		body: canFree ? msgs.offsite_plan_will_free(plan.would_free.files, plan.would_free.bytes) : msgs.offsite_plan_nothing,
		leftTitle: left > 0 ? msgs.offsite_plan_left(left) : null,
		leftLines: refusalLines(plan.refused, msgs)
	};
}

/** What a finished free or restore did. */
export function resultSummary(
	action: 'free' | 'restore',
	result: OffsiteJobResult | null,
	msgs: Messages
): OffsiteSummary & { title: string } {
	const refused = result?.refused ?? [];
	const left = refused.length;
	if (action === 'free') {
		const done = result?.freed ?? { files: 0, bytes: 0 };
		return {
			title: msgs.offsite_free_done_title,
			body: msgs.offsite_free_done(done.files, done.bytes),
			leftTitle: left > 0 ? msgs.offsite_done_left(left) : null,
			leftLines: refusalLines(refused, msgs)
		};
	}
	const done = result?.restored ?? { files: 0, bytes: 0 };
	return {
		title: msgs.offsite_restore_done_title,
		body: msgs.offsite_restore_done(done.files, done.bytes),
		leftTitle: left > 0 ? msgs.offsite_restore_left(left) : null,
		leftLines: refusalLines(refused, msgs)
	};
}

export type OffsiteOutcome =
	| { kind: 'done'; result: OffsiteJobResult | null }
	| { kind: 'error'; text: string }
	| { kind: 'aborted' };

function isAbort(error: unknown): boolean {
	return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/**
 * Start a free or a restore, poll its job until it ends, and say how it
 * ended: its result, the message for its refusal or failure, or `aborted`
 * when the caller stopped polling (the job goes on in the backend).
 */
export async function runOffsiteJob(
	action: 'free' | 'restore',
	start: () => Promise<OffsiteJobStart>,
	getJob: (jobId: string, signal: AbortSignal) => Promise<OffsiteJobStatus>,
	options: PollOptions,
	msgs: Messages
): Promise<OffsiteOutcome> {
	if (options.signal?.aborted) return { kind: 'aborted' };
	let started: OffsiteJobStart;
	try {
		// Not given the signal: the backend may already have taken the request,
		// so only the waiting stops when the caller aborts.
		started = await bounded(() => start(), options.signal, null);
	} catch (error) {
		if (options.signal?.aborted) return { kind: 'aborted' };
		return { kind: 'error', text: offsiteActionErrorText(error, action, msgs) };
	}
	try {
		const final = await pollOffsiteJob((signal) => getJob(started.job_id, signal), options);
		if (final.state === 'failed') return { kind: 'error', text: offsiteJobErrorText(final.error, action, msgs) };
		return { kind: 'done', result: final.result };
	} catch (error) {
		if (isAbort(error)) return { kind: 'aborted' };
		return { kind: 'error', text: isJobLost(error) ? msgs.offsite_err_job_lost : msgs.offsite_err_poll };
	}
}

/** A volume's freed counts, as GET /collections/{id}/offsite reports them. */
export interface FreedCounts {
	collectionId: number;
	files: number;
	bytes: number;
}

export function freedCountsOf(state: VolumeOffsiteState): FreedCounts {
	return { collectionId: state.collection_id, files: state.freed_files ?? 0, bytes: state.freed_bytes ?? 0 };
}

/**
 * Whether the records shown for `currentId` must be reloaded because what is
 * freed of that volume changed since `prev` was read: a free or a restore
 * ended, whether or not its dialog was still open, or one ran elsewhere. The
 * first reading of a volume, and a reading of any other volume, is never a
 * change: the page loads a volume's records when it shows it.
 */
export function freedCountsChanged(prev: FreedCounts | null, next: FreedCounts, currentId: number): boolean {
	if (prev === null || next.collectionId !== currentId || prev.collectionId !== next.collectionId) return false;
	return prev.files !== next.files || prev.bytes !== next.bytes;
}

/**
 * What the layout records as last read after reading `next`: `next`, except
 * when the freed counts changed on the volume shown and the records could
 * not be reloaded (`reload` resolved false, threw, or is not set yet). Then
 * `prev` stays, so the next poll sees the change again and tries again.
 */
export async function freedAfterRead(
	prev: FreedCounts | null,
	next: FreedCounts,
	currentId: number,
	reload: (() => Promise<boolean>) | null | undefined
): Promise<FreedCounts | null> {
	if (!freedCountsChanged(prev, next, currentId)) return next;
	if (!reload) return prev;
	try {
		return (await reload()) ? next : prev;
	} catch {
		return prev;
	}
}

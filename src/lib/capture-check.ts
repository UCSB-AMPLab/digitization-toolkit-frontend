// A capture request that ends in a timeout may still have been saved
// (NEH-381). POST /cameras/capture and /cameras/capture/dual
// (app/api/cameras.py) answer only once the capture is stored, and nothing
// cancels a capture the browser has stopped waiting for: after a 504 from
// nginx, or after the request layer's own TimeoutError (api.ts), the backend
// can still store the image files, the record and its images. A backend
// failure rolls the records back, so a failure the backend reports leaves
// no record behind.
//
// So the capture screen does not report a timeout as a failure. It reads the
// volume's records again every CHECK_INTERVAL_MS, with the read it already
// makes after a successful capture, until the capture has appeared, or until
// a read that succeeded at or after CHECK_WINDOW_MS from the start of the
// check has not found it. Every capture control stays locked meanwhile, so
// that a second press cannot take the next file number and shoot again.
//
// What "appeared" means depends on the capture (appearedRecord):
// - a capture that makes a new record (the viewport's capture, single or
//   dual, and "Capture another here", which inserts after a record): a
//   record not in the list before the request, with at least one image.
//   The backend writes the record and its images in one transaction, so a
//   new record without images is not a capture: it is a placeholder for a
//   missing opening (POST .../records/missing-opening).
// - a capture into an existing record (a retake, or a placeholder's fill,
//   both sent with `record_id`): that record holds an image id the screen
//   did not know before the request. A retake marks the record's current images as
//   superseded and adds new ones, which have new ids; the list of records
//   shows current images only.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `name`), as capture-errors.ts does.
//
// Version: 0.3.0

import { CaptureNotSaved } from './capture-errors';

/** After this long in flight, the screen says the unit is still working on the capture. */
export const STILL_WORKING_AFTER_MS = 10_000;
/** How often the records are read again while a timed-out capture is checked. */
export const CHECK_INTERVAL_MS = 5_000;
/**
 * How long the check runs, measured from the moment it starts, not from the
 * request's start: a timeout arrives at about 300 s (nginx's
 * proxy_read_timeout for the capture routes and CAMERA_REQUEST_TIMEOUT_MS in
 * api.ts are both 300 s), and a capture that waited on the camera's lock can
 * still be stored after that; the backend's worst case per camera is about
 * 225 s from the moment it holds the lock.
 */
export const CHECK_WINDOW_MS = 180_000;

export interface RecordLike {
	id: number;
	images?: readonly { id: number }[] | null;
}

/** What the screen knew the server held when the request was sent. */
export interface CaptureBefore {
	recordIds: ReadonlySet<number>;
	imageIds: ReadonlySet<number>;
	// The record a retake or a fill captures into; null for a new record.
	target: number | null;
}

export type CheckOutcome =
	| { kind: 'found'; record: RecordLike }
	| { kind: 'not-saved' }
	| { kind: 'stopped' };

/** Whether a capture request ended in nginx's 504 or in the request layer's TimeoutError. */
export function isCaptureTimeout(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const { status, name } = error as { status?: unknown; name?: unknown };
	return status === 504 || name === 'TimeoutError';
}

/** The baseline from a list of records alone; `target` is the record a retake or a fill captures into. */
export function captureBefore(
	records: readonly RecordLike[],
	target: number | null = null
): CaptureBefore {
	const known = createKnownRecords();
	known.listed(records);
	return known.snapshot(target);
}

/**
 * What the screen knows the server holds, for one volume: the record ids and
 * image ids of the last successful read of the list, plus every record id and
 * image id that a capture answer has confirmed on this screen since (the
 * `record_id` and `image_ids` of CaptureResponse, and the record a check
 * found). This is the baseline for "appeared": a capture that the backend
 * answered, but whose read of the list afterwards failed or has not arrived,
 * is known, and so cannot be taken for a later capture. Ids are never reused,
 * so nothing is removed until reset(), for another volume. Until one read of
 * the list has succeeded (`ready`; an empty list counts) the baseline is
 * incomplete, and the gate starts no capture.
 */
export interface KnownRecords {
	/** At least one read of the list has succeeded since the last reset. */
	readonly ready: boolean;
	/** Whether the record is among the known ones. */
	hasRecord(id: number): boolean;
	/** A successful read of the volume's list. */
	listed(records: readonly RecordLike[]): void;
	/** A record and images a capture answer confirmed. */
	confirmed(
		recordId: number | null | undefined,
		imageIds: readonly number[] | null | undefined
	): void;
	/** A copy of what is known now, as the baseline of a capture into `target`, or a new record. */
	snapshot(target?: number | null): CaptureBefore;
	reset(): void;
}

export function createKnownRecords(): KnownRecords {
	let recordIds = new Set<number>();
	let imageIds = new Set<number>();
	let ready = false;
	return {
		get ready() {
			return ready;
		},
		hasRecord: (id) => recordIds.has(id),
		listed(records) {
			ready = true;
			for (const r of records) {
				recordIds.add(r.id);
				for (const img of r.images ?? []) imageIds.add(img.id);
			}
		},
		confirmed(recordId, ids) {
			if (recordId != null) recordIds.add(recordId);
			for (const id of ids ?? []) imageIds.add(id);
		},
		snapshot(target = null) {
			return { recordIds: new Set(recordIds), imageIds: new Set(imageIds), target };
		},
		reset() {
			recordIds = new Set();
			imageIds = new Set();
			ready = false;
		}
	};
}

/**
 * The one gate every function of the capture screen that sends a capture or
 * a test capture acquires for the duration of its request: held while a
 * capture is in flight or being checked, or a test capture runs. acquire()
 * returns the function that releases the hold, or null, and nothing may be
 * sent, while the gate is held, or, for a capture ('capture', the default),
 * while `ready()` says the baseline is incomplete (KnownRecords.ready). A test
 * capture ('test') saves nothing, so it needs no baseline. Releasing twice
 * does nothing. `onChange` gets the new state, for what the screen disables.
 */
export interface CaptureGate {
	isBusy(): boolean;
	acquire(kind?: 'capture' | 'test'): (() => void) | null;
}

export function createCaptureGate(
	onChange?: (busy: boolean) => void,
	ready: () => boolean = () => true
): CaptureGate {
	let busy = false;
	return {
		isBusy: () => busy,
		acquire(kind = 'capture') {
			if (busy) return null;
			if (kind === 'capture' && !ready()) return null;
			busy = true;
			onChange?.(true);
			let released = false;
			return () => {
				if (released) return;
				released = true;
				busy = false;
				onChange?.(false);
			};
		}
	};
}

/**
 * The record the capture shows up in, or null while it has not appeared,
 * compared against what the screen knew the server held (KnownRecords).
 * Known limits: a record that someone else adds to the volume during the
 * check (another tab, another account) is taken as the capture found. And a
 * capture whose check ended as not saved, but which the backend stores later,
 * shows up in the next successful read as a record nobody on the screen
 * explains; a later capture that times out can take it as its own. Telling
 * them apart needs an id the client sends with each capture and the server
 * stores with it.
 */
export function appearedRecord(
	before: CaptureBefore,
	after: readonly RecordLike[]
): RecordLike | null {
	if (before.target !== null) {
		const record = after.find((r) => r.id === before.target);
		const fresh = (record?.images ?? []).some((img) => !before.imageIds.has(img.id));
		return record && fresh ? record : null;
	}
	return after.find((r) => !before.recordIds.has(r.id) && (r.images ?? []).length > 0) ?? null;
}

/** Calls `onSlow` once STILL_WORKING_AFTER_MS have passed; the function returned cancels it. */
export function whenSlow(onSlow: () => void, ms: number = STILL_WORKING_AFTER_MS): () => void {
	const timer = setTimeout(onSlow, ms);
	return () => clearTimeout(timer);
}

export interface CheckOptions {
	before: CaptureBefore;
	// Reads the volume's records; null, or a rejection, when the read failed.
	read: () => Promise<readonly RecordLike[] | null>;
	// Aborted when the screen goes away or leaves the volume.
	signal: AbortSignal;
}

/**
 * Reads the records every CHECK_INTERVAL_MS, the first time CHECK_INTERVAL_MS
 * after the call, until the capture has appeared ('found'), or until a read
 * that succeeded, made at or after CHECK_WINDOW_MS from the call, has not
 * found it ('not-saved'); a read is timed to fall on that moment. A failed
 * read decides nothing, before or after the window: the next read follows
 * CHECK_INTERVAL_MS later, and one still in flight decides when it answers.
 * Resolves 'stopped', with no timer left, when `signal` aborts.
 */
export function checkForCapture({ before, read, signal }: CheckOptions): Promise<CheckOutcome> {
	const deadline = Date.now() + CHECK_WINDOW_MS;
	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let done = false;
		const finish = (outcome: CheckOutcome) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			signal.removeEventListener('abort', onAbort);
			resolve(outcome);
		};
		const onAbort = () => finish({ kind: 'stopped' });
		const schedule = () => {
			const left = deadline - Date.now();
			timer = setTimeout(
				readOnce,
				left > 0 ? Math.min(CHECK_INTERVAL_MS, left) : CHECK_INTERVAL_MS
			);
		};
		const readOnce = async () => {
			const madeAt = Date.now();
			let after: readonly RecordLike[] | null = null;
			try {
				after = await read();
			} catch {
				after = null;
			}
			if (done) return;
			if (after === null) {
				schedule();
				return;
			}
			const record = appearedRecord(before, after);
			if (record) finish({ kind: 'found', record });
			else if (madeAt >= deadline) finish({ kind: 'not-saved' });
			else schedule();
		};
		if (signal.aborted) {
			onAbort();
			return;
		}
		signal.addEventListener('abort', onAbort, { once: true });
		schedule();
	});
}

/** The fields of a capture answer (CaptureResponse in api.ts) the screen reads. */
export interface CaptureAnswer {
	success: boolean;
	record_id?: number | null;
	image_ids?: number[] | null;
}

export interface PageCaptureOptions<A extends CaptureAnswer, R extends RecordLike> {
	gate: CaptureGate;
	known: KnownRecords;
	// The record the capture goes into, null for a new one.
	target: number | null;
	// Every record the request names (record_id, afterRecordId).
	names: readonly number[];
	// Still on the volume the request began in, with the screen mounted.
	current: () => boolean;
	send: () => Promise<A>;
	read: () => Promise<readonly R[] | null>;
	notice: (value: 'still_working' | 'maybe_saved' | 'found' | null) => void;
	// True from the request's start to the end of its check.
	onCapturing: (capturing: boolean) => void;
	// The running check's controller, null once it has ended: the screen
	// aborts it on unmount and on another volume.
	onCheck: (controller: AbortController | null) => void;
	// Cancels the still-working timer while the request is in flight, null after.
	onSlowTimer?: (cancel: (() => void) | null) => void;
}

/**
 * A capture made by the page (a retake, a fill, "Capture another here").
 * Sends nothing, and resolves null, when a record it names is not among the
 * known records, or the gate refuses (held, or no successful read of the
 * volume yet). Otherwise it holds the gate from the request to the end of
 * any check, and resolves the request's answer (added to what is known when
 * it succeeded); for a request that ended in a timeout, the record the
 * check found (added too); null, with nothing shown, when the answer
 * arrives once `current()` is false, or the check stopped. Throws the
 * request's error for any other failure, and CaptureNotSaved when the check
 * did not find the capture.
 */
export async function runPageCapture<A extends CaptureAnswer, R extends RecordLike>(
	o: PageCaptureOptions<A, R>
): Promise<{ result: A } | { found: R } | null> {
	if (o.names.some((id) => !o.known.hasRecord(id))) return null;
	const release = o.gate.acquire();
	if (!release) return null;
	const before = o.known.snapshot(o.target);
	o.onCapturing(true);
	o.notice(null);
	const stopSlow = whenSlow(() => {
		if (o.current()) o.notice('still_working');
	});
	o.onSlowTimer?.(stopSlow);
	try {
		let result: A;
		try {
			result = await o.send();
		} finally {
			stopSlow();
			o.onSlowTimer?.(null);
			if (o.current()) o.notice(null);
		}
		if (!o.current()) return null;
		if (result.success) o.known.confirmed(result.record_id, result.image_ids);
		return { result };
	} catch (error) {
		if (!o.current()) return null;
		if (!isCaptureTimeout(error)) throw error;
		console.error(
			'[capture-check] Capture request ended in a timeout; reading the records:',
			error
		);
		const controller = new AbortController();
		o.onCheck(controller);
		o.notice('maybe_saved');
		try {
			const outcome = await checkForCapture({ before, read: o.read, signal: controller.signal });
			if (outcome.kind === 'stopped') return null;
			if (outcome.kind === 'not-saved') {
				o.notice(null);
				throw new CaptureNotSaved();
			}
			o.known.confirmed(
				outcome.record.id,
				(outcome.record.images ?? []).map((img) => img.id)
			);
			o.notice('found');
			return { found: outcome.record as R };
		} finally {
			o.onCheck(null);
		}
	} finally {
		o.onCapturing(false);
		release();
	}
}

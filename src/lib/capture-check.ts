// A capture request that ends in a timeout may still have been saved
// (NEH-381). POST /cameras/capture and /cameras/capture/dual
// (app/api/cameras.py) answer only once the capture is stored, and nothing
// cancels a capture the browser has stopped waiting for: after a 504 from
// nginx, or after the request layer's own TimeoutError (api.ts), the backend
// can still store the image files, the record and its images. A backend
// failure rolls the records back, so a failure the backend reports leaves
// no record behind.
//
// So every capture request carries an id of its own, `client_capture_id`
// (NEH-401), made fresh for each attempt (newClientCaptureId), and the
// backend stores the id with the capture, in the capture's own transaction.
// The capture screen does not report a timeout as a failure: it asks
// GET /cameras/capture-requests/{id} every CHECK_INTERVAL_MS
// (checkCaptureRequest). The answer is one of:
// - the capture stored under the id: the screen goes on exactly as after
//   the request's own successful answer;
// - `in_progress: true`, the request still running on the backend: ask
//   again, up to IN_PROGRESS_LIMIT_MS from the start of the check;
// - a 404 with code `not_found`: the backend neither runs nor holds the
//   capture, so nothing was saved;
// - a 404 without that code: a backend that has no such route, and ignores
//   the id; the screen cannot learn the outcome, says so, and sends the
//   operator to the volume's records;
// - any other failure of the ask: nothing is decided, and the screen asks
//   again, up to CHECK_WINDOW_MS from the start of the check (or
//   IN_PROGRESS_LIMIT_MS once an answer said `in_progress`), and then says
//   the outcome is unknown. A failed ask never ends as "not saved".
// A POST answered 409 `capture_in_progress` (the same id sent while its
// first request still runs) is checked in the same way. A POST answered 409
// `capture_abandoned` reached the backend after a lookup had closed its id,
// and photographed nothing: that attempt is not saved. Every capture
// control stays locked meanwhile, so that a second press cannot shoot again.
// The check's limits are measured on the monotonic clock (performance.now),
// never the wall clock.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `name`, `detail`), as capture-errors.ts does.
//
// Version: 0.3.0

import { CaptureNotSaved, CaptureOutcomeUnknown } from './capture-errors';

/** After this long in flight, the screen says the unit is still working on the capture. */
export const STILL_WORKING_AFTER_MS = 10_000;
/** How often the backend is asked for a timed-out capture while it is checked. */
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
/**
 * How long the check goes on once the backend has said the capture is still
 * running, from the start of the check. The backend's own worst case is far
 * shorter; past this the screen says the outcome is unknown.
 */
export const IN_PROGRESS_LIMIT_MS = 900_000;

export interface RecordLike {
	id: number;
	images?: readonly { id: number }[] | null;
}

/** The fields of a capture answer (CaptureResponse in api.ts) the screen reads. */
export interface CaptureAnswer {
	success: boolean;
	record_id?: number | null;
	image_ids?: number[] | null;
}

// `retry`: whether asking again later can still learn the outcome.
export type CheckOutcome<A extends CaptureAnswer = CaptureAnswer> =
	| { kind: 'stored'; answer: A }
	| { kind: 'not-saved' }
	| { kind: 'unknown'; retry: boolean }
	| { kind: 'stopped' };

/**
 * What the attempt was, for the message when its outcome is unknown: a new
 * capture at the end of the volume, a retake or a placeholder's fill (into
 * one record), or "Capture another here" (inserted among the records).
 */
export type CaptureAttempt = 'new' | 'retake' | 'another';

/** Whether a capture request ended in nginx's 504 or in the request layer's TimeoutError. */
export function isCaptureTimeout(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const { status, name } = error as { status?: unknown; name?: unknown };
	return status === 504 || name === 'TimeoutError';
}

function refusalCode(error: unknown, status: number): unknown {
	if (typeof error !== 'object' || error === null) return undefined;
	const { status: s, detail } = error as { status?: unknown; detail?: unknown };
	if (s !== status || typeof detail !== 'object' || detail === null) return undefined;
	return (detail as { code?: unknown }).code;
}

/** Whether a capture was answered 409 `capture_in_progress`: a request with its id is still running. */
export function isCaptureInProgress(error: unknown): boolean {
	return refusalCode(error, 409) === 'capture_in_progress';
}

/**
 * Whether a capture was answered 409 `capture_abandoned`: a lookup of its
 * id answered not found and closed the id, and a request that arrives with
 * it afterwards is refused without photographing. Nothing was saved for that
 * attempt.
 */
export function isCaptureAbandoned(error: unknown): boolean {
	return refusalCode(error, 409) === 'capture_abandoned';
}

/**
 * Whether a capture was refused for its id: 409 `client_capture_id_in_use`,
 * `capture_no_longer_stored` or `capture_abandoned`. The first two cannot
 * happen with a fresh id per attempt, and each is an ordinary failure;
 * `capture_abandoned` is handled as not saved (isCaptureAbandoned).
 */
export function isCaptureIdRefusal(error: unknown): boolean {
	const code = refusalCode(error, 409);
	return (
		code === 'client_capture_id_in_use' ||
		code === 'capture_no_longer_stored' ||
		code === 'capture_abandoned'
	);
}

// null: no crypto at all, without falling back to the global one.
type CryptoSource = Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>> | null | undefined;

/**
 * A fresh `client_capture_id`: a version 4 UUID in its canonical form, in
 * lower case. randomUUID exists only in a secure context, and the unit's
 * screen is served over plain http on the local network, so without it the
 * id is made from getRandomValues, which every browser has, and only
 * without either from Math.random. `source` defaults to the global crypto;
 * null means none.
 */
export function newClientCaptureId(source: CryptoSource = globalThis.crypto): string {
	if (typeof source?.randomUUID === 'function') return source.randomUUID().toLowerCase();
	const bytes = new Uint8Array(16);
	if (typeof source?.getRandomValues === 'function') source.getRandomValues(bytes);
	else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The record ids the screen knows the volume holds: those of every
 * successful read of the list, and every record a capture answer confirmed
 * since. A request that names a record not among them is not sent. Ids are
 * never reused, so nothing is removed until reset(), for another volume.
 * Until one read of the list has succeeded (`ready`; an empty list counts)
 * the gate starts no capture.
 */
export interface KnownRecords {
	/** At least one read of the list has succeeded since the last reset. */
	readonly ready: boolean;
	/** Whether the record is among the known ones. */
	hasRecord(id: number): boolean;
	/** A successful read of the volume's list. */
	listed(records: readonly RecordLike[]): void;
	/** A record a capture answer confirmed. */
	confirmed(recordId: number | null | undefined): void;
	reset(): void;
}

export function createKnownRecords(): KnownRecords {
	let recordIds = new Set<number>();
	let ready = false;
	return {
		get ready() {
			return ready;
		},
		hasRecord: (id) => recordIds.has(id),
		listed(records) {
			ready = true;
			for (const r of records) recordIds.add(r.id);
		},
		confirmed(recordId) {
			if (recordId != null) recordIds.add(recordId);
		},
		reset() {
			recordIds = new Set();
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
 *
 * serial() counts the captures the gate has let in ('capture' only), one
 * counter for every capture path of the screen: a capture reads it right
 * after acquiring, and what it writes to the screen's error banner on
 * completing it writes only while serial() still gives that number, so a
 * capture that completes after a later one has started leaves the banner to
 * the later one (NEH-388).
 */
export interface CaptureGate {
	isBusy(): boolean;
	acquire(kind?: 'capture' | 'test'): (() => void) | null;
	serial(): number;
}

/**
 * Whether a capture may write to the screen's banner now (its success, its
 * not-saved, its failure, a refusal): only while it is still the latest
 * capture started (`ticket`, the gate's serial() when it was let in) and the
 * screen is still on the volume it began in, mounted (`current`). Every write
 * site asks this after its last await, so neither condition is checked
 * without the other (NEH-388).
 */
export function mayReport(gate: CaptureGate, ticket: number, current: () => boolean): boolean {
	return gate.serial() === ticket && current();
}

export function createCaptureGate(
	onChange?: (busy: boolean) => void,
	ready: () => boolean = () => true
): CaptureGate {
	let busy = false;
	let started = 0;
	return {
		isBusy: () => busy,
		serial: () => started,
		acquire(kind = 'capture') {
			if (busy) return null;
			if (kind === 'capture' && !ready()) return null;
			busy = true;
			if (kind === 'capture') started += 1;
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

/** Calls `onSlow` once STILL_WORKING_AFTER_MS have passed; the function returned cancels it. */
export function whenSlow(onSlow: () => void, ms: number = STILL_WORKING_AFTER_MS): () => void {
	const timer = setTimeout(onSlow, ms);
	return () => clearTimeout(timer);
}

interface AskOptions {
	// The capture's client_capture_id.
	id: string;
	// GET /cameras/capture-requests/{id}: resolves its body, rejects with the
	// request's error (an ApiError carries `status` and `detail`).
	lookup: (id: string) => Promise<unknown>;
}

export interface CheckOptions extends AskOptions {
	// Aborted when the screen goes away or leaves the volume.
	signal: AbortSignal;
	// The monotonic clock every duration of the check is measured on, in
	// milliseconds: a step of the wall clock neither ends the check early nor
	// stretches it.
	now?: () => number;
}

type Answer<A> =
	| { kind: 'stored'; answer: A }
	| { kind: 'running' }
	| { kind: 'not-saved' }
	| { kind: 'no-route' }
	| { kind: 'gone' }
	| { kind: 'failed' };

// `log`: whether a failed ask is written to the console.
async function ask<A extends CaptureAnswer>(o: AskOptions, log = true): Promise<Answer<A>> {
	let body: unknown;
	try {
		body = await o.lookup(o.id);
	} catch (error) {
		// A backend that answers not found also closes the id: a request still
		// on its way with it is refused with 409 capture_abandoned and never
		// photographs, so "not saved" holds. An older backend does not close
		// ids, and with it a request that reaches it after this answer can
		// still photograph the opening a second time.
		if ((error as { status?: unknown } | null)?.status === 404) {
			return refusalCode(error, 404) === 'not_found' ? { kind: 'not-saved' } : { kind: 'no-route' };
		}
		// A capture stored under the id that has lost an image since: the
		// backend answers 410, and asking again will not change it. An older
		// backend answers 404 not_found here, which reads as not saved;
		// nothing tells the two apart.
		if (refusalCode(error, 410) === 'capture_no_longer_stored') return { kind: 'gone' };
		if (log) console.error('[capture-check] The ask for a capture failed:', error);
		return { kind: 'failed' };
	}
	if (typeof body !== 'object' || body === null) return { kind: 'failed' };
	const b = body as { in_progress?: unknown; success?: unknown };
	if (b.in_progress === true) return { kind: 'running' };
	if (b.in_progress === false && b.success === true) return { kind: 'stored', answer: body as A };
	return { kind: 'failed' };
}

/**
 * Asks for the capture saved under `id` every CHECK_INTERVAL_MS, the first
 * time CHECK_INTERVAL_MS after the call, until an answer decides: 'stored',
 * with the stored answer; 'not-saved' for a 404 `not_found`; 'unknown',
 * with `retry` false, for a 404 without that code (no such route) and for a
 * 410 `capture_no_longer_stored`; 'unknown', with `retry` true, for an
 * `in_progress` answer at or
 * after IN_PROGRESS_LIMIT_MS from the call, and for a failed ask at or after
 * CHECK_WINDOW_MS from the call, or IN_PROGRESS_LIMIT_MS when the answer
 * before it was `in_progress`. An ask still in flight decides when it
 * answers. Resolves 'stopped', with no timer left, when `signal` aborts.
 */
export function checkCaptureRequest<A extends CaptureAnswer = CaptureAnswer>(
	o: CheckOptions
): Promise<CheckOutcome<A>> {
	const now = o.now ?? (() => performance.now());
	const started = now();
	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let done = false;
		let running = false;
		const finish = (outcome: CheckOutcome<A>) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			o.signal.removeEventListener('abort', onAbort);
			resolve(outcome);
		};
		const onAbort = () => finish({ kind: 'stopped' });
		const schedule = () => {
			timer = setTimeout(askOnce, CHECK_INTERVAL_MS);
		};
		const askOnce = async () => {
			const elapsed = now() - started;
			const answer = await ask<A>(o);
			if (done) return;
			if (answer.kind === 'stored') finish(answer);
			else if (answer.kind === 'not-saved') finish({ kind: 'not-saved' });
			else if (answer.kind === 'no-route' || answer.kind === 'gone')
				finish({ kind: 'unknown', retry: false });
			else if (answer.kind === 'running') {
				running = true;
				if (elapsed >= IN_PROGRESS_LIMIT_MS) finish({ kind: 'unknown', retry: true });
				else schedule();
			} else if (elapsed >= (running ? IN_PROGRESS_LIMIT_MS : CHECK_WINDOW_MS)) {
				finish({ kind: 'unknown', retry: true });
			} else schedule();
		};
		if (o.signal.aborted) {
			onAbort();
			return;
		}
		o.signal.addEventListener('abort', onAbort, { once: true });
		schedule();
	});
}

/** How often a capture whose outcome is unknown is asked for again, in the background. */
export const RECONCILE_INTERVAL_MS = 15_000;
/** How long, on the monotonic clock, from the start of the background asks. */
export const RECONCILE_LIMIT_MS = 900_000;
/** How many background asks run at once; a further one drops the oldest. */
export const RECONCILE_MAX = 3;

export interface ReconcileOptions<A extends CaptureAnswer> extends AskOptions {
	// The capture stored under the id, once an ask finds it.
	onStored: (answer: A) => void;
	now?: () => number;
}

/**
 * The background asks for captures whose check ended as unknown: once the
 * gate is free, each id is asked for every RECONCILE_INTERVAL_MS, for up to
 * RECONCILE_LIMIT_MS, holding nothing. A stored answer is handed to
 * `onStored` once; a 404 (not found, or no such route) or a 410 ends the
 * asks silently; in progress, or a failed ask, asks again. Of failed asks
 * in a row only the first is logged. One per id; at
 * most RECONCILE_MAX at once, the oldest stopped for a newer one. start()
 * returns the function that stops that one; stopAll() stops every one, for
 * the screen leaving the volume or going.
 */
export interface Reconciler {
	start<A extends CaptureAnswer>(o: ReconcileOptions<A>): () => void;
	stopAll(): void;
	running(): number;
}

export function createReconciler(max: number = RECONCILE_MAX): Reconciler {
	const jobs: { id: string; stop: () => void }[] = [];
	return {
		start<A extends CaptureAnswer>(o: ReconcileOptions<A>) {
			const same = jobs.find((j) => j.id === o.id);
			if (same) return same.stop;
			while (jobs.length >= max) jobs[0].stop();
			const now = o.now ?? (() => performance.now());
			const started = now();
			let timer: ReturnType<typeof setTimeout> | undefined;
			let done = false;
			let failing = false;
			const stop = () => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				const i = jobs.indexOf(job);
				if (i >= 0) jobs.splice(i, 1);
			};
			const job = { id: o.id, stop };
			const schedule = () => {
				timer = setTimeout(askOnce, RECONCILE_INTERVAL_MS);
			};
			const askOnce = async () => {
				const elapsed = now() - started;
				const answer = await ask<A>(o, !failing);
				failing = answer.kind === 'failed';
				if (done) return;
				if (answer.kind === 'stored') {
					stop();
					o.onStored(answer.answer);
				} else if (answer.kind === 'running' || answer.kind === 'failed') {
					if (elapsed >= RECONCILE_LIMIT_MS) stop();
					else schedule();
				} else stop();
			};
			jobs.push(job);
			schedule();
			return stop;
		},
		stopAll() {
			for (const j of [...jobs]) j.stop();
		},
		running: () => jobs.length
	};
}

export interface PageCaptureOptions<A extends CaptureAnswer> {
	gate: CaptureGate;
	known: KnownRecords;
	// The record the capture goes into, null for a new one.
	target: number | null;
	// Every record the request names (record_id, afterRecordId).
	names: readonly number[];
	// Still on the volume the request began in, with the screen mounted.
	current: () => boolean;
	// Sends the request with `clientCaptureId` as its client_capture_id.
	send: (clientCaptureId: string) => Promise<A>;
	// GET /cameras/capture-requests/{id} (CheckOptions.lookup).
	lookup: (clientCaptureId: string) => Promise<unknown>;
	notice: (value: 'still_working' | 'maybe_saved' | 'found' | null) => void;
	// True from the request's start to the end of its check.
	onCapturing: (capturing: boolean) => void;
	// The running check's controller, null once it has ended: the screen
	// aborts it on unmount and on another volume.
	onCheck: (controller: AbortController | null) => void;
	// Cancels the still-working timer while the request is in flight, null after.
	onSlowTimer?: (cancel: (() => void) | null) => void;
	// What the attempt is, and whether it is in single-camera mode, for the
	// message when its outcome is unknown.
	attempt: CaptureAttempt;
	single: boolean;
	// Reads the volume's records again, with the gate still held, when the
	// check ends as unknown.
	reread?: () => Promise<unknown>;
	// Keeps asking for an unknown capture once the gate is free, and hands a
	// stored answer to `onReconciled`, with the capture's mayReport.
	reconciler?: Reconciler;
	onReconciled?: (answer: A, may: () => boolean) => void;
	// Runs once the gate is held, before anything is sent; an error it throws
	// sends nothing and is thrown on (NEH-388).
	precheck?: () => Promise<void>;
}

/**
 * A capture made by the page (a retake, a fill, "Capture another here").
 * Sends nothing, and resolves null, when a record it names is not among the
 * known records, or the gate refuses (held, or no successful read of the
 * volume yet), or when `precheck`, run once the gate is held, leaves
 * `current()` false; a `precheck` that throws sends nothing either, and its
 * error is thrown on. Otherwise it sends the request once, with a fresh
 * client_capture_id, holds the gate from the request to the end of any
 * check, and resolves the request's answer (its record added to what is
 * known when it succeeded); for a request that ended in a timeout or in a
 * 409 `capture_in_progress`, the answer stored under the id, the same way;
 * null, with nothing shown, when the answer arrives once `current()` is
 * false, or the check stopped. Throws the request's error for any other
 * failure, CaptureNotSaved when the backend says nothing was saved, and
 * CaptureOutcomeUnknown when the check could not learn it: then the records
 * are read again (`reread`) before the gate is released, and, while asking
 * again can still learn the outcome, `reconciler` goes on asking.
 */
export async function runPageCapture<A extends CaptureAnswer>(
	o: PageCaptureOptions<A>
): Promise<{ result: A } | null> {
	if (o.names.some((id) => !o.known.hasRecord(id))) return null;
	const release = o.gate.acquire();
	if (!release) return null;
	const ticket = o.gate.serial();
	if (o.precheck) {
		try {
			await o.precheck();
		} catch (error) {
			release();
			throw error;
		}
		if (!o.current()) {
			release();
			return null;
		}
	}
	const id = newClientCaptureId();
	o.onCapturing(true);
	o.notice(null);
	const stopSlow = whenSlow(() => {
		if (o.current()) o.notice('still_working');
	});
	o.onSlowTimer?.(stopSlow);
	try {
		let result: A;
		try {
			result = await o.send(id);
		} finally {
			stopSlow();
			o.onSlowTimer?.(null);
			if (o.current()) o.notice(null);
		}
		if (!o.current()) return null;
		if (result.success) o.known.confirmed(result.record_id);
		return { result };
	} catch (error) {
		if (!o.current()) return null;
		// The id was closed before this request reached the backend: nothing
		// was saved for this attempt, and the next one takes a new id.
		if (isCaptureAbandoned(error)) throw new CaptureNotSaved();
		if (!isCaptureTimeout(error) && !isCaptureInProgress(error)) throw error;
		console.error('[capture-check] Capture request ended unanswered; asking for its id:', error);
		const controller = new AbortController();
		o.onCheck(controller);
		o.notice('maybe_saved');
		try {
			const outcome = await checkCaptureRequest<A>({
				id,
				lookup: o.lookup,
				signal: controller.signal
			});
			if (outcome.kind === 'stopped') return null;
			if (outcome.kind === 'not-saved') {
				o.notice(null);
				throw new CaptureNotSaved();
			}
			if (outcome.kind === 'unknown') {
				o.notice(null);
				try {
					await o.reread?.();
				} catch (error) {
					console.error('[capture-check] The records could not be read again:', error);
				}
				if (!o.current()) return null;
				const unknown = new CaptureOutcomeUnknown(o.attempt, o.single);
				if (outcome.retry && o.reconciler) {
					o.reconciler.start<A>({
						id,
						lookup: o.lookup,
						onStored: (answer) => {
							if (!o.current()) return;
							o.known.confirmed(answer.record_id);
							o.onReconciled?.(answer, () => mayReport(o.gate, ticket, o.current));
							// Each place showing this attempt's message removes it.
							unknown.markFound();
						}
					});
				}
				throw unknown;
			}
			o.known.confirmed(outcome.answer.record_id);
			o.notice('found');
			return { result: outcome.answer };
		} finally {
			o.onCheck(null);
		}
	} finally {
		o.onCapturing(false);
		release();
	}
}

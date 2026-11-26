// Moving a hand-made volume's captures into a volume from Fisqua (NEH-419),
// and the move the unit could not settle (NEH-420): which volume offers the
// action and which volumes it can move into, the sentence for each refusal
// of GET and POST /collections/{source}/adopt-into/{target}
// (app/core/adopt_captures.py, app/core/adopt_apply.py), how a failed POST
// is read, and what the notice says for GET /system/adoption and each
// answer of POST /system/adoption/repair (app/core/adopt_repair.py). The
// backend's English text is never shown.
//
// No import of api.ts, so the tests run in plain node: errors are matched by
// shape (`status`, `detail`), as kept-volumes.ts does.
//
// Version: 0.3.0

import type { Messages } from './i18n';

export interface AdoptNames {
	source: string;
	target: string;
}

export interface RefusalLine {
	text: string;
	advice: string | null;
}

type Line = (msgs: Messages, n: AdoptNames) => RefusalLine;

const line =
	(
		text: (msgs: Messages, n: AdoptNames) => string,
		advice?: (msgs: Messages, n: AdoptNames) => string
	) =>
	(msgs: Messages, n: AdoptNames): RefusalLine => ({
		text: text(msgs, n),
		advice: advice ? advice(msgs, n) : null
	});

const ask = (msgs: Messages) => msgs.adopt_err_ask_installer;
const notEmpty = line(
	(msgs, n) => msgs.adopt_err_target_not_empty(n.target),
	(msgs) => msgs.adopt_err_target_not_empty_do
);
const namesHeld = line((msgs, n) => msgs.adopt_err_target_names_held(n.target));
const notVerified = line(
	(msgs, n) => msgs.adopt_err_not_verified(n.source),
	(msgs) => msgs.adopt_err_not_verified_do
);
const captureList = line((msgs, n) => msgs.adopt_err_capture_list(n.source, n.target), ask);

// Every refusal code the plan and the POST can give, with its sentence and,
// where the person can do something, its advice. Codes that share a
// sentence share an entry, and the list shows it once.
const REFUSALS: Record<string, Line> = {
	adoption_unfinished: line(
		(msgs) => msgs.adopt_err_unfinished,
		(msgs) => msgs.adopt_err_unfinished_do
	),
	source_not_found: line((msgs, n) => msgs.adopt_err_volume_gone(n.source)),
	target_not_found: line((msgs, n) => msgs.adopt_err_volume_gone(n.target)),
	same_volume: line(
		(msgs) => msgs.adopt_err_same_volume,
		(msgs) => msgs.adopt_err_same_volume_do
	),
	source_testing_volume: line((msgs, n) => msgs.adopt_err_testing(n.source)),
	target_testing_volume: line((msgs, n) => msgs.adopt_err_testing(n.target)),
	source_has_no_stem: line((msgs, n) => msgs.adopt_err_source_no_stem(n.source)),
	target_has_no_stem: line(
		(msgs, n) => msgs.adopt_err_target_no_stem(n.target),
		(msgs) => msgs.adopt_err_target_no_stem_do
	),
	target_not_assigned: line(
		(msgs, n) => msgs.adopt_err_target_not_assigned(n.target),
		(msgs) => msgs.adopt_err_target_not_assigned_do
	),
	target_withdrawn: line((msgs, n) => msgs.adopt_err_target_withdrawn(n.target)),
	source_sent_to_fisqua: line((msgs, n) => msgs.adopt_err_sent(n.source)),
	target_sent_to_fisqua: line((msgs, n) => msgs.adopt_err_sent(n.target)),
	source_kept_on_unit: line(
		(msgs, n) => msgs.adopt_err_kept(n.source),
		(msgs) => msgs.adopt_err_kept_do
	),
	target_kept_on_unit: line(
		(msgs, n) => msgs.adopt_err_kept(n.target),
		(msgs) => msgs.adopt_err_kept_do
	),
	source_has_sub_volumes: line((msgs, n) => msgs.adopt_err_sub_volumes(n.source)),
	source_has_no_images: line((msgs, n) => msgs.adopt_err_no_images(n.source)),
	source_has_open_colour_card_set: line(
		(msgs, n) => msgs.adopt_err_open_set(n.source),
		(msgs, n) => msgs.adopt_err_open_set_do(n.source)
	),
	target_has_records: notEmpty,
	target_has_images: notEmpty,
	target_counter_raised: notEmpty,
	target_has_colour_card_sets: notEmpty,
	target_has_offsite_keys: namesHeld,
	target_has_bucket_objects: namesHeld,
	offsite_tenant_not_configured: line(
		(msgs) => msgs.adopt_err_offsite_config,
		(msgs) => msgs.adopt_err_offsite_config_do
	),
	storage_unavailable: line((msgs) => msgs.adopt_err_storage, ask),
	source_outside_storage: line((msgs, n) => msgs.adopt_err_outside_storage(n.source)),
	target_outside_storage: line((msgs, n) => msgs.adopt_err_outside_storage(n.target)),
	source_records_handed_over: line(
		(msgs, n) => msgs.adopt_err_handed_over(n.source),
		(msgs) => msgs.adopt_err_handed_over_do
	),
	source_files_freed: line(
		(msgs, n) => msgs.adopt_err_freed(n.source),
		(msgs) => msgs.adopt_err_freed_do
	),
	source_file_outside_own_folder: line(
		(msgs, n) => msgs.adopt_err_outside_own_folder(n.source),
		ask
	),
	source_file_missing: line((msgs, n) => msgs.adopt_err_file_missing(n.source), ask),
	source_not_verified_offsite: notVerified,
	offsite_rows_not_verified: notVerified,
	source_capture_line_missing: captureList,
	source_manifest_path_unmapped: captureList,
	source_digest_missing: captureList,
	source_preview_digest_missing: captureList,
	source_name_not_contract: line((msgs, n) => msgs.adopt_err_names(n.source), ask),
	source_thumbnail_shared: line((msgs, n) => msgs.adopt_err_thumbnail_shared(n.source), ask),
	source_has_unowned_files: line((msgs, n) => msgs.adopt_err_unowned_files(n.source), ask),
	// No advice: the table gives none for it.
	new_name_collides: line((msgs) => msgs.adopt_err_name_taken),
	volume_held: line(
		(msgs) => msgs.adopt_err_volume_held,
		(msgs) => msgs.adopt_err_volume_held_do
	),
	adoption_in_progress: line(
		(msgs) => msgs.adopt_err_in_progress,
		(msgs) => msgs.adopt_err_in_progress_do
	),
	listing_unavailable: line(
		(msgs) => msgs.adopt_err_listing,
		(msgs) => msgs.adopt_err_listing_do
	),
	source_records_changed: line(
		(msgs, n) => msgs.adopt_err_records_changed(n.source),
		(msgs, n) => msgs.adopt_err_records_changed_do(n.source)
	)
};

/**
 * The lines of a refused plan or POST, in the order of its codes, each
 * sentence once. A code this file does not know adds no line: the dialog
 * says "Captua changed nothing" (adopt_refused_unchanged) above the list.
 */
export function refusalLines(
	codes: readonly string[],
	names: AdoptNames,
	msgs: Messages
): RefusalLine[] {
	const lines: RefusalLine[] = [];
	for (const code of codes) {
		const make = Object.prototype.hasOwnProperty.call(REFUSALS, code) ? REFUSALS[code] : null;
		if (!make) continue;
		const next = make(msgs, names);
		if (!lines.some((l) => l.text === next.text)) lines.push(next);
	}
	return lines;
}

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

function statusAndDetail(error: unknown): { status: unknown; detail: unknown } {
	return isObj(error)
		? { status: error.status, detail: error.detail }
		: { status: undefined, detail: undefined };
}

/**
 * How a POST of the adoption failed: refused with codes (409, 503: nothing
 * changed), failed after it began to move files with whether everything was
 * put back (500 `restored`), or `unknown`: an answer the page cannot read (a
 * network error, the client's time limit, a bodyless 502 or 504, any other
 * shape), after which the unit may have moved everything or still be
 * moving, and the dialog asks the unit before it says anything.
 */
export type AdoptFailure =
	| { kind: 'refused'; codes: string[] }
	| { kind: 'failed'; restored: boolean }
	| { kind: 'unknown' };

export function adoptFailureOf(error: unknown): AdoptFailure {
	const { status, detail } = statusAndDetail(error);
	if (!isObj(detail)) return { kind: 'unknown' };
	if ((status === 409 || status === 503) && Array.isArray(detail.codes)) {
		return {
			kind: 'refused',
			codes: detail.codes.filter((c): c is string => typeof c === 'string')
		};
	}
	if (status === 500 && typeof detail.restored === 'boolean') {
		return { kind: 'failed', restored: detail.restored };
	}
	return { kind: 'unknown' };
}

/**
 * Whether a 2xx answer of the POST is the result: every field the result
 * step reads is there with its type. Anything else (no body, an empty body,
 * another shape) is an unknown outcome, as a lost answer is.
 */
export function isAdoptResult(body: unknown): boolean {
	if (!isObj(body) || Array.isArray(body)) return false;
	const count = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
	return (
		count(body.records) &&
		count(body.images) &&
		count(body.colour_card_sets) &&
		typeof body.target_lines_pending === 'boolean' &&
		typeof body.recovery_pending === 'boolean'
	);
}

/**
 * Whether a capture or a record action was refused because an adoption
 * closed the volume: 409 `captures_adopted_away` (app/core/adopt_journal.py).
 */
export function isAdoptedAway(error: unknown): boolean {
	const { status, detail } = statusAndDetail(error);
	return status === 409 && isObj(detail) && detail.code === 'captures_adopted_away';
}

interface SourceFields {
	external_id?: string | null;
	kept_on_unit?: boolean;
	captures_adopted_at?: string | null;
	testing?: boolean;
}

/**
 * Whether the volume page offers the action (to an administrator): a volume
 * made by hand (no Fisqua reference code), with at least one record, not
 * kept on the unit, not closed by an earlier adoption, and not testing work.
 */
export function adoptActionOffered(volume: SourceFields, recordCount: number | null): boolean {
	return (
		!volume.external_id &&
		!volume.kept_on_unit &&
		!volume.captures_adopted_at &&
		!volume.testing &&
		typeof recordCount === 'number' &&
		recordCount > 0
	);
}

interface CandidateFields {
	id: number;
	external_id?: string | null;
	queue_hidden_at?: string | null;
	kept_on_unit?: boolean;
	record_count?: number;
}

/**
 * The volumes the dialog offers to move into: assigned by Fisqua (a
 * reference code), not withdrawn from its queue, not kept on the unit, with
 * no records, and not the source. The plan refuses whatever else stands in
 * the way, and the dialog shows that refusal.
 */
export function adoptCandidates<V extends CandidateFields>(
	volumes: readonly V[],
	sourceId: number
): V[] {
	return volumes.filter(
		(v) =>
			v.id !== sourceId &&
			!!v.external_id &&
			!v.queue_hidden_at &&
			!v.kept_on_unit &&
			v.record_count === 0
	);
}

interface PlanNames {
	renames_count: number;
	renames: readonly { new_name: string }[];
	shot_renames?: readonly { new_name: string }[];
}

/** The first new file names of a plan, images then color card shots, and how many more there are. */
export function newNames(plan: PlanNames, shown = 2): { names: string[]; more: number } {
	const shots = plan.shot_renames ?? [];
	const all = [...plan.renames, ...shots].map((r) => r.new_name);
	const total = plan.renames_count + shots.length;
	const names = all.slice(0, shown);
	return { names, more: Math.max(0, total - names.length) };
}

// ---------------------------------------------------------------------------
// The move the unit could not settle (NEH-420)
// ---------------------------------------------------------------------------

export interface UnfinishedAdoption {
	/** The two volumes' titles; null when the journal names no volume that exists. */
	source: string | null;
	target: string | null;
	/** `recovering`: the move or its recovery is running now; `blocked`: it stopped and stays. */
	state: 'recovering' | 'blocked';
	/**
	 * Why a blocked journal stays (app/core/adopt_repair.py): `recovery_not_run` when no
	 * recovery has run since the move stopped; a recovery's code otherwise.
	 */
	reason: string | null;
	/** The files at neither their old nor their new path. */
	missing: string[];
	repairAvailable: boolean;
	repairRefusal: string | null;
	/** The missing files Captua never uploaded, which no repair can bring back. */
	neverUploaded: string[];
	/** The journal's own run id: the repair names it, so it repairs only the move read. */
	runId: string | null;
	/** The two volumes' ids; null where the journal names none. */
	sourceId: number | null;
	targetId: number | null;
}

function idOf(v: unknown): number | null {
	return isObj(v) && typeof v.id === 'number' ? v.id : null;
}

function nameOf(v: unknown): string | null {
	return isObj(v) && typeof v.name === 'string' ? v.name : null;
}

/** GET /system/adoption, or null for `{unfinished: null}` and for anything not shaped as the report. */
export function readUnfinished(raw: unknown): UnfinishedAdoption | null {
	if (!isObj(raw) || !isObj(raw.unfinished)) return null;
	const u = raw.unfinished;
	if (u.state !== 'recovering' && u.state !== 'blocked') return null;
	const missing = Array.isArray(u.missing) ? u.missing.filter(isObj) : [];
	const name = (m: Record<string, unknown>) => (typeof m.name === 'string' ? m.name : null);
	return {
		source: nameOf(u.source),
		target: nameOf(u.target),
		state: u.state,
		reason: typeof u.reason === 'string' ? u.reason : null,
		missing: missing.map(name).filter((n): n is string => n !== null),
		// Without an identity the backend cannot protect a repair from a replaced journal.
		repairAvailable:
			u.repair_available === true && typeof u.run_id === 'string' && u.run_id.length > 0,
		repairRefusal: typeof u.repair_refusal === 'string' ? u.repair_refusal : null,
		neverUploaded: missing
			.filter((m) => m.why_not === 'never_uploaded')
			.map(name)
			.filter((n): n is string => n !== null),
		runId: typeof u.run_id === 'string' ? u.run_id : null,
		sourceId: idOf(u.source),
		targetId: idOf(u.target)
	};
}

/**
 * A read of GET /system/adoption has three results: the report, nothing
 * unfinished (`{unfinished: null}`), or failed (the request failed, or the
 * answer is not the report). A failed read says nothing about the unit, so
 * whatever is on screen stays.
 */
export type ReportRead =
	| { kind: 'report'; u: UnfinishedAdoption; running: RunningNow | null }
	| { kind: 'none'; running: RunningNow | null }
	// `refused`: 401 (the session is over) or 403 (the role may not read it): the reader stops.
	| { kind: 'failed'; refused?: 401 | 403 };

/** The result of a read that ended in an error. */
export function reportReadError(error: unknown): ReportRead {
	const { status } = statusAndDetail(error);
	return status === 401 || status === 403
		? { kind: 'failed', refused: status }
		: { kind: 'failed' };
}

/**
 * What holds the unit's adoption lock now (the report's `running`): an
 * adoption from the moment it takes the lock, before its journal exists, a
 * recovery, or a repair.
 */
export interface RunningNow {
	kind: string | null;
	requestId: string | null;
	sourceId: number | null;
	targetId: number | null;
}

function runningOf(raw: Record<string, unknown>): RunningNow | null {
	const r = raw.running;
	if (!isObj(r)) return null;
	return {
		kind: typeof r.kind === 'string' ? r.kind : null,
		requestId: typeof r.request_id === 'string' ? r.request_id : null,
		sourceId: idOf(r.source),
		targetId: idOf(r.target)
	};
}

/** The result of a read from its answer; a failed request is `{kind: 'failed'}` at the caller. */
export function reportRead(raw: unknown): ReportRead {
	if (!isObj(raw)) return { kind: 'failed' };
	if (raw.unfinished === null) return { kind: 'none', running: runningOf(raw) };
	const u = readUnfinished(raw);
	return u ? { kind: 'report', u, running: runningOf(raw) } : { kind: 'failed' };
}

/**
 * What the move dialog says of a move the unit left half done (a lookup's
 * `interrupted`, or a failure with `restored: false`), from a read of the
 * report: `blocked`, recovery has run and could not settle it (the notice's
 * Repair, or whom to ask); `working`, a recovery or a move holds the lock
 * now, so the outcome is still coming; `restart`, no recovery has tried it,
 * or the report could not be read, so a restart is what settles it;
 * `settled`, nothing is unfinished or running any more.
 */
export function halfMovedAdvice(read: ReportRead): 'blocked' | 'working' | 'restart' | 'settled' {
	if (read.kind === 'failed') return 'restart';
	if (read.running !== null) return 'working';
	if (read.kind === 'none') return 'settled';
	if (read.u.state === 'recovering') return 'working';
	return read.u.reason === 'recovery_not_run' ? 'restart' : 'blocked';
}

export interface NoticeReadInputs {
	isAdmin: boolean;
	named: boolean;
	quietRunning: boolean;
}

/** Layout notifications can change the unit after an idle report stopped polling. */
export function noticeReadOnChange(
	previous: NoticeReadInputs | null,
	next: NoticeReadInputs
): 'enter' | 'refresh' | null {
	if (!next.isAdmin) return null;
	if (!previous?.isAdmin) return 'enter';
	return previous.named !== next.named || previous.quietRunning !== next.quietRunning
		? 'refresh'
		: null;
}

/** A preflight may only authorize the run that was displayed at the press. */
export function repairStillOffered(displayed: UnfinishedAdoption, read: ReportRead): boolean {
	return (
		!!displayed.runId &&
		read.kind === 'report' &&
		read.u.runId === displayed.runId &&
		read.running === null &&
		read.u.state === 'blocked' &&
		read.u.repairAvailable
	);
}

/**
 * What the notice says in place of the Repair button when no repair can
 * run: a repair or a move running elsewhere is said as repairing; a file
 * never uploaded is named, then whom to ask; every other refusal
 * (app/core/adopt_repair.py REFUSALS) is whom to ask.
 */
export function noRepairLines(u: UnfinishedAdoption, msgs: Messages): string[] {
	if (u.repairRefusal === 'repair_running' || u.repairRefusal === 'adoption_running') {
		return [msgs.unsettled_repairing];
	}
	if (u.repairRefusal === 'files_not_repairable' && u.neverUploaded.length > 0) {
		return [
			...u.neverUploaded.map((n) => msgs.unsettled_err_never_copied(n)),
			msgs.unsettled_no_repair
		];
	}
	return [msgs.unsettled_no_repair];
}

/** What a POST /system/adoption/repair ended in. `done`: the move is settled. */
/** The two volumes a repair's own answer names; null where it names none. */
export interface RepairNames {
	source: string | null;
	target: string | null;
	sourceId: number | null;
	targetId: number | null;
}

export type RepairOutcome = { names?: RepairNames } & (
	| { kind: 'finished'; done: true }
	| { kind: 'reverted'; done: true }
	| { kind: 'mismatch'; done: false; name: string }
	| { kind: 'absent'; done: false; name: string }
	| { kind: 'never_uploaded'; done: false; name: string }
	| { kind: 'other'; done: false }
	// An answer the page cannot read: the notice reads the report again until it changes.
	| { kind: 'unknown'; done: false }
	// 409 `journal_changed`: another move is now the unfinished one; the report is read again.
	| { kind: 'changed'; done: false }
);

/** Publish a repair answer only after a subsequent report agrees with it. */
export function repairOutcomeFitsReport(
	result: RepairOutcome,
	before: UnfinishedAdoption,
	read: ReportRead
): boolean {
	if (read.kind === 'failed' || !before.runId) return false;
	const names = result.names;
	if (
		names &&
		((names.sourceId !== null && names.sourceId !== before.sourceId) ||
			(names.targetId !== null && names.targetId !== before.targetId))
	)
		return false;
	if (result.kind === 'changed' || result.kind === 'unknown') return false;
	return result.done
		? read.kind === 'none' && read.running === null
		: read.kind === 'report' && read.u.runId === before.runId;
}

function namesOf(v: unknown): RepairNames | undefined {
	if (!isObj(v) || (!('source' in v) && !('target' in v))) return undefined;
	return {
		source: nameOf(v.source),
		target: nameOf(v.target),
		sourceId: idOf(v.source),
		targetId: idOf(v.target)
	};
}

function baseName(path: unknown): string | null {
	if (typeof path !== 'string' || path === '') return null;
	const parts = path.split('/');
	return parts[parts.length - 1] || null;
}

/** The outcome of a repair, from its answer or from the error it was refused with. */
export function repairOutcomeOf(answerOrError: unknown): RepairOutcome {
	const outcome = repairOutcomeKind(answerOrError);
	const names = namesOf(
		isObj(answerOrError) && typeof answerOrError.result === 'string'
			? answerOrError
			: statusAndDetail(answerOrError).detail
	);
	return names ? { ...outcome, names } : outcome;
}

function repairOutcomeKind(answerOrError: unknown): RepairOutcome {
	if (isObj(answerOrError) && typeof answerOrError.result === 'string') {
		if (answerOrError.result === 'finished') return { kind: 'finished', done: true };
		if (answerOrError.result === 'reverted') return { kind: 'reverted', done: true };
		if (answerOrError.result === 'unfinished') return { kind: 'other', done: false };
		return { kind: 'unknown', done: false };
	}
	const { detail } = statusAndDetail(answerOrError);
	if (!isObj(detail) || typeof detail.code !== 'string') return { kind: 'unknown', done: false };
	if (detail.code === 'journal_changed') return { kind: 'changed', done: false };
	const file = isObj(detail.file) ? baseName(detail.file.path) : null;
	if (detail.code === 'repair_digest_mismatch' && file)
		return { kind: 'mismatch', done: false, name: file };
	if (detail.code === 'repair_object_missing' && file)
		return { kind: 'absent', done: false, name: file };
	if (detail.code === 'repair_not_possible' && Array.isArray(detail.missing)) {
		const never = detail.missing.find((m) => isObj(m) && m.why_not === 'never_uploaded');
		const name = isObj(never) ? (typeof never.name === 'string' ? never.name : null) : null;
		if (name) return { kind: 'never_uploaded', done: false, name };
	}
	return { kind: 'other', done: false };
}

/** The sentence for a repair's outcome, with the volumes its own answer names (the report's otherwise). */
export function repairOutcomeText(
	outcome: RepairOutcome,
	u: UnfinishedAdoption,
	msgs: Messages
): string {
	switch (outcome.kind) {
		case 'finished':
			return msgs.unsettled_done_finished(outcome.names?.target ?? u.target ?? '');
		case 'reverted':
			return msgs.unsettled_done_undone(outcome.names?.source ?? u.source ?? '');
		case 'mismatch':
			return msgs.unsettled_err_mismatch(outcome.name);
		case 'absent':
			return msgs.unsettled_err_absent(outcome.name);
		case 'never_uploaded':
			return msgs.unsettled_err_never_copied(outcome.name);
		default:
			return msgs.unsettled_no_repair;
	}
}

// ---------------------------------------------------------------------------
// What became of a move the page sent (GET /system/adoption/requests/{id})
// ---------------------------------------------------------------------------

/** The counts of an applied move, from the unit's record; null when the record has none. */
export interface AppliedSummary {
	records: number;
	images: number;
	colourCardSets: number;
	/** A last step is left for the next start (`target_lines_pending` or `recovery_pending`). */
	pending: boolean;
}

/**
 * The state of a move the page sent with its id, as the unit records it
 * (app/core/adoption_requests.py): `working` (running, or the unit busy with
 * another: ask again), `applied`, `refused` with its codes, `failed` with
 * whether everything was put back, `reverted` (nothing of it is in place),
 * `interrupted` (an interrupted move with this id is on the unit), `closed`
 * (the unit never saw the id, and never runs a move with it), or
 * `lookup_failed` (the lookup failed or its answer is not one of these).
 */
export type RequestState =
	| { kind: 'working' }
	| { kind: 'applied'; summary: AppliedSummary | null }
	| { kind: 'refused'; codes: string[] }
	| { kind: 'failed'; restored: boolean }
	| { kind: 'reverted' }
	| { kind: 'interrupted' }
	| { kind: 'closed' }
	// 401: the session is over; 403: this role may not ask; 422: the id is malformed.
	| { kind: 'session' }
	| { kind: 'forbidden' }
	| { kind: 'invalid' }
	| { kind: 'lookup_failed' };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function summaryOf(result: unknown): AppliedSummary | null {
	if (!isObj(result) || !finite(result.records) || !finite(result.images)) return null;
	if (!finite(result.colour_card_sets)) return null;
	return {
		records: result.records,
		images: result.images,
		colourCardSets: result.colour_card_sets,
		pending: result.target_lines_pending === true || result.recovery_pending === true
	};
}

/** The state of a lookup, from its answer or from the error it ended in. */
export function requestStateOf(answerOrError: unknown): RequestState {
	if (answerOrError instanceof Error || !isObj(answerOrError) || !('state' in answerOrError)) {
		const { status, detail } = statusAndDetail(answerOrError);
		if (status === 404 && isObj(detail) && detail.state === 'closed') return { kind: 'closed' };
		if (status === 401) return { kind: 'session' };
		if (status === 403) return { kind: 'forbidden' };
		if (status === 422) return { kind: 'invalid' };
		return { kind: 'lookup_failed' };
	}
	const a = answerOrError;
	switch (a.state) {
		case 'running':
		case 'busy':
			return { kind: 'working' };
		case 'applied':
			return { kind: 'applied', summary: summaryOf(a.result) };
		case 'refused':
			return isObj(a.detail) && Array.isArray(a.detail.codes)
				? {
						kind: 'refused',
						codes: a.detail.codes.filter((c): c is string => typeof c === 'string')
					}
				: { kind: 'lookup_failed' };
		case 'failed':
			return typeof a.restored === 'boolean'
				? { kind: 'failed', restored: a.restored }
				: { kind: 'lookup_failed' };
		case 'reverted':
			return { kind: 'reverted' };
		case 'interrupted':
			return { kind: 'interrupted' };
		case 'closed':
			return { kind: 'closed' };
		default:
			return { kind: 'lookup_failed' };
	}
}

/** The page's id for a move: a UUID in its canonical form (the backend's REQUEST_ID_PATTERN). */
const REQUEST_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface StoredRequest {
	requestId: string;
	targetId: number;
	targetName: string;
}

/**
 * A move kept in sessionStorage while its outcome is not known, or null for
 * anything else (no entry, not JSON, a field of the wrong type, an id that is
 * not a canonical UUID): the caller removes such an entry.
 */
export function readStoredRequest(raw: string | null): StoredRequest | null {
	if (!raw) return null;
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isObj(v) || Array.isArray(v)) return null;
	if (typeof v.requestId !== 'string' || !REQUEST_ID.test(v.requestId)) return null;
	if (typeof v.targetId !== 'number' || !Number.isInteger(v.targetId)) return null;
	if (typeof v.targetName !== 'string') return null;
	return { requestId: v.requestId, targetId: v.targetId, targetName: v.targetName };
}

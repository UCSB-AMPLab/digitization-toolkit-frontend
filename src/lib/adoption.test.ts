// Moving a hand-made volume's captures into a volume from Fisqua (NEH-419)
// and the move the unit could not settle (NEH-420): which volumes are
// offered, the sentence for every refusal code, how a failed POST is read,
// and what the notice says for each state of GET /system/adoption and each
// answer of POST /system/adoption/repair.
//
// Version: 0.3.0
import { describe, expect, it } from 'vitest';
import { es } from './i18n/es';
import {
	adoptActionOffered,
	adoptCandidates,
	adoptFailureOf,
	isAdoptedAway,
	isAdoptResult,
	newNames,
	halfMovedAdvice,
	noRepairLines,
	readUnfinished,
	refusalLines,
	repairOutcomeOf,
	repairOutcomeText,
	repairStillOffered,
	repairOutcomeFitsReport,
	noticeReadOnChange,
	readStoredRequest,
	reportRead,
	reportReadError,
	requestStateOf
} from './adoption';

const S = 'Fuente A';
const T = 'Destino B';
const names = { source: S, target: T };
const ask = es.adopt_err_ask_installer;

// Every code of REFUSAL_CODES in app/core/adopt_captures.py (backend dev,
// read 24 Nov 2026), then the refusals only the POST makes
// (app/core/adopt_apply.py): volume_held, target_has_bucket_objects,
// offsite_rows_not_verified, adoption_in_progress, listing_unavailable,
// source_records_changed. Each with the sentence and the advice it shows.
const CODES: [string, string, string | null][] = [
	['adoption_unfinished', es.adopt_err_unfinished, es.adopt_err_unfinished_do],
	['source_not_found', es.adopt_err_volume_gone(S), null],
	['target_not_found', es.adopt_err_volume_gone(T), null],
	['same_volume', es.adopt_err_same_volume, es.adopt_err_same_volume_do],
	['source_testing_volume', es.adopt_err_testing(S), null],
	['target_testing_volume', es.adopt_err_testing(T), null],
	['source_has_no_stem', es.adopt_err_source_no_stem(S), null],
	['target_has_no_stem', es.adopt_err_target_no_stem(T), es.adopt_err_target_no_stem_do],
	['target_not_assigned', es.adopt_err_target_not_assigned(T), es.adopt_err_target_not_assigned_do],
	['target_withdrawn', es.adopt_err_target_withdrawn(T), null],
	['source_sent_to_fisqua', es.adopt_err_sent(S), null],
	['target_sent_to_fisqua', es.adopt_err_sent(T), null],
	['source_kept_on_unit', es.adopt_err_kept(S), es.adopt_err_kept_do],
	['target_kept_on_unit', es.adopt_err_kept(T), es.adopt_err_kept_do],
	['source_has_sub_volumes', es.adopt_err_sub_volumes(S), null],
	['source_has_no_images', es.adopt_err_no_images(S), null],
	['source_has_open_colour_card_set', es.adopt_err_open_set(S), es.adopt_err_open_set_do(S)],
	['target_has_records', es.adopt_err_target_not_empty(T), es.adopt_err_target_not_empty_do],
	['target_has_images', es.adopt_err_target_not_empty(T), es.adopt_err_target_not_empty_do],
	['target_counter_raised', es.adopt_err_target_not_empty(T), es.adopt_err_target_not_empty_do],
	[
		'target_has_colour_card_sets',
		es.adopt_err_target_not_empty(T),
		es.adopt_err_target_not_empty_do
	],
	['target_has_offsite_keys', es.adopt_err_target_names_held(T), null],
	['offsite_tenant_not_configured', es.adopt_err_offsite_config, es.adopt_err_offsite_config_do],
	['storage_unavailable', es.adopt_err_storage, ask],
	['source_outside_storage', es.adopt_err_outside_storage(S), null],
	['target_outside_storage', es.adopt_err_outside_storage(T), null],
	['source_records_handed_over', es.adopt_err_handed_over(S), es.adopt_err_handed_over_do],
	['source_files_freed', es.adopt_err_freed(S), es.adopt_err_freed_do],
	['source_file_outside_own_folder', es.adopt_err_outside_own_folder(S), ask],
	['source_file_missing', es.adopt_err_file_missing(S), ask],
	['source_not_verified_offsite', es.adopt_err_not_verified(S), es.adopt_err_not_verified_do],
	['source_capture_line_missing', es.adopt_err_capture_list(S, T), ask],
	['source_manifest_path_unmapped', es.adopt_err_capture_list(S, T), ask],
	['source_digest_missing', es.adopt_err_capture_list(S, T), ask],
	['source_preview_digest_missing', es.adopt_err_capture_list(S, T), ask],
	['source_name_not_contract', es.adopt_err_names(S), ask],
	['source_thumbnail_shared', es.adopt_err_thumbnail_shared(S), ask],
	['source_has_unowned_files', es.adopt_err_unowned_files(S), ask],
	['new_name_collides', es.adopt_err_name_taken, null],
	// Refused only by the POST (app/core/adopt_apply.py).
	['volume_held', es.adopt_err_volume_held, es.adopt_err_volume_held_do],
	['target_has_bucket_objects', es.adopt_err_target_names_held(T), null],
	['offsite_rows_not_verified', es.adopt_err_not_verified(S), es.adopt_err_not_verified_do],
	['adoption_in_progress', es.adopt_err_in_progress, es.adopt_err_in_progress_do],
	['listing_unavailable', es.adopt_err_listing, es.adopt_err_listing_do],
	['source_records_changed', es.adopt_err_records_changed(S), es.adopt_err_records_changed_do(S)]
];

describe('refusalLines', () => {
	it.each(CODES)('%s has its sentence and its advice', (code, text, advice) => {
		expect(refusalLines([code], names, es)).toEqual([{ text, advice }]);
	});

	it('shows a sentence that several codes share once, in the order of the codes', () => {
		const lines = refusalLines(
			['target_has_records', 'source_files_freed', 'target_has_images', 'target_counter_raised'],
			names,
			es
		);
		expect(lines.map((l) => l.text)).toEqual([
			es.adopt_err_target_not_empty(T),
			es.adopt_err_freed(S)
		]);
	});

	it('leaves an unknown code out: the dialog says "Captua changed nothing" above the list', () => {
		expect(refusalLines(['something_new'], names, es)).toEqual([]);
		expect(refusalLines(['something_new', 'same_volume'], names, es)).toHaveLength(1);
	});

	it('never shows the backend English', () => {
		for (const [code] of CODES) {
			for (const line of refusalLines([code], names, es)) {
				expect(line.text).not.toMatch(/adoption|bucket|Nothing was changed/);
			}
		}
	});
});

describe('adoptFailureOf', () => {
	const err = (status: number, detail: unknown) =>
		Object.assign(new Error('x'), { status, detail });

	it('reads a refusal of the POST (409 and 503 with codes)', () => {
		expect(
			adoptFailureOf(err(409, { message: 'English', codes: ['volume_held'], details: {} }))
		).toEqual({ kind: 'refused', codes: ['volume_held'] });
		expect(
			adoptFailureOf(err(503, { message: 'English', codes: ['listing_unavailable'], details: {} }))
		).toEqual({ kind: 'refused', codes: ['listing_unavailable'] });
	});

	it('reads a failure after the move began, with whether everything was put back', () => {
		expect(adoptFailureOf(err(500, { message: 'English', restored: true }))).toEqual({
			kind: 'failed',
			restored: true
		});
		expect(adoptFailureOf(err(500, { message: 'English', restored: false }))).toEqual({
			kind: 'failed',
			restored: false
		});
	});

	it('anything else is an outcome the page does not know', () => {
		expect(adoptFailureOf(new TypeError('fetch failed'))).toEqual({ kind: 'unknown' });
		expect(adoptFailureOf(err(403, 'Not enough permissions'))).toEqual({ kind: 'unknown' });
		expect(adoptFailureOf(err(500, 'Internal'))).toEqual({ kind: 'unknown' });
	});
});

describe('isAdoptedAway', () => {
	it('is the 409 captures_adopted_away, matched on the code', () => {
		const e = Object.assign(new Error('x'), {
			status: 409,
			detail: { code: 'captures_adopted_away', message: 'English' }
		});
		expect(isAdoptedAway(e)).toBe(true);
		expect(isAdoptedAway({ status: 409, detail: { code: 'adoption_unfinished' } })).toBe(false);
		expect(isAdoptedAway({ status: 404, detail: { code: 'captures_adopted_away' } })).toBe(false);
		expect(isAdoptedAway(null)).toBe(false);
	});
});

describe('which volumes', () => {
	const vol = (over: Record<string, unknown>) => ({
		id: 1,
		name: 'v',
		external_id: 'co-1',
		queue_hidden_at: null,
		kept_on_unit: false,
		record_count: 0,
		...over
	});

	it('offers the action on a hand-made volume with records, not kept and not closed', () => {
		const hand = { external_id: null, kept_on_unit: false, captures_adopted_at: null };
		expect(adoptActionOffered(hand, 3)).toBe(true);
		expect(adoptActionOffered({ ...hand, external_id: '' }, 3)).toBe(true);
		expect(adoptActionOffered({ ...hand, external_id: 'co-1' }, 3)).toBe(false);
		expect(adoptActionOffered(hand, 0)).toBe(false);
		expect(adoptActionOffered(hand, null)).toBe(false);
		expect(adoptActionOffered({ ...hand, kept_on_unit: true }, 3)).toBe(false);
		expect(adoptActionOffered({ ...hand, captures_adopted_at: '2026-11-24T10:00:00' }, 3)).toBe(
			false
		);
		expect(adoptActionOffered({ ...hand, testing: true }, 3)).toBe(false);
	});

	it('lists the empty volumes from Fisqua that are not withdrawn and not kept, without the source', () => {
		const list = [
			vol({ id: 1, name: 'source', external_id: null, record_count: 5 }),
			vol({ id: 2, name: 'ok' }),
			vol({ id: 3, name: 'hand-made', external_id: null }),
			vol({ id: 4, name: 'withdrawn', queue_hidden_at: '2026-11-01T00:00:00' }),
			vol({ id: 5, name: 'kept', kept_on_unit: true }),
			vol({ id: 6, name: 'with records', record_count: 2 }),
			vol({ id: 7, name: 'no count', record_count: undefined }),
			vol({ id: 8, name: 'empty code', external_id: '' }),
			vol({ id: 9, name: 'also ok' })
		];
		expect(adoptCandidates(list, 1).map((v) => v.id)).toEqual([2, 9]);
		expect(adoptCandidates(list, 2).map((v) => v.id)).toEqual([9]);
	});
});

describe('newNames', () => {
	it('gives the first two new names, images then shots, and how many more', () => {
		const plan = {
			renames_count: 14,
			renames: [{ new_name: 'b-img_0001_c0.cr2' }, { new_name: 'b-img_0001_c1.cr2' }],
			shot_renames: [{ new_name: 'b-cc_01_c0.cr2' }, { new_name: 'b-cc_01_c1.cr2' }]
		};
		expect(newNames(plan)).toEqual({
			names: ['b-img_0001_c0.cr2', 'b-img_0001_c1.cr2'],
			more: 14
		});
		expect(
			newNames({ renames_count: 0, renames: [], shot_renames: [{ new_name: 'b-cc_01_c0.cr2' }] })
		).toEqual({ names: ['b-cc_01_c0.cr2'], more: 0 });
	});
});

// GET /system/adoption (app/core/adopt_repair.py report), with the fields
// the notice reads.
function blocked(over: Record<string, unknown> = {}) {
	return {
		unfinished: {
			source: { id: 1, name: S, filename_stem: 'src' },
			target: { id: 2, name: T, filename_stem: 'tgt' },
			state: 'blocked',
			reason: 'file_at_neither_path',
			message: 'English',
			missing: [
				{
					kind: 'master',
					old_path: '/p/src/captures/src-img_0003_c1.cr2',
					new_path: '/p/tgt/captures/tgt-img_0003_c1.cr2',
					name: 'src-img_0003_c1.cr2',
					image_id: 9,
					repairable: true,
					why_not: null,
					needs_storage: true
				}
			],
			at_both: [],
			staging: { path: '/p/.captua-adoption-repair', same_filesystem: true },
			repair_refusal: null,
			repair_available: true,
			run_id: 'run-1',
			...over
		}
	};
}

describe('readUnfinished', () => {
	it('is null for {unfinished: null} and for anything not shaped as the report', () => {
		expect(readUnfinished({ unfinished: null })).toBeNull();
		expect(readUnfinished(null)).toBeNull();
		expect(readUnfinished({ unfinished: { state: 'other' } })).toBeNull();
	});

	it('reads the volumes, the state, the missing files and the repair', () => {
		expect(readUnfinished(blocked())).toEqual({
			source: S,
			target: T,
			state: 'blocked',
			reason: 'file_at_neither_path',
			missing: ['src-img_0003_c1.cr2'],
			repairAvailable: true,
			repairRefusal: null,
			neverUploaded: [],
			runId: 'run-1',
			sourceId: 1,
			targetId: 2
		});
	});

	it('names the files that were never uploaded', () => {
		const u = readUnfinished(
			blocked({
				repair_available: false,
				repair_refusal: 'files_not_repairable',
				missing: [
					{
						kind: 'buffer',
						name: 'src-img_0003_c1.raw',
						repairable: false,
						why_not: 'never_uploaded'
					},
					{
						kind: 'master',
						name: 'src-img_0004_c0.jpg',
						repairable: false,
						why_not: 'no_verified_object'
					}
				]
			})
		)!;
		expect(u.neverUploaded).toEqual(['src-img_0003_c1.raw']);
		expect(u.missing).toEqual(['src-img_0003_c1.raw', 'src-img_0004_c0.jpg']);
	});

	it('leaves the names empty for a journal that names no volume', () => {
		const u = readUnfinished(blocked({ source: null, target: null }))!;
		expect(u.source).toBeNull();
		expect(u.target).toBeNull();
	});
});

describe('halfMovedAdvice: what the dialog says of a move left half done', () => {
	const running = {
		request_id: null,
		kind: 'recovery',
		started_at: '2026-11-24T10:00:00',
		source: null,
		target: null
	};

	it('a journal recovery could not clear: the unfinished move, not a restart', () => {
		expect(halfMovedAdvice(reportRead(blocked()))).toBe('blocked');
		expect(halfMovedAdvice(reportRead(blocked({ reason: 'recovery_failed' })))).toBe('blocked');
	});

	it('a journal no recovery has tried, or a report that cannot be read: restart', () => {
		expect(halfMovedAdvice(reportRead(blocked({ reason: 'recovery_not_run' })))).toBe('restart');
		expect(halfMovedAdvice({ kind: 'failed' })).toBe('restart');
		expect(halfMovedAdvice({ kind: 'failed', refused: 403 })).toBe('restart');
	});

	it('a recovery or a move running now: still working', () => {
		expect(halfMovedAdvice(reportRead(blocked({ state: 'recovering' })))).toBe('working');
		expect(halfMovedAdvice(reportRead({ ...blocked(), running }))).toBe('working');
		expect(halfMovedAdvice(reportRead({ unfinished: null, running }))).toBe('working');
	});

	// Every reason a blocked report carries, as the backend defines them at origin/dev:
	// app/core/adopt_journal.py (journal_unreadable, recovery_failed, records_split,
	// image_rows_contradict, colour_card_rows_contradict, file_at_both_paths,
	// file_at_neither_path) and app/core/adopt_repair.py (recovery_not_run,
	// storage_not_active). Its `recovering` reason comes only with the `recovering` state.
	it.each([
		['journal_unreadable', 'blocked'],
		['recovery_failed', 'blocked'],
		['records_split', 'blocked'],
		['image_rows_contradict', 'blocked'],
		['colour_card_rows_contradict', 'blocked'],
		['file_at_both_paths', 'blocked'],
		['file_at_neither_path', 'blocked'],
		['storage_not_active', 'blocked'],
		['recovery_not_run', 'restart']
	] as const)('a blocked report with reason %s: %s', (reason, advice) => {
		expect(halfMovedAdvice(reportRead(blocked({ reason })))).toBe(advice);
	});

	it('the recovering state, with its reason: working', () => {
		expect(
			halfMovedAdvice(reportRead(blocked({ state: 'recovering', reason: 'recovering' })))
		).toBe('working');
	});

	it('nothing unfinished and nothing running: settled since', () => {
		expect(halfMovedAdvice(reportRead({ unfinished: null, running: null }))).toBe('settled');
	});
});

describe('noRepairLines', () => {
	const u = (refusal: string, missing: unknown[] = []) =>
		readUnfinished(blocked({ repair_available: false, repair_refusal: refusal, missing }))!;

	it('says a file was never uploaded, then whom to ask', () => {
		const lines = noRepairLines(
			u('files_not_repairable', [
				{ kind: 'buffer', name: 'a.raw', repairable: false, why_not: 'never_uploaded' }
			]),
			es
		);
		expect(lines).toEqual([es.unsettled_err_never_copied('a.raw'), es.unsettled_no_repair]);
	});

	it.each([
		'no_read_remote',
		'storage_not_active',
		'storage_unusable',
		'file_at_both_paths',
		'volume_held'
	])('%s: whom to ask', (refusal) => {
		expect(noRepairLines(u(refusal), es)).toEqual([es.unsettled_no_repair]);
	});

	it('a repair or an adoption running elsewhere: Captua is repairing', () => {
		expect(noRepairLines(u('repair_running'), es)).toEqual([es.unsettled_repairing]);
		expect(noRepairLines(u('adoption_running'), es)).toEqual([es.unsettled_repairing]);
	});
});

describe('repair outcomes', () => {
	const u = readUnfinished(blocked())!;
	const err = (status: number, detail: unknown) =>
		Object.assign(new Error('x'), { status, detail });

	it('finished and reverted name the volume the captures are in', () => {
		expect(repairOutcomeText(repairOutcomeOf({ result: 'finished' }), u, es)).toBe(
			es.unsettled_done_finished(T)
		);
		expect(repairOutcomeText(repairOutcomeOf({ result: 'reverted' }), u, es)).toBe(
			es.unsettled_done_undone(S)
		);
		expect(repairOutcomeOf({ result: 'finished' }).done).toBe(true);
		expect(repairOutcomeOf({ result: 'unfinished', code: 'x' }).done).toBe(false);
	});

	it('a recovery that still stopped: whom to ask', () => {
		expect(repairOutcomeText(repairOutcomeOf({ result: 'unfinished', code: 'x' }), u, es)).toBe(
			es.unsettled_no_repair
		);
	});

	it('a digest that differs and an object not in the copy name the file', () => {
		const file = {
			kind: 'master',
			image_id: 9,
			path: '/p/tgt/captures/tgt-img_0003_c1.cr2',
			key: 'k'
		};
		expect(
			repairOutcomeText(
				repairOutcomeOf(
					err(409, { code: 'repair_digest_mismatch', message: 'E', file, digest: 'sha1' })
				),
				u,
				es
			)
		).toBe(es.unsettled_err_mismatch('tgt-img_0003_c1.cr2'));
		expect(
			repairOutcomeText(
				repairOutcomeOf(err(409, { code: 'repair_object_missing', message: 'E', file })),
				u,
				es
			)
		).toBe(es.unsettled_err_absent('tgt-img_0003_c1.cr2'));
	});

	it('a file never uploaded names it', () => {
		expect(
			repairOutcomeText(
				repairOutcomeOf(
					err(409, {
						code: 'repair_not_possible',
						reason: 'files_not_repairable',
						message: 'E',
						missing: [{ name: 'a.raw', why_not: 'never_uploaded', repairable: false }]
					})
				),
				u,
				es
			)
		).toBe(es.unsettled_err_never_copied('a.raw'));
	});

	it('anything else: whom to ask', () => {
		for (const e of [
			err(409, { code: 'repair_unavailable', message: 'E' }),
			err(503, { code: 'repair_copy_failed', message: 'E' }),
			err(409, { code: 'repair_not_possible', reason: 'file_at_both_paths', message: 'E' })
		]) {
			const outcome = repairOutcomeOf(e);
			expect(outcome.done).toBe(false);
			expect(outcome.kind).toBe('other');
			expect(repairOutcomeText(outcome, u, es)).toBe(es.unsettled_no_repair);
		}
	});

	it('an answer the page cannot read is an unknown outcome: the unit is asked again', () => {
		for (const e of [
			new TypeError('fetch failed'),
			new DOMException('Request failed', 'TimeoutError'),
			err(502, undefined),
			err(504, 'Gateway Timeout'),
			{ result: 42 },
			undefined
		]) {
			const outcome = repairOutcomeOf(e);
			expect(outcome.kind).toBe('unknown');
			expect(outcome.done).toBe(false);
		}
	});
});

describe('adoptFailureOf: an answer the page cannot read', () => {
	const err = (status: number, detail: unknown) =>
		Object.assign(new Error('x'), { status, detail });
	it('is unknown for a network error, a timeout and a bodyless 502 or 504', () => {
		for (const e of [
			new TypeError('fetch failed'),
			new DOMException('Request failed', 'TimeoutError'),
			err(502, undefined),
			err(504, 'Gateway Timeout')
		]) {
			expect(adoptFailureOf(e)).toEqual({ kind: 'unknown' });
		}
	});
});

describe('isAdoptResult', () => {
	const ok = {
		source_id: 7,
		target_id: 20,
		records: 7,
		images: 14,
		files_renamed: 40,
		colour_card_sets: 2,
		colour_card_shots: 4,
		target_lines_pending: false,
		recovery_pending: false
	};

	it('accepts the result with every field the result step reads', () => {
		expect(isAdoptResult(ok)).toBe(true);
	});

	it('refuses no body, an empty body and any other shape: those are unknown outcomes', () => {
		for (const body of [undefined, null, '', {}, [], 'ok', { ...ok, records: '7' }]) {
			expect(isAdoptResult(body)).toBe(false);
		}
		for (const field of [
			'records',
			'images',
			'colour_card_sets',
			'target_lines_pending',
			'recovery_pending'
		]) {
			const { [field]: _gone, ...rest } = ok as Record<string, unknown>;
			expect(isAdoptResult(rest), field).toBe(false);
		}
		expect(isAdoptResult({ ...ok, recovery_pending: 'no' })).toBe(false);
		expect(isAdoptResult({ ...ok, images: Number.NaN })).toBe(false);
	});
});

// GET /system/adoption/requests/{id} (app/core/adoption_requests.py state_of
// and lookup, backend branch backend/neh-419-adoption-status).
describe('requestStateOf', () => {
	const base = { source_id: 7, target_id: 20, started_at: '2026-11-24T10:00:00', ended_at: null };
	const err = (status: number, detail: unknown) =>
		Object.assign(new Error('x'), { status, detail });
	const result = {
		source_id: 7,
		target_id: 20,
		records: 7,
		images: 14,
		files_renamed: 40,
		colour_card_sets: 2,
		colour_card_shots: 4,
		target_lines_appended: true,
		target_lines_pending: false,
		recovery_pending: false
	};

	it('running and busy: the move is still going, ask again', () => {
		expect(requestStateOf({ ...base, state: 'running' })).toEqual({ kind: 'working' });
		expect(requestStateOf({ ...base, state: 'busy' })).toEqual({ kind: 'working' });
	});

	it('applied: the result with its counts, or none when the record has none', () => {
		expect(requestStateOf({ ...base, state: 'applied', result })).toEqual({
			kind: 'applied',
			summary: { records: 7, images: 14, colourCardSets: 2, pending: false }
		});
		expect(
			requestStateOf({ ...base, state: 'applied', result: { ...result, recovery_pending: true } })
		).toEqual({
			kind: 'applied',
			summary: { records: 7, images: 14, colourCardSets: 2, pending: true }
		});
		const { target_lines_pending: _a, recovery_pending: _b, ...noFlags } = result;
		expect(requestStateOf({ ...base, state: 'applied', result: noFlags })).toEqual({
			kind: 'applied',
			summary: { records: 7, images: 14, colourCardSets: 2, pending: false }
		});
		expect(requestStateOf({ ...base, state: 'applied', result: null })).toEqual({
			kind: 'applied',
			summary: null
		});
		expect(requestStateOf({ ...base, state: 'applied', result: { records: 'x' } })).toEqual({
			kind: 'applied',
			summary: null
		});
	});

	it('refused: the codes of its answer', () => {
		expect(
			requestStateOf({
				...base,
				state: 'refused',
				status: 409,
				detail: { message: 'E', codes: ['volume_held'], details: {} }
			})
		).toEqual({ kind: 'refused', codes: ['volume_held'] });
	});

	it('failed by restored; reverted; interrupted', () => {
		expect(requestStateOf({ ...base, state: 'failed', message: 'E', restored: true })).toEqual({
			kind: 'failed',
			restored: true
		});
		expect(requestStateOf({ ...base, state: 'failed', message: 'E', restored: false })).toEqual({
			kind: 'failed',
			restored: false
		});
		expect(requestStateOf({ ...base, state: 'reverted', result: null, recovered: true })).toEqual({
			kind: 'reverted'
		});
		expect(requestStateOf({ ...base, state: 'interrupted', journal_kept: true })).toEqual({
			kind: 'interrupted'
		});
	});

	it('an id the unit never saw: 404 closed', () => {
		expect(
			requestStateOf(err(404, { code: 'not_found', message: 'Not found', state: 'closed' }))
		).toEqual({ kind: 'closed' });
	});

	it('anything else is a lookup that failed', () => {
		for (const e of [
			new TypeError('Failed to fetch'),
			err(404, { code: 'not_found' }),

			err(502, undefined),
			undefined,
			{},
			{ state: 'something_new' },
			{ ...base, state: 'refused', status: 409, detail: 'English' },
			{ ...base, state: 'failed', message: 'E', restored: null }
		]) {
			expect(requestStateOf(e)).toEqual({ kind: 'lookup_failed' });
		}
	});
});

describe('the report: running and the run id', () => {
	it('reads what holds the lock beside the report, and beside nothing unfinished', () => {
		const running = {
			request_id: 'abc',
			kind: 'adoption',
			started_at: '2026-11-24T10:00:00',
			source: { id: 7, name: S, filename_stem: 's' },
			target: { id: 20, name: T, filename_stem: 't' }
		};
		expect(reportRead({ unfinished: null, running })).toEqual({
			kind: 'none',
			running: { kind: 'adoption', requestId: 'abc', sourceId: 7, targetId: 20 }
		});
		expect(reportRead({ unfinished: null, running: null })).toEqual({
			kind: 'none',
			running: null
		});
		const read = reportRead({ ...blocked(), running });
		expect(read.kind).toBe('report');
		expect(read.kind === 'report' && read.running).toEqual({
			kind: 'adoption',
			requestId: 'abc',
			sourceId: 7,
			targetId: 20
		});
		expect(read.kind === 'report' && read.u.runId).toBe('run-1');
	});
});

describe('repair outcomes from the repair answer', () => {
	const u = readUnfinished(blocked())!;
	const named = {
		source: { id: 3, name: 'Otro origen', filename_stem: 'o' },
		target: { id: 4, name: 'Otro destino', filename_stem: 'd' }
	};
	const err = (status: number, detail: unknown) =>
		Object.assign(new Error('x'), { status, detail });

	it('names the volumes of its own answer, not of the report', () => {
		expect(repairOutcomeText(repairOutcomeOf({ result: 'finished', ...named }), u, es)).toBe(
			es.unsettled_done_finished('Otro destino')
		);
		expect(repairOutcomeText(repairOutcomeOf({ result: 'reverted', ...named }), u, es)).toBe(
			es.unsettled_done_undone('Otro origen')
		);
	});

	it('journal_changed: another move is now the unfinished one, read again', () => {
		const outcome = repairOutcomeOf(
			err(409, { code: 'journal_changed', message: 'E', reason: 'journal_changed', ...named })
		);
		expect(outcome).toMatchObject({ kind: 'changed', done: false });
	});
});

describe('authorization refusals and malformed ids', () => {
	const err = (status: number, detail: unknown) =>
		Object.assign(new Error('x'), { status, detail });

	it('a lookup answered 401, 403 or 422 is its own state', () => {
		expect(requestStateOf(err(401, 'Not authenticated'))).toEqual({ kind: 'session' });
		expect(requestStateOf(err(403, 'Not enough permissions'))).toEqual({ kind: 'forbidden' });
		expect(requestStateOf(err(422, [{ loc: ['path', 'request_id'] }]))).toEqual({
			kind: 'invalid'
		});
	});

	it('a report read refused 401 or 403 says so; any other failure does not', () => {
		expect(reportReadError(err(401, 'x'))).toEqual({ kind: 'failed', refused: 401 });
		expect(reportReadError(err(403, 'x'))).toEqual({ kind: 'failed', refused: 403 });
		expect(reportReadError(new TypeError('Failed to fetch'))).toEqual({ kind: 'failed' });
		expect(reportReadError(err(500, 'x'))).toEqual({ kind: 'failed' });
	});

	it('a stored request is used only when every field has its type and the id is a canonical UUID', () => {
		const ok = {
			requestId: '1b4e28ba-2fa1-41d2-883f-0016d3cca427',
			targetId: 20,
			targetName: 'Destino'
		};
		expect(readStoredRequest(JSON.stringify(ok))).toEqual(ok);
		for (const bad of [
			null,
			'',
			'not json',
			'null',
			JSON.stringify([]),
			JSON.stringify({ ...ok, requestId: 'abc' }),
			JSON.stringify({ ...ok, requestId: ok.requestId + '\n' }),
			JSON.stringify({ ...ok, requestId: ok.requestId + '\r\n' }),
			JSON.stringify({ ...ok, requestId: '1B4E28BA-2FA1-41D2-883F-0016D3CCA427x' }),
			JSON.stringify({ ...ok, targetId: '20' }),
			JSON.stringify({ ...ok, targetId: 1.5 }),
			JSON.stringify({ ...ok, targetName: 3 })
		]) {
			expect(readStoredRequest(bad), String(bad)).toBeNull();
		}
	});
});

describe('the repair answer names the volumes it repaired, with their ids', () => {
	it('keeps the ids beside the names', () => {
		expect(
			repairOutcomeOf({
				result: 'finished',
				source: { id: 3, name: 'A', filename_stem: 'a' },
				target: { id: 4, name: 'B', filename_stem: 'b' }
			}).names
		).toEqual({ source: 'A', target: 'B', sourceId: 3, targetId: 4 });
	});
});

describe('repair identity across the preflight and confirming reads', () => {
	const displayed = readUnfinished(blocked())!;
	it('J1 is displayed; the preflight returns J2: only another press may repair J2', () => {
		const next = reportRead(blocked({ run_id: 'run-2' }));
		expect(repairStillOffered(displayed, next)).toBe(false);
		expect(next.kind === 'report' && repairStillOffered(next.u, next)).toBe(true);
		expect(repairStillOffered(displayed, { kind: 'failed' })).toBe(false);
		expect(
			repairStillOffered({ ...displayed, runId: null }, reportRead(blocked({ run_id: null })))
		).toBe(false);
	});

	it('J1 succeeds late; the next report names J2: no success for J1 may cover it', () => {
		const answer = repairOutcomeOf({ result: 'finished' });
		expect(repairOutcomeFitsReport(answer, displayed, { kind: 'failed' })).toBe(false);
		expect(
			repairOutcomeFitsReport(answer, displayed, reportRead(blocked({ run_id: 'run-2' })))
		).toBe(false);
		expect(repairOutcomeFitsReport(answer, displayed, reportRead(blocked()))).toBe(false);
		expect(repairOutcomeFitsReport(answer, displayed, reportRead({ unfinished: null }))).toBe(true);
	});

	it('a failure belongs only to its original run and matching answer volumes', () => {
		const answer = repairOutcomeOf({ result: 'unfinished' });
		expect(repairOutcomeFitsReport(answer, displayed, reportRead(blocked()))).toBe(true);
		expect(
			repairOutcomeFitsReport(answer, displayed, reportRead(blocked({ run_id: 'run-2' })))
		).toBe(false);
		expect(
			repairOutcomeFitsReport(
				{ ...answer, names: { sourceId: 99, targetId: 2, source: 'X', target: T } },
				displayed,
				reportRead(blocked())
			)
		).toBe(false);
	});

	it('a successful answer for other volumes is rejected even when the confirming report is empty', () => {
		const empty = reportRead({ unfinished: null, running: null });
		const answer = repairOutcomeOf({
			result: 'finished',
			source: { id: 98, name: 'Other source' },
			target: { id: 99, name: 'Other target' }
		});
		expect(repairOutcomeFitsReport(answer, displayed, empty)).toBe(false);
		expect(
			repairOutcomeFitsReport(
				{
					...answer,
					names: {
						sourceId: displayed.sourceId,
						targetId: displayed.targetId,
						source: displayed.source,
						target: displayed.target
					}
				},
				displayed,
				empty
			)
		).toBe(true);
	});
});

describe('notice reads requested by the layout', () => {
	const idle = { isAdmin: true, named: false, quietRunning: false };
	it('an ordinary idle volume becomes named after an interrupted move', () => {
		expect(noticeReadOnChange(null, idle)).toBe('enter');
		expect(noticeReadOnChange(idle, { ...idle })).toBeNull();
		expect(noticeReadOnChange(idle, { ...idle, named: true })).toBe('refresh');
	});
	it('the end of the local move refreshes even if named was already true', () => {
		const waiting = { ...idle, named: true, quietRunning: true };
		expect(noticeReadOnChange(waiting, { ...waiting, quietRunning: false })).toBe('refresh');
		expect(noticeReadOnChange(idle, { ...idle, quietRunning: true })).toBe('refresh');
		expect(noticeReadOnChange({ ...idle, named: true }, idle)).toBe('refresh');
	});
	it('role loss never reads and a new administrator entry reads once', () => {
		const operator = { ...idle, isAdmin: false };
		expect(noticeReadOnChange(idle, { ...operator, named: true })).toBeNull();
		expect(noticeReadOnChange(operator, idle)).toBe('enter');
	});
});

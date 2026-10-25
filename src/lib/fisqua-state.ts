// Delivery to Fisqua: what the volume view and Configuración say about it.
//
// A volume's state is `fisqua` on GET /collections/{id}/offsite
// (volume_fisqua_state in app/core/fisqua_outbox.py), null when the unit has
// no Fisqua configured; the unit's is `fisqua` on GET /system/catalogue-backup
// (unit_fisqua_summary in the same file).
//
// The volume's line is its newest manifest that is still the volume's
// handover: a superseded or withdrawn manifest is kept in the history only.
// Once that manifest is delivered, the line is Fisqua's status for it. A
// refusal by Captua (`not_exportable`) holds capture_manifest problems, shown
// in the catalogue's words (capture-manifest.ts); a refusal by Fisqua, and
// Fisqua's status, hold Fisqua's own problems, whose rule names are Fisqua's
// (`id-reused`, `run-started`, …) and not the catalogue's, so they are shown
// as Fisqua wrote them, marked as Fisqua's. The backend's own English
// (`last_error`) is never shown.
//
// The unit-level configuration error (401, 403, 404 or a redirect) stops
// sending and polling for every volume until the scanner's Fisqua settings
// change, and is shown on both.
//
// The module imports only types from the API client, so the wording is tested
// in the server project.

import type { Messages } from './i18n';
import type {
	FisquaConfigError,
	FisquaOutboxEntry,
	FisquaProblem,
	FisquaRunResult,
	UnitFisquaSummary,
	VolumeFisquaState
} from '$lib/api';
import { dayRelation, formatBackupDate, formatBackupTime } from './catalogue-backup';
import { manifestProblemViews } from './capture-manifest';
import { parseApiDate } from './pipeline';

/** How the line reads: healthy, under way, needing someone, or neither. */
export type FisquaTone = 'ok' | 'progress' | 'attention' | 'neutral';

export interface FisquaProblemView {
	text: string;
	/** The records concerned, as a line; null when the problem names none. */
	records: string | null;
	/** True for Fisqua's own text, shown as Fisqua wrote it. */
	fromFisqua: boolean;
}

export interface FisquaHistoryItem {
	kind: string;
	label: string;
	/** When the manifest was queued, "today at 09:30"; null when unreadable. */
	when: string | null;
}

export interface VolumeFisquaView {
	/** The outbox state (`waiting_for_upload`, `sending`, …) or `status_<Fisqua's status>`. */
	kind: string;
	tone: FisquaTone;
	label: string;
	/** "checked today at 09:30" for Fisqua's status; null otherwise. */
	detail: string | null;
	problems: FisquaProblemView[];
	/** The unit-level stop, as a warning; null when there is none. */
	configError: string | null;
	/** The volume's other manifests, newest first. */
	history: FisquaHistoryItem[];
}

/**
 * STATES in app/core/fisqua_contract.py (contract §9.3): received → registered
 * → preparing_review (Fisqua tiles the previews for capture QC) →
 * in_capture_qc → retakes_requested or approved → queued → running →
 * review_pending (review of the processed output) → published. A volume
 * whose retakes come back goes through preparing_review again.
 */
const FISQUA_STATES = [
	'received',
	'registered',
	'preparing_review',
	'in_capture_qc',
	'retakes_requested',
	'approved',
	'queued',
	'running',
	'review_pending',
	'published',
	'refused',
	'superseded',
	'failed',
	'unknown'
] as const;
type FisquaStatusName = (typeof FISQUA_STATES)[number];

const STATUS_TONE: Record<FisquaStatusName, FisquaTone> = {
	received: 'progress',
	registered: 'progress',
	preparing_review: 'progress',
	in_capture_qc: 'progress',
	// Someone has to capture records again.
	retakes_requested: 'attention',
	approved: 'ok',
	queued: 'progress',
	running: 'progress',
	review_pending: 'progress',
	published: 'ok',
	refused: 'attention',
	superseded: 'neutral',
	failed: 'attention',
	// Not final: Fisqua is asked again.
	unknown: 'neutral'
};

function statusLabel(name: FisquaStatusName, msgs: Messages): string {
	switch (name) {
		case 'received':
			return msgs.fisqua_st_received;
		case 'registered':
			return msgs.fisqua_st_registered;
		case 'preparing_review':
			return msgs.fisqua_st_preparing_review;
		case 'in_capture_qc':
			return msgs.fisqua_st_in_capture_qc;
		case 'retakes_requested':
			return msgs.fisqua_st_retakes_requested;
		case 'approved':
			return msgs.fisqua_st_approved;
		case 'queued':
			return msgs.fisqua_st_queued;
		case 'running':
			return msgs.fisqua_st_running;
		case 'review_pending':
			return msgs.fisqua_st_review_pending;
		case 'published':
			return msgs.fisqua_st_published;
		case 'refused':
			return msgs.fisqua_st_refused;
		case 'superseded':
			return msgs.fisqua_st_superseded;
		case 'failed':
			return msgs.fisqua_st_failed;
		case 'unknown':
			return msgs.fisqua_st_unknown;
	}
}

function dateOf(iso: string | null | undefined): Date | null {
	if (typeof iso !== 'string' || !iso) return null;
	const when = parseApiDate(iso);
	return Number.isNaN(when.getTime()) ? null : when;
}

function whenArgs(iso: string | null | undefined, now: Date, locale: string) {
	const when = dateOf(iso);
	if (!when) return null;
	return [dayRelation(when, now), formatBackupDate(when, now, locale), formatBackupTime(when, locale)] as const;
}

/** Fisqua's problems: its message as it wrote it, or its rule when it sent no message. */
function fisquaProblemViews(problems: FisquaProblem[] | null | undefined, msgs: Messages): FisquaProblemView[] {
	if (!Array.isArray(problems)) return [];
	const views: FisquaProblemView[] = [];
	for (const p of problems) {
		if (typeof p !== 'object' || p === null) continue;
		const text =
			typeof p.message === 'string' && p.message.trim()
				? p.message.trim()
				: typeof p.rule === 'string' && p.rule.trim()
					? p.rule.trim()
					: null;
		if (text === null) continue;
		views.push({ text: msgs.fisqua_problem_from_fisqua(text), records: null, fromFisqua: true });
	}
	return views;
}

function captuaProblemViews(problems: FisquaProblem[] | null | undefined, msgs: Messages): FisquaProblemView[] {
	if (!Array.isArray(problems)) return [];
	return manifestProblemViews(problems, msgs).map(({ text, records }) => ({ text, records, fromFisqua: false }));
}

/** The kind and label of an outbox row, as the current line or in the history. */
function outboxLine(row: FisquaOutboxEntry, now: Date, locale: string, msgs: Messages): { kind: string; tone: FisquaTone; label: string } {
	switch (row.state) {
		case 'waiting_for_upload':
			return { kind: 'waiting_for_upload', tone: 'progress', label: msgs.fisqua_out_waiting };
		case 'ready':
		case 'sending':
			return { kind: 'sending', tone: 'progress', label: msgs.fisqua_out_sending };
		case 'failed': {
			const args = whenArgs(row.next_attempt_at, now, locale);
			return { kind: 'failed', tone: 'attention', label: args ? msgs.fisqua_out_failed(...args) : msgs.fisqua_out_failed_no_time };
		}
		case 'delivered':
			return { kind: 'delivered', tone: 'progress', label: msgs.fisqua_out_delivered };
		case 'refused':
			return row.refusal === 'fisqua'
				? { kind: 'refused_by_fisqua', tone: 'attention', label: msgs.fisqua_out_refused_by_fisqua }
				: { kind: 'not_exportable', tone: 'attention', label: msgs.fisqua_out_not_exportable };
		case 'superseded':
			return { kind: 'superseded', tone: 'neutral', label: msgs.fisqua_out_superseded };
		case 'withdrawn':
			return { kind: 'withdrawn', tone: 'neutral', label: msgs.fisqua_out_withdrawn };
		default:
			return { kind: 'none', tone: 'neutral', label: msgs.fisqua_out_none };
	}
}

/** The warning for the unit-level stop, or null when Fisqua accepts the configuration. */
export function fisquaConfigErrorText(error: FisquaConfigError | null | undefined, msgs: Messages): string | null {
	if (!error) return null;
	switch (error.reason) {
		case 'token':
			return msgs.fisqua_cfg_token;
		case 'not_found':
			return msgs.fisqua_cfg_not_found;
		case 'redirect':
			return msgs.fisqua_cfg_redirect;
		default:
			return msgs.fisqua_cfg_other;
	}
}

const HISTORY_ONLY = ['superseded', 'withdrawn'];

/** The volume's Fisqua line, or null when the unit has no Fisqua configured (or the backend predates it). */
export function volumeFisquaView(
	fisqua: VolumeFisquaState | null | undefined,
	now: Date,
	locale: string,
	msgs: Messages
): VolumeFisquaView | null {
	if (!fisqua) return null;
	const outbox = Array.isArray(fisqua.outbox) ? fisqua.outbox : [];
	const current = outbox.find((row) => !HISTORY_ONLY.includes(row.state)) ?? null;
	const configError = fisquaConfigErrorText(fisqua.config_error, msgs);

	const history: FisquaHistoryItem[] = outbox
		.filter((row) => row !== current)
		.map((row) => {
			const { kind, label } = outboxLine(row, now, locale, msgs);
			const args = whenArgs(row.created_at, now, locale);
			return { kind, label, when: args ? msgs.fisqua_when(...args) : null };
		});

	let kind = 'none';
	let tone: FisquaTone = 'neutral';
	let label = msgs.fisqua_out_none;
	let detail: string | null = null;
	let problems: FisquaProblemView[] = [];

	if (current) {
		({ kind, tone, label } = outboxLine(current, now, locale, msgs));
		if (current.state === 'refused') {
			problems =
				current.refusal === 'fisqua' ? fisquaProblemViews(current.problems, msgs) : captuaProblemViews(current.problems, msgs);
		}
		const status = fisqua.status;
		// Fisqua's word on this manifest; one with no manifest id is its latest on the volume.
		if (current.state === 'delivered' && status && (status.manifest_id === null || status.manifest_id === current.manifest_id)) {
			const name = status.status;
			if (typeof name === 'string' && (FISQUA_STATES as readonly string[]).includes(name)) {
				kind = `status_${name}`;
				tone = STATUS_TONE[name as FisquaStatusName];
				label = statusLabel(name as FisquaStatusName, msgs);
			} else if (typeof name === 'string') {
				kind = 'status_other';
				tone = 'neutral';
				label = msgs.fisqua_st_other;
			}
			const args = whenArgs(status.status_checked_at, now, locale);
			if (kind.startsWith('status_') && args) detail = msgs.fisqua_checked(...args);
			problems = fisquaProblemViews(status.problems, msgs);
		}
	}

	if (configError) tone = 'attention';
	return { kind, tone, label, detail, problems, configError, history };
}

export type UnitFisquaLevel = 'on' | 'off' | 'attention';

export interface UnitFisquaView {
	level: UnitFisquaLevel;
	lines: string[];
	/** The unit-level stop; null when there is none. */
	warning: string | null;
}

function sendLine(run: FisquaRunResult | null | undefined, msgs: Messages): string {
	if (!run) return msgs.fisqua_unit_send_none;
	switch (run.status) {
		case 'done':
			return msgs.fisqua_unit_send_done(run.delivered ?? 0, run.refused ?? 0, run.failed ?? 0, run.waiting ?? 0);
		case 'config_error':
			return msgs.fisqua_unit_send_config_error;
		case 'error':
			return msgs.fisqua_unit_send_error;
		case 'stopped':
			return msgs.fisqua_unit_send_stopped;
		default:
			return msgs.fisqua_unit_send_other;
	}
}

function pollLine(run: FisquaRunResult | null | undefined, msgs: Messages): string {
	if (!run) return msgs.fisqua_unit_poll_none;
	switch (run.status) {
		case 'done':
			return msgs.fisqua_unit_poll_done(run.asked ?? 0, run.answered ?? 0);
		case 'config_error':
			return msgs.fisqua_unit_poll_config_error;
		case 'error':
			return msgs.fisqua_unit_poll_error;
		default:
			return msgs.fisqua_unit_poll_other;
	}
}

/** The unit's Fisqua row for Configuración, or null when the backend sends no Fisqua summary. */
export function unitFisquaView(summary: UnitFisquaSummary | null | undefined, msgs: Messages): UnitFisquaView | null {
	if (!summary || typeof summary.configured !== 'boolean') return null;
	if (!summary.configured) return { level: 'off', lines: [msgs.fisqua_unit_off], warning: null };
	const env = summary.environment === 'staging' ? msgs.fisqua_unit_env_staging : msgs.fisqua_unit_env_production;
	const warning = fisquaConfigErrorText(summary.config_error, msgs);
	return {
		level: warning ? 'attention' : 'on',
		lines: [env, sendLine(summary.last_send, msgs), pollLine(summary.last_poll, msgs)],
		warning
	};
}

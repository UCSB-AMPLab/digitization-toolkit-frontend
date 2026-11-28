// Linking the unit to a Fisqua workspace by a code (NEH-345), as the
// Settings card reads it from the unit's own API (GET, POST and DELETE
// /system/pairing, POST /system/pairing/renew in app/api/system.py). The
// backend does all the talking to Fisqua and holds every secret; the browser
// sees the code, the device id and the state.
//
// readPairingStatus copies only the fields of the contract, so a field the
// contract does not name never reaches the page. A state or a refusal code
// this version does not know is shown as the generic line, never as a blank
// card.
//
// No import of api.ts, so these helpers can be tested in plain node.
//
// Version: 0.4.0

import type { Messages } from './i18n';

/** The answer of GET /system/pairing. */
export interface PairingStatus {
	state: string;
	/** Why a final state was reached: a refusal code for `not_eligible`, a field for `bad_payload`, a rule for `error`. */
	reason: string | null;
	/** `busy` or `network` while Captua waits to ask Fisqua again, with `retryAfterSeconds`. */
	trouble: string | null;
	deviceId: string | null;
	/** `missing`, `invalid` or `unreadable` when the unit's device id cannot be read. */
	deviceIdError: string | null;
	unitName: string | null;
	code: string | null;
	expiresInSeconds: number | null;
	renewalSecondsLeft: number | null;
	environment: string | null;
	currentTenant: string | null;
	linked: { configured: boolean; tenant: string | null; environment: string | null };
	eligible: { ok: boolean; reason: string | null };
	retryAfterSeconds: number | null;
	result: PairingResult | null;
	/** A provisioning run may have changed the settings this process read: the unit must be restarted first. */
	restartRequired: boolean;
	/** The final state of the last session, or null. */
	lastOutcome: string | null;
}

/** The record of the last link (pairing-result.json): workspace, environment, when and by whom. */
export interface PairingResult {
	tenant: string | null;
	environment: string | null;
	at: string | null;
	by: string | null;
}

/** The card polls GET every 2 s; the backend also takes each GET as the card's heartbeat. */
export const PAIRING_POLL_MS = 2000;
/**
 * Polling stops once the page has been hidden this long. The admin may
 * approve the code in Fisqua in another tab, so a short absence keeps it
 * going; the backend ends a session 30 s after the last GET.
 */
export const PAIRING_HIDDEN_STOP_MS = 10 * 60 * 1000;
/** A GET that has not answered by then is dropped and the next one sent. */
export const PAIRING_READ_TIMEOUT_MS = 8000;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function readResult(v: unknown): PairingResult | null {
	if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
	const o = v as Record<string, unknown>;
	return { tenant: str(o.tenant), environment: str(o.environment), at: str(o.at), by: str(o.by) };
}

/** The fields of the contract, and nothing else; null for an answer without a state. */
export function readPairingStatus(data: unknown): PairingStatus | null {
	const o = obj(data);
	const state = str(o.state);
	if (!state) return null;
	const linked = obj(o.linked);
	const eligible = obj(o.eligible);
	return {
		state,
		reason: str(o.reason),
		trouble: str(o.trouble),
		deviceId: str(o.deviceId),
		deviceIdError: str(o.deviceIdError),
		unitName: str(o.unitName),
		code: str(o.code),
		expiresInSeconds: num(o.expiresInSeconds),
		renewalSecondsLeft: num(o.renewalSecondsLeft),
		environment: str(o.environment),
		currentTenant: str(o.currentTenant),
		linked: {
			configured: linked.configured === true,
			tenant: str(linked.tenant),
			environment: str(linked.environment)
		},
		eligible: {
			ok: eligible.ok !== false,
			reason: str(eligible.reason)
		},
		retryAfterSeconds: num(o.retryAfterSeconds),
		result: readResult(o.result),
		restartRequired: o.restartRequired === true,
		lastOutcome: str(o.lastOutcome)
	};
}

/** The code as two groups of three, in capitals: ABC-DEF. */
export function groupCode(code: string): string {
	const plain = code.replace(/[\s-]/g, '').toUpperCase();
	return plain.length === 6 ? `${plain.slice(0, 3)}-${plain.slice(3)}` : plain;
}

/** The code of a refused request: `detail.code` of the error body ({detail: {code, message}}), else null. */
export function pairingErrorCode(error: unknown): string | null {
	if (typeof error !== 'object' || error === null) return null;
	return str(obj((error as { detail?: unknown }).detail).code);
}

/**
 * Which part of the card a state shows. `requesting`, `showing` and
 * `applying` run; every other state is final. After `lapsed`, `lost_answer`
 * or `unknown` a new code is asked for by renewing (`renew`). Any state not
 * listed is `final`.
 */
export type PairingPanel =
	| 'form'
	| 'requesting'
	| 'code'
	| 'applying'
	| 'restarting'
	| 'restart_needed'
	| 'renew'
	| 'final';

export function pairingPanel(state: string): PairingPanel {
	switch (state) {
		case 'idle':
		case 'cancelled':
		case 'ended':
			return 'form';
		case 'requesting':
			return 'requesting';
		case 'showing':
			return 'code';
		case 'applying':
			return 'applying';
		case 'restarting':
			return 'restarting';
		case 'restart_needed':
			return 'restart_needed';
		case 'lapsed':
		case 'lost_answer':
		case 'unknown':
			return 'renew';
		default:
			return 'final';
	}
}

interface VisibilitySource {
	visibilityState: string;
	addEventListener(type: 'visibilitychange', listener: () => void): void;
	removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Calls `read` at once and then `intervalMs` after each read ends, so reads
 * never overlap. A read that throws is followed by the next one as usual; a
 * read that takes longer than `timeoutMs` is aborted. Once the page has been
 * hidden for `hiddenStopMs` the polling stops, and it starts again with a
 * read when the page is shown. Returns the function that stops it.
 */
export function pollPairing(opts: {
	read: (signal: AbortSignal) => Promise<void>;
	intervalMs?: number;
	hiddenStopMs?: number;
	timeoutMs?: number;
	doc?: VisibilitySource;
}): () => void {
	const intervalMs = opts.intervalMs ?? PAIRING_POLL_MS;
	const hiddenStopMs = opts.hiddenStopMs ?? PAIRING_HIDDEN_STOP_MS;
	const timeoutMs = opts.timeoutMs ?? PAIRING_READ_TIMEOUT_MS;
	const doc = opts.doc ?? (typeof document !== 'undefined' ? document : undefined);

	let stopped = false;
	let paused = false;
	let running = false;
	let next: ReturnType<typeof setTimeout> | null = null;
	let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
	let inFlight: AbortController | null = null;

	function schedule(delay: number) {
		if (stopped || paused) return;
		if (next) clearTimeout(next);
		next = setTimeout(tick, delay);
	}

	async function tick() {
		next = null;
		if (stopped || paused || running) return;
		running = true;
		const ctrl = new AbortController();
		inFlight = ctrl;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const timedOut = new Promise<void>((resolve) => {
			timer = setTimeout(() => {
				ctrl.abort();
				resolve();
			}, timeoutMs);
		});
		try {
			await Promise.race([opts.read(ctrl.signal).catch(() => {}), timedOut]);
		} finally {
			if (timer) clearTimeout(timer);
			if (inFlight === ctrl) inFlight = null;
			running = false;
		}
		schedule(intervalMs);
	}

	function onVisibility() {
		if (!doc || stopped) return;
		if (doc.visibilityState === 'hidden') {
			if (!hiddenTimer) {
				hiddenTimer = setTimeout(() => {
					hiddenTimer = null;
					paused = true;
					if (next) clearTimeout(next);
					next = null;
				}, hiddenStopMs);
			}
		} else {
			if (hiddenTimer) clearTimeout(hiddenTimer);
			hiddenTimer = null;
			if (paused) {
				paused = false;
				schedule(0);
			}
		}
	}

	doc?.addEventListener('visibilitychange', onVisibility);
	if (doc?.visibilityState === 'hidden') onVisibility();
	schedule(0);

	return () => {
		stopped = true;
		if (next) clearTimeout(next);
		if (hiddenTimer) clearTimeout(hiddenTimer);
		next = null;
		hiddenTimer = null;
		inFlight?.abort();
		doc?.removeEventListener('visibilitychange', onVisibility);
	};
}

/** The line for a refused request or a reason the unit cannot be linked now. */
export function pairingRefusalText(code: string | null, msgs: Messages): string {
	switch (code) {
		case 'unit_name':
			return msgs.fisqua_link_name_invalid;
		case 'mode_not_eligible':
			return msgs.fisqua_link_not_eligible;
		case 'offsite_held':
			return msgs.fisqua_link_held;
		case 'rclone_missing':
			return msgs.fisqua_link_rclone_missing;
		case 'busy_capturing':
			return msgs.fisqua_link_busy_capturing;
		case 'device_id_invalid':
			return msgs.fisqua_link_device_id_invalid;
		case 'script_too_old':
			return msgs.fisqua_link_script_too_old;
		case 'script_missing':
			return msgs.fisqua_link_script_missing;
		case 'restart_required':
			return msgs.fisqua_link_restart_required;
		case 'offsite_job_running':
			return msgs.fisqua_link_offsite_job_running;
		case 'device_id_missing':
		case 'device_id_unreadable':
			return msgs.fisqua_link_device_id_invalid;
		default:
			return msgs.fisqua_link_generic;
	}
}

/** The line for a final state; any state this version does not know gets the generic line. */
export function pairingFinalText(status: PairingStatus, msgs: Messages): string {
	switch (status.state) {
		case 'lapsed':
			return msgs.fisqua_link_lapsed;
		case 'lost_answer':
			return msgs.fisqua_link_lost;
		case 'unknown':
			return msgs.fisqua_link_unknown;
		case 'not_eligible':
			return pairingRefusalText(status.reason, msgs);
		case 'script_missing':
			return msgs.fisqua_link_script_missing;
		case 'script_too_old':
			return msgs.fisqua_link_script_too_old;
		case 'cannot_pair':
			return msgs.fisqua_link_cannot_pair;
		case 'wrong_environment':
			return msgs.fisqua_link_wrong_env;
		case 'other_workspace':
			return msgs.fisqua_link_other_workspace(status.linked.tenant ?? status.currentTenant);
		case 'bad_payload':
			return msgs.fisqua_link_bad_payload;
		case 'apply_failed':
			if (status.reason === 'uploads_still_running') return msgs.fisqua_link_uploads_still_running;
			if (status.reason === 'offsite_jobs_still_running')
				return msgs.fisqua_link_offsite_jobs_still_running;
			if (status.reason === 'prepare_failed') return msgs.fisqua_link_prepare_failed;
			if (status.reason === 'shutting_down') return msgs.fisqua_link_shutting_down;
			return msgs.fisqua_link_failed;
		case 'apply_unverified':
			return msgs.fisqua_link_unverified;
		case 'settings_overridden':
			return msgs.fisqua_link_overridden;
		default:
			return msgs.fisqua_link_generic;
	}
}

/**
 * The line naming how the last session ended (`lastOutcome`), or null when
 * there is none or it says nothing worth repeating (cancelled, ended). The
 * session's `reason` applies only while the session is that outcome.
 */
export function pairingOutcomeText(status: PairingStatus, msgs: Messages): string | null {
	const outcome = status.lastOutcome;
	if (!outcome || outcome === 'cancelled' || outcome === 'ended') return null;
	if (outcome === 'restarting' || outcome === 'restart_needed')
		return msgs.fisqua_link_last_outcome(msgs.fisqua_link_restart_manual);
	const reason = status.state === outcome ? status.reason : null;
	return msgs.fisqua_link_last_outcome(
		pairingFinalText({ ...status, state: outcome, reason }, msgs)
	);
}

/** The line while Captua waits to ask Fisqua again (`trouble`); null when there is no trouble. */
export function pairingRetryText(status: PairingStatus, msgs: Messages): string | null {
	if (status.trouble === null) return null;
	const s = status.retryAfterSeconds ?? 0;
	if (status.trouble === 'busy') return msgs.fisqua_link_busy(s);
	if (status.trouble === 'network') return msgs.fisqua_link_network;
	return msgs.fisqua_link_retry(s);
}

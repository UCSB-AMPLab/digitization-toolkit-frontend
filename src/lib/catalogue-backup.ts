// State of the offsite catalogue backup (NEH-266), read from
// GET /system/catalogue-backup (NEH-249).
//
// The appliance makes one verified dump of the catalogue (the database, not
// the image files) per local day and retries every 30 minutes until one
// succeeds. Green allows for one late or missed daily run (36 h), amber for
// up to three days (72 h); past that, or with no verified copy at all, red.
//
// The module imports only a type from the API client, so the classification,
// the date wording and the polling schedule are tested in the server project.

import type { CatalogueBackupStatus } from '$lib/api';
import { parseApiDate } from './pipeline';

export type { CatalogueBackupStatus };

const HOUR_MS = 60 * 60 * 1000;

/** Up to this age (inclusive) the copy is current. */
export const CURRENT_MAX_AGE_MS = 36 * HOUR_MS;
/** Up to this age (inclusive) the copy is late; past it, overdue. */
export const LATE_MAX_AGE_MS = 72 * HOUR_MS;

/** How far in the future a timestamp may be and still count as clock skew. */
export const MAX_CLOCK_SKEW_MS = HOUR_MS;

/**
 * current → green, late → amber, overdue → red, off → grey (not configured,
 * not a fault). `unknown` is for a response this module cannot read; the
 * components also use it when the request fails. It never stands in for one
 * of the other four.
 */
export type BackupLevel = 'current' | 'late' | 'overdue' | 'off' | 'unknown';

export interface BackupClassification {
	level: BackupLevel;
	/** When the last verified copy was made; null when there is none. */
	verifiedAt: Date | null;
}

/**
 * Classify the endpoint's answer at `now`.
 *
 * Age is `now − last_verified_at`. Both boundaries are inclusive on the
 * fresher side: exactly 36 h is current, exactly 72 h is late.
 *
 * A timestamp up to MAX_CLOCK_SKEW_MS in the future (the appliance's clock
 * and this browser's disagree) is classified as current: the backend recorded
 * a verified copy, and that much skew between two machines is not evidence
 * that it is missing. Further in the future, one of the two clocks is wrong
 * by more than skew explains and the age means nothing, so it is unknown.
 */
export function classifyBackup(status: CatalogueBackupStatus, now: Date | number): BackupClassification {
	if (!status || typeof status.enabled !== 'boolean') return { level: 'unknown', verifiedAt: null };
	if (!status.enabled) return { level: 'off', verifiedAt: null };
	if (status.last_verified_at === null) return { level: 'overdue', verifiedAt: null };
	if (typeof status.last_verified_at !== 'string') return { level: 'unknown', verifiedAt: null };

	const verifiedAt = parseApiDate(status.last_verified_at);
	if (Number.isNaN(verifiedAt.getTime())) return { level: 'unknown', verifiedAt: null };

	const age = (typeof now === 'number' ? now : now.getTime()) - verifiedAt.getTime();
	if (age < -MAX_CLOCK_SKEW_MS) return { level: 'unknown', verifiedAt: null };
	if (age <= CURRENT_MAX_AGE_MS) return { level: 'current', verifiedAt };
	if (age <= LATE_MAX_AGE_MS) return { level: 'late', verifiedAt };
	return { level: 'overdue', verifiedAt };
}

/** What the components hold: no answer yet, a failed request, or the last answer. */
export type CatalogueBackupSnapshot =
	| { kind: 'loading' }
	| { kind: 'failed' }
	| { kind: 'loaded'; status: CatalogueBackupStatus; receivedAt: number };

/**
 * Classify the held answer at `now`, the current time, not the time the
 * answer arrived, so a copy keeps ageing on screen between answers. Null while
 * no answer has arrived. A failed request is unknown, and so is an answer
 * older than MAX_ANSWER_AGE_MS: an answer that could not be refreshed for that
 * long says nothing about the copy now.
 */
export function classifySnapshot(snapshot: CatalogueBackupSnapshot, now: number): BackupClassification | null {
	if (snapshot.kind === 'loading') return null;
	if (snapshot.kind === 'failed') return { level: 'unknown', verifiedAt: null };
	if (now - snapshot.receivedAt > MAX_ANSWER_AGE_MS) return { level: 'unknown', verifiedAt: null };
	return classifyBackup(snapshot.status, now);
}

/**
 * Whether `when` falls on the same local calendar day as `now`, on the day
 * before, or earlier, in this browser's time zone. A `when` after today
 * (clock skew) counts as today.
 */
export type DayRelation = 'today' | 'yesterday' | 'earlier';

export function dayRelation(when: Date, now: Date): DayRelation {
	const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const today = startOfDay(now);
	const day = startOfDay(when);
	if (day >= today) return 'today';
	// The day before, built from calendar fields rather than by subtracting
	// 24 h, so a daylight-saving change does not shift it.
	const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
	return day >= yesterday ? 'yesterday' : 'earlier';
}

/** "20 de octubre" / "October 20", with the year only when it is not this year's. */
export function formatBackupDate(when: Date, now: Date, locale: string): string {
	return when.toLocaleDateString(locale, {
		day: 'numeric',
		month: 'long',
		...(when.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
	});
}

/** 24-hour local time, "14:05", as the system logs on Configuración show it. */
export function formatBackupTime(when: Date, locale: string): string {
	return when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * How often the components ask again. The levels change on a scale of hours
 * and the appliance retries every 30 minutes, so five minutes shows a
 * recovered copy, or a copy that has just turned late, within five minutes of
 * the fact, at a cost of one small GET. A failed request waits the same
 * interval before the next try: a backend that is down or still booting gets
 * no more traffic from this than a healthy one.
 */
export const POLL_INTERVAL_MS = 5 * 60 * 1000;

/** A held answer older than this is unknown (see classifySnapshot). */
export const MAX_ANSWER_AGE_MS = 2 * POLL_INTERVAL_MS;

/** A request that has not answered after this long is aborted and counts as failed. */
export const REQUEST_TIMEOUT_MS = 20 * 1000;

/**
 * How often the components re-classify the held answer against the clock, so
 * a copy turns amber or red, and an old answer unknown, with no new answer.
 */
export const RECLASSIFY_INTERVAL_MS = 60 * 1000;

export type PollResult<T = CatalogueBackupStatus> = { ok: true; status: T } | { ok: false; error: unknown };

/**
 * Fetch now, then again `intervalMs` after each answer, success or failure.
 * The volume view polls its offsite state with it too (offsite-state.ts).
 * One request at a time: the next is scheduled only when the previous has
 * settled. Each request gets its own AbortSignal, aborted after `timeoutMs`
 * (the request then counts as failed) or when polling stops. Stops when
 * `shouldStop(error)` is true for a failure (the caller passes "the session
 * is gone"), or when the returned function is called.
 *
 * The returned function's `pollNow()` asks at once instead of waiting for the
 * timer (after the machine wakes, when the timer may be far off). It does
 * nothing while a request is in flight or after polling has stopped, and the
 * interval restarts from that request's answer.
 */
export function startPolling<T = CatalogueBackupStatus>(
	fetcher: (signal: AbortSignal) => Promise<T>,
	onResult: (result: PollResult<T>) => void,
	intervalMs: number = POLL_INTERVAL_MS,
	shouldStop: (error: unknown) => boolean = () => false,
	timeoutMs: number = REQUEST_TIMEOUT_MS
): (() => void) & { pollNow: () => void } {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inFlight: AbortController | null = null;

	const tick = async () => {
		timer = null;
		const controller = new AbortController();
		inFlight = controller;
		const timeout = setTimeout(
			() => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
			timeoutMs
		);
		let result: PollResult<T>;
		try {
			// Racing the abort, so a fetcher that ignores the signal still
			// times out here.
			const status = await Promise.race([
				fetcher(controller.signal),
				new Promise<never>((_resolve, reject) =>
					controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
				)
			]);
			result = { ok: true, status };
		} catch (error) {
			result = { ok: false, error };
		} finally {
			clearTimeout(timeout);
			inFlight = null;
		}
		if (stopped) return;
		onResult(result);
		if (!result.ok && shouldStop(result.error)) {
			stopped = true;
			return;
		}
		timer = setTimeout(tick, intervalMs);
	};

	tick();

	const stop = () => {
		stopped = true;
		if (timer !== null) clearTimeout(timer);
		inFlight?.abort();
	};
	const pollNow = () => {
		if (stopped || inFlight !== null) return;
		if (timer !== null) clearTimeout(timer);
		tick();
	};
	return Object.assign(stop, { pollNow });
}

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
 * A timestamp in the future (the appliance's clock and this browser's
 * disagree) gives a negative age, which is classified as current: the backend
 * recorded a verified copy, and a few minutes of clock skew between two
 * machines is not evidence that it is missing.
 */
export function classifyBackup(status: CatalogueBackupStatus, now: Date | number): BackupClassification {
	if (!status || typeof status.enabled !== 'boolean') return { level: 'unknown', verifiedAt: null };
	if (!status.enabled) return { level: 'off', verifiedAt: null };
	if (status.last_verified_at === null) return { level: 'overdue', verifiedAt: null };
	if (typeof status.last_verified_at !== 'string') return { level: 'unknown', verifiedAt: null };

	const verifiedAt = parseApiDate(status.last_verified_at);
	if (Number.isNaN(verifiedAt.getTime())) return { level: 'unknown', verifiedAt: null };

	const age = (typeof now === 'number' ? now : now.getTime()) - verifiedAt.getTime();
	if (age <= CURRENT_MAX_AGE_MS) return { level: 'current', verifiedAt };
	if (age <= LATE_MAX_AGE_MS) return { level: 'late', verifiedAt };
	return { level: 'overdue', verifiedAt };
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

export type PollResult = { ok: true; status: CatalogueBackupStatus } | { ok: false; error: unknown };

/**
 * Fetch now, then again `intervalMs` after each answer, success or failure.
 * One request at a time: the next is scheduled only when the previous has
 * settled. Stops when `shouldStop(error)` is true for a failure (the caller
 * passes "the session is gone"), or when the returned function is called.
 */
export function startPolling(
	fetcher: () => Promise<CatalogueBackupStatus>,
	onResult: (result: PollResult) => void,
	intervalMs: number = POLL_INTERVAL_MS,
	shouldStop: (error: unknown) => boolean = () => false
): () => void {
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const tick = async () => {
		timer = null;
		let result: PollResult;
		try {
			result = { ok: true, status: await fetcher() };
		} catch (error) {
			result = { ok: false, error };
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

	return () => {
		stopped = true;
		if (timer !== null) clearTimeout(timer);
	};
}

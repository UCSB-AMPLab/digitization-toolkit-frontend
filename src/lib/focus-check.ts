// NEH-339: when the capture screen of a DSLR unit asks for a focus check by
// itself, and what the check's manual-focus stage makes of the lens readings.
//
// The screen asks when it is opened or returned to and nothing has been
// recorded since the sign-in, or the last activity is more than
// FOCUS_CHECK_AFTER_MS old. Activity is the later of a completed check, a
// dismissed one and a capture made from the capture screen. It is kept per
// user in this browser under STORAGE_KEYS.focusCheck, and cleared at every
// sign-in (authStore.setSession with signIn), so each sign-in asks again.
//
// The time is passed in, never read here, so the rules are tested without
// timers. No import of api.ts, so the tests run in plain node.
//
// Version: 0.3.3

import type { FocusModeKind } from './focus-mode';
import { STORAGE_KEYS, readStored, removeStored, writeStored } from './storage-keys';

/** How long a focus check or a capture holds before the screen asks again. */
export const FOCUS_CHECK_AFTER_MS = 15 * 60 * 1000;

/**
 * True holds "Continue" on the manual-focus stage until both cameras read
 * manual; the reading follows the lens switch within one reading. False
 * only warns.
 */
export const REQUIRE_MF_READING = true;

/** Failed readings of one camera in a row after which "Continue anyway" is offered. */
export const CONTINUE_ANYWAY_AFTER = 2;

/** The count of failed readings in a row, after a reading of `kind`. */
export function nextFailedReadings(count: number, kind: FocusModeKind): number {
	return kind === 'unknown' ? count + 1 : 0;
}

/** How often the focus-mode readings are taken on the AF and MF stages. */
export const FOCUS_POLL_MS = 3000;

type UserId = number | string | null | undefined;

export function focusCheckDue(last: number | null, now: number): boolean {
	return last === null || now - last > FOCUS_CHECK_AFTER_MS;
}

// The activity is also kept in memory, per user, for the life of the page, so
// that storage which refuses writes (full, or private mode) does not make the
// check due again at once after it was completed or dismissed.
const remembered = new Map<string, number>();

function later(a: number | null, b: number | null): number | null {
	if (a === null) return b;
	if (b === null) return a;
	return a > b ? a : b;
}

/**
 * The last activity of the user: the later of the stored time and the one
 * remembered in memory, or null when there is none.
 */
export function readFocusActivity(userId: UserId): number | null {
	if (userId == null) return null;
	const raw = readStored(STORAGE_KEYS.focusCheck(userId));
	const stored = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
	return later(stored, remembered.get(String(userId)) ?? null);
}

/** Records activity at `now`, keeping the later of it and what is known. Memory first, then storage. */
export function recordFocusActivity(userId: UserId, now: number): void {
	if (userId == null) return;
	const last = readFocusActivity(userId);
	const value = last !== null && last > now ? last : now;
	remembered.set(String(userId), value);
	writeStored(STORAGE_KEYS.focusCheck(userId), String(value));
}

/** Forgets the activity, in memory and in storage, so the next check is due. */
export function clearFocusActivity(userId: UserId): void {
	if (userId == null) return;
	remembered.delete(String(userId));
	removeStored(STORAGE_KEYS.focusCheck(userId));
}

/** Whether the capture screen should open the check by itself. Never without a user. */
export function focusCheckNeeded(userId: UserId, now: number): boolean {
	if (userId == null) return false;
	return focusCheckDue(readFocusActivity(userId), now);
}

export interface SideReadings {
	left: FocusModeKind;
	right: FocusModeKind;
}

/** The camera to name in the MF warning: only when both readings are known and one reads auto. */
export function mfWarning(readings: SideReadings): 'left' | 'right' | 'both' | null {
	if (readings.left === 'unknown' || readings.right === 'unknown') return null;
	const left = readings.left === 'auto';
	const right = readings.right === 'auto';
	if (left && right) return 'both';
	if (left) return 'left';
	if (right) return 'right';
	return null;
}

export function canContinue(readings: SideReadings, requireMf: boolean): boolean {
	if (!requireMf) return true;
	return readings.left === 'manual' && readings.right === 'manual';
}

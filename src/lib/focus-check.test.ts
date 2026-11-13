// NEH-339: when the capture screen asks the operator to check focus by
// itself, and what the last stage of the check says about the lens readings.
//
// Version: 0.3.3

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	FOCUS_CHECK_AFTER_MS,
	REQUIRE_MF_READING,
	nextFailedReadings,
	canContinue,
	clearFocusActivity,
	focusCheckDue,
	focusCheckNeeded,
	mfWarning,
	readFocusActivity,
	recordFocusActivity
} from './focus-check';
import { STORAGE_KEYS } from './storage-keys';

const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);
const MIN = 60 * 1000;

describe('focusCheckDue', () => {
	it('is due when nothing has been recorded since the sign-in', () => {
		expect(focusCheckDue(null, T0)).toBe(true);
	});

	it('is not due up to 15 minutes after the last activity', () => {
		expect(FOCUS_CHECK_AFTER_MS).toBe(15 * MIN);
		expect(focusCheckDue(T0, T0)).toBe(false);
		expect(focusCheckDue(T0, T0 + 14 * MIN)).toBe(false);
		expect(focusCheckDue(T0, T0 + 15 * MIN)).toBe(false);
	});

	it('is due more than 15 minutes after the last activity', () => {
		expect(focusCheckDue(T0, T0 + 15 * MIN + 1)).toBe(true);
		expect(focusCheckDue(T0, T0 + 60 * MIN)).toBe(true);
	});
});

describe('the activity kept per user', () => {
	let store: Record<string, string>;

	beforeEach(() => {
		store = {};
		clearFocusActivity(7);
		clearFocusActivity(8);
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => (k in store ? store[k] : null),
			setItem: (k: string, v: string) => {
				store[k] = v;
			},
			removeItem: (k: string) => {
				delete store[k];
			}
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('is kept under a captua_ key per user', () => {
		expect(STORAGE_KEYS.focusCheck(7)).toBe('captua_focus_check:7');
		recordFocusActivity(7, T0);
		expect(store['captua_focus_check:7']).toBe(String(T0));
		expect(readFocusActivity(7)).toBe(T0);
		expect(readFocusActivity(8)).toBeNull();
	});

	it('asks on the first opening after a sign-in, and not again within 15 minutes', () => {
		expect(focusCheckNeeded(7, T0)).toBe(true);
		recordFocusActivity(7, T0); // the check completed or dismissed
		expect(focusCheckNeeded(7, T0 + 10 * MIN)).toBe(false);
		expect(focusCheckNeeded(7, T0 + 16 * MIN)).toBe(true);
	});

	it('a capture counts as activity and starts the 15 minutes again', () => {
		recordFocusActivity(7, T0);
		recordFocusActivity(7, T0 + 10 * MIN); // a capture
		expect(focusCheckNeeded(7, T0 + 20 * MIN)).toBe(false);
		expect(focusCheckNeeded(7, T0 + 26 * MIN)).toBe(true);
	});

	it('keeps the later of the stored activity and the new one', () => {
		recordFocusActivity(7, T0 + 10 * MIN);
		recordFocusActivity(7, T0);
		expect(readFocusActivity(7)).toBe(T0 + 10 * MIN);
	});

	it('a sign-in clears it, so the next opening asks again', () => {
		recordFocusActivity(7, T0);
		clearFocusActivity(7);
		expect(readFocusActivity(7)).toBeNull();
		expect(focusCheckNeeded(7, T0 + MIN)).toBe(true);
	});

	it('never asks without a user', () => {
		expect(focusCheckNeeded(null, T0)).toBe(false);
		expect(focusCheckNeeded(undefined, T0)).toBe(false);
	});

	it('a value that is not a time counts as nothing recorded', () => {
		store['captua_focus_check:7'] = 'yesterday';
		expect(readFocusActivity(7)).toBeNull();
		expect(focusCheckNeeded(7, T0)).toBe(true);
	});

	it('storage that cannot be read asks, and a refused write does not throw', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('storage disabled');
			},
			setItem: () => {
				throw new Error('storage disabled');
			},
			removeItem: () => {
				throw new Error('storage disabled');
			}
		});
		expect(focusCheckNeeded(7, T0)).toBe(true);
		expect(() => recordFocusActivity(7, T0)).not.toThrow();
		expect(() => clearFocusActivity(7)).not.toThrow();
	});
});

describe.each([
	['storage that refuses writes', true],
	['working storage', false]
])('the activity is also kept in memory (%s)', (_name, refuses) => {
	let store: Record<string, string>;

	beforeEach(() => {
		store = {};
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => (k in store ? store[k] : null),
			setItem: (k: string, v: string) => {
				if (refuses) throw new Error('quota exceeded');
				store[k] = v;
			},
			removeItem: (k: string) => {
				delete store[k];
			}
		});
		clearFocusActivity(21);
		clearFocusActivity(22);
	});

	afterEach(() => {
		clearFocusActivity(21);
		clearFocusActivity(22);
		vi.unstubAllGlobals();
	});

	it('is not due after activity, and is due again after the interval', () => {
		expect(focusCheckNeeded(21, T0)).toBe(true);
		recordFocusActivity(21, T0);
		expect(readFocusActivity(21)).toBe(T0);
		expect(focusCheckNeeded(21, T0 + 10 * MIN)).toBe(false);
		expect(focusCheckNeeded(21, T0 + 15 * MIN + 1)).toBe(true);
	});

	it('keeps the later of two recordings', () => {
		recordFocusActivity(21, T0 + 10 * MIN);
		recordFocusActivity(21, T0);
		expect(readFocusActivity(21)).toBe(T0 + 10 * MIN);
	});

	it('a sign-in clears it even though memory held a value', () => {
		recordFocusActivity(21, T0);
		clearFocusActivity(21);
		expect(readFocusActivity(21)).toBeNull();
		expect(focusCheckNeeded(21, T0 + MIN)).toBe(true);
	});

	it('does not share the value between two users', () => {
		recordFocusActivity(21, T0);
		expect(readFocusActivity(22)).toBeNull();
		expect(focusCheckNeeded(22, T0 + MIN)).toBe(true);
		expect(focusCheckNeeded(21, T0 + MIN)).toBe(false);
	});
});

describe('the manual-focus stage', () => {
	it('warns only when both readings are known and one still reads auto', () => {
		expect(mfWarning({ left: 'manual', right: 'manual' })).toBeNull();
		expect(mfWarning({ left: 'auto', right: 'manual' })).toBe('left');
		expect(mfWarning({ left: 'manual', right: 'auto' })).toBe('right');
		expect(mfWarning({ left: 'auto', right: 'auto' })).toBe('both');
		expect(mfWarning({ left: 'auto', right: 'unknown' })).toBeNull();
		expect(mfWarning({ left: 'unknown', right: 'unknown' })).toBeNull();
	});

	it('with the reading not required, "Continue" is always allowed', () => {
		expect(canContinue({ left: 'auto', right: 'auto' }, false)).toBe(true);
		expect(canContinue({ left: 'unknown', right: 'manual' }, false)).toBe(true);
		expect(canContinue({ left: 'manual', right: 'manual' }, false)).toBe(true);
	});

	it('with the reading required, "Continue" waits until both read manual', () => {
		expect(canContinue({ left: 'auto', right: 'manual' }, true)).toBe(false);
		expect(canContinue({ left: 'unknown', right: 'manual' }, true)).toBe(false);
		expect(canContinue({ left: 'manual', right: 'manual' }, true)).toBe(true);
	});
});

describe('the MF reading', () => {
	it('is required', () => {
		expect(REQUIRE_MF_READING).toBe(true);
	});

	it('counts failed readings in a row, and a reading clears the count', () => {
		expect(nextFailedReadings(0, 'unknown')).toBe(1);
		expect(nextFailedReadings(1, 'unknown')).toBe(2);
		expect(nextFailedReadings(2, 'manual')).toBe(0);
		expect(nextFailedReadings(2, 'auto')).toBe(0);
	});
});

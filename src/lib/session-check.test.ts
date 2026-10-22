// NEH-219: an unreachable backend must never count as a rejected session.
import { describe, expect, it, vi } from 'vitest';
import { classifySessionError, sessionRetryDelay, waitForSession } from './session-check';

// Local stand-ins for api.ts's error classes, as in login-error.test.ts.
class AuthError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = 'AuthError';
		this.status = status;
	}
}

class ApiError extends Error {
	status?: number;
	constructor(message: string, status?: number) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

describe('classifySessionError', () => {
	it('treats a 401 as a rejected session', () => {
		expect(classifySessionError(new AuthError(401, 'Invalid or expired token'))).toBe('invalid');
	});

	it('treats a 403 as a rejected session', () => {
		expect(classifySessionError(new AuthError(403, 'Forbidden'))).toBe('invalid');
	});

	it('treats a failed fetch as an unavailable backend', () => {
		expect(classifySessionError(new TypeError('Failed to fetch'))).toBe('unavailable');
	});

	it.each([502, 503, 504, 500])('treats a %i as an unavailable backend', (status) => {
		expect(classifySessionError(new ApiError(`HTTP ${status}`, status))).toBe('unavailable');
	});

	it('treats an unknown throw as an unavailable backend', () => {
		expect(classifySessionError('boom')).toBe('unavailable');
	});
});

describe('sessionRetryDelay', () => {
	it('starts at 2 s and doubles up to a 10 s ceiling', () => {
		expect([0, 1, 2, 3, 4, 10].map(sessionRetryDelay)).toEqual([
			2000, 4000, 8000, 10000, 10000, 10000
		]);
	});
});

describe('waitForSession', () => {
	const user = { id: 1, username: 'operator1' };

	it('returns the user without waiting when the first check succeeds', async () => {
		const onWaiting = vi.fn();
		const sleep = vi.fn(async () => {});

		const outcome = await waitForSession(async () => user, { onWaiting, sleep });

		expect(outcome).toEqual({ kind: 'valid', user });
		expect(onWaiting).not.toHaveBeenCalled();
		expect(sleep).not.toHaveBeenCalled();
	});

	it('keeps retrying with backoff through 502s and network errors, then returns the user', async () => {
		const check = vi
			.fn<() => Promise<typeof user>>()
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockRejectedValueOnce(new ApiError('HTTP 502', 502))
			.mockRejectedValueOnce(new ApiError('HTTP 503', 503))
			.mockRejectedValueOnce(new ApiError('HTTP 504', 504))
			.mockRejectedValueOnce(new ApiError('HTTP 502', 502))
			.mockResolvedValueOnce(user);
		const onWaiting = vi.fn();
		const waits: number[] = [];
		const sleep = vi.fn(async (ms: number) => {
			waits.push(ms);
		});

		const outcome = await waitForSession(check, { onWaiting, sleep });

		expect(outcome).toEqual({ kind: 'valid', user });
		expect(check).toHaveBeenCalledTimes(6);
		expect(waits).toEqual([2000, 4000, 8000, 10000, 10000]);
		expect(onWaiting.mock.calls).toEqual([[true], [false]]);
	});

	it('stops at a 401 after a period of waiting', async () => {
		const check = vi
			.fn<() => Promise<typeof user>>()
			.mockRejectedValueOnce(new ApiError('HTTP 502', 502))
			.mockRejectedValueOnce(new AuthError(401, 'Invalid or expired token'));
		const onWaiting = vi.fn();

		const outcome = await waitForSession(check, { onWaiting, sleep: async () => {} });

		expect(outcome).toEqual({ kind: 'invalid' });
		expect(onWaiting.mock.calls).toEqual([[true], [false]]);
	});

	it('returns invalid on a 403 at once', async () => {
		const sleep = vi.fn(async () => {});
		const outcome = await waitForSession(
			async () => {
				throw new AuthError(403, 'Forbidden');
			},
			{ sleep }
		);
		expect(outcome).toEqual({ kind: 'invalid' });
		expect(sleep).not.toHaveBeenCalled();
	});

	it('stops retrying once aborted', async () => {
		const controller = new AbortController();
		const check = vi.fn(async () => {
			throw new ApiError('HTTP 502', 502);
		});
		const sleep = vi.fn(async () => {
			controller.abort();
		});

		const outcome = await waitForSession(check, { signal: controller.signal, sleep });

		expect(outcome).toEqual({ kind: 'cancelled' });
		expect(check).toHaveBeenCalledTimes(1);
	});
});

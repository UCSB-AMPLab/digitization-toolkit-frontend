import { describe, expect, it } from 'vitest';
import { classifyLoginError, lockoutMinutes, retryAfterOf } from './login-error';

// Local stand-ins for api.ts's error classes: importing the real ones would
// pull in SvelteKit and force this out of the node test project.
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
	retryAfter: string | null;
	constructor(message: string, status?: number, retryAfter: string | null = null) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.retryAfter = retryAfter;
	}
}

describe('classifyLoginError', () => {
	it('treats a 401 from /auth/login as bad credentials', () => {
		const error = new AuthError(401, 'Incorrect username or password');
		expect(classifyLoginError(error, { credentialsChecked: false })).toBe('credentials');
	});

	it('treats a failed fetch as an unavailable backend', () => {
		const error = new TypeError('Failed to fetch');
		expect(classifyLoginError(error, { credentialsChecked: false })).toBe('unavailable');
	});

	it('treats a 502 during boot as an unavailable backend', () => {
		const error = new ApiError('HTTP 502');
		expect(classifyLoginError(error, { credentialsChecked: false })).toBe('unavailable');
	});

	it('does not report a 403 as bad credentials', () => {
		const error = new AuthError(403, 'Forbidden');
		expect(classifyLoginError(error, { credentialsChecked: false })).toBe('unavailable');
	});

	it('does not blame the password once login has already succeeded', () => {
		const error = new AuthError(401, 'Not authenticated');
		expect(classifyLoginError(error, { credentialsChecked: true })).toBe('unavailable');
	});

	it('treats an unknown throw as an unavailable backend', () => {
		expect(classifyLoginError('boom', { credentialsChecked: false })).toBe('unavailable');
	});
});

describe('the login lockout (NEH-219)', () => {
	it('treats a 429 from /auth/login as a lockout, not as bad credentials', () => {
		const error = new ApiError('Too many failed login attempts. Try again later.', 429, '300');
		expect(classifyLoginError(error, { credentialsChecked: false })).toBe('throttled');
	});

	it('reads Retry-After off the error', () => {
		expect(retryAfterOf(new ApiError('x', 429, '300'))).toBe('300');
		expect(retryAfterOf(new ApiError('x', 429))).toBeNull();
		expect(retryAfterOf(new TypeError('Failed to fetch'))).toBeNull();
	});

	it.each([
		['300', 5],
		['301', 6],
		['60', 1],
		['59', 1],
		['1', 1],
		[' 120 ', 2]
	])('rounds Retry-After %s seconds up to %i minutes', (header, minutes) => {
		expect(lockoutMinutes(header)).toBe(minutes);
	});

	it.each([[null], [undefined], [''], ['0'], ['abc'], ['1.5'], ['Wed, 21 Oct 2026 07:28:00 GMT']])(
		'gives no figure for Retry-After %s',
		(header) => {
			expect(lockoutMinutes(header)).toBeNull();
		}
	);
});

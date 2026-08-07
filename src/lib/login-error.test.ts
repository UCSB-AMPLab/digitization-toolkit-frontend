import { describe, expect, it } from 'vitest';
import { classifyLoginError } from './login-error';

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
	constructor(message: string) {
		super(message);
		this.name = 'ApiError';
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
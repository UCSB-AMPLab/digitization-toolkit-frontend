// Version: 0.4.0

import { describe, expect, it } from 'vitest';
import { classifyLoginError, describeLockout, lockoutMinutes, retryAfterOf } from './login-error';
import { en } from './i18n/en';
import { es } from './i18n/es';

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
	detail?: unknown;
	constructor(
		message: string,
		status?: number,
		retryAfter: string | null = null,
		detail?: unknown
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.retryAfter = retryAfter;
		this.detail = detail;
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

describe('which lock a 429 names (NEH-274)', () => {
	const locked = (code: unknown, retryAfter: string | null) =>
		new ApiError('Too many failed login attempts.', 429, retryAfter, {
			code,
			message: 'Too many failed login attempts.'
		});

	for (const [lang, msgs] of [
		['en', en],
		['es', es]
	] as const) {
		it(`names the account lock, with the minutes (${lang})`, () => {
			expect(describeLockout(locked('account_locked', '241'), msgs)).toEqual({
				lock: 'account',
				text: msgs.login_error_account_locked(5)
			});
		});

		it(`names the account lock without a figure when Retry-After is missing (${lang})`, () => {
			expect(describeLockout(locked('account_locked', null), msgs)).toEqual({
				lock: 'account',
				text: msgs.login_error_account_locked_unknown
			});
		});

		it(`names the device lock, with the minutes (${lang})`, () => {
			expect(describeLockout(locked('machine_locked', '600'), msgs)).toEqual({
				lock: 'device',
				text: msgs.login_error_device_locked(10)
			});
		});

		it(`names the device lock without a figure when Retry-After is missing (${lang})`, () => {
			expect(describeLockout(locked('machine_locked', null), msgs)).toEqual({
				lock: 'device',
				text: msgs.login_error_device_locked_unknown
			});
		});

		it(`falls back to the lock without a name when the detail is a string (${lang})`, () => {
			const error = new ApiError('Too many failed login attempts.', 429, '300');
			expect(describeLockout(error, msgs)).toEqual({
				lock: 'unknown',
				text: msgs.login_error_locked_out(5)
			});
			expect(describeLockout(new ApiError('x', 429), msgs)).toEqual({
				lock: 'unknown',
				text: msgs.login_error_locked_out_unknown
			});
		});

		it(`falls back to the lock without a name for an unknown code (${lang})`, () => {
			expect(describeLockout(locked('ip_locked', '120'), msgs)).toEqual({
				lock: 'unknown',
				text: msgs.login_error_locked_out(2)
			});
			expect(describeLockout(locked(undefined, null), msgs)).toEqual({
				lock: 'unknown',
				text: msgs.login_error_locked_out_unknown
			});
		});
	}

	it('uses the singular for one minute', () => {
		expect(describeLockout(locked('account_locked', '45'), en).text).toBe(
			'Too many failed attempts for this account. Wait 1 minute before trying again.'
		);
		expect(describeLockout(locked('machine_locked', '60'), en).text).toBe(
			'Too many failed attempts from this device. Wait 1 minute before trying again. Until then, no one can sign in here.'
		);
		expect(describeLockout(locked('account_locked', '45'), es).text).toBe(
			'Demasiados intentos fallidos con esta cuenta. Espera 1 minuto e intenta de nuevo.'
		);
		expect(describeLockout(locked('machine_locked', '60'), es).text).toBe(
			'Demasiados intentos fallidos desde este dispositivo. Espera 1 minuto e intenta de nuevo. Mientras tanto, nadie puede iniciar sesión aquí.'
		);
	});

	it('uses the plural for more than one minute', () => {
		expect(describeLockout(locked('account_locked', '300'), en).text).toBe(
			'Too many failed attempts for this account. Wait 5 minutes before trying again.'
		);
		expect(describeLockout(locked('machine_locked', '300'), es).text).toBe(
			'Demasiados intentos fallidos desde este dispositivo. Espera 5 minutos e intenta de nuevo. Mientras tanto, nadie puede iniciar sesión aquí.'
		);
	});
});

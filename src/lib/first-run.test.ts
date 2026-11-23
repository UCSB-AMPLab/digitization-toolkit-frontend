// The first-run wizard asks the backend directly at the unit's loopback
// address, port 8000, whether the request is local, and creates the first
// administrator there without a token. The address is formed only for a page
// opened as localhost or 127.0.0.1, and every failure of the direct status
// call counts as "not local".
import { describe, expect, it, vi } from 'vitest';
import {
	directBackendBase,
	isLocalUnit,
	registerAtUnit,
	FirstRunError,
	FirstRunTimeout,
	REGISTER_TIMEOUT_MS
} from './first-run';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('directBackendBase', () => {
	it('is port 8000 of localhost and of 127.0.0.1', () => {
		expect(directBackendBase('localhost')).toBe('http://localhost:8000');
		expect(directBackendBase('127.0.0.1')).toBe('http://127.0.0.1:8000');
	});

	it('is null for a LAN name or address', () => {
		expect(directBackendBase('captua.local')).toBeNull();
		expect(directBackendBase('192.168.1.20')).toBeNull();
		expect(directBackendBase('')).toBeNull();
	});
});

describe('isLocalUnit', () => {
	it('asks the direct status route without credentials and reads `local`', async () => {
		const fetchImpl = vi.fn(async () => json({ needs_setup: true, local: true }));
		expect(await isLocalUnit('http://localhost:8000', fetchImpl)).toBe(true);
		expect(fetchImpl).toHaveBeenCalledWith(
			'http://localhost:8000/auth/setup/status',
			expect.objectContaining({ credentials: 'omit' })
		);
	});

	it('is false for local false, a missing field, an error answer, a network failure and no base', async () => {
		expect(await isLocalUnit('http://localhost:8000', async () => json({ local: false }))).toBe(
			false
		);
		expect(await isLocalUnit('http://localhost:8000', async () => json({}))).toBe(false);
		expect(await isLocalUnit('http://localhost:8000', async () => json({ local: true }, 500))).toBe(
			false
		);
		expect(
			await isLocalUnit('http://localhost:8000', async () => {
				throw new TypeError('Failed to fetch');
			})
		).toBe(false);
		const never = vi.fn();
		expect(await isLocalUnit(null, never)).toBe(false);
		expect(never).not.toHaveBeenCalled();
	});

	it('is false when the direct call does not answer in time', async () => {
		const hanging = (_url: string, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
			});
		expect(await isLocalUnit('http://localhost:8000', hanging, 20)).toBe(false);
	});
});

describe('registerAtUnit', () => {
	const data = {
		username: 'primera',
		password: 'fake-pw8',
		email: null,
		default_language: 'en' as const
	};

	it('posts the account as JSON without credentials or a token, and returns the user', async () => {
		const user = { id: 1, username: 'primera', email: null, role: 'admin', is_active: true };
		const fetchImpl = vi.fn(async () => json(user));
		expect(await registerAtUnit('http://localhost:8000', data, fetchImpl)).toEqual(user);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('http://localhost:8000/auth/register');
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('omit');
		expect(JSON.parse(init.body as string)).toEqual(data);
		expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
	});

	it('throws a FirstRunError with the status and the detail of a refusal', async () => {
		const detail = { code: 'password_too_short', message: 'x', min_length: 8 };
		const error = await registerAtUnit<never>('http://localhost:8000', data, async () =>
			json({ detail }, 422)
		).catch((e) => e as FirstRunError);
		expect(error).toBeInstanceOf(FirstRunError);
		expect(error.status).toBe(422);
		expect(error.detail).toEqual(detail);

		const conflict = await registerAtUnit<never>('http://localhost:8000', data, async () =>
			json({ detail: 'Username or email already exists' }, 409)
		).catch((e) => e as FirstRunError);
		expect(conflict.status).toBe(409);
		expect(conflict.message).toBe('Username or email already exists');
	});

	it('ends a registration with no answer after its time, as a FirstRunTimeout', async () => {
		expect(REGISTER_TIMEOUT_MS).toBe(30_000);
		const hanging = (_url: string, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
			});
		const error = await registerAtUnit<never>('http://localhost:8000', data, hanging, 20).catch(
			(e) => e
		);
		expect(error).toBeInstanceOf(FirstRunTimeout);
	});

	it('ends a registration whose body never comes, as a FirstRunTimeout', async () => {
		const headersOnly = async (_url: string, init?: RequestInit) =>
			({
				ok: true,
				status: 200,
				json: () =>
					new Promise((_resolve, reject) =>
						init?.signal?.addEventListener('abort', () =>
							reject(new DOMException('x', 'AbortError'))
						)
					)
			}) as unknown as Response;
		const error = await registerAtUnit<never>('http://localhost:8000', data, headersOnly, 20).catch(
			(e) => e
		);
		expect(error).toBeInstanceOf(FirstRunTimeout);
	});
});

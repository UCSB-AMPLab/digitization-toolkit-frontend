// The server renders a page with no language cookie, and the login page, in
// the unit's language (NEH-336), read from the public status route and kept
// for a short time so that not every request asks for it. Any failure gives
// the last language read, or Spanish before any read.
import { describe, expect, it, vi } from 'vitest';
import { createUnitLanguage, pickLocale } from './unit-language';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status });
}

describe('createUnitLanguage', () => {
	it('reads default_language from the status route', async () => {
		const fetchImpl = vi.fn(async () => json({ needs_setup: false, default_language: 'en' }));
		const read = createUnitLanguage({ url: 'http://backend:8000/auth/setup/status', fetchImpl });
		expect(await read()).toBe('en');
		expect(fetchImpl).toHaveBeenCalledWith(
			'http://backend:8000/auth/setup/status',
			expect.anything()
		);
	});

	it('asks once within the time it keeps the answer, and again after it', async () => {
		let now = 1000;
		const fetchImpl = vi.fn(async () => json({ default_language: 'en' }));
		const read = createUnitLanguage({ url: 'u', fetchImpl, ttlMs: 30_000, now: () => now });
		await read();
		now += 29_000;
		await read();
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		now += 2_000;
		await read();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('shares one request between concurrent reads', async () => {
		const fetchImpl = vi.fn(async () => json({ default_language: 'en' }));
		const read = createUnitLanguage({ url: 'u', fetchImpl });
		expect(await Promise.all([read(), read()])).toEqual(['en', 'en']);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('gives Spanish before any good read, and the last language read after a failure', async () => {
		let now = 0;
		let answer: () => Promise<Response> = async () => {
			throw new TypeError('down');
		};
		const read = createUnitLanguage({
			url: 'u',
			fetchImpl: () => answer(),
			ttlMs: 10,
			now: () => now
		});
		expect(await read()).toBe('es');
		answer = async () => json({ default_language: 'en' });
		now += 20;
		expect(await read()).toBe('en');
		answer = async () => json({ detail: 'x' }, 500);
		now += 20;
		expect(await read()).toBe('en');
		answer = async () => json({ default_language: 'pt' });
		now += 20;
		expect(await read()).toBe('en');
	});
});

describe('pickLocale', () => {
	const unit = async () => 'en' as const;

	it('uses the cookie on every page but the login page', async () => {
		expect(await pickLocale('/dashboard', 'es', unit)).toBe('es');
		expect(await pickLocale('/setup', 'es', unit)).toBe('es');
	});

	it("uses the unit's language with no cookie, and always on the login page", async () => {
		expect(await pickLocale('/dashboard', null, unit)).toBe('en');
		expect(await pickLocale('/login', 'es', unit)).toBe('en');
		expect(await pickLocale('/login/', 'es', unit)).toBe('en');
	});
});

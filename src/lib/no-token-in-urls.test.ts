// NEH-61: no source file builds a URL with a token in its query string, and
// no source file outside the migration reads or writes the old localStorage
// token key. The session is an httpOnly cookie; a token in a URL lands in
// access logs, browser history and Referer headers.
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('/src/**/*.{ts,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const files = Object.entries(sources).filter(([path]) => !/\.(test|spec)\.ts$/.test(path));

describe('session token stays out of URLs and localStorage', () => {
	it('finds the source files', () => {
		expect(files.length).toBeGreaterThan(20);
		expect(files.some(([p]) => p.endsWith('/src/lib/api.ts'))).toBe(true);
	});

	it('no source builds a ?token= or &token= query parameter', () => {
		const offenders = files.filter(([, text]) => /[?&]token=/.test(text)).map(([path]) => path);
		expect(offenders).toEqual([]);
	});

	it('only the migration module touches the access_token key', () => {
		const offenders = files
			.filter(([path]) => !path.endsWith('/src/lib/stores/legacy-token.ts'))
			.filter(([, text]) => /['"`]access_token['"`]/.test(text))
			.map(([path]) => path);
		expect(offenders).toEqual([]);
	});

	it('api.ts never touches localStorage', () => {
		const api = files.find(([p]) => p.endsWith('/src/lib/api.ts'))![1];
		expect(api).not.toMatch(/localStorage/);
		expect(api).not.toMatch(/Authorization/);
	});
});

// Which API base applies in the browser and in server-side rendering.
import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './api-base';

describe('browser', () => {
	it('uses a relative PUBLIC_API_BASE (the appliance) as it is', () => {
		expect(resolveApiBase(true, { PUBLIC_API_BASE: '/api' })).toBe('/api');
	});

	it('uses an absolute PUBLIC_API_BASE (the dev stack) as it is', () => {
		expect(resolveApiBase(true, { PUBLIC_API_BASE: 'http://localhost:8000' })).toBe(
			'http://localhost:8000'
		);
	});

	it('ignores PUBLIC_API_BASE_SSR', () => {
		expect(
			resolveApiBase(true, { PUBLIC_API_BASE: '/api', PUBLIC_API_BASE_SSR: 'http://host.docker.internal:8000' })
		).toBe('/api');
	});

	it('defaults to the local backend', () => {
		expect(resolveApiBase(true, {})).toBe('http://localhost:8000');
	});
});

describe('server-side rendering', () => {
	it('uses PUBLIC_API_BASE_SSR when set', () => {
		expect(
			resolveApiBase(false, { PUBLIC_API_BASE: '/api', PUBLIC_API_BASE_SSR: 'http://host.docker.internal:8000' })
		).toBe('http://host.docker.internal:8000');
	});

	it('never uses a relative PUBLIC_API_BASE, which Node cannot fetch', () => {
		expect(resolveApiBase(false, { PUBLIC_API_BASE: '/api' })).toBe('http://localhost:8000');
	});

	it('uses an absolute PUBLIC_API_BASE when no SSR base is set', () => {
		expect(resolveApiBase(false, { PUBLIC_API_BASE: 'http://unit.example:8000' })).toBe(
			'http://unit.example:8000'
		);
	});
});

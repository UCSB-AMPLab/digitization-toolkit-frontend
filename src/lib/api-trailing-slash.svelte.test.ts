// The list and create calls of records, volumes and projects send the path
// the backend declares, trailing slash included (GET /records/, POST
// /collections/, GET /projects/). The recorder matches a route with or
// without the slash, so these tests read the path it recorded, which is the
// path as sent.
//
// Version: 0.1.0
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, projectsApi, recordsApi } from './api';
import { recordRequests } from './test-support/testing-routes';

afterEach(() => vi.restoreAllMocks());

describe('projects', () => {
	it('lists at /projects/', async () => {
		const rec = recordRequests();
		await projectsApi.list();
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /projects/']);
	});

	it('creates at /projects/', async () => {
		const rec = recordRequests();
		await projectsApi.create({ name: 'P' });
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /projects/']);
	});
});

describe('collections', () => {
	it('lists at /collections/ without a query string', async () => {
		const rec = recordRequests();
		await collectionsApi.list();
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /collections/']);
		expect([...rec.requests[0].query.keys()]).toEqual([]);
	});

	it('lists at /collections/ with a query string', async () => {
		const rec = recordRequests();
		await collectionsApi.list({ project_id: 1, skip: 0, limit: 50 });
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /collections/']);
		expect(rec.requests[0].query.toString()).toBe('project_id=1&skip=0&limit=50');
	});

	it('pages through /collections/ in listAll', async () => {
		const rec = recordRequests({ 'GET /collections/': [] });
		await collectionsApi.listAll({ project_id: 1 });
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /collections/']);
		expect(rec.requests[0].query.toString()).toBe('project_id=1&skip=0&limit=1000');
	});

	it('creates at /collections/', async () => {
		const rec = recordRequests();
		await collectionsApi.create({ name: 'V' } as Parameters<typeof collectionsApi.create>[0]);
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /collections/']);
	});
});

describe('records', () => {
	it('lists at /records/ without a query string', async () => {
		const rec = recordRequests();
		await recordsApi.list();
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /records/']);
		expect([...rec.requests[0].query.keys()]).toEqual([]);
	});

	it('lists at /records/ with a query string', async () => {
		const rec = recordRequests();
		await recordsApi.list({ collection_id: 1 });
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /records/']);
		expect(rec.requests[0].query.toString()).toBe('collection_id=1');
	});

	it('pages through /records/ in listAll', async () => {
		const rec = recordRequests({ 'GET /records/': [] });
		await recordsApi.listAll({ collection_id: 1 });
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /records/']);
		expect(rec.requests[0].query.toString()).toBe('collection_id=1&skip=0&limit=1000');
	});

	it('creates at /records/', async () => {
		const rec = recordRequests();
		await recordsApi.create({ title: 'R' });
		expect(rec.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /records/']);
	});
});

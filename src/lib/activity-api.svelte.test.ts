// activityApi.collections(): the request it sends for GET /activity/collections
// and what it returns or throws.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { activityApi, ApiError, type CollectionActivity } from './api';

const body: CollectionActivity[] = [
	{
		collection_id: 12,
		status_counts: { captured: 3, in_review: 10, rejected: 1, approved: 20 },
		record_count: 34,
		last_status_change_at: '2026-10-22T17:03:11'
	},
	{
		collection_id: 13,
		status_counts: { captured: 0, in_review: 0, rejected: 0, approved: 0 },
		record_count: 0,
		last_status_change_at: null
	}
];

function respond(status: number, json: unknown) {
	return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
	);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('activityApi.collections', () => {
	it('GETs /activity/collections with no query and returns the rows as sent', async () => {
		const fetchSpy = respond(200, body);
		await expect(activityApi.collections()).resolves.toEqual(body);
		expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/activity\/collections$/);
	});

	it('passes project_id as a query parameter', async () => {
		const fetchSpy = respond(200, []);
		await activityApi.collections({ project_id: 4 });
		expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/activity\/collections\?project_id=4$/);
	});

	it('throws ApiError with the backend detail on a failure', async () => {
		respond(500, { detail: 'boom' });
		const err = await activityApi.collections().catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect(err.message).toBe('boom');
	});
});

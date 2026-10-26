// With the appliance's relative base, every URL the browser is handed (fetch,
// <img> src, links, downloads) stays on the page's own origin.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ PUBLIC_API_BASE: '/api' }) as Record<string, string | undefined>);

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env }));

import { getApiBase, recordsApi, collectionsApi } from './api';
import { tokenStore } from './stores/token';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('relative API base in the browser', () => {
	it('is the base getApiBase returns', () => {
		expect(getApiBase()).toBe('/api');
	});

	it('starts every URL handed to an <img>, a link or a download', () => {
		vi.spyOn(tokenStore, 'get').mockReturnValue(null);
		expect(recordsApi.getImageThumbnailUrl(7)).toBe('/api/records/images/7/thumbnail');
		expect(recordsApi.getImageFileUrl(7)).toBe('/api/records/images/7/file');
		expect(recordsApi.getImagePreviewUrl(7)).toBe('/api/records/images/7/preview');
		expect(collectionsApi.getExportDownloadUrl(3)).toBe('/api/collections/3/export/download');
	});

	it('starts every request', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
			);
		await recordsApi.getImages(5);
		expect(fetchMock.mock.calls[0][0]).toBe('/api/records/5/images');
	});
});

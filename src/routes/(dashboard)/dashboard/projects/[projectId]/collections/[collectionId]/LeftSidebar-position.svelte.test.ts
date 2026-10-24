// The book view's "position / total", with the thousands separator of each
// language on both numbers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, type Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { en } from '$lib/i18n/en';
import LeftSidebar from './LeftSidebar.svelte';

function props(currentIndex: number, totalRecords: number) {
	return {
		viewMode: 'spread' as const,
		currentIndex,
		totalRecords,
		onRotateLeft: vi.fn(),
		onRotateRight: vi.fn(),
		onRecordUpdated: vi.fn(),
		onRecapture: vi.fn(),
		currentRecord: { id: 1, title: 'Folio 1', status: 'captured', images: [] } as unknown as ApiRecord,
		userRole: 'reviewer'
	};
}

beforeEach(() => {
	vi.spyOn(recordsApi, 'getAnnotations').mockResolvedValue([]);
});

afterEach(() => {
	vi.restoreAllMocks();
	locale.set('es');
});

describe('LeftSidebar position', () => {
	it('formats the position and the total alike in English', async () => {
		locale.set('en');
		const screen = render(LeftSidebar, props(1786, 1786));
		await screen.getByRole('button', { name: en.col_tab_info }).click();
		await expect.element(screen.getByText('1,786 / 1,786')).toBeInTheDocument();
	});

	it('formats the position and the total alike in Spanish', async () => {
		locale.set('es');
		const screen = render(LeftSidebar, props(12345, 12345));
		await screen.getByRole('button', { name: es.col_tab_info }).click();
		await expect.element(screen.getByText('12.345 / 12.345')).toBeInTheDocument();
	});
});

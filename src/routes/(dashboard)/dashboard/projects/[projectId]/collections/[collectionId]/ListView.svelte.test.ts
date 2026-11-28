// The list keeps a local copy of its records for drag and drop and must
// follow the records prop when the page loads new ones.
//
// Version: 0.4.0
import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import type { Record as ApiRecord } from '$lib/api';
import ListView from './ListView.svelte';

function makeRecord(id: number, title: string): ApiRecord {
	return {
		id,
		title,
		status: 'in_review',
		capture_mode: 'single',
		images: [
			{
				id: id * 10,
				record_id: id,
				filename: 'img.jpg',
				file_path: '/img.jpg',
				format: 'jpg',
				is_current: true
			}
		]
	} as ApiRecord;
}

describe('ListView follows its records prop', () => {
	it('shows the records of a new prop value in place of the old ones', async () => {
		const screen = render(ListView, {
			records: [makeRecord(1, 'First record')],
			collectionId: 1,
			onRecordClick: vi.fn()
		});
		await expect.element(screen.getByText('First record')).toBeVisible();

		await screen.rerender({ records: [makeRecord(2, 'Second record')] });

		await expect.element(screen.getByText('Second record')).toBeVisible();
		await expect.element(screen.getByText('First record')).not.toBeInTheDocument();
	});
});

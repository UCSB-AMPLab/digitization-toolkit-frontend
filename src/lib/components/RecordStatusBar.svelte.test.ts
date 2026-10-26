// The legend's counts, with the thousands separator of each language.
//
// Version: 0.1.0-beta
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { en } from '$lib/i18n/en';
import RecordStatusBar from './RecordStatusBar.svelte';

function records(captured: number, approved: number): ApiRecord[] {
	const make = (status: ApiRecord['status'], n: number, from: number) =>
		Array.from({ length: n }, (_, i) => ({ id: from + i, status, images: [] }) as unknown as ApiRecord);
	return [...make('captured', captured, 1), ...make('approved', approved, captured + 1)];
}

afterEach(() => locale.set('es'));

describe('RecordStatusBar counts', () => {
	it('writes 1786 and 12.345 in Spanish', async () => {
		locale.set('es');
		render(RecordStatusBar, { records: records(1786, 10559) });
		await expect.element(page.getByText(`${es.status_captured_plural}: 1786 / 12.345`)).toBeInTheDocument();
		await expect.element(page.getByText(`${es.status_approved_plural}: 10.559 / 12.345`)).toBeInTheDocument();
	});

	it('writes 1,786 and 12,345 in English', async () => {
		locale.set('en');
		render(RecordStatusBar, { records: records(1786, 10559) });
		await expect.element(page.getByText(`${en.status_captured_plural}: 1,786 / 12,345`)).toBeInTheDocument();
	});
});

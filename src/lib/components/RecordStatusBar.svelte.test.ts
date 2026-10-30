// The legend's counts, with the thousands separator of each language.
//
// Version: 0.2.1
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { en } from '$lib/i18n/en';
import RecordStatusBar from './RecordStatusBar.svelte';

const make = (status: ApiRecord['status'], n: number, from: number) =>
	Array.from({ length: n }, (_, i) => ({ id: from + i, status, images: [] }) as unknown as ApiRecord);

function records(captured: number, approved: number, excluded = 0): ApiRecord[] {
	return [
		...make('captured', captured, 1),
		...make('approved', approved, captured + 1),
		...make('excluded', excluded, captured + approved + 1)
	];
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

// Excluded records (Fisqua contract 1.6) are not pages of the volume: they get
// their own count, and the other counts read against the volume without them.
describe('RecordStatusBar excluded count', () => {
	it('shows no excluded count when no record is excluded', async () => {
		locale.set('es');
		const screen = render(RecordStatusBar, { records: records(2, 3) });
		await expect.element(screen.getByText(/excluid/)).not.toBeInTheDocument();
	});

	it('writes "1 excluido" for one and "2 excluidos" for two, apart from the other counts', async () => {
		locale.set('es');
		const one = render(RecordStatusBar, { records: records(0, 3, 1) });
		await expect.element(one.getByText('1 excluido', { exact: true })).toBeInTheDocument();
		await expect.element(one.getByText(`${es.status_approved_plural}: 3 / 3`)).toBeInTheDocument();
		one.unmount();
		const two = render(RecordStatusBar, { records: records(1, 3, 2) });
		await expect.element(two.getByText('2 excluidos', { exact: true })).toBeInTheDocument();
		await expect.element(two.getByText(`${es.status_captured_plural}: 1 / 4`)).toBeInTheDocument();
	});

	it('writes the count with the thousands separator in English', async () => {
		locale.set('en');
		render(RecordStatusBar, { records: records(0, 1, 1234) });
		await expect.element(page.getByText('1,234 excluded', { exact: true })).toBeInTheDocument();
	});
});

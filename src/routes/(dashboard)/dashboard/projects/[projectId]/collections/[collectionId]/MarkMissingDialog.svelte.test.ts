// NEH-317: the mark dialog (Insert.dc.html). It names the record the
// opening goes after, asks how many openings are missing (not known, one,
// or more than one with a count from 2 to 50), what should be there and a
// note for the operator, and sends POST /collections/{id}/records/missing-opening.
//
// Version: 0.3.3
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import '../../../../../../../app.css';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, ApiError, type Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import MarkMissingDialog from './MarkMissingDialog.svelte';

const after = { id: 41, title: 'Registro 95', status: 'in_review', capture_mode: 'dual', sequence: 95, images: [] } as ApiRecord;

describe('MarkMissingDialog', () => {
	let onCancel: ReturnType<typeof vi.fn<() => void>>;
	let onMarked: ReturnType<typeof vi.fn<() => void>>;

	beforeEach(() => {
		locale.set('es');
		onCancel = vi.fn<() => void>();
		onMarked = vi.fn<() => void>();
	});
	afterEach(() => vi.restoreAllMocks());

	const mount = () => render(MarkMissingDialog, { collectionId: 17, afterRecord: after, n: 95, onCancel, onMarked });

	it('names the record, and asks how many, what should be there and a note', async () => {
		const screen = mount();
		const dialog = screen.getByRole('dialog', { name: es.mark_title });
		await expect.element(dialog.getByText(es.mark_body(95, null))).toBeVisible();
		const group = dialog.getByRole('group', { name: es.mark_count_legend });
		await expect.element(group).toBeVisible();
		await expect.element(group.getByRole('radio', { name: es.mark_count_unknown })).toBeChecked();
		await expect.element(group.getByRole('radio', { name: es.mark_count_one, exact: true })).toBeInTheDocument();
		await expect.element(group.getByRole('radio', { name: es.mark_count_more })).toBeInTheDocument();
		await expect.element(dialog.getByRole('textbox', { name: es.mark_expected })).toBeVisible();
		await expect.element(dialog.getByRole('textbox', { name: es.mark_note })).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: es.mark_cancel })).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: es.mark_submit })).toBeVisible();
	});

	it('sends a count of null when the number is not known, and nothing for empty fields', async () => {
		const spy = vi.spyOn(collectionsApi, 'markMissingOpenings').mockResolvedValue([]);
		const screen = mount();
		await screen.getByRole('button', { name: es.mark_submit }).click();
		await vi.waitFor(() => expect(onMarked).toHaveBeenCalled());
		expect(spy).toHaveBeenCalledWith(17, { afterRecordId: 41, count: null, expected: null, note: null });
	});

	it('sends one, with what should be there and the note', async () => {
		const spy = vi.spyOn(collectionsApi, 'markMissingOpenings').mockResolvedValue([]);
		const screen = mount();
		await screen.getByRole('radio', { name: es.mark_count_one, exact: true }).click();
		await screen.getByRole('textbox', { name: es.mark_expected }).fill('Folios 90v y 91r');
		await screen.getByRole('textbox', { name: es.mark_note }).fill('Ningún cuadro muestra el folio 91.');
		await screen.getByRole('button', { name: es.mark_submit }).click();
		await vi.waitFor(() => expect(onMarked).toHaveBeenCalled());
		expect(spy).toHaveBeenCalledWith(17, {
			afterRecordId: 41, count: 1, expected: 'Folios 90v y 91r', note: 'Ningún cuadro muestra el folio 91.'
		});
	});

	it('sends the count for more than one, from 2 to 50', async () => {
		const spy = vi.spyOn(collectionsApi, 'markMissingOpenings').mockResolvedValue([]);
		const screen = mount();
		await screen.getByRole('radio', { name: es.mark_count_more }).click();
		const number = screen.getByRole('spinbutton', { name: es.mark_count_number_aria });
		await expect.element(number).toHaveAttribute('min', '2');
		await expect.element(number).toHaveAttribute('max', '50');
		await expect.element(number).toHaveValue(2);
		await number.fill('3');
		await screen.getByRole('button', { name: es.mark_submit }).click();
		await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(17, { afterRecordId: 41, count: 3, expected: null, note: null }));
	});

	it('keeps the count within 2 and 50', async () => {
		const spy = vi.spyOn(collectionsApi, 'markMissingOpenings').mockResolvedValue([]);
		const screen = mount();
		await screen.getByRole('radio', { name: es.mark_count_more }).click();
		await screen.getByRole('spinbutton', { name: es.mark_count_number_aria }).fill('80');
		await screen.getByRole('button', { name: es.mark_submit }).click();
		await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(17, { afterRecordId: 41, count: 50, expected: null, note: null }));
	});

	it('shows an error in the dialog when the backend refuses', async () => {
		vi.spyOn(collectionsApi, 'markMissingOpenings').mockRejectedValue(new ApiError('x', 'x', 409));
		const screen = mount();
		await screen.getByRole('button', { name: es.mark_submit }).click();
		await expect.element(screen.getByRole('alert')).toHaveTextContent(es.mark_error);
		expect(onMarked).not.toHaveBeenCalled();
	});

	it('Cancel closes without sending', async () => {
		const spy = vi.spyOn(collectionsApi, 'markMissingOpenings');
		const screen = mount();
		await screen.getByRole('button', { name: es.mark_cancel }).click();
		expect(onCancel).toHaveBeenCalled();
		expect(spy).not.toHaveBeenCalled();
	});

	describe('focus (Copilot review of #159)', () => {
		let opener: HTMLButtonElement;
		beforeEach(() => {
			opener = document.createElement('button');
			opener.textContent = 'opener';
			document.body.appendChild(opener);
			opener.focus();
		});
		afterEach(() => opener.remove());

		it('moves the focus into the dialog, keeps Tab inside it, and gives it back on cancel', async () => {
			const screen = mount();
			const dialog = screen.getByRole('dialog');
			await expect.element(dialog).toBeVisible();
			await vi.waitFor(() => expect(dialog.element().contains(document.activeElement)).toBe(true));
			for (let i = 0; i < 15; i++) {
				await userEvent.keyboard('{Tab}');
				expect(dialog.element().contains(document.activeElement)).toBe(true);
			}
			for (let i = 0; i < 15; i++) {
				await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
				expect(dialog.element().contains(document.activeElement)).toBe(true);
			}
			await dialog.getByRole('button', { name: es.mark_cancel }).click();
			expect(onCancel).toHaveBeenCalled();
			screen.unmount();
			expect(document.activeElement).toBe(opener);
		});
	});
});

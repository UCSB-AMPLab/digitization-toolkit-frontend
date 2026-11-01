// NEH-317: the close dialog, for an opening or a page that is not there to
// capture. Four reasons, details, a note required for "Something else", the
// 409s of POST /records/{id}/close-missing shown in the dialog, and the
// closed record handed back on success.
//
// Version: 0.3.3
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { recordsApi, ApiError, type Record as ApiRecord } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import '../../app.css';
import CloseMissingDialog from './CloseMissingDialog.svelte';

const placeholder = {
	id: 96, title: 'Par 96', status: 'captured', capture_mode: 'dual', sequence: 96, images: [],
	missing_side: 'both', missing_note: 'El folio 91 parece no estar.'
} as ApiRecord;

describe('CloseMissingDialog', () => {
	let onCancel: ReturnType<typeof vi.fn<() => void>>;
	let onClosed: ReturnType<typeof vi.fn<(r: ApiRecord) => void>>;

	beforeEach(() => {
		locale.set('es');
		onCancel = vi.fn<() => void>();
		onClosed = vi.fn<(r: ApiRecord) => void>();
	});
	afterEach(() => vi.restoreAllMocks());

	const mount = () => render(CloseMissingDialog, { record: placeholder, onCancel, onClosed });

	it('asks what was found, with the four reasons, details and what closing does', async () => {
		const screen = mount();
		const dialog = screen.getByRole('dialog', { name: es.close_title });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog.getByText(es.close_body(null))).toBeVisible();
		await expect.element(dialog.getByRole('group', { name: es.close_legend })).toBeVisible();
		for (const label of [es.close_reason_skip, es.close_reason_leaf_missing, es.close_reason_elsewhere, es.close_reason_other]) {
			await expect.element(dialog.getByRole('radio', { name: label })).toBeInTheDocument();
		}
		await expect.element(dialog.getByRole('textbox', { name: es.close_details })).toBeVisible();
		await expect.element(dialog.getByText(es.close_after_note)).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: es.close_back })).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: es.close_submit })).toBeVisible();
	});

	it('closes with the chosen reason and the details, and hands back the closed record', async () => {
		const closed = { ...placeholder, closed_reason: 'leaf_missing_from_volume', closed_note: 'Hay un talón.' } as ApiRecord;
		const spy = vi.spyOn(recordsApi, 'closeMissing').mockResolvedValue(closed);
		const screen = mount();
		await screen.getByRole('radio', { name: es.close_reason_leaf_missing }).click();
		await screen.getByRole('textbox', { name: es.close_details }).fill('Hay un talón.');
		await screen.getByRole('button', { name: es.close_submit }).click();
		await vi.waitFor(() => expect(onClosed).toHaveBeenCalledWith(closed));
		expect(spy).toHaveBeenCalledWith(96, { reason: 'leaf_missing_from_volume', note: 'Hay un talón.' });
	});

	it('sends no note when the details are empty', async () => {
		const spy = vi.spyOn(recordsApi, 'closeMissing').mockResolvedValue({ ...placeholder, closed_reason: 'foliation_skip' } as ApiRecord);
		const screen = mount();
		await screen.getByRole('radio', { name: es.close_reason_skip }).click();
		await screen.getByRole('button', { name: es.close_submit }).click();
		await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(96, { reason: 'foliation_skip', note: null }));
	});

	it('requires the details for Something else, and sends nothing without them', async () => {
		const spy = vi.spyOn(recordsApi, 'closeMissing');
		const screen = mount();
		await screen.getByRole('radio', { name: es.close_reason_other }).click();
		await screen.getByRole('button', { name: es.close_submit }).click();
		await expect.element(screen.getByText(es.close_note_required)).toBeVisible();
		expect(spy).not.toHaveBeenCalled();
		expect(onClosed).not.toHaveBeenCalled();
	});

	for (const [code, text] of [
		['not_missing', es.close_err_not_missing],
		['already_closed', es.close_err_already_closed]
	] as const) {
		it(`shows the 409 ${code} in the dialog`, async () => {
			vi.spyOn(recordsApi, 'closeMissing').mockRejectedValue(new ApiError('x', { code, message: 'x' }, 409));
			const screen = mount();
			await screen.getByRole('radio', { name: es.close_reason_skip }).click();
			await screen.getByRole('button', { name: es.close_submit }).click();
			await expect.element(screen.getByRole('alert')).toHaveTextContent(text);
			expect(onClosed).not.toHaveBeenCalled();
		});
	}

	it('says the opening could not be closed on any other failure', async () => {
		vi.spyOn(recordsApi, 'closeMissing').mockRejectedValue(new ApiError('boom', 'boom', 500));
		const screen = mount();
		await screen.getByRole('radio', { name: es.close_reason_skip }).click();
		await screen.getByRole('button', { name: es.close_submit }).click();
		await expect.element(screen.getByRole('alert')).toHaveTextContent(es.close_err_failed);
	});

	it('Back to capture cancels', async () => {
		const screen = mount();
		await screen.getByRole('button', { name: es.close_back }).click();
		expect(onCancel).toHaveBeenCalled();
	});

	describe('for a missing page (one side)', () => {
		const page = { ...placeholder, id: 99, missing_side: 'left' } as ApiRecord;
		const mountPage = () => render(CloseMissingDialog, { record: page, onCancel, onClosed });

		it('speaks of a page: title, body, the elsewhere reason, what closing does and the button', async () => {
			const screen = mountPage();
			const dialog = screen.getByRole('dialog', { name: es.close_page_title });
			await expect.element(dialog).toBeVisible();
			await expect.element(dialog.getByText(es.close_page_body)).toBeVisible();
			await expect.element(dialog.getByRole('radio', { name: es.close_page_reason_elsewhere })).toBeInTheDocument();
			await expect.element(dialog.getByText(es.close_page_after_note)).toBeVisible();
			await expect.element(dialog.getByRole('button', { name: es.close_page_submit })).toBeVisible();
			await expect.element(dialog.getByText(es.close_title)).not.toBeInTheDocument();
			await expect.element(dialog.getByText(es.close_after_note)).not.toBeInTheDocument();
			await expect.element(dialog.getByRole('radio', { name: es.close_reason_elsewhere })).not.toBeInTheDocument();
		});

		it('sends the same reason codes', async () => {
			const spy = vi.spyOn(recordsApi, 'closeMissing').mockResolvedValue({ ...page, closed_reason: 'captured_elsewhere' } as ApiRecord);
			const screen = mountPage();
			await screen.getByRole('radio', { name: es.close_page_reason_elsewhere }).click();
			await screen.getByRole('button', { name: es.close_page_submit }).click();
			await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(99, { reason: 'captured_elsewhere', note: null }));
		});

		it('says the page was already closed, or could not be closed', async () => {
			const spy = vi.spyOn(recordsApi, 'closeMissing').mockRejectedValueOnce(new ApiError('x', { code: 'already_closed', message: 'x' }, 409));
			const screen = mountPage();
			await screen.getByRole('button', { name: es.close_page_submit }).click();
			await expect.element(screen.getByRole('alert')).toHaveTextContent(es.close_page_err_already_closed);
			spy.mockRejectedValueOnce(new ApiError('boom', 'boom', 500));
			await screen.getByRole('button', { name: es.close_page_submit }).click();
			await expect.element(screen.getByRole('alert')).toHaveTextContent(es.close_page_err_failed);
		});
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
			await dialog.getByRole('button', { name: es.close_back }).click();
			expect(onCancel).toHaveBeenCalled();
			screen.unmount();
			expect(document.activeElement).toBe(opener);
		});
	});
});

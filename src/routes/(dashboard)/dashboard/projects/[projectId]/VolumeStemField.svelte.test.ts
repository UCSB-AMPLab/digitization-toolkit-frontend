// The volume form's "Raíz" field: validation as the operator types, and the
// read-only state with its reason once the stem is reserved.
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { es } from '$lib/i18n/es';
import VolumeStemField from './VolumeStemField.svelte';

describe('VolumeStemField', () => {
	it('shows the help line and no error on an empty new volume', async () => {
		render(VolumeStemField, { value: '', required: true });
		await expect.element(page.getByText(es.pd_stem_help)).toBeInTheDocument();
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('reports a bad stem as it is typed, and clears the error once it is fixed', async () => {
		render(VolumeStemField, { value: '', required: true });
		const input = page.getByRole('textbox');
		await userEvent.type(input, 'Co-AHR');
		await expect.element(page.getByRole('alert')).toHaveTextContent(es.pd_val_stem_pattern);
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');

		await userEvent.clear(input);
		await userEvent.type(input, 'co-ahr-con-t055');
		expect(page.getByRole('alert').elements()).toHaveLength(0);
		await expect.element(input).toHaveAttribute('aria-invalid', 'false');
	});

	it('reports a stem longer than 27 characters', async () => {
		render(VolumeStemField, { value: '', required: true });
		await userEvent.type(page.getByRole('textbox'), 'a'.repeat(28));
		await expect.element(page.getByRole('alert')).toHaveTextContent(es.pd_val_stem_too_long(27));
	});

	it('reports a required stem once the operator has typed and cleared it', async () => {
		render(VolumeStemField, { value: '', required: true });
		const input = page.getByRole('textbox');
		await userEvent.type(input, 'a');
		await userEvent.clear(input);
		await expect.element(page.getByRole('alert')).toHaveTextContent(es.pd_val_stem_required);
	});

	it('does not require a stem on an existing volume', async () => {
		render(VolumeStemField, { value: '', required: false });
		const input = page.getByRole('textbox');
		await userEvent.type(input, 'a');
		await userEvent.clear(input);
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('is read-only, with the reason, when the stem is reserved', async () => {
		render(VolumeStemField, { value: 'co-ahr-jud-t221', locked: true });
		const input = page.getByRole('textbox');
		await expect.element(input).toHaveAttribute('readonly');
		await expect.element(input).toHaveValue('co-ahr-jud-t221');
		await expect.element(page.getByText(es.pd_stem_locked)).toBeInTheDocument();
		expect(page.getByText(es.pd_stem_help).elements()).toHaveLength(0);

		await userEvent.type(input, 'x');
		await expect.element(input).toHaveValue('co-ahr-jud-t221');
	});
});

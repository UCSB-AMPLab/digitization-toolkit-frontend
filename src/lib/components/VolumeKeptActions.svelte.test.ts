// NEH-320: the admin's keep and release actions on the volume page, beside
// the free and restore actions. POST /keep-on-unit and /release-from-unit
// are mocked.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, collectionsApi, type VolumeOffsiteState } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import VolumeKeptActions from './VolumeKeptActions.svelte';

function state(over: Partial<VolumeOffsiteState> = {}): VolumeOffsiteState {
	return {
		collection_id: 7,
		filename_stem: 'co-x',
		uploadable: true,
		total: 10,
		verified: 0,
		pending: 10,
		refused: 0,
		last_verified_at: null,
		received: false,
		refusals: [],
		kept_on_unit: false,
		...over
	};
}

const kept = () => state({ kept_on_unit: true, pending: 0 });
const button = (name: string) => page.getByRole('button', { name, exact: true });

beforeEach(() => locale.set('es'));
afterEach(() => vi.restoreAllMocks());

describe('VolumeKeptActions', () => {
	it('shows an admin the release of a kept volume, and releases it on confirmation', async () => {
		const release = vi.spyOn(collectionsApi, 'releaseFromUnit').mockResolvedValue(state() as never);
		const onChanged = vi.fn();
		render(VolumeKeptActions, { collectionId: 7, offsite: kept(), isAdmin: true, mode: 'fisqua', onChanged });
		await userEvent.click(button(es.kept_release_action));
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.kept_release_body)).toBeInTheDocument();
		await expect.element(dialog.getByText(es.kept_release_inside)).toBeInTheDocument();
		await userEvent.click(dialog.getByRole('button', { name: es.kept_release_action }));
		await vi.waitFor(() => expect(release).toHaveBeenCalledWith(7));
		await vi.waitFor(() => expect(onChanged).toHaveBeenCalledWith(7));
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('shows no release while the mode is not known', async () => {
		const screen = render(VolumeKeptActions, { collectionId: 7, offsite: kept(), isAdmin: true, onChanged: vi.fn() });
		expect(screen.container.querySelectorAll('button')).toHaveLength(0);
	});

	it('shows no release in Scanner only mode, and the keep there', async () => {
		const screen = render(VolumeKeptActions, {
			collectionId: 7, offsite: kept(), isAdmin: true, mode: 'offline', onChanged: vi.fn()
		});
		expect(screen.container.querySelectorAll('button')).toHaveLength(0);
		screen.unmount();
		render(VolumeKeptActions, { collectionId: 7, offsite: state(), isAdmin: true, mode: 'offline', onChanged: vi.fn() });
		await expect.element(button(es.kept_keep_action)).toBeInTheDocument();
	});

	it('shows nothing to anyone but an admin', async () => {
		const screen = render(VolumeKeptActions, { collectionId: 7, offsite: kept(), isAdmin: false, onChanged: vi.fn() });
		expect(screen.container.querySelectorAll('button')).toHaveLength(0);
		screen.unmount();
		const other = render(VolumeKeptActions, { collectionId: 7, offsite: state(), isAdmin: false, onChanged: vi.fn() });
		expect(other.container.querySelectorAll('button')).toHaveLength(0);
	});

	it('offers an admin to keep a volume not kept, and does nothing on Cancelar', async () => {
		const keep = vi.spyOn(collectionsApi, 'keepOnUnit');
		render(VolumeKeptActions, { collectionId: 7, offsite: state(), isAdmin: true, onChanged: vi.fn() });
		expect(page.getByRole('button', { name: es.kept_release_action }).elements()).toHaveLength(0);
		await userEvent.click(button(es.kept_keep_action));
		await expect.element(page.getByRole('dialog').getByText(es.kept_keep_body)).toBeInTheDocument();
		await expect.element(page.getByRole('dialog').getByText(es.kept_keep_inside)).toBeInTheDocument();
		await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.common_cancel }));
		expect(keep).not.toHaveBeenCalled();
	});

	it("shows Fisqua's refusal of a release, translated", async () => {
		vi.spyOn(collectionsApi, 'releaseFromUnit').mockRejectedValue(
			new ApiError('x', { code: 'unknown_reference_code', message: 'English', referenceCode: 'co-x' }, 422)
		);
		const onChanged = vi.fn();
		const screen = render(VolumeKeptActions, { collectionId: 7, offsite: kept(), isAdmin: true, mode: 'fisqua', onChanged });
		await userEvent.click(button(es.kept_release_action));
		await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.kept_release_action }));
		await expect.element(page.getByRole('alert')).toHaveTextContent(es.pd_err_unknown_reference_code('co-x'));
		expect(onChanged).not.toHaveBeenCalled();
		expect(document.body.textContent).not.toContain('English');
		screen.unmount();
	});

	it('shows the 409 of a keep, translated', async () => {
		vi.spyOn(collectionsApi, 'keepOnUnit').mockRejectedValue(
			new ApiError('x', { code: 'already_left_unit', message: 'English' }, 409)
		);
		render(VolumeKeptActions, { collectionId: 7, offsite: state(), isAdmin: true, onChanged: vi.fn() });
		await userEvent.click(button(es.kept_keep_action));
		await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.kept_keep_action }));
		await expect.element(page.getByRole('alert')).toHaveTextContent(es.kept_err_already_left);
	});
});

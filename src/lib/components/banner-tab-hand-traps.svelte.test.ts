// NEH-186: the banner's Reload stays in the Tab order of every focus trap,
// whatever the dialog's own controls are, none included: the two dialogs
// that keep Tab in by hand (HandoverControls, VolumeOffsiteActions) and
// trapFocus (lib/dialog.ts) around a dialog with no enabled control.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { createRawSnippet } from 'svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { collectionsApi, type Record as ApiRecord, type VolumeOffsiteState } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { unitNotAnswering } from '$lib/unit-watch';
import { trapFocus } from '$lib/dialog';
import UnitNotAnswering from './UnitNotAnswering.svelte';
import HandoverControls from './HandoverControls.svelte';
import VolumeOffsiteActions from './VolumeOffsiteActions.svelte';
import Host from '$lib/test-support/SnippetHost.svelte';

let onReload: ReturnType<typeof vi.fn<() => void>>;

beforeEach(async () => {
	locale.set('es');
	onReload = vi.fn<() => void>();
	unitNotAnswering.set(true);
	render(UnitNotAnswering, { props: { onReload } });
	await expect
		.element(page.getByRole('button', { name: es.unit_not_answering_reload }))
		.toBeVisible();
});
afterEach(() => {
	unitNotAnswering.set(false);
	vi.restoreAllMocks();
});

const reload = () => page.getByRole('button', { name: es.unit_not_answering_reload }).element();

async function tabUntilReload(limit = 8) {
	for (let i = 0; i < limit && document.activeElement !== reload(); i++)
		await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(reload());
	await userEvent.keyboard('{Enter}');
	expect(onReload).toHaveBeenCalledTimes(1);
}

describe('the banner and the hand-built focus traps', () => {
	it('HandoverControls: with the send in flight and both buttons disabled, Tab reaches Reload', async () => {
		vi.spyOn(collectionsApi, 'promote').mockImplementation(() => new Promise(() => {}));
		const records = [
			{ id: 1, title: 'R1', status: 'captured', capture_mode: 'single', images: [] }
		];
		const screen = render(HandoverControls, {
			records: records as unknown as ApiRecord[],
			collectionId: 7,
			onChanged: vi.fn(async () => true)
		});
		await screen.getByRole('button', { name: 'Enviar a revisión' }).click();
		const dialog = screen.getByRole('dialog');
		await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
		await expect
			.element(dialog.getByRole('button', { name: 'Enviar', exact: true }))
			.toBeDisabled();
		await expect.element(dialog.getByRole('button', { name: es.common_cancel })).toBeDisabled();
		await tabUntilReload();
		// From Reload, Tab stays in the dialog's cycle, on the card.
		await userEvent.keyboard('{Tab}');
		expect(
			dialog.element().contains(document.activeElement) || document.activeElement === reload()
		).toBe(true);
	});

	it('VolumeOffsiteActions: with the dialog open, Tab reaches Reload', async () => {
		const offsite: VolumeOffsiteState = {
			collection_id: 7,
			filename_stem: 'co-x',
			uploadable: true,
			total: 10,
			verified: 10,
			pending: 0,
			refused: 0,
			last_verified_at: null,
			received: true,
			refusals: [],
			freed_files: 0,
			freed_bytes: 0
		};
		const screen = render(VolumeOffsiteActions, {
			collectionId: 7,
			offsite,
			canRestore: true,
			onChanged: vi.fn()
		});
		await screen.getByRole('button', { name: 'Espacio en la tarjeta' }).click();
		await expect.element(screen.getByRole('dialog')).toBeVisible();
		await tabUntilReload();
	});

	it('trapFocus: around a dialog with no enabled control, Tab reaches Reload', async () => {
		const Card = createRawSnippet(() => ({
			render: () =>
				'<div role="dialog" aria-modal="true" tabindex="-1" data-card><button disabled>Wait</button></div>',
			setup: (node) => {
				const action = trapFocus(node as HTMLElement);
				return () => action.destroy();
			}
		}));
		render(Host, { snippet: Card });
		await expect.poll(() => document.querySelector('[data-card]')).not.toBeNull();
		await tabUntilReload();
		await userEvent.keyboard('{Tab}');
		const card = document.querySelector('[data-card]')!;
		expect(document.activeElement === card || document.activeElement === reload()).toBe(true);
	});
});

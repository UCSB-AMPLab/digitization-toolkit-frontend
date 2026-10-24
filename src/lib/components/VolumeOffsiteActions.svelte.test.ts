// NEH-248: the admin's free and restore actions for a volume — which are
// offered, the dry run before a free, the confirmations, the polling of the
// job, and what is reported.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, ApiError, type FreePlan, type OffsiteJobStatus, type VolumeOffsiteState } from '$lib/api';
import VolumeOffsiteActions from './VolumeOffsiteActions.svelte';

function state(over: Partial<VolumeOffsiteState> = {}): VolumeOffsiteState {
	return {
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
		freed_bytes: 0,
		...over
	};
}

const plan: FreePlan = {
	collection_id: 7,
	filename_stem: 'co-x',
	would_free: { files: 9, bytes: 270_000_000 },
	files: [],
	refused: [{ image_id: 4, kind: 'preview', path: '/p', key: 'k', reason: 'no_preview_digest' }],
	local_sha1_checked: false
};

const job = (over: Partial<OffsiteJobStatus>): OffsiteJobStatus => ({
	job_id: 'j1',
	collection_id: 7,
	action: 'free',
	state: 'running',
	result: null,
	error: null,
	...over
});

describe('VolumeOffsiteActions', () => {
	let planSpy: ReturnType<typeof vi.spyOn>;
	let freeSpy: ReturnType<typeof vi.spyOn>;
	let restoreSpy: ReturnType<typeof vi.spyOn>;
	let jobSpy: ReturnType<typeof vi.spyOn>;
	let onChanged: ReturnType<typeof vi.fn<(collectionId: number) => void>>;

	beforeEach(() => {
		planSpy = vi.spyOn(collectionsApi, 'planFree');
		freeSpy = vi.spyOn(collectionsApi, 'startFree');
		restoreSpy = vi.spyOn(collectionsApi, 'startRestore');
		jobSpy = vi.spyOn(collectionsApi, 'getOffsiteJob');
		onChanged = vi.fn<(collectionId: number) => void>();
	});
	afterEach(() => {
		planSpy.mockRestore();
		freeSpy.mockRestore();
		restoreSpy.mockRestore();
		jobSpy.mockRestore();
	});

	const mount = (offsite: VolumeOffsiteState) => render(VolumeOffsiteActions, { collectionId: 7, offsite, onChanged });
	const openMenu = async (screen: ReturnType<typeof mount>) =>
		screen.getByRole('button', { name: 'Espacio en la tarjeta' }).click();

	it('shows no button when there is nothing to free or restore', async () => {
		const screen = mount(state({ verified: 6, pending: 4, received: false }));
		await expect.element(screen.getByRole('button', { name: 'Espacio en la tarjeta' })).not.toBeInTheDocument();
	});

	it('offers freeing a received volume, and restoring only once files are freed', async () => {
		const screen = mount(state());
		await openMenu(screen);
		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByRole('button', { name: 'Liberar espacio en la tarjeta' })).toBeVisible();
		await expect.element(dialog.getByRole('button', { name: 'Restaurar en la tarjeta' })).not.toBeInTheDocument();
	});

	it('free: shows the dry run first, frees nothing until confirmed, then polls and reports', async () => {
		planSpy.mockResolvedValue(plan);
		freeSpy.mockResolvedValue({ job_id: 'j1', state: 'queued', action: 'free', status_url: '/collections/7/offsite/jobs/j1' });
		jobSpy.mockResolvedValue(
			job({
				state: 'done',
				result: {
					collection_id: 7,
					filename_stem: 'co-x',
					freed: { files: 9, bytes: 270_000_000 },
					files: [],
					refused: [],
					manifest: null
				}
			})
		);
		const screen = mount(state());
		await openMenu(screen);
		await screen.getByRole('button', { name: 'Liberar espacio en la tarjeta' }).click();

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('¿Liberar espacio en la tarjeta?')).toBeVisible();
		await expect.element(dialog.getByText('Captua quitará 9 archivos (270 MB) de la tarjeta.', { exact: false })).toBeVisible();
		await expect.element(dialog.getByText('Captua dejará 1 archivo en la tarjeta:')).toBeVisible();
		await expect.element(dialog.getByText('1 vista previa todavía no tiene checksum SHA-256 registrado', { exact: false })).toBeVisible();
		expect(planSpy).toHaveBeenCalledWith(7);
		expect(freeSpy).not.toHaveBeenCalled();

		await dialog.getByRole('button', { name: 'Liberar espacio', exact: true }).click();
		expect(freeSpy).toHaveBeenCalledWith(7);
		await expect.element(dialog.getByText('Captua terminó de liberar espacio'), { timeout: 6000 }).toBeVisible();
		await expect.element(dialog.getByText('Captua quitó 9 archivos (270 MB) de la tarjeta.')).toBeVisible();
		expect(jobSpy).toHaveBeenCalledWith(7, 'j1');
		expect(onChanged).toHaveBeenCalledWith(7);
	});

	it('free: says so when the dry run finds nothing to free, with no confirm button', async () => {
		planSpy.mockResolvedValue({ ...plan, would_free: { files: 0, bytes: 0 } });
		const screen = mount(state());
		await openMenu(screen);
		await screen.getByRole('button', { name: 'Liberar espacio en la tarjeta' }).click();
		await expect.element(screen.getByText('Captua no encontró archivos que se puedan liberar en este volumen.')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Liberar espacio', exact: true })).not.toBeInTheDocument();
	});

	it('free: maps a refused dry run to its plain message', async () => {
		const text =
			'Not every file of this volume is verified in the offsite bucket yet, so its files cannot be freed from the card. Wait for the upload to finish.';
		planSpy.mockRejectedValue(new ApiError(text, { message: text }, 409));
		const screen = mount(state());
		await openMenu(screen);
		await screen.getByRole('button', { name: 'Liberar espacio en la tarjeta' }).click();
		await expect.element(screen.getByRole('alert')).toHaveTextContent(
			'Todavía hay archivos de este volumen sin verificar en la copia externa.'
		);
		expect(screen.container.ownerDocument.body.textContent).not.toContain('offsite bucket');
	});

	it('restore: confirms with the freed count and bytes, polls, and reports what it could not restore', async () => {
		restoreSpy.mockResolvedValue({ job_id: 'j2', state: 'queued', action: 'restore', status_url: '/collections/7/offsite/jobs/j2' });
		jobSpy.mockResolvedValue(
			job({
				job_id: 'j2',
				action: 'restore',
				state: 'done',
				result: {
					collection_id: 7,
					filename_stem: 'co-x',
					restored: { files: 3, bytes: 90_000_000 },
					files: [],
					refused: [{ image_id: 2, kind: 'capture', path: '/p', key: 'k', reason: 'copy_failed' }],
					manifest: null
				}
			})
		);
		const screen = mount(state({ freed_files: 4, freed_bytes: 120_000_000 }));
		await openMenu(screen);
		await screen.getByRole('button', { name: 'Restaurar en la tarjeta' }).click();

		const dialog = screen.getByRole('dialog');
		await expect.element(dialog.getByText('los 4 archivos liberados (120 MB)', { exact: false })).toBeVisible();
		expect(restoreSpy).not.toHaveBeenCalled();
		await dialog.getByRole('button', { name: 'Restaurar', exact: true }).click();
		await expect.element(dialog.getByText('Captua terminó de restaurar el volumen'), { timeout: 6000 }).toBeVisible();
		await expect.element(dialog.getByText('Captua restauró 3 archivos (90 MB) en la tarjeta.')).toBeVisible();
		await expect.element(dialog.getByText('Captua no pudo traer 1 archivo de la copia externa.')).toBeVisible();
		expect(jobSpy).toHaveBeenCalledWith(7, 'j2');
	});

	it('restore: maps the 409 of a unit with no read access', async () => {
		const text =
			'Restore is not set up on this unit: it needs read access to the offsite bucket (DTK_OFFSITE_READ_REMOTE), and none is configured.';
		restoreSpy.mockRejectedValue(new ApiError(text, { message: text }, 409));
		const screen = mount(state({ freed_files: 4, freed_bytes: 120_000_000 }));
		await openMenu(screen);
		await screen.getByRole('button', { name: 'Restaurar en la tarjeta' }).click();
		await screen.getByRole('button', { name: 'Restaurar', exact: true }).click();
		await expect.element(screen.getByRole('alert')).toHaveTextContent(
			'Este equipo no está configurado para restaurar: necesita acceso de lectura a la copia externa. Pide a quien instaló el equipo que lo configure.'
		);
	});

	const runningRestore = async () => {
		restoreSpy.mockResolvedValue({ job_id: 'j3', state: 'queued', action: 'restore', status_url: '/collections/7/offsite/jobs/j3' });
		jobSpy.mockResolvedValue(job({ job_id: 'j3', action: 'restore', state: 'running' }));
		const screen = mount(state({ freed_files: 4, freed_bytes: 120_000_000 }));
		await openMenu(screen);
		await screen.getByRole('button', { name: 'Restaurar en la tarjeta' }).click();
		await screen.getByRole('button', { name: 'Restaurar', exact: true }).click();
		await expect.poll(() => jobSpy.mock.calls.length, { timeout: 6000 }).toBeGreaterThan(0);
		return screen;
	};
	const settle = () => new Promise((r) => setTimeout(r, 2500));

	it('closing the dialog while a job runs stops polling, and says which volume changed', async () => {
		const screen = await runningRestore();
		await screen.getByRole('button', { name: 'Cerrar' }).click();
		const calls = jobSpy.mock.calls.length;
		await settle();
		expect(jobSpy.mock.calls.length).toBe(calls);
		expect(onChanged).toHaveBeenCalledWith(7);
	});

	it('moving to another volume destroys the component and stops its polling', async () => {
		const screen = await runningRestore();
		screen.unmount();
		const calls = jobSpy.mock.calls.length;
		await settle();
		expect(jobSpy.mock.calls.length).toBe(calls);
		for (const [id] of onChanged.mock.calls) expect(id).toBe(7);
	});
});


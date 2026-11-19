// NEH-352: every pop-up joins the registry in $lib/dialog while it is open,
// so that the capture key and the focus check see it. Each case opens one
// pop-up and reads the registry; Escape and the backdrop keep doing what they
// did before the pop-up was registered.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/dashboard') }) };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, projectsApi, usersApi, type Record as ApiRecord, type VolumeOffsiteState } from '$lib/api';
import { openDialogCount } from '$lib/dialog';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { tour } from '$lib/tour';
import BugReportPanel from '$lib/bug-report/BugReportPanel.svelte';
import HandoverControls from '$lib/components/HandoverControls.svelte';
import VolumeOffsiteActions from '$lib/components/VolumeOffsiteActions.svelte';
import GuidedTour from '$lib/components/GuidedTour.svelte';
import LoginPage from '../routes/(auth)/login/+page.svelte';
import ProjectsPage from '../routes/(dashboard)/dashboard/projects/+page.svelte';
import UsersPage from '../routes/(dashboard)/dashboard/users/+page.svelte';
import VolumeFormModal from '../routes/(dashboard)/dashboard/projects/[projectId]/VolumeFormModal.svelte';

const settle = async () => {
	for (let i = 0; i < 4; i++) {
		await tick();
		await new Promise((r) => setTimeout(r, 15));
	}
};

function pressEscape() {
	const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
	document.body.dispatchEvent(event);
	return event;
}

const dialogEl = () => document.querySelector<HTMLElement>('[role="dialog"]');

beforeEach(() => {
	locale.set('en');
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	tour.stop();
});

describe('pop-ups register as dialogs while open', () => {
	it('the bug report panel: registered, closes on Escape and on its backdrop', async () => {
		const onClose = vi.fn();
		const screen = render(BugReportPanel, { onClose });
		await settle();
		expect(openDialogCount()).toBe(1);

		pressEscape();
		expect(onClose).toHaveBeenCalledTimes(1);

		(document.querySelector('.bug-backdrop') as HTMLElement).click();
		expect(onClose).toHaveBeenCalledTimes(2);

		(dialogEl() as HTMLElement).click();
		expect(onClose).toHaveBeenCalledTimes(2);

		screen.unmount();
		expect(openDialogCount()).toBe(0);
	});

	it('the handover dialog: registered while open, gone once closed', async () => {
		const records = [{ id: 1, title: 'Folio 1', status: 'captured', capture_mode: 'single', images: [] }] as unknown as ApiRecord[];
		const promote = vi.spyOn(collectionsApi, 'promote');
		const screen = render(HandoverControls, { records, collectionId: 7, onChanged: async () => true });
		expect(openDialogCount()).toBe(0);
		await screen.getByRole('button', { name: en.col_handover_send }).click();
		expect(openDialogCount()).toBe(1);

		const event = pressEscape();
		expect(event.defaultPrevented).toBe(true);
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(openDialogCount()).toBe(0);
		expect(promote).not.toHaveBeenCalled();
	});

	it('the offsite dialog: registered while open, closes on Escape and on its backdrop', async () => {
		const offsite: VolumeOffsiteState = {
			collection_id: 7, filename_stem: 'co-x', uploadable: true, total: 10, verified: 10, pending: 0,
			refused: 0, last_verified_at: null, received: true, refusals: [], freed_files: 0, freed_bytes: 0
		};
		const screen = render(VolumeOffsiteActions, { collectionId: 7, offsite, onChanged: () => {} });
		expect(openDialogCount()).toBe(0);
		await screen.getByRole('button', { name: en.offsite_manage_open }).click();
		expect(openDialogCount()).toBe(1);

		pressEscape();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(openDialogCount()).toBe(0);

		await screen.getByRole('button', { name: en.offsite_manage_open }).click();
		expect(openDialogCount()).toBe(1);
		(document.querySelector('.offsite-dialog-backdrop') as HTMLElement).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(openDialogCount()).toBe(0);
	});

	it('the volume form: registered, closes on its backdrop, ignores Escape', async () => {
		const onClose = vi.fn();
		render(VolumeFormModal, { editing: null, projectId: 2, projectName: 'P', onClose, onSaved: () => {} });
		await settle();
		expect(openDialogCount()).toBe(1);

		const event = pressEscape();
		expect(event.defaultPrevented).toBe(false);
		expect(onClose).not.toHaveBeenCalled();

		(document.querySelector('.modal-backdrop') as HTMLElement).click();
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('the login page forgot-password popup: registered, closes on Escape', async () => {
		const screen = render(LoginPage);
		await screen.getByRole('button', { name: en.login_forgot_link }).click();
		expect(openDialogCount()).toBe(1);

		pressEscape();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(openDialogCount()).toBe(0);

		await screen.getByRole('button', { name: en.login_forgot_link }).click();
		(document.querySelector('.popup-backdrop') as HTMLElement).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(openDialogCount()).toBe(0);
	});

	it('the projects page create form: registered, closes on its backdrop, ignores Escape', async () => {
		vi.spyOn(projectsApi, 'list').mockResolvedValue([]);
		const screen = render(ProjectsPage);
		await screen.getByRole('button', { name: en.proj_create_first }).click();
		expect(openDialogCount()).toBe(1);

		const event = pressEscape();
		expect(event.defaultPrevented).toBe(false);
		expect(openDialogCount()).toBe(1);

		(document.querySelector('.modal-backdrop') as HTMLElement).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(openDialogCount()).toBe(0);
	});

	it('the users page user form: registered, closes on its backdrop, ignores Escape', async () => {
		vi.spyOn(usersApi, 'list').mockResolvedValue([]);
		const screen = render(UsersPage);
		await screen.getByRole('button', { name: en.users_new }).click();
		expect(openDialogCount()).toBe(1);

		const event = pressEscape();
		expect(event.defaultPrevented).toBe(false);
		expect(openDialogCount()).toBe(1);

		(document.querySelector('.modal-backdrop') as HTMLElement).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		expect(openDialogCount()).toBe(0);
	});

	it('the guided tour: never counted as a dialog, Escape stops it once', async () => {
		tour.start();
		render(GuidedTour);
		await settle();
		expect(openDialogCount()).toBe(0);

		const stop = vi.spyOn(tour, 'stop');
		pressEscape();
		await settle();
		expect(stop).toHaveBeenCalledTimes(1);
		expect(openDialogCount()).toBe(0);
	});
});

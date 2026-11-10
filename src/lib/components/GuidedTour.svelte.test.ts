// The guided tour's box (NEH-318): the counter and the step shown follow the
// unit's mode, so that dropping the project step leaves "1 / 5", not a
// count of six with a step the operator cannot do.
//
// Version: 0.3.3
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

const pageUrl = vi.hoisted(() => ({ href: 'http://localhost/dashboard' }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ get url() { return new URL(pageUrl.href); } }) };
});

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { userEvent } from 'vitest/browser';
import { collectionsApi, systemApi, type VolumeOffsiteState } from '$lib/api';
import VolumeOffsiteIndicator from './VolumeOffsiteIndicator.svelte';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { get } from 'svelte/store';
import { tour } from '$lib/tour';
import { unitState, type UnitState } from '$lib/unit-mode';
import { authStore, type UserRole } from '$lib/stores/auth';
import GuidedTour from './GuidedTour.svelte';

function state(over: Partial<UnitState> = {}): UnitState {
	return {
		mode: 'offline',
		projectsEnabled: false,
		projectsShown: false,
		defaultProjectId: null,
		prerequisites: { backup: [], fisqua: [] },
		keptVolumes: [],
		...over
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	pageUrl.href = 'http://localhost/dashboard';
	tour.stop();
	unitState.set(null);
	authStore.clearSession();
});

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

describe('GuidedTour', () => {
	it('shows the six steps while projects are shown', async () => {
		locale.set('es');
		unitState.set(state({ projectsEnabled: true, projectsShown: true }));
		tour.start();
		render(GuidedTour);
		await expect.element(page.getByRole('heading', { name: es.tour_s1_title })).toBeInTheDocument();
		await expect.element(page.getByText('1 / 6')).toBeInTheDocument();
	});

	it('starts at the volume and counts five while projects are hidden', async () => {
		locale.set('es');
		unitState.set(state());
		tour.start();
		render(GuidedTour);
		await expect.element(page.getByRole('heading', { name: es.tour_s2_vol_title })).toBeInTheDocument();
		await expect.element(page.getByText(es.tour_s2_vol_where)).toBeInTheDocument();
		await expect.element(page.getByText('1 / 5')).toBeInTheDocument();
	});

	it('starts at Cola in Fisqua mode for an operator', async () => {
		locale.set('es');
		signIn('operator');
		unitState.set(state({ mode: 'fisqua' }));
		tour.start();
		render(GuidedTour);
		await expect.element(page.getByRole('heading', { name: es.tour_s2_fisqua_title })).toBeInTheDocument();
		await expect.element(page.getByText('1 / 5')).toBeInTheDocument();
	});

	it('follows the review, then ends on export, in Fisqua mode for an operator', async () => {
		locale.set('es');
		signIn('operator');
		unitState.set(state({ mode: 'fisqua' }));
		tour.start();
		tour.next();
		render(GuidedTour);
		await expect.element(page.getByText(es.tour_s3_fisqua_body)).toBeInTheDocument();
		await expect.element(page.getByText(es.tour_s2_fisqua_where)).toBeInTheDocument();
		await expect.element(page.getByText('2 / 5')).toBeInTheDocument();
		tour.goTo(3);
		await expect.element(page.getByRole('heading', { name: es.tour_s5_fisqua_title })).toBeInTheDocument();
		await expect.element(page.getByText('4 / 5')).toBeInTheDocument();
		tour.goTo(4);
		await expect.element(page.getByRole('heading', { name: es.tour_s6_title })).toBeInTheDocument();
		await expect.element(page.getByText(es.tour_s6_where_vol)).toBeInTheDocument();
		await expect.element(page.getByText('5 / 5')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: es.tour_finish })).toBeInTheDocument();
	});

	it('starts at Nuevo volumen in Fisqua mode for an administrator', async () => {
		locale.set('es');
		signIn('admin');
		unitState.set(state({ mode: 'fisqua' }));
		tour.start();
		render(GuidedTour);
		await expect.element(page.getByRole('heading', { name: es.tour_s2_vol_title })).toBeInTheDocument();
		await expect.element(page.getByText(es.tour_s2_vol_where)).toBeInTheDocument();
		await expect.element(page.getByText('1 / 5')).toBeInTheDocument();
	});

	it('stays on the volume step when the hidden state arrives with the tour open', async () => {
		locale.set('es');
		unitState.set(null);
		tour.start();
		tour.next();
		render(GuidedTour);
		await expect.element(page.getByRole('heading', { name: es.tour_s2_title })).toBeInTheDocument();
		await expect.element(page.getByText('2 / 6')).toBeInTheDocument();
		unitState.set(state());
		await expect.element(page.getByRole('heading', { name: es.tour_s2_vol_title })).toBeInTheDocument();
		await expect.element(page.getByText(es.tour_s2_vol_where)).toBeInTheDocument();
		await expect.element(page.getByText('1 / 5')).toBeInTheDocument();
	});
});

// The Fisqua line's details panel opens below the line, where the follow
// step's box would be, and every side of a line at the left of the top bar
// is taken by the panel or the screen's edge. While the panel is open the
// tour steps aside, as it does for a dialog, and comes back when it closes.
describe('GuidedTour on the follow step, with the Fisqua line', () => {
	const MID = '7f0c1f9e-2b1a-4f3e-9a51-3d1f0a2b9c11';
	const refused: VolumeOffsiteState = {
		collection_id: 7, filename_stem: 'co-ahrb-aht-003', uploadable: true, total: 10, verified: 10, pending: 0,
		refused: 0, last_verified_at: null, received: true, refusals: [], freed_files: 0, freed_bytes: 0,
		fisqua: {
			environment: 'production', config_error: null, status: null,
			outbox: [{
				manifest_id: MID, stem: 'co-ahrb-aht-003', state: 'refused', created_at: '2026-10-24T14:30:00', attempts: 1,
				next_attempt_at: null, last_attempt_at: '2026-10-24T14:31:00', last_error: null, refusal: 'fisqua',
				problems: [{ rule: 'run-started', message: 'x' }], response: null, external_id: null, delivered_at: null
			}]
		}
	} as unknown as VolumeOffsiteState;

	async function onFollowStep() {
		locale.set('es');
		pageUrl.href = 'http://localhost/dashboard/projects/4/collections/7';
		vi.spyOn(systemApi, 'getCatalogueBackup').mockReturnValue(new Promise(() => {}));
		vi.spyOn(collectionsApi, 'getOffsiteState').mockResolvedValue(refused);
		signIn('operator');
		unitState.set(state({ mode: 'fisqua' }));
		const line = render(VolumeOffsiteIndicator, { collectionId: 7 });
		await expect.poll(() => line.container.querySelector('button[data-fisqua]')).not.toBeNull();
		tour.start();
		tour.goTo(3);
		render(GuidedTour);
		await expect.element(page.getByRole('heading', { name: es.tour_s5_fisqua_title })).toBeInTheDocument();
		await expect.poll(() => document.querySelector('.tour-spot')).not.toBeNull();
		return line.container.querySelector('button[data-fisqua]') as HTMLButtonElement;
	}

	it('hides the box while the details panel is open, and shows it again when it closes', async () => {
		const trigger = await onFollowStep();
		trigger.click();
		await expect.poll(() => document.querySelector('.fisqua-panel')).not.toBeNull();
		await expect.poll(() => document.querySelector('.tour-box')).toBeNull();
		expect(document.querySelector('.tour-spot')).toBeNull();
		trigger.click();
		await expect.poll(() => document.querySelector('.fisqua-panel')).toBeNull();
		await expect.element(page.getByRole('heading', { name: es.tour_s5_fisqua_title })).toBeInTheDocument();
		expect(get(tour)).toEqual({ active: true, index: 3 });
	});

	it('leaves Escape to the panel, keeping the tour open', async () => {
		const trigger = await onFollowStep();
		trigger.focus();
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => document.querySelector('.fisqua-panel')).not.toBeNull();
		await expect.poll(() => document.querySelector('.tour-box')).toBeNull();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.querySelector('.fisqua-panel')).toBeNull();
		expect(get(tour).active).toBe(true);
		await expect.element(page.getByRole('heading', { name: es.tour_s5_fisqua_title })).toBeInTheDocument();
	});
});

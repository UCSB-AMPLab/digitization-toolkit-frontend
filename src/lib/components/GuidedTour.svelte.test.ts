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

import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
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

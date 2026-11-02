// The overview's "Proyectos activos" card (NEH-313): hidden while the unit
// hides projects; shown while it shows them, or when the unit's state has
// not been read.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { keepUnitState, resetUnit } from '$lib/unit-mode';
import Overview from './+page.svelte';

function unit(projectsShown: boolean) {
	return { mode: projectsShown ? 'offline' : 'backup', projectsEnabled: projectsShown, projectsShown, defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

beforeEach(() => {
	locale.set('es');
	authStore.setSession('tok', { id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('overview: Proyectos activos', () => {
	it('is hidden while projects are hidden', async () => {
		keepUnitState(unit(false));
		render(Overview);
		await expect.element(page.getByText(es.dash_kpi_total_records)).toBeInTheDocument();
		expect(page.getByText(es.dash_kpi_active_projects).elements()).toHaveLength(0);
	});

	it('is shown while projects are shown', async () => {
		keepUnitState(unit(true));
		render(Overview);
		await expect.element(page.getByText(es.dash_kpi_active_projects)).toBeInTheDocument();
	});

	it('is shown when the unit’s state has not been read', async () => {
		render(Overview);
		await expect.element(page.getByText(es.dash_kpi_active_projects)).toBeInTheDocument();
	});
});

// The volume form for the ordinary roles, unchanged by the testing account's
// form (NEH-391): the body still carries filename_stem, the signatura and,
// for an administrator who keeps the volume on the unit, kept_on_unit; an
// operator in Fisqua mode still has no New volume.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({
		params: { projectId: '1' },
		url: new URL('http://localhost/dashboard/projects/1')
	})
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import { recordRequests, type Recorder } from '$lib/test-support/testing-routes';
import ProjectPage from './+page.svelte';

const vol = {
	id: 11,
	name: 'Tomo 1',
	project_id: 1,
	created_at: '2026-11-01T00:00:00',
	record_count: 0,
	filename_stem: 'co-x-001'
};
const unit = (mode: string) => ({
	mode,
	projectsEnabled: true,
	projectsShown: true,
	defaultProjectId: 1,
	prerequisites: { backup: [], fisqua: [] },
	keptVolumes: []
});

let rec: Recorder;
function serve(mode: string) {
	rec = recordRequests({
		'GET /system/unit': unit(mode),
		'GET /projects/{project_id}': { id: 1, name: 'Rionegro', created_at: '2026-11-01T00:00:00' },
		'GET /collections/': [vol],
		'GET /records/count': { count: 0 },
		'POST /collections/': { ...vol, id: 12 }
	} as never);
}

beforeEach(() => {
	locale.set('en');
	resetUnit();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function fillAndCreate(keep: boolean) {
	await expect.element(page.getByText('Tomo 1')).toBeVisible();
	await page.getByRole('button', { name: en.pd_new_collection }).click();
	await userEvent.fill(page.getByPlaceholder(en.pd_ph_title), 'Tomo 2');
	await userEvent.fill(page.getByPlaceholder(en.pd_ph_stem), 'co-x-002');
	await userEvent.fill(page.getByPlaceholder(en.pd_ph_refcode), 'S-2');
	if (keep) await page.getByRole('checkbox', { name: en.pd_kept_on_unit }).click();
	await page.getByRole('button', { name: en.pd_create_btn }).click();
	await expect.poll(() => rec.to('POST /collections/').length).toBe(1);
	return rec.to('POST /collections/')[0].body;
}

describe('the volume form, ordinary roles', () => {
	it('an administrator keeping the volume sends the stem, the signatura and kept_on_unit', async () => {
		authStore.setSession({
			id: 1,
			username: 'admin1',
			email: null,
			role: 'admin',
			is_active: true
		});
		serve('backup');
		render(ProjectPage);
		expect(await fillAndCreate(true)).toEqual({
			name: 'Tomo 2',
			project_id: 1,
			created_by: 'admin1',
			archival_metadata: { signatura: 'S-2' },
			filename_stem: 'co-x-002',
			kept_on_unit: true
		});
	});

	it('an operator sends the stem and the signatura, and no kept_on_unit', async () => {
		authStore.setSession({ id: 5, username: 'op', email: null, role: 'operator', is_active: true });
		serve('backup');
		render(ProjectPage);
		expect(await fillAndCreate(false)).toEqual({
			name: 'Tomo 2',
			project_id: 1,
			created_by: 'op',
			archival_metadata: { signatura: 'S-2' },
			filename_stem: 'co-x-002'
		});
	});

	it('an operator in Fisqua mode has no New volume', async () => {
		authStore.setSession({ id: 5, username: 'op', email: null, role: 'operator', is_active: true });
		serve('fisqua');
		render(ProjectPage);
		await expect.element(page.getByText('Tomo 1')).toBeVisible();
		await expect.poll(() => rec.to('GET /system/unit').length).toBe(1);
		await new Promise((r) => setTimeout(r, 100));
		expect(page.getByRole('button', { name: en.pd_new_collection }).elements()).toHaveLength(0);
	});
});

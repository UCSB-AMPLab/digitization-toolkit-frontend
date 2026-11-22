// The "add a collaborator" list of the project page leaves out the testing
// account (NEH-391): it is never a member of a real project.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { readable } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
	page: readable({
		params: { projectId: '1' },
		url: new URL('http://localhost/dashboard/projects/1')
	})
}));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import {
	activityApi,
	collectionsApi,
	projectMembersApi,
	projectsApi,
	recordsApi,
	usersApi,
	type Project
} from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import ProjectPage from './+page.svelte';

beforeEach(() => {
	locale.set('en');
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
	vi.spyOn(projectsApi, 'get').mockResolvedValue({ id: 1, name: 'Rionegro' } as Project);
	vi.spyOn(recordsApi, 'count').mockResolvedValue(0);
	vi.spyOn(projectMembersApi, 'list').mockResolvedValue([]);
	vi.spyOn(activityApi, 'collections').mockResolvedValue([]);
	vi.spyOn(collectionsApi, 'listAll').mockResolvedValue([]);
	vi.spyOn(usersApi, 'list').mockResolvedValue([
		{ id: 2, username: 'ana', email: null, role: 'operator', is_active: true },
		{ id: 3, username: 'unit-testing', email: null, role: 'testing', is_active: true }
	]);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('project page: adding a collaborator', () => {
	it('offers real users and not the testing account', async () => {
		const screen = render(ProjectPage);
		await page.getByRole('button', { name: en.pd_members }).click();
		await expect
			.poll(() =>
				[...screen.container.querySelectorAll('.add-member-select option')].map((o) =>
					o.textContent?.trim()
				)
			)
			.toContain('ana');
		const options = [...screen.container.querySelectorAll('.add-member-select option')].map((o) =>
			o.textContent?.trim()
		);
		expect(options).not.toContain('unit-testing');
	});
});

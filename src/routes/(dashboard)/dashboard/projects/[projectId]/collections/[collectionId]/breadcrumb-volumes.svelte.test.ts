// The volume page's top bar while the unit hides projects (NEH-313): the
// breadcrumb starts with "Volúmenes", a link to the list, instead of the
// project's name, and the back button returns to Volúmenes. With projects
// shown, or the unit's state not read, both stay as they were.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { createRawSnippet } from 'svelte';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable({
			params: { projectId: '7', collectionId: '97' },
			url: new URL('http://localhost/dashboard/projects/7/collections/97'),
			data: { projectName: 'AHR Digitalización 2026', collectionName: 'Tomo 097' }
		})
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { systemApi } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import Layout from './+layout@.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>volume</p>' }));

function unit(projectsShown: boolean) {
	return { mode: projectsShown ? 'offline' : 'fisqua', projectsEnabled: projectsShown, projectsShown, defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } };
}

beforeEach(() => {
	locale.set('es');
	gotoMock.mockClear();
	authStore.setSession({ id: 1, username: 'operator', email: null, role: 'operator', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('volume page top bar', () => {
	it('starts the breadcrumb with a link to Volúmenes while projects are hidden', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(false) as never);
		const screen = render(Layout, { children });
		const crumb = page.getByRole('navigation', { name: es.col_breadcrumb_nav });
		await expect.element(crumb.getByRole('link', { name: es.nav_volumes })).toHaveAttribute('href', '/dashboard/volumes');
		await expect.element(crumb.getByText('Tomo 097')).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain('AHR Digitalización 2026');
		await userEvent.click(page.getByRole('button', { name: es.col_back_to_volumes }));
		expect(gotoMock).toHaveBeenCalledWith('/dashboard/volumes');
	});

	it('keeps the project’s name and back button while projects are shown', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(true) as never);
		render(Layout, { children });
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		const crumb = page.getByRole('navigation', { name: es.col_breadcrumb_nav });
		await expect.element(crumb.getByText('AHR Digitalización 2026')).toBeInTheDocument();
		expect(crumb.getByRole('link').elements()).toHaveLength(0);
		await userEvent.click(page.getByRole('button', { name: es.col_back_to_project }));
		expect(gotoMock).toHaveBeenCalledWith('/dashboard/projects/7');
	});

	it('keeps the project’s name when the unit’s state cannot be read', async () => {
		vi.spyOn(systemApi, 'unit').mockRejectedValue(new Error('boom'));
		render(Layout, { children });
		await vi.waitFor(() => expect(systemApi.unit).toHaveBeenCalled());
		await expect.element(page.getByText('AHR Digitalización 2026')).toBeInTheDocument();
	});
});

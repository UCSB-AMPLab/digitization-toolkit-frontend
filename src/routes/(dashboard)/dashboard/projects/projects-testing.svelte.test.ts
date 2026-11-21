// The project list for the testing account (NEH-391): it creates its own
// projects, sending only the name; each refusal it can get shows its own
// message; it sends nothing the backend does not admit it to. The
// administrator's and the operator's list stay as they were. The absence of a
// Status column is checked in projects-no-status.svelte.test.ts.
//
// Version: 0.1.2
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type AuthUser } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import type { Messages } from '$lib/i18n';
import { resetUnit } from '$lib/unit-mode';
import { recordRequests, refusal, json, TESTING_USER, TESTING_UNIT, type Recorder } from '$lib/test-support/testing-routes';
import ProjectsPage from './+page.svelte';

const projects = [{ id: 3, name: 'Practice', created_at: '2026-11-01T00:00:00', testing: true }];

function signIn(user: AuthUser) {
	authStore.setSession(user);
}

let rec: Recorder;

beforeEach(() => {
	locale.set('en');
	resetUnit();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function openCreate() {
	await page.getByRole('button', { name: en.proj_new }).click();
	await expect.element(page.getByRole('dialog')).toBeVisible();
}

describe('project list, testing account', () => {
	beforeEach(() => {
		signIn(TESTING_USER);
	});

	it('offers New project, and the empty list offers the first one', async () => {
		rec = recordRequests({ 'GET /projects/': [], 'GET /system/unit': TESTING_UNIT });
		render(ProjectsPage);
		await expect.element(page.getByRole('button', { name: en.proj_create_first })).toBeVisible();
		expect(rec.refusedList()).toEqual([]);
	});

	it('sends only the name, and nothing the backend refuses, through mount and creation', async () => {
		let list: unknown[] = projects;
		rec = recordRequests({
			'GET /projects/': () => list,
			'POST /projects/': (req) => {
				list = [...projects, { id: 4, name: (req.body as { name: string }).name, created_at: '2026-11-20T00:00:00', testing: true }];
				return list[1];
			}
		});
		render(ProjectsPage);
		await openCreate();
		for (const ph of [en.proj_ph_description, en.proj_ph_fonds, en.proj_ph_series, en.proj_ph_refcode]) {
			expect(page.getByPlaceholder(ph).elements()).toHaveLength(0);
		}
		await userEvent.fill(page.getByPlaceholder(en.proj_ph_name), '  Morning practice ');
		await page.getByRole('button', { name: en.proj_create_btn }).click();
		await expect.element(page.getByText('Morning practice')).toBeVisible();
		expect(rec.to('POST /projects/').map((r) => r.body)).toEqual([{ name: 'Morning practice' }]);
		expect(rec.refusedList()).toEqual([]);
	});

	const cases: [string, Response, string][] = [
		['project_directory_taken', refusal(409, 'project_directory_taken'), en.testing_err_project_directory_taken],
		['project_name_invalid', refusal(422, 'project_name_invalid'), en.testing_err_project_name_invalid],
		['anything else', json({ detail: 'Backend text that is never shown.' }, 500), en.testing_err_other]
	];
	for (const [label, answer, text] of cases) {
		it(`shows its own message for ${label}, never the backend's text`, async () => {
			rec = recordRequests({ 'GET /projects/': projects, 'POST /projects/': answer });
			const screen = render(ProjectsPage);
			await openCreate();
			await userEvent.fill(page.getByPlaceholder(en.proj_ph_name), 'Practice 2');
			await page.getByRole('button', { name: en.proj_create_btn }).click();
			await expect.element(page.getByText(text)).toBeVisible();
			expect(screen.container.textContent).not.toContain('Backend text');
		});
	}

	it('renames with the name only, and shows the refusal translated', async () => {
		rec = recordRequests({ 'GET /projects/': projects, 'PUT /projects/{project_id}': refusal(409, 'project_directory_taken') });
		const screen = render(ProjectsPage);
		await expect.element(page.getByText('Practice')).toBeVisible();
		(screen.container.querySelector('.btn-menu') as HTMLElement).click();
		await page.getByRole('button', { name: en.common_edit }).click();
		await userEvent.fill(page.getByPlaceholder(en.proj_ph_name), 'Practice B');
		await page.getByRole('button', { name: en.common_save_changes }).click();
		await expect.element(page.getByText(en.testing_err_project_directory_taken)).toBeVisible();
		expect(rec.to('PUT /projects/{project_id}').map((r) => r.body)).toEqual([{ name: 'Practice B' }]);
		expect(screen.container.textContent).not.toContain('Backend text');
	});
});

describe('project list, other roles, unchanged', () => {
	it('the administrator creates with every field and sees the backend detail in the message', async () => {
		signIn({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
		rec = recordRequests({ 'GET /projects/': projects, 'POST /projects/': json({ detail: 'Project with this name already exists' }, 409) });
		render(ProjectsPage);
		await openCreate();
		await expect.element(page.getByPlaceholder(en.proj_ph_fonds)).toBeVisible();
		await userEvent.fill(page.getByPlaceholder(en.proj_ph_name), 'Real');
		await userEvent.fill(page.getByPlaceholder(en.proj_ph_description), 'Desc');
		await page.getByRole('button', { name: en.proj_create_btn }).click();
		await expect.element(page.getByText(en.proj_err_create('Project with this name already exists'))).toBeVisible();
		expect(rec.to('POST /projects/').map((r) => r.body)).toEqual([{ name: 'Real', description: 'Desc', created_by: 'admin1' }]);
	});

	it('the operator has no New project', async () => {
		signIn({ id: 2, username: 'op', email: null, role: 'operator', is_active: true });
		rec = recordRequests({ 'GET /projects/': projects });
		render(ProjectsPage);
		await expect.element(page.getByText('Practice')).toBeVisible();
		expect(page.getByRole('button', { name: en.proj_new }).elements()).toHaveLength(0);
	});
});

describe('deleting a project', () => {
	const ROLES: [string, AuthUser][] = [
		['testing', TESTING_USER],
		['admin', { id: 1, username: 'admin1', email: null, role: 'admin', is_active: true }],
		['operator', { id: 2, username: 'op', email: null, role: 'operator', is_active: true }],
		['reviewer', { id: 3, username: 'rev', email: null, role: 'reviewer', is_active: true }]
	];
	const serve = (extra: { [route: string]: Response | object } = {}) =>
		(rec = recordRequests({
			'GET /projects/': projects,
			'GET /collections/count': { count: 0 },
			'GET /records/count': { count: 0 },
			'DELETE /projects/{project_id}': { detail: 'project deleted' },
			...extra
		} as never));
	async function openMenu(screen: ReturnType<typeof render>) {
		await expect.element(page.getByText('Practice')).toBeVisible();
		(screen.container.querySelector('.btn-menu') as HTMLElement).click();
		await expect.element(page.getByRole('button', { name: en.common_edit })).toBeVisible();
	}
	// The icon's ligature text is part of these buttons' accessible names, so they are found by class.
	const menuDelete = (screen: ReturnType<typeof render>) => screen.container.querySelectorAll('.action-item-danger');
	async function confirmDelete(screen: ReturnType<typeof render>) {
		(screen.container.querySelector('.action-item-danger') as HTMLElement).click();
		await expect.poll(() => (document.querySelector('.modal-footer .btn-danger') as HTMLButtonElement | null)?.disabled).toBe(false);
		(document.querySelector('.modal-footer .btn-danger') as HTMLElement).click();
	}

	for (const [role, user] of ROLES) {
		it(`the menu ${role === 'testing' || role === 'admin' ? 'offers' : 'does not offer'} Delete to the ${role}`, async () => {
			signIn(user);
			serve();
			const screen = render(ProjectsPage);
			await openMenu(screen);
			expect(menuDelete(screen)).toHaveLength(role === 'testing' || role === 'admin' ? 1 : 0);
		});
	}

	it('the testing account sends one DELETE and nothing refused', async () => {
		signIn(TESTING_USER);
		serve();
		const screen = render(ProjectsPage);
		await openMenu(screen);
		await confirmDelete(screen);
		await expect.poll(() => rec.to('DELETE /projects/{project_id}').length).toBe(1);
		expect(rec.to('DELETE /projects/{project_id}')[0].path).toBe('/projects/3');
		expect(rec.refusedList()).toEqual([]);
	});

	const plain = (status: number, detail: string) => json({ detail }, status);
	const refusals: [string, Response, keyof Messages][] = [
		['a project that still has volumes', plain(409, 'Cannot delete a non-empty project: 2 collection(s) and 9 record(s) remain. Move or delete them first.'), 'testing_err_project_not_empty'],
		['files still referenced', plain(409, 'Project directory still holds files referenced by other records. Move those records first.'), 'testing_err_project_files_held'],
		['a manifest of another volume', plain(409, 'Project directory holds a capture manifest other than its own. Move it out first.'), 'testing_err_project_files_held'],
		['a storage drive that cannot be read', plain(503, 'A storage drive that holds testing files cannot be read now. Reconnect it, then delete the project again.'), 'testing_err_project_storage'],
		['a project that is gone', plain(404, 'Project not found'), 'testing_err_not_found'],
		['anything else', plain(500, 'Failed to remove project files from disk'), 'testing_err_other']
	];
	for (const lang of ['en', 'es'] as const) {
		for (const [label, answer, key] of refusals) {
			it(`shows its own message in ${lang} for ${label}, never the backend's text`, async () => {
				locale.set(lang);
				const msgs = (lang === 'en' ? en : es) as Messages;
				signIn(TESTING_USER);
				serve({ 'DELETE /projects/{project_id}': answer });
				const screen = render(ProjectsPage);
				await openMenu(screen);
				await confirmDelete(screen);
				await expect.element(page.getByText(msgs[key] as string)).toBeVisible();
				expect(screen.container.textContent).not.toMatch(/Cannot delete|Project directory|storage drive|Failed to|not found/);
				expect(screen.container.textContent).not.toContain(msgs.proj_err_delete('x').slice(0, 20));
			});
		}
	}

	it('the administrator still gets the backend detail inside the existing error text', async () => {
		signIn(ROLES[1][1]);
		serve({ 'DELETE /projects/{project_id}': plain(503, 'A storage drive that holds testing files cannot be read now.') });
		const screen = render(ProjectsPage);
		await openMenu(screen);
		await confirmDelete(screen);
		await expect.element(page.getByText(en.proj_err_delete('A storage drive that holds testing files cannot be read now.'))).toBeVisible();
		expect(screen.container.textContent).not.toContain(en.testing_err_project_storage);
	});
});

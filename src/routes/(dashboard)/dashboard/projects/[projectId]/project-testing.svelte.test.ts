// The project page for the testing account (NEH-391): no request the backend
// refuses it (members, activity totals), no members panel, the New volume
// control, a volume form without codes, each volume's removal date, and the
// delete an operator has. The operator's page stays as it was.
//
// Version: 0.1.1
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
import { formatApiDate } from '$lib/format-date';
import {
	json,
	recordRequests,
	refusal,
	TESTING_UNIT,
	TESTING_USER,
	type Recorder
} from '$lib/test-support/testing-routes';
import ProjectPage from './+page.svelte';

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

const far = {
	id: 11,
	name: 'Tomo practice',
	project_id: 1,
	created_at: '2026-11-01T00:00:00',
	record_count: 2,
	filename_stem: 'testing-000011',
	testing: true,
	testing_expires_at: inDays(20)
};
const near = {
	id: 12,
	name: 'Tomo near',
	project_id: 1,
	created_at: '2026-11-01T00:00:00',
	record_count: 0,
	filename_stem: 'testing-000012',
	testing: true,
	testing_expires_at: inDays(3)
};

let rec: Recorder;
let volumes: unknown[];

function handlers(extra: { [k: string]: unknown } = {}) {
	volumes = [far, near];
	return {
		'GET /system/unit': TESTING_UNIT,
		'GET /projects/{project_id}': {
			id: 1,
			name: 'Practice',
			created_at: '2026-11-01T00:00:00',
			testing: true
		},
		'GET /collections/': () => volumes,
		'GET /records/count': { count: 0 },
		...extra
	} as never;
}

beforeEach(() => {
	locale.set('en');
	resetUnit();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function shown() {
	await expect.element(page.getByText('Tomo practice')).toBeVisible();
}

describe('project page, testing account', () => {
	beforeEach(() => authStore.setSession(TESTING_USER));

	it('sends nothing the backend refuses on mount, and has no members panel', async () => {
		rec = recordRequests(handlers());
		render(ProjectPage);
		await shown();
		await new Promise((r) => setTimeout(r, 100));
		expect(rec.refusedList()).toEqual([]);
		expect(page.getByRole('button', { name: en.pd_members }).elements()).toHaveLength(0);
		expect(rec.to('GET /collections/').length).toBeGreaterThan(0);
	});

	it('shows when each volume is removed, in the warning colour within seven days', async () => {
		rec = recordRequests(handlers());
		const screen = render(ProjectPage);
		await shown();
		const farText = en.testing_expires_on(
			formatApiDate(far.testing_expires_at, 'en', {
				day: 'numeric',
				month: 'long',
				year: 'numeric'
			})
		);
		const nearText = en.testing_expires_on(
			formatApiDate(near.testing_expires_at, 'en', {
				day: 'numeric',
				month: 'long',
				year: 'numeric'
			})
		);
		await expect.element(page.getByText(farText)).toBeVisible();
		await expect.element(page.getByText(nearText)).toBeVisible();
		const lines = [...screen.container.querySelectorAll('.testing-expiry')];
		expect(lines).toHaveLength(2);
		expect(lines[0].classList.contains('soon')).toBe(false);
		expect(lines[1].classList.contains('soon')).toBe(true);
	});

	it('says a volume whose date has passed is removed at the next clean-up, in the warning colour', async () => {
		const handler = handlers();
		volumes = [{ ...far, testing_expires_at: new Date(Date.now() - 1000).toISOString() }];
		rec = recordRequests({ ...(handler as object), 'GET /collections/': () => volumes } as never);
		const screen = render(ProjectPage);
		await shown();
		await expect.element(page.getByText(en.testing_expires_due)).toBeVisible();
		expect(screen.container.querySelector('.testing-expiry')?.classList.contains('soon')).toBe(
			true
		);
	});

	it('creates a volume with no codes, sending nothing refused, and reloads the list', async () => {
		rec = recordRequests(
			handlers({
				'POST /collections/': (req: { body: { name: string } }) => {
					const made = {
						...far,
						id: 13,
						name: req.body.name,
						filename_stem: 'testing-000013',
						record_count: 0
					};
					volumes = [far, near, made];
					return made;
				}
			})
		);
		const screen = render(ProjectPage);
		await shown();
		await page.getByRole('button', { name: en.pd_new_collection }).click();
		await expect.element(page.getByRole('dialog')).toBeVisible();
		const dialog = screen.container.querySelector('[role="dialog"]') as HTMLElement;
		expect(dialog.textContent).not.toContain(en.pd_field_stem);
		expect(dialog.textContent).not.toContain(en.pd_field_stem_fisqua);
		expect(dialog.textContent).not.toContain(en.pd_field_refcode);
		expect(dialog.textContent).not.toContain(en.pd_kept_on_unit);
		expect(dialog.textContent).not.toContain(en.pd_fisqua_admin_note);
		await userEvent.fill(page.getByPlaceholder(en.pd_ph_title), 'Tomo new');
		await userEvent.fill(page.getByPlaceholder(en.pd_ph_creator), 'Cabildo');
		await page.getByRole('button', { name: en.pd_create_btn }).click();
		await expect.element(page.getByText('Tomo new')).toBeVisible();
		const bodies = rec.to('POST /collections/').map((r) => r.body as { [k: string]: unknown });
		expect(bodies).toHaveLength(1);
		expect(bodies[0]).toEqual({
			name: 'Tomo new',
			project_id: 1,
			created_by: 'unit-testing',
			archival_metadata: { creator: 'Cabildo' }
		});
		for (const key of ['filename_stem', 'external_id', 'kept_on_unit'])
			expect(key in bodies[0]).toBe(false);
		expect(rec.to('GET /collections/').length).toBeGreaterThan(1);
		expect(rec.refusedList()).toEqual([]);
	});

	const cases: [string, Response, string][] = [
		['testing_volume_codes', refusal(409, 'testing_volume_codes'), en.testing_err_volume_codes],
		['testing_reserve', refusal(507, 'testing_reserve'), en.testing_err_reserve],
		['not_found', refusal(404, 'not_found'), en.testing_err_not_found],
		[
			'anything else',
			json({ detail: 'Backend text that is never shown.' }, 500),
			en.pd_err_create_collection
		]
	];
	for (const [label, answer, text] of cases) {
		it(`shows its own message when a volume is refused for ${label}`, async () => {
			rec = recordRequests(handlers({ 'POST /collections/': answer }));
			const screen = render(ProjectPage);
			await shown();
			await page.getByRole('button', { name: en.pd_new_collection }).click();
			await userEvent.fill(page.getByPlaceholder(en.pd_ph_title), 'Tomo new');
			await page.getByRole('button', { name: en.pd_create_btn }).click();
			await expect.element(page.getByText(text)).toBeVisible();
			expect(screen.container.textContent).not.toContain('Backend text');
		});
	}

	it('offers Delete and not Edit in a row, and shows a refusal of the delete translated', async () => {
		rec = recordRequests(
			handlers({ 'DELETE /collections/{collection_id}': refusal(404, 'not_found') })
		);
		const screen = render(ProjectPage);
		await shown();
		(screen.container.querySelectorAll('.btn-menu')[1] as HTMLElement).click();
		await expect.element(page.getByRole('button', { name: en.common_delete })).toBeVisible();
		expect(page.getByRole('button', { name: en.common_edit }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: en.common_delete }).click();
		await page.getByRole('button', { name: en.pd_delete_collection_title }).click();
		await expect.element(page.getByText(en.testing_err_not_found)).toBeVisible();
		expect(rec.to('DELETE /collections/{collection_id}').map((r) => r.path)).toEqual([
			'/collections/12'
		]);
		expect(rec.refusedList()).toEqual([]);
		expect(screen.container.textContent).not.toContain('Backend text');
	});
});

describe('project page, operator, unchanged', () => {
	it('asks for members and activity, shows Collaborators, the stem field and Edit', async () => {
		authStore.setSession({ id: 5, username: 'op', email: null, role: 'operator', is_active: true });
		rec = recordRequests(
			handlers({ 'GET /system/unit': { ...TESTING_UNIT, mode: 'offline', projectsShown: true } })
		);
		const screen = render(ProjectPage);
		await shown();
		await expect.element(page.getByRole('button', { name: en.pd_members })).toBeVisible();
		await expect.poll(() => rec.to('GET /projects/{project_id}/members').length).toBe(1);
		await expect.poll(() => rec.to('GET /activity/collections').length).toBeGreaterThan(0);
		expect(screen.container.querySelectorAll('.testing-expiry')).toHaveLength(0);
		(screen.container.querySelectorAll('.btn-menu')[0] as HTMLElement).click();
		await expect.element(page.getByRole('button', { name: en.common_edit })).toBeVisible();
		await page.getByRole('button', { name: en.common_edit }).click();
		await expect.element(page.getByRole('dialog')).toBeVisible();
		expect(screen.container.querySelector('[role="dialog"]')?.textContent).toContain(
			en.pd_field_stem
		);
	});
});

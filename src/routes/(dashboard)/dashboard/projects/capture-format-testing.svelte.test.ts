// A testing project's capture format (NEH-391): JPEG only unless the people
// using it choose RAW and JPEG, offered only when the unit's cameras offer
// both; chosen when the project is created and changed on its page.
//
// Version: 0.3.0
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
import {
	recordRequests,
	refusal,
	TESTING_UNIT,
	TESTING_USER,
	type Recorder
} from '$lib/test-support/testing-routes';
import ProjectsPage from './+page.svelte';
import ProjectPage from './[projectId]/+page.svelte';

const BOTH = { backend: 'gphoto2', image_formats: ['JPEG', 'RAW+JPEG'] };
const project = {
	id: 1,
	name: 'Practice',
	created_at: '2026-11-01T00:00:00',
	testing: true,
	capture_format: 'JPEG'
};

let rec: Recorder;

beforeEach(() => {
	locale.set('en');
	resetUnit();
	authStore.setSession(TESTING_USER);
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function openCreate() {
	await page.getByRole('button', { name: en.proj_new }).click();
	await expect.element(page.getByRole('dialog')).toBeVisible();
}

describe('creating a testing project', () => {
	for (const [label, caps] of [
		['no choice', { backend: 'x', image_formats: [] }],
		['one format', { backend: 'x', image_formats: ['JPEG'] }],
		['no list', { backend: 'x' }]
	] as const) {
		it(`shows no format choice and sends none with ${label}`, async () => {
			rec = recordRequests({
				'GET /projects/': [project],
				'GET /cameras/capabilities': caps,
				'POST /projects/': project
			});
			render(ProjectsPage);
			await openCreate();
			await expect.poll(() => rec.to('GET /cameras/capabilities').length).toBeGreaterThan(0);
			await new Promise((r) => setTimeout(r, 50));
			expect(page.getByRole('radio').elements()).toHaveLength(0);
			await userEvent.fill(page.getByPlaceholder(en.proj_ph_name), 'P2');
			await page.getByRole('button', { name: en.proj_create_btn }).click();
			await expect.poll(() => rec.to('POST /projects/').length).toBe(1);
			expect(rec.to('POST /projects/')[0].body).toEqual({ name: 'P2' });
		});
	}

	it('offers JPEG only, preselected, and RAW and JPEG, with the size note', async () => {
		rec = recordRequests({
			'GET /projects/': [project],
			'GET /cameras/capabilities': BOTH,
			'POST /projects/': project
		});
		render(ProjectsPage);
		await openCreate();
		await expect.element(page.getByRole('radio', { name: en.testing_format_jpeg })).toBeChecked();
		await expect
			.element(page.getByRole('radio', { name: en.testing_format_raw }))
			.not.toBeChecked();
		await expect.element(page.getByText(en.testing_format_note)).toBeVisible();
		await userEvent.fill(page.getByPlaceholder(en.proj_ph_name), 'P2');
		await page.getByRole('button', { name: en.proj_create_btn }).click();
		await expect.poll(() => rec.to('POST /projects/').length).toBe(1);
		expect(rec.to('POST /projects/')[0].body).toEqual({ name: 'P2', capture_format: 'JPEG' });
		expect(rec.refusedList()).toEqual([]);
	});

	it('sends RAW and JPEG when chosen, and shows capture_format_unavailable in its own words', async () => {
		rec = recordRequests({
			'GET /projects/': [project],
			'GET /cameras/capabilities': BOTH,
			'POST /projects/': refusal(422, 'capture_format_unavailable')
		});
		const screen = render(ProjectsPage);
		await openCreate();
		await page.getByRole('radio', { name: en.testing_format_raw }).click();
		await userEvent.fill(page.getByPlaceholder(en.proj_ph_name), 'P2');
		await page.getByRole('button', { name: en.proj_create_btn }).click();
		await expect.element(page.getByText(en.testing_err_capture_format_unavailable)).toBeVisible();
		expect(rec.to('POST /projects/')[0].body).toEqual({ name: 'P2', capture_format: 'RAW+JPEG' });
		expect(screen.container.textContent).not.toContain('Backend text');
	});

	it('the administrator gets no format choice and does not read the capabilities', async () => {
		authStore.setSession({
			id: 1,
			username: 'admin1',
			email: null,
			role: 'admin',
			is_active: true
		});
		rec = recordRequests({ 'GET /projects/': [project], 'GET /cameras/capabilities': BOTH });
		render(ProjectsPage);
		await openCreate();
		await new Promise((r) => setTimeout(r, 50));
		expect(page.getByRole('radio').elements()).toHaveLength(0);
		expect(rec.to('GET /cameras/capabilities')).toHaveLength(0);
	});
});

describe('the project page', () => {
	function handlers(
		caps: object,
		put: unknown = (req: { body: object }) => ({ ...project, ...req.body })
	) {
		return {
			'GET /system/unit': TESTING_UNIT,
			'GET /projects/{project_id}': project,
			'GET /collections/': [],
			'GET /records/count': { count: 0 },
			'GET /cameras/capabilities': caps,
			'PUT /projects/{project_id}': put
		} as never;
	}

	it('shows the format, and changes it with one request', async () => {
		rec = recordRequests(handlers(BOTH));
		render(ProjectPage);
		await expect.element(page.getByRole('radio', { name: en.testing_format_jpeg })).toBeChecked();
		await expect.element(page.getByText(en.testing_format_applies)).toBeVisible();
		await page.getByRole('radio', { name: en.testing_format_raw }).click();
		await expect.poll(() => rec.to('PUT /projects/{project_id}').length).toBe(1);
		expect(rec.to('PUT /projects/{project_id}')[0].body).toEqual({ capture_format: 'RAW+JPEG' });
		await expect.element(page.getByRole('radio', { name: en.testing_format_raw })).toBeChecked();
		expect(rec.refusedList()).toEqual([]);
	});

	it('shows the format without a choice when the cameras offer one only', async () => {
		rec = recordRequests(handlers({ backend: 'x', image_formats: ['JPEG'] }));
		render(ProjectPage);
		await expect
			.element(page.getByText(en.testing_format_current(en.testing_format_jpeg)))
			.toBeVisible();
		expect(page.getByRole('radio').elements()).toHaveLength(0);
	});

	it('shows capture_format_unavailable in its own words and keeps the format it had', async () => {
		rec = recordRequests(handlers(BOTH, refusal(422, 'capture_format_unavailable')));
		const screen = render(ProjectPage);
		await page.getByRole('radio', { name: en.testing_format_raw }).click();
		await expect.element(page.getByText(en.testing_err_capture_format_unavailable)).toBeVisible();
		await expect.element(page.getByRole('radio', { name: en.testing_format_jpeg })).toBeChecked();
		expect(screen.container.textContent).not.toContain('Backend text');
	});
});

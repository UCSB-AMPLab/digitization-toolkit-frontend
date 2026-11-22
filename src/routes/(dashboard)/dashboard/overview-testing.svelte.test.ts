// The Overview for the testing account (NEH-391): what the testing space is,
// how many projects and volumes it holds, and the way to Projects; none of
// the activity calendar, the volumes in progress, the storage alert, the
// camera panels or the retake summary, and no request the backend refuses
// it. The operator's Overview stays as it was.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import {
	recordRequests,
	TESTING_UNIT,
	TESTING_USER,
	type Recorder
} from '$lib/test-support/testing-routes';
import Overview from './+page.svelte';

let rec: Recorder;

function serve() {
	rec = recordRequests({
		'GET /system/unit': TESTING_UNIT,
		'GET /projects/': [
			{ id: 1, name: 'A', created_at: '2026-11-01T00:00:00' },
			{ id: 2, name: 'B', created_at: '2026-11-01T00:00:00' }
		],
		'GET /collections/count': { count: 3 },
		'GET /collections/': [],
		'GET /records/count': { count: 5 },
		'GET /cameras/devices': []
	} as never);
}

beforeEach(() => {
	locale.set('en');
	resetUnit();
	localStorage.clear();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('Overview, testing account', () => {
	it('says what the testing space is, counts it and links to Projects, with nothing refused', async () => {
		authStore.setSession(TESTING_USER);
		serve();
		const screen = render(Overview);
		await expect
			.element(page.getByRole('heading', { name: en.testing_overview_title }))
			.toBeVisible();
		await expect.element(page.getByText(en.testing_overview_body)).toBeVisible();
		await expect.element(page.getByText(en.testing_counts(2, 3))).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: en.testing_overview_go }))
			.toHaveAttribute('href', '/dashboard/projects');
		await new Promise((r) => setTimeout(r, 150));
		expect(rec.refusedList()).toEqual([]);
		expect(screen.container.querySelector('.kpi-grid')).toBeNull();
		expect(screen.container.textContent).not.toContain(en.dash_test_cameras);
		expect(screen.container.textContent).not.toContain(en.dash_subtitle_reviewer);
		expect(screen.container.querySelector('[role="alert"]')).toBeNull();
	});
});

describe('Overview, operator, unchanged', () => {
	it('reads the retake summary, storage and activity and shows the camera panels', async () => {
		authStore.setSession({ id: 5, username: 'op', email: null, role: 'operator', is_active: true });
		serve();
		const screen = render(Overview);
		await expect.poll(() => rec.to('GET /records/to-retake/summary').length).toBe(1);
		await expect.poll(() => rec.to('GET /system/storage').length).toBeGreaterThan(0);
		await expect.poll(() => rec.to('GET /activity/daily').length).toBeGreaterThan(0);
		await expect.poll(() => screen.container.textContent).toContain(en.dash_test_cameras);
		expect(screen.container.textContent).not.toContain(en.testing_overview_title);
	});
});

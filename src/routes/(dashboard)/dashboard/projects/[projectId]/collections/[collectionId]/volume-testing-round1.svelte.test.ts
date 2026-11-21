// The volume page (NEH-391), second round: the ZIP download never shows a
// status code or an exception's text; the grid shows no review vocabulary to
// the testing account; nothing role-dependent is mounted or requested before
// the signed-in role is known; and an operator's requests, and their order,
// are what they were.
//
// Version: 0.1.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

const nav = vi.hoisted(() => ({ data: {} as { [k: string]: unknown } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: readable({
			params: { projectId: '1', collectionId: '7' },
			url: new URL('http://localhost/dashboard/projects/1/collections/7'),
			get data() { return nav.data; }
		})
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import { json, recordRequests, TESTING_UNIT, TESTING_USER, type Recorder } from '$lib/test-support/testing-routes';
import VolumePageHost from '$lib/test-support/VolumePageHost.svelte';
import CollectionPage from './+page.svelte';

const OPERATOR = { id: 5, username: 'op', email: null, role: 'operator' as const, is_active: true };
const image = (id: number) => ({ id, filename: `p${id}.jpg`, format: 'jpg', is_current: true, role: 'single' });
const records = [1, 2].map((id) => ({ id, title: `Folio ${id}`, status: 'captured', sequence: id, images: [image(id * 10)] }));

let rec: Recorder;
let fileAnswer: () => Response | Promise<Response>;

function serve() {
	rec = recordRequests({
		'GET /system/unit': { ...TESTING_UNIT, mode: 'offline' },
		'GET /records/': records,
		'GET /records/{rec_id}/annotations': [],
		'GET /records/images/{img_id}/file': () => fileAnswer()
	} as never);
}

beforeEach(() => {
	locale.set('en');
	resetUnit();
	nav.data = { projectName: 'Practice', collectionName: 'Tomo', collectionTestingExpiresAt: null };
	fileAnswer = () => new Response(new Blob(['jpeg']), { status: 200 });
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

function renderPage() {
	const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
	return render(CollectionPage, { context: volumeTopbarContext(slot) });
}

async function startZip(role: 'testing' | 'operator') {
	await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
	if (role === 'testing') {
		await page.getByRole('button', { name: en.testing_download_pictures }).click();
	} else {
		await page.getByRole('button', { name: en.col_export }).click();
		await page.getByText(en.col_images_option_title).click();
	}
}

describe('ZIP download failures', () => {
	const cases: [string, () => Response | Promise<Response>, 'testing' | 'operator', string][] = [
		['a 404, testing', () => json({ detail: { code: 'not_found', message: 'Not found.' } }, 404), 'testing', en.testing_err_not_found],
		['a 500, testing', () => json({ detail: 'boom' }, 500), 'testing', en.col_zip_error],
		['a rejected fetch, testing', () => Promise.reject(new TypeError('Failed to fetch')), 'testing', en.col_zip_error],
		['a 404, operator', () => json({ detail: 'Not found.' }, 404), 'operator', en.col_zip_error],
		['a 500, operator', () => json({ detail: 'boom' }, 500), 'operator', en.col_zip_error],
		['a rejected fetch, operator', () => Promise.reject(new TypeError('Failed to fetch')), 'operator', en.col_zip_error]
	];
	for (const [label, answer, role, message] of cases) {
		it(`shows its own words for ${label}`, async () => {
			authStore.setSession(role === 'testing' ? TESTING_USER : OPERATOR);
			serve();
			fileAnswer = answer;
			const screen = renderPage();
			await startZip(role);
			const dialog = () => screen.container.ownerDocument.querySelector('[role="dialog"]')?.textContent ?? '';
			await expect.poll(dialog).toContain(message);
			if (message !== en.col_zip_error) expect(dialog()).toContain(en.col_zip_error);
			const text = document.body.textContent ?? '';
			for (const leak of ['HTTP', '404', '500', 'Failed to fetch']) expect(text).not.toContain(leak);
		});
	}
});

describe('the grid', () => {
	it('shows the testing account no status filter and no review line in the legend', async () => {
		authStore.setSession(TESTING_USER);
		serve();
		renderPage();
		await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
		await page.getByRole('button', { name: en.col_view_grid }).click();
		await expect.element(page.getByRole('list', { name: en.legend_title })).toBeVisible();
		expect(page.getByRole('button', { name: en.common_filters }).elements()).toHaveLength(0);
		expect(document.body.textContent).not.toContain(en.legend_rejected);
		expect(document.body.textContent).not.toContain(en.status_in_review);
	});

	it('keeps both for an operator', async () => {
		authStore.setSession(OPERATOR);
		serve();
		renderPage();
		await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
		await page.getByRole('button', { name: en.col_view_grid }).click();
		await expect.element(page.getByText(en.legend_rejected)).toBeVisible();
		await page.getByRole('button', { name: en.common_filters }).click();
		await expect.element(page.getByRole('button', { name: en.status_in_review })).toBeVisible();
	});
});

describe('before the signed-in role is known', () => {
	it('mounts and requests nothing role-dependent, then follows the testing account once it is known', async () => {
		serve();
		const screen = render(VolumePageHost);
		await new Promise((r) => setTimeout(r, 150));
		expect(rec.to('GET /collections/{collection_id}/offsite')).toHaveLength(0);
		expect(rec.to('GET /system/catalogue-backup')).toHaveLength(0);
		expect(rec.to('GET /records/to-retake/summary')).toHaveLength(0);
		expect(screen.container.querySelector('.offsite-indicator')).toBeNull();
		authStore.setSession(TESTING_USER);
		await expect.element(page.getByRole('button', { name: en.testing_download_pictures })).toBeVisible();
		await new Promise((r) => setTimeout(r, 150));
		expect(rec.refusedList()).toEqual([]);
	});

	it('follows an operator once known: the offsite line and the retake summary', async () => {
		serve();
		const screen = render(VolumePageHost);
		await new Promise((r) => setTimeout(r, 150));
		expect(rec.to('GET /collections/{collection_id}/offsite')).toHaveLength(0);
		authStore.setSession(OPERATOR);
		await expect.poll(() => rec.to('GET /collections/{collection_id}/offsite').length).toBeGreaterThan(0);
		await expect.poll(() => rec.to('GET /records/to-retake/summary').length).toBeGreaterThan(0);
		await expect.poll(() => screen.container.querySelector('.offsite-indicator')).not.toBeNull();
	});
});

describe('an operator with the stored user, unchanged', () => {
	it('sends the same requests in the same order on first paint', async () => {
		authStore.setSession(OPERATOR);
		serve();
		render(VolumePageHost);
		await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
		await new Promise((r) => setTimeout(r, 150));
		expect(rec.requests.map((r) => `${r.method} ${r.template}`)).toEqual(BASELINE);
	});
});

// What the operator's page sent, in order, before this round's change.
const BASELINE: string[] = [
	'GET /system/catalogue-backup',
	'GET /collections/{collection_id}/offsite',
	'GET /records/to-retake/summary',
	'GET /records/',
	'GET /system/unit'
];

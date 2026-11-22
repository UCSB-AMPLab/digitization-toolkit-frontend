// "Copy to USB drive" on the volume page (NEH-391): shown to the testing
// account and the administrator on a testing volume, to nobody else, and the
// requests it makes.
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
			get data() {
				return nav.data;
			}
		})
	};
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import {
	recordRequests,
	TESTING_UNIT,
	TESTING_USER,
	type Recorder
} from '$lib/test-support/testing-routes';
import CollectionPage from './+page.svelte';

const records = [{ id: 1, title: 'Folio 1', status: 'captured', sequence: 1, images: [] }];
const STICK = {
	name: '/dev/sda1',
	label: 'PRACTICE',
	size: 29_800_000_000,
	fstype: 'exfat',
	free_bytes: 1
};
const ADMIN = { id: 1, username: 'admin', email: null, role: 'admin' as const, is_active: true };

let rec: Recorder;
function renderPage(handlers: { [route: string]: object } = {}) {
	rec = recordRequests({
		'GET /system/unit': TESTING_UNIT,
		'GET /records/': records,
		'GET /records/{rec_id}/annotations': [],
		...handlers
	} as never);
	const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
	return render(CollectionPage, { context: volumeTopbarContext(slot) });
}
const button = () => page.getByRole('button', { name: en.testing_usb_copy });

beforeEach(() => {
	locale.set('en');
	resetUnit();
	nav.data = { projectName: 'Practice', collectionName: 'Tomo', collectionTesting: true };
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('the action', () => {
	it('is offered to the testing account on a testing volume, next to Download pictures', async () => {
		authStore.setSession(TESTING_USER);
		renderPage();
		await expect.element(page.getByText('Folio 1')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: en.testing_download_pictures }))
			.toBeVisible();
		await expect.element(button()).toBeVisible();
	});

	it('is offered to the administrator on a testing volume', async () => {
		authStore.setSession(ADMIN);
		renderPage({ 'GET /records/to-retake/summary': {} });
		await expect.element(page.getByText('Folio 1')).toBeInTheDocument();
		await expect.element(button()).toBeVisible();
	});

	it('is not offered on a real volume', async () => {
		nav.data = { ...nav.data, collectionTesting: false };
		authStore.setSession(ADMIN);
		renderPage();
		await expect.element(page.getByText('Folio 1')).toBeInTheDocument();
		expect(button().elements()).toHaveLength(0);
	});

	for (const role of ['operator', 'reviewer'] as const) {
		it(`is not offered to a ${role}, which makes no request for it`, async () => {
			authStore.setSession({ id: 5, username: role, email: null, role, is_active: true });
			renderPage();
			await expect.element(page.getByText('Folio 1')).toBeInTheDocument();
			await new Promise((r) => setTimeout(r, 100));
			expect(button().elements()).toHaveLength(0);
			expect(rec.to('GET /system/testing/usb')).toHaveLength(0);
			expect(rec.requests.filter((r) => r.path.includes('usb'))).toEqual([]);
		});
	}
});

describe('the requests', () => {
	for (const [name, user] of [
		['the testing account', TESTING_USER],
		['the administrator', ADMIN]
	] as const) {
		it(`go to the three routes for ${name}, none refused`, async () => {
			authStore.setSession(user);
			renderPage({
				'GET /system/testing/usb': { drives: [STICK] },
				'POST /collections/{collection_id}/usb-copy': { job_id: 'j9' },
				'GET /collections/{collection_id}/usb-copy/status/{job_id}': {
					job_id: 'j9',
					collection_id: 7,
					state: 'done',
					done: 1,
					total: 1,
					bytes_done: 5,
					bytes_total: 5,
					error: null,
					message: '',
					folder: 'tomo',
					drive: '/dev/sda1',
					skipped: { not_regular: 0, outside: 0, missing: 0 },
					unmounted: true
				}
			});
			await expect.element(page.getByText('Folio 1')).toBeInTheDocument();
			await button().click();
			await page.getByRole('button', { name: en.testing_usb_start, exact: true }).click();
			await expect.element(page.getByText(en.testing_usb_done('tomo'))).toBeVisible();
			expect(rec.to('GET /system/testing/usb')).toHaveLength(1);
			expect(rec.to('POST /collections/{collection_id}/usb-copy')[0].body).toEqual({
				device: '/dev/sda1'
			});
			expect(rec.to('GET /collections/{collection_id}/usb-copy/status/{job_id}')[0].path).toBe(
				'/collections/7/usb-copy/status/j9'
			);
			// The administrator's page also reads routes the table keeps from the testing account.
			expect(rec.refused.filter((r) => r.path.includes('usb'))).toEqual([]);
			if (user === TESTING_USER) expect(rec.refusedList()).toEqual([]);
		});
	}
});

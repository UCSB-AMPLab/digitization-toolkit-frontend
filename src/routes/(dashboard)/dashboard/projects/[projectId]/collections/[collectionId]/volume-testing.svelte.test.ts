// The volume page for the testing account (NEH-391): its top bar has the
// Capture button and the volume's removal date, and no offsite line; the
// page offers "Download pictures" in place of the export chooser, has no
// review or recapture-turn controls, and sends nothing the backend refuses
// it, on mount, on a timer or after an action. The operator's page stays as
// it was.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';

const nav = vi.hoisted(() => ({
	data: {} as { [k: string]: unknown },
	goto: null as unknown as ReturnType<typeof vi.fn>
}));
vi.mock('$app/navigation', () => {
	nav.goto = vi.fn();
	return { goto: nav.goto };
});
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
import { formatApiDate } from '$lib/format-date';
import { volumeTopbarContext, type VolumeTopbarSlot } from '$lib/volume-topbar';
import {
	recordRequests,
	TESTING_UNIT,
	TESTING_USER,
	type Recorder
} from '$lib/test-support/testing-routes';
import Layout from './+layout@.svelte';
import CollectionPage from './+page.svelte';

const DAY = 24 * 60 * 60 * 1000;
const children = createRawSnippet(() => ({ render: () => '<p>volume</p>' }));

const image = (id: number) => ({
	id,
	filename: `p${id}.jpg`,
	format: 'jpg',
	is_current: true,
	role: 'single'
});
const records = [1, 2].map((id) => ({
	id,
	title: `Folio ${id}`,
	status: 'captured',
	sequence: id,
	images: [image(id * 10)]
}));

function handlers() {
	return {
		'GET /system/unit': TESTING_UNIT,
		'GET /records/': records,
		'GET /records/{rec_id}/annotations': [],
		'GET /records/images/{img_id}/file': () =>
			new Response(new Blob(['jpeg']), { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
	} as never;
}

let rec: Recorder;

beforeEach(() => {
	locale.set('en');
	resetUnit();
	nav.data = {
		projectName: 'Practice',
		collectionName: 'Tomo practice',
		collectionTestingExpiresAt: new Date(Date.now() + 3 * DAY).toISOString()
	};
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('volume top bar, testing account', () => {
	beforeEach(() => authStore.setSession(TESTING_USER));

	it('shows Capture and the removal date, and no offsite line, and requests nothing refused', async () => {
		rec = recordRequests(handlers());
		const screen = render(Layout, { children });
		await expect.element(page.getByRole('button', { name: en.col_live_preview })).toBeVisible();
		const when = formatApiDate(nav.data.collectionTestingExpiresAt as string, 'en', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
		await expect.element(page.getByText(en.testing_expires_on(when))).toBeVisible();
		expect(screen.container.querySelector('.testing-expiry')?.classList.contains('soon')).toBe(
			true
		);
		await new Promise((r) => setTimeout(r, 150));
		expect(screen.container.querySelector('.offsite-indicator')).toBeNull();
		expect(rec.refusedList()).toEqual([]);
		await page.getByRole('button', { name: en.col_live_preview }).click();
		expect(nav.goto).toHaveBeenCalledWith('/live-preview?projectId=1&collectionId=7');
	});

	it('shows no warning colour when the date is further than seven days', async () => {
		nav.data = {
			...nav.data,
			collectionTestingExpiresAt: new Date(Date.now() + 30 * DAY).toISOString()
		};
		rec = recordRequests(handlers());
		const screen = render(Layout, { children });
		await expect.poll(() => screen.container.querySelector('.testing-expiry')).not.toBeNull();
		expect(screen.container.querySelector('.testing-expiry')?.classList.contains('soon')).toBe(
			false
		);
	});
});

describe('volume page, testing account', () => {
	beforeEach(() => authStore.setSession(TESTING_USER));

	function renderPage() {
		const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
		const screen = render(CollectionPage, { context: volumeTopbarContext(slot) });
		return { screen, slot };
	}

	it('offers Download pictures and no export chooser, and no hand-over', async () => {
		rec = recordRequests(handlers());
		const { slot } = renderPage();
		await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: en.testing_download_pictures }))
			.toBeVisible();
		expect(page.getByRole('button', { name: en.col_export }).elements()).toHaveLength(0);
		expect(slot.actions).toBeNull();
		expect(rec.refusedList()).toEqual([]);
	});

	it('downloads the pictures from the file route only', async () => {
		rec = recordRequests(handlers());
		renderPage();
		await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
		await page.getByRole('button', { name: en.testing_download_pictures }).click();
		await expect
			.poll(() => rec.to('GET /records/images/{img_id}/file').map((r) => r.path))
			.toEqual(['/records/images/10/file', '/records/images/20/file']);
		await expect.poll(() => vi.mocked(HTMLAnchorElement.prototype.click).mock.calls.length).toBe(1);
		expect(rec.refusedList()).toEqual([]);
	});

	it('has no Comments tab in the spread view, and requests nothing refused there', async () => {
		rec = recordRequests(handlers());
		renderPage();
		await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
		await page.getByText('Folio 1').click();
		await expect.element(page.getByRole('button', { name: en.col_tab_info })).toBeVisible();
		expect(page.getByRole('button', { name: en.col_tab_comments }).elements()).toHaveLength(0);
		await new Promise((r) => setTimeout(r, 100));
		expect(rec.refusedList()).toEqual([]);
	});
});

describe('volume page, operator, unchanged', () => {
	beforeEach(() =>
		authStore.setSession({ id: 5, username: 'op', email: null, role: 'operator', is_active: true })
	);

	it('the top bar reads the offsite copy and shows no removal date', async () => {
		rec = recordRequests(handlers());
		const screen = render(Layout, { children });
		await expect.element(page.getByRole('button', { name: en.col_live_preview })).toBeVisible();
		await expect
			.poll(() => rec.to('GET /collections/{collection_id}/offsite').length)
			.toBeGreaterThan(0);
		await expect.poll(() => screen.container.querySelector('.offsite-indicator')).not.toBeNull();
		expect(screen.container.querySelector('.testing-expiry')).toBeNull();
	});

	it('the page reads the retake summary and offers the export chooser and Comments', async () => {
		rec = recordRequests(handlers());
		const slot: VolumeTopbarSlot = { actions: null, reloadRecords: null };
		render(CollectionPage, { context: volumeTopbarContext(slot) });
		await expect.element(page.getByText('Folio 2')).toBeInTheDocument();
		await expect.poll(() => rec.to('GET /records/to-retake/summary').length).toBeGreaterThan(0);
		await expect.element(page.getByRole('button', { name: en.col_export })).toBeVisible();
		expect(
			page.getByRole('button', { name: en.testing_download_pictures }).elements()
		).toHaveLength(0);
		await expect.poll(() => slot.actions).not.toBeNull();
		await page.getByText('Folio 1').click();
		await expect.element(page.getByRole('button', { name: en.col_tab_comments })).toBeVisible();
	});
});

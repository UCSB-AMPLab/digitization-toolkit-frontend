// The "Copy to USB drive" dialog (NEH-391): the drive list, the copy's
// progress, its end and each failure, in both languages, and the polling
// that stops when the dialog closes or is destroyed.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import {
	recordRequests,
	refusal,
	TESTING_USER,
	type Recorder,
	type RecordedRequest
} from '$lib/test-support/testing-routes';
import { formatBytes } from '$lib/format-bytes';
import type { UsbCopyStatus, UsbDrive } from '$lib/api';
import UsbCopyDialog from './UsbCopyDialog.svelte';

const STICK: UsbDrive = {
	name: '/dev/sda1',
	label: 'PRACTICE',
	size: 29_800_000_000,
	fstype: 'exfat',
	free_bytes: 1_000_000
};
const OTHER: UsbDrive = {
	name: '/dev/sdb1',
	label: null,
	size: 14_900_000_000,
	fstype: 'vfat',
	free_bytes: null
};

const status = (over: Partial<UsbCopyStatus> = {}): UsbCopyStatus => ({
	job_id: 'j1',
	collection_id: 7,
	state: 'running',
	done: 3,
	total: 10,
	bytes_done: 30_000_000,
	bytes_total: 100_000_000,
	error: null,
	message: 'Backend English text that is never shown.',
	folder: 'tomo-practice',
	drive: '/dev/sda1',
	skipped: { not_regular: 0, outside: 0, missing: 0 },
	unmounted: true,
	...over
});

const LIST = 'GET /system/testing/usb';
const START = 'POST /collections/{collection_id}/usb-copy';
const POLL = 'GET /collections/{collection_id}/usb-copy/status/{job_id}';

let rec: Recorder;
const onClose = vi.fn();

function open(handlers: { [route: string]: object | ((r: RecordedRequest) => unknown) }, id = 7) {
	rec = recordRequests(handlers as never);
	return render(UsbCopyDialog, { collectionId: id, onClose });
}

beforeEach(() => {
	locale.set('en');
	authStore.setSession(TESTING_USER);
	onClose.mockReset();
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('the drive list', () => {
	it('says it is loading while the list is requested', async () => {
		let release: (v: unknown) => void = () => {};
		open({ [LIST]: () => new Promise((r) => (release = r)) });
		await expect.element(page.getByText(en.testing_usb_loading)).toBeVisible();
		release({ drives: [] });
		await expect.element(page.getByText(en.testing_usb_none)).toBeVisible();
	});

	it('tells the person to plug in a drive and press Refresh when there is none, and Refresh asks again', async () => {
		let n = 0;
		open({ [LIST]: () => ({ drives: n++ === 0 ? [] : [STICK] }) });
		await expect.element(page.getByText(en.testing_usb_none)).toBeVisible();
		expect(en.testing_usb_none).toMatch(/FAT32 or exFAT/);
		await page.getByRole('button', { name: en.testing_usb_refresh }).click();
		await expect.element(page.getByRole('radio')).toBeVisible();
		expect(rec.to(LIST)).toHaveLength(2);
	});

	it('preselects the only drive and shows its label, size and file system', async () => {
		open({ [LIST]: { drives: [STICK] } });
		const radio = page.getByRole('radio');
		await expect.element(radio).toBeChecked();
		await expect
			.element(
				page.getByText(en.testing_usb_drive('PRACTICE', formatBytes(STICK.size, 'en'), 'exfat'))
			)
			.toBeVisible();
	});

	it('names a drive without a label by its device and preselects none of several', async () => {
		open({ [LIST]: { drives: [STICK, OTHER] } });
		await expect
			.element(
				page.getByText(en.testing_usb_drive('/dev/sdb1', formatBytes(OTHER.size, 'en'), 'vfat'))
			)
			.toBeVisible();
		expect(page.getByRole('radio').elements()).toHaveLength(2);
		await expect.element(page.getByRole('radio').first()).not.toBeChecked();
		await expect.element(page.getByRole('button', { name: en.testing_usb_start })).toBeDisabled();
	});

	it('shows a line when the list cannot be read', async () => {
		open({ [LIST]: refusal(500, 'x') });
		await expect.element(page.getByText(en.testing_usb_err_list)).toBeVisible();
	});
});

describe('the copy', () => {
	it('starts with the chosen device, then shows files and bytes, and the line about closing', async () => {
		open({
			[LIST]: { drives: [STICK, OTHER] },
			[START]: () => ({ job_id: 'j1' }),
			[POLL]: status()
		});
		await page.getByRole('radio').nth(1).click();
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_files(3, 10))).toBeVisible();
		expect(rec.to(START)[0].body).toEqual({ device: '/dev/sdb1' });
		expect(rec.to(START)[0].path).toBe('/collections/7/usb-copy');
		const bar = page.getByRole('progressbar');
		await expect.element(bar).toHaveAttribute('value', '30000000');
		await expect.element(bar).toHaveAttribute('max', '100000000');
		await expect.element(page.getByText(en.testing_usb_close_note)).toBeVisible();
		expect(rec.to(POLL)[0].path).toBe('/collections/7/usb-copy/status/j1');
		expect(rec.refusedList()).toEqual([]);
	});

	it('names the folder when done and says the drive can be removed only without an error', async () => {
		open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status({ state: 'done', done: 10, bytes_done: 100_000_000 })
		});
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_done('tomo-practice'))).toBeVisible();
		await expect.element(page.getByText(en.testing_usb_safe)).toBeVisible();
	});

	it("shows no line of the backend's own message", async () => {
		open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status({ state: 'failed', error: 'usb_full' })
		});
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_err_full)).toBeVisible();
		expect(page.getByText('Backend English text').elements()).toHaveLength(0);
	});

	it('names the folder alone when done but the drive was not unmounted', async () => {
		open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status({ state: 'done', unmounted: false })
		});
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_done('tomo-practice'))).toBeVisible();
		expect(page.getByText(en.testing_usb_safe).elements()).toHaveLength(0);
	});

	it('does not say the drive can be removed when done carries an error', async () => {
		open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status({ state: 'done', error: 'usb_unmount', unmounted: true })
		});
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_done('tomo-practice'))).toBeVisible();
		expect(page.getByText(en.testing_usb_safe).elements()).toHaveLength(0);
	});

	it('counts the pictures skipped as missing, not regular or outside', async () => {
		open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status({ state: 'done', skipped: { not_regular: 1, outside: 1, missing: 1 } })
		});
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_skipped(3))).toBeVisible();
	});

	it('treats a status without a skipped object as none skipped', async () => {
		open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: { ...status({ state: 'done' }), skipped: undefined }
		});
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_safe)).toBeVisible();
	});

	it('says nothing of skipped pictures when none were skipped', async () => {
		open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status({ state: 'done' })
		});
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_safe)).toBeVisible();
		expect(page.getByText(/could not be copied/).elements()).toHaveLength(0);
	});

	for (const code of [
		'usb_mount',
		'usb_full',
		'usb_write',
		'usb_name',
		'usb_unmount',
		'usb_volume_empty',
		'usb_read',
		'usb_exists'
	] as const) {
		for (const [tag, cat, loc] of [
			['English', en, 'en'],
			['Spanish', es, 'es']
		] as const) {
			it(`shows the ${tag} message for ${code} from the status`, async () => {
				locale.set(loc);
				open({
					[LIST]: { drives: [STICK] },
					[START]: { job_id: 'j1' },
					[POLL]: status({ state: 'failed', error: code })
				});
				await page.getByRole('button', { name: cat.testing_usb_start }).click();
				await expect
					.element(
						page.getByText(cat[`testing_usb_err_${code.slice(4)}` as keyof typeof en] as string)
					)
					.toBeVisible();
			});
		}
	}

	it('says the pictures were copied and the drive was not released for usb_unmount', () => {
		expect(en.testing_usb_err_unmount).toMatch(/copied/);
		expect(en.testing_usb_err_unmount).toMatch(/administrator/);
	});

	for (const [code, status_, key] of [
		['usb_copy_busy', 409, 'testing_usb_err_copy_busy'],
		['usb_not_eligible', 422, 'testing_usb_err_not_eligible'],
		['usb_real_volume', 409, 'testing_usb_err_real_volume'],
		['testing_volume_busy', 409, 'testing_usb_err_volume_busy'],
		['not_found', 404, 'testing_err_not_found']
	] as const) {
		for (const [tag, cat, loc] of [
			['English', en, 'en'],
			['Spanish', es, 'es']
		] as const) {
			it(`shows the ${tag} message for ${code} refused on start`, async () => {
				locale.set(loc);
				open({ [LIST]: { drives: [STICK] }, [START]: refusal(status_, code) });
				await page.getByRole('button', { name: cat.testing_usb_start }).click();
				await expect.element(page.getByText(cat[key] as string)).toBeVisible();
				expect(rec.to(POLL)).toHaveLength(0);
			});
		}
	}
});

describe('a status request that fails', () => {
	const failing = (n: number, then: () => unknown) => {
		let calls = 0;
		return () => (++calls <= n ? refusal(500, 'x') : then());
	};
	async function started(poll: (r: RecordedRequest) => unknown) {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const screen = open({
			[LIST]: { drives: [STICK], active: null },
			[START]: { job_id: 'j1' },
			[POLL]: poll
		});
		await vi.waitFor(() => expect(page.getByRole('radio').elements()).toHaveLength(1));
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		return screen;
	}

	it('is not a failed copy: one rejected poll and then a done status shows done', async () => {
		await started(failing(1, () => status({ state: 'done' })));
		await vi.advanceTimersByTimeAsync(700);
		await vi.advanceTimersByTimeAsync(700);
		await vi.waitFor(() =>
			expect(page.getByText(en.testing_usb_done('tomo-practice')).elements()).toHaveLength(1)
		);
		expect(page.getByText(en.testing_usb_status_unreachable).elements()).toHaveLength(0);
	});

	it('shows the unreachable line after three in a row, and a later success removes it', async () => {
		await started(failing(3, () => status()));
		for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(700);
		await vi.waitFor(() =>
			expect(page.getByText(en.testing_usb_status_unreachable).elements()).toHaveLength(1)
		);
		await vi.advanceTimersByTimeAsync(700);
		await vi.waitFor(() =>
			expect(page.getByText(en.testing_usb_status_unreachable).elements()).toHaveLength(0)
		);
		expect(page.getByText(en.testing_usb_files(3, 10)).elements()).toHaveLength(1);
	});

	for (const [tag, cat, loc] of [
		['English', en, 'en'],
		['Spanish', es, 'es']
	] as const) {
		it(`shows the ${tag} lost-track message on a 404 and polls no more`, async () => {
			locale.set(loc);
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
			open({
				[LIST]: { drives: [STICK], active: null },
				[START]: { job_id: 'j1' },
				[POLL]: refusal(404, 'not_found')
			});
			await vi.waitFor(() => expect(page.getByRole('radio').elements()).toHaveLength(1));
			await page.getByRole('button', { name: cat.testing_usb_start }).click();
			await vi.advanceTimersByTimeAsync(700);
			await vi.waitFor(() =>
				expect(page.getByText(cat.testing_usb_err_lost).elements()).toHaveLength(1)
			);
			const n = rec.to(POLL).length;
			await vi.advanceTimersByTimeAsync(5000);
			expect(rec.to(POLL).length).toBe(n);
		});
	}
});

describe('a copy already running', () => {
	it("is resumed at the progress when it is this volume's, with no POST", async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		open({
			[LIST]: { drives: [STICK], active: { collection_id: 7, job_id: 'jx' } },
			[POLL]: status({ job_id: 'jx' })
		});
		await vi.advanceTimersByTimeAsync(700);
		await vi.waitFor(() =>
			expect(page.getByText(en.testing_usb_files(3, 10)).elements()).toHaveLength(1)
		);
		expect(rec.to(START)).toHaveLength(0);
		expect(rec.to(POLL)[0].path).toBe('/collections/7/usb-copy/status/jx');
		expect(page.getByRole('radio').elements()).toHaveLength(0);
	});

	it("shows the busy text, no list and no Copy button when it is another volume's, and Refresh asks again", async () => {
		let n = 0;
		open({
			[LIST]: () => ({
				drives: [STICK],
				active: n++ === 0 ? { collection_id: 99, job_id: 'jy' } : null
			})
		});
		await expect.element(page.getByText(en.testing_usb_err_copy_busy)).toBeVisible();
		expect(page.getByRole('radio').elements()).toHaveLength(0);
		expect(
			page.getByRole('button', { name: en.testing_usb_start, exact: true }).elements()
		).toHaveLength(0);
		await page.getByRole('button', { name: en.testing_usb_refresh }).click();
		await expect.element(page.getByRole('radio')).toBeVisible();
		expect(page.getByText(en.testing_usb_err_copy_busy).elements()).toHaveLength(0);
	});
});

describe('the start', () => {
	it('sends one POST on a double click', async () => {
		open({
			[LIST]: { drives: [STICK], active: null },
			[START]: () => ({ job_id: 'j1' }),
			[POLL]: status()
		});
		await page.getByRole('button', { name: en.testing_usb_start }).dblClick();
		await expect.element(page.getByText(en.testing_usb_files(3, 10))).toBeVisible();
		expect(rec.to(START)).toHaveLength(1);
	});

	it('returns to the list with the message above it and Copy available when refused', async () => {
		open({ [LIST]: { drives: [STICK], active: null }, [START]: refusal(409, 'usb_copy_busy') });
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await expect.element(page.getByText(en.testing_usb_err_copy_busy)).toBeVisible();
		await expect.element(page.getByRole('radio')).toBeChecked();
		await expect.element(page.getByRole('button', { name: en.testing_usb_start })).toBeEnabled();
	});
});

describe('the volume changes under the dialog', () => {
	it('closes it and stops polling', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const screen = open({
			[LIST]: { drives: [STICK], active: null },
			[START]: { job_id: 'j1' },
			[POLL]: status()
		});
		await vi.waitFor(() => expect(page.getByRole('radio').elements()).toHaveLength(1));
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await vi.advanceTimersByTimeAsync(700);
		await screen.rerender({ collectionId: 8, onClose });
		expect(onClose).toHaveBeenCalledTimes(1);
		const n = rec.to(POLL).length;
		await vi.advanceTimersByTimeAsync(5000);
		expect(rec.to(POLL).length).toBe(n);
	});
});

describe('polling', () => {
	it('polls at the export interval and stops when the dialog is destroyed', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const screen = open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status()
		});
		await vi.waitFor(() => expect(page.getByRole('radio').elements()).toHaveLength(1));
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await vi.advanceTimersByTimeAsync(700);
		await vi.advanceTimersByTimeAsync(700);
		const before = rec.to(POLL).length;
		expect(before).toBeGreaterThanOrEqual(2);
		screen.unmount();
		await vi.advanceTimersByTimeAsync(5000);
		expect(rec.to(POLL).length).toBe(before);
	});

	it('stops when the dialog is closed, and the close does not cancel anything', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const screen = open({
			[LIST]: { drives: [STICK] },
			[START]: { job_id: 'j1' },
			[POLL]: status()
		});
		// The page removes the dialog when it is closed.
		onClose.mockImplementation(() => screen.unmount());
		await vi.waitFor(() => expect(page.getByRole('radio').elements()).toHaveLength(1));
		await page.getByRole('button', { name: en.testing_usb_start }).click();
		await vi.advanceTimersByTimeAsync(700);
		await page.getByRole('button', { name: en.common_close }).click();
		expect(onClose).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000);
		const after = rec.to(POLL).length;
		await vi.advanceTimersByTimeAsync(5000);
		expect(rec.to(POLL).length).toBe(after);
		expect(rec.requests.filter((r) => r.method === 'DELETE')).toEqual([]);
	});
});

// NEH-340: a volume's colour card shots on its page, beside the breadcrumb.
// The flag shows while the volume is asked for shots and they are not all
// there; for the administrator and the operator, "Colour card shots" opens
// a read-only list of the volume's sets (GET .../colour-card, no camera
// read): when, by whom, the outcome, each shot's image or the line that it
// cannot be shown, and where a taken set is on its way offsite. Nothing with
// the setting off; a reviewer gets the flag only.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { ApiError, colourCardApi } from '$lib/api';
import { readColourCardState } from '$lib/colour-card';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import '../../app.css';
import VolumeColourCard from './VolumeColourCard.svelte';

const shot = (camera_index: number, over: Record<string, unknown> = {}) => ({
	id: 10 + camera_index,
	camera_index,
	capture_id: `c-${camera_index}`,
	filename: `co-x-cal_01_c${camera_index}.jpg`,
	preview: true,
	captured_at: '2026-11-22T10:00:00',
	captured_by: 'ana',
	url: `/collections/7/colour-card/shots/${10 + camera_index}/preview`,
	...over
});

const STATE = readColourCardState({
	enabled: true,
	needed: false,
	reason: null,
	status: 'skipped',
	sets: [
		{
			id: 1,
			number: 1,
			outcome: 'taken',
			capture_mode: 'dual',
			cameras: [{ camera_index: 0 }, { camera_index: 1 }],
			opened_at: '2026-11-20T09:00:00',
			opened_by: 'ana',
			completed_at: '2026-11-20T09:05:00',
			completed_by: 'ana',
			shots: [shot(0), shot(1, { preview: false, filename: 'co-x-cal_01_c1.cr2' })],
			delivery: 'waiting',
			delivery_reason: 'file_unstable'
		},
		{
			id: 2,
			number: 2,
			outcome: 'skipped',
			capture_mode: 'dual',
			cameras: [{ camera_index: 0 }, { camera_index: 1 }],
			opened_at: '2026-11-21T09:00:00',
			opened_by: 'luis',
			completed_at: '2026-11-21T09:01:00',
			completed_by: 'luis',
			shots: [],
			delivery: null,
			delivery_reason: null
		}
	]
})!;

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const openBtn = () => page.getByRole('button', { name: en.cc_sets_open });

beforeEach(() => {
	locale.set('en');
	vi.spyOn(colourCardApi, 'shotImageUrl').mockImplementation(() => GIF);
});
afterEach(() => {
	vi.restoreAllMocks();
	document.querySelectorAll('.vcc-backdrop').forEach((n) => n.remove());
});

describe('VolumeColourCard', () => {
	it('the flag, and the sets: when, by whom, outcome, shots and offsite delivery', async () => {
		const read = vi.spyOn(colourCardApi, 'state').mockResolvedValue(STATE);
		const { container } = render(VolumeColourCard, {
			collectionId: 7,
			summary: { enabled: true, status: 'skipped', sets: 1 },
			canOpen: true
		});
		expect(container.querySelector('[data-colour-card-flag]')?.textContent?.trim()).toBe(
			en.cc_flag_skipped
		);
		await openBtn().click();
		const dialog = page.getByRole('dialog', { name: en.cc_sets_title });
		await expect.element(dialog.getByText(en.cc_set_by('ana'))).toBeVisible();
		expect(read).toHaveBeenCalledWith(7, { readCameras: false }, expect.anything());
		const sets = [...document.querySelectorAll('[data-cc-set]')];
		// The newest set first.
		expect(sets.map((s) => s.getAttribute('data-cc-set'))).toEqual(['2', '1']);
		expect(sets[0].textContent).toContain(en.cc_outcome_skipped);
		expect(sets[0].textContent).toContain(en.cc_set_by('luis'));
		expect(sets[1].textContent).toContain(en.cc_outcome_taken);
		expect(sets[1].textContent).toContain(
			en.cc_delivery_waiting_because(en.cc_reason_file_unstable)
		);
		expect(sets[1].querySelectorAll('img').length).toBe(1);
		expect(sets[1].textContent).toContain(en.cc_shot_raw);
		expect(sets[1].textContent).toContain(en.cc_shot_camera(1));
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog).not.toBeInTheDocument();
	});

	it('a volume with no sets says so', async () => {
		vi.spyOn(colourCardApi, 'state').mockResolvedValue({ ...STATE, status: 'none', sets: [] });
		render(VolumeColourCard, {
			collectionId: 7,
			summary: { enabled: true, status: 'none', sets: 0 },
			canOpen: true
		});
		await openBtn().click();
		await expect.element(page.getByText(en.cc_sets_empty)).toBeVisible();
	});

	it('a read that fails says so, with Retry', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const read = vi
			.spyOn(colourCardApi, 'state')
			.mockRejectedValueOnce(new ApiError('x', undefined, 500))
			.mockResolvedValueOnce(STATE);
		render(VolumeColourCard, {
			collectionId: 7,
			summary: { enabled: true, status: 'present', sets: 1 },
			canOpen: true
		});
		await openBtn().click();
		await expect.element(page.getByText(en.cc_err_unread)).toBeVisible();
		await page.getByRole('button', { name: en.common_retry }).click();
		await expect.element(page.getByText(en.cc_set_by('ana'))).toBeVisible();
		expect(read).toHaveBeenCalledTimes(2);
	});

	it('shots present: no flag, the list still opens', async () => {
		vi.spyOn(colourCardApi, 'state').mockResolvedValue(STATE);
		const { container } = render(VolumeColourCard, {
			collectionId: 7,
			summary: { enabled: true, status: 'present', sets: 1 },
			canOpen: true
		});
		expect(container.querySelector('[data-colour-card-flag]')).toBeNull();
		await expect.element(openBtn()).toBeVisible();
	});

	it('a reviewer gets the flag only', async () => {
		const read = vi.spyOn(colourCardApi, 'state');
		const { container } = render(VolumeColourCard, {
			collectionId: 7,
			summary: { enabled: true, status: 'none', sets: 0 },
			canOpen: false
		});
		expect(container.querySelector('[data-colour-card-flag]')).not.toBeNull();
		expect(container.querySelector('button')).toBeNull();
		expect(read).not.toHaveBeenCalled();
	});

	it('nothing with the setting off', async () => {
		const read = vi.spyOn(colourCardApi, 'state');
		const { container } = render(VolumeColourCard, {
			collectionId: 7,
			summary: { enabled: false },
			canOpen: true
		});
		expect(container.textContent?.trim()).toBe('');
		expect(read).not.toHaveBeenCalled();
	});
});

describe('VolumeColourCard: the keyboard focus', () => {
	it('is inside the list of sets once it opens (NEH-423)', async () => {
		vi.spyOn(colourCardApi, 'state').mockResolvedValue(STATE);
		render(VolumeColourCard, {
			collectionId: 7,
			summary: { enabled: true, status: 'skipped', sets: 1 },
			canOpen: true
		});
		await openBtn().click();
		const dialog = page.getByRole('dialog', { name: en.cc_sets_title });
		await expect.element(dialog).toBeVisible();
		await expect.poll(() => dialog.element().contains(document.activeElement)).toBe(true);
	});
});

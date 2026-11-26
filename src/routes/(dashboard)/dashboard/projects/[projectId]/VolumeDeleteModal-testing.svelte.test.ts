// The volume delete dialog (NEH-391): the testing account deletes a testing
// volume whole, with one confirmation line, no stem refusal, no move target
// and no move request; every other role keeps the stem refusal and the move
// select. The 409 `testing_volume_busy` has its own line.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import type { Collection } from '$lib/api';
import { json, recordRequests, refusal, type Recorder } from '$lib/test-support/testing-routes';
import VolumeDeleteModal from './VolumeDeleteModal.svelte';

const volume: Collection = {
	id: 7,
	name: 'Tomo 7',
	project_id: 1,
	created_at: '2026-10-01T00:00:00',
	record_count: 4,
	filename_stem: 'co-t007',
	stem_reserved: true
};
const targets: Collection[] = [
	volume,
	{ id: 8, name: 'Tomo 8', project_id: 1, created_at: '2026-10-01T00:00:00' }
];

let rec: Recorder;
let onClose: Mock<() => void>;
let onChanged: Mock<() => void>;

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

function serve(handlers: { [route: string]: unknown } = {}) {
	rec = recordRequests({
		'GET /records/count': { count: 4 },
		'GET /collections/{collection_id}': volume,
		'DELETE /collections/{collection_id}': json(null),
		...handlers
	} as never);
}

function open() {
	return render(VolumeDeleteModal, { volume, moveTargets: targets, onClose, onChanged });
}

beforeEach(() => {
	locale.set('en');
	onClose = vi.fn<() => void>();
	onChanged = vi.fn<() => void>();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('the testing account', () => {
	it('deletes a reserved volume with records: one confirmation line, no select, one DELETE, no move', async () => {
		signIn('testing');
		serve();
		const screen = open();
		await expect.element(page.getByText(en.testing_delete_volume_confirm)).toBeVisible();
		expect(screen.container.textContent).not.toContain(en.pd_delete_stem_reserved);
		expect(screen.container.querySelector('select')).toBeNull();
		const button = page.getByRole('button', { name: en.pd_delete_collection_title });
		await expect.element(button).toBeEnabled();
		await button.click();
		await expect.poll(() => onClose).toHaveBeenCalled();
		expect(rec.to('DELETE /collections/{collection_id}')).toHaveLength(1);
		expect(rec.to('DELETE /collections/{collection_id}')[0].path).toBe('/collections/7');
		expect(rec.to('POST /collections/{collection_id}/move-records')).toHaveLength(0);
		expect(rec.refusedList()).toEqual([]);
	});

	it('shows its own line for testing_volume_busy, not the generic text', async () => {
		signIn('testing');
		serve({ 'DELETE /collections/{collection_id}': refusal(409, 'testing_volume_busy') });
		const screen = open();
		await page.getByRole('button', { name: en.pd_delete_collection_title }).click();
		await expect.element(page.getByText(en.testing_err_volume_busy)).toBeVisible();
		expect(screen.container.textContent).not.toContain(en.pd_err_delete_collection);
		expect(screen.container.textContent).not.toContain('Backend text that is never shown.');
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe.each(['operator', 'admin'] as const)('the %s', (role) => {
	it('still sees the stem refusal and no testing line', async () => {
		signIn(role);
		serve();
		const screen = open();
		await expect.element(page.getByText(en.pd_delete_stem_reserved)).toBeVisible();
		expect(screen.container.textContent).not.toContain(en.testing_delete_volume_confirm);
		await expect
			.element(page.getByRole('button', { name: en.pd_delete_collection_title }))
			.toBeDisabled();
	});

	it('still sees the move select for a volume with records that reserves no stem', async () => {
		signIn(role);
		serve();
		const screen = render(VolumeDeleteModal, {
			volume: { ...volume, stem_reserved: false },
			moveTargets: targets,
			onClose,
			onChanged
		});
		await expect.element(page.getByLabelText(en.pd_move_label)).toBeVisible();
		expect(screen.container.textContent).not.toContain(en.testing_delete_volume_confirm);
		await expect
			.element(page.getByRole('button', { name: en.pd_delete_collection_title }))
			.toBeDisabled();
	});
});

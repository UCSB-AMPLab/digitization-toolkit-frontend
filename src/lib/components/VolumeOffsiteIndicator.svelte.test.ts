// NEH-248: a bump of `refresh` after a free or a restore ends must reach the
// backend with a request made after the job ended, also when the regular poll
// has a request in flight at that moment.
//
// Version: 0.1.0-beta
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { collectionsApi, systemApi, type VolumeOffsiteState } from '$lib/api';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import VolumeOffsiteIndicator from './VolumeOffsiteIndicator.svelte';

function state(over: Partial<VolumeOffsiteState> = {}): VolumeOffsiteState {
	return {
		collection_id: 7,
		filename_stem: 'co-x',
		uploadable: true,
		total: 10,
		verified: 10,
		pending: 0,
		refused: 0,
		last_verified_at: null,
		received: true,
		refusals: [],
		freed_files: 0,
		freed_bytes: 0,
		...over
	};
}

describe('VolumeOffsiteIndicator — refresh', () => {
	let offsiteSpy: ReturnType<typeof vi.spyOn>;
	let backupSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		backupSpy = vi.spyOn(systemApi, 'getCatalogueBackup').mockReturnValue(new Promise(() => {}));
	});
	afterEach(() => {
		offsiteSpy.mockRestore();
		backupSpy.mockRestore();
	});

	it('a refresh while a request is in flight asks again once it settles, and the later answer wins', async () => {
		let resolveFirst!: (s: VolumeOffsiteState) => void;
		offsiteSpy = vi
			.spyOn(collectionsApi, 'getOffsiteState')
			.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
			.mockResolvedValue(state({ freed_files: 9 }));
		const onState = vi.fn();
		// A getter on a rune, not rerender: rerender replaces every prop at
		// once, which restarts the poll on its own and hides the case.
		let refresh = $state(0);
		render(VolumeOffsiteIndicator, {
			collectionId: 7,
			get refresh() {
				return refresh;
			},
			onState
		});
		await expect.poll(() => offsiteSpy.mock.calls.length).toBe(1);

		refresh = 1;
		flushSync();
		resolveFirst(state());

		await expect.poll(() => offsiteSpy.mock.calls.length).toBe(2);
		await expect.poll(() => onState.mock.lastCall?.[0]?.freed_files).toBe(9);
	});
});

describe('VolumeOffsiteIndicator — a volume Captua keeps on the unit (NEH-320)', () => {
	afterEach(() => vi.restoreAllMocks());

	it('shows the kept line, with no icon and no Fisqua line', async () => {
		locale.set('es');
		vi.spyOn(systemApi, 'getCatalogueBackup').mockReturnValue(new Promise(() => {}));
		const fisqua = { environment: 'staging', config_error: null, held: false, hold_file: '', outbox: [], status: null, decisions: null };
		vi.spyOn(collectionsApi, 'getOffsiteState').mockResolvedValue(
			state({ kept_on_unit: true, verified: 0, pending: 0, received: false, fisqua } as never)
		);
		const screen = render(VolumeOffsiteIndicator, { collectionId: 7 });
		await expect.element(page.getByText(es.offsite_vol_kept)).toBeInTheDocument();
		const line = screen.container.querySelector('.offsite-indicator');
		expect(line?.getAttribute('data-kind')).toBe('kept');
		expect(line?.querySelector('.offsite-indicator-icon')).toBeNull();
		expect(screen.container.textContent).not.toContain(es.fisqua_vol_label);
		expect(screen.container.querySelectorAll('.offsite-indicator')).toHaveLength(1);
	});
});

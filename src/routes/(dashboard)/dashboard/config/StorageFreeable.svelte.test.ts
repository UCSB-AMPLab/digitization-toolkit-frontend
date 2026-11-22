// Settings > Storage for the operator and the list of volumes that can be
// freed (NEH-380). Fixtures are shaped as get_storage_info and
// list_freeable_volumes in app/api/system.py; the plan and the free job as
// app/api/collections.py answers them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
const pageStore = vi.hoisted(() => ({ value: null as null | { set: (v: { url: URL }) => void } }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ url: new URL('http://localhost/dashboard/config?section=storage') });
	pageStore.value = store;
	return { page: store };
});

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import ConfigPage from './+page.svelte';

const GIB = 1024 ** 3;
const GB = 10 ** 9;

function storage(usedGB: number, totalGB: number) {
	return {
		projects_path: '/data/projects',
		is_override: false,
		override_invalid: false,
		total_bytes: totalGB * GIB,
		used_bytes: usedGB * GIB,
		free_bytes: (totalGB - usedGB) * GIB,
		available: true,
		unavailable_reason: null,
		reserve_bytes: 2 * GB,
		usable_free_bytes: (totalGB - usedGB) * GIB - 2 * GB
	};
}

type Row = {
	collection_id: number;
	project_id: number;
	name: string;
	filename_stem: string;
	files: number;
	bytes: number;
	unmeasured_files: number;
};

const ROWS: Row[] = [
	{
		collection_id: 11,
		project_id: 1,
		name: 'Tomo grande',
		filename_stem: 'co-big',
		files: 40,
		bytes: 3_000_000_000,
		unmeasured_files: 0
	},
	{
		collection_id: 12,
		project_id: 1,
		name: 'Tomo chico',
		filename_stem: 'co-small',
		files: 3,
		bytes: 90_000_000,
		unmeasured_files: 0
	}
];

function freeable(rows: Row[], modeAllows = true, restorable?: boolean, jobs: unknown[] = []) {
	return {
		jobs,
		...(restorable === undefined ? {} : { restorable }),
		volumes: rows,
		total: {
			volumes: rows.length,
			files: rows.reduce((n, r) => n + r.files, 0),
			bytes: rows.reduce((n, r) => n + r.bytes, 0),
			unmeasured_files: 0
		},
		mode_allows: modeAllows
	};
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

type Answer = () => Response | Promise<Response>;

interface Served {
	calls: string[];
	freeableAnswers: Answer[];
	storageAnswers: Answer[];
	jobStates: string[];
	/** Set once the job's status has been answered `done`. */
	doneServed: boolean;
}

/** Each route the section uses, answered in turn from its list (the last answer repeats); anything else a 500. */
function serve(
	freeableAnswers: Answer[],
	storageAnswers: Answer[] = [() => json(200, storage(40, 100))],
	jobStates: string[] = ['done']
): Served {
	const served: Served = {
		calls: [],
		freeableAnswers,
		storageAnswers,
		jobStates,
		doneServed: false
	};
	const next = (list: Answer[]) => (list.length > 1 ? list.shift()! : list[0])();
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(String(input instanceof Request ? input.url : input), 'http://localhost');
		const method = (init?.method ?? 'GET').toUpperCase();
		const path = url.pathname.replace(/^\/api/, '');
		served.calls.push(`${method} ${path}`);
		if (method === 'GET' && path === '/system/storage') return next(served.storageAnswers);
		if (method === 'GET' && path === '/system/storage/freeable')
			return next(served.freeableAnswers);
		if (method === 'GET' && path === '/collections/11/offsite/free') {
			return json(200, {
				collection_id: 11,
				filename_stem: 'co-big',
				would_free: { files: 40, bytes: 3_000_000_000 },
				files: [],
				refused: [],
				local_sha1_checked: false
			});
		}
		if (method === 'POST' && path === '/collections/11/offsite/free') {
			return json(202, {
				job_id: 'j1',
				state: 'queued',
				action: 'free',
				status_url: '/collections/11/offsite/jobs/j1'
			});
		}
		if (method === 'GET' && path === '/collections/11/offsite/jobs/j1') {
			const state = served.jobStates.length > 1 ? served.jobStates.shift()! : served.jobStates[0];
			if (state === 'done') served.doneServed = true;
			return json(200, {
				job_id: 'j1',
				collection_id: 11,
				action: 'free',
				state,
				error: null,
				result: {
					collection_id: 11,
					filename_stem: 'co-big',
					freed: { files: 40, bytes: 3_000_000_000 },
					files: [],
					refused: [],
					manifest: null
				}
			});
		}
		return json(500, { detail: 'not in this test' });
	});
	return served;
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

const rows = (container: HTMLElement) =>
	[...container.querySelectorAll('[data-freeable-row]')].map((r) =>
		r.querySelector('[data-freeable-name]')?.textContent?.trim()
	);

beforeEach(() => {
	locale.set('en');
	pageStore.value!.set({ url: new URL('http://localhost/dashboard/config?section=storage') });
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('Settings > Storage per role (NEH-380)', () => {
	it('the operator sees Storage in the list, with the usage figure and the list but none of the drive controls', async () => {
		serve([() => json(200, freeable(ROWS))]);
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_storage, level: 2 }))
			.toBeVisible();
		const names = [...container.querySelectorAll('[data-settings-section]')].map((b) =>
			b.textContent?.trim()
		);
		expect(names).toEqual([
			en.config_section_network,
			en.config_section_language,
			en.config_section_storage
		]);
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim())
			.toBe('40 GB / 100 GB');
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		expect(container.textContent).toContain(en.config_storage_reserve('2'));
		expect(container.textContent).not.toContain(en.config_storage_primary);
		expect(container.textContent).not.toContain(en.config_storage_device);
		expect(container.textContent).not.toContain('/data/projects');
	});

	it('the administrator sees the usage figure, the list and the drive controls', async () => {
		serve([() => json(200, freeable(ROWS))]);
		signIn('admin');
		const { container } = render(ConfigPage);
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		expect(container.textContent).toContain(en.config_storage_primary);
		expect(container.textContent).toContain(en.config_storage_device);
		expect(container.textContent).toContain('/data/projects');
	});

	it('the reviewer asking for Storage gets Network, and no storage request is made', async () => {
		const served = serve([() => json(200, freeable(ROWS))]);
		signIn('reviewer');
		const { container } = render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 }))
			.toBeVisible();
		expect(container.textContent).not.toContain(en.config_storage_used);
		expect(served.calls.filter((c) => c.includes('/system/storage'))).toEqual([]);
	});
});

describe('the list of volumes that can be freed (NEH-380)', () => {
	it('shows each volume, largest first, with its stem and the space it gives back', async () => {
		serve([() => json(200, freeable(ROWS))]);
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		const first = container.querySelector('[data-freeable-row]')!;
		expect(first.textContent).toContain('co-big');
		expect(first.textContent).toContain(en.config_freeable_space(3_000_000_000));
		expect(container.textContent).toContain(en.config_freeable_total(2, 3_090_000_000));
		await expect
			.element(
				browserPage.getByRole('button', { name: en.config_freeable_free_aria('Tomo grande') })
			)
			.toBeVisible();
	});

	it('shows its own text when no volume can be freed', async () => {
		serve([() => json(200, freeable([]))]);
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect.poll(() => container.textContent).toContain(en.config_freeable_empty);
		expect(container.querySelector('[data-freeable-row]')).toBeNull();
		expect(container.textContent).not.toContain(en.config_freeable_error);
	});

	it('shows its own text when the list cannot be read', async () => {
		serve([() => json(500, { detail: 'boom' })]);
		signIn('admin');
		const { container } = render(ConfigPage);
		await expect.poll(() => container.textContent).toContain(en.config_freeable_error);
		expect(container.textContent).not.toContain(en.config_freeable_empty);
	});

	it('in offline mode shows no list and says why', async () => {
		serve([() => json(200, freeable(ROWS, false))]);
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect.poll(() => container.textContent).toContain(en.config_freeable_mode_off);
		expect(container.querySelector('[data-freeable-row]')).toBeNull();
		expect(container.textContent).not.toContain('Tomo grande');
	});

	it('says in its intro that the files cannot be restored on a unit without a read remote, and nothing otherwise', async () => {
		for (const [restorable, shown] of [
			[false, true],
			[true, false],
			[undefined, false]
		] as const) {
			serve([() => json(200, freeable(ROWS, true, restorable))]);
			signIn('operator');
			const { container, unmount } = render(ConfigPage);
			await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
			expect(container.textContent?.includes(en.offsite_free_not_restorable)).toBe(shown);
			expect(container.textContent).not.toContain(en.offsite_free_restorable);
			unmount();
			vi.restoreAllMocks();
		}
	});

	it('opens the freeing dialog for the row, and reads the list and the usage figure again once the job ends', async () => {
		const served = serve(
			[() => json(200, freeable(ROWS)), () => json(200, freeable(ROWS.slice(1)))],
			[() => json(200, storage(90, 100)), () => json(200, storage(87, 100))]
		);
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim())
			.toBe('90 GB / 100 GB');

		await browserPage
			.getByRole('button', { name: en.config_freeable_free_aria('Tomo grande') })
			.click();
		const dialog = browserPage.getByRole('dialog');
		await expect.element(dialog.getByText(en.offsite_manage_intro)).toBeVisible();
		await expect
			.element(dialog.getByRole('button', { name: en.offsite_restore_action }))
			.not.toBeInTheDocument();
		await dialog.getByRole('button', { name: en.offsite_free_action }).click();
		await expect.element(dialog.getByText(en.offsite_free_confirm_title)).toBeVisible();
		await dialog.getByRole('button', { name: en.offsite_free_confirm, exact: true }).click();
		await expect
			.element(dialog.getByText(en.offsite_free_done_title), { timeout: 6000 })
			.toBeVisible();

		await expect.poll(() => rows(container)).toEqual(['Tomo chico']);
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim())
			.toBe('87 GB / 100 GB');
		// The dialog with the job's result stays open while the list changes under it.
		await expect.element(dialog.getByText(en.offsite_free_done_title)).toBeVisible();
		expect(served.calls.filter((c) => c === 'GET /system/storage/freeable')).toHaveLength(2);
		expect(served.calls.filter((c) => c === 'GET /system/storage')).toHaveLength(2);
		expect(served.calls).toContain('POST /collections/11/offsite/free');
		expect(served.calls.some((c) => c.includes('/offsite/restore'))).toBe(false);
	});
});

describe('the section watches a free it started (NEH-380)', () => {
	it('reads the list and the usage again when the job ends, though the dialog was closed while it ran', async () => {
		// The unit answers what it holds: the old list and figure until the job has ended.
		const holder: { served?: Served } = {};
		const ended = () => holder.served?.doneServed === true;
		const served = serve(
			[() => json(200, freeable(ended() ? ROWS.slice(1) : ROWS))],
			[() => json(200, ended() ? storage(87, 100) : storage(90, 100))],
			['running', 'running', 'running', 'done']
		);
		holder.served = served;
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		await browserPage
			.getByRole('button', { name: en.config_freeable_free_aria('Tomo grande') })
			.click();
		const dialog = browserPage.getByRole('dialog');
		await dialog.getByRole('button', { name: en.offsite_free_action }).click();
		await dialog.getByRole('button', { name: en.offsite_free_confirm, exact: true }).click();
		await expect.poll(() => served.calls.includes('POST /collections/11/offsite/free')).toBe(true);
		// Closed while the job runs.
		await dialog.getByRole('button', { name: en.common_close }).click();
		await expect.element(browserPage.getByRole('dialog')).not.toBeInTheDocument();

		await expect.poll(() => rows(container), { timeout: 15000 }).toEqual(['Tomo chico']);
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim(), {
				timeout: 15000
			})
			.toBe('87 GB / 100 GB');
		// The re-read came after the job's end was read.
		const lastJob = served.calls.lastIndexOf('GET /collections/11/offsite/jobs/j1');
		const lastList = served.calls.lastIndexOf('GET /system/storage/freeable');
		expect(lastList).toBeGreaterThan(lastJob);
	}, 30000);

	it('an older usage answer that comes in last does not replace the one read after the free', async () => {
		let releaseFirst: (r: Response) => void = () => {};
		const first = new Promise<Response>((resolve) => (releaseFirst = resolve));
		serve(
			[() => json(200, freeable(ROWS)), () => json(200, freeable(ROWS.slice(1)))],
			[() => first, () => json(200, storage(87, 100))]
		);
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		await browserPage
			.getByRole('button', { name: en.config_freeable_free_aria('Tomo grande') })
			.click();
		const dialog = browserPage.getByRole('dialog');
		await dialog.getByRole('button', { name: en.offsite_free_action }).click();
		await dialog.getByRole('button', { name: en.offsite_free_confirm, exact: true }).click();
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim(), {
				timeout: 15000
			})
			.toBe('87 GB / 100 GB');
		releaseFirst(json(200, storage(90, 100)));
		await new Promise((r) => setTimeout(r, 200));
		expect(container.querySelector('[data-storage-used]')?.textContent?.trim()).toBe(
			'87 GB / 100 GB'
		);
	}, 30000);
});

describe('the section knows the work in progress from the unit (NEH-380)', () => {
	function at(section: string) {
		pageStore.value!.set({ url: new URL(`http://localhost/dashboard/config?section=${section}`) });
	}

	it('leaving Storage while a free runs and coming back before it ends: the watch resumes, and the list and usage are read when it ends', async () => {
		const holder: { served?: Served } = {};
		const ended = () => holder.served?.doneServed === true;
		const running = [{ collection_id: 11, job_id: 'j1', state: 'running' }];
		const served = serve(
			[
				() =>
					json(
						200,
						ended()
							? freeable(ROWS.slice(1))
							: freeable(
									ROWS,
									true,
									undefined,
									holder.served?.calls.includes('POST /collections/11/offsite/free') ? running : []
								)
					)
			],
			[() => json(200, ended() ? storage(87, 100) : storage(90, 100))],
			['running', 'running', 'running', 'running', 'running', 'done']
		);
		holder.served = served;
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		await browserPage
			.getByRole('button', { name: en.config_freeable_free_aria('Tomo grande') })
			.click();
		const dialog = browserPage.getByRole('dialog');
		await dialog.getByRole('button', { name: en.offsite_free_action }).click();
		await dialog.getByRole('button', { name: en.offsite_free_confirm, exact: true }).click();
		await expect.poll(() => served.calls.includes('POST /collections/11/offsite/free')).toBe(true);
		await dialog.getByRole('button', { name: en.common_close }).click();

		// Away to Network, then back to Storage before the job ends.
		at('network');
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 }))
			.toBeVisible();
		at('storage');
		await expect.poll(() => rows(container)).toEqual(['Tomo grande', 'Tomo chico']);
		// The row whose volume is being freed says so, and its button is off.
		const row = () =>
			[...container.querySelectorAll('[data-freeable-row]')].find((r) =>
				r.textContent?.includes('Tomo grande')
			);
		await expect.poll(() => row()?.textContent).toContain(en.offsite_running_free);
		expect(row()?.querySelector('button')?.hasAttribute('disabled')).toBe(true);

		await expect.poll(() => rows(container), { timeout: 20000 }).toEqual(['Tomo chico']);
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim(), {
				timeout: 20000
			})
			.toBe('87 GB / 100 GB');
	}, 40000);

	it('coming back after the job ended: the list and usage are read fresh', async () => {
		const holder: { served?: Served } = {};
		const ended = () => holder.served?.doneServed === true;
		const served = serve(
			[() => json(200, ended() ? freeable(ROWS.slice(1)) : freeable(ROWS))],
			[() => json(200, ended() ? storage(87, 100) : storage(90, 100))],
			['done']
		);
		holder.served = served;
		// An administrator moves between sections of the Unit group, which keeps the section's component mounted.
		signIn('admin');
		const { container } = render(ConfigPage);
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim())
			.toBe('90 GB / 100 GB');
		at('diagnostics');
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_diagnostics, level: 2 }))
			.toBeVisible();
		// The job ended elsewhere while the section was not shown.
		served.doneServed = true;
		at('storage');
		await expect.poll(() => rows(container)).toEqual(['Tomo chico']);
		await expect
			.poll(() => container.querySelector('[data-storage-used]')?.textContent?.trim())
			.toBe('87 GB / 100 GB');
	}, 30000);
});

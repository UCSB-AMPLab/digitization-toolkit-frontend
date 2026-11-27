// Settings → Offsite copy → Offsite settings (NEH-341): the card where an
// administrator brings the unit's bucket and keys, from captua-offsite.txt
// on a mounted USB stick or typed into a form. One test per state of GET
// /system/offsite; each outcome of both saves in English and Spanish; every
// refusal code the card maps, with the field and line forms; the replace
// checkbox; the stick lines; the wait through the restart; the place of the
// card in its section; the link to the Unit mode section, shown while the
// settings are saved, current and the unit is not in Offsite copy only; and the application key in no request but the POST
// body, and nowhere in the page or the browser's storage after a save. The
// routes are mocked, through systemApi or through fetch.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	return { page: writable({ url: new URL('http://localhost/dashboard/config') }) };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import {
	ApiError,
	OFFSITE_SAVE_TIMEOUT_MS,
	REQUEST_TIMEOUT_MS,
	SLOW_REQUEST_TIMEOUT_MS,
	systemApi,
	type OffsiteSaveResult,
	type OffsiteSettings,
	type StorageDevice
} from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { resetUnit } from '$lib/unit-mode';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../../../app.css';
import OffsiteSettingsCard, { OFFSITE_RESTART_WAIT_MS } from './OffsiteSettingsCard.svelte';
import UnitSections from './UnitSections.svelte';

const POLL = 20;
// Obviously fake test values: none of them is a real bucket or key.
const FAKE_BUCKET = 'fake-test-bucket';
const FAKE_KEY_ID = '000fakekeyid0001';
const OTHER_KEY_ID = '000fakekeyid0002';
const FAKE_APP_KEY = 'FAKEappKEYforTESTSonly000';
const FAKE_TENANT = 'archivo-de-prueba';
const FAKE_RECIPIENT = 'age1fakerecipientfortestsonly000000000000000000000000000000';
const MOUNT = '/var/lib/dtk/mounts/STICK1';

function settings(over: Partial<OffsiteSettings> = {}): OffsiteSettings {
	return {
		configured: true,
		bucketName: FAKE_BUCKET,
		tenant: FAKE_TENANT,
		applicationKeyId: FAKE_KEY_ID,
		cataloguePublicKey: FAKE_RECIPIENT,
		restartRequired: false,
		...over
	};
}

const NOT_CONFIGURED = settings({
	configured: false,
	bucketName: null,
	tenant: null,
	applicationKeyId: null,
	cataloguePublicKey: null
});

function device(over: Partial<StorageDevice> = {}): StorageDevice {
	return {
		name: 'sda1',
		path: '/dev/sda1',
		size: '7.5G',
		fstype: 'vfat',
		mountpoint: MOUNT,
		label: 'STICK1',
		removable: true,
		type: 'part',
		...over
	};
}

function refused(detail: Record<string, unknown>, status = 409) {
	return new ApiError('English refusal', { message: 'English refusal', ...detail }, status);
}

const M = { en, es } as const;

/**
 * Whether `needle` appears anywhere in `value`: a string, or any string reached
 * through arrays, Maps, Sets, an Error's message, stack, cause and own
 * properties, or any object's own properties (enumerable or not), nested.
 */
function holds(value: unknown, needle: string, seen = new Set<unknown>()): boolean {
	if (typeof value === 'string') return value.includes(needle);
	if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
		return String(value).includes(needle);
	}
	if (seen.has(value)) return false;
	seen.add(value);
	if (value instanceof Map) {
		return [...value.entries()].some(([k, v]) => holds(k, needle, seen) || holds(v, needle, seen));
	}
	if (value instanceof Set) return [...value].some((v) => holds(v, needle, seen));
	if (value instanceof Error) {
		if ([value.message, value.stack, value.cause].some((v) => holds(v, needle, seen))) return true;
	}
	return Object.getOwnPropertyNames(value).some((name) => {
		let v: unknown;
		try {
			v = (value as Record<string, unknown>)[name];
		} catch {
			return false;
		}
		return holds(name, needle, seen) || holds(v, needle, seen);
	});
}

function unitBody(mode: 'offline' | 'backup' | 'fisqua') {
	return {
		mode,
		projectsEnabled: false,
		projectsShown: false,
		defaultProjectId: 1,
		prerequisites: { backup: [], fisqua: [] }
	};
}

function mount(
	get: OffsiteSettings | (() => Promise<OffsiteSettings>) = settings(),
	devices: StorageDevice[] = [device()],
	props: { restartWaitMs?: number } = {},
	mode: 'offline' | 'backup' | 'fisqua' = 'backup'
) {
	const getSpy =
		typeof get === 'function'
			? vi.spyOn(systemApi, 'getOffsite').mockImplementation(get)
			: vi.spyOn(systemApi, 'getOffsite').mockResolvedValue(get);
	const devicesSpy = vi.spyOn(systemApi, 'getStorageDevices').mockResolvedValue(devices);
	vi.spyOn(systemApi, 'unit').mockResolvedValue(unitBody(mode) as never);
	const screen = render(OffsiteSettingsCard, { pollMs: POLL, ...props });
	return { getSpy, devicesSpy, screen };
}

function ui(l: Locale) {
	const t = M[l];
	return {
		t,
		importBtn: () => page.getByRole('button', { name: t.offsite_set_import, exact: true }),
		enterBtn: () => page.getByRole('button', { name: t.offsite_set_enter, exact: true }),
		saveBtn: () => page.getByRole('button', { name: t.offsite_set_save, exact: true }),
		drive: () => page.getByRole('combobox', { name: t.offsite_set_choose_drive }),
		replace: () => page.getByRole('checkbox', { name: t.offsite_set_replace }),
		field: (label: string) => page.getByLabelText(label, { exact: true })
	};
}

async function fillForm(l: Locale, keyId = FAKE_KEY_ID) {
	const u = ui(l);
	await userEvent.click(u.enterBtn());
	await userEvent.fill(u.field(u.t.offsite_set_bucket), FAKE_BUCKET);
	await userEvent.fill(u.field(u.t.offsite_set_key_id), keyId);
	await userEvent.fill(u.field(u.t.offsite_set_app_key), FAKE_APP_KEY);
	await userEvent.fill(u.field(u.t.offsite_set_tenant), FAKE_TENANT);
	await userEvent.fill(u.field(u.t.offsite_set_public_key), FAKE_RECIPIENT);
}

beforeEach(() => {
	locale.set('es');
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('Offsite settings: what the card shows', () => {
	it('shows the saved values, never a key field filled, and the note on the keys', async () => {
		mount(settings());
		await expect.element(page.getByText(es.offsite_set_title)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_desc)).toBeInTheDocument();
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(page.getByText(FAKE_TENANT)).toBeInTheDocument();
		await expect.element(page.getByText(FAKE_KEY_ID)).toBeInTheDocument();
		await expect.element(page.getByText(FAKE_RECIPIENT)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_key_note)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
	});

	it('says that nothing is saved on a unit without settings', async () => {
		mount(NOT_CONFIGURED);
		await expect.element(page.getByText(es.offsite_set_none)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_key_note)).toBeInTheDocument();
	});

	it('links to the template, as a download', async () => {
		mount();
		const link = page.getByRole('link', { name: es.offsite_set_template });
		await expect.element(link).toBeInTheDocument();
		const el = link.element() as HTMLAnchorElement;
		expect(el.getAttribute('href')).toMatch(/\/system\/offsite\/template$/);
		expect(el.hasAttribute('download')).toBe(true);
	});

	it('offers only the drives mounted directly under the mounts base', async () => {
		mount(settings(), [
			device(),
			device({ name: 'mmcblk0p2', path: '/dev/mmcblk0p2', mountpoint: '/', label: null }),
			device({ name: 'sdb1', path: '/dev/sdb1', mountpoint: '/var/lib/dtk/mounts/a/b' }),
			device({ name: 'sdc1', path: '/dev/sdc1', mountpoint: '/media/elsewhere' }),
			device({ name: 'sdd1', path: '/dev/sdd1', mountpoint: null })
		]);
		const u = ui('es');
		await expect.element(u.drive()).toBeInTheDocument();
		const options = Array.from((u.drive().element() as HTMLSelectElement).options).map(
			(o) => o.value
		);
		expect(options).toEqual([MOUNT]);
		await expect.element(u.importBtn()).toBeEnabled();
	});

	it('says that no drive is mounted, and offers no import', async () => {
		mount(settings(), [device({ mountpoint: null })]);
		const u = ui('es');
		await expect.element(page.getByText(es.offsite_set_no_drive)).toBeInTheDocument();
		await expect.element(u.drive()).not.toBeInTheDocument();
		await expect.element(u.importBtn()).toBeDisabled();
	});

	it('takes the drive list failing as no drive', async () => {
		vi.spyOn(systemApi, 'getOffsite').mockResolvedValue(settings());
		vi.spyOn(systemApi, 'getStorageDevices').mockRejectedValue(new TypeError('Failed to fetch'));
		render(OffsiteSettingsCard, { pollMs: POLL });
		await expect.element(page.getByText(es.offsite_set_no_drive)).toBeInTheDocument();
	});

	it('shows the form with the application key as a password field', async () => {
		mount();
		const u = ui('es');
		await userEvent.click(u.enterBtn());
		const key = u.field(es.offsite_set_app_key).element() as HTMLInputElement;
		expect(key.type).toBe('password');
		expect(key.autocomplete).toBe('off');
		for (const label of [
			es.offsite_set_bucket,
			es.offsite_set_key_id,
			es.offsite_set_tenant,
			es.offsite_set_public_key
		]) {
			await expect.element(u.field(label)).toBeInTheDocument();
		}
	});
});

const OUTCOMES: [OffsiteSaveResult['outcome'], keyof typeof es][] = [
	['restarting', 'offsite_set_saved_restarting'],
	['restart_needed', 'offsite_set_saved_restart_needed'],
	['unchanged', 'offsite_set_unchanged']
];

describe.each(['en', 'es'] as const)('Offsite settings: a save that succeeds (%s)', (l) => {
	beforeEach(() => locale.set(l));

	it.each(OUTCOMES)('import, outcome %s', async (outcome, key) => {
		const { getSpy } = mount();
		const u = ui(l);
		const post = vi.spyOn(systemApi, 'importOffsite').mockImplementation(async () => {
			// An unchanged save leaves the latch clear; any other leaves it set until the restart.
			getSpy.mockResolvedValue(settings({ restartRequired: outcome !== 'unchanged' }));
			return { outcome, stickFile: 'deleted' };
		});
		await userEvent.click(u.importBtn());
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith(MOUNT, false, expect.any(AbortSignal))
		);
		await expect.element(page.getByText(u.t[key] as string)).toBeInTheDocument();
		await expect.element(page.getByText(u.t.offsite_set_stick_deleted)).toBeInTheDocument();
	});

	it.each(OUTCOMES)('form, outcome %s, and the key cleared', async (outcome, key) => {
		const { getSpy } = mount();
		const u = ui(l);
		const post = vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
			// An unchanged save leaves the latch clear; any other leaves it set until the restart.
			getSpy.mockResolvedValue(settings({ restartRequired: outcome !== 'unchanged' }));
			return { outcome, stickFile: null };
		});
		await fillForm(l);
		await userEvent.click(u.saveBtn());
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith(
				{
					bucketName: FAKE_BUCKET,
					applicationKeyId: FAKE_KEY_ID,
					applicationKey: FAKE_APP_KEY,
					tenant: FAKE_TENANT,
					cataloguePublicKey: FAKE_RECIPIENT,
					replace: false
				},
				expect.any(AbortSignal)
			)
		);
		await expect.element(page.getByText(u.t[key] as string)).toBeInTheDocument();
		await expect.element(page.getByText(u.t.offsite_set_stick_deleted)).not.toBeInTheDocument();
		if (outcome === 'restart_needed') {
			// The form is replaced by the restart line, its key with it.
			await expect.element(u.field(u.t.offsite_set_app_key)).not.toBeInTheDocument();
		} else {
			await vi.waitFor(() =>
				expect((u.field(u.t.offsite_set_app_key).element() as HTMLInputElement).value).toBe('')
			);
		}
	});

	it('the stick file that could not be deleted', async () => {
		mount();
		const u = ui(l);
		vi.spyOn(systemApi, 'importOffsite').mockResolvedValue({
			outcome: 'unchanged',
			stickFile: 'not_deleted'
		});
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(u.t.offsite_set_stick_not_deleted)).toBeInTheDocument();
	});

	it('the stick file kept after a refusal', async () => {
		mount();
		const u = ui(l);
		vi.spyOn(systemApi, 'importOffsite').mockRejectedValue(
			refused({ code: 'listing_failed', stickFile: 'kept' })
		);
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(u.t.offsite_set_err_listing)).toBeInTheDocument();
		await expect.element(page.getByText(u.t.offsite_set_stick_kept)).toBeInTheDocument();
	});
});

describe('Offsite settings: while a save runs', () => {
	it('says it is checking and disables every action until the answer', async () => {
		mount();
		const u = ui('es');
		let answer!: (r: OffsiteSaveResult) => void;
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(
			() => new Promise<OffsiteSaveResult>((r) => (answer = r))
		);
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_saving)).toBeInTheDocument();
		await expect.element(u.saveBtn()).toBeDisabled();
		await expect.element(u.importBtn()).toBeDisabled();
		await expect.element(u.drive()).toBeDisabled();
		await expect.element(u.field(es.offsite_set_app_key)).toBeDisabled();
		answer({ outcome: 'unchanged', stickFile: null });
		await expect.element(page.getByText(es.offsite_set_unchanged)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_saving)).not.toBeInTheDocument();
		await expect.element(u.importBtn()).toBeEnabled();
	});

	it('gives the saves a time limit no shorter than the backend can take', () => {
		// The listing (60 s), the schedulers' stop (600 s), the script (900 s,
		// then 30 s and 30 s of grace) and the listing of the saved config (60 s).
		expect(OFFSITE_SAVE_TIMEOUT_MS).toBeGreaterThanOrEqual(1_680_000);
	});

	it.each([
		[
			'saveOffsite',
			() =>
				systemApi.saveOffsite({
					bucketName: FAKE_BUCKET,
					applicationKeyId: FAKE_KEY_ID,
					applicationKey: FAKE_APP_KEY,
					tenant: FAKE_TENANT,
					cataloguePublicKey: FAKE_RECIPIENT,
					replace: false
				})
		],
		['importOffsite', () => systemApi.importOffsite(MOUNT, false)]
	] as const)(
		'%s stays pending past the other limits and ends at OFFSITE_SAVE_TIMEOUT_MS',
		async (_name, call) => {
			vi.useFakeTimers();
			try {
				// A backend that never answers.
				vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
				let settled: unknown = 'pending';
				call().then(
					() => (settled = 'resolved'),
					(e) => (settled = e)
				);
				await vi.advanceTimersByTimeAsync(
					Math.max(REQUEST_TIMEOUT_MS, SLOW_REQUEST_TIMEOUT_MS) + 1
				);
				expect(settled).toBe('pending');
				await vi.advanceTimersByTimeAsync(
					OFFSITE_SAVE_TIMEOUT_MS - Math.max(REQUEST_TIMEOUT_MS, SLOW_REQUEST_TIMEOUT_MS) - 2
				);
				expect(settled).toBe('pending');
				await vi.advanceTimersByTimeAsync(2);
				expect((settled as DOMException).name).toBe('TimeoutError');
			} finally {
				vi.useRealTimers();
			}
		}
	);

	it.each([
		[
			'saveOffsite',
			(signal: AbortSignal) =>
				systemApi.saveOffsite(
					{
						bucketName: FAKE_BUCKET,
						applicationKeyId: FAKE_KEY_ID,
						applicationKey: FAKE_APP_KEY,
						tenant: FAKE_TENANT,
						cataloguePublicKey: FAKE_RECIPIENT,
						replace: false
					},
					signal
				)
		],
		['importOffsite', (signal: AbortSignal) => systemApi.importOffsite(MOUNT, false, signal)]
	] as const)('%s ends the request when the caller aborts', async (_name, call) => {
		let fetchSignal: AbortSignal | undefined;
		vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
			fetchSignal = init?.signal ?? undefined;
			return new Promise<Response>(() => {});
		});
		const ctrl = new AbortController();
		const sent = call(ctrl.signal);
		await vi.waitFor(() => expect(fetchSignal).toBeDefined());
		ctrl.abort();
		await expect(sent).rejects.toBeDefined();
		expect(fetchSignal!.aborted).toBe(true);
	});

	it.each(['form', 'import'] as const)(
		'leaving the page during a %s save aborts the request and empties the key',
		async (kind) => {
			const { screen } = mount();
			const u = ui('es');
			let sentSignal: AbortSignal | undefined;
			const never = () => new Promise<OffsiteSaveResult>(() => {});
			vi.spyOn(systemApi, 'saveOffsite').mockImplementation((_form, signal) => {
				sentSignal = signal;
				return never();
			});
			vi.spyOn(systemApi, 'importOffsite').mockImplementation((_mp, _replace, signal) => {
				sentSignal = signal;
				return never();
			});
			await fillForm('es');
			const keyEl = u.field(es.offsite_set_app_key).element() as HTMLInputElement;
			await userEvent.click(kind === 'form' ? u.saveBtn() : u.importBtn());
			await vi.waitFor(() => expect(sentSignal).toBeDefined());
			expect(sentSignal!.aborted).toBe(false);
			screen.unmount();
			expect(sentSignal!.aborted).toBe(true);
			expect(keyEl.value).toBe('');
		}
	);
});

describe('Offsite settings: a unit that must restart first', () => {
	it.each([
		['with settings', settings({ restartRequired: true })],
		['without settings', { ...NOT_CONFIGURED, restartRequired: true }]
	])('%s: says to restart in place of the actions', async (_name, answer) => {
		mount(answer);
		const u = ui('es');
		await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_key_note)).toBeInTheDocument();
		await expect.element(u.importBtn()).not.toBeInTheDocument();
		await expect.element(u.enterBtn()).not.toBeInTheDocument();
		await expect.element(u.drive()).not.toBeInTheDocument();
		await expect.element(u.saveBtn()).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('link', { name: es.offsite_set_template }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_import_desc)).not.toBeInTheDocument();
	});

	it('still shows the saved values', async () => {
		mount(settings({ restartRequired: true }));
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(page.getByText(FAKE_KEY_ID)).toBeInTheDocument();
	});

	it('sends no save', async () => {
		mount(settings({ restartRequired: true }));
		const save = vi.spyOn(systemApi, 'saveOffsite');
		const imp = vi.spyOn(systemApi, 'importOffsite');
		await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
		expect(save).not.toHaveBeenCalled();
		expect(imp).not.toHaveBeenCalled();
	});

	it('offers the actions when restartRequired is false', async () => {
		mount(settings({ restartRequired: false }));
		const u = ui('es');
		await expect.element(u.importBtn()).toBeInTheDocument();
		await expect.element(u.enterBtn()).toBeInTheDocument();
		await expect
			.element(page.getByText(es.offsite_set_saved_restart_needed))
			.not.toBeInTheDocument();
	});
});

describe('Offsite settings: only the newest read of the settings is applied', () => {
	it('an initial GET answered after a save and its restart wait does not replace the newer settings', async () => {
		let answerFirst!: (s: OffsiteSettings) => void;
		let calls = 0;
		let saved = false;
		const { getSpy } = mount(() => {
			calls += 1;
			if (calls === 1) return new Promise<OffsiteSettings>((r) => (answerFirst = r));
			return Promise.resolve(saved ? settings() : settings({ restartRequired: true }));
		});
		const u = ui('es');
		await expect.element(page.getByText(es.common_loading_ellipsis)).toBeInTheDocument();
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
			saved = true;
			return { outcome: 'restarting', stickFile: null };
		});
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_saved_restarting)).not.toBeInTheDocument();
		const settled = getSpy.mock.calls.length;
		// The first GET, sent on load, answers last, with what the unit had then.
		answerFirst(NOT_CONFIGURED);
		await new Promise((r) => setTimeout(r, POLL * 5));
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
		expect(getSpy.mock.calls.length).toBe(settled);
	});

	it('after an unchanged save, a fresh read fills the values; the held load GET never applies', async () => {
		let answerFirst!: (s: OffsiteSettings) => void;
		let calls = 0;
		const { getSpy } = mount(() => {
			calls += 1;
			if (calls === 1) return new Promise<OffsiteSettings>((r) => (answerFirst = r));
			return Promise.resolve(settings());
		});
		const u = ui('es');
		await expect.element(page.getByText(es.common_loading_ellipsis)).toBeInTheDocument();
		vi.spyOn(systemApi, 'saveOffsite').mockResolvedValue({ outcome: 'unchanged', stickFile: null });
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_unchanged)).toBeInTheDocument();
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		expect(getSpy).toHaveBeenCalledTimes(2);
		answerFirst(NOT_CONFIGURED);
		await new Promise((r) => setTimeout(r, POLL * 5));
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
	});

	it('an initial GET answered after a save does not apply, even with no read since', async () => {
		let answerFirst!: (s: OffsiteSettings) => void;
		let calls = 0;
		mount(() => {
			calls += 1;
			if (calls === 1) return new Promise<OffsiteSettings>((r) => (answerFirst = r));
			// After restart_needed the process that answers has its latch set.
			return Promise.resolve(settings({ restartRequired: true }));
		});
		const u = ui('es');
		vi.spyOn(systemApi, 'saveOffsite').mockResolvedValue({
			outcome: 'restart_needed',
			stickFile: null
		});
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
		answerFirst(NOT_CONFIGURED);
		await new Promise((r) => setTimeout(r, POLL * 5));
		await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
	});
});

// Every way a save ends except `restarting`, and how the test makes it end so.
const SAVE_ENDINGS: [string, 'form' | 'import', () => Promise<OffsiteSaveResult>][] = [
	['unchanged', 'form', async () => ({ outcome: 'unchanged', stickFile: null })],
	['restart_needed', 'import', async () => ({ outcome: 'restart_needed', stickFile: 'deleted' })],
	[
		'refusal file_missing',
		'import',
		async () => {
			throw refused({ code: 'file_missing', stickFile: 'kept' }, 422);
		}
	],
	[
		'refusal listing_failed',
		'form',
		async () => {
			throw refused({ code: 'listing_failed' });
		}
	],
	[
		'refusal not_a_drive',
		'import',
		async () => {
			throw refused({ code: 'not_a_drive' }, 400);
		}
	],
	[
		'network failure',
		'form',
		async () => {
			throw new TypeError('Failed to fetch');
		}
	],
	[
		'timeout',
		'import',
		async () => {
			throw new DOMException('Request failed', 'TimeoutError');
		}
	]
];

describe('Offsite settings: every save ends with a fresh read', () => {
	function holdLoad(fresh: () => Promise<OffsiteSettings>) {
		let answerFirst!: (s: OffsiteSettings) => void;
		let calls = 0;
		const { getSpy } = mount(() => {
			calls += 1;
			if (calls === 1) return new Promise<OffsiteSettings>((r) => (answerFirst = r));
			return fresh();
		});
		return { getSpy, release: (s: OffsiteSettings) => answerFirst(s) };
	}

	async function save(kind: 'form' | 'import', end: () => Promise<OffsiteSaveResult>) {
		const u = ui('es');
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(end);
		vi.spyOn(systemApi, 'importOffsite').mockImplementation(end);
		await expect.element(page.getByText(es.common_loading_ellipsis)).toBeInTheDocument();
		if (kind === 'form') {
			await fillForm('es');
			await userEvent.click(u.saveBtn());
		} else {
			await userEvent.click(u.importBtn());
		}
	}

	it.each(SAVE_ENDINGS)(
		'after %s: one fresh GET settles the values; the held load GET never applies',
		async (name, kind, end) => {
			const { getSpy, release } = holdLoad(async () =>
				settings({ restartRequired: name === 'restart_needed' })
			);
			await save(kind, end);
			await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
			await expect.element(page.getByText(es.common_loading_ellipsis)).not.toBeInTheDocument();
			expect(getSpy).toHaveBeenCalledTimes(2);
			release(NOT_CONFIGURED);
			await new Promise((r) => setTimeout(r, POLL * 5));
			await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
			await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
			expect(getSpy).toHaveBeenCalledTimes(2);
		}
	);

	it.each(SAVE_ENDINGS)(
		'after %s: a fresh GET that fails shows the read failure; the held load GET never applies',
		async (_name, kind, end) => {
			const { getSpy, release } = holdLoad(async () => {
				throw new TypeError('Failed to fetch');
			});
			await save(kind, end);
			await expect.element(page.getByText(es.api_request_failed)).toBeInTheDocument();
			expect(getSpy).toHaveBeenCalledTimes(2);
			release(NOT_CONFIGURED);
			await new Promise((r) => setTimeout(r, POLL * 5));
			await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
			await expect.element(page.getByText(es.api_request_failed)).toBeInTheDocument();
		}
	);

	it('after the restart wait runs out: a fresh GET settles the values; the held load GET never applies', async () => {
		let answerFirst!: (s: OffsiteSettings) => void;
		let calls = 0;
		const { getSpy } = mount(
			() => {
				calls += 1;
				if (calls === 1) return new Promise<OffsiteSettings>((r) => (answerFirst = r));
				return Promise.resolve(settings({ restartRequired: true }));
			},
			[device()],
			{ restartWaitMs: POLL * 10 }
		);
		const u = ui('es');
		vi.spyOn(systemApi, 'saveOffsite').mockResolvedValue({
			outcome: 'restarting',
			stickFile: null
		});
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_saved_restarting)).toBeInTheDocument();
		// No answer during the wait applies (each says restartRequired); then the bound passes.
		await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
		const afterBound = getSpy.mock.calls.length;
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(u.saveBtn()).not.toBeInTheDocument();
		answerFirst(NOT_CONFIGURED);
		await new Promise((r) => setTimeout(r, POLL * 5));
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
		expect(getSpy.mock.calls.length).toBe(afterBound);
	});

	it('after restart_needed, the fresh GET answering restartRequired true keeps the actions gated', async () => {
		const { getSpy } = mount(settings());
		const u = ui('es');
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
			getSpy.mockResolvedValue(settings({ restartRequired: true }));
			return { outcome: 'restart_needed', stickFile: null };
		});
		const calls = getSpy.mock.calls.length;
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBe(calls + 1));
		await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
		await new Promise((r) => setTimeout(r, POLL * 5));
		await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
		await expect.element(u.importBtn()).not.toBeInTheDocument();
		await expect.element(u.enterBtn()).not.toBeInTheDocument();
		await expect.element(u.saveBtn()).not.toBeInTheDocument();
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
	});

	it('unmounting during a save starts no read', async () => {
		const { getSpy, screen } = mount(settings());
		const u = ui('es');
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(
			(_form, signal) =>
				new Promise<OffsiteSaveResult>((_r, reject) =>
					signal?.addEventListener('abort', () => reject(signal.reason))
				)
		);
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_saving)).toBeInTheDocument();
		const calls = getSpy.mock.calls.length;
		screen.unmount();
		await new Promise((r) => setTimeout(r, POLL * 5));
		expect(getSpy.mock.calls.length).toBe(calls);
	});
});

describe('Offsite settings: after outcome restarting', () => {
	it('waits at most five minutes by default', () => {
		expect(OFFSITE_RESTART_WAIT_MS).toBe(5 * 60_000);
	});

	it.each([
		['answers from the old process', async () => settings({ restartRequired: true })],
		[
			'failures',
			async (): Promise<OffsiteSettings> => {
				throw new TypeError('Failed to fetch');
			}
		]
	] as const)(
		'after the bound with only %s, stops polling and says to restart, actions gated',
		async (_name, after) => {
			let saved = false;
			const { getSpy } = mount(async () => (saved ? after() : settings()), [device()], {
				restartWaitMs: POLL * 10
			});
			const u = ui('es');
			vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
				saved = true;
				return { outcome: 'restarting', stickFile: null };
			});
			await fillForm('es');
			await userEvent.click(u.saveBtn());
			await expect.element(page.getByText(es.offsite_set_saved_restarting)).toBeInTheDocument();
			await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
			await expect.element(page.getByText(es.offsite_set_saved_restarting)).not.toBeInTheDocument();
			await expect.element(u.saveBtn()).not.toBeInTheDocument();
			await expect.element(u.importBtn()).not.toBeInTheDocument();
			const calls = getSpy.mock.calls.length;
			await new Promise((r) => setTimeout(r, POLL * 5));
			expect(getSpy.mock.calls.length).toBe(calls);
		}
	);

	it('shows the restart until GET answers from the restarted backend, then its values', async () => {
		let phase: 'before' | 'stale' | 'down' | 'back' = 'before';
		const { getSpy } = mount(async () => {
			if (phase === 'before') return NOT_CONFIGURED;
			if (phase === 'stale') return settings({ restartRequired: true });
			if (phase === 'down') throw new TypeError('Failed to fetch');
			return settings();
		});
		const u = ui('es');
		await expect.element(page.getByText(es.offsite_set_none)).toBeInTheDocument();
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
			phase = 'stale';
			return { outcome: 'restarting', stickFile: null };
		});
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_saved_restarting)).toBeInTheDocument();
		const calls = getSpy.mock.calls.length;
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(calls + 1));
		await expect.element(page.getByText(es.offsite_set_saved_restarting)).toBeInTheDocument();
		await expect.element(u.saveBtn()).toBeDisabled();
		phase = 'down';
		const down = getSpy.mock.calls.length;
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(down + 1));
		await expect.element(page.getByText(es.offsite_set_saved_restarting)).toBeInTheDocument();
		phase = 'back';
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_saved_restarting)).not.toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_none)).not.toBeInTheDocument();
		const settled = getSpy.mock.calls.length;
		await new Promise((r) => setTimeout(r, POLL * 5));
		expect(getSpy.mock.calls.length).toBe(settled);
	});

	it('does not poll after restart_needed, beyond its one fresh read', async () => {
		const { getSpy } = mount();
		const u = ui('es');
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
			getSpy.mockResolvedValue(settings({ restartRequired: true }));
			return { outcome: 'restart_needed', stickFile: null };
		});
		const before = getSpy.mock.calls.length;
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBe(before + 1));
		await new Promise((r) => setTimeout(r, POLL * 5));
		expect(getSpy.mock.calls.length).toBe(before + 1);
	});

	it.each(['form', 'import'] as const)(
		'after restart_needed from the %s, says to restart once, in place of the actions',
		async (kind) => {
			const { getSpy } = mount(settings());
			const u = ui('es');
			const save = vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
				getSpy.mockResolvedValue(settings({ restartRequired: true }));
				return { outcome: 'restart_needed', stickFile: null };
			});
			const imp = vi.spyOn(systemApi, 'importOffsite').mockImplementation(async () => {
				getSpy.mockResolvedValue(settings({ restartRequired: true }));
				return { outcome: 'restart_needed', stickFile: 'deleted' };
			});
			if (kind === 'form') {
				await fillForm('es');
				await userEvent.click(u.saveBtn());
			} else {
				await userEvent.click(u.importBtn());
			}
			await expect.element(page.getByText(es.offsite_set_saved_restart_needed)).toBeInTheDocument();
			expect(document.body.textContent!.split(es.offsite_set_saved_restart_needed).length - 1).toBe(
				1
			);
			await expect.element(u.importBtn()).not.toBeInTheDocument();
			await expect.element(u.enterBtn()).not.toBeInTheDocument();
			await expect.element(u.saveBtn()).not.toBeInTheDocument();
			await expect.element(u.drive()).not.toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: es.offsite_set_template }))
				.not.toBeInTheDocument();
			if (kind === 'import') {
				await expect.element(page.getByText(es.offsite_set_stick_deleted)).toBeInTheDocument();
			}
			expect(save.mock.calls.length + imp.mock.calls.length).toBe(1);
		}
	);
});

// Every code of the mapping, and the line each must show.
const MAPPED: [string, keyof typeof es][] = [
	['busy_capturing', 'offsite_err_busy'],
	['offsite_job_running', 'offsite_err_busy'],
	['offsite_save_running', 'offsite_err_busy'],
	['uploads_still_running', 'offsite_err_busy'],
	['offsite_jobs_still_running', 'offsite_err_busy'],
	['pairing_running', 'offsite_err_pairing'],
	['restart_required', 'offsite_err_restart_first'],
	['apply_unverified', 'offsite_err_unverified'],
	['settings_overridden', 'offsite_err_overridden'],
	['fisqua_linked', 'offsite_err_fisqua'],
	['no_memory_directory', 'offsite_err_unit_not_ready'],
	['rclone_missing', 'offsite_err_unit_not_ready'],
	['script_missing', 'offsite_err_unit_not_ready'],
	['script_too_old', 'offsite_err_unit_not_ready'],
	['offsite_held', 'offsite_err_held'],
	['other_tenant', 'offsite_err_other_tenant'],
	['replace_required', 'offsite_err_replace'],
	['listing_failed', 'offsite_set_err_listing'],
	['saved_credential_unusable', 'offsite_err_saved_key_unusable'],
	['apply_failed', 'offsite_err_not_saved'],
	['not_a_drive', 'offsite_err_not_a_drive'],
	['file_missing', 'offsite_err_file_missing'],
	['file_not_regular', 'offsite_err_file_not_settings'],
	['file_not_text', 'offsite_err_file_not_settings'],
	['file_too_large', 'offsite_err_file_not_settings'],
	['file_unreadable', 'offsite_err_file_unreadable'],
	['file_not_deletable', 'offsite_err_file_not_deletable'],
	['something_new', 'offsite_err_other']
];

const FIELDS: [string, keyof typeof es][] = [
	['BUCKET_NAME', 'offsite_set_bucket'],
	['APPLICATION_KEY_ID', 'offsite_set_key_id'],
	['APPLICATION_KEY', 'offsite_set_app_key'],
	['TENANT', 'offsite_set_tenant'],
	['CATALOGUE_PUBLIC_KEY', 'offsite_set_public_key']
];

const FIELD_CODES = [
	['duplicate_key', 'offsite_err_duplicate'],
	['missing_key', 'offsite_err_missing'],
	['empty_value', 'offsite_err_empty'],
	['bad_value', 'offsite_err_bad_value']
] as const;

describe.each(['en', 'es'] as const)('Offsite settings: refusals (%s)', (l) => {
	beforeEach(() => locale.set(l));

	it.each(MAPPED)('import refused with %s', async (code, key) => {
		mount();
		const u = ui(l);
		vi.spyOn(systemApi, 'importOffsite').mockRejectedValue(
			refused({ code }, code === 'not_a_drive' ? 400 : 409)
		);
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(u.t[key] as string)).toBeInTheDocument();
	});

	it.each(MAPPED)('form refused with %s, and the key cleared', async (code, key) => {
		mount();
		const u = ui(l);
		vi.spyOn(systemApi, 'saveOffsite').mockRejectedValue(refused({ code }));
		await fillForm(l);
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(u.t[key] as string)).toBeInTheDocument();
		await vi.waitFor(() =>
			expect((u.field(u.t.offsite_set_app_key).element() as HTMLInputElement).value).toBe('')
		);
		expect((u.field(u.t.offsite_set_bucket).element() as HTMLInputElement).value).toBe(FAKE_BUCKET);
	});

	for (const [code, msg] of FIELD_CODES) {
		it.each(FIELDS)(`${code} names the field %s by its label`, async (field, label) => {
			mount();
			const u = ui(l);
			vi.spyOn(systemApi, 'saveOffsite').mockRejectedValue(refused({ code, key: field }, 422));
			await fillForm(l);
			await userEvent.click(u.saveBtn());
			await expect.element(page.getByText(u.t[msg](u.t[label] as string))).toBeInTheDocument();
		});
	}

	it.each([
		['bad_line', 'offsite_err_bad_line'],
		['unknown_key', 'offsite_err_unknown_key']
	] as const)('%s names the line of the file', async (code, msg) => {
		mount();
		const u = ui(l);
		vi.spyOn(systemApi, 'importOffsite').mockRejectedValue(
			refused({ code, line: 7, stickFile: 'kept' }, 422)
		);
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(u.t[msg](7))).toBeInTheDocument();
		await expect.element(page.getByText(u.t.offsite_set_stick_kept)).toBeInTheDocument();
	});

	it('a field code without a known key, or a line code without a line, is the generic line', async () => {
		mount();
		const u = ui(l);
		const post = vi
			.spyOn(systemApi, 'importOffsite')
			.mockRejectedValue(refused({ code: 'missing_key', key: 'SOMETHING_ELSE' }, 422));
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(u.t.offsite_err_other)).toBeInTheDocument();
		post.mockRejectedValue(refused({ code: 'bad_line' }, 422));
		await userEvent.click(u.importBtn());
		await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
		await expect.element(page.getByText(u.t.offsite_err_other)).toBeInTheDocument();
	});

	it('a failure with no code (a timeout, a 504) is the generic line', async () => {
		mount();
		const u = ui(l);
		vi.spyOn(systemApi, 'importOffsite').mockRejectedValue(
			new DOMException('Request failed', 'TimeoutError')
		);
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(u.t.offsite_err_other)).toBeInTheDocument();
	});
});

describe('Offsite settings: replacing the stored key', () => {
	it('offers the replace only when the key id typed differs from the saved one', async () => {
		mount(settings());
		const u = ui('es');
		await userEvent.click(u.enterBtn());
		await expect.element(u.replace()).not.toBeInTheDocument();
		await userEvent.fill(u.field(es.offsite_set_key_id), OTHER_KEY_ID);
		await expect.element(u.replace()).toBeInTheDocument();
		await expect.element(page.getByText(es.offsite_set_replace_desc)).toBeInTheDocument();
		await userEvent.fill(u.field(es.offsite_set_key_id), FAKE_KEY_ID);
		await expect.element(u.replace()).not.toBeInTheDocument();
	});

	it('never offers it on a unit with no key id', async () => {
		mount(NOT_CONFIGURED);
		const u = ui('es');
		await fillForm('es', OTHER_KEY_ID);
		await expect.element(u.replace()).not.toBeInTheDocument();
	});

	it('sends replace from the form when checked', async () => {
		mount(settings());
		const u = ui('es');
		const post = vi
			.spyOn(systemApi, 'saveOffsite')
			.mockResolvedValue({ outcome: 'unchanged', stickFile: null });
		await fillForm('es', OTHER_KEY_ID);
		await userEvent.click(u.replace());
		await userEvent.click(u.saveBtn());
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith(
				expect.objectContaining({ applicationKeyId: OTHER_KEY_ID, replace: true }),
				expect.any(AbortSignal)
			)
		);
	});

	it('after replace_required on an import, offers the replace and sends it on the next try', async () => {
		mount(settings());
		const u = ui('es');
		const post = vi
			.spyOn(systemApi, 'importOffsite')
			.mockRejectedValueOnce(refused({ code: 'replace_required', stickFile: 'kept' }))
			.mockResolvedValueOnce({ outcome: 'unchanged', stickFile: 'deleted' });
		await expect.element(u.replace()).not.toBeInTheDocument();
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(es.offsite_err_replace)).toBeInTheDocument();
		await expect.element(u.replace()).toBeInTheDocument();
		await userEvent.click(u.replace());
		await userEvent.click(u.importBtn());
		await vi.waitFor(() =>
			expect(post).toHaveBeenLastCalledWith(MOUNT, true, expect.any(AbortSignal))
		);
		await expect.element(page.getByText(es.offsite_set_stick_deleted)).toBeInTheDocument();
	});

	it('after replace_required on the form, offers the replace even for the same key id', async () => {
		mount(settings());
		const u = ui('es');
		const post = vi
			.spyOn(systemApi, 'saveOffsite')
			.mockRejectedValueOnce(refused({ code: 'replace_required' }))
			.mockResolvedValueOnce({ outcome: 'unchanged', stickFile: null });
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_err_replace)).toBeInTheDocument();
		await userEvent.click(u.replace());
		await userEvent.fill(u.field(es.offsite_set_app_key), FAKE_APP_KEY);
		await userEvent.click(u.saveBtn());
		await vi.waitFor(() =>
			expect(post).toHaveBeenLastCalledWith(
				expect.objectContaining({ replace: true }),
				expect.any(AbortSignal)
			)
		);
	});
});

describe('Offsite settings: saved_credential_unusable offers the replace', () => {
	it('on the form, with the same key id, and sends it on the next try', async () => {
		mount(settings());
		const u = ui('es');
		const post = vi
			.spyOn(systemApi, 'saveOffsite')
			.mockRejectedValueOnce(refused({ code: 'saved_credential_unusable' }))
			.mockResolvedValueOnce({ outcome: 'unchanged', stickFile: null });
		await fillForm('es');
		await expect.element(u.replace()).not.toBeInTheDocument();
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_err_saved_key_unusable)).toBeInTheDocument();
		await expect.element(u.replace()).toBeInTheDocument();
		await userEvent.click(u.replace());
		await userEvent.fill(u.field(es.offsite_set_app_key), FAKE_APP_KEY);
		await userEvent.click(u.saveBtn());
		await vi.waitFor(() =>
			expect(post).toHaveBeenLastCalledWith(
				expect.objectContaining({ applicationKeyId: FAKE_KEY_ID, replace: true }),
				expect.any(AbortSignal)
			)
		);
	});

	it('on an import, and sends it on the next try', async () => {
		mount(settings());
		const u = ui('es');
		const post = vi
			.spyOn(systemApi, 'importOffsite')
			.mockRejectedValueOnce(refused({ code: 'saved_credential_unusable', stickFile: 'kept' }))
			.mockResolvedValueOnce({ outcome: 'unchanged', stickFile: 'deleted' });
		await userEvent.click(u.importBtn());
		await expect.element(page.getByText(es.offsite_err_saved_key_unusable)).toBeInTheDocument();
		await userEvent.click(u.replace());
		await userEvent.click(u.importBtn());
		await vi.waitFor(() =>
			expect(post).toHaveBeenLastCalledWith(MOUNT, true, expect.any(AbortSignal))
		);
	});
});

describe('Offsite settings: the check for the key in what is logged', () => {
	it('finds it inside objects, arrays, Maps, Sets and Error properties, nested', () => {
		const err = new Error('nothing here');
		(err as Error & { body?: unknown }).body = { form: [{ applicationKey: FAKE_APP_KEY }] };
		const hidden = {};
		Object.defineProperty(hidden, 'k', { value: FAKE_APP_KEY, enumerable: false });
		for (const v of [
			{ applicationKey: FAKE_APP_KEY },
			[[FAKE_APP_KEY]],
			new Map([['k', { v: FAKE_APP_KEY }]]),
			new Set([FAKE_APP_KEY]),
			err,
			new Error('x', { cause: { applicationKey: FAKE_APP_KEY } }),
			hidden
		]) {
			expect(holds([v], FAKE_APP_KEY)).toBe(true);
		}
		const loop: Record<string, unknown> = { a: 1 };
		loop.self = loop;
		expect(holds([loop, 'other', 3, null, undefined], FAKE_APP_KEY)).toBe(false);
	});
});

describe('Offsite settings: the application key', () => {
	it('travels only in the body of POST /system/offsite, and is kept nowhere after', async () => {
		type Sent = { url: string; method: string; headers: string; body: string };
		const sent: Sent[] = [];
		const json = (body: unknown, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			});
		// Every argument of every console call, kept as it was passed.
		const logged: unknown[][] = [];
		for (const level of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir'] as const) {
			vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
				logged.push(args);
			});
		}
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const url = String(input instanceof Request ? input.url : input);
			const headers = JSON.stringify(init?.headers ?? {});
			const body = typeof init?.body === 'string' ? init.body : '';
			const method = init?.method ?? 'GET';
			sent.push({ url, method, headers, body });
			if (url.endsWith('/system/storage/devices')) return json([device()]);
			if (url.endsWith('/system/offsite') && method === 'GET') return json(settings());
			if (url.endsWith('/system/offsite') && method === 'POST') {
				// First a refusal, then a save.
				const n = sent.filter((s) => s.method === 'POST').length;
				return n === 1
					? json({ detail: { code: 'listing_failed', message: 'English refusal' } }, 409)
					: json({ outcome: 'unchanged', stickFile: null });
			}
			return json({ detail: 'Not Found' }, 404);
		});
		render(OffsiteSettingsCard, { pollMs: POLL });
		const u = ui('es');
		await fillForm('es');
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_err_listing)).toBeInTheDocument();
		await userEvent.fill(u.field(es.offsite_set_app_key), FAKE_APP_KEY);
		await userEvent.click(u.saveBtn());
		await expect.element(page.getByText(es.offsite_set_unchanged)).toBeInTheDocument();

		const posts = sent.filter((s) => s.method === 'POST' && s.url.endsWith('/system/offsite'));
		expect(posts).toHaveLength(2);
		for (const p of posts) expect(JSON.parse(p.body).applicationKey).toBe(FAKE_APP_KEY);
		for (const s of sent) {
			expect(s.url).not.toContain(FAKE_APP_KEY);
			expect(s.headers).not.toContain(FAKE_APP_KEY);
			if (!posts.includes(s)) expect(s.body).not.toContain(FAKE_APP_KEY);
		}
		expect(logged.filter((args) => holds(args, FAKE_APP_KEY))).toEqual([]);
		expect(window.location.href).not.toContain(FAKE_APP_KEY);
		const stored = [localStorage, sessionStorage]
			.flatMap((s) => Object.keys(s).map((k) => s.getItem(k) ?? ''))
			.join('\n');
		expect(stored).not.toContain(FAKE_APP_KEY);
		expect(document.cookie).not.toContain(FAKE_APP_KEY);
		expect((u.field(es.offsite_set_app_key).element() as HTMLInputElement).value).toBe('');
	});
});

describe('Offsite settings: the place of the card', () => {
	it('is in the offsite-copy section, above the read-only status', async () => {
		vi.spyOn(systemApi, 'getOffsite').mockResolvedValue(settings());
		vi.spyOn(systemApi, 'getStorageDevices').mockResolvedValue([device()]);
		render(UnitSections, { section: 'offsite-copy', canManageDrives: true });
		const section = page.getByText(es.offsite_set_title);
		await expect.element(section).toBeInTheDocument();
		await expect
			.element(page.getByRole('heading', { name: es.backup_section_title, exact: true }))
			.toBeInTheDocument();
		const root = document.getElementById('offsite-copy')!;
		const card = root.querySelector('[data-offsite-settings]')!;
		const status = root.querySelector('.backup-card')!;
		expect(card).not.toBeNull();
		expect(status).not.toBeNull();
		expect(card.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});

describe.each(['en', 'es'] as const)('Offsite settings: the link to Unit mode (%s)', (l) => {
	beforeEach(() => locale.set(l));
	const text =
		l === 'en'
			? 'Choose "Offsite copy only" in Settings › This unit'
			: 'Elige el modo "Solo copia externa" en Configuración › Este equipo';
	const link = () => page.getByRole('link', { name: text, exact: true });

	it('has the approved text in the message table', () => {
		expect((M[l] as Record<string, unknown>).offsite_set_switch_mode).toBe(text);
	});

	it.each(['offline', 'fisqua'] as const)(
		'is shown when configured, no restart is due and the mode is %s',
		async (mode) => {
			mount(settings(), [device()], {}, mode);
			await expect.element(link()).toBeInTheDocument();
		}
	);

	it('points to the unit-mode section', async () => {
		mount(settings(), [device()], {}, 'offline');
		await expect.element(link()).toHaveAttribute('href', '?section=unit-mode');
	});

	it('is not shown when the mode is Offsite copy only', async () => {
		mount(settings(), [device()], {}, 'backup');
		await expect.element(page.getByText(FAKE_BUCKET)).toBeInTheDocument();
		await new Promise((r) => setTimeout(r, POLL * 3));
		expect(link().elements()).toHaveLength(0);
	});

	it('is not shown when nothing is saved', async () => {
		mount(NOT_CONFIGURED, [device()], {}, 'offline');
		await expect.element(page.getByText(M[l].offsite_set_none)).toBeInTheDocument();
		await new Promise((r) => setTimeout(r, POLL * 3));
		expect(link().elements()).toHaveLength(0);
	});

	it('is not shown while a restart is due', async () => {
		mount(settings({ restartRequired: true }), [device()], {}, 'offline');
		await expect.element(page.getByText(M[l].offsite_set_saved_restart_needed)).toBeInTheDocument();
		await new Promise((r) => setTimeout(r, POLL * 3));
		expect(link().elements()).toHaveLength(0);
	});

	it('is not shown while a save runs, and returns when it ends', async () => {
		mount(settings(), [device()], {}, 'offline');
		await expect.element(link()).toBeInTheDocument();
		let answer!: (r: OffsiteSaveResult) => void;
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(
			() => new Promise<OffsiteSaveResult>((r) => (answer = r))
		);
		await fillForm(l);
		await userEvent.click(ui(l).saveBtn());
		await expect.element(page.getByText(M[l].offsite_set_saving)).toBeInTheDocument();
		expect(link().elements()).toHaveLength(0);
		answer({ outcome: 'unchanged', stickFile: null });
		await expect.element(link()).toBeInTheDocument();
	});

	it('is not shown during the restart wait, and returns when a read answers current settings', async () => {
		let phase: 'before' | 'stale' | 'back' = 'before';
		mount(
			async () => (phase === 'stale' ? settings({ restartRequired: true }) : settings()),
			[device()],
			{},
			'offline'
		);
		await expect.element(link()).toBeInTheDocument();
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
			phase = 'stale';
			return { outcome: 'restarting', stickFile: null };
		});
		await fillForm(l);
		await userEvent.click(ui(l).saveBtn());
		await expect.element(page.getByText(M[l].offsite_set_saved_restarting)).toBeInTheDocument();
		expect(link().elements()).toHaveLength(0);
		phase = 'back';
		await expect.element(link()).toBeInTheDocument();
	});

	it('is not shown after restart_needed until a read answers restartRequired false', async () => {
		let latched = false;
		mount(async () => settings({ restartRequired: latched }), [device()], {}, 'offline');
		await expect.element(link()).toBeInTheDocument();
		vi.spyOn(systemApi, 'saveOffsite').mockImplementation(async () => {
			latched = true;
			return { outcome: 'restart_needed', stickFile: null };
		});
		await fillForm(l);
		await userEvent.click(ui(l).saveBtn());
		await expect.element(page.getByText(M[l].offsite_set_saved_restart_needed)).toBeInTheDocument();
		expect(link().elements()).toHaveLength(0);
	});
});

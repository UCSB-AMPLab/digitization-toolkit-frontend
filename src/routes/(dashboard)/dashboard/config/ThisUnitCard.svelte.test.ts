// NEH-347: Settings > This unit. The section's title and description, the
// mode card with its own description, and below it one card with three
// rows: the Captua version (read only; "Not available" for "unknown" or
// none), the time zone (a select of the zones the unit lists, the current
// one selected, saved with its own button, enabled only when the unit can
// set the zone and the choice differs; each refusal by its code), and the
// kind of camera (read only, with a link to Settings > Cameras; left out
// for a backend without the route). Every card shares one time-zone state:
// a card opened while another's save runs ends on the zone that save
// returned. GET /system/unit, GET and PUT
// /system/timezone and GET /system/camera-kind are mocked.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, cameraKindApi, systemApi, type CameraKindWire } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import { resetCameraKind } from '$lib/camera-kind';
import '../../../../app.css';
import ThisUnitCard from './ThisUnitCard.svelte';
import * as thisUnitModule from './ThisUnitCard.svelte';
import UnitSections from './UnitSections.svelte';

const ZONES = ['America/Bogota', 'America/Los_Angeles', 'Europe/Madrid', 'UTC'];

function unit(version?: unknown) {
	return {
		mode: 'offline',
		projectsEnabled: false,
		projectsShown: false,
		defaultProjectId: 1,
		prerequisites: { backup: [], fisqua: [] },
		...(version === undefined ? {} : { version })
	};
}

function tz(over: Partial<{ zone: string | null; zones: string[]; canSet: boolean }> = {}) {
	return { zone: 'America/Bogota', zones: ZONES, canSet: true, ...over };
}

function kind(configured = 'gphoto2'): CameraKindWire {
	return {
		configured,
		source: 'detected',
		stored: null,
		pending_restart: false,
		detected: null,
		connected: { picamera2: 0, gphoto2: 2, chdk: 0 },
		available: { picamera2: true, gphoto2: true, chdk: true },
		mixed: false,
		mismatch: false
	};
}

function refusal(status: number, code: string) {
	return new ApiError('English refusal', { code, message: 'English refusal' }, status);
}

function mockAll(
	opts: {
		version?: unknown;
		tz?: ReturnType<typeof tz> | Error;
		kind?: CameraKindWire | Error;
	} = {}
) {
	vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(opts.version ?? '0.4.0') as never);
	const getTz = vi.spyOn(systemApi, 'getTimezone');
	if (opts.tz instanceof Error) getTz.mockRejectedValue(opts.tz);
	else getTz.mockResolvedValue(opts.tz ?? tz());
	const getKind = vi.spyOn(cameraKindApi, 'get');
	if (opts.kind instanceof Error) getKind.mockRejectedValue(opts.kind);
	else getKind.mockResolvedValue(opts.kind ?? kind());
}

beforeEach(() => {
	authStore.setSession({ id: 1, username: 'admin1', email: null, role: 'admin', is_active: true });
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
	resetCameraKind();
	(thisUnitModule as { resetUnitTimezone?: () => void }).resetUnitTimezone?.();
});

describe('This unit: the approved strings', () => {
	it('has the English and Spanish text', () => {
		expect([en.unit_section_title, es.unit_section_title]).toEqual(['This unit', 'Este equipo']);
		expect(en.unit_section_desc).toBe(
			"This unit's mode, Captua version, time zone and kind of camera."
		);
		expect(es.unit_section_desc).toBe(
			'Aquí están el modo, la versión de Captua, la zona horaria y el tipo de cámara de este equipo.'
		);
		expect(en.unit_mode_card_desc).toBe(
			'Decides what leaves this unit and where its volumes come from. Changing it moves no volume or record.'
		);
		expect(es.unit_mode_card_desc).toBe(
			'Define qué envía Captua fuera de este equipo y de dónde vienen los volúmenes. Cambiar el modo no mueve ningún volumen ni registro.'
		);
		expect([en.this_unit_version, es.this_unit_version]).toEqual([
			'Captua version',
			'Versión de Captua'
		]);
		expect([en.this_unit_version_unknown, es.this_unit_version_unknown]).toEqual([
			'Not available',
			'No disponible'
		]);
		expect([en.this_unit_tz_label, es.this_unit_tz_label]).toEqual(['Time zone', 'Zona horaria']);
		expect(en.this_unit_tz_desc).toBe(
			"Captua uses this time zone for the dates and times on the unit's own screen. Updating Captua keeps it."
		);
		expect(es.this_unit_tz_desc).toBe(
			'Captua usa esta zona horaria para las fechas y horas de la pantalla del propio equipo. La zona se conserva cuando se actualiza Captua.'
		);
		expect([en.this_unit_tz_unknown, es.this_unit_tz_unknown]).toEqual([
			'Not available',
			'No disponible'
		]);
		expect([en.this_unit_tz_save, es.this_unit_tz_save]).toEqual([
			'Save time zone',
			'Guardar la zona horaria'
		]);
		expect([en.this_unit_tz_saved, es.this_unit_tz_saved]).toEqual([
			'Time zone saved.',
			'Zona horaria guardada.'
		]);
		expect(en.this_unit_tz_err_unknown).toBe(
			'Captua does not recognize that time zone. Choose one from the list.'
		);
		expect(es.this_unit_tz_err_unknown).toBe(
			'Captua no reconoce esa zona horaria. Elige una de la lista.'
		);
		expect(en.this_unit_tz_err_unavailable).toBe(
			"This unit's version of Captua cannot change the time zone. Update Captua, then try again."
		);
		expect(es.this_unit_tz_err_unavailable).toBe(
			'Este equipo tiene una versión de Captua que no permite cambiar la zona horaria. Actualiza Captua y vuelve a intentarlo.'
		);
		expect(en.this_unit_tz_err_failed).toBe('The time zone could not be changed. Try again.');
		expect(es.this_unit_tz_err_failed).toBe(
			'No se pudo cambiar la zona horaria. Vuelve a intentarlo.'
		);
		expect([en.this_unit_camera_kind, es.this_unit_camera_kind]).toEqual([
			'Kind of camera',
			'Tipo de cámara'
		]);
		expect([en.this_unit_camera_kind_link, es.this_unit_camera_kind_link]).toEqual([
			'Change it in Settings › Cameras',
			'Cámbialo en Configuración › Cámaras'
		]);
		expect([en.this_unit_camera_kind_unknown, es.this_unit_camera_kind_unknown]).toEqual([
			'Not available',
			'No disponible'
		]);
		expect([en.setup_tz_title, es.setup_tz_title]).toEqual([
			"Choose the unit's time zone",
			'Elige la zona horaria del equipo'
		]);
		expect([en.setup_tz_desc, es.setup_tz_desc]).toEqual([
			'Choose it now, or later in Settings › This unit.',
			'Puedes hacerlo ahora o más tarde, en Configuración › Este equipo.'
		]);
		expect([en.setup_tz_continue, es.setup_tz_continue]).toEqual(['Continue', 'Continuar']);
		expect([en.setup_tz_later, es.setup_tz_later]).toEqual([
			'Set up later',
			'Configurar más tarde'
		]);
	});
});

describe.each([
	['en', en],
	['es', es]
] as const)('This unit (%s)', (lang, msgs) => {
	beforeEach(() => locale.set(lang));

	const select = () => page.getByRole('combobox', { name: msgs.this_unit_tz_label });
	const save = () => page.getByRole('button', { name: msgs.this_unit_tz_save, exact: true });
	const selectEl = () => select().element() as HTMLSelectElement;

	it('has the section title and description, the mode card with its own, and the card below it', async () => {
		mockAll();
		const { container } = render(UnitSections, { section: 'unit-mode', canManageDrives: true });
		await expect
			.element(page.getByRole('heading', { name: msgs.unit_section_title, exact: true }))
			.toBeVisible();
		await expect.element(page.getByText(msgs.unit_section_desc, { exact: true })).toBeVisible();
		await expect.element(page.getByText(msgs.unit_mode_card_desc, { exact: true })).toBeVisible();
		await expect.element(select()).toBeVisible();
		const modes = container.querySelector('.unit-desc')!;
		const card = container.querySelector('[data-this-unit]')!;
		expect(card).not.toBeNull();
		expect(modes.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('shows the three rows: version, time zone and kind of camera', async () => {
		mockAll();
		const { container } = render(ThisUnitCard);
		await expect.element(page.getByText('0.4.0', { exact: true })).toBeVisible();
		await expect.element(page.getByText(msgs.this_unit_version, { exact: true })).toBeVisible();
		await expect.element(page.getByText(msgs.this_unit_tz_desc, { exact: true })).toBeVisible();
		await expect.element(page.getByText(msgs.this_unit_camera_kind, { exact: true })).toBeVisible();
		await expect.element(page.getByText(msgs.camera_kind_gphoto2, { exact: true })).toBeVisible();
		const rows = [...container.querySelectorAll('[data-this-unit-row]')].map((r) =>
			r.getAttribute('data-this-unit-row')
		);
		expect(rows).toEqual(['version', 'timezone', 'camera-kind']);
	});

	for (const version of ['unknown', undefined, 7] as const) {
		it(`shows "${msgs.this_unit_version_unknown}" for a version of ${String(version)}`, async () => {
			vi.spyOn(systemApi, 'unit').mockResolvedValue(
				(version === undefined ? unit() : unit(version)) as never
			);
			vi.spyOn(systemApi, 'getTimezone').mockResolvedValue(tz());
			vi.spyOn(cameraKindApi, 'get').mockResolvedValue(kind());
			const { container } = render(ThisUnitCard);
			await expect.element(select()).toBeVisible();
			await vi.waitFor(() =>
				expect(container.querySelector('[data-this-unit-row="version"]')?.textContent).toContain(
					msgs.this_unit_version_unknown
				)
			);
			expect(container.textContent).not.toContain('unknown');
		});
	}

	it('lists the zones, with the current one selected, and Save disabled until another is chosen', async () => {
		mockAll();
		render(ThisUnitCard);
		await expect.element(select()).toHaveValue('America/Bogota');
		expect([...selectEl().options].map((o) => o.value)).toEqual(ZONES);
		await expect.element(save()).toBeDisabled();
		await userEvent.selectOptions(select(), 'Europe/Madrid');
		await expect.element(save()).toBeEnabled();
		await userEvent.selectOptions(select(), 'America/Bogota');
		await expect.element(save()).toBeDisabled();
	});

	it(`a null zone shows "${msgs.this_unit_tz_unknown}" as a disabled first choice, selected`, async () => {
		mockAll({ tz: tz({ zone: null }) });
		render(ThisUnitCard);
		await expect.element(select()).toBeVisible();
		const first = selectEl().options[0];
		expect(first.textContent?.trim()).toBe(msgs.this_unit_tz_unknown);
		expect(first.disabled).toBe(true);
		expect(selectEl().selectedIndex).toBe(0);
		expect([...selectEl().options].slice(1).map((o) => o.value)).toEqual(ZONES);
		await expect.element(save()).toBeDisabled();
		await userEvent.selectOptions(select(), 'UTC');
		await expect.element(save()).toBeEnabled();
	});

	it('a zone that is not in the list is never a choice: the unknown choice is selected, disabled', async () => {
		mockAll({ tz: tz({ zone: 'Mars/Olympus_Mons' }) });
		const put = vi.spyOn(systemApi, 'setTimezone');
		render(ThisUnitCard);
		await expect.element(select()).toBeVisible();
		const options = [...selectEl().options];
		expect(options[0].textContent?.trim()).toBe(msgs.this_unit_tz_unknown);
		expect(options[0].disabled).toBe(true);
		expect(selectEl().selectedIndex).toBe(0);
		expect(options.map((o) => o.value)).not.toContain('Mars/Olympus_Mons');
		expect(selectEl().textContent).not.toContain('Mars/Olympus_Mons');
		await expect.element(save()).toBeDisabled();
		(save().element() as HTMLButtonElement).click();
		await new Promise((r) => setTimeout(r, 50));
		expect(put).not.toHaveBeenCalled();
	});

	it('a card opened while another card saves ends on the zone that save returned', async () => {
		mockAll();
		let release!: () => void;
		vi.spyOn(systemApi, 'setTimezone').mockImplementation(
			() =>
				new Promise((resolve) => {
					release = () => resolve({ zone: 'Europe/Madrid' });
				})
		);
		const first = render(ThisUnitCard);
		await expect.element(select()).toHaveValue('America/Bogota');
		await userEvent.selectOptions(select(), 'Europe/Madrid');
		await userEvent.click(save());
		await vi.waitFor(() => expect(systemApi.setTimezone).toHaveBeenCalled());
		first.unmount();
		// The GET of the card opened now still reads the zone before the save.
		render(ThisUnitCard);
		await vi.waitFor(() => expect(systemApi.getTimezone).toHaveBeenCalledTimes(2));
		await new Promise((r) => setTimeout(r, 50));
		release();
		await expect.element(select()).toHaveValue('Europe/Madrid');
		await expect.element(save()).toBeDisabled();
	});

	// A GET answered by hand: `answer` resolves it, `fail` rejects it.
	function heldRead() {
		const held = {} as {
			answer: (t: ReturnType<typeof tz>) => void;
			fail: (e: unknown) => void;
			promise: Promise<ReturnType<typeof tz>>;
		};
		held.promise = new Promise((resolve, reject) => {
			held.answer = resolve;
			held.fail = reject;
		});
		return held;
	}

	it('an older read that fails after a newer one answered changes nothing', async () => {
		mockAll();
		const a = heldRead();
		const b = heldRead();
		vi.mocked(systemApi.getTimezone)
			.mockReset()
			.mockReturnValueOnce(a.promise)
			.mockReturnValueOnce(b.promise);
		const first = render(ThisUnitCard);
		await vi.waitFor(() => expect(systemApi.getTimezone).toHaveBeenCalledTimes(1));
		first.unmount();
		render(ThisUnitCard);
		await vi.waitFor(() => expect(systemApi.getTimezone).toHaveBeenCalledTimes(2));
		b.answer(tz());
		await expect.element(select()).toHaveValue('America/Bogota');
		a.fail(new ApiError('timed out', undefined, 504));
		await new Promise((r) => setTimeout(r, 50));
		await expect.element(select()).toBeEnabled();
		await expect.element(select()).toHaveValue('America/Bogota');
		await userEvent.selectOptions(select(), 'UTC');
		await expect.element(save()).toBeEnabled();
	});

	it('a read sent before a save that answers after it does not undo the saved zone', async () => {
		mockAll();
		const stale = heldRead();
		vi.mocked(systemApi.getTimezone)
			.mockReset()
			.mockResolvedValueOnce(tz())
			.mockReturnValueOnce(stale.promise);
		let release!: () => void;
		vi.spyOn(systemApi, 'setTimezone').mockImplementation(
			() =>
				new Promise((resolve) => {
					release = () => resolve({ zone: 'Europe/Madrid' });
				})
		);
		const first = render(ThisUnitCard);
		await expect.element(select()).toHaveValue('America/Bogota');
		await userEvent.selectOptions(select(), 'Europe/Madrid');
		await userEvent.click(save());
		await vi.waitFor(() => expect(systemApi.setTimezone).toHaveBeenCalled());
		first.unmount();
		render(ThisUnitCard);
		await vi.waitFor(() => expect(systemApi.getTimezone).toHaveBeenCalledTimes(2));
		release();
		await expect.element(select()).toHaveValue('Europe/Madrid');
		stale.answer(tz());
		await new Promise((r) => setTimeout(r, 50));
		await expect.element(select()).toHaveValue('Europe/Madrid');
		await expect.element(save()).toBeDisabled();
	});

	it('a save that answers after the reopened card failed to read shows its zone, then reads the list again', async () => {
		mockAll();
		const reopened = heldRead();
		const refreshed = heldRead();
		vi.mocked(systemApi.getTimezone)
			.mockReset()
			.mockResolvedValueOnce(tz())
			.mockReturnValueOnce(reopened.promise)
			.mockReturnValueOnce(refreshed.promise);
		let release!: () => void;
		vi.spyOn(systemApi, 'setTimezone').mockImplementation(
			() =>
				new Promise((resolve) => {
					release = () => resolve({ zone: 'Europe/Madrid' });
				})
		);
		const first = render(ThisUnitCard);
		await expect.element(select()).toHaveValue('America/Bogota');
		await userEvent.selectOptions(select(), 'Europe/Madrid');
		await userEvent.click(save());
		await vi.waitFor(() => expect(systemApi.setTimezone).toHaveBeenCalled());
		first.unmount();
		const { container } = render(ThisUnitCard);
		await vi.waitFor(() => expect(systemApi.getTimezone).toHaveBeenCalledTimes(2));
		reopened.fail(new ApiError('timed out', undefined, 504));
		await vi.waitFor(() =>
			expect(container.querySelector('[data-this-unit-row="timezone"]')?.textContent).toContain(
				msgs.this_unit_tz_unknown
			)
		);
		release();
		await vi.waitFor(() =>
			expect(container.querySelector('[data-this-unit-row="timezone"]')?.textContent).toContain(
				'Europe/Madrid'
			)
		);
		expect(container.querySelector('select')).toBeNull();
		await vi.waitFor(() => expect(systemApi.getTimezone).toHaveBeenCalledTimes(3));
		refreshed.answer(tz({ zone: 'Europe/Madrid' }));
		await expect.element(select()).toHaveValue('Europe/Madrid');
		await expect.element(save()).toBeDisabled();
	});

	it('a choice that a newer list no longer holds goes back to the kept zone, and no PUT sends it', async () => {
		mockAll();
		const fresh = heldRead();
		vi.mocked(systemApi.getTimezone)
			.mockReset()
			.mockResolvedValueOnce(tz())
			.mockReturnValueOnce(fresh.promise);
		const put = vi.spyOn(systemApi, 'setTimezone');
		const first = render(ThisUnitCard);
		await expect.element(select()).toHaveValue('America/Bogota');
		first.unmount();
		render(ThisUnitCard);
		// The list read before is shown while the new read runs.
		await expect.element(select()).toHaveValue('America/Bogota');
		await userEvent.selectOptions(select(), 'Europe/Madrid');
		await expect.element(save()).toBeEnabled();
		fresh.answer(tz({ zones: ['America/Bogota', 'UTC'] }));
		await expect.element(select()).toHaveValue('America/Bogota');
		expect([...selectEl().options].map((o) => o.value)).toEqual(['America/Bogota', 'UTC']);
		await expect.element(save()).toBeDisabled();
		(save().element() as HTMLButtonElement).click();
		await new Promise((r) => setTimeout(r, 50));
		expect(put).not.toHaveBeenCalled();
	});

	it('disables Save while the PUT runs, then shows the saved message and the zone read back', async () => {
		mockAll();
		let release!: () => void;
		const put = vi.spyOn(systemApi, 'setTimezone').mockImplementation(
			() =>
				new Promise((resolve) => {
					release = () => resolve({ zone: 'UTC' });
				})
		);
		render(ThisUnitCard);
		await expect.element(select()).toHaveValue('America/Bogota');
		await userEvent.selectOptions(select(), 'Europe/Madrid');
		await userEvent.click(save());
		await vi.waitFor(() => expect(put).toHaveBeenCalledWith('Europe/Madrid'));
		await expect.element(save()).toBeDisabled();
		release();
		await expect.element(page.getByText(msgs.this_unit_tz_saved, { exact: true })).toBeVisible();
		await expect.element(select()).toHaveValue('UTC');
		await expect.element(save()).toBeDisabled();
	});

	for (const [err, key] of [
		[refusal(422, 'unknown_zone'), 'this_unit_tz_err_unknown'],
		[refusal(503, 'timezone_unavailable'), 'this_unit_tz_err_unavailable'],
		[refusal(500, 'timezone_set_failed'), 'this_unit_tz_err_failed'],
		[new TypeError('Failed to fetch'), 'this_unit_tz_err_failed'],
		[new ApiError('timed out', undefined, 504), 'this_unit_tz_err_failed']
	] as const) {
		it(`shows ${key} for ${err instanceof ApiError ? err.status : err.name}`, async () => {
			mockAll();
			vi.spyOn(systemApi, 'setTimezone').mockRejectedValue(err);
			const { container } = render(ThisUnitCard);
			await expect.element(select()).toHaveValue('America/Bogota');
			await userEvent.selectOptions(select(), 'UTC');
			await userEvent.click(save());
			await expect.element(page.getByText(msgs[key], { exact: true })).toBeVisible();
			expect(container.textContent).not.toContain('English');
			expect(container.textContent).not.toContain(msgs.this_unit_tz_saved);
			await expect.element(save()).toBeEnabled();
		});
	}

	it('with canSet false, the select is disabled with the reason under it', async () => {
		mockAll({ tz: tz({ canSet: false }) });
		render(ThisUnitCard);
		await expect.element(select()).toBeDisabled();
		await expect.element(select()).toHaveValue('America/Bogota');
		await expect
			.element(page.getByText(msgs.this_unit_tz_err_unavailable, { exact: true }))
			.toBeVisible();
		await expect.element(save()).toBeDisabled();
	});

	it(`a time zone that cannot be read shows "${msgs.this_unit_tz_unknown}" and no select`, async () => {
		mockAll({ tz: new ApiError('boom', undefined, 500) });
		const { container } = render(ThisUnitCard);
		await vi.waitFor(() =>
			expect(container.querySelector('[data-this-unit-row="timezone"]')?.textContent).toContain(
				msgs.this_unit_tz_unknown
			)
		);
		expect(container.querySelector('select')).toBeNull();
		expect(container.textContent).not.toContain(msgs.this_unit_tz_save);
	});

	it('links the kind of camera to Settings > Cameras', async () => {
		mockAll({ kind: kind('chdk') });
		render(ThisUnitCard);
		await expect.element(page.getByText(msgs.camera_kind_chdk, { exact: true })).toBeVisible();
		const link = page.getByRole('link', { name: msgs.this_unit_camera_kind_link, exact: true });
		await expect.element(link).toHaveAttribute('href', '?section=cameras');
	});

	it('leaves the kind of camera out for a backend without the route', async () => {
		mockAll({ kind: new ApiError('Not Found', undefined, 404) });
		const { container } = render(ThisUnitCard);
		await expect.element(select()).toBeVisible();
		await vi.waitFor(() => expect(cameraKindApi.get).toHaveBeenCalled());
		await new Promise((r) => setTimeout(r, 50));
		expect(container.querySelector('[data-this-unit-row="camera-kind"]')).toBeNull();
	});

	it(`a kind of camera that cannot be read shows this_unit_camera_kind_unknown`, async () => {
		mockAll({ kind: new ApiError('boom', undefined, 500) });
		const { container } = render(ThisUnitCard);
		await vi.waitFor(() =>
			expect(container.querySelector('[data-this-unit-row="camera-kind"]')?.textContent).toContain(
				msgs.this_unit_camera_kind_unknown
			)
		);
	});
});

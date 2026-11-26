// Configuración → Conectar con Fisqua (NEH-345): the card that links the
// unit to a Fisqua workspace by a code. One test per state of GET
// /system/pairing and per refusal code; the code grouped three and three;
// the poll starting on mount and stopping on unmount; the restart gap, while
// GET fails, shown as "restarting"; and no secret rendered or requested.
// The pairing routes and GET /system/unit are mocked.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import type { Writable } from 'svelte/store';

const pageStore = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ url: new URL('http://localhost/dashboard/config') });
	pageStore.value = store;
	return { page: store };
});
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { ApiError, systemApi } from '$lib/api';
import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import type { PairingStatus } from '$lib/fisqua-pairing';
import '../../../../app.css';
import FisquaLinkCard from './FisquaLinkCard.svelte';
import ConfigPage from './+page.svelte';

const POLL = 20;

function status(over: Partial<PairingStatus> = {}): PairingStatus {
	return {
		state: 'idle',
		reason: null,
		trouble: null,
		deviceId: 'k3m9qz7a',
		deviceIdError: null,
		unitName: null,
		code: null,
		expiresInSeconds: null,
		renewalSecondsLeft: null,
		environment: 'production',
		currentTenant: null,
		linked: { configured: false, tenant: null, environment: null },
		eligible: { ok: true, reason: null },
		retryAfterSeconds: null,
		result: null,
		restartRequired: false,
		lastOutcome: null,
		...over
	};
}

function unit(mode: 'offline' | 'backup' | 'fisqua') {
	return {
		mode,
		projectsEnabled: false,
		projectsShown: false,
		defaultProjectId: 1,
		prerequisites: { backup: [], fisqua: [] }
	};
}

function refused(code: string, status = 409) {
	return new ApiError('English refusal', { code, message: 'English refusal' }, status);
}

const getCode = () => page.getByRole('button', { name: es.fisqua_link_start, exact: true });
const nameInput = () => page.getByRole('textbox', { name: es.fisqua_link_name_label });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(
	get: PairingStatus | (() => Promise<PairingStatus>),
	mode: 'offline' | 'backup' | 'fisqua' = 'backup'
) {
	const getSpy =
		typeof get === 'function'
			? vi.spyOn(systemApi, 'getPairing').mockImplementation(get)
			: vi.spyOn(systemApi, 'getPairing').mockResolvedValue(get);
	vi.spyOn(systemApi, 'unit').mockResolvedValue(unit(mode) as never);
	const screen = render(FisquaLinkCard, { pollMs: POLL });
	return { getSpy, screen };
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

describe('Conectar con Fisqua: before a code', () => {
	it('explains the link and warns that linking restarts Captua', async () => {
		mount(status());
		await expect.element(page.getByText(es.fisqua_link_desc)).toBeInTheDocument();
		await expect.element(page.getByText(es.fisqua_link_restart_warning)).toBeInTheDocument();
		await expect.element(nameInput()).toBeInTheDocument();
		await expect.element(page.getByText(es.fisqua_link_name_hint)).toBeInTheDocument();
		await expect.element(getCode()).toBeEnabled();
	});

	it('sends the name and shows the code it gets back', async () => {
		const { getSpy } = mount(status());
		const requesting = status({ state: 'requesting', unitName: 'Sala 2' });
		// Once POST is called the backend is requesting, so GET answers the same.
		const post = vi.spyOn(systemApi, 'startPairing').mockImplementation(async () => {
			getSpy.mockResolvedValue(requesting);
			return requesting;
		});
		await userEvent.fill(nameInput(), '  Sala 2 ');
		await userEvent.click(getCode());
		await vi.waitFor(() => expect(post).toHaveBeenCalledWith('Sala 2'));
		// Polls after POST leave the card requesting.
		const sent = getSpy.mock.calls.length;
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(sent + 1));
		await expect.element(page.getByText(es.fisqua_link_requesting)).toBeInTheDocument();
		getSpy.mockResolvedValue(
			status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 290, unitName: 'Sala 2' })
		);
		await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
	});

	it('refuses an empty name without sending it', async () => {
		mount(status());
		const post = vi.spyOn(systemApi, 'startPairing');
		await userEvent.click(getCode());
		await expect.element(page.getByText(es.fisqua_link_name_invalid)).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('fills the name the backend already holds', async () => {
		mount(status({ state: 'cancelled', unitName: 'Sala 2' }));
		await expect.element(nameInput()).toHaveValue('Sala 2');
	});

	it.each([
		['unit_name', 422, () => es.fisqua_link_name_invalid],
		['mode_not_eligible', 409, () => es.fisqua_link_not_eligible],
		['offsite_held', 409, () => es.fisqua_link_held],
		['rclone_missing', 409, () => es.fisqua_link_rclone_missing],
		['busy_capturing', 409, () => es.fisqua_link_busy_capturing],
		['device_id_invalid', 409, () => es.fisqua_link_device_id_invalid],
		['script_too_old', 409, () => es.fisqua_link_script_too_old],
		['script_missing', 409, () => es.fisqua_link_script_missing],
		['device_id_missing', 409, () => es.fisqua_link_device_id_invalid],
		['device_id_unreadable', 409, () => es.fisqua_link_device_id_invalid],
		['not_renewable', 409, () => es.fisqua_link_generic],
		['restart_required', 409, () => es.fisqua_link_restart_required],
		['offsite_job_running', 409, () => es.fisqua_link_offsite_job_running],
		['a_code_from_a_newer_backend', 409, () => es.fisqua_link_generic]
	])(
		'a refused request (%s) shows a translated line, never the backend English',
		async (code, http, text) => {
			const { screen } = mount(status());
			vi.spyOn(systemApi, 'startPairing').mockRejectedValue(refused(code, http));
			await userEvent.fill(nameInput(), 'Sala 2');
			await userEvent.click(getCode());
			await expect.element(page.getByRole('alert').getByText(text())).toBeInTheDocument();
			expect(screen.container.textContent).not.toContain('English');
		}
	);

	it('a failed request with no code shows the generic line', async () => {
		mount(status());
		vi.spyOn(systemApi, 'startPairing').mockRejectedValue(
			new ApiError('Internal Server Error', undefined, 500)
		);
		await userEvent.fill(nameInput(), 'Sala 2');
		await userEvent.click(getCode());
		await expect
			.element(page.getByRole('alert').getByText(es.fisqua_link_generic))
			.toBeInTheDocument();
	});

	it('a unit that cannot be linked now says why and disables Get a code', async () => {
		mount(status({ eligible: { ok: false, reason: 'busy_capturing' } }));
		await expect.element(page.getByText(es.fisqua_link_busy_capturing)).toBeInTheDocument();
		await expect.element(getCode()).toBeDisabled();
	});

	it('a unit in the wrong mode says which units can be linked', async () => {
		mount(status({ eligible: { ok: false, reason: 'mode_not_eligible' } }));
		await expect.element(page.getByText(es.fisqua_link_not_eligible)).toBeInTheDocument();
		expect(es.fisqua_link_not_eligible).toContain(es.unit_mode_fisqua);
		expect(es.fisqua_link_not_eligible).toContain(es.unit_mode_offline);
		await expect.element(getCode()).toBeDisabled();
	});

	it('a device id the backend cannot read is shown, and Get a code is disabled', async () => {
		mount(status({ deviceId: null, deviceIdError: 'invalid' }));
		await expect.element(page.getByText(es.fisqua_link_device_id_invalid)).toBeInTheDocument();
		await expect.element(getCode()).toBeDisabled();
	});

	it('an unknown eligibility reason shows the generic line', async () => {
		mount(status({ eligible: { ok: false, reason: 'something_new' } }));
		await expect.element(page.getByText(es.fisqua_link_generic)).toBeInTheDocument();
		await expect.element(getCode()).toBeDisabled();
	});

	it('a unit already linked names its workspace and offers Get a code', async () => {
		mount(
			status({
				currentTenant: 'archivo-x',
				linked: { configured: true, tenant: 'archivo-x', environment: 'production' }
			})
		);
		await expect.element(page.getByText(es.fisqua_link_current('archivo-x'))).toBeInTheDocument();
		await expect.element(getCode()).toBeEnabled();
	});
});

describe('Conectar con Fisqua: the code', () => {
	const showing = status({
		state: 'showing',
		code: 'abcdef',
		expiresInSeconds: 290,
		unitName: 'Sala 2',
		renewalSecondsLeft: 540
	});

	it('shows the code three and three, the seconds left and the device id, labelled', async () => {
		const { screen } = mount(showing);
		await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText(es.fisqua_link_expires(290))).toBeInTheDocument();
		await expect
			.element(page.getByText(es.fisqua_link_code_label, { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText(es.fisqua_link_device_label, { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText('k3m9qz7a', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText(es.fisqua_link_waiting)).toBeInTheDocument();
		const code = screen.container.querySelector('[data-pairing-code]');
		expect(code && getComputedStyle(code).fontFamily).toMatch(/mono/i);
	});

	it('Cancel sends DELETE and shows the form again', async () => {
		const { getSpy } = mount(showing);
		const del = vi
			.spyOn(systemApi, 'cancelPairing')
			.mockResolvedValue(status({ state: 'cancelled', unitName: 'Sala 2' }));
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await vi.waitFor(() => expect(del).toHaveBeenCalledTimes(1));
		getSpy.mockResolvedValue(status({ state: 'cancelled', unitName: 'Sala 2' }));
		await expect.element(getCode()).toBeInTheDocument();
		await expect.element(page.getByText('ABC-DEF', { exact: true })).not.toBeInTheDocument();
	});

	it.each([
		['lapsed', () => es.fisqua_link_lapsed],
		['lost_answer', () => es.fisqua_link_lost],
		['unknown', () => es.fisqua_link_unknown]
	])(
		'%s offers Get a new code, which renews, and shows the new state at once',
		async (state, text) => {
			mount(status({ state, unitName: 'Sala 2' }));
			const renew = vi
				.spyOn(systemApi, 'renewPairing')
				.mockResolvedValue(status({ state: 'requesting', unitName: 'Sala 2' }));
			const start = vi.spyOn(systemApi, 'startPairing');
			await expect.element(page.getByText(text())).toBeInTheDocument();
			vi.spyOn(systemApi, 'getPairing').mockImplementation(() => new Promise(() => {}));
			await userEvent.click(page.getByRole('button', { name: es.fisqua_link_new_code }));
			await vi.waitFor(() => expect(renew).toHaveBeenCalledTimes(1));
			await expect.element(page.getByText(es.fisqua_link_requesting)).toBeInTheDocument();
			expect(start).not.toHaveBeenCalled();
			expect(
				page.getByRole('button', { name: es.fisqua_link_start, exact: true }).elements()
			).toHaveLength(0);
		}
	);

	it('requesting shows that Captua is asking, with Cancel', async () => {
		mount(status({ state: 'requesting', unitName: 'Sala 2' }));
		await expect.element(page.getByText(es.fisqua_link_requesting)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: es.common_cancel })).toBeInTheDocument();
	});

	it.each([
		['busy', () => es.fisqua_link_busy(15)],
		['network', () => es.fisqua_link_network],
		['something_new', () => es.fisqua_link_retry(15)]
	])(
		'trouble %s while the code is shown says why, keeps the code and offers Cancel',
		async (trouble, text) => {
			mount(
				status({
					state: 'showing',
					code: 'ABCDEF',
					expiresInSeconds: 200,
					retryAfterSeconds: 15,
					trouble
				})
			);
			await expect.element(page.getByText(text())).toBeInTheDocument();
			await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
			expect(page.getByText(es.fisqua_link_waiting).elements()).toHaveLength(0);
			await expect
				.element(page.getByRole('button', { name: es.common_cancel }))
				.toBeInTheDocument();
		}
	);

	it('trouble before the first code says why while Captua asks', async () => {
		mount(status({ state: 'requesting', retryAfterSeconds: 10, trouble: 'network' }));
		await expect.element(page.getByText(es.fisqua_link_network)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: es.common_cancel })).toBeInTheDocument();
	});

	it('Cancel shows the answer of DELETE at once', async () => {
		mount(status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 200, unitName: 'Sala 2' }));
		vi.spyOn(systemApi, 'cancelPairing').mockResolvedValue(
			status({ state: 'cancelled', unitName: 'Sala 2' })
		);
		await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
		vi.spyOn(systemApi, 'getPairing').mockImplementation(() => new Promise(() => {}));
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect.element(getCode()).toBeInTheDocument();
	});
});

describe('Conectar con Fisqua: after approval', () => {
	it('applying shows that Captua is linking the unit', async () => {
		mount(status({ state: 'applying' }));
		await expect.element(page.getByText(es.fisqua_link_applying)).toBeInTheDocument();
		expect(page.getByRole('button', { name: es.common_cancel }).elements()).toHaveLength(0);
	});

	it('applying while uploads finish says so, and that it can take a few minutes', async () => {
		mount(status({ state: 'applying', reason: 'finishing_uploads' }));
		await expect.element(page.getByText(es.fisqua_link_finishing_uploads)).toBeInTheDocument();
		expect(page.getByText(es.fisqua_link_applying).elements()).toHaveLength(0);
	});

	it('applying while an offsite job finishes says so, and that it can take a few minutes', async () => {
		mount(status({ state: 'applying', reason: 'finishing_offsite_jobs' }));
		await expect.element(page.getByText(es.fisqua_link_finishing_offsite_jobs)).toBeInTheDocument();
		expect(page.getByText(es.fisqua_link_applying).elements()).toHaveLength(0);
	});

	it.each([
		['offsite_jobs_still_running', () => es.fisqua_link_offsite_jobs_still_running],
		['prepare_failed', () => es.fisqua_link_prepare_failed],
		['shutting_down', () => es.fisqua_link_shutting_down]
	])(
		'apply_failed (%s) shows its line and lets the admin get a code again',
		async (reason, text) => {
			mount(status({ state: 'apply_failed', reason, unitName: 'Sala 2' }));
			await expect.element(page.getByText(text())).toBeInTheDocument();
			expect(page.getByText(es.fisqua_link_failed).elements()).toHaveLength(0);
			await expect.element(getCode()).toBeEnabled();
		}
	);

	it('applying while the link is written shows the linking line', async () => {
		mount(status({ state: 'applying', reason: 'writing_link' }));
		await expect.element(page.getByText(es.fisqua_link_applying)).toBeInTheDocument();
	});

	it('apply_failed because uploads still ran offers the restart and a new code afterwards', async () => {
		mount(status({ state: 'apply_failed', reason: 'uploads_still_running', unitName: 'Sala 2' }));
		await expect.element(page.getByText(es.fisqua_link_uploads_still_running)).toBeInTheDocument();
		expect(page.getByText(es.fisqua_link_failed).elements()).toHaveLength(0);
		await userEvent.click(page.getByRole('button', { name: es.fisqua_link_restart_btn }));
		await expect
			.element(page.getByRole('dialog').getByText(es.config_confirm_reboot_title))
			.toBeInTheDocument();
		await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.common_cancel }));
	});

	it('restarting shows the restart', async () => {
		mount(status({ state: 'restarting' }));
		await expect.element(page.getByText(es.fisqua_link_restarting)).toBeInTheDocument();
	});

	it('keeps showing the restart while GET fails, then shows the link once it answers', async () => {
		let phase: 'restarting' | 'down' | 'back' = 'restarting';
		const linked = status({
			state: 'idle',
			currentTenant: 'archivo-x',
			linked: { configured: true, tenant: 'archivo-x', environment: 'production' },
			result: {
				tenant: 'archivo-x',
				environment: 'production',
				at: '2026-11-13T10:00:00Z',
				by: 'admin1'
			}
		});
		const { getSpy, screen } = mount(async () => {
			if (phase === 'restarting') return status({ state: 'restarting' });
			if (phase === 'down') throw new TypeError('Failed to fetch');
			return linked;
		}, 'fisqua');
		await expect.element(page.getByText(es.fisqua_link_restarting)).toBeInTheDocument();
		phase = 'down';
		const before = getSpy.mock.calls.length;
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(before + 3));
		await expect.element(page.getByText(es.fisqua_link_restarting)).toBeInTheDocument();
		expect(screen.container.querySelector('[role="alert"]')).toBeNull();
		expect(screen.container.textContent).not.toContain(es.fisqua_link_err_read);
		phase = 'back';
		await expect
			.element(page.getByText(es.fisqua_link_linked('archivo-x', false)))
			.toBeInTheDocument();
	});

	it('a GET failing after applying shows the restart too', async () => {
		let down = false;
		mount(async () => {
			if (down) throw new TypeError('Failed to fetch');
			return status({ state: 'applying' });
		});
		await expect.element(page.getByText(es.fisqua_link_applying)).toBeInTheDocument();
		down = true;
		await expect.element(page.getByText(es.fisqua_link_restarting)).toBeInTheDocument();
	});

	it('a backend back from the restart in idle with the link configured shows the link', async () => {
		let phase: 'restarting' | 'down' | 'back' = 'restarting';
		mount(async () => {
			if (phase === 'restarting') return status({ state: 'restarting' });
			if (phase === 'down') throw new TypeError('Failed to fetch');
			return status({
				state: 'idle',
				currentTenant: 'archivo-x',
				linked: { configured: true, tenant: 'archivo-x', environment: 'staging' },
				result: {
					tenant: 'archivo-x',
					environment: 'staging',
					at: '2026-11-13T10:00:00Z',
					by: 'admin1'
				}
			});
		}, 'fisqua');
		await expect.element(page.getByText(es.fisqua_link_restarting)).toBeInTheDocument();
		phase = 'down';
		await sleep(POLL * 4);
		phase = 'back';
		await expect
			.element(page.getByText(es.fisqua_link_linked('archivo-x', true)))
			.toBeInTheDocument();
	});

	it('restart_needed offers the existing Restart action', async () => {
		mount(status({ state: 'restart_needed' }));
		await expect.element(page.getByText(es.fisqua_link_restart_manual)).toBeInTheDocument();
		await userEvent.click(page.getByRole('button', { name: es.fisqua_link_restart_btn }));
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByText(es.config_confirm_reboot_title)).toBeInTheDocument();
		await userEvent.click(dialog.getByRole('button', { name: es.common_cancel }));
	});

	async function backFromRestart(mode: 'backup' | 'offline' | 'fisqua') {
		let back = false;
		mount(
			async () =>
				back
					? status({
							currentTenant: 'archivo-x',
							linked: { configured: true, tenant: 'archivo-x', environment: 'production' }
						})
					: status({ state: 'restarting' }),
			mode
		);
		await expect.element(page.getByText(es.fisqua_link_restarting)).toBeInTheDocument();
		back = true;
		await expect
			.element(page.getByText(es.fisqua_link_linked('archivo-x', false)))
			.toBeInTheDocument();
	}

	it.each(['production', 'something_else', null])(
		'linked in %s shows no environment name',
		async (env) => {
			let back = false;
			const { screen } = mount(
				async () =>
					back
						? status({
								currentTenant: 'archivo-x',
								environment: env,
								linked: { configured: true, tenant: 'archivo-x', environment: env }
							})
						: status({ state: 'restarting', environment: env }),
				'fisqua'
			);
			await expect.element(page.getByText(es.fisqua_link_restarting)).toBeInTheDocument();
			back = true;
			await expect
				.element(page.getByText(es.fisqua_link_linked('archivo-x', false)))
				.toBeInTheDocument();
			expect(screen.container.textContent).not.toMatch(/production|something_else|staging/);
		}
	);

	it('linked, outside Fisqua mode, points to the mode switch', async () => {
		await backFromRestart('offline');
		await expect.element(page.getByText(es.fisqua_link_mode_hint)).toBeInTheDocument();
		const link = page.getByRole('link', { name: es.fisqua_link_switch_mode });
		await expect.element(link).toHaveAttribute('href', '?section=unit-mode');
	});

	it('linked, in Fisqua mode, does not point to the mode switch', async () => {
		await backFromRestart('fisqua');
		expect(page.getByRole('link', { name: es.fisqua_link_switch_mode }).elements()).toHaveLength(0);
	});
});

describe('Conectar con Fisqua: final states', () => {
	it.each([
		['cannot_pair', null, () => es.fisqua_link_cannot_pair],
		['wrong_environment', null, () => es.fisqua_link_wrong_env],
		['other_workspace', null, () => es.fisqua_link_other_workspace('archivo-x')],
		['bad_payload', 'tenant', () => es.fisqua_link_bad_payload],
		['not_eligible', 'mode_not_eligible', () => es.fisqua_link_not_eligible],
		['not_eligible', 'offsite_held', () => es.fisqua_link_held],
		['not_eligible', 'something_new', () => es.fisqua_link_generic],
		['apply_failed', 'OSError', () => es.fisqua_link_failed],
		['apply_unverified', null, () => es.fisqua_link_unverified],
		['settings_overridden', null, () => es.fisqua_link_overridden],
		['script_missing', null, () => es.fisqua_link_script_missing],
		['script_too_old', null, () => es.fisqua_link_script_too_old],
		['error', 'method', () => es.fisqua_link_generic],
		['a_state_from_a_newer_backend', null, () => es.fisqua_link_generic]
	])('%s (%s) shows its line and lets the admin get a code again', async (state, reason, text) => {
		mount(
			status({
				state,
				reason,
				unitName: 'Sala 2',
				currentTenant: 'archivo-x',
				linked: { configured: true, tenant: 'archivo-x', environment: 'production' }
			})
		);
		await expect.element(page.getByText(text())).toBeInTheDocument();
		await expect.element(getCode()).toBeInTheDocument();
	});
});

describe('Conectar con Fisqua: restart required', () => {
	it('on a fresh load says the unit must be restarted, names the last outcome, and disables Get a code', async () => {
		mount(status({ state: 'idle', restartRequired: true, lastOutcome: 'settings_overridden' }));
		await expect.element(page.getByText(es.fisqua_link_restart_required)).toBeInTheDocument();
		await expect
			.element(page.getByText(es.fisqua_link_last_outcome(es.fisqua_link_overridden)))
			.toBeInTheDocument();
		await expect.element(getCode()).toBeDisabled();
		await userEvent.click(page.getByRole('button', { name: es.fisqua_link_restart_btn }));
		await expect
			.element(page.getByRole('dialog').getByText(es.config_confirm_reboot_title))
			.toBeInTheDocument();
		await userEvent.click(page.getByRole('dialog').getByRole('button', { name: es.common_cancel }));
	});

	it('with no known outcome says only that the unit must be restarted', async () => {
		const { screen } = mount(status({ state: 'idle', restartRequired: true }));
		await expect.element(page.getByText(es.fisqua_link_restart_required)).toBeInTheDocument();
		expect(screen.container.textContent).not.toContain(es.fisqua_link_last_outcome(''));
	});

	it('over a final state, shows one Restart button and disables Get a new code', async () => {
		mount(status({ state: 'lapsed', restartRequired: true, lastOutcome: 'lapsed' }));
		await expect.element(page.getByText(es.fisqua_link_restart_required)).toBeInTheDocument();
		expect(page.getByRole('button', { name: es.fisqua_link_restart_btn }).elements()).toHaveLength(
			1
		);
		await expect
			.element(page.getByRole('button', { name: es.fisqua_link_new_code }))
			.toBeDisabled();
	});

	it('restart_needed with the latch shows a single Restart button', async () => {
		mount(
			status({ state: 'restart_needed', restartRequired: true, lastOutcome: 'restart_needed' })
		);
		await expect.element(page.getByText(es.fisqua_link_restart_required)).toBeInTheDocument();
		expect(page.getByRole('button', { name: es.fisqua_link_restart_btn }).elements()).toHaveLength(
			1
		);
	});

	it.each(['applying', 'restarting'])('is not shown while %s', async (state) => {
		const { screen } = mount(status({ state, restartRequired: true }));
		await expect
			.element(
				page.getByText(state === 'applying' ? es.fisqua_link_applying : es.fisqua_link_restarting)
			)
			.toBeInTheDocument();
		expect(screen.container.textContent).not.toContain(es.fisqua_link_restart_required);
	});
});

describe('Conectar con Fisqua: answers that arrive late', () => {
	function deferred<T>() {
		let resolve!: (v: T) => void;
		const promise = new Promise<T>((r) => (resolve = r));
		return { promise, resolve };
	}

	it('drops a GET sent before an action that answers after it', async () => {
		const showing = status({
			state: 'showing',
			code: 'ABCDEF',
			expiresInSeconds: 200,
			unitName: 'Sala 2'
		});
		const { getSpy } = mount(showing);
		await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
		const held = deferred<PairingStatus>();
		getSpy.mockImplementation(() => held.promise);
		const before = getSpy.mock.calls.length;
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(before));
		vi.spyOn(systemApi, 'cancelPairing').mockResolvedValue(
			status({ state: 'cancelled', unitName: 'Sala 2' })
		);
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect.element(getCode()).toBeInTheDocument();
		// Later GETs never answer, so a stale answer that got through would stay on screen.
		getSpy.mockImplementation(() => new Promise<PairingStatus>(() => {}));
		held.resolve(showing);
		await sleep(POLL * 3);
		expect(page.getByText('ABC-DEF', { exact: true }).elements()).toHaveLength(0);
		await expect.element(getCode()).toBeInTheDocument();
	});

	it('drops a GET sent while an action is in flight that answers after it', async () => {
		const showing = status({
			state: 'showing',
			code: 'ABCDEF',
			expiresInSeconds: 200,
			unitName: 'Sala 2'
		});
		const { getSpy } = mount(showing);
		await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
		const action = deferred<PairingStatus>();
		vi.spyOn(systemApi, 'cancelPairing').mockImplementation(() => action.promise);
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		const held = deferred<PairingStatus>();
		getSpy.mockImplementation(() => held.promise);
		const before = getSpy.mock.calls.length;
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(before));
		action.resolve(status({ state: 'cancelled', unitName: 'Sala 2' }));
		await expect.element(getCode()).toBeInTheDocument();
		// Later GETs never answer, so a stale answer that got through would stay on screen.
		getSpy.mockImplementation(() => new Promise<PairingStatus>(() => {}));
		held.resolve(showing);
		await sleep(POLL * 3);
		expect(page.getByText('ABC-DEF', { exact: true }).elements()).toHaveLength(0);
	});

	it('drops a failure of a GET sent before an action, so it does not show a read error', async () => {
		const { getSpy } = mount(
			status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 200, unitName: 'Sala 2' })
		);
		await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
		let fail!: (e: unknown) => void;
		getSpy.mockImplementation(() => new Promise<PairingStatus>((_, reject) => (fail = reject)));
		const before = getSpy.mock.calls.length;
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThan(before));
		vi.spyOn(systemApi, 'cancelPairing').mockResolvedValue(
			status({ state: 'cancelled', unitName: 'Sala 2' })
		);
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect.element(getCode()).toBeInTheDocument();
		fail(new TypeError('Failed to fetch'));
		await sleep(POLL * 2);
		expect(page.getByText(es.fisqua_link_err_read).elements()).toHaveLength(0);
	});
});

describe('Conectar con Fisqua: each action shows its own refusal', () => {
	it.each([
		['requesting', status({ state: 'requesting', unitName: 'Sala 2' })],
		[
			'showing',
			status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 200, unitName: 'Sala 2' })
		]
	])('a failed Cancel in %s is shown beside Cancel', async (_, s) => {
		mount(s);
		vi.spyOn(systemApi, 'cancelPairing').mockRejectedValue(
			new ApiError('Internal Server Error', undefined, 500)
		);
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect
			.element(page.getByRole('alert').getByText(es.fisqua_link_cancel_failed))
			.toBeInTheDocument();
		expect(page.getByText(es.fisqua_link_generic).elements()).toHaveLength(0);
	});

	it('a Cancel refused with a code this version does not know says Cancel failed', async () => {
		mount(status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 200, unitName: 'Sala 2' }));
		vi.spyOn(systemApi, 'cancelPairing').mockRejectedValue(refused('something_new'));
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect
			.element(page.getByRole('alert').getByText(es.fisqua_link_cancel_failed))
			.toBeInTheDocument();
	});

	it("a Cancel refused with a known code shows that code's line", async () => {
		mount(status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 200, unitName: 'Sala 2' }));
		vi.spyOn(systemApi, 'cancelPairing').mockRejectedValue(refused('restart_required'));
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect
			.element(page.getByRole('alert').getByText(es.fisqua_link_restart_required))
			.toBeInTheDocument();
	});

	it('a failed Cancel is not shown later beside Get a code', async () => {
		const { getSpy } = mount(
			status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 200, unitName: 'Sala 2' })
		);
		vi.spyOn(systemApi, 'cancelPairing').mockRejectedValue(
			new ApiError('Internal Server Error', undefined, 500)
		);
		await userEvent.click(page.getByRole('button', { name: es.common_cancel }));
		await expect.element(page.getByRole('alert')).toBeInTheDocument();
		getSpy.mockResolvedValue(status({ state: 'cancelled', unitName: 'Sala 2' }));
		await expect.element(getCode()).toBeInTheDocument();
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});

	it('a failed Get a code is not shown beside Cancel once a session runs', async () => {
		const { getSpy } = mount(status({ state: 'cancelled', unitName: 'Sala 2' }));
		vi.spyOn(systemApi, 'startPairing').mockRejectedValue(refused('busy_capturing'));
		await userEvent.click(getCode());
		await expect
			.element(page.getByRole('alert').getByText(es.fisqua_link_busy_capturing))
			.toBeInTheDocument();
		getSpy.mockResolvedValue(status({ state: 'requesting', unitName: 'Sala 2' }));
		await expect.element(page.getByText(es.fisqua_link_requesting)).toBeInTheDocument();
		expect(page.getByRole('alert').elements()).toHaveLength(0);
	});
});

describe('Conectar con Fisqua: reading and polling', () => {
	it.each(['cancelled', 'ended'])('%s shows the form with no line', async (state) => {
		const { screen } = mount(status({ state, unitName: 'Sala 2' }));
		await expect.element(getCode()).toBeEnabled();
		expect(screen.container.querySelector('.link-notice')).toBeNull();
	});

	it('shows a line, not a blank card, when GET fails', async () => {
		mount(async () => {
			throw new ApiError('Internal Server Error', undefined, 500);
		});
		await expect.element(page.getByText(es.fisqua_link_err_read)).toBeInTheDocument();
	});

	it('polls while mounted and stops on unmount', async () => {
		const { getSpy, screen } = mount(status());
		await vi.waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThanOrEqual(3));
		screen.unmount();
		const after = getSpy.mock.calls.length;
		await sleep(POLL * 6);
		expect(getSpy.mock.calls.length).toBeLessThanOrEqual(after + 1);
	});

	it('renders no secret and requests no field named like one', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
			async () =>
				new Response(
					JSON.stringify({
						...status({ state: 'showing', code: 'ABCDEF', expiresInSeconds: 290 }),
						collectSecret: 'cs-SECRET-1',
						token: 'tok-SECRET-2',
						secret: 'SECRET-3'
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		);
		const screen = render(FisquaLinkCard, { pollMs: POLL });
		await expect.element(page.getByText('ABC-DEF', { exact: true })).toBeInTheDocument();
		await vi.waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
		expect(screen.container.innerHTML).not.toMatch(/SECRET|collectSecret|token/i);
		for (const [input, init] of fetchSpy.mock.calls) {
			expect(String(input)).toMatch(/\/system\/pairing$/);
			expect(String(input)).not.toMatch(/secret|token|key/i);
			expect(String(init?.body ?? '')).not.toMatch(/secret|token|key/i);
		}
	});

	it('is its own section after the unit mode, titled Conectar con Fisqua', async () => {
		vi.spyOn(systemApi, 'unit').mockResolvedValue(unit('backup') as never);
		vi.spyOn(systemApi, 'getPairing').mockResolvedValue(status());
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
		(pageStore.value as Writable<{ url: URL }>).set({
			url: new URL('http://localhost/dashboard/config?section=fisqua-link')
		});
		const screen = render(ConfigPage);
		await expect.element(getCode()).toBeInTheDocument();
		const ids = [...screen.container.querySelectorAll('[data-settings-section]')].map((b) =>
			b.getAttribute('data-settings-section')
		);
		expect(ids.indexOf('fisqua-link')).toBe(ids.indexOf('unit-mode') + 1);
		const sections = [...screen.container.querySelectorAll('.config-section')];
		expect(sections).toHaveLength(1);
		expect(sections[0].id).toBe('fisqua-link');
		expect(sections[0].querySelector('.section-title')?.textContent?.trim()).toBe(
			es.fisqua_link_title
		);
	});
});

// The first-run wizard (NEH-336, NEH-366): language, administrator account,
// network, time zone.
// It shows only while the unit needs setting up. Step 1 sets the language
// through the cookie and reloads into step 2. At the unit's own screen (the
// direct status call says local) the account is created at the backend's
// direct address with no token; anywhere else the form asks for the
// bootstrap token and says that set-up is meant to be done at the unit.
// Either way the new administrator is signed in at once and step 3 hosts
// Settings > Network with Continue and Set up later, both to step 4, the
// unit's time zone: Continue sends the zone chosen and goes to the Overview,
// staying with the reason on a refusal; Set up later goes there with no PUT.
// It fits 800x480 and 1280x800.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { writable } from 'svelte/store';

const pageStore = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ url: new URL('http://localhost/setup') });
	pageStore.value = store;
	return { page: store };
});
const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
const { setLanguage } = vi.hoisted(() => ({ setLanguage: vi.fn() }));
vi.mock('$lib/i18n', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/i18n')>()),
	setLanguage
}));
// A registration with no answer ends after 50 ms here, 30 s on the unit.
vi.mock('$lib/first-run', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/first-run')>()),
	REGISTER_TIMEOUT_MS: 50
}));

import { authStore } from '$lib/stores/auth';
import { authApi, usersApi } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../../app.css';
import SetupPage from './+page.svelte';
import * as thisUnitModule from '../../(dashboard)/dashboard/config/ThisUnitCard.svelte';

const store = () => pageStore.value as ReturnType<typeof writable<{ url: URL }>>;

interface Call {
	path: string;
	method: string;
	credentials: RequestCredentials | undefined;
	headers: Record<string, string>;
	body: unknown;
}

let calls: Call[];
let needsSetup: boolean;
let directLocal: boolean | 'fail';
let registerAnswer: (init?: RequestInit) => Response | Promise<Response>;
// Hold the status asked through the API, and the sign-in, until released.
let statusGate: Promise<void> | null;
// The status asked through the API answers 500 while this is set.
let statusFails: boolean;
let loginGate: Promise<void> | null;
let meGate: Promise<void> | null;
let loginFails: boolean;
let tzAnswer: () => Response | Promise<Response>;
let tzPutAnswer: () => Response | Promise<Response>;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

const TZ_ZONES = ['America/Bogota', 'Europe/Madrid', 'UTC'];

const ADMIN = {
	id: 1,
	username: 'primera',
	email: null,
	role: 'admin',
	is_active: true,
	language: 'en'
};

beforeEach(() => {
	locale.set('en');
	authStore.clearSession();
	gotoMock.mockReset();
	setLanguage.mockReset();
	store()?.set({ url: new URL('http://localhost/setup') });
	calls = [];
	needsSetup = true;
	directLocal = true;
	registerAnswer = () => json(ADMIN);
	statusGate = null;
	statusFails = false;
	loginGate = null;
	meGate = null;
	loginFails = false;
	tzAnswer = () => json({ zone: 'America/Bogota', zones: TZ_ZONES, canSet: true });
	tzPutAnswer = () => json({ zone: 'Europe/Madrid' });
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url);
		const headers: Record<string, string> = {};
		for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>))
			headers[k.toLowerCase()] = v;
		calls.push({
			path: url.pathname,
			method: init?.method ?? 'GET',
			credentials: init?.credentials,
			headers,
			body: init?.body ? JSON.parse(init.body as string) : undefined
		});
		// The direct calls go without credentials; the API's own carry the cookie.
		const direct = init?.credentials === 'omit';
		if (url.pathname === '/auth/setup/status') {
			if (direct) {
				if (directLocal === 'fail') throw new TypeError('Failed to fetch');
				return json({ needs_setup: needsSetup, local: directLocal, default_language: 'es' });
			}
			if (statusGate) await statusGate;
			if (statusFails) return json({ detail: 'x' }, 500);
			return json({ needs_setup: needsSetup, local: false, default_language: 'es' });
		}
		if (url.pathname === '/auth/register') return registerAnswer(init);
		if (url.pathname === '/auth/login') {
			if (loginGate) await loginGate;
			return loginFails
				? json({ detail: 'Incorrect username or password' }, 401)
				: json({ access_token: null, token_type: 'cookie' });
		}
		if (url.pathname === '/users/me') {
			if (meGate) await meGate;
			return json(ADMIN);
		}
		if (url.pathname === '/system/timezone')
			return init?.method === 'PUT' ? tzPutAnswer() : tzAnswer();
		if (url.pathname.startsWith('/network/'))
			return json({ detail: 'Network settings are not available on this device.' }, 501);
		return json({});
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	(thisUnitModule as { resetUnitTimezone?: () => void }).resetUnitTimezone?.();
});

function atAccountStep() {
	store()?.set({ url: new URL('http://localhost/setup?step=account') });
}

async function fillAccount(extra: { token?: string } = {}) {
	await userEvent.fill(page.getByLabelText(en.common_username_label), 'primera');
	await userEvent.fill(page.getByLabelText(en.common_password_label, { exact: true }), 'fake-pw8');
	await userEvent.fill(
		page.getByLabelText(en.common_confirm_password, { exact: true }),
		'fake-pw8'
	);
	if (extra.token !== undefined)
		await userEvent.fill(page.getByLabelText(en.setup_token_label), extra.token);
}

const registers = () => calls.filter((c) => c.path === '/auth/register');

describe('first-run wizard: step 1, language', () => {
	it('offers both languages, each in its own, and goes on to the account step in the one chosen', async () => {
		render(SetupPage);
		const english = page.getByRole('button', { name: 'Get started in English' });
		await expect.element(english).toHaveAttribute('lang', 'en');
		await expect
			.element(page.getByRole('button', { name: 'Empezar en español' }))
			.toHaveAttribute('lang', 'es');
		await userEvent.click(page.getByRole('button', { name: 'Empezar en español' }));
		expect(setLanguage).toHaveBeenCalledWith('es', '/setup?step=account');
	});

	it('keeps the credit and the link to the credits page', async () => {
		render(SetupPage);
		await expect.element(page.getByText('HAA-304052-25', { exact: false })).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Credits / Créditos' }))
			.toHaveAttribute('href', '/credits');
	});

	it('sends a unit already set up to the login page', async () => {
		needsSetup = false;
		render(SetupPage);
		await expect.poll(() => gotoMock.mock.calls[0]?.[0]).toBe('/login');
	});
});

describe('first-run wizard: step 2 at the unit’s own screen', () => {
	it('asks for no token and creates the account at the direct address, with the language chosen', async () => {
		atAccountStep();
		render(SetupPage);
		await expect.element(page.getByLabelText(en.common_username_label)).toBeVisible();
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		expect(document.querySelector('#su-token')).toBeNull();
		expect(document.body.textContent).not.toContain(en.setup_not_local);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.poll(() => registers().length).toBe(1);
		const [reg] = registers();
		expect(reg.credentials).toBe('omit');
		expect(reg.headers['x-bootstrap-token']).toBeUndefined();
		expect(reg.body).toEqual({
			username: 'primera',
			password: 'fake-pw8',
			email: null,
			default_language: 'en'
		});
	});

	it('signs the new administrator in at once and shows the network step', async () => {
		atAccountStep();
		render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
		const login = calls.find((c) => c.path === '/auth/login')!;
		expect(login.body).toEqual({ username: 'primera', password: 'fake-pw8' });
		expect(login.credentials).toBe('include');
		expect(authStore.getUser()?.username).toBe('primera');
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('holds the password to the 8-character rule before anything is sent', async () => {
		atAccountStep();
		render(SetupPage);
		await userEvent.fill(page.getByLabelText(en.common_username_label), 'primera');
		await userEvent.fill(page.getByLabelText(en.common_password_label, { exact: true }), 'fake-pw');
		await userEvent.fill(
			page.getByLabelText(en.common_confirm_password, { exact: true }),
			'fake-pw'
		);
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByText(en.common_password_too_short(8))).toBeVisible();
		expect(registers()).toEqual([]);
	});

	it('says so when the account was created but signing in failed, and offers the login page', async () => {
		atAccountStep();
		render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		loginFails = true;
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByText(en.setup_err_signin)).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: en.setup_go_to_login }));
		expect(gotoMock).toHaveBeenCalledWith('/login');
	});
});

describe('first-run wizard: step 2 from anywhere else', () => {
	for (const [name, answer] of [
		['the direct call says not local', false],
		['the direct call fails', 'fail']
	] as const) {
		it(`asks for the token and says set-up is meant for the unit's screen when ${name}`, async () => {
			directLocal = answer;
			atAccountStep();
			render(SetupPage);
			await expect.element(page.getByLabelText(en.setup_token_label)).toBeVisible();
			await expect.element(page.getByText(en.setup_not_local)).toBeVisible();
			await fillAccount({ token: 'made-up-token' });
			await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
			await expect.poll(() => registers().length).toBe(1);
			const [reg] = registers();
			expect(reg.credentials).toBe('include');
			expect(reg.headers['x-bootstrap-token']).toBe('made-up-token');
			expect(reg.body).toMatchObject({ username: 'primera', default_language: 'en' });
			await expect
				.element(page.getByRole('heading', { name: en.setup_network_title }))
				.toBeVisible();
		});
	}

	it('shows the token message for a 401 on registration', async () => {
		directLocal = false;
		registerAnswer = () => json({ detail: 'Invalid bootstrap token' }, 401);
		atAccountStep();
		render(SetupPage);
		await expect.element(page.getByLabelText(en.setup_token_label)).toBeVisible();
		await fillAccount({ token: 'made-up-token' });
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByText(en.setup_err_token)).toBeVisible();
		expect(calls.some((c) => c.path === '/auth/login')).toBe(false);
	});
});

describe('first-run wizard: step 3, network', () => {
	async function toNetwork() {
		atAccountStep();
		render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
	}

	it('hosts the network section', async () => {
		await toNetwork();
		await expect
			.element(page.getByRole('heading', { name: en.config_section_network, exact: true }))
			.toBeInTheDocument();
	});

	it('is step 3 of 4, after the account step, which is step 2 of 4', async () => {
		atAccountStep();
		render(SetupPage);
		await expect.element(page.getByText(en.setup_step(2, 4), { exact: true })).toBeVisible();
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByText(en.setup_step(3, 4), { exact: true })).toBeVisible();
	});

	for (const label of [en.setup_network_continue, en.setup_network_later]) {
		it(`${label} goes on to the time-zone step`, async () => {
			await toNetwork();
			await userEvent.click(page.getByRole('button', { name: label }));
			await expect.element(page.getByRole('heading', { name: en.setup_tz_title })).toBeVisible();
			expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		});
	}
});

describe.each([
	['en', en],
	['es', es]
] as const)('first-run wizard: step 4, time zone (%s)', (lang, msgs) => {
	const select = () => page.getByRole('combobox', { name: msgs.this_unit_tz_label });
	const puts = () => calls.filter((c) => c.path === '/system/timezone' && c.method === 'PUT');

	// The account step is filled in English (fillAccount); the language is
	// switched once the network step is shown.
	async function toTimeZone() {
		atAccountStep();
		render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
		locale.set(lang);
		await userEvent.click(page.getByRole('button', { name: msgs.setup_network_continue }));
		await expect.element(page.getByRole('heading', { name: msgs.setup_tz_title })).toBeVisible();
	}

	it('is step 4 of 4, with its description and the zones, the current one selected', async () => {
		await toTimeZone();
		await expect.element(page.getByText(msgs.setup_step(4, 4), { exact: true })).toBeVisible();
		await expect.element(page.getByText(msgs.setup_tz_desc, { exact: true })).toBeVisible();
		await expect.element(select()).toHaveValue('America/Bogota');
		const options = [...(select().element() as HTMLSelectElement).options].map((o) => o.value);
		expect(options).toEqual(TZ_ZONES);
		expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
	});

	it(`${msgs.setup_tz_continue} sends the zone chosen, then goes to the Overview`, async () => {
		await toTimeZone();
		await userEvent.selectOptions(select(), 'Europe/Madrid');
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_continue }));
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard'));
		expect(puts().map((c) => c.body)).toEqual([{ zone: 'Europe/Madrid' }]);
	});

	it(`${msgs.setup_tz_continue} sends the current zone when none other was chosen`, async () => {
		await toTimeZone();
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_continue }));
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard'));
		expect(puts().map((c) => c.body)).toEqual([{ zone: 'America/Bogota' }]);
	});

	for (const [status, code, key] of [
		[422, 'unknown_zone', 'this_unit_tz_err_unknown'],
		[503, 'timezone_unavailable', 'this_unit_tz_err_unavailable'],
		[500, 'timezone_set_failed', 'this_unit_tz_err_failed']
	] as const) {
		it(`a ${status} refusal shows ${key} and stays on the step`, async () => {
			tzPutAnswer = () => json({ detail: { code, message: 'English refusal' } }, status);
			await toTimeZone();
			await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_continue }));
			await expect.element(page.getByText(msgs[key], { exact: true })).toBeVisible();
			expect(document.body.textContent).not.toContain('English refusal');
			expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
			await expect.element(page.getByRole('heading', { name: msgs.setup_tz_title })).toBeVisible();
		});
	}

	it(`${msgs.setup_tz_later} goes to the Overview with no PUT`, async () => {
		await toTimeZone();
		await userEvent.selectOptions(select(), 'UTC');
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_later }));
		expect(gotoMock).toHaveBeenCalledWith('/dashboard');
		expect(puts()).toEqual([]);
	});

	// A press as the browser makes it: on a disabled button it does nothing.
	// userEvent would wait for the button to be enabled.
	const press = (name: string) =>
		(page.getByRole('button', { name }).element() as HTMLButtonElement).click();

	it(`${msgs.setup_tz_continue} stays disabled until the zones are read; ${msgs.setup_tz_later} works meanwhile`, async () => {
		let answer!: () => void;
		tzAnswer = () =>
			new Promise((resolve) => {
				answer = () => resolve(json({ zone: 'America/Bogota', zones: TZ_ZONES, canSet: true }));
			});
		await toTimeZone();
		await expect.element(page.getByRole('button', { name: msgs.setup_tz_continue })).toBeDisabled();
		press(msgs.setup_tz_continue);
		await new Promise((r) => setTimeout(r, 50));
		expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_later }));
		expect(gotoMock).toHaveBeenCalledWith('/dashboard');
		expect(puts()).toEqual([]);
		answer();
	});

	it('while the PUT runs, nothing more is sent and nothing navigates; a refusal then shows and the step stays', async () => {
		let release!: () => void;
		tzPutAnswer = () =>
			new Promise((resolve) => {
				release = () =>
					resolve(json({ detail: { code: 'unknown_zone', message: 'English refusal' } }, 422));
			});
		await toTimeZone();
		await expect.element(select()).toHaveValue('America/Bogota');
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_continue }));
		await expect.poll(() => puts().length).toBe(1);
		press(msgs.setup_tz_continue);
		press(msgs.setup_tz_continue);
		press(msgs.setup_tz_later);
		await new Promise((r) => setTimeout(r, 50));
		expect(puts().length).toBe(1);
		expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		release();
		await expect
			.element(page.getByText(msgs.this_unit_tz_err_unknown, { exact: true }))
			.toBeVisible();
		expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		await expect.element(page.getByRole('heading', { name: msgs.setup_tz_title })).toBeVisible();
		expect(puts().length).toBe(1);
	});

	it('a zone that is not in the list is never a choice, and Continue sends no PUT for it', async () => {
		tzAnswer = () => json({ zone: 'Mars/Olympus_Mons', zones: TZ_ZONES, canSet: true });
		await toTimeZone();
		await expect.element(select()).toBeVisible();
		const el = select().element() as HTMLSelectElement;
		expect(el.options[0].textContent?.trim()).toBe(msgs.this_unit_tz_unknown);
		expect(el.options[0].disabled).toBe(true);
		expect(el.selectedIndex).toBe(0);
		expect([...el.options].map((o) => o.value)).not.toContain('Mars/Olympus_Mons');
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_continue }));
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard'));
		expect(puts()).toEqual([]);
	});

	it('with canSet false, the select is disabled with the reason, and Continue goes on with no PUT', async () => {
		tzAnswer = () => json({ zone: 'America/Bogota', zones: TZ_ZONES, canSet: false });
		await toTimeZone();
		await expect.element(select()).toBeDisabled();
		await expect
			.element(page.getByText(msgs.this_unit_tz_err_unavailable, { exact: true }))
			.toBeVisible();
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_continue }));
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard'));
		expect(puts()).toEqual([]);
	});

	it('a time zone that cannot be read shows it as not available, and Continue goes on with no PUT', async () => {
		tzAnswer = () => json({ detail: 'x' }, 500);
		await toTimeZone();
		await expect.element(page.getByText(msgs.this_unit_tz_unknown, { exact: true })).toBeVisible();
		expect(document.querySelector('select')).toBeNull();
		await userEvent.click(page.getByRole('button', { name: msgs.setup_tz_continue }));
		await vi.waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/dashboard'));
		expect(puts()).toEqual([]);
	});
});

describe('first-run wizard: answers that arrive late (review round 1)', () => {
	it('a status answer that arrives after the account was created does not move the wizard', async () => {
		let releaseStatus!: () => void;
		statusGate = new Promise<void>((resolve) => (releaseStatus = resolve));
		let releaseLogin!: () => void;
		loginGate = new Promise<void>((resolve) => (releaseLogin = resolve));
		atAccountStep();
		render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		// The account exists and the sign-in is under way when the slow status
		// answer, now saying the unit is set up, arrives.
		await expect.poll(() => calls.some((c) => c.path === '/auth/login')).toBe(true);
		needsSetup = false;
		statusGate = null;
		releaseStatus();
		loginGate = null;
		releaseLogin();
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
		expect(gotoMock).not.toHaveBeenCalled();
		expect(
			calls.filter((c) => c.path === '/auth/setup/status' && c.credentials !== 'omit')
		).toHaveLength(1);
	});

	const hanging = (init?: RequestInit) =>
		new Promise<Response>((_resolve, reject) =>
			init?.signal?.addEventListener('abort', () =>
				reject(new DOMException('aborted', 'AbortError'))
			)
		);
	const logins = () => calls.filter((c) => c.path === '/auth/login');

	async function submitAccount() {
		atAccountStep();
		render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
	}

	it('a registration with no answer that did create the account signs the person in and goes on', async () => {
		registerAnswer = (init) => {
			needsSetup = false;
			return hanging(init);
		};
		await submitAccount();
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
		expect(logins()[0].body).toEqual({ username: 'primera', password: 'fake-pw8' });
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('a connection reset after the account was committed signs the person in and goes on', async () => {
		registerAnswer = () => {
			needsSetup = false;
			throw new TypeError('Failed to fetch');
		};
		await submitAccount();
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
		expect(document.body.textContent).not.toContain(en.setup_err_create);
	});

	it("someone else's account: the sign-in is refused, and the wizard says so and links to sign-in", async () => {
		// Another person finished set-up first: this registration is answered 401.
		registerAnswer = () => {
			needsSetup = false;
			return json({ detail: 'Not authenticated' }, 401);
		};
		loginFails = true;
		await submitAccount();
		await expect.element(page.getByText(en.setup_other_account)).toBeVisible();
		expect(document.body.textContent).not.toContain(en.setup_err_token);
		await userEvent.click(page.getByRole('button', { name: en.setup_go_to_login }));
		expect(gotoMock).toHaveBeenCalledWith('/login');
		expect(authStore.getUser()).toBeNull();
	});

	it('a late commit after the check said none: the form comes back, and the resubmission signs in', async () => {
		registerAnswer = () => json({ detail: 'Internal Server Error' }, 500);
		await submitAccount();
		// The status said none: the form is back, saying neither failed nor created.
		await expect.element(page.getByRole('button', { name: en.setup_submit })).toBeEnabled();
		expect(logins()).toEqual([]);
		expect(document.body.textContent).not.toContain(en.setup_err_create);
		// The first registration commits late; the resubmission is answered 401.
		needsSetup = false;
		registerAnswer = () => json({ detail: 'Not authenticated' }, 401);
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
		expect(document.body.textContent).not.toContain(en.setup_err_token);
	});

	it('when the status cannot be read either, it offers a check; with no account the form comes back', async () => {
		// The status reads fail from the registration on.
		registerAnswer = (init) => {
			statusFails = true;
			return hanging(init);
		};
		await submitAccount();
		await expect.element(page.getByText(en.setup_no_answer)).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: en.setup_check_account }));
		await expect.element(page.getByText(en.setup_check_failed)).toBeVisible();
		statusFails = false;
		await userEvent.click(page.getByRole('button', { name: en.setup_check_account }));
		await expect.element(page.getByRole('button', { name: en.setup_submit })).toBeEnabled();
		expect(document.body.textContent).not.toContain(en.setup_no_answer);
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('a refusal about the fields is shown as before, with no sign-in', async () => {
		registerAnswer = () => json({ detail: 'Username or email already exists' }, 409);
		await submitAccount();
		await expect.element(page.getByText(en.setup_err_exists)).toBeVisible();
		expect(logins()).toEqual([]);
	});

	it('a status answer that arrives after the wizard is gone does not navigate', async () => {
		let release!: () => void;
		statusGate = new Promise<void>((resolve) => (release = resolve));
		const screen = render(SetupPage);
		await expect
			.poll(
				() =>
					calls.filter((c) => c.path === '/auth/setup/status' && c.credentials !== 'omit').length
			)
			.toBe(1);
		screen.unmount();
		needsSetup = false;
		// A request made after the wizard's waits behind it and is answered after it.
		const probe = authApi.setupStatus();
		statusGate = null;
		release();
		await probe;
		expect(gotoMock).not.toHaveBeenCalled();
	});
});

describe('first-run wizard: one busy state, nothing after the page (review round 3)', () => {
	const hanging = (init?: RequestInit) =>
		new Promise<Response>((_resolve, reject) =>
			init?.signal?.addEventListener('abort', () =>
				reject(new DOMException('aborted', 'AbortError'))
			)
		);

	it('while the check signs the person in, the form is not editable and cannot be sent again', async () => {
		registerAnswer = (init) => {
			statusFails = true;
			return hanging(init);
		};
		atAccountStep();
		render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.element(page.getByText(en.setup_no_answer)).toBeVisible();
		// The account turns out to exist; the recovery sign-in is held.
		statusFails = false;
		needsSetup = false;
		let release!: () => void;
		loginGate = new Promise<void>((resolve) => (release = resolve));
		await userEvent.click(page.getByRole('button', { name: en.setup_check_account }));
		await expect.poll(() => calls.some((c) => c.path === '/auth/login')).toBe(true);
		for (const b of document.querySelectorAll<HTMLButtonElement>('.card button'))
			expect(b.disabled, b.textContent ?? '').toBe(true);
		for (const f of document.querySelectorAll<HTMLInputElement>('.card input'))
			expect(f.disabled, f.id).toBe(true);
		document
			.querySelector<HTMLInputElement>('#su-username')
			?.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
			);
		loginGate = null;
		release();
		await expect.element(page.getByRole('heading', { name: en.setup_network_title })).toBeVisible();
		expect(registers()).toHaveLength(1);
	});

	it('a sign-in that answers after the wizard is gone sets no session', async () => {
		let release!: () => void;
		meGate = new Promise<void>((resolve) => (release = resolve));
		atAccountStep();
		const screen = render(SetupPage);
		await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
		await fillAccount();
		await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
		await expect.poll(() => calls.some((c) => c.path === '/users/me')).toBe(true);
		// The person leaves for Credits while the sign-in is under way.
		screen.unmount();
		// A request made after the wizard's waits behind it and is answered after it.
		const probe = usersApi.me();
		await expect.poll(() => calls.filter((c) => c.path === '/users/me').length).toBe(2);
		meGate = null;
		release();
		await probe;
		expect(authStore.getUser()).toBeNull();
		expect(gotoMock).not.toHaveBeenCalled();
	});
});

describe('first-run wizard: fit', () => {
	afterEach(async () => {
		await page.viewport(414, 896);
	});

	// The step's own box (the splash, or the account form's card) lies inside
	// the screen and nothing in it scrolls.
	function noVerticalScroll() {
		const root = document.querySelector<HTMLElement>('.splash, .wizard')!;
		expect(root.scrollHeight, 'step height').toBeLessThanOrEqual(window.innerHeight + 1);
		const box = (document.querySelector('.card') ?? root).getBoundingClientRect();
		expect(box.top, 'top').toBeGreaterThanOrEqual(0);
		expect(box.bottom, 'bottom').toBeLessThanOrEqual(window.innerHeight + 1);
		expect(box.right, 'right').toBeLessThanOrEqual(window.innerWidth + 1);
		expect(document.documentElement.scrollWidth, 'page width').toBeLessThanOrEqual(
			window.innerWidth + 1
		);
	}

	function buttonsInside() {
		for (const b of document.querySelectorAll<HTMLElement>('button')) {
			const r = b.getBoundingClientRect();
			if (r.width === 0) continue;
			if (b.classList.contains('pw-eye')) continue;
			expect(r.height, b.textContent ?? '').toBeGreaterThanOrEqual(44);
			expect(r.bottom, b.textContent ?? '').toBeLessThanOrEqual(window.innerHeight + 1);
			expect(r.right, b.textContent ?? '').toBeLessThanOrEqual(window.innerWidth + 1);
		}
	}

	for (const [w, h] of [
		[800, 480],
		[1280, 800]
	] as const) {
		for (const lang of ['en', 'es'] as const) {
			const msgs = lang === 'en' ? en : es;
			it(`the account step fits ${w}x${h} in ${lang}, at the unit and from elsewhere with an error`, async () => {
				await page.viewport(w, h);
				locale.set(lang);
				atAccountStep();
				const screen = render(SetupPage);
				await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
				await expect.element(page.getByLabelText(msgs.common_username_label)).toBeVisible();
				await userEvent.click(page.getByRole('button', { name: msgs.setup_submit }));
				await expect.element(page.getByText(msgs.setup_val_username_required)).toBeVisible();
				noVerticalScroll();
				buttonsInside();
				screen.unmount();

				directLocal = false;
				render(SetupPage);
				await expect.element(page.getByLabelText(msgs.setup_token_label)).toBeVisible();
				await userEvent.click(page.getByRole('button', { name: msgs.setup_submit }));
				await expect.element(page.getByText(msgs.setup_val_username_required)).toBeVisible();
				noVerticalScroll();
				buttonsInside();
			});
		}

		it(`the network step keeps both buttons on screen at ${w}x${h}`, async () => {
			await page.viewport(w, h);
			atAccountStep();
			render(SetupPage);
			await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
			await fillAccount();
			await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
			await expect
				.element(page.getByRole('heading', { name: en.setup_network_title }))
				.toBeVisible();
			for (const label of [en.setup_network_continue, en.setup_network_later]) {
				const r = page.getByRole('button', { name: label }).element().getBoundingClientRect();
				expect(r.height).toBeGreaterThanOrEqual(44);
				expect(r.bottom).toBeLessThanOrEqual(h);
				expect(r.right).toBeLessThanOrEqual(w);
			}
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w + 1);
		});

		it(`the time-zone step keeps both buttons on screen at ${w}x${h}`, async () => {
			await page.viewport(w, h);
			atAccountStep();
			render(SetupPage);
			await expect.poll(() => calls.some((c) => c.credentials === 'omit')).toBe(true);
			await fillAccount();
			await userEvent.click(page.getByRole('button', { name: en.setup_submit }));
			await userEvent.click(page.getByRole('button', { name: en.setup_network_continue }));
			await expect.element(page.getByRole('heading', { name: en.setup_tz_title })).toBeVisible();
			for (const label of [en.setup_tz_continue, en.setup_tz_later]) {
				const r = page.getByRole('button', { name: label }).element().getBoundingClientRect();
				expect(r.height).toBeGreaterThanOrEqual(44);
				expect(r.bottom).toBeLessThanOrEqual(h);
				expect(r.right).toBeLessThanOrEqual(w);
			}
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w + 1);
		});

		it(`the language step fits ${w}x${h}`, async () => {
			await page.viewport(w, h);
			render(SetupPage);
			await expect
				.element(page.getByRole('button', { name: 'Get started in English' }))
				.toBeVisible();
			noVerticalScroll();
			buttonsInside();
		});
	}
});

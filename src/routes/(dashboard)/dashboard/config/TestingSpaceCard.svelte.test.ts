// Settings → Testing (NEH-391): the administrator's card for the testing
// space. The section's visibility by role, the request made on first
// switch-on, switching off and on again, the term, the account's rename and
// new password, the client-side checks that stop a request, one translated
// message per refusal code (never the backend's text), the password field
// cleared after every request, and both languages. The /system/testing
// routes are mocked and every request is recorded.
//
// Version: 0.2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import type { writable } from 'svelte/store';

const pageStore = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ url: new URL('http://localhost/dashboard/config') });
	pageStore.value = store;
	return { page: store };
});
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { resetUnit } from '$lib/unit-mode';
import type { TestingSpace } from '$lib/api';
import '../../../../app.css';
import ConfigPage from './+page.svelte';
import TestingSpaceCard from './TestingSpaceCard.svelte';

const store = () => pageStore.value as ReturnType<typeof writable<{ url: URL }>>;

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

function space(over: Partial<TestingSpace> = {}): TestingSpace {
	return { enabled: false, username: null, account_active: false, expiry_days: 30, projects: 0, volumes: 0, ...over };
}

type Call = { method: string; path: string; body: unknown };
const BACKEND_TEXT = 'BACKEND-TEXT';

type ServeOptions = {
	state?: TestingSpace;
	next?: TestingSpace;
	refuse?: { status: number; body: unknown };
	getFails?: boolean;
	/** The state GET answers once a write has been refused; 'fail' makes that GET fail. */
	afterRefuse?: TestingSpace | 'fail';
	/** A write fails at the network ('reject') or by timeout ('abort'). */
	network?: 'reject' | 'abort';
	/** A write is held until this promise settles. */
	holdWrite?: Promise<void>;
	/** The GET after the first is held until this promise settles. */
	holdReread?: Promise<void>;
};

/**
 * Records every request. GET answers `state`; a write answers `next` (or the
 * refusal `refuse`, once) and `next` becomes the state.
 */
function serve(opts: ServeOptions = {}) {
	const calls: Call[] = [];
	let state = opts.state ?? space();
	let refused = false;
	let gets = 0;
	const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		const path = new URL(url, 'http://localhost').pathname.replace(/^.*(\/system\/.*)$/, '$1');
		const method = (init?.method ?? 'GET').toUpperCase();
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
		if (path.startsWith('/system/testing')) {
			calls.push({ method, path, body });
			if (method === 'GET') {
				gets += 1;
				if (gets > 1 && opts.holdReread) await opts.holdReread;
				if (opts.getFails || (refused && opts.afterRefuse === 'fail')) return json({ detail: 'x' }, 500);
				return json(state);
			}
			if (opts.holdWrite) await opts.holdWrite;
			if (opts.network && opts.afterRefuse && opts.afterRefuse !== 'fail') state = opts.afterRefuse;
			if (opts.network === 'reject') throw new TypeError('Failed to fetch');
			if (opts.network === 'abort') throw new DOMException('The operation was aborted.', 'AbortError');
			if (opts.refuse) {
				refused = true;
				if (opts.afterRefuse && opts.afterRefuse !== 'fail') state = opts.afterRefuse;
				return json(opts.refuse.body, opts.refuse.status);
			}
			if (opts.next) state = opts.next;
			return json(state);
		}
		if (path === '/system/unit') return json({ mode: 'offline', projectsEnabled: false, projectsShown: false, defaultProjectId: 1, prerequisites: { backup: [], fisqua: [] } });
		return new Response('{}', { status: 500 });
	});
	return { calls, spy, writes: () => calls.filter((c) => c.method !== 'GET'), gets: () => calls.filter((c) => c.method === 'GET') };
}

const refusal = (code: string, status: number) => ({ status, body: { detail: { code, message: BACKEND_TEXT } } });

const field = (label: string) => page.getByLabelText(label, { exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });

beforeEach(() => {
	locale.set('en');
	store().set({ url: new URL('http://localhost/dashboard/config') });
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

describe('Testing section', () => {
	it('an administrator sees it between Fisqua and Storage; operator, reviewer and testing do not', async () => {
		serve();
		signIn('admin');
		const { container, unmount } = render(ConfigPage);
		const names = () => [...container.querySelectorAll('[data-settings-section]')].map((b) => b.textContent?.trim());
		await expect.poll(() => names()).toContain(en.config_section_testing);
		const n = names();
		expect(n.indexOf(en.config_section_testing)).toBe(n.indexOf(en.fisqua_link_title) + 1);
		expect(n.indexOf(en.config_section_storage)).toBe(n.indexOf(en.config_section_testing) + 1);
		unmount();
		for (const role of ['operator', 'reviewer', 'testing'] as const) {
			authStore.clearSession();
			signIn(role);
			store().set({ url: new URL('http://localhost/dashboard/config?section=testing') });
			const r = render(ConfigPage);
			await expect.element(page.getByRole('heading', { name: en.config_section_network, level: 2 })).toBeVisible();
			expect(r.container.textContent).not.toContain(en.config_section_testing);
			r.unmount();
		}
	});

	it('makes no /system/testing request on any other section, and one when Testing is shown', async () => {
		const s = serve();
		signIn('admin');
		for (const id of ['network', 'language', 'unit-mode', 'fisqua-link', 'power']) {
			store().set({ url: new URL(`http://localhost/dashboard/config?section=${id}`) });
			const r = render(ConfigPage);
			await new Promise((res) => setTimeout(res, 80));
			r.unmount();
		}
		expect(s.calls).toEqual([]);
		store().set({ url: new URL('http://localhost/dashboard/config?section=testing') });
		render(ConfigPage);
		await expect.element(page.getByRole('heading', { name: en.config_section_testing, level: 2 })).toBeVisible();
		await expect.poll(() => s.calls.length).toBe(1);
		expect(s.calls[0]).toMatchObject({ method: 'GET', path: '/system/testing' });
	});
});

describe('Testing card: first switch-on', () => {
	it('sends the trimmed username, the password and the term, and shows the state it gets back', async () => {
		const s = serve({ next: space({ enabled: true, username: 'practice', account_active: true }) });
		render(TestingSpaceCard);
		await expect.element(field(en.testing_username_label)).toBeVisible();
		await expect.element(field(en.testing_expiry_label)).toHaveValue('30');
		await field(en.testing_username_label).fill('  practice  ');
		await field(en.testing_password_label).fill('s3cret-pass');
		await button(en.testing_switch_on).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0]).toEqual({ method: 'PUT', path: '/system/testing', body: { enabled: true, username: 'practice', password: 's3cret-pass', expiry_days: 30 } });
		await expect.element(page.getByText('practice', { exact: true })).toBeVisible();
		await expect.element(button(en.testing_switch_off)).toBeVisible();
	});

	it('password fields are password inputs that ask the browser not to fill them', async () => {
		serve();
		render(TestingSpaceCard);
		await expect.element(field(en.testing_password_label)).toBeVisible();
		const el = (await field(en.testing_password_label).element()) as HTMLInputElement;
		expect(el.type).toBe('password');
		expect(el.autocomplete).toBe('new-password');
	});

	const bad: [string, { user?: string; pass?: string; days?: string }, string][] = [
		['empty username', { user: '   ' }, en.testing_err_username],
		['username over 150 characters', { user: 'a'.repeat(151) }, en.testing_err_username],
		['empty password', { pass: '' }, en.testing_err_password_empty],
		['days 0', { days: '0' }, en.testing_err_days],
		['days 366', { days: '366' }, en.testing_err_days],
		['days 1.5', { days: '1.5' }, en.testing_err_days],
		['days not a number', { days: 'abc' }, en.testing_err_days],
		['days empty', { days: '' }, en.testing_err_days]
	];
	for (const [name, v, message] of bad) {
		it(`blocks the request on ${name} and shows a message`, async () => {
			const s = serve();
			render(TestingSpaceCard);
			await expect.element(field(en.testing_username_label)).toBeVisible();
			await field(en.testing_username_label).fill(v.user ?? 'practice');
			await field(en.testing_password_label).fill(v.pass ?? 'pw');
			await field(en.testing_expiry_label).fill(v.days ?? '30');
			await button(en.testing_switch_on).click();
			await expect.element(page.getByText(message, { exact: true })).toBeVisible();
			expect(s.writes()).toEqual([]);
		});
	}

	it('accepts a username of exactly 150 characters and days 365, and sends them as typed', async () => {
		const s = serve({ next: space({ enabled: true, username: 'a', account_active: true }) });
		render(TestingSpaceCard);
		await expect.element(field(en.testing_username_label)).toBeVisible();
		await field(en.testing_username_label).fill('a'.repeat(150));
		await field(en.testing_password_label).fill('pw');
		await field(en.testing_expiry_label).fill('365');
		await button(en.testing_switch_on).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0].body).toEqual({ enabled: true, username: 'a'.repeat(150), password: 'pw', expiry_days: 365 });
	});

	it('accepts days 1', async () => {
		const s = serve({ next: space({ enabled: true, username: 'a', account_active: true }) });
		render(TestingSpaceCard);
		await expect.element(field(en.testing_username_label)).toBeVisible();
		await field(en.testing_username_label).fill('a');
		await field(en.testing_password_label).fill('pw');
		await field(en.testing_expiry_label).fill('1');
		await button(en.testing_switch_on).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0].body).toMatchObject({ expiry_days: 1 });
	});
});

describe('Testing card: on and off', () => {
	const on = () => space({ enabled: true, username: 'practice', account_active: true, expiry_days: 14, projects: 2, volumes: 5 });
	const off = () => space({ enabled: false, username: 'practice', account_active: false, expiry_days: 14, projects: 2, volumes: 5 });

	it('shows on, the username and the counts', async () => {
		serve({ state: on() });
		const { container } = render(TestingSpaceCard);
		await expect.element(button(en.testing_switch_off)).toBeVisible();
		expect(container.textContent).toContain('practice');
		expect(container.textContent).toContain(en.testing_state_on);
		expect(container.textContent).toContain(en.testing_counts(2, 5));
	});

	it('switching off asks for confirmation first, says what happens, and sends {enabled:false} only', async () => {
		const s = serve({ state: on(), next: off() });
		const { container } = render(TestingSpaceCard);
		await button(en.testing_switch_off).click();
		expect(s.writes()).toEqual([]);
		await expect.element(page.getByText(en.testing_off_confirm_text, { exact: true })).toBeVisible();
		await button(en.common_cancel).click();
		expect(s.writes()).toEqual([]);
		await button(en.testing_switch_off).click();
		await button(en.testing_off_confirm).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0]).toEqual({ method: 'PUT', path: '/system/testing', body: { enabled: false } });
		await expect.element(button(en.testing_switch_on)).toBeVisible();
		expect(container.textContent).toContain(en.testing_state_off);
	});

	it('switching on again with an account sends the term and no credentials', async () => {
		const s = serve({ state: off(), next: on() });
		const { container } = render(TestingSpaceCard);
		await expect.element(button(en.testing_switch_on)).toBeVisible();
		expect(container.querySelector('#testing-username')).toBeNull();
		expect(container.querySelector('#testing-password')).toBeNull();
		await expect.element(field(en.testing_expiry_label)).toHaveValue('14');
		await button(en.testing_switch_on).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0]).toEqual({ method: 'PUT', path: '/system/testing', body: { enabled: true, expiry_days: 14 } });
	});

	it('changing the term sends enabled:true and the new days', async () => {
		const s = serve({ state: on(), next: { ...on(), expiry_days: 60 } });
		render(TestingSpaceCard);
		await field(en.testing_expiry_label).fill('60');
		await button(en.testing_term_save).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0]).toEqual({ method: 'PUT', path: '/system/testing', body: { enabled: true, expiry_days: 60 } });
	});

	it('a bad term on an enabled space is blocked', async () => {
		const s = serve({ state: on() });
		render(TestingSpaceCard);
		await field(en.testing_expiry_label).fill('400');
		await button(en.testing_term_save).click();
		await expect.element(page.getByText(en.testing_err_days, { exact: true })).toBeVisible();
		expect(s.writes()).toEqual([]);
	});

	it('renaming sends PATCH with the trimmed username only', async () => {
		const s = serve({ state: on(), next: { ...on(), username: 'lab' } });
		render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('  lab ');
		await button(en.testing_rename).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0]).toEqual({ method: 'PATCH', path: '/system/testing/account', body: { username: 'lab' } });
		await expect.element(page.getByText('lab', { exact: true })).toBeVisible();
	});

	it('an empty rename is blocked', async () => {
		const s = serve({ state: on() });
		render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('   ');
		await button(en.testing_rename).click();
		await expect.element(page.getByText(en.testing_err_username, { exact: true })).toBeVisible();
		expect(s.writes()).toEqual([]);
	});

	it('a new password sends PATCH with the password only, says people are signed out, and clears the field', async () => {
		const s = serve({ state: on() });
		const { container } = render(TestingSpaceCard);
		await expect.element(button(en.testing_password_set)).toBeVisible();
		expect(container.textContent).toContain(en.testing_password_signout);
		const input = field(en.testing_new_password_label);
		await input.fill('another-pass');
		await button(en.testing_password_set).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0]).toEqual({ method: 'PATCH', path: '/system/testing/account', body: { password: 'another-pass' } });
		await expect.element(input).toHaveValue('');
		expect(container.textContent).not.toContain('another-pass');
	});

	it('an empty new password is blocked', async () => {
		const s = serve({ state: on() });
		render(TestingSpaceCard);
		await button(en.testing_password_set).click();
		await expect.element(page.getByText(en.testing_err_password_empty, { exact: true })).toBeVisible();
		expect(s.writes()).toEqual([]);
	});
});

describe('Testing card: refusals', () => {
	const cases: [string, number, string][] = [
		['account_required', 422, en.testing_err_account_required],
		['space_off', 422, en.testing_err_space_off],
		['username_taken', 409, en.testing_err_username_taken],
		['account_exists', 409, en.testing_err_account_exists],
		['no_testing_account', 404, en.testing_err_no_account],
		['password_empty', 422, en.testing_err_password_empty],
		['password_invalid', 422, en.testing_err_password_invalid]
	];
	for (const [code, status, message] of cases) {
		it(`${code} shows its own message, not the backend's`, async () => {
			serve({ refuse: refusal(code, status) });
			const { container } = render(TestingSpaceCard);
			await field(en.testing_username_label).fill('practice');
			await field(en.testing_password_label).fill('pw');
			await button(en.testing_switch_on).click();
			await expect.element(page.getByRole('alert')).toHaveTextContent(message);
			expect(container.textContent).not.toContain(BACKEND_TEXT);
		});
	}

	it('each code renders its own message on the page, and the messages differ from each other', async () => {
		const shown: string[] = [];
		for (const [code, status, message] of cases) {
			serve({ refuse: refusal(code, status) });
			const { container, unmount } = render(TestingSpaceCard);
			await field(en.testing_username_label).fill('practice');
			await field(en.testing_password_label).fill('pw');
			await button(en.testing_switch_on).click();
			await expect.element(page.getByRole('alert')).toHaveTextContent(message);
			shown.push(((await page.getByRole('alert').element()) as HTMLElement).textContent?.trim() ?? '');
			expect(container.textContent).not.toContain(BACKEND_TEXT);
			unmount();
			vi.restoreAllMocks();
		}
		expect(new Set(shown).size).toBe(cases.length);
	});

	it('an unknown code shows the generic string', async () => {
		serve({ refuse: refusal('something_new', 409) });
		const { container } = render(TestingSpaceCard);
		await field(en.testing_username_label).fill('practice');
		await field(en.testing_password_label).fill('pw');
		await button(en.testing_switch_on).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_generic);
		expect(container.textContent).not.toContain(BACKEND_TEXT);
	});

	it('a framework validation list and a plain-string detail show the generic string', async () => {
		for (const body of [{ detail: [{ loc: ['body', 'username'], msg: BACKEND_TEXT }] }, { detail: BACKEND_TEXT }]) {
			serve({ refuse: { status: 422, body } });
			const { container, unmount } = render(TestingSpaceCard);
			await field(en.testing_username_label).fill('practice');
			await field(en.testing_password_label).fill('pw');
			await button(en.testing_switch_on).click();
			await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_generic);
			expect(container.textContent).not.toContain(BACKEND_TEXT);
			unmount();
			vi.restoreAllMocks();
		}
	});

	it('the password field is empty after a failed request, and the username is kept', async () => {
		serve({ refuse: refusal('username_taken', 409) });
		render(TestingSpaceCard);
		await field(en.testing_username_label).fill('practice');
		await field(en.testing_password_label).fill('pw-to-clear');
		await button(en.testing_switch_on).click();
		await expect.element(page.getByRole('alert')).toBeVisible();
		await expect.element(field(en.testing_password_label)).toHaveValue('');
		await expect.element(field(en.testing_username_label)).toHaveValue('practice');
	});

	it('the password is never logged', async () => {
		serve({ refuse: refusal('password_invalid', 422) });
		const logs = [vi.spyOn(console, 'error'), vi.spyOn(console, 'log'), vi.spyOn(console, 'warn')];
		render(TestingSpaceCard);
		await field(en.testing_username_label).fill('practice');
		await field(en.testing_password_label).fill('very-secret-value');
		await button(en.testing_switch_on).click();
		await expect.element(page.getByRole('alert')).toBeVisible();
		for (const l of logs) expect(JSON.stringify(l.mock.calls)).not.toContain('very-secret-value');
	});

	it('shows a failed load with its own message and no form', async () => {
		serve({ getFails: true });
		const { container } = render(TestingSpaceCard);
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_load);
		expect(container.querySelector('input')).toBeNull();
	});
});

describe('Testing card: languages', () => {
	it('renders in Spanish', async () => {
		locale.set('es');
		serve({ state: space({ enabled: true, username: 'practice', account_active: true, projects: 1, volumes: 1 }) });
		const { container } = render(TestingSpaceCard);
		await expect.element(button(es.testing_switch_off)).toBeVisible();
		expect(container.textContent).toContain(es.testing_desc);
		expect(es.testing_desc).not.toBe(en.testing_desc);
	});

	it('renders in English', async () => {
		serve();
		const { container } = render(TestingSpaceCard);
		await expect.element(button(en.testing_switch_on)).toBeVisible();
		expect(container.textContent).toContain(en.testing_desc);
	});
});

const acct = (over: Partial<TestingSpace> = {}) => space({ enabled: true, username: 'practice', account_active: true, expiry_days: 14, projects: 2, volumes: 5, ...over });
const acctOff = (over: Partial<TestingSpace> = {}) => acct({ enabled: false, account_active: false, ...over });
const active = async () => document.activeElement;
const isFocused = async (name: string) => (await button(name).element()) === document.activeElement;

describe('Testing card: forms and the password manager', () => {
	it('the create form is a form whose username field is autocomplete="username"', async () => {
		serve();
		render(TestingSpaceCard);
		await expect.element(field(en.testing_username_label)).toBeVisible();
		const user = (await field(en.testing_username_label).element()) as HTMLInputElement;
		expect(user.autocomplete).toBe('username');
		const form = user.closest('form')!;
		expect(form).not.toBeNull();
		expect(form.contains((await field(en.testing_password_label).element()) as Element)).toBe(true);
		expect(((await field(en.testing_password_label).element()) as HTMLInputElement).autocomplete).toBe('new-password');
	});

	it('the new-password input sits in a form with the account username, read-only, autocomplete="username"', async () => {
		serve({ state: acct() });
		render(TestingSpaceCard);
		await expect.element(field(en.testing_new_password_label)).toBeVisible();
		const pw = (await field(en.testing_new_password_label).element()) as HTMLInputElement;
		expect(pw.autocomplete).toBe('new-password');
		const form = pw.closest('form')!;
		const who = form.querySelector('input[autocomplete="username"]') as HTMLInputElement;
		expect(who.value).toBe('practice');
		expect(who.readOnly).toBe(true);
		expect(form.querySelectorAll('button').length).toBe(1);
	});

	it('Enter in the new-password field sends exactly the PATCH with the password', async () => {
		const s = serve({ state: acct() });
		render(TestingSpaceCard);
		await field(en.testing_new_password_label).fill('pw-by-enter');
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()).toEqual([{ method: 'PATCH', path: '/system/testing/account', body: { password: 'pw-by-enter' } }]);
	});

	it('Enter in the term field sends only the term, never a switch-off', async () => {
		const s = serve({ state: acct() });
		render(TestingSpaceCard);
		await field(en.testing_expiry_label).fill('20');
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()).toEqual([{ method: 'PUT', path: '/system/testing', body: { enabled: true, expiry_days: 20 } }]);
	});

	it('Enter in the rename field sends only the rename', async () => {
		const s = serve({ state: acct(), next: acct({ username: 'lab' }) });
		render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('lab');
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()).toEqual([{ method: 'PATCH', path: '/system/testing/account', body: { username: 'lab' } }]);
	});

	it('Enter in the create form sends the first switch-on', async () => {
		const s = serve({ next: acct() });
		render(TestingSpaceCard);
		await field(en.testing_username_label).fill('practice');
		await field(en.testing_password_label).fill('pw');
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0].body).toEqual({ enabled: true, username: 'practice', password: 'pw', expiry_days: 30 });
	});
});

describe('Testing card: focus', () => {
	it('opening the confirmation focuses Cancel and describes the group by its text; Cancel returns focus to Switch off', async () => {
		serve({ state: acct() });
		render(TestingSpaceCard);
		await button(en.testing_switch_off).click();
		await expect.poll(() => isFocused(en.common_cancel)).toBe(true);
		const group = (await page.getByRole('group', { name: en.testing_switch_off }).element()) as HTMLElement;
		const text = document.getElementById(group.getAttribute('aria-describedby')!);
		expect(text?.textContent?.trim()).toBe(en.testing_off_confirm_text);
		await button(en.common_cancel).click();
		await expect.poll(() => isFocused(en.testing_switch_off)).toBe(true);
	});

	it('after a successful switch-off focus is on Switch on', async () => {
		serve({ state: acct(), next: acctOff() });
		render(TestingSpaceCard);
		await button(en.testing_switch_off).click();
		await button(en.testing_off_confirm).click();
		await expect.element(page.getByText(en.testing_state_off, { exact: true })).toBeVisible();
		await expect.poll(() => isFocused(en.testing_switch_on)).toBe(true);
	});

	it('after a successful switch-on with an account focus is on Switch off', async () => {
		serve({ state: acctOff(), next: acct() });
		render(TestingSpaceCard);
		await button(en.testing_switch_on).click();
		await expect.poll(() => isFocused(en.testing_switch_off)).toBe(true);
	});

	it('after the first switch-on focus is on Switch off', async () => {
		serve({ next: acct() });
		render(TestingSpaceCard);
		await field(en.testing_username_label).fill('practice');
		await field(en.testing_password_label).fill('pw');
		await button(en.testing_switch_on).click();
		await expect.poll(() => isFocused(en.testing_switch_off)).toBe(true);
	});

	it('after a rename, focus is not lost to the page', async () => {
		serve({ state: acct(), next: acct({ username: 'lab' }) });
		render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('lab');
		await button(en.testing_rename).click();
		await expect.element(page.getByText(en.testing_saved, { exact: true })).toBeVisible();
		await expect.poll(() => isFocused(en.testing_rename)).toBe(true);
		expect(await active()).not.toBe(document.body);
	});
});

describe('Testing card: with the space off', () => {
	it('Save term sends enabled:false with the term, without switching on', async () => {
		const s = serve({ state: acctOff(), next: acctOff({ expiry_days: 45 }) });
		const { container } = render(TestingSpaceCard);
		await field(en.testing_expiry_label).fill('45');
		await button(en.testing_term_save).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0]).toEqual({ method: 'PUT', path: '/system/testing', body: { enabled: false, expiry_days: 45 } });
		expect(container.textContent).toContain(en.testing_state_off);
	});

	it('renaming and a new password work without switching on', async () => {
		const s = serve({ state: acctOff(), next: acctOff({ username: 'lab' }) });
		render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('lab');
		await button(en.testing_rename).click();
		await expect.poll(() => s.writes().length).toBe(1);
		await field(en.testing_new_password_label).fill('newpw');
		await button(en.testing_password_set).click();
		await expect.poll(() => s.writes().length).toBe(2);
		expect(s.writes().map((c) => [c.method, c.path, c.body])).toEqual([
			['PATCH', '/system/testing/account', { username: 'lab' }],
			['PATCH', '/system/testing/account', { password: 'newpw' }]
		]);
	});

	it('Switch on always sends the term in the field, changed or not', async () => {
		const s = serve({ state: acctOff(), next: acct({ expiry_days: 45 }) });
		render(TestingSpaceCard);
		await field(en.testing_expiry_label).fill('45');
		await button(en.testing_switch_on).click();
		await expect.poll(() => s.writes().length).toBe(1);
		expect(s.writes()[0].body).toEqual({ enabled: true, expiry_days: 45 });
	});

	it('the term, rename and password controls are hidden while the switch-off confirmation is open', async () => {
		const s = serve({ state: acct() });
		const { container } = render(TestingSpaceCard);
		await button(en.testing_switch_off).click();
		await expect.element(button(en.testing_off_confirm)).toBeVisible();
		expect(container.querySelector('#testing-expiry')).toBeNull();
		expect(container.querySelector('#testing-new-username')).toBeNull();
		expect(container.querySelector('#testing-new-password')).toBeNull();
		for (const name of [en.testing_term_save, en.testing_rename, en.testing_password_set]) {
			expect([...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === name)).toBe(false);
		}
		expect(s.writes()).toEqual([]);
	});
});

describe('Testing card: state after a failed request', () => {
	it('account_exists: the create form is replaced by the account that exists, and the message stays', async () => {
		const s = serve({ refuse: refusal('account_exists', 409), afterRefuse: acctOff({ username: 'someone-else' }) });
		const { container } = render(TestingSpaceCard);
		await field(en.testing_username_label).fill('practice');
		await field(en.testing_password_label).fill('pw');
		await button(en.testing_switch_on).click();
		await expect.element(page.getByText('someone-else', { exact: true })).toBeVisible();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_account_exists);
		expect(container.querySelector('#testing-username')).toBeNull();
		expect(container.querySelector('#testing-password')).toBeNull();
		expect(s.gets().length).toBe(2);
		// A retry now sends no credentials.
		await button(en.testing_switch_on).click();
		await expect.poll(() => s.writes().length).toBe(2);
		expect(s.writes()[1].body).toEqual({ enabled: true, expiry_days: 30 });
	});

	it('no_testing_account: the card shows there is no account and offers the create form', async () => {
		const s = serve({ state: acct(), refuse: refusal('no_testing_account', 404), afterRefuse: space() });
		render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('lab');
		await button(en.testing_rename).click();
		await expect.element(field(en.testing_username_label)).toBeVisible();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_no_account);
		expect(s.gets().length).toBe(2);
	});

	it('a rejected fetch shows the generic line and reads the state again', async () => {
		const s = serve({ state: acct(), network: 'reject' });
		render(TestingSpaceCard);
		await field(en.testing_new_password_label).fill('pw');
		await button(en.testing_password_set).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_generic);
		expect(s.gets().length).toBe(2);
	});

	it('a timeout shows the generic line and reads the state again', async () => {
		const s = serve({ state: acct(), network: 'abort' });
		render(TestingSpaceCard);
		await field(en.testing_new_password_label).fill('pw');
		await button(en.testing_password_set).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_generic);
		expect(s.gets().length).toBe(2);
	});

	it('a 403 shows the generic line', async () => {
		serve({ state: acct(), refuse: { status: 403, body: { detail: BACKEND_TEXT } } });
		const { container } = render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('lab');
		await button(en.testing_rename).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_generic);
		expect(container.textContent).not.toContain(BACKEND_TEXT);
	});

	it('when the second read fails too the card shows the load failure', async () => {
		serve({ state: acct(), refuse: refusal('password_invalid', 422), afterRefuse: 'fail' });
		const { container } = render(TestingSpaceCard);
		await field(en.testing_new_password_label).fill('pw');
		await button(en.testing_password_set).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_load);
		expect(container.querySelector('input')).toBeNull();
	});

	it('the shown state is unchanged by a failed request until the re-read answers', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		serve({ state: acct(), refuse: refusal('password_invalid', 422), afterRefuse: acctOff({ username: 'changed' }), holdReread: gate });
		const { container } = render(TestingSpaceCard);
		await field(en.testing_new_password_label).fill('pw');
		await button(en.testing_password_set).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_password_invalid);
		expect(container.textContent).toContain(en.testing_state_on);
		expect(container.textContent).toContain('practice');
		expect(container.textContent).not.toContain('changed');
		release();
		await expect.poll(() => container.textContent).toContain('changed');
		expect(container.textContent).toContain(en.testing_state_off);
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_password_invalid);
	});

	it('a failed switch-off keeps the confirmation and shows the error', async () => {
		serve({ state: acct(), refuse: refusal('no_testing_account', 404), afterRefuse: acct() });
		render(TestingSpaceCard);
		await button(en.testing_switch_off).click();
		await button(en.testing_off_confirm).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.testing_err_no_account);
		await expect.element(button(en.testing_off_confirm)).toBeVisible();
	});

	it('a switch-off whose answer is lost, with the space off on the next read, shows Switch on, focused, and the other sections', async () => {
		serve({ state: acct(), network: 'reject', afterRefuse: acctOff() });
		const { container } = render(TestingSpaceCard);
		await button(en.testing_switch_off).click();
		await button(en.testing_off_confirm).click();
		await expect.element(button(en.testing_switch_on)).toBeVisible();
		await expect.poll(() => isFocused(en.testing_switch_on)).toBe(true);
		expect(container.querySelector('button.t-btn-danger')?.textContent?.trim()).toBe(en.testing_clear);
		expect([...container.querySelectorAll('button')].some((b) => b.textContent?.trim() === en.testing_off_confirm)).toBe(false);
		expect(container.querySelector('#testing-expiry')).not.toBeNull();
		expect(container.querySelector('#testing-new-username')).not.toBeNull();
		expect(container.querySelector('#testing-new-password')).not.toBeNull();
		expect(container.querySelector('#testing-reserve')).not.toBeNull();
	});

	it('the new-password field is empty after a failed PATCH', async () => {
		serve({ state: acct(), refuse: refusal('password_invalid', 422), afterRefuse: acct() });
		render(TestingSpaceCard);
		await field(en.testing_new_password_label).fill('to-clear');
		await button(en.testing_password_set).click();
		await expect.element(page.getByRole('alert')).toBeVisible();
		await expect.element(field(en.testing_new_password_label)).toHaveValue('');
	});
});

describe('Testing card: typed values and requests in flight', () => {
	it('a success of one action leaves the other actions\' fields alone; passwords are cleared', async () => {
		serve({ state: acct(), next: acct({ username: 'lab' }) });
		render(TestingSpaceCard);
		await field(en.testing_expiry_label).fill('99');
		await field(en.testing_new_password_label).fill('pw-typed');
		await field(en.testing_new_username_label).fill('lab');
		await button(en.testing_rename).click();
		await expect.element(page.getByText(en.testing_saved, { exact: true })).toBeVisible();
		await expect.element(field(en.testing_expiry_label)).toHaveValue('99');
		await expect.element(field(en.testing_new_username_label)).toHaveValue('');
		await expect.element(field(en.testing_new_password_label)).toHaveValue('');
	});

	it('controls are disabled while a request runs, and a second click sends nothing', async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const s = serve({ state: acct(), next: acct({ username: 'lab' }), holdWrite: gate });
		render(TestingSpaceCard);
		await field(en.testing_new_username_label).fill('lab');
		await button(en.testing_rename).click();
		await expect.poll(() => s.writes().length).toBe(1);
		const rename = (await button(en.testing_rename).element()) as HTMLButtonElement;
		expect(rename.disabled).toBe(true);
		for (const name of [en.testing_term_save, en.testing_password_set, en.testing_switch_off]) {
			expect(((await button(name).element()) as HTMLButtonElement).disabled).toBe(true);
		}
		rename.click();
		rename.form?.requestSubmit();
		await new Promise((r) => setTimeout(r, 60));
		expect(s.writes().length).toBe(1);
		release();
		await expect.element(page.getByText(en.testing_saved, { exact: true })).toBeVisible();
		expect(s.writes().length).toBe(1);
	});

	it('leaving the section and coming back shows empty password fields', async () => {
		serve({ state: acct() });
		signIn('admin');
		store().set({ url: new URL('http://localhost/dashboard/config?section=testing') });
		render(ConfigPage);
		await field(en.testing_new_password_label).fill('left-behind');
		store().set({ url: new URL('http://localhost/dashboard/config?section=power') });
		await expect.element(page.getByRole('heading', { name: en.config_section_power, level: 2 })).toBeVisible();
		store().set({ url: new URL('http://localhost/dashboard/config?section=testing') });
		await expect.element(field(en.testing_new_password_label)).toHaveValue('');
	});
});

describe('Testing card: other roles', () => {
	it('operator, reviewer and testing send no /system/testing request on any section', async () => {
		const s = serve({ state: acct() });
		for (const role of ['operator', 'reviewer', 'testing'] as const) {
			authStore.clearSession();
			signIn(role);
			for (const id of ['network', 'language', 'unit-mode', 'fisqua-link', 'testing', 'storage', 'offsite-copy', 'diagnostics', 'maintenance', 'power']) {
				store().set({ url: new URL(`http://localhost/dashboard/config?section=${id}`) });
				const r = render(ConfigPage);
				await new Promise((res) => setTimeout(res, 40));
				r.unmount();
			}
		}
		expect(s.calls).toEqual([]);
	});
});

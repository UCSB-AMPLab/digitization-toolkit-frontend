// Set password on the Users page (NEH-395): an administrator gives another
// user a new password through PUT /auth/users/{user_id}/password. The action
// is on every row but the testing account's and the administrator's own, and
// only for an administrator; the dialog checks the two fields before it
// sends, carries the target's username for the browser's password manager,
// and shows each refusal in the interface's own words.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { ROUTES, routeOf } from '$lib/test-support/testing-routes';
import { setsUserPasswords } from '$lib/unit-mode';
import '../../../../app.css';
import UsersPage from './+page.svelte';

const FAKE_PASSWORD = 'fake-pw-for-tests-1';
const ADMIN = { id: 3, username: 'jefa', email: null, role: 'admin' as const, is_active: true };

const users = [
	{ id: 1, username: 'ana', email: null, role: 'operator', is_active: true, created_at: '2026-01-01T00:00:00Z' },
	{ id: 2, username: 'unit-testing', email: null, role: 'testing', is_active: true, created_at: '2026-01-01T00:00:00Z' },
	{ id: 3, username: 'jefa', email: null, role: 'admin', is_active: true, created_at: '2026-01-01T00:00:00Z' },
	{ id: 4, username: 'luis', email: null, role: 'reviewer', is_active: true, created_at: '2026-01-01T00:00:00Z' },
	{ id: 5, username: 'otra-jefa', email: null, role: 'admin', is_active: true, created_at: '2026-01-01T00:00:00Z' }
];

interface Sent {
	method: string;
	path: string;
	body: unknown;
}

let sent: Sent[];
let answer: () => Response;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serve() {
	sent = [];
	answer = () => json(users[0]);
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url, 'http://localhost:8000');
		const method = (init?.method ?? 'GET').toUpperCase();
		const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		sent.push({ method, path: url.pathname, body });
		if (method === 'GET' && url.pathname === '/auth/users') return json(users);
		if (method === 'PUT' && /^\/auth\/users\/\d+\/password$/.test(url.pathname)) return answer();
		return json(null);
	});
}

function signIn(role: UserRole) {
	authStore.setSession(role === 'admin' ? ADMIN : { id: 9, username: 'someone', email: null, role, is_active: true });
}

function rowOf(name: string) {
	return [...document.querySelectorAll('tr.table-row')].find(
		(r) => r.querySelector('.user-fullname')?.textContent?.trim() === name
	) as HTMLElement;
}

async function openRowMenu(name: string) {
	await expect.element(page.getByText(name, { exact: true })).toBeVisible();
	(rowOf(name).querySelector('.btn-actions') as HTMLButtonElement).click();
}

async function openDialogFor(name: string, msgs = en) {
	await openRowMenu(name);
	// The dropdown is fixed to the row's button, which the narrow test frame
	// leaves outside the viewport, so the item is clicked through the DOM.
	const item = page.getByRole('button', { name: msgs.users_password_action });
	await expect.element(item).toBeInTheDocument();
	(item.element() as HTMLButtonElement).click();
	await expect.element(page.getByRole('dialog')).toBeVisible();
}

async function fill(newPassword: string, repeat: string, msgs = en) {
	await userEvent.fill(page.getByLabelText(msgs.users_password_new_label, { exact: true }), newPassword);
	await userEvent.fill(page.getByLabelText(msgs.users_password_repeat_label, { exact: true }), repeat);
	await page.getByRole('button', { name: msgs.common_save, exact: true }).click();
}

function puts() {
	return sent.filter((r) => r.method === 'PUT');
}

beforeEach(() => {
	locale.set('en');
	serve();
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('who sees Set password', () => {
	it('is offered on the rows of operators, reviewers and other administrators', async () => {
		signIn('admin');
		render(UsersPage);
		for (const name of ['ana', 'luis', 'otra-jefa']) {
			await openRowMenu(name);
			await expect.element(page.getByRole('button', { name: en.users_password_action })).toBeVisible();
			document.body.click();
		}
	});

	it('is absent on the testing account row, which has no actions at all', async () => {
		signIn('admin');
		render(UsersPage);
		await expect.element(page.getByText('unit-testing')).toBeVisible();
		expect(rowOf('unit-testing').querySelector('.btn-actions')).toBeNull();
	});

	it('is absent on the administrator’s own row, which keeps Edit', async () => {
		signIn('admin');
		render(UsersPage);
		await openRowMenu('jefa');
		await expect.element(page.getByRole('button', { name: en.common_edit })).toBeVisible();
		expect(page.getByRole('button', { name: en.users_password_action }).elements()).toHaveLength(0);
	});

	for (const role of ['operator', 'reviewer'] as const) {
		it(`is absent for the ${role} role`, async () => {
			expect(setsUserPasswords(role)).toBe(false);
			signIn(role);
			render(UsersPage);
			await openRowMenu('ana');
			await expect.element(page.getByRole('button', { name: en.common_edit })).toBeVisible();
			expect(page.getByRole('button', { name: en.users_password_action }).elements()).toHaveLength(0);
		});
	}

	it('is for the administrator only', () => {
		expect(setsUserPasswords('admin')).toBe(true);
		expect(setsUserPasswords('testing')).toBe(false);
		expect(setsUserPasswords(null)).toBe(false);
	});
});

describe('the dialog', () => {
	it('names the user and carries their username for the password manager', async () => {
		signIn('admin');
		render(UsersPage);
		await openDialogFor('ana');
		const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
		expect(dialog.textContent).toContain(en.users_password_title('ana'));
		const form = dialog.querySelector('form') as HTMLFormElement;
		const username = form.querySelector('input[autocomplete="username"]') as HTMLInputElement;
		expect(username.value).toBe('ana');
		expect(username.readOnly).toBe(true);
		const passwords = [...form.querySelectorAll('input[type="password"]')] as HTMLInputElement[];
		expect(passwords.map((i) => i.autocomplete)).toEqual(['new-password', 'new-password']);
		expect(form.querySelectorAll('input[autocomplete="current-password"]')).toHaveLength(0);
		expect(document.activeElement).toBe(page.getByLabelText(en.users_password_new_label, { exact: true }).element());
	});

	it('shows and hides each password', async () => {
		signIn('admin');
		render(UsersPage);
		await openDialogFor('ana');
		const input = page.getByLabelText(en.users_password_new_label, { exact: true }).element() as HTMLInputElement;
		await page.getByRole('button', { name: en.common_show_password }).first().click();
		expect(input.type).toBe('text');
		await page.getByRole('button', { name: en.common_hide_password }).click();
		expect(input.type).toBe('password');
	});

	it('sends nothing while the two fields differ', async () => {
		signIn('admin');
		render(UsersPage);
		await openDialogFor('ana');
		await fill(FAKE_PASSWORD, FAKE_PASSWORD + 'x');
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.users_val_password_mismatch);
		expect(puts()).toEqual([]);
		await expect.element(page.getByRole('dialog')).toBeVisible();
	});

	it('sends nothing for a blank password', async () => {
		signIn('admin');
		render(UsersPage);
		await openDialogFor('ana');
		await fill('   ', '   ');
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.users_val_password_required);
		expect(puts()).toEqual([]);
	});

	it('sends nothing for 7 characters and shows the shared message', async () => {
		signIn('admin');
		render(UsersPage);
		await openDialogFor('ana');
		await fill('fake-pw', 'fake-pw');
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.common_password_too_short(8));
		expect(puts()).toEqual([]);
	});

	it('closes Cancel without a request', async () => {
		signIn('admin');
		render(UsersPage);
		await openDialogFor('ana');
		await page.getByRole('button', { name: en.common_cancel }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(puts()).toEqual([]);
	});
});

const LOCALES: [Locale, typeof en][] = [['en', en], ['es', es]];

describe('success and refusals', () => {
	for (const [lang, msgs] of LOCALES) {
		it(`on success closes and confirms the person was signed out everywhere (${lang})`, async () => {
			locale.set(lang);
			signIn('admin');
			render(UsersPage);
			await openDialogFor('ana', msgs);
			await fill(FAKE_PASSWORD, FAKE_PASSWORD, msgs);
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			await expect.element(page.getByRole('status')).toHaveTextContent(msgs.users_password_done('ana'));
			expect(puts()).toEqual([{ method: 'PUT', path: '/auth/users/1/password', body: { new_password: FAKE_PASSWORD } }]);
		});

		const refusals: [string, () => Response, string][] = [
			['user_not_found', () => json({ detail: { code: 'user_not_found', message: 'x' } }, 404), msgs.users_password_err_user_not_found],
			['testing_account', () => json({ detail: { code: 'testing_account', message: 'x' } }, 409), msgs.users_password_err_testing_account],
			['use_own_password_change', () => json({ detail: { code: 'use_own_password_change', message: 'x' } }, 409), msgs.users_password_err_own_account],
			['a 403', () => json({ detail: 'Operation not permitted' }, 403), msgs.users_password_err_not_permitted],
			['password_too_short', () => json({ detail: { code: 'password_too_short', message: 'x', min_length: 8 } }, 422), msgs.common_password_too_short(8)],
			['a 422', () => json({ detail: [{ type: 'string_type', loc: ['body', 'new_password'] }] }, 422), msgs.users_password_err_invalid],
			['a 500', () => json({ detail: 'boom' }, 500), msgs.users_password_err_generic]
		];
		for (const [name, response, text] of refusals) {
			it(`shows ${name} in its own words and stays open (${lang})`, async () => {
				locale.set(lang);
				signIn('admin');
				answer = response;
				render(UsersPage);
				await openDialogFor('ana', msgs);
				await fill(FAKE_PASSWORD, FAKE_PASSWORD, msgs);
				await expect.element(page.getByRole('alert')).toHaveTextContent(text);
				await expect.element(page.getByRole('dialog')).toBeVisible();
				expect(document.body.textContent).not.toContain(FAKE_PASSWORD);
			});
		}
	}
});

describe('the requests against the backend route table', () => {
	it('lists the route as not admitted for the testing account', () => {
		expect(ROUTES).toContainEqual(['PUT', '/auth/users/{user_id}/password', false]);
		expect(routeOf('PUT', '/auth/users/1/password')?.template).toBe('/auth/users/{user_id}/password');
	});

	it('sends only routes the table lists', async () => {
		signIn('admin');
		render(UsersPage);
		await openDialogFor('ana');
		await fill(FAKE_PASSWORD, FAKE_PASSWORD);
		await expect.element(page.getByRole('status')).toBeVisible();
		const unknown = sent.filter((r) => routeOf(r.method, r.path) === null);
		expect(unknown).toEqual([]);
		expect(sent.map((r) => `${r.method} ${routeOf(r.method, r.path)?.template}`)).toContain(
			'PUT /auth/users/{user_id}/password'
		);
	});
});

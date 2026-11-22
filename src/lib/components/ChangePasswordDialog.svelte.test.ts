// Change password from the account menu (NEH-395): every role but the
// testing account changes its own password with the current one, through
// POST /auth/password-reset. The backend then ends every session of the
// user, this one included, so on success this tab's session is ended at
// once, as any dead session is, and the login page shows the confirmation
// (loginNotice). A wrong current password keeps the dialog open.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import { usersApi } from '$lib/api';
import { loginNotice } from '$lib/stores/login-notice';
import { authStore, type UserRole } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { sessionRenewals } from '$lib/session-keepalive';
import { changesOwnPassword } from '$lib/unit-mode';
import { recordRequests, routeOf, TESTING_USER } from '$lib/test-support/testing-routes';
import UserMenu from './UserMenu.svelte';

const CURRENT = 'fake-current-pw-1';
const NEW = 'fake-new-pw-2';

interface Sent {
	method: string;
	path: string;
	body: unknown;
}
let sent: Sent[];
let resetAnswer: () => Response | Promise<Response>;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function serve() {
	sent = [];
	resetAnswer = () => json({ detail: 'password updated successfully' });
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(
			typeof input === 'string' ? input : (input as Request).url,
			'http://localhost:8000'
		);
		const method = (init?.method ?? 'GET').toUpperCase();
		const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		sent.push({ method, path: url.pathname, body });
		if (method === 'POST' && url.pathname === '/auth/password-reset') return resetAnswer();
		// The session is over once the password has changed.
		if (url.pathname === '/users/me') return json({ detail: 'Invalid or expired token' }, 401);
		return new Response(null, { status: 204 });
	});
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 4, username: `user-${role}`, email: null, role, is_active: true });
}

async function openMenu() {
	const screen = render(UserMenu, { label: 'Current user' });
	await screen.getByRole('button', { name: 'Current user' }).click();
	return screen;
}

async function openDialog(msgs = en) {
	await openMenu();
	await page.getByRole('menuitem', { name: msgs.account_password_action }).click();
	await expect.element(page.getByRole('dialog')).toBeVisible();
}

async function fill(current: string, next: string, repeat: string, msgs = en) {
	await userEvent.fill(
		page.getByLabelText(msgs.account_password_current_label, { exact: true }),
		current
	);
	await userEvent.fill(page.getByLabelText(msgs.account_password_new_label, { exact: true }), next);
	await userEvent.fill(
		page.getByLabelText(msgs.account_password_repeat_label, { exact: true }),
		repeat
	);
	await page.getByRole('button', { name: msgs.common_save, exact: true }).click();
}

function resets() {
	return sent.filter((r) => r.path === '/auth/password-reset');
}

beforeEach(() => {
	locale.set('en');
	vi.mocked(goto).mockClear();
	sessionRenewals.resume();
	loginNotice.set(null);
});
afterEach(async () => {
	// Leaves the api module as a sign-in leaves it.
	sessionRenewals.resume();
	vi.restoreAllMocks();
	authStore.clearSession();
});

describe('who sees Change password', () => {
	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		it(`is in the ${role}'s account menu`, async () => {
			serve();
			signIn(role);
			await openMenu();
			await expect
				.element(page.getByRole('menuitem', { name: en.account_password_action }))
				.toBeVisible();
			expect(changesOwnPassword(role)).toBe(true);
		});
	}

	it('is not in the testing account’s menu, and its menu sends nothing the table refuses', async () => {
		const rec = recordRequests();
		authStore.setSession(TESTING_USER);
		await openMenu();
		await expect.element(page.getByRole('menuitem', { name: en.nav_logout })).toBeVisible();
		expect(
			page.getByRole('menuitem', { name: en.account_password_action }).elements()
		).toHaveLength(0);
		expect(changesOwnPassword('testing')).toBe(false);
		expect(rec.refusedList()).toEqual([]);
	});
});

describe('the form', () => {
	it('carries the signed-in username, the current password and the new one for the password manager', async () => {
		serve();
		signIn('operator');
		await openDialog();
		const form = document.querySelector('[role="dialog"] form') as HTMLFormElement;
		const username = form.querySelector('input[autocomplete="username"]') as HTMLInputElement;
		expect(username.value).toBe('user-operator');
		expect(username.readOnly).toBe(true);
		const passwords = [...form.querySelectorAll('input[type="password"]')] as HTMLInputElement[];
		expect(passwords.map((i) => i.autocomplete)).toEqual([
			'current-password',
			'new-password',
			'new-password'
		]);
		expect(document.activeElement).toBe(
			page.getByLabelText(en.account_password_current_label, { exact: true }).element()
		);
	});

	it('sends nothing while the new password and its repeat differ', async () => {
		serve();
		signIn('operator');
		await openDialog();
		await fill(CURRENT, NEW, NEW + 'x');
		await expect.element(page.getByRole('alert')).toHaveTextContent(en.users_val_password_mismatch);
		expect(resets()).toEqual([]);
	});

	it('sends nothing for a new password of 7 characters and shows the shared message', async () => {
		serve();
		signIn('operator');
		await openDialog();
		await fill(CURRENT, 'fake-pw', 'fake-pw');
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent(en.common_password_too_short(8));
		expect(resets()).toEqual([]);
	});

	it('sends nothing without the current password', async () => {
		serve();
		signIn('operator');
		await openDialog();
		await fill('', NEW, NEW);
		await expect
			.element(page.getByRole('alert'))
			.toHaveTextContent(en.account_password_val_current_required);
		expect(resets()).toEqual([]);
	});
});

const LOCALES: [Locale, typeof en][] = [
	['en', en],
	['es', es]
];

describe('a wrong current password', () => {
	for (const [lang, msgs] of LOCALES) {
		it(`shows its own message and keeps the dialog and the session (${lang})`, async () => {
			locale.set(lang);
			serve();
			resetAnswer = () => json({ detail: 'Old password incorrect' }, 401);
			signIn('reviewer');
			await openDialog(msgs);
			await fill(CURRENT, NEW, NEW, msgs);
			await expect
				.element(page.getByRole('alert'))
				.toHaveTextContent(msgs.account_password_err_wrong_current);
			await expect.element(page.getByRole('dialog')).toBeVisible();
			expect(authStore.getUser()).not.toBeNull();
			expect(goto).not.toHaveBeenCalled();
		});
	}
});

describe('other refusals', () => {
	it('a 401 that is not the current password ends the dead session and goes to the login page', async () => {
		serve();
		resetAnswer = () => json({ detail: 'Invalid or expired token' }, 401);
		signIn('operator');
		await openDialog();
		await fill(CURRENT, NEW, NEW);
		await expect.poll(() => authStore.getUser()).toBeNull();
		expect(goto).toHaveBeenCalledWith('/login');
	});

	for (const [lang, msgs] of LOCALES) {
		const cases: [string, () => Response, string][] = [
			[
				'testing_account',
				() => json({ detail: { code: 'testing_account', message: 'x' } }, 403),
				msgs.account_password_err_testing_account
			],
			[
				'password_too_short',
				() => json({ detail: { code: 'password_too_short', message: 'x', min_length: 8 } }, 422),
				msgs.common_password_too_short(8)
			],
			[
				'the login throttle, with Retry-After',
				() =>
					new Response(
						JSON.stringify({ detail: 'Too many failed login attempts. Try again later.' }),
						{
							status: 429,
							headers: { 'Content-Type': 'application/json', 'Retry-After': '300' }
						}
					),
				msgs.login_error_locked_out(5)
			],
			[
				'the login throttle, without Retry-After',
				() => json({ detail: 'Too many failed login attempts. Try again later.' }, 429),
				msgs.login_error_locked_out_unknown
			],
			[
				'a 422',
				() => json({ detail: [{ type: 'string_type' }] }, 422),
				msgs.account_password_err_invalid
			],
			['a 500', () => json({ detail: 'boom' }, 500), msgs.account_password_err_generic]
		];
		for (const [name, response, text] of cases) {
			it(`shows ${name} in its own words (${lang})`, async () => {
				locale.set(lang);
				serve();
				resetAnswer = response;
				signIn('operator');
				await openDialog(msgs);
				await fill(CURRENT, NEW, NEW, msgs);
				await expect.element(page.getByRole('alert')).toHaveTextContent(text);
				expect(authStore.getUser()).not.toBeNull();
			});
		}
	}
});

describe('success', () => {
	for (const [lang, msgs] of LOCALES) {
		it(`ends the session at once and leaves the confirmation for the login page (${lang})`, async () => {
			locale.set(lang);
			serve();
			signIn('admin');
			await openDialog(msgs);
			await fill(CURRENT, NEW, NEW, msgs);

			await expect.poll(() => get(loginNotice)).toBe('password_changed');
			expect(resets()).toEqual([
				{
					method: 'POST',
					path: '/auth/password-reset',
					body: { old_password: CURRENT, new_password: NEW }
				}
			]);
			expect(authStore.getUser()).toBeNull();
			expect(goto).toHaveBeenCalledWith('/login');
			expect(sessionRenewals.canStart()).toBe(false);
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			expect(page.getByRole('alertdialog').elements()).toHaveLength(0);
			expect(document.body.textContent).not.toContain(NEW);
			expect(document.body.textContent).not.toContain(CURRENT);
		});
	}

	it('leaves nothing that a Back to a signed-in screen could use', async () => {
		serve();
		signIn('operator');
		await openDialog();
		await fill(CURRENT, NEW, NEW);
		await expect.poll(() => authStore.getUser()).toBeNull();
		vi.mocked(goto).mockClear();
		// The guard of the screens outside the dashboard (the volume gallery, capture).
		expect(authStore.requireSession()).toBe(false);
		expect(goto).toHaveBeenCalledWith('/login');
		// A later 401 is handled as the dead session it is: nothing is signed in to keep.
		await expect(usersApi.me()).rejects.toThrow();
		expect(authStore.getUser()).toBeNull();
	});

	it('shows the confirmation when a background 401 reached the login page first', async () => {
		serve();
		let answer!: (r: Response) => void;
		resetAnswer = () => new Promise<Response>((resolve) => (answer = resolve));
		signIn('operator');
		await openDialog();
		await fill(CURRENT, NEW, NEW);
		await expect.poll(() => resets().length).toBe(1);

		// The backend has ended the session; a background request learns it first.
		await expect(usersApi.me()).rejects.toThrow();
		expect(authStore.getUser()).toBeNull();
		expect(goto).toHaveBeenCalledWith('/login');
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(get(loginNotice)).toBeNull();

		answer(json({ detail: 'password updated successfully' }));
		await expect.poll(() => get(loginNotice)).toBe('password_changed');
	});

	it('does nothing when the answer arrives after another person has signed in on this screen', async () => {
		serve();
		let answer!: (r: Response) => void;
		resetAnswer = () => new Promise<Response>((resolve) => (answer = resolve));
		signIn('operator');
		await openDialog();
		await fill(CURRENT, NEW, NEW);
		await expect.poll(() => resets().length).toBe(1);

		// A background 401 ends A's session and the dialog goes with it.
		await expect(usersApi.me()).rejects.toThrow();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

		// B signs in on the same screen, as the login page does.
		const b = {
			id: 31,
			username: 'otra-persona',
			email: null,
			role: 'reviewer' as const,
			is_active: true
		};
		authStore.setSession(b, { signIn: true });
		sessionRenewals.resume();
		vi.mocked(goto).mockClear();

		answer(json({ detail: 'password updated successfully' }));
		await new Promise((r) => setTimeout(r, 50));
		expect(authStore.getUser()).toEqual(b);
		expect(get(loginNotice)).toBeNull();
		expect(sessionRenewals.canStart()).toBe(true);
		expect(goto).not.toHaveBeenCalled();
	});

	it('leaves no confirmation when the answer never arrives', async () => {
		serve();
		resetAnswer = () => new Promise<Response>(() => {});
		signIn('operator');
		await openDialog();
		await fill(CURRENT, NEW, NEW);
		await expect.poll(() => resets().length).toBe(1);
		await expect(usersApi.me()).rejects.toThrow();
		expect(authStore.getUser()).toBeNull();
		expect(get(loginNotice)).toBeNull();
	});

	it('sends only routes the table lists', async () => {
		serve();
		signIn('operator');
		await openDialog();
		await fill(CURRENT, NEW, NEW);
		await expect.poll(() => get(loginNotice)).toBe('password_changed');
		expect(sent.filter((r) => routeOf(r.method, r.path) === null)).toEqual([]);
	});
});

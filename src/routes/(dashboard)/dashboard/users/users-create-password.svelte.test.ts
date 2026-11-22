// The create-user form holds the password to the backend's rule (NEH-395):
// at least 8 characters, checked before anything is sent, with the message
// the set-password and change-password dialogs show; the backend's
// `password_too_short` refusal gets the same message.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { PASSWORD_MIN_LENGTH } from '$lib/password-rule';
import '../../../../app.css';
import UsersPage from './+page.svelte';

const users = [
	{
		id: 3,
		username: 'jefa',
		email: null,
		role: 'admin',
		is_active: true,
		created_at: '2026-01-01T00:00:00Z'
	}
];

let registers: unknown[];
let registerAnswer: () => Response;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

beforeEach(() => {
	locale.set('en');
	registers = [];
	registerAnswer = () =>
		json({ id: 9, username: 'nueva', email: null, role: 'reviewer', is_active: true });
	authStore.setSession({ id: 3, username: 'jefa', email: null, role: 'admin', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(
			typeof input === 'string' ? input : (input as Request).url,
			'http://localhost:8000'
		);
		const method = (init?.method ?? 'GET').toUpperCase();
		if (method === 'POST' && url.pathname === '/auth/register') {
			registers.push(JSON.parse(init!.body as string));
			return registerAnswer();
		}
		if (url.pathname === '/auth/users') return json(users);
		return json(null);
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
});

async function create(password: string, msgs = en) {
	render(UsersPage);
	await expect.element(page.getByText('jefa', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: msgs.users_new }).click();
	await userEvent.fill(page.getByPlaceholder(msgs.users_ph_username), 'nueva');
	await userEvent.fill(page.getByPlaceholder(msgs.users_ph_password), password);
	await userEvent.fill(page.getByPlaceholder(msgs.users_ph_confirm), password);
	await page.getByRole('button', { name: msgs.users_create_btn }).click();
}

const LOCALES: [Locale, typeof en][] = [
	['en', en],
	['es', es]
];

describe('the create-user form and the password rule', () => {
	it('is 8 characters', () => {
		expect(PASSWORD_MIN_LENGTH).toBe(8);
	});

	for (const [lang, msgs] of LOCALES) {
		it(`sends nothing for 7 characters and shows the shared message (${lang})`, async () => {
			locale.set(lang);
			await create('fake-pw', msgs);
			await expect.element(page.getByText(msgs.common_password_too_short(8))).toBeVisible();
			expect(registers).toEqual([]);
		});

		it(`shows the shared message for the backend's password_too_short (${lang})`, async () => {
			locale.set(lang);
			registerAnswer = () =>
				json({ detail: { code: 'password_too_short', message: 'x', min_length: 8 } }, 422);
			await create('fake-pw-8', msgs);
			await expect.element(page.getByText(msgs.common_password_too_short(8))).toBeVisible();
			expect(registers).toHaveLength(1);
		});
	}

	it('counts characters, not UTF-16 units: seven emoji are too short', async () => {
		await create('\u{1F600}'.repeat(7));
		await expect.element(page.getByText(en.common_password_too_short(8))).toBeVisible();
		expect(registers).toEqual([]);
	});

	it('sends 8 characters as typed', async () => {
		await create('fake-pw8');
		await expect.poll(() => registers.length).toBe(1);
		expect(registers[0]).toMatchObject({ username: 'nueva', password: 'fake-pw8' });
	});
});

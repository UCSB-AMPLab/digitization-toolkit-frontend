// First-run setup holds the first administrator's password to the rule every
// new password is held to (NEH-395): at least 8 characters counted as the
// backend counts them, checked before anything is sent, with the shared
// message; the backend's `password_too_short` refusal gets the same message.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import SetupPage from './+page.svelte';

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
	authStore.clearSession();
	registers = [];
	registerAnswer = () =>
		json({ id: 1, username: 'primera', email: null, role: 'admin', is_active: true });
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(
			typeof input === 'string' ? input : (input as Request).url,
			'http://localhost:8000'
		);
		if (url.pathname === '/auth/setup/status') return json({ needs_setup: true });
		if (url.pathname === '/auth/register') {
			registers.push(JSON.parse(init!.body as string));
			return registerAnswer();
		}
		return json({ status: 'ok' });
	});
});
afterEach(() => vi.restoreAllMocks());

async function submit(password: string) {
	render(SetupPage);
	await userEvent.fill(page.getByLabelText(en.common_username_label), 'primera');
	await userEvent.fill(page.getByLabelText(en.common_password_label, { exact: true }), password);
	await userEvent.fill(page.getByLabelText(en.common_confirm_password, { exact: true }), password);
	await page.getByRole('button', { name: en.setup_submit }).click();
}

describe('first-run setup and the password rule', () => {
	it('sends nothing for 7 characters and shows the shared message', async () => {
		await submit('fake-pw');
		await expect.element(page.getByText(en.common_password_too_short(8))).toBeVisible();
		expect(registers).toEqual([]);
	});

	it('counts characters as the backend does: seven emoji are too short', async () => {
		await submit('\u{1F600}'.repeat(7));
		await expect.element(page.getByText(en.common_password_too_short(8))).toBeVisible();
		expect(registers).toEqual([]);
	});

	it('shows the shared message for the backend’s password_too_short', async () => {
		registerAnswer = () =>
			json({ detail: { code: 'password_too_short', message: 'x', min_length: 8 } }, 422);
		await submit('fake-pw8');
		await expect.element(page.getByText(en.common_password_too_short(8))).toBeVisible();
		expect(registers).toHaveLength(1);
	});
});

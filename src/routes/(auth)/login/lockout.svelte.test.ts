// NEH-219: after repeated failures /auth/login returns 429 with Retry-After
// in seconds. The login page says how long to wait, in whole minutes.
//
// Version: 0.1.0-beta
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import LoginPage from './+page.svelte';

function respondToLogin(response: () => Response) {
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input);
		if (url.endsWith('/health')) {
			return new Response(JSON.stringify({ status: 'ok' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return response();
	});
}

function throttled(headers: Record<string, string>) {
	return new Response(
		JSON.stringify({ detail: 'Too many failed login attempts. Try again later.' }),
		{ status: 429, headers: { 'Content-Type': 'application/json', ...headers } }
	);
}

async function submit(screen: ReturnType<typeof render>) {
	await screen.getByLabelText('Username').fill('operator1');
	await screen.getByLabelText('Password', { exact: true }).fill('wrong-password');
	await screen.getByRole('button', { name: 'Log in' }).click();
}

beforeEach(() => {
	locale.set('en');
	gotoMock.mockClear();
	authStore.clearSession();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('login lockout message', () => {
	it('says how many minutes to wait, from Retry-After rounded up', async () => {
		respondToLogin(() => throttled({ 'Retry-After': '241' }));
		const screen = render(LoginPage);

		await submit(screen);

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Too many failed attempts. Wait 5 minutes before trying again.');
	});

	it('uses the singular for one minute', async () => {
		respondToLogin(() => throttled({ 'Retry-After': '45' }));
		const screen = render(LoginPage);

		await submit(screen);

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Too many failed attempts. Wait 1 minute before trying again.');
	});

	it('falls back to a message without a figure when Retry-After is missing', async () => {
		respondToLogin(() => throttled({}));
		const screen = render(LoginPage);

		await submit(screen);

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Too many failed attempts. Wait a few minutes before trying again.');
	});
});

// After a person changes their own password the backend has ended every
// session of theirs, and the app ends this tab's at once and opens the login
// page (NEH-395). The login page shows the confirmation above the form, in a
// status region, from the one-shot loginNotice store, and clears the notice
// when the page is left, so it is shown for that one visit only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { get } from 'svelte/store';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore } from '$lib/stores/auth';
import { loginNotice } from '$lib/stores/login-notice';
import { locale, type Locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import LoginPage from './+page.svelte';

beforeEach(() => {
	locale.set('en');
	authStore.clearSession();
	loginNotice.set(null);
	vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	);
});
afterEach(() => {
	vi.restoreAllMocks();
	loginNotice.set(null);
});

const LOCALES: [Locale, typeof en][] = [['en', en], ['es', es]];

describe('the password-changed notice on the login page', () => {
	for (const [lang, msgs] of LOCALES) {
		it(`shows the confirmation above the form (${lang})`, async () => {
			locale.set(lang);
			loginNotice.set('password_changed');
			render(LoginPage);
			const notice = page.getByRole('status');
			await expect.element(notice).toHaveTextContent(msgs.account_password_done_title);
			await expect.element(notice).toHaveTextContent(msgs.account_password_done);
			const form = page.getByLabelText(msgs.common_username_label).element();
			expect(notice.element().compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		});
	}

	it('shows nothing without the notice', async () => {
		render(LoginPage);
		await expect.element(page.getByLabelText(en.common_username_label)).toBeVisible();
		expect(document.body.textContent).not.toContain(en.account_password_done_title);
	});

	it('appears when the notice is set after the page opened', async () => {
		render(LoginPage);
		await expect.element(page.getByLabelText(en.common_username_label)).toBeVisible();
		loginNotice.set('password_changed');
		await expect.element(page.getByRole('status')).toHaveTextContent(en.account_password_done_title);
	});

	it('is cleared when the page is left, so the next visit shows nothing', async () => {
		loginNotice.set('password_changed');
		const screen = render(LoginPage);
		await expect.element(page.getByRole('status')).toBeVisible();
		screen.unmount();
		expect(get(loginNotice)).toBeNull();
		render(LoginPage);
		await expect.element(page.getByLabelText(en.common_username_label)).toBeVisible();
		expect(document.body.textContent).not.toContain(en.account_password_done_title);
	});
});

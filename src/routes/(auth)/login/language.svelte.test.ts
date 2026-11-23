// NEH-336: the login page has no language picker and is shown in the unit's
// language. A unit with no account yet sends it to the first-run wizard.
// After sign-in a person with a stored language gets it (the cookie is set
// from /users/me, whatever the browser had); a person with none is asked
// once, on this page before the dashboard, and the choice is stored with
// PUT /users/me/language.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
const { setLanguage } = vi.hoisted(() => ({ setLanguage: vi.fn() }));
vi.mock('$lib/i18n', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/i18n')>()),
	setLanguage
}));

import { authStore } from '$lib/stores/auth';
import { get } from 'svelte/store';
import { locale, LOCALE_COOKIE } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import '../../../app.css';
import { authApi, usersApi } from '$lib/api';
import LoginPage from './+page.svelte';

interface Call {
	path: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
}

let calls: Call[];
let status: { needs_setup: boolean; default_language: 'es' | 'en' };
let me: Record<string, unknown>;
let languageAnswer: () => Response;
// Holds status answers back until released; each request still gets its own answer.
let statusGate: Promise<void> | null;
let languageGate: Promise<void> | null;

function json(body: unknown, s = 200) {
	return new Response(JSON.stringify(body), {
		status: s,
		headers: { 'Content-Type': 'application/json' }
	});
}

function clearCookies() {
	for (const name of [LOCALE_COOKIE, 'dtk_locale']) document.cookie = `${name}=; path=/; max-age=0`;
}

beforeEach(() => {
	locale.set('en');
	authStore.clearSession();
	gotoMock.mockReset();
	setLanguage.mockReset();
	clearCookies();
	calls = [];
	status = { needs_setup: false, default_language: 'en' };
	me = { id: 7, username: 'ana', email: null, role: 'operator', is_active: true, language: 'en' };
	languageAnswer = () => json({ ...me, language: 'en' });
	statusGate = null;
	languageGate = null;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url);
		const headers: Record<string, string> = {};
		for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>))
			headers[k.toLowerCase()] = v;
		calls.push({
			path: url.pathname,
			method: init?.method ?? 'GET',
			headers,
			body: init?.body ? JSON.parse(init.body as string) : undefined
		});
		if (url.pathname === '/auth/setup/status') {
			if (statusGate) await statusGate;
			return json({ ...status, local: false });
		}
		if (url.pathname === '/auth/login') return json({ access_token: null, token_type: 'cookie' });
		if (url.pathname === '/users/me/language') {
			if (languageGate) await languageGate;
			return languageAnswer();
		}
		if (url.pathname === '/users/me') return json(me);
		return json({ status: 'ok' });
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	authStore.clearSession();
	clearCookies();
});

async function signIn(msgs = en) {
	await userEvent.fill(page.getByLabelText(msgs.common_username_label), 'ana');
	await userEvent.fill(
		page.getByLabelText(msgs.common_password_label, { exact: true }),
		'fake-pw8'
	);
	await userEvent.click(page.getByRole('button', { name: msgs.login_submit }));
}

describe('login page and the unit', () => {
	it('sends a unit with no account to the first-run wizard', async () => {
		status = { needs_setup: true, default_language: 'es' };
		render(LoginPage);
		await expect.poll(() => gotoMock.mock.calls[0]?.[0]).toBe('/setup');
	});

	it('has no language picker', async () => {
		render(LoginPage);
		await expect.element(page.getByRole('button', { name: en.login_submit })).toBeVisible();
		expect(document.querySelector('.lang-selector')).toBeNull();
		for (const name of ['ES', 'EN'])
			expect(
				[...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === name)
			).toBe(false);
	});

	it("is shown in the unit's language whatever the browser had", async () => {
		status = { needs_setup: false, default_language: 'es' };
		render(LoginPage);
		await expect.element(page.getByRole('button', { name: es.login_submit })).toBeVisible();
	});
});

describe('the language after sign-in', () => {
	it('gives a person their stored language, loading the dashboard in it', async () => {
		status = { needs_setup: false, default_language: 'es' };
		me = { ...me, language: 'en' };
		render(LoginPage);
		await expect.element(page.getByRole('button', { name: es.login_submit })).toBeVisible();
		await signIn(es);
		await expect.poll(() => setLanguage.mock.calls[0]).toEqual(['en', '/dashboard']);
		expect(calls.some((c) => c.path === '/users/me/language')).toBe(false);
	});

	it('sets the cookie and goes on without a reload when the language is already shown', async () => {
		render(LoginPage);
		await signIn();
		await expect.poll(() => gotoMock.mock.calls.at(-1)?.[0]).toBe('/dashboard');
		expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
		expect(setLanguage).not.toHaveBeenCalled();
	});

	it('asks a person with no language once, before the dashboard, and stores the choice', async () => {
		me = { ...me, language: null };
		render(LoginPage);
		await signIn();
		await expect
			.element(page.getByRole('heading', { name: en.login_language_title }))
			.toBeVisible();
		expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		const spanish = page.getByRole('button', { name: 'Español' });
		await expect.element(spanish).toHaveAttribute('lang', 'es');
		await expect
			.element(page.getByRole('button', { name: 'English' }))
			.toHaveAttribute('lang', 'en');
		await userEvent.click(spanish);
		await expect.poll(() => setLanguage.mock.calls[0]).toEqual(['es', '/dashboard']);
		const put = calls.find((c) => c.path === '/users/me/language')!;
		expect(put.method).toBe('PUT');
		expect(put.body).toEqual({ language: 'es' });
		expect(put.headers['x-requested-with']).toBe('XMLHttpRequest');
	});

	it('goes on in the language chosen when storing it fails; the question comes back next time', async () => {
		me = { ...me, language: null };
		languageAnswer = () => json({ detail: 'x' }, 500);
		render(LoginPage);
		await signIn();
		await userEvent.click(page.getByRole('button', { name: 'English' }));
		await expect.poll(() => gotoMock.mock.calls.at(-1)?.[0]).toBe('/dashboard');
		expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
	});

	for (const [w, h] of [
		[800, 480],
		[1280, 800]
	] as const) {
		it(`the question fits ${w}x${h}`, async () => {
			await page.viewport(w, h);
			me = { ...me, language: null };
			render(LoginPage);
			await signIn();
			await expect
				.element(page.getByRole('heading', { name: en.login_language_title }))
				.toBeVisible();
			for (const name of ['Español', 'English']) {
				const r = page.getByRole('button', { name }).element().getBoundingClientRect();
				expect(r.height).toBeGreaterThanOrEqual(44);
				expect(r.top).toBeGreaterThanOrEqual(0);
				expect(r.bottom).toBeLessThanOrEqual(h);
			}
			await page.viewport(414, 896);
		});
	}
});

describe('review round 1', () => {
	function hold() {
		let release!: () => void;
		statusGate = new Promise<void>((resolve) => (release = resolve));
		return () => {
			statusGate = null;
			release();
		};
	}
	const statusCalls = () => calls.filter((c) => c.path === '/auth/setup/status').length;

	it("a unit answer that arrives after sign-in started never replaces the person's language", async () => {
		const release = hold();
		me = { ...me, language: 'en' };
		render(LoginPage);
		await signIn();
		await expect.poll(() => gotoMock.mock.calls.at(-1)?.[0]).toBe('/dashboard');
		// A request made after the page's waits behind it and is answered after it.
		status = { needs_setup: true, default_language: 'es' };
		const probe = authApi.setupStatus();
		await expect.poll(statusCalls).toBe(2);
		release();
		await probe;
		expect(get(locale)).toBe('en');
		expect(gotoMock).not.toHaveBeenCalledWith('/setup');
	});

	it('a unit answer that arrives after the page is gone is ignored', async () => {
		const release = hold();
		const screen = render(LoginPage);
		await expect.poll(statusCalls).toBe(1);
		screen.unmount();
		status = { needs_setup: true, default_language: 'es' };
		const probe = authApi.setupStatus();
		await expect.poll(statusCalls).toBe(2);
		release();
		await probe;
		expect(get(locale)).toBe('en');
		expect(gotoMock).not.toHaveBeenCalledWith('/setup');
	});

	it('does not reload into the language when the browser cannot keep the signed-in user', async () => {
		status = { needs_setup: false, default_language: 'es' };
		me = { ...me, language: 'en' };
		const realSet = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
			this: Storage,
			key: string,
			value: string
		) {
			if (key === 'auth_user') throw new DOMException('quota', 'QuotaExceededError');
			return realSet.call(this, key, value);
		});
		render(LoginPage);
		await expect.element(page.getByRole('button', { name: es.login_submit })).toBeVisible();
		await signIn(es);
		await expect.poll(() => gotoMock.mock.calls.at(-1)?.[0]).toBe('/dashboard');
		expect(setLanguage).not.toHaveBeenCalled();
		expect(document.cookie).toContain(`${LOCALE_COOKIE}=en`);
		expect(get(locale)).toBe('en');
	});

	it('links to the credits page from its footer, with the way back', async () => {
		render(LoginPage);
		await expect
			.element(page.getByRole('link', { name: 'Credits / Créditos' }))
			.toHaveAttribute('href', '/credits?from=login');
	});

	for (const [w, h] of [
		[800, 480],
		[1280, 800]
	] as const) {
		it(`the credits link fits the footer at ${w}x${h}`, async () => {
			await page.viewport(w, h);
			render(LoginPage);
			const link = page.getByRole('link', { name: 'Credits / Créditos' });
			await expect.element(link).toBeVisible();
			const r = link.element().getBoundingClientRect();
			const footer = document.querySelector('.card-footer')!.getBoundingClientRect();
			expect(r.height).toBeGreaterThanOrEqual(44);
			expect(r.right).toBeLessThanOrEqual(footer.right + 1);
			expect(r.bottom).toBeLessThanOrEqual(footer.bottom + 1);
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(w + 1);
			await page.viewport(414, 896);
		});
	}
});

describe('review round 3', () => {
	it('a language answer that arrives after the person left for Credits does not pull them back', async () => {
		me = { ...me, language: null };
		let release!: () => void;
		languageGate = new Promise<void>((resolve) => (release = resolve));
		const screen = render(LoginPage);
		await signIn();
		await userEvent.click(page.getByRole('button', { name: 'Español' }));
		await expect.poll(() => calls.some((c) => c.path === '/users/me/language')).toBe(true);
		screen.unmount();
		// A request made after the page's waits behind it and is answered after it.
		const probe = usersApi.setMyLanguage('es');
		await expect.poll(() => calls.filter((c) => c.path === '/users/me/language').length).toBe(2);
		languageGate = null;
		release();
		await probe;
		expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		expect(setLanguage).not.toHaveBeenCalled();
		expect(document.cookie).not.toContain(`${LOCALE_COOKIE}=es`);
	});
});

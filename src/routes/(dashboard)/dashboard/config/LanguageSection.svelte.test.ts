// Settings > Language (NEH-336): every role changes their own language with
// PUT /users/me/language, and the page reloads in it. An administrator also
// sets the unit's language, the sign-in page's, with PUT /system/unit; that
// needs no reload. Each control says in one line what it means.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
const { setLanguage } = vi.hoisted(() => ({ setLanguage: vi.fn() }));
vi.mock('$lib/i18n', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/i18n')>()),
	setLanguage
}));

import { authStore, type UserRole } from '$lib/stores/auth';
import { get } from 'svelte/store';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetUnit } from '$lib/unit-mode';
import { usersApi } from '$lib/api';
import '../../../../app.css';
import LanguageSection from './LanguageSection.svelte';

interface Call {
	path: string;
	method: string;
	body: unknown;
}

let calls: Call[];
let unitLanguage: 'es' | 'en';
let failMine: boolean;
let gate: Promise<void> | null;

const UNIT = {
	mode: 'offline',
	projectsEnabled: true,
	projectsShown: true,
	defaultProjectId: null,
	prerequisites: { backup: [], fisqua: [] }
};

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function signIn(role: UserRole) {
	authStore.setSession({
		id: 3,
		username: role,
		email: null,
		role,
		is_active: true,
		language: 'en'
	});
}

beforeEach(() => {
	locale.set('en');
	setLanguage.mockReset();
	resetUnit();
	calls = [];
	unitLanguage = 'es';
	failMine = false;
	gate = null;
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url);
		const body = init?.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });
		if (url.pathname === '/users/me/language') {
			if (gate) await gate;
			if (failMine) return json({ detail: 'x' }, 500);
			return json({ id: 3, username: 'x', email: null, role: 'admin', is_active: true, ...body });
		}
		if (url.pathname === '/system/unit') {
			if (init?.method === 'PUT') unitLanguage = body.defaultLanguage;
			return json({ ...UNIT, defaultLanguage: unitLanguage });
		}
		return json({});
	});
});
afterEach(() => {
	vi.restoreAllMocks();
	authStore.clearSession();
	resetUnit();
});

const mine = () => page.getByRole('group', { name: en.config_language_mine_label });
const unit = () => page.getByRole('group', { name: en.config_language_unit_label });

describe('Settings > Language', () => {
	it('shows the person their own language, with one line on what it means', async () => {
		signIn('operator');
		render(LanguageSection, { role: 'operator' });
		await expect.element(page.getByText(en.config_language_mine_desc)).toBeVisible();
		await expect
			.element(mine().getByRole('button', { name: 'English' }))
			.toHaveAttribute('aria-pressed', 'true');
		await expect
			.element(mine().getByRole('button', { name: 'Español' }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('stores a change of my language and reloads in it', async () => {
		signIn('reviewer');
		render(LanguageSection, { role: 'reviewer' });
		await userEvent.click(mine().getByRole('button', { name: 'Español' }));
		await expect.poll(() => setLanguage.mock.calls[0]).toEqual(['es']);
		expect(calls.find((c) => c.path === '/users/me/language')).toMatchObject({
			method: 'PUT',
			body: { language: 'es' }
		});
		expect(authStore.getUser()?.language).toBe('es');
	});

	it('does not reload when this browser could not keep the signed-in user; the change applies in place', async () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
			this: Storage,
			key: string
		) {
			if (key === 'auth_user') throw new DOMException('quota', 'QuotaExceededError');
		});
		localStorage.removeItem('auth_user');
		signIn('operator');
		render(LanguageSection, { role: 'operator' });
		await userEvent.click(mine().getByRole('button', { name: 'Español' }));
		await expect.poll(() => get(locale)).toBe('es');
		expect(setLanguage).not.toHaveBeenCalled();
		expect(document.cookie).toContain('captua_locale=es');
		document.cookie = 'captua_locale=; path=/; max-age=0';
		document.cookie = 'dtk_locale=; path=/; max-age=0';
	});

	it('a language answer that arrives after the section is gone is not applied', async () => {
		let release!: () => void;
		gate = new Promise<void>((resolve) => (release = resolve));
		signIn('operator');
		const screen = render(LanguageSection, { role: 'operator' });
		await userEvent.click(mine().getByRole('button', { name: 'Español' }));
		await expect.poll(() => calls.some((c) => c.path === '/users/me/language')).toBe(true);
		screen.unmount();
		// A request made after the section's waits behind it and is answered after it.
		const probe = usersApi.setMyLanguage('en');
		gate = null;
		release();
		await probe;
		expect(setLanguage).not.toHaveBeenCalled();
		expect(get(locale)).toBe('en');
	});

	it('says so, and does not reload, when my language cannot be stored', async () => {
		failMine = true;
		signIn('operator');
		render(LanguageSection, { role: 'operator' });
		await userEvent.click(mine().getByRole('button', { name: 'Español' }));
		await expect.element(page.getByText(en.config_language_error)).toBeVisible();
		expect(setLanguage).not.toHaveBeenCalled();
	});

	for (const role of ['operator', 'reviewer', 'testing'] as const) {
		it(`shows ${role} no control for the unit's language`, async () => {
			signIn(role);
			render(LanguageSection, { role });
			await expect.element(mine()).toBeVisible();
			expect(document.body.textContent).not.toContain(en.config_language_unit_label);
			expect(calls.some((c) => c.path === '/system/unit' && c.method === 'PUT')).toBe(false);
		});
	}

	it("lets an administrator set the unit's language, without a reload", async () => {
		signIn('admin');
		render(LanguageSection, { role: 'admin' });
		await expect.element(page.getByText(en.config_language_unit_desc)).toBeVisible();
		await expect
			.element(unit().getByRole('button', { name: 'Español' }))
			.toHaveAttribute('aria-pressed', 'true');
		await userEvent.click(unit().getByRole('button', { name: 'English' }));
		await expect
			.element(unit().getByRole('button', { name: 'English' }))
			.toHaveAttribute('aria-pressed', 'true');
		expect(calls.find((c) => c.path === '/system/unit' && c.method === 'PUT')?.body).toEqual({
			defaultLanguage: 'en'
		});
		expect(setLanguage).not.toHaveBeenCalled();
	});

	for (const [w, h] of [
		[800, 480],
		[1280, 800]
	] as const) {
		it(`fits ${w} wide, with every button at least 44px tall`, async () => {
			await page.viewport(w, h);
			signIn('admin');
			const target = document.createElement('div');
			// The settings body beside or under the section list.
			target.style.cssText = `width: ${w >= 1000 ? w - 300 : w - 64}px;`;
			document.body.appendChild(target);
			render(LanguageSection, { target, props: { role: 'admin' } });
			await expect.element(unit()).toBeVisible();
			for (const b of target.querySelectorAll('button')) {
				const r = b.getBoundingClientRect();
				expect(r.height).toBeGreaterThanOrEqual(44);
				expect(r.right).toBeLessThanOrEqual(target.getBoundingClientRect().right + 1);
			}
			expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth + 1);
			target.remove();
			await page.viewport(414, 896);
		});
	}
});

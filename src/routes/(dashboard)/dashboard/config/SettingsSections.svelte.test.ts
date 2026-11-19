// NEH-253: Settings is open to every role and split into sections. Network
// and Language for everyone, then, for administrators only, the Unit group
// with the sections the page had before. The section is read from
// ?section=; a non-admin asking for an admin section by URL gets Network.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as browserPage } from 'vitest/browser';
import { writable } from 'svelte/store';

const pageStore = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ url: new URL('http://localhost/dashboard/config') });
	pageStore.value = store;
	return { page: store };
});
const gotoMock = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto: gotoMock }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));

import { authStore, type UserRole } from '$lib/stores/auth';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { resetNetworkStatus } from '$lib/stores/network';
import { resetUnit } from '$lib/unit-mode';
import '../../../../app.css';
import ConfigPage from './+page.svelte';

const store = () => pageStore.value as ReturnType<typeof writable<{ url: URL }>>;

function at(search: string) {
	store().set({ url: new URL(`http://localhost/dashboard/config${search}`) });
}

function signIn(role: UserRole) {
	authStore.setSession({ id: 1, username: role, email: null, role, is_active: true });
}

/** Network routes answer 501 (a development machine); everything else a 500. */
function serve() {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.includes('/network/')) {
			return new Response(JSON.stringify({ detail: 'Network settings are not available on this device.' }), { status: 501 });
		}
		return new Response('{}', { status: 500 });
	});
}

function sectionNames(container: HTMLElement) {
	return [...container.querySelectorAll('[data-settings-section]')].map((b) => b.textContent?.trim());
}

const ADMIN_SECTIONS = [
	en.unit_section_title,
	en.fisqua_link_title,
	en.config_section_storage,
	en.backup_section_title,
	en.config_section_diagnostics,
	en.config_section_maintenance,
	en.config_section_power
];

beforeEach(() => {
	locale.set('en');
	at('');
});
afterEach(() => {
	vi.restoreAllMocks();
	gotoMock.mockReset();
	authStore.clearSession();
	resetNetworkStatus();
	resetUnit();
});

describe('Settings sections', () => {
	it('an administrator sees Network, Language and the Unit group with the existing sections', async () => {
		serve();
		signIn('admin');
		const { container } = render(ConfigPage);
		await expect.poll(() => sectionNames(container)).toEqual([en.config_section_network, en.config_section_language, ...ADMIN_SECTIONS]);
		expect(container.querySelector('.settings-group')?.textContent?.trim()).toBe(en.config_group_unit);
		await expect.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 })).toBeVisible();
	});

	for (const role of ['operator', 'reviewer'] as const) {
		it(`the ${role} sees Network and Language only`, async () => {
			serve();
			signIn(role);
			const { container } = render(ConfigPage);
			await expect.poll(() => sectionNames(container)).toEqual([en.config_section_network, en.config_section_language]);
			expect(container.querySelector('.settings-group')).toBeNull();
			expect(container.textContent).toContain(en.config_subtitle_personal);
		});

		it(`the ${role} asking for an admin section by URL gets Network, with no admin content`, async () => {
			serve();
			signIn(role);
			for (const id of ['power', 'storage', 'unit-mode', 'fisqua-link', 'offsite-copy', 'diagnostics', 'maintenance']) {
				at(`?section=${id}`);
				const { container, unmount } = render(ConfigPage);
				await expect.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 })).toBeVisible();
				expect(container.textContent).not.toContain(en.config_shutdown_label);
				expect(container.textContent).not.toContain(en.config_storage_used);
				expect(container.querySelector('.config-section#unit-mode')).toBeNull();
				expect(container.querySelector('.config-section#fisqua-link')).toBeNull();
				unmount();
			}
		});
	}

	it('opens the section named in the URL for an administrator', async () => {
		serve();
		signIn('admin');
		at('?section=power');
		render(ConfigPage);
		await expect.element(browserPage.getByRole('heading', { name: en.config_section_power, level: 2 })).toBeVisible();
		await expect.element(browserPage.getByRole('button', { name: en.config_shutdown_btn, exact: true })).toBeVisible();
	});

	it('an admin opening ?section=power renders Power first: no network request is made', async () => {
		const fetchSpy = serve();
		signIn('admin');
		at('?section=power');
		render(ConfigPage);
		await expect.element(browserPage.getByRole('heading', { name: en.config_section_power, level: 2 })).toBeVisible();
		await new Promise((r) => setTimeout(r, 50));
		const urls = fetchSpy.mock.calls.map(([input]) => String(input instanceof Request ? input.url : input));
		expect(urls.filter((u) => u.includes('/network/'))).toEqual([]);
	});

	it('still reads the old #offsite-copy link', async () => {
		serve();
		signIn('admin');
		store().set({ url: new URL('http://localhost/dashboard/config#offsite-copy') });
		render(ConfigPage);
		await expect.element(browserPage.getByRole('heading', { name: en.backup_section_title, level: 2 })).toBeVisible();
	});

	it('choosing a section shows it and puts it in the URL', async () => {
		serve();
		signIn('admin');
		const { container } = render(ConfigPage);
		const storage = browserPage.getByRole('button', { name: en.config_section_storage, exact: true });
		await storage.click();
		await expect.element(browserPage.getByRole('heading', { name: en.config_section_storage, level: 2 })).toBeVisible();
		await expect.element(storage).toHaveAttribute('aria-current', 'page');
		expect(gotoMock).toHaveBeenCalledWith('?section=storage', expect.objectContaining({ replaceState: true }));
		expect(container.querySelector('[data-settings-section][aria-current="page"]')?.textContent?.trim()).toBe(en.config_section_storage);
	});

	it('the reviewer can change the language from the Language section', async () => {
		serve();
		signIn('reviewer');
		at('?section=language');
		render(ConfigPage);
		await expect.element(browserPage.getByRole('heading', { name: en.config_section_language, level: 2 })).toBeVisible();
		await expect.element(browserPage.getByRole('group', { name: en.config_language_label })).toBeVisible();
		await expect.element(browserPage.getByRole('button', { name: 'Español' })).toBeVisible();
	});

	it('shows the section list as a row of tabs on the unit screen (800 px)', async () => {
		serve();
		signIn('admin');
		const { container } = render(ConfigPage);
		await browserPage.viewport(800, 480);
		const list = container.querySelector('.settings-nav') as HTMLElement;
		await expect.poll(() => getComputedStyle(list).flexDirection).toBe('row');
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(800);
	});

	it.each(['offsite-copy', 'power'])('on the unit screen, a section opened by URL (%s) has its tab scrolled into view', async (id) => {
		await browserPage.viewport(800, 480);
		serve();
		signIn('admin');
		at(`?section=${id}`);
		const { container } = render(ConfigPage);
		const list = container.querySelector('.settings-nav') as HTMLElement;
		await expect.poll(() => getComputedStyle(list).flexDirection).toBe('row');
		// The row is wider than the screen, so some tab starts off it.
		expect(list.scrollWidth).toBeGreaterThan(list.clientWidth);
		const tab = container.querySelector(`[data-settings-section="${id}"]`) as HTMLElement;
		await expect.element(tab).toHaveAttribute('aria-current', 'page');
		await expect.poll(() => {
			const l = list.getBoundingClientRect();
			const t = tab.getBoundingClientRect();
			return t.left >= l.left - 1 && t.right <= l.right + 1;
		}).toBe(true);
	});
});

// NEH-253: Settings is open to every role and split into sections. Network
// and Language for everyone, then, for administrators only, the Unit group
// with the sections the page had before. The section is read from
// ?section=; a non-admin asking for an admin section by URL gets Network.
//
// Version: 0.3.0
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
import { resetCameraKind } from '$lib/camera-kind';
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
function serve(kindStatus = 500) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.endsWith('/system/camera-kind')) {
			return new Response(JSON.stringify({ detail: 'Not Found' }), { status: kindStatus });
		}
		if (url.includes('/network/')) {
			return new Response(
				JSON.stringify({ detail: 'Network settings are not available on this device.' }),
				{ status: 501 }
			);
		}
		if (url.endsWith('/system/storage')) {
			const GB = 1024 ** 3;
			return new Response(
				JSON.stringify({
					projects_path: '/data/projects',
					is_override: false,
					total_bytes: 100 * GB,
					used_bytes: 40 * GB,
					free_bytes: 60 * GB,
					available: true
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}
		if (url.endsWith('/cameras/capabilities')) {
			return new Response(JSON.stringify({ backend: 'gphoto2' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return new Response('{}', { status: 500 });
	});
}

function sectionNames(container: HTMLElement) {
	return [...container.querySelectorAll('[data-settings-section]')].map((b) =>
		b.textContent?.trim()
	);
}

const ADMIN_SECTIONS = [
	en.unit_section_title,
	en.fisqua_link_title,
	en.config_section_testing,
	en.config_section_storage,
	en.backup_section_title,
	en.config_section_cameras,
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
	resetCameraKind();
});

describe('Settings sections', () => {
	it('an administrator sees Network, Language and the Unit group with the existing sections', async () => {
		serve();
		signIn('admin');
		const { container } = render(ConfigPage);
		await expect
			.poll(() => sectionNames(container))
			.toEqual([en.config_section_network, en.config_section_language, ...ADMIN_SECTIONS]);
		expect(container.querySelector('.settings-group')?.textContent?.trim()).toBe(
			en.config_group_unit
		);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 }))
			.toBeVisible();
	});

	it('leaves Cameras out, in the list and by URL, for a backend without the camera-kind route (NEH-252)', async () => {
		const fetchSpy = serve(404);
		signIn('admin');
		at('?section=cameras');
		const { container } = render(ConfigPage);
		await expect
			.poll(() => fetchSpy.mock.calls.some(([u]) => String(u).endsWith('/system/camera-kind')))
			.toBe(true);
		await expect
			.poll(() => sectionNames(container))
			.toEqual([
				en.config_section_network,
				en.config_section_language,
				...ADMIN_SECTIONS.filter((n) => n !== en.config_section_cameras)
			]);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 }))
			.toBeVisible();
		expect(container.querySelector('.config-section#cameras')).toBeNull();
	});

	it('the reviewer sees Network, Language and, in the Unit group, Cameras only (NEH-252)', async () => {
		serve();
		signIn('reviewer');
		const { container } = render(ConfigPage);
		await expect
			.poll(() => sectionNames(container))
			.toEqual([en.config_section_network, en.config_section_language, en.config_section_cameras]);
		expect(container.querySelector('.settings-group')?.textContent?.trim()).toBe(
			en.config_group_unit
		);
		expect(container.textContent).toContain(en.config_subtitle_personal);
	});

	it('the operator sees Network, Language and, in the Unit group, Storage (NEH-380) and Cameras (NEH-252)', async () => {
		serve();
		signIn('operator');
		const { container } = render(ConfigPage);
		await expect
			.poll(() => sectionNames(container))
			.toEqual([
				en.config_section_network,
				en.config_section_language,
				en.config_section_storage,
				en.config_section_cameras
			]);
		expect(container.querySelector('.settings-group')?.textContent?.trim()).toBe(
			en.config_group_unit
		);
		expect(container.textContent).toContain(en.config_subtitle_personal);
	});

	for (const [role, refused] of [
		[
			'operator',
			['power', 'unit-mode', 'fisqua-link', 'offsite-copy', 'diagnostics', 'maintenance']
		],
		[
			'reviewer',
			['power', 'storage', 'unit-mode', 'fisqua-link', 'offsite-copy', 'diagnostics', 'maintenance']
		]
	] as const) {
		it(`the ${role} asking for an admin section by URL gets Network, with no admin content`, async () => {
			serve();
			signIn(role);
			for (const id of refused) {
				at(`?section=${id}`);
				const { container, unmount } = render(ConfigPage);
				await expect
					.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 }))
					.toBeVisible();
				expect(container.textContent).not.toContain(en.config_shutdown_label);
				expect(container.textContent).not.toContain(en.config_storage_used);
				expect(container.querySelector('.config-section#unit-mode')).toBeNull();
				expect(container.querySelector('.config-section#fisqua-link')).toBeNull();
				unmount();
			}
		});
	}

	it('the testing role (NEH-391) sees Network, Language and Power, and opens on Network', async () => {
		serve();
		signIn('testing');
		const { container } = render(ConfigPage);
		await expect
			.poll(() => sectionNames(container))
			.toEqual([en.config_section_network, en.config_section_language, en.config_section_power]);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 }))
			.toBeVisible();
		expect(container.textContent).toContain(en.config_subtitle_personal);
	});

	it('the testing role asking for an admin section by URL gets Network', async () => {
		serve();
		signIn('testing');
		for (const id of [
			'storage',
			'diagnostics',
			'unit-mode',
			'offsite-copy',
			'maintenance',
			'cameras'
		]) {
			at(`?section=${id}`);
			const { container, unmount } = render(ConfigPage);
			await expect
				.element(browserPage.getByRole('heading', { name: en.config_section_network, level: 2 }))
				.toBeVisible();
			expect(container.textContent).not.toContain(en.config_shutdown_label);
			expect(container.textContent).not.toContain(en.config_storage_used);
			unmount();
		}
	});

	it('the testing role opening Power gets the shutdown button', async () => {
		serve();
		signIn('testing');
		at('?section=power');
		render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_power, level: 2 }))
			.toBeVisible();
		await expect
			.element(browserPage.getByRole('button', { name: en.config_shutdown_btn, exact: true }))
			.toBeVisible();
	});

	it('a section requests only what it shows: the testing role on Power asks for neither storage nor capabilities', async () => {
		const fetchSpy = serve();
		signIn('testing');
		at('?section=power');
		render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_power, level: 2 }))
			.toBeVisible();
		await new Promise((r) => setTimeout(r, 100));
		const urls = fetchSpy.mock.calls.map(([input]) =>
			String(input instanceof Request ? input.url : input)
		);
		expect(
			urls.filter((u) => u.endsWith('/system/storage') || u.endsWith('/cameras/capabilities'))
		).toEqual([]);
	});

	it('an administrator gets the storage figures each time Storage is shown, and the capture system once on Diagnostics', async () => {
		const fetchSpy = serve();
		signIn('admin');
		at('?section=storage');
		const { container } = render(ConfigPage);
		await expect
			.poll(() =>
				container.querySelector('[data-storage-used]')?.textContent?.replace(/\s+/g, ' ').trim()
			)
			.toBe('40 GB / 100 GB');
		const calls = (suffix: string) =>
			fetchSpy.mock.calls.filter(([input]) =>
				String(input instanceof Request ? input.url : input).endsWith(suffix)
			).length;
		expect(calls('/cameras/capabilities')).toBe(0);
		// The component stays mounted when the section changes.
		at('?section=diagnostics');
		await expect.poll(() => container.textContent).toContain('gphoto2');
		expect(calls('/cameras/capabilities')).toBe(1);
		at('?section=storage');
		await expect
			.poll(() =>
				container.querySelector('[data-storage-used]')?.textContent?.replace(/\s+/g, ' ').trim()
			)
			.toBe('40 GB / 100 GB');
		// Read afresh on return (NEH-380): the section shows what the unit holds now.
		await expect.poll(() => calls('/system/storage')).toBe(2);
		expect(calls('/cameras/capabilities')).toBe(1);
	});

	it('an administrator opening Diagnostics first gets the capture system, and Storage then its figures', async () => {
		const fetchSpy = serve();
		signIn('admin');
		at('?section=diagnostics');
		const { container } = render(ConfigPage);
		await expect.poll(() => container.textContent).toContain('gphoto2');
		const calls = (suffix: string) =>
			fetchSpy.mock.calls.filter(([input]) =>
				String(input instanceof Request ? input.url : input).endsWith(suffix)
			).length;
		expect(calls('/system/storage')).toBe(0);
		at('?section=storage');
		await expect
			.poll(() =>
				container.querySelector('[data-storage-used]')?.textContent?.replace(/\s+/g, ' ').trim()
			)
			.toBe('40 GB / 100 GB');
		expect(calls('/system/storage')).toBe(1);
		expect(calls('/cameras/capabilities')).toBe(1);
	});

	it('opens the section named in the URL for an administrator', async () => {
		serve();
		signIn('admin');
		at('?section=power');
		render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_power, level: 2 }))
			.toBeVisible();
		await expect
			.element(browserPage.getByRole('button', { name: en.config_shutdown_btn, exact: true }))
			.toBeVisible();
	});

	it('an admin opening ?section=power renders Power first: no network request is made', async () => {
		const fetchSpy = serve();
		signIn('admin');
		at('?section=power');
		render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_power, level: 2 }))
			.toBeVisible();
		await new Promise((r) => setTimeout(r, 50));
		const urls = fetchSpy.mock.calls.map(([input]) =>
			String(input instanceof Request ? input.url : input)
		);
		expect(urls.filter((u) => u.includes('/network/'))).toEqual([]);
	});

	it('still reads the old #offsite-copy link', async () => {
		serve();
		signIn('admin');
		store().set({ url: new URL('http://localhost/dashboard/config#offsite-copy') });
		render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.backup_section_title, level: 2 }))
			.toBeVisible();
	});

	it('choosing a section shows it and puts it in the URL', async () => {
		serve();
		signIn('admin');
		const { container } = render(ConfigPage);
		const storage = browserPage.getByRole('button', {
			name: en.config_section_storage,
			exact: true
		});
		await storage.click();
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_storage, level: 2 }))
			.toBeVisible();
		await expect.element(storage).toHaveAttribute('aria-current', 'page');
		expect(gotoMock).toHaveBeenCalledWith(
			'?section=storage',
			expect.objectContaining({ replaceState: true })
		);
		expect(
			container.querySelector('[data-settings-section][aria-current="page"]')?.textContent?.trim()
		).toBe(en.config_section_storage);
	});

	it('the reviewer can change the language from the Language section', async () => {
		serve();
		signIn('reviewer');
		at('?section=language');
		render(ConfigPage);
		await expect
			.element(browserPage.getByRole('heading', { name: en.config_section_language, level: 2 }))
			.toBeVisible();
		await expect
			.element(browserPage.getByRole('group', { name: en.config_language_label }))
			.toBeVisible();
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

	it.each(['offsite-copy', 'power'])(
		'on the unit screen, a section opened by URL (%s) has its tab scrolled into view',
		async (id) => {
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
			await expect
				.poll(() => {
					const l = list.getBoundingClientRect();
					const t = tab.getBoundingClientRect();
					return t.left >= l.left - 1 && t.right <= l.right + 1;
				})
				.toBe(true);
		}
	);
});

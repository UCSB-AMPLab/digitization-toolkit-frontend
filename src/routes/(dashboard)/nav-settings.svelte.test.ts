// NEH-253: Settings is open to every role, the other routes keep their
// roles, the network indicator sits above the user button for every role
// and links to Settings > Network, and the offsite copy indicator links to
// its Settings section for administrators only.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { page } from 'vitest/browser';

const pageStore = vi.hoisted(() => ({ value: null as null | { set: (v: { url: URL }) => void } }));
vi.mock('$app/stores', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ url: new URL('http://localhost/dashboard') });
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
import '../../app.css';
import Layout from './+layout.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>protected content</p>' }));

const STATUS = {
	hostname: 'captua',
	wifiDevice: 'wlan0',
	permissions: { scan: true, control: true, modify: true },
	interfaces: [
		{
			device: 'wlan0',
			type: 'wifi',
			state: 'connected',
			connection: 'Archive-Office',
			mac: 'D8:3A:DD:4F:21:9D',
			ipv4: ['10.0.4.117/24'],
			ipv6: [],
			gateway: '10.0.4.1',
			dns: ['10.0.4.1'],
			ssid: 'Archive-Office',
			signal: 72
		}
	],
	problems: []
};

function json(code: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status: code,
		headers: { 'Content-Type': 'application/json' }
	});
}

function serve(role: UserRole, networkCode = 200) {
	const user = { id: 1, username: role, email: null, role, is_active: true };
	authStore.setSession(user);
	const calls: string[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input instanceof Request ? input.url : input);
		calls.push(url);
		if (url.endsWith('/users/me')) return json(200, user);
		if (url.endsWith('/network/status')) {
			return networkCode === 200
				? json(200, STATUS)
				: json(networkCode, { detail: 'Network settings are not available on this device.' });
		}
		return json(500, { detail: 'not in this test' });
	});
	return calls;
}

async function mount(role: UserRole, path = '/dashboard', networkCode = 200) {
	pageStore.value!.set({ url: new URL(`http://localhost${path}`) });
	const calls = serve(role, networkCode);
	const screen = render(Layout, { children });
	return { screen, calls };
}

beforeEach(() => locale.set('en'));
afterEach(() => {
	vi.restoreAllMocks();
	gotoMock.mockReset();
	authStore.clearSession();
	resetNetworkStatus();
	resetUnit();
});

describe('Settings for every role', () => {
	for (const role of ['admin', 'operator', 'reviewer'] as const) {
		it(`the ${role} sees Settings in the sidebar and may open it`, async () => {
			const { screen } = await mount(role, '/dashboard/config');
			await expect.element(screen.getByText('protected content')).toBeVisible();
			await expect
				.element(screen.getByRole('link', { name: en.nav_settings }))
				.toHaveAttribute('href', '/dashboard/config');
			expect(gotoMock).not.toHaveBeenCalledWith('/dashboard');
		});

		it(`the ${role} sees the network indicator, linking to Settings > Network`, async () => {
			const { screen } = await mount(role);
			await expect.element(screen.getByText('protected content')).toBeVisible();
			const label = en.network_ind_label(en.network_ind_connected, 'Archive-Office', 72);
			const indicator = screen.getByRole('link', { name: label });
			await expect.element(indicator).toHaveAttribute('href', '/dashboard/config?section=network');
			const footer = screen.container.querySelector('.s-footer')!;
			const net = footer.querySelector('a.net-status')!;
			const user = footer.querySelector('.user-row')!;
			expect(net.compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		});
	}

	for (const role of ['operator', 'reviewer'] as const) {
		it(`the ${role} is still sent away from Users`, async () => {
			const { screen } = await mount(role, '/dashboard/users');
			await expect.poll(() => gotoMock.mock.calls.some(([to]) => to === '/dashboard')).toBe(true);
			expect(screen.container.textContent).not.toContain('protected content');
		});

		it(`the ${role} gets no link from the offsite copy indicator`, async () => {
			const { screen } = await mount(role);
			await expect.element(screen.getByText('protected content')).toBeVisible();
			// The indicator shows only once the backup state has been read.
			await expect.poll(() => screen.container.querySelector('.backup-pill')).not.toBeNull();
			expect(screen.container.querySelector('.backup-pill')!.tagName).toBe('DIV');
			expect(screen.container.querySelector('a[href*="offsite-copy"]')).toBeNull();
		});
	}

	it('the offsite copy indicator links an administrator to its Settings section', async () => {
		const { screen } = await mount('admin');
		await expect.element(screen.getByText('protected content')).toBeVisible();
		await expect
			.poll(() =>
				screen.container.querySelector('a[href="/dashboard/config?section=offsite-copy"]')
			)
			.not.toBeNull();
	});

	it('shows no network indicator when the backend answers 501', async () => {
		const { screen, calls } = await mount('operator', '/dashboard', 501);
		await expect.element(screen.getByText('protected content')).toBeVisible();
		await expect.poll(() => calls.filter((u) => u.endsWith('/network/status')).length).toBe(1);
		await new Promise((r) => setTimeout(r, 50));
		expect(screen.container.querySelector('.net-status')).toBeNull();
	});
});

describe('the sidebar footer at 800x480 and on a tall screen', () => {
	afterEach(async () => {
		await page.viewport(414, 896);
	});

	function within(inner: DOMRect, outer: DOMRect) {
		return (
			inner.top >= outer.top - 0.5 &&
			inner.bottom <= outer.bottom + 0.5 &&
			inner.left >= outer.left - 0.5 &&
			inner.right <= outer.right + 0.5
		);
	}

	const TOUCH_MIN = 44; // app.css --touch-target-min

	async function mountAt(
		width: number,
		height: number,
		expanded: boolean,
		ssid = 'Archive-Office'
	) {
		await page.viewport(width, height);
		STATUS.interfaces[0].ssid = ssid;
		STATUS.interfaces[0].connection = ssid;
		const { screen } = await mount('admin');
		await expect.element(screen.getByText('protected content')).toBeVisible();
		await expect.poll(() => screen.container.querySelector('a.net-status')).not.toBeNull();
		if (!expanded) {
			await screen.getByRole('button', { name: en.nav_collapse_sidebar }).click();
			await expect
				.poll(() => screen.container.querySelector('.sidebar')?.classList.contains('expanded'))
				.toBe(false);
			// The width transition.
			await new Promise((r) => setTimeout(r, 400));
		}
		return screen;
	}

	function measure(container: HTMLElement, expanded: boolean) {
		const sidebar = container.querySelector('.sidebar') as HTMLElement;
		const nav = sidebar.querySelector('.s-nav') as HTMLElement;
		const footer = sidebar.querySelector('.s-footer') as HTMLElement;
		const navRect = nav.getBoundingClientRect();
		const items = [...nav.querySelectorAll('.s-item')] as HTMLElement[];
		const net = sidebar.querySelector('a.net-status') as HTMLElement;
		const bug = sidebar.querySelector('.bug-btn') as HTMLElement;
		const user = sidebar.querySelector(expanded ? '.user-row' : '.user-av-sm') as HTMLElement;
		return {
			sidebar,
			nav,
			net,
			bug,
			user,
			sizes: {
				sidebar: Math.round(sidebar.getBoundingClientRect().height),
				nav: Math.round(navRect.height),
				footer: Math.round(footer.getBoundingClientRect().height),
				wholeItems: items.filter((i) => within(i.getBoundingClientRect(), navRect)).length,
				items: items.length
			}
		};
	}

	afterEach(() => {
		STATUS.interfaces[0].ssid = 'Archive-Office';
		STATUS.interfaces[0].connection = 'Archive-Office';
	});

	it('800x480 expanded: indicator and bug report share one row; at least three whole nav items (the measured floor); text truncated; both controls full size', async () => {
		const screen = await mountAt(800, 480, true, 'Archive-Office-Reading-Room-North-Wing');
		const { sidebar, nav, net, bug, user, sizes } = measure(screen.container, true);
		const sideRect = sidebar.getBoundingClientRect();
		const netRect = net.getBoundingClientRect();
		const bugRect = bug.getBoundingClientRect();
		// One row: the same vertical band, the indicator first and wider.
		expect(Math.abs(netRect.top - bugRect.top)).toBeLessThan(netRect.height / 2);
		expect(netRect.right).toBeLessThanOrEqual(bugRect.left + 0.5);
		expect(sidebar.querySelector('.bug-btn-label')?.getBoundingClientRect().width ?? 0).toBe(0);
		expect(bug.getAttribute('aria-label')).toBe(en.bug_report_button);
		expect(bug.getAttribute('title')).toBe(en.bug_report_button);
		// The indicator's line is cut with an ellipsis inside the link, not clipped by the sidebar.
		const line = net.querySelector('.net-status-line') as HTMLElement;
		const style = getComputedStyle(line);
		expect(style.textOverflow).toBe('ellipsis');
		expect(style.whiteSpace).toBe('nowrap');
		expect(line.scrollWidth).toBeGreaterThan(line.clientWidth);
		expect(line.getBoundingClientRect().right).toBeLessThanOrEqual(netRect.right + 0.5);
		for (const el of [net, bug, user]) {
			const r = el.getBoundingClientRect();
			expect(within(r, sideRect)).toBe(true);
		}
		for (const el of [net, bug]) {
			const r = el.getBoundingClientRect();
			expect(r.height).toBeGreaterThanOrEqual(TOUCH_MIN);
			expect(r.width).toBeGreaterThanOrEqual(TOUCH_MIN);
		}
		expect(['auto', 'scroll']).toContain(getComputedStyle(nav).overflowY);
		// Four whole items were the aim. With the shared row the nav is 213 px
		// and four items need about 215 px (8 padding, a 27 px section title,
		// four 45 px items), so three show whole; the nav scrolls.
		expect(sizes.wholeItems).toBeGreaterThanOrEqual(3);
		expect(nav.scrollHeight).toBeGreaterThan(nav.clientHeight);
		for (const child of [...sidebar.children] as HTMLElement[])
			expect(within(child.getBoundingClientRect(), sideRect)).toBe(true);
		expect(sideRect.bottom).toBeLessThanOrEqual(480);
	});

	it('800x480 collapsed: the nav scrolls, at least three whole nav items (the measured floor), both icons full size and inside the sidebar', async () => {
		const screen = await mountAt(800, 480, false);
		const { sidebar, nav, net, bug, user, sizes } = measure(screen.container, false);
		const sideRect = sidebar.getBoundingClientRect();
		for (const el of [net, bug, user])
			expect(within(el.getBoundingClientRect(), sideRect)).toBe(true);
		for (const el of [net, bug]) {
			const r = el.getBoundingClientRect();
			expect(r.height).toBeGreaterThanOrEqual(TOUCH_MIN);
			expect(r.width).toBeGreaterThanOrEqual(TOUCH_MIN);
		}
		expect(net.getAttribute('aria-label')).toBe(
			en.network_ind_label(en.network_ind_connected, 'Archive-Office', 72)
		);
		expect(bug.getAttribute('aria-label')).toBe(en.bug_report_button);
		expect(['auto', 'scroll']).toContain(getComputedStyle(nav).overflowY);
		expect(nav.scrollHeight).toBeGreaterThan(nav.clientHeight);
		// The measured floor at 800x480 collapsed: two 44 px icons do not fit
		// side by side in the 72 px sidebar, so the footer keeps three rows.
		expect(sizes.wholeItems).toBeGreaterThanOrEqual(3);
		for (const child of [...sidebar.children] as HTMLElement[])
			expect(within(child.getBoundingClientRect(), sideRect)).toBe(true);
	});

	it('a tall screen keeps the three-row footer: bug report with its label, then the network status, then the user', async () => {
		const screen = await mountAt(1280, 900, true);
		const { net, bug, user } = measure(screen.container, true);
		const bugRect = bug.getBoundingClientRect();
		const netRect = net.getBoundingClientRect();
		const userRect = user.getBoundingClientRect();
		expect(bugRect.bottom).toBeLessThanOrEqual(netRect.top + 0.5);
		expect(netRect.bottom).toBeLessThanOrEqual(userRect.top + 0.5);
		expect(
			screen.container.querySelector('.bug-btn-label')?.getBoundingClientRect().width
		).toBeGreaterThan(0);
		expect(Math.round(netRect.width)).toBe(Math.round(bugRect.width));
	});
});

// NEH-254: the "Remote access" card of Settings > Network, read from
// GET /network/tailscale. Each state of the answer, in English and Spanish:
// its badge, its line and, when connected, the name and addresses; the 503;
// the problems Tailscale reports; and the card's place, after the interface
// cards and before the Wi-Fi networks; the card on a unit without
// NetworkManager (501), which still has Tailscale; and the polling: a good
// read then a 503, a read that times out and the next that answers, a hidden
// tab, unmount and remount (the last good answer kept while the new read is
// pending and after it fails), two readers that leave one at a time.
//
// Version: 0.4.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import type { NetworkStatus, TailscaleStatus } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { NETWORK_POLL_MS, resetNetworkStatus } from '$lib/stores/network';
import { refreshRemoteAccess, remoteAccess, resetRemoteAccess } from '$lib/stores/remote-access';
import { get } from 'svelte/store';
import '../../../../app.css';
import NetworkSection from './NetworkSection.svelte';

const STATUS: NetworkStatus = {
	hostname: 'captua',
	wifiDevice: 'wlan0',
	permissions: { scan: true, control: true, modify: true },
	interfaces: [
		{
			device: 'eth0',
			type: 'ethernet',
			state: 'connected',
			connection: 'Wired connection 1',
			mac: 'D8:3A:DD:4F:21:9C',
			ipv4: ['192.168.10.42/24'],
			ipv6: [],
			gateway: '192.168.10.1',
			dns: ['192.168.10.1'],
			ssid: null,
			signal: null
		}
	],
	problems: []
};

const SCAN = { networks: [], saved: [], rescanned: false };

function tailscale(over: Partial<TailscaleStatus> = {}): TailscaleStatus {
	return {
		installed: true,
		state: 'Running',
		online: true,
		name: 'captua-ahr-01',
		addresses: ['100.101.102.103', 'fd7a:115c:a1e0::1'],
		health: 0,
		needs_login: false,
		...over
	};
}

const NOT_INSTALLED = {
	installed: false,
	state: null,
	online: null,
	name: null,
	addresses: [],
	health: 0,
	needs_login: null
};

function json(code: number, body?: unknown) {
	return new Response(JSON.stringify(body ?? {}), {
		status: code,
		headers: { 'Content-Type': 'application/json' }
	});
}

function serve(
	remote: (signal: AbortSignal | null) => Response | Promise<Response>,
	network: () => Response | null = () => null
) {
	const urls: string[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		urls.push(url);
		if (/\/network\/tailscale$/.test(url)) return remote(init?.signal ?? null);
		const other = network();
		if (other) return other;
		if (/\/network\/status$/.test(url)) return json(200, STATUS);
		if (/\/network\/wifi(\?|$)/.test(url)) return json(200, SCAN);
		return json(500, { detail: 'not in this test' });
	});
	return urls;
}

/** A request that never answers; it fails as fetch does once its signal aborts it. */
function hang(signal: AbortSignal | null): Promise<Response> {
	return new Promise<Response>((_, reject) => {
		signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
	});
}

function remoteReads(urls: string[]) {
	return urls.filter((u) => /\/network\/tailscale$/.test(u)).length;
}

function remoteCard(container: HTMLElement) {
	return container.querySelector('[data-network-remote]') as HTMLElement | null;
}

function badgeOf(card: HTMLElement) {
	return card.querySelector('.status-badge') as HTMLElement;
}

afterEach(() => {
	resetNetworkStatus();
	resetRemoteAccess();
	vi.restoreAllMocks();
	locale.set('en');
});

const LOCALES = [
	['en', en],
	['es', es]
] as const;

for (const [lang, t] of LOCALES) {
	describe(`Remote access card (${lang})`, () => {
		beforeEach(() => locale.set(lang));

		async function mountWith(remote: () => Response) {
			serve(remote);
			const { container } = render(NetworkSection, { role: 'admin' });
			await expect.poll(() => remoteCard(container)?.querySelector('.status-badge')).not.toBeNull();
			const card = remoteCard(container)!;
			expect(card.querySelector('.net-card-title')?.textContent?.trim()).toBe(
				t.network_remote_title
			);
			expect(card.textContent).toContain(t.network_remote_desc);
			return { container, card };
		}

		it('running and online: Connected, with the name and the addresses', async () => {
			const { card } = await mountWith(() => json(200, tailscale()));
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_connected);
			expect(badgeOf(card).classList).toContain('tone-ok');
			const facts = card.querySelector('dl.net-facts') as HTMLElement;
			expect(facts.textContent).toContain(t.network_fact_name);
			expect(facts.textContent).toContain(t.network_fact_addresses);
			const mono = [...facts.querySelectorAll('dd.mono')].map((d) => d.textContent?.trim());
			expect(mono).toEqual(['captua-ahr-01', '100.101.102.103, fd7a:115c:a1e0::1']);
			expect(card.querySelector('[data-remote-body]')).toBeNull();
		});

		it('running, missing name and addresses: they read as the other cards show them', async () => {
			const { card } = await mountWith(() => json(200, tailscale({ name: null, addresses: [] })));
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_connected);
			const missing = [...card.querySelectorAll('dd.missing')].map((d) => d.textContent?.trim());
			expect(missing).toEqual([t.network_fact_none, t.network_fact_none]);
		});

		it('running but not online: Not connected, and it says it connects again', async () => {
			const { card } = await mountWith(() => json(200, tailscale({ online: false })));
			await expect
				.poll(() => badgeOf(card).textContent?.trim())
				.toBe(t.network_badge_not_connected);
			expect(badgeOf(card).classList).toContain('tone-warn');
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_not_connected
			);
			expect(card.querySelector('dl.net-facts')).toBeNull();
		});

		it('starting: Connecting', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'Starting', online: false }))
			);
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_connecting);
		});

		it('stopped: Off, and the support team cannot reach the unit', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'Stopped', online: false }))
			);
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_off);
			expect(badgeOf(card).classList).toContain('tone-off');
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_off
			);
		});

		it('NeedsLogin with needs_login false: Needs sign-in', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'NeedsLogin', online: false, needs_login: false }))
			);
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_sign_in);
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_needs_login
			);
		});

		it('Running and online with needs_login true: the flag wins, Needs sign-in', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'Running', online: true, needs_login: true }))
			);
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_sign_in);
			expect(card.querySelector('dl.net-facts')).toBeNull();
		});

		it('needs_login: Needs sign-in', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'NeedsLogin', online: false, needs_login: true }))
			);
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_sign_in);
			expect(badgeOf(card).classList).toContain('tone-warn');
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_needs_login
			);
		});

		it('NeedsMachineAuth: Needs sign-in too', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'NeedsMachineAuth', online: false, needs_login: false }))
			);
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_sign_in);
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_needs_login
			);
		});

		it('not installed: Not installed', async () => {
			const { card } = await mountWith(() => json(200, NOT_INSTALLED));
			await expect
				.poll(() => badgeOf(card).textContent?.trim())
				.toBe(t.network_badge_not_installed);
			expect(badgeOf(card).classList).toContain('tone-off');
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_not_installed
			);
		});

		it('503 tailscale_unavailable: Not available, and the service is not answering', async () => {
			const { card } = await mountWith(() =>
				json(503, { detail: { message: 'English', problems: [{ code: 'tailscale_unavailable' }] } })
			);
			await expect
				.poll(() => badgeOf(card).textContent?.trim())
				.toBe(t.network_badge_not_available);
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_unavailable
			);
			expect(card.textContent).not.toContain('English');
		});

		it('another state (NoState): Not available, with no line', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'NoState', online: null }))
			);
			await expect
				.poll(() => badgeOf(card).textContent?.trim())
				.toBe(t.network_badge_not_available);
			expect(card.querySelector('[data-remote-body]')).toBeNull();
		});

		it('health problems: the count, whatever the state', async () => {
			const { card } = await mountWith(() => json(200, tailscale({ health: 1 })));
			await expect
				.poll(() => card.querySelector('[data-remote-warnings]')?.textContent?.trim())
				.toBe(t.network_remote_warnings(1));
			expect(badgeOf(card).textContent?.trim()).toBe(t.network_badge_connected);
		});

		it('health problems on a stopped unit, plural', async () => {
			const { card } = await mountWith(() =>
				json(200, tailscale({ state: 'Stopped', online: false, health: 3 }))
			);
			await expect
				.poll(() => card.querySelector('[data-remote-warnings]')?.textContent?.trim())
				.toBe(t.network_remote_warnings(3));
			expect(card.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
				t.network_remote_off
			);
		});

		it('no health problems: no warning', async () => {
			const { card } = await mountWith(() => json(200, tailscale()));
			await expect.poll(() => badgeOf(card).textContent?.trim()).toBe(t.network_badge_connected);
			expect(card.querySelector('[data-remote-warnings]')).toBeNull();
		});
	});
}

describe('Remote access card: strings', () => {
	it('the warnings count is singular for one and formatted for many', () => {
		expect(en.network_remote_warnings(1)).toBe('Remote access reports 1 problem.');
		expect(en.network_remote_warnings(1200)).toBe('Remote access reports 1,200 problems.');
		expect(es.network_remote_warnings(1)).toBe('El acceso remoto reporta 1 problema.');
		expect(es.network_remote_warnings(12345)).toBe('El acceso remoto reporta 12.345 problemas.');
	});
});

describe('Remote access card: place', () => {
	beforeEach(() => locale.set('en'));

	it('stands after the interface cards and before the Wi-Fi networks, and reads GET /network/tailscale', async () => {
		const urls = serve(() => json(200, tailscale()));
		const { container } = render(NetworkSection, { role: 'reviewer' });
		await expect.poll(() => remoteCard(container)?.querySelector('.status-badge')).not.toBeNull();
		await expect.poll(() => container.querySelector('.net-grid')).not.toBeNull();
		const remote = remoteCard(container)!;
		const grid = container.querySelector('.net-grid')!;
		const wifiTitle = [...container.querySelectorAll('h3.sub-title')].find(
			(h) => h.textContent?.trim() === en.network_wifi_title
		)!;
		expect(grid.compareDocumentPosition(remote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(
			remote.compareDocumentPosition(wifiTitle) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		expect(grid.contains(remote)).toBe(false);
		expect(urls.filter((u) => /\/network\/tailscale$/.test(u))).toHaveLength(1);
	});
});

describe('Remote access card: a unit without NetworkManager', () => {
	beforeEach(() => locale.set('en'));

	it('501 for the status and the list: the card still shows Connected', async () => {
		serve(
			() => json(200, tailscale()),
			() => json(501, { detail: 'Network settings are not available on this device.' })
		);
		const { container } = render(NetworkSection, { role: 'admin' });
		await expect.element(page.getByText(en.network_not_available)).toBeVisible();
		await expect
			.poll(() => remoteCard(container)?.querySelector('.status-badge')?.textContent?.trim())
			.toBe(en.network_badge_connected);
		expect(remoteCard(container)!.querySelector('dd.mono')?.textContent?.trim()).toBe(
			'captua-ahr-01'
		);
	});
});

describe('Remote access card: polling', () => {
	beforeEach(() => {
		locale.set('en');
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
	});
	afterEach(() => {
		vi.useRealTimers();
		delete (document as unknown as Record<string, unknown>).visibilityState;
	});

	const badge = (container: HTMLElement) =>
		remoteCard(container)?.querySelector('.status-badge')?.textContent?.trim();

	it('a good read, then a 503: Not available with the line', async () => {
		let answer = () => json(200, tailscale());
		serve(() => answer());
		const { container } = render(NetworkSection, { role: 'admin' });
		await expect.poll(() => badge(container)).toBe(en.network_badge_connected);
		answer = () =>
			json(503, { detail: { message: 'x', problems: [{ code: 'tailscale_unavailable' }] } });
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => badge(container)).toBe(en.network_badge_not_available);
		expect(remoteCard(container)!.querySelector('[data-remote-body]')?.textContent?.trim()).toBe(
			en.network_remote_unavailable
		);
		expect(remoteCard(container)!.querySelector('dl.net-facts')).toBeNull();
	});

	it('a read with no answer is aborted at 5 s and keeps the last good answer; the next answer replaces it', async () => {
		let mode: 'good' | 'hang' | 'stopped' = 'good';
		let held: AbortSignal | null = null;
		const urls = serve((signal) => {
			if (mode !== 'hang')
				return json(
					200,
					mode === 'good' ? tailscale() : tailscale({ state: 'Stopped', online: false })
				);
			held = signal;
			return hang(signal);
		});
		const { container } = render(NetworkSection, { role: 'admin' });
		await expect.poll(() => badge(container)).toBe(en.network_badge_connected);
		mode = 'hang';
		// Started here rather than by the interval: expect.poll moves the fake
		// clock while it waits, so the tick would not fall at a known time.
		void refreshRemoteAccess();
		await vi.advanceTimersByTimeAsync(0);
		expect(remoteReads(urls)).toBe(2);
		expect(held).not.toBeNull();
		const signal = held as unknown as AbortSignal;
		await vi.advanceTimersByTimeAsync(4_999);
		expect(signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(0);
		expect(badge(container)).toBe(en.network_badge_connected);
		expect(remoteCard(container)!.querySelector('dd.mono')?.textContent?.trim()).toBe(
			'captua-ahr-01'
		);
		mode = 'stopped';
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => badge(container)).toBe(en.network_badge_off);
	});

	it('a hidden tab stops the reads; shown again, it reads at once and polls again', async () => {
		let visibility: DocumentVisibilityState = 'visible';
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => visibility
		});
		const urls = serve(() => json(200, tailscale()));
		const { container } = render(NetworkSection, { role: 'admin' });
		await expect.poll(() => badge(container)).toBe(en.network_badge_connected);
		expect(remoteReads(urls)).toBe(1);
		visibility = 'hidden';
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 3);
		expect(remoteReads(urls)).toBe(1);
		visibility = 'visible';
		document.dispatchEvent(new Event('visibilitychange'));
		await expect.poll(() => remoteReads(urls)).toBe(2);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(remoteReads(urls)).toBe(3);
	});

	it('unmounted, it stops reading; mounted again, it reads at once', async () => {
		const urls = serve(() => json(200, tailscale()));
		const first = render(NetworkSection, { role: 'admin' });
		await expect.poll(() => badge(first.container)).toBe(en.network_badge_connected);
		expect(remoteReads(urls)).toBe(1);
		first.unmount();
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 2);
		expect(remoteReads(urls)).toBe(1);
		const second = render(NetworkSection, { role: 'admin' });
		await expect.poll(() => remoteReads(urls)).toBe(2);
		await expect.poll(() => badge(second.container)).toBe(en.network_badge_connected);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(remoteReads(urls)).toBe(3);
	});

	it('mounted again, the last good answer stays while the new read is pending and after it fails', async () => {
		let release: ((r: Response) => void) | null = null;
		const urls = serve(() =>
			remoteReads(urls) === 1 ? json(200, tailscale()) : new Promise<Response>((r) => (release = r))
		);
		const first = render(NetworkSection, { role: 'admin' });
		await expect.poll(() => badge(first.container)).toBe(en.network_badge_connected);
		first.unmount();
		const second = render(NetworkSection, { role: 'admin' });
		await expect.poll(() => release).not.toBeNull();
		const card = () => remoteCard(second.container)!;
		expect(badge(second.container)).toBe(en.network_badge_connected);
		expect(card().querySelector('dd.mono')?.textContent?.trim()).toBe('captua-ahr-01');
		expect(card().textContent).not.toContain(en.common_loading_ellipsis);
		release!(json(500, { detail: 'boom' }));
		await expect.poll(() => get(remoteAccess).error).toBe('failed');
		expect(remoteReads(urls)).toBe(2);
		expect(badge(second.container)).toBe(en.network_badge_connected);
		expect(card().querySelector('dd.mono')?.textContent?.trim()).toBe('captua-ahr-01');
		expect(card().querySelector('[data-remote-body]')).toBeNull();
	});

	it('two sections poll once between them, and each leaves on its own', async () => {
		const urls = serve(() => json(200, tailscale()));
		const a = render(NetworkSection, { role: 'admin' });
		const b = render(NetworkSection, { role: 'reviewer' });
		await expect.poll(() => badge(b.container)).toBe(en.network_badge_connected);
		expect(remoteReads(urls)).toBe(1);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(remoteReads(urls)).toBe(2);
		a.unmount();
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(remoteReads(urls)).toBe(3);
		b.unmount();
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 2);
		expect(remoteReads(urls)).toBe(3);
	});
});

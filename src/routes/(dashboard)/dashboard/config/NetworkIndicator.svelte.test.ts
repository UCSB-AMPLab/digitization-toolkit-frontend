// NEH-253: the sidebar's network indicator (option B of the mock-up). Signal
// bars filled to the signal on Wi-Fi, the cable icon and the address on a
// cable, empty bars when offline; only the icon, with an accessible name,
// when the sidebar is collapsed; "Network state unknown" when no read has
// succeeded; nothing at all on a 501.
//
// Version: 0.3.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import type { NetworkInterface, NetworkStatus } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { NETWORK_POLL_MS, resetNetworkStatus } from '$lib/stores/network';
import '../../../../app.css';
import NetworkIndicator from './NetworkIndicator.svelte';

function iface(over: Partial<NetworkInterface> = {}): NetworkInterface {
	return {
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
		signal: null,
		...over
	};
}

const OFF_CABLE = iface({ state: 'unavailable', ipv4: [], gateway: null, dns: [] });
const OFF_WIFI = iface({
	device: 'wlan0',
	type: 'wifi',
	state: 'disconnected',
	ipv4: [],
	gateway: null,
	dns: []
});

function wifi(signal: number, ssid = 'Archive-Office') {
	return iface({ device: 'wlan0', type: 'wifi', ssid, signal, ipv4: ['10.0.4.117/24'] });
}

function status(
	interfaces: NetworkInterface[],
	problems: NetworkStatus['problems'] = []
): NetworkStatus {
	return {
		hostname: 'captua',
		wifiDevice: 'wlan0',
		permissions: { scan: true, control: true, modify: true },
		interfaces,
		problems
	};
}

function serve(code: number, body: unknown) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(
		async () =>
			new Response(JSON.stringify(body), {
				status: code,
				headers: { 'Content-Type': 'application/json' }
			})
	);
}

function link(container: HTMLElement) {
	return container.querySelector('a.net-status') as HTMLAnchorElement | null;
}

async function shown(container: HTMLElement) {
	await expect.poll(() => link(container)).not.toBeNull();
	return link(container)!;
}

function filledBars(el: Element) {
	return el.querySelectorAll('svg.sig rect.on').length;
}

beforeEach(() => locale.set('en'));
afterEach(() => {
	resetNetworkStatus();
	vi.restoreAllMocks();
});

describe('network indicator', () => {
	it('on Wi-Fi: bars by signal, "Connected · <network>", success tone, links to Settings > Network', async () => {
		serve(200, status([OFF_CABLE, wifi(72)]));
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Connected · Archive-Office');
		expect(filledBars(a)).toBe(4);
		expect(a.classList.contains('tone-ok')).toBe(true);
		expect(a.getAttribute('href')).toBe('/dashboard/config?section=network');
		expect(a.getAttribute('aria-label')).toBe(
			en.network_ind_label('Connected', 'Archive-Office', 72)
		);
	});

	it.each([
		[81, 4],
		[64, 3],
		[38, 2],
		[22, 1]
	])('fills the bars to a signal of %i%%: %i bars', async (signal, bars) => {
		serve(200, status([wifi(signal)]));
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect.poll(() => filledBars(a)).toBe(bars);
	});

	it('on a cable: the cable icon and "Connected · <IPv4 address>"', async () => {
		serve(200, status([iface(), OFF_WIFI]));
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Connected · 192.168.10.42');
		expect(a.querySelector('svg.cable')).not.toBeNull();
		expect(a.querySelector('svg.sig')).toBeNull();
	});

	it('with a problem: "Network problem · <network>" in the warning tone', async () => {
		serve(200, status([wifi(81, 'Library-Guest')], [{ code: 'no_dns', device: 'wlan0' }]));
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Network problem · Library-Guest');
		expect(a.classList.contains('tone-warn')).toBe(true);
	});

	it('offline: empty bars and "Offline"', async () => {
		serve(200, status([OFF_CABLE, OFF_WIFI], [{ code: 'no_connection', device: null }]));
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Offline');
		expect(a.querySelector('svg.sig')).not.toBeNull();
		expect(filledBars(a)).toBe(0);
		expect(a.classList.contains('tone-off')).toBe(true);
	});

	it('collapsed: only the icon, with the accessible name', async () => {
		serve(200, status([wifi(72)]));
		const { container } = render(NetworkIndicator, { expanded: false });
		const a = await shown(container);
		expect(a.querySelector('.net-status-line')).toBeNull();
		expect(a.getAttribute('aria-label')).toBe(
			en.network_ind_label('Connected', 'Archive-Office', 72)
		);
		expect(a.textContent?.trim()).toBe('');
	});

	it('shows nothing at all on a 501', async () => {
		const fetchSpy = serve(501, { detail: 'Network settings are not available on this device.' });
		const { container } = render(NetworkIndicator, { expanded: true });
		await expect.poll(() => fetchSpy.mock.calls.length).toBeGreaterThan(0);
		await new Promise((r) => setTimeout(r, 50));
		expect(link(container)).toBeNull();
		expect(container.textContent?.trim()).toBe('');
	});
});

describe('network indicator: no read has succeeded yet', () => {
	it.each([
		[
			'a 503',
			() =>
				serve(503, {
					detail: { message: 'x', problems: [{ code: 'network_manager_unavailable' }] }
				})
		],
		[
			'no answer',
			() => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
		]
	])(
		'the first read fails with %s: "Network state unknown" in the neutral colour',
		async (_, answer) => {
			answer();
			const { container } = render(NetworkIndicator, { expanded: true });
			const a = await shown(container);
			expect(a.querySelector('.net-status-line')?.textContent?.trim()).toBe(en.network_ind_unknown);
			expect(a.classList.contains('tone-off')).toBe(true);
			expect(filledBars(a)).toBe(0);
			expect(a.getAttribute('aria-label')).toBe(en.network_ind_unknown);
			expect(a.getAttribute('href')).toBe('/dashboard/config?section=network');
		}
	);

	it('several 501s in a row still show nothing', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		try {
			const fetchSpy = serve(501, { detail: 'Network settings are not available on this device.' });
			const { container } = render(NetworkIndicator, { expanded: true });
			await expect.poll(() => fetchSpy.mock.calls.length).toBe(1);
			await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
			await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
			await expect.poll(() => fetchSpy.mock.calls.length).toBe(3);
			await new Promise((r) => setTimeout(r, 50));
			expect(link(container)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('network indicator: fix round', () => {
	afterEach(() => vi.useRealTimers());

	it('after two failed reads in a row says "Network state unknown" in the neutral colour, until a read succeeds', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let code = 200;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
			code === 200
				? new Response(JSON.stringify(status([wifi(72)])), {
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					})
				: new Response(JSON.stringify({ detail: 'boom' }), { status: code })
		);
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Connected · Archive-Office');

		code = 500;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await new Promise((r) => setTimeout(r, 50));
		// One failure: still the last state.
		expect(link(container)!.querySelector('.net-status-line')?.textContent?.trim()).toBe(
			'Connected · Archive-Office'
		);

		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect
			.poll(() => link(container)?.querySelector('.net-status-line')?.textContent?.trim())
			.toBe(en.network_ind_unknown);
		const b = link(container)!;
		expect(b.classList.contains('tone-off')).toBe(true);
		expect(filledBars(b)).toBe(0);
		expect(b.getAttribute('aria-label')).toBe(en.network_ind_unknown);

		code = 200;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect
			.poll(() => link(container)?.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Connected · Archive-Office');
	});

	it('Connecting when nothing is connected and an interface is connecting', async () => {
		serve(
			200,
			status([
				OFF_CABLE,
				iface({
					device: 'wlan0',
					type: 'wifi',
					state: 'connecting',
					ssid: null,
					signal: null,
					connection: 'eduroam',
					ipv4: []
				})
			])
		);
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe(`${en.network_ind_connecting} · eduroam`);
		expect(a.classList.contains('tone-off')).toBe(true);
	});

	it('a Wi-Fi signal of null: empty bars in the neutral colour, no percentage in the name', async () => {
		serve(
			200,
			status([
				iface({
					device: 'wlan0',
					type: 'wifi',
					ssid: 'Archive-Office',
					signal: null,
					ipv4: ['10.0.4.117/24']
				})
			])
		);
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect.poll(() => a.getAttribute('aria-label')).toBe('Connected · Archive-Office');
		expect(filledBars(a)).toBe(0);
		expect(a.querySelector('.net-ico')?.classList.contains('ico-neutral')).toBe(true);
	});

	it('an empty network name: the state alone, with no separator', async () => {
		serve(
			200,
			status([
				iface({
					device: 'wlan0',
					type: 'wifi',
					ssid: '',
					connection: '',
					signal: 60,
					ipv4: ['10.0.4.117/24']
				})
			])
		);
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Connected');
		expect(a.getAttribute('aria-label')).toBe('Connected');
	});

	it('names the interface that has the problem when both are connected', async () => {
		serve(200, status([iface(), wifi(72)], [{ code: 'no_dns', device: 'eth0' }]));
		const { container } = render(NetworkIndicator, { expanded: true });
		const a = await shown(container);
		await expect
			.poll(() => a.querySelector('.net-status-line')?.textContent?.trim())
			.toBe('Network problem · 192.168.10.42');
	});
});

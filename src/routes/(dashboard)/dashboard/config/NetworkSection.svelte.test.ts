// NEH-253: Settings > Network. One card per interface with the warning of
// each status problem, the Wi-Fi networks in range (the connected one first,
// with their kind and saved mark) and a refresh that rescans, the saved
// networks with Forget (and the confirmation for the network the unit is
// on), the controls only for administrators and operators on a unit that
// lets Captua change the network, and the 501 and 503 answers.
//
// Version: 0.3.3
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import type { NetworkInterface, NetworkStatus, WifiScan } from '$lib/api';
import { locale } from '$lib/i18n';
import { en } from '$lib/i18n/en';
import { NETWORK_POLL_MS, networkState, resetNetworkStatus } from '$lib/stores/network';
import { get } from 'svelte/store';
import { formatReadTime } from './network-text';
import '../../../../app.css';
import NetworkSection from './NetworkSection.svelte';
import NetworkIndicator from './NetworkIndicator.svelte';

const MAC_ETH = 'D8:3A:DD:4F:21:9C';
const MAC_WIFI = 'D8:3A:DD:4F:21:9D';

function iface(over: Partial<NetworkInterface> = {}): NetworkInterface {
	return {
		device: 'eth0',
		type: 'ethernet',
		state: 'connected',
		connection: 'Wired connection 1',
		mac: MAC_ETH,
		ipv4: ['192.168.10.42/24'],
		ipv6: [],
		gateway: '192.168.10.1',
		dns: ['192.168.10.1'],
		ssid: null,
		signal: null,
		...over
	};
}

const CABLE = iface();
const NO_CABLE = iface({ state: 'unavailable', ipv4: [], gateway: null, dns: [] });
const WIFI_ON = iface({
	device: 'wlan0', type: 'wifi', mac: MAC_WIFI, ssid: 'Archive-Office', signal: 72,
	connection: 'Archive-Office', ipv4: ['10.0.4.117/24'], gateway: '10.0.4.1', dns: ['10.0.4.1']
});
const WIFI_OFF = iface({ device: 'wlan0', type: 'wifi', mac: MAC_WIFI, state: 'disconnected', connection: null, ipv4: [], gateway: null, dns: [] });

const ALLOWED = { scan: true, control: true, modify: true };

function status(interfaces: NetworkInterface[], problems: NetworkStatus['problems'] = [], permissions = ALLOWED): NetworkStatus {
	return { hostname: 'captua', wifiDevice: 'wlan0', permissions, interfaces, problems };
}

const SCAN: WifiScan = {
	networks: [
		{ ssid: 'Library-Guest', signal: 81, security: 'open', inUse: false, saved: true },
		{ ssid: 'Reading-Room-2', signal: 38, security: 'password', inUse: false, saved: false },
		{ ssid: 'Archive-Office', signal: 72, security: 'password', inUse: true, saved: true },
		{ ssid: 'eduroam', signal: 64, security: 'enterprise', inUse: false, saved: false }
	],
	saved: [
		{ uuid: '11111111-1111-4111-8111-111111111111', name: 'Archive-Office', ssid: 'Archive-Office', security: 'password', active: true },
		{ uuid: '22222222-2222-4222-8222-222222222222', name: 'Library-Guest', ssid: 'Library-Guest', security: 'open', active: false },
		{ uuid: '33333333-3333-4333-8333-333333333333', name: 'Conservation-Lab', ssid: 'Conservation-Lab', security: 'password', active: false }
	],
	rescanned: false
};

function json(code: number, body?: unknown) {
	return new Response(code === 204 ? null : JSON.stringify(body ?? {}), {
		status: code,
		headers: { 'Content-Type': 'application/json' }
	});
}

type Call = { method: string; url: string; signal?: AbortSignal | null };
type Route = (call: Call) => Response | Promise<Response> | undefined;

/** GET /network/status and GET /network/wifi answer `statusAnswer` and `wifiAnswer`; `extra` comes first. */
function serve(opts: { status?: () => Response; wifi?: (call: Call) => Response | Promise<Response>; extra?: Route } = {}) {
	const calls: Call[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		const call: Call = { method: (init?.method ?? 'GET').toUpperCase(), url };
		calls.push(call);
		Object.defineProperty(call, 'signal', { value: init?.signal ?? null, enumerable: false });
		const special = opts.extra?.(call);
		if (special) return special;
		if (/\/network\/status$/.test(url)) return opts.status ? opts.status() : json(200, status([CABLE, WIFI_ON]));
		if (/\/network\/wifi(\?|$)/.test(url)) return opts.wifi ? opts.wifi(call) : json(200, SCAN);
		return json(500, { detail: 'not in this test' });
	});
	return calls;
}

/** A request that never answers; it fails as fetch does once its signal aborts it. */
function hang(call: Call): Promise<Response> {
	return new Promise<Response>((_, reject) => {
		call.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
	});
}

function mount(role: string | null = 'admin') {
	return render(NetworkSection, { role });
}

function cards(container: HTMLElement) {
	return [...container.querySelectorAll('.net-card')] as HTMLElement[];
}

function card(container: HTMLElement, title: string) {
	return cards(container).find((c) => c.querySelector('.net-card-title')?.textContent?.trim() === title) ?? null;
}

function wifiRows(container: HTMLElement) {
	return [...container.querySelectorAll('[data-wifi-row]')] as HTMLElement[];
}

function savedRows(container: HTMLElement) {
	return [...container.querySelectorAll('[data-saved-row]')] as HTMLElement[];
}

// The card of the networks in range and the card of the saved networks.
function listCard(container: HTMLElement) {
	return (container.querySelector('[data-wifi-row]')?.closest('.config-card') as HTMLElement | null) ?? null;
}

function savedCard(container: HTMLElement) {
	return container.querySelector('.saved-card') as HTMLElement | null;
}

beforeEach(() => locale.set('en'));
afterEach(() => {
	resetNetworkStatus();
	vi.restoreAllMocks();
});

describe('Network: connections', () => {
	it('shows one card per interface with its facts', async () => {
		serve();
		const { container } = mount();
		await expect.poll(() => cards(container).length).toBe(2);
		const eth = card(container, en.network_card_ethernet)!;
		expect(eth.textContent).toContain(en.network_badge_connected);
		expect(eth.textContent).toContain(en.network_fact_wired);
		expect(eth.textContent).toContain('192.168.10.42/24');
		expect(eth.textContent).toContain('192.168.10.1');
		expect(eth.textContent).toContain(MAC_ETH);
		const wifi = card(container, en.network_card_wifi)!;
		expect(wifi.textContent).toContain('Archive-Office');
		expect(wifi.textContent).toContain(en.network_signal_value(72, en.network_signal_strong));
		expect(wifi.textContent).toContain('10.0.4.117/24');
		expect(wifi.textContent).toContain(MAC_WIFI);
	});

	it('an unplugged cable says how to use one; an unconnected Wi-Fi says so', async () => {
		serve({ status: () => json(200, status([NO_CABLE, WIFI_OFF], [{ code: 'no_connection', device: null }])) });
		const { container } = mount();
		await expect.poll(() => cards(container).length).toBe(2);
		expect(card(container, en.network_card_ethernet)!.textContent).toContain(en.network_badge_no_cable);
		expect(card(container, en.network_card_ethernet)!.textContent).toContain(en.network_eth_empty);
		expect(card(container, en.network_card_wifi)!.textContent).toContain(en.network_badge_not_connected);
		expect(card(container, en.network_card_wifi)!.textContent).toContain(en.network_wifi_empty_can);
	});

	it('no_connection: one warning above the cards, with what to try', async () => {
		serve({ status: () => json(200, status([NO_CABLE, WIFI_OFF], [{ code: 'no_connection', device: null }])) });
		const { container } = mount();
		await expect.poll(() => container.querySelector('[data-network-warning="no_connection"]')).not.toBeNull();
		const notice = container.querySelector('[data-network-warning="no_connection"]') as HTMLElement;
		expect(notice.classList.contains('action-notice')).toBe(true);
		expect(notice.textContent).toContain(en.network_warn_no_connection_title);
		expect(notice.textContent).toContain(en.network_warn_no_connection_body);
		expect(notice.textContent).toContain(en.network_warn_try(en.network_warn_no_connection_try));
	});

	const WIFI_PROBLEMS: [string, Partial<NetworkInterface>, string, string][] = [
		['no_address', { ipv4: [], gateway: null, dns: [] }, en.network_warn_no_address_title, en.network_warn_no_address_try(true)],
		['link_local_only', { ipv4: ['169.254.37.112/16'], gateway: null, dns: [] }, en.network_warn_link_local_only_title, en.network_warn_link_local_only_try(true)],
		['no_gateway', { gateway: null }, en.network_warn_no_gateway_title, en.network_warn_no_gateway_try(true)],
		['no_dns', { dns: [] }, en.network_warn_no_dns_title, en.network_warn_no_dns_try(true)]
	];

	it.each(WIFI_PROBLEMS)('%s on Wi-Fi: the card needs attention and explains it', async (code, over, title, tryText) => {
		serve({ status: () => json(200, status([NO_CABLE, { ...WIFI_ON, ...over }], [{ code, device: 'wlan0' }])) });
		const { container } = mount();
		await expect.poll(() => card(container, en.network_card_wifi)?.querySelector(`[data-network-warning="${code}"]`) ?? null).not.toBeNull();
		const wifi = card(container, en.network_card_wifi)!;
		expect(wifi.textContent).toContain(en.network_badge_attention);
		const notice = wifi.querySelector(`[data-network-warning="${code}"]`)!;
		expect(notice.textContent).toContain(title);
		expect(notice.textContent).toContain(en.network_warn_try(tryText));
		expect(card(container, en.network_card_ethernet)!.querySelector('[data-network-warning]')).toBeNull();
		expect(container.querySelectorAll('.action-notice[data-network-warning]').length).toBe(1);
	});

	it.each([
		['no_address', { ipv4: [], gateway: null, dns: [] }, en.network_warn_no_address_try(false)],
		['link_local_only', { ipv4: ['169.254.37.112/16'], gateway: null, dns: [] }, en.network_warn_link_local_only_try(false)],
		['no_gateway', { gateway: null }, en.network_warn_no_gateway_try(false)],
		['no_dns', { dns: [] }, en.network_warn_no_dns_try(false)]
	] as [string, Partial<NetworkInterface>, string][])('%s on the cable gives the advice for a cable', async (code, over, tryText) => {
		serve({ status: () => json(200, status([{ ...CABLE, ...over }, WIFI_OFF], [{ code, device: 'eth0' }])) });
		const { container } = mount();
		await expect.poll(() => card(container, en.network_card_ethernet)?.querySelector(`[data-network-warning="${code}"]`) ?? null).not.toBeNull();
		expect(card(container, en.network_card_ethernet)!.textContent).toContain(en.network_warn_try(tryText));
	});

	it('a missing gateway reads None in the facts', async () => {
		serve({ status: () => json(200, status([{ ...CABLE, gateway: null }, WIFI_OFF], [{ code: 'no_gateway', device: 'eth0' }])) });
		const { container } = mount();
		await expect.poll(() => card(container, en.network_card_ethernet)?.querySelector('dd.missing')?.textContent?.trim()).toBe(en.network_fact_none);
	});
});

describe('Network: Wi-Fi networks', () => {
	it('lists the connected network first, then by signal, with kind and saved marks', async () => {
		serve();
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		const rows = wifiRows(container);
		expect(rows.map((r) => r.querySelector('.device-name')?.textContent?.trim())).toEqual([
			'Archive-Office', 'Library-Guest', 'eduroam', 'Reading-Room-2'
		]);
		expect(rows.map((r) => r.querySelector('.wifi-kind')?.textContent?.trim())).toEqual([
			en.network_kind_password, en.network_kind_open, en.network_kind_enterprise, en.network_kind_password
		]);
		expect(rows.map((r) => !!r.querySelector('.saved-mark'))).toEqual([true, true, false, false]);
		expect(rows[0].textContent).toContain(en.network_connected_mark);
		expect(rows[0].querySelector('button')).toBeNull();
		for (const r of rows.slice(1)) expect(r.querySelector('button')?.textContent?.trim()).toBe(en.network_join);
	});

	it('Refresh list asks for a fresh scan with rescan=true', async () => {
		const calls = serve();
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		expect(calls.filter((c) => c.url.includes('/network/wifi')).map((c) => c.url.replace(/^.*\/network/, ''))).toEqual(['/wifi']);
		await page.getByRole('button', { name: en.config_refresh_list }).click();
		await expect.poll(() => calls.filter((c) => c.url.endsWith('/network/wifi?rescan=true')).length).toBe(1);
	});

	it('says so when the unit did not scan again', async () => {
		serve({ wifi: (c) => json(200, { ...SCAN, rescanned: false }) });
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		expect(container.textContent).not.toContain(en.network_not_rescanned);
		await page.getByRole('button', { name: en.config_refresh_list }).click();
		await expect.element(page.getByText(en.network_not_rescanned)).toBeVisible();
	});

	it('no_wifi_device: the card says the unit has no Wi-Fi', async () => {
		serve({ wifi: () => json(409, { detail: { message: 'x', problems: [{ code: 'no_wifi_device', message: 'English' }] } }) });
		mount();
		await expect.element(page.getByText(en.network_no_wifi_device)).toBeVisible();
	});

	// That closing clears what was typed is tested on the dialog itself
	// (JoinDialog.svelte.test.ts): here closing unmounts it.
	it('Join opens the dialog for that network; Cancel closes it', async () => {
		serve();
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		await page.getByRole('button', { name: en.network_join_aria('Reading-Room-2') }).click();
		const dialog = page.getByRole('dialog');
		await expect.element(dialog.getByRole('heading', { name: en.network_join_title('Reading-Room-2') })).toBeVisible();
		await userEvent.fill(dialog.getByLabelText(en.common_password_label, { exact: true }), 'typed-secret');
		await dialog.getByRole('button', { name: en.common_cancel }).click();
		await expect.element(dialog).not.toBeInTheDocument();
	});
});

describe('Network: saved networks', () => {
	it('lists them with their kind and where they are', async () => {
		serve();
		const { container } = mount();
		await expect.poll(() => savedRows(container).length).toBe(3);
		const meta = savedRows(container).map((r) => r.querySelector('.device-meta')?.textContent?.trim());
		expect(meta).toEqual([
			en.network_saved_meta(en.network_kind_password, en.network_saved_active),
			en.network_saved_meta(en.network_kind_open, en.network_saved_in_range),
			en.network_saved_meta(en.network_kind_password, en.network_saved_out_of_range)
		]);
		expect(container.textContent).toContain(en.network_saved_desc_forget);
	});

	it('Forget deletes the saved network and reads the list again', async () => {
		const calls = serve({ extra: (c) => (c.method === 'DELETE' ? json(204) : undefined) });
		const { container } = mount();
		await expect.poll(() => savedRows(container).length).toBe(3);
		await page.getByRole('button', { name: en.network_forget_aria('Conservation-Lab') }).click();
		await expect.poll(() => calls.filter((c) => c.method === 'DELETE').map((c) => c.url.replace(/^.*\/network/, ''))).toEqual([
			'/wifi/saved/33333333-3333-4333-8333-333333333333'
		]);
		await expect.poll(() => calls.filter((c) => c.method === 'GET' && /\/network\/wifi$/.test(c.url)).length).toBe(2);
	});

	it('the network the unit is on: confirms first, then forgets with force=true', async () => {
		const calls = serve({
			extra: (c) => {
				if (c.method !== 'DELETE') return undefined;
				if (c.url.endsWith('?force=true')) return json(204);
				return json(409, { detail: { message: 'x', problems: [{ code: 'connection_active', message: 'English' }] } });
			}
		});
		const { container } = mount();
		await expect.poll(() => savedRows(container).length).toBe(3);
		await page.getByRole('button', { name: en.network_forget_aria('Archive-Office') }).click();
		const confirm = page.getByRole('dialog', { name: en.network_forget_active_title('Archive-Office') });
		await expect.element(confirm).toBeVisible();
		await expect.element(confirm.getByText(en.network_forget_active_body)).toBeVisible();
		await confirm.getByRole('button', { name: en.network_forget_active_confirm }).click();
		await expect.poll(() => calls.filter((c) => c.method === 'DELETE').map((c) => c.url.replace(/^.*\/saved\//, ''))).toEqual([
			'11111111-1111-4111-8111-111111111111',
			'11111111-1111-4111-8111-111111111111?force=true'
		]);
		await expect.element(confirm).not.toBeInTheDocument();
	});

	it('cancelling the confirmation sends nothing more', async () => {
		const calls = serve({
			extra: (c) => (c.method === 'DELETE' ? json(409, { detail: { message: 'x', problems: [{ code: 'connection_active' }] } }) : undefined)
		});
		const { container } = mount();
		await expect.poll(() => savedRows(container).length).toBe(3);
		await page.getByRole('button', { name: en.network_forget_aria('Archive-Office') }).click();
		await page.getByRole('dialog').getByRole('button', { name: en.common_cancel }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
	});

	it('not_permitted: says the system did not allow it', async () => {
		serve({
			extra: (c) => (c.method === 'DELETE' ? json(409, { detail: { message: 'English', problems: [{ code: 'not_permitted', message: 'English' }] } }) : undefined)
		});
		const { container } = mount();
		await expect.poll(() => savedRows(container).length).toBe(3);
		await page.getByRole('button', { name: en.network_forget_aria('Library-Guest') }).click();
		await expect.element(page.getByText(en.network_forget_not_permitted)).toBeVisible();
		expect(container.textContent).not.toContain('English');
	});
});

describe('Network: who may change it', () => {
	it.each([
		['control', { scan: true, control: false, modify: true }],
		['modify', { scan: true, control: true, modify: false }]
	])('without the %s permission: no Join or Forget, and one notice', async (_name, permissions) => {
		serve({ status: () => json(200, status([CABLE, WIFI_ON], [], permissions)) });
		const { container } = mount('admin');
		await expect.poll(() => wifiRows(container).length).toBe(4);
		await expect.poll(() => savedRows(container).length).toBe(3);
		expect(container.querySelectorAll('[data-wifi-row] button, [data-saved-row] button')).toHaveLength(0);
		expect(container.querySelectorAll('[data-network-notice="not_permitted"]')).toHaveLength(1);
		expect(container.textContent).toContain(en.network_not_permitted_notice);
		expect(container.textContent).toContain(en.network_wifi_list_desc_ro);
	});

	it('the reviewer sees everything, with no controls and one line on who can change it', async () => {
		serve();
		const { container } = mount('reviewer');
		await expect.poll(() => wifiRows(container).length).toBe(4);
		await expect.poll(() => savedRows(container).length).toBe(3);
		expect(cards(container)).toHaveLength(2);
		expect(container.querySelectorAll('[data-wifi-row] button, [data-saved-row] button')).toHaveLength(0);
		expect(container.textContent).toContain(en.network_readonly);
		expect(container.textContent).toContain(en.network_saved_desc);
		expect(container.textContent).not.toContain(en.network_saved_desc_forget);
		await expect.element(page.getByRole('button', { name: en.config_refresh_list })).toBeVisible();
	});

	it('the testing role sees the network as a reviewer does: no controls', async () => {
		serve();
		const { container } = mount('testing');
		await expect.poll(() => wifiRows(container).length).toBe(4);
		expect(container.querySelectorAll('[data-wifi-row] button, [data-saved-row] button')).toHaveLength(0);
		expect(container.textContent).toContain(en.network_readonly);
		expect(container.textContent).not.toContain(en.network_saved_desc_forget);
	});

	it('the operator gets the controls', async () => {
		serve();
		const { container } = mount('operator');
		await expect.poll(() => wifiRows(container).length).toBe(4);
		await expect.element(page.getByRole('button', { name: en.network_join_aria('eduroam') })).toBeVisible();
		await expect.element(page.getByRole('button', { name: en.network_forget_aria('Library-Guest') })).toBeVisible();
		expect(container.textContent).not.toContain(en.network_readonly);
	});
});

describe('Network: availability', () => {
	it('501: the section says network settings are not available on this device', async () => {
		const notAvailable = () => json(501, { detail: 'Network settings are not available on this device.' });
		serve({ status: notAvailable, wifi: notAvailable });
		const { container } = mount();
		await expect.element(page.getByText(en.network_not_available)).toBeVisible();
		expect(cards(container)).toHaveLength(0);
		expect(container.textContent).not.toContain(en.network_wifi_list_title);
	});

	it('503 network_manager_unavailable: a plain error with a retry that reads again', async () => {
		let down = true;
		const unavailable = () => json(503, { detail: { message: 'English', problems: [{ code: 'network_manager_unavailable' }] } });
		const calls = serve({
			status: () => (down ? unavailable() : json(200, status([CABLE, WIFI_ON]))),
			wifi: () => (down ? unavailable() : json(200, SCAN))
		});
		const { container } = mount();
		await expect.element(page.getByText(en.network_service_unavailable).first()).toBeVisible();
		expect(container.textContent).not.toContain('English');
		down = false;
		await page.getByRole('button', { name: en.common_retry }).first().click();
		await expect.poll(() => cards(container).length).toBe(2);
		expect(calls.filter((c) => /\/network\/status$/.test(c.url)).length).toBeGreaterThanOrEqual(2);
	});

	it('shows the note that capturing needs no internet', async () => {
		serve();
		mount();
		await expect.element(page.getByText(en.config_offline_note)).toBeVisible();
	});
});

describe('Network: one poller with the sidebar', () => {
	afterEach(() => vi.useRealTimers());

	it('the indicator and the section read the status once on mount and once every 30 s between them', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		const calls = serve();
		render(NetworkIndicator, { expanded: true });
		const { container } = mount();
		await expect.poll(() => cards(container).length).toBe(2);
		const reads = () => calls.filter((c) => /\/network\/status$/.test(c.url)).length;
		expect(reads()).toBe(1);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(reads()).toBe(2);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(reads()).toBe(3);
	});
});

describe('Network: fix round', () => {
	afterEach(() => vi.useRealTimers());

	it('a failed read after a good one: one notice says the state is from the last good read, with its time and a Retry', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let ok = true;
		serve({ status: () => (ok ? json(200, status([CABLE, WIFI_ON])) : json(500, { detail: 'boom' })) });
		const { container } = mount();
		await expect.poll(() => cards(container).length).toBe(2);
		expect(container.querySelector('[data-network-notice="stale"]')).toBeNull();

		ok = false;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => container.querySelector('[data-network-notice="stale"]')).not.toBeNull();
		const notice = container.querySelector('[data-network-notice="stale"]') as HTMLElement;
		const at = get(networkState).lastReadAt!;
		expect(notice.textContent).toContain(en.network_stale(formatReadTime(at, 'en')));
		expect(container.querySelectorAll('[data-network-notice="stale"]')).toHaveLength(1);
		expect(cards(container)).toHaveLength(2);

		ok = true;
		await page.getByRole('button', { name: en.common_retry }).click();
		await expect.poll(() => container.querySelector('[data-network-notice="stale"]')).toBeNull();
	});

	it('an older list request that answers late does not replace a newer one, nor clear "Refreshing…"', async () => {
		const OLD: WifiScan = { ...SCAN, networks: [{ ssid: 'Old-Network', signal: 50, security: 'open', inUse: false, saved: false }] };
		const NEW: WifiScan = { ...SCAN, networks: [{ ssid: 'New-Network', signal: 60, security: 'open', inUse: false, saved: false }], rescanned: true };
		let releaseFirst!: (r: Response) => void;
		let releaseRescan!: (r: Response) => void;
		let n = 0;
		serve({
			wifi: (c) => {
				n += 1;
				if (n === 1) return new Promise<Response>((r) => (releaseFirst = r));
				if (c.url.endsWith('rescan=true')) return new Promise<Response>((r) => (releaseRescan = r));
				return json(200, NEW);
			}
		});
		const { container } = mount();
		const refresh = page.getByRole('button', { name: en.config_refresh_list });
		await refresh.click();
		await expect.element(page.getByRole('button', { name: en.network_refreshing })).toBeVisible();
		releaseFirst(json(200, OLD));
		await new Promise((r) => setTimeout(r, 50));
		// The older answer neither fills the list nor ends the refresh.
		expect(wifiRows(container).map((r) => r.querySelector('.device-name')?.textContent?.trim())).not.toContain('Old-Network');
		await expect.element(page.getByRole('button', { name: en.network_refreshing })).toBeVisible();
		releaseRescan(json(200, NEW));
		await expect.poll(() => wifiRows(container).map((r) => r.querySelector('.device-name')?.textContent?.trim())).toEqual(['New-Network']);
		await expect.element(page.getByRole('button', { name: en.config_refresh_list })).toBeEnabled();
	});
});

describe('Network: last round', () => {
	afterEach(() => vi.useRealTimers());

	it('the stale notice gives the date too when the last good read was not today (across midnight)', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
		vi.setSystemTime(new Date(2026, 10, 10, 23, 59, 50));
		let ok = true;
		serve({ status: () => (ok ? json(200, status([CABLE, WIFI_ON])) : json(500, { detail: 'boom' })) });
		const { container } = mount();
		await expect.poll(() => cards(container).length).toBe(2);
		const at = get(networkState).lastReadAt!;

		ok = false;
		vi.setSystemTime(new Date(2026, 10, 11, 0, 0, 20));
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => container.querySelector('[data-network-notice="stale"]')).not.toBeNull();
		const text = container.querySelector('[data-network-notice="stale"]')!.textContent!;
		const withDate = formatReadTime(at, 'en', Date.now());
		const timeOnly = formatReadTime(at, 'en', at);
		expect(withDate).not.toBe(timeOnly);
		expect(withDate).toContain('10');
		expect(text).toContain(en.network_stale(withDate));
	});

	it('the stale notice gives the time only when the last good read was today', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
		vi.setSystemTime(new Date(2026, 10, 11, 9, 0, 0));
		let ok = true;
		serve({ status: () => (ok ? json(200, status([CABLE, WIFI_ON])) : json(500, { detail: 'boom' })) });
		const { container } = mount();
		await expect.poll(() => cards(container).length).toBe(2);
		const at = get(networkState).lastReadAt!;
		ok = false;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => container.querySelector('[data-network-notice="stale"]')).not.toBeNull();
		expect(container.querySelector('[data-network-notice="stale"]')!.textContent).toContain(en.network_stale(formatReadTime(at, 'en', at)));
		expect(formatReadTime(at, 'en', at)).not.toContain('Nov');
	});

	it('a rescan the person asked for replaces a newer cached list when it arrives', async () => {
		const CACHED: WifiScan = { ...SCAN, networks: [{ ssid: 'Cached-Network', signal: 50, security: 'open', inUse: false, saved: false }] };
		const FRESH: WifiScan = { ...SCAN, networks: [{ ssid: 'Fresh-Network', signal: 60, security: 'open', inUse: false, saved: false }], rescanned: true };
		let releaseRescan!: (r: Response) => void;
		let n = 0;
		serve({
			wifi: (c) => {
				n += 1;
				if (c.url.endsWith('rescan=true')) return new Promise<Response>((r) => (releaseRescan = r));
				return json(200, n === 1 ? SCAN : CACHED);
			},
			extra: (c) => (c.method === 'DELETE' ? json(204) : undefined)
		});
		const { container } = mount();
		const names = () => wifiRows(container).map((r) => r.querySelector('.device-name')?.textContent?.trim());
		await expect.poll(() => names().length).toBe(4);
		await page.getByRole('button', { name: en.config_refresh_list }).click();
		await expect.element(page.getByRole('button', { name: en.network_refreshing })).toBeVisible();
		// A forget reads the cached list while the rescan is still running.
		await page.getByRole('button', { name: en.network_forget_aria('Conservation-Lab') }).click();
		await expect.poll(() => names()).toEqual(['Cached-Network']);
		await expect.element(page.getByRole('button', { name: en.network_refreshing })).toBeVisible();
		releaseRescan(json(200, FRESH));
		await expect.poll(() => names()).toEqual(['Fresh-Network']);
		await expect.element(page.getByRole('button', { name: en.config_refresh_list })).toBeEnabled();
	});
});

describe('Network: every request is bounded', () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
	afterEach(() => vi.useRealTimers());

	it('a Wi-Fi list with no answer is given up after 20 s: the error with Retry replaces "Loading…"', async () => {
		serve({ wifi: (c) => hang(c) });
		const { container } = mount();
		await expect.element(page.getByText(en.common_loading_ellipsis)).toBeVisible();
		await vi.advanceTimersByTimeAsync(19_000);
		await expect.element(page.getByText(en.common_loading_ellipsis)).toBeVisible();
		await vi.advanceTimersByTimeAsync(2_000);
		await expect.element(page.getByText(en.network_err_wifi)).toBeVisible();
		expect(container.textContent).not.toContain(en.common_loading_ellipsis);
	});

	it('a rescan with no answer is given up after 35 s: "Refreshing…" ends and the list stays', async () => {
		serve({ wifi: (c) => (c.url.endsWith('rescan=true') ? hang(c) : json(200, SCAN)) });
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		await page.getByRole('button', { name: en.config_refresh_list }).click();
		await expect.element(page.getByRole('button', { name: en.network_refreshing })).toBeDisabled();
		await vi.advanceTimersByTimeAsync(36_000);
		await expect.element(page.getByRole('button', { name: en.config_refresh_list })).toBeEnabled();
		expect(wifiRows(container)).toHaveLength(4);
		// The refresh failed: the list shown is marked as old.
		expect(listCard(container)?.textContent).toContain(en.network_err_wifi);
	});

	async function forgetActive(answer: (c: Call) => Response | Promise<Response>) {
		const calls = serve({
			extra: (c) => {
				if (c.method !== 'DELETE') return undefined;
				if (c.url.endsWith('?force=true')) return answer(c);
				return json(409, { detail: { message: 'x', problems: [{ code: 'connection_active', message: 'English' }] } });
			}
		});
		const { container } = mount();
		await expect.poll(() => savedRows(container).length).toBe(3);
		await page.getByRole('button', { name: en.network_forget_aria('Archive-Office') }).click();
		const confirm = page.getByRole('dialog', { name: en.network_forget_active_title('Archive-Office') });
		await confirm.getByRole('button', { name: en.network_forget_active_confirm }).click();
		await expect.poll(() => calls.filter((c) => c.method === 'DELETE')).toHaveLength(2);
		return { calls, container, confirm };
	}

	const wifiReads = (calls: Call[]) => calls.filter((c) => c.method === 'GET' && /\/network\/wifi$/.test(c.url)).length;
	const statusReads = (calls: Call[]) => calls.filter((c) => /\/network\/status$/.test(c.url)).length;

	it('forgetting the network in use with no answer in 20 s: not a failure; the modal closes and the state is read again', async () => {
		const { calls, container, confirm } = await forgetActive((c) => hang(c));
		await expect.element(confirm).toBeVisible();
		const [wifiBefore, statusBefore] = [wifiReads(calls), statusReads(calls)];
		await vi.advanceTimersByTimeAsync(21_000);
		await expect.element(confirm).not.toBeInTheDocument();
		await expect.poll(() => wifiReads(calls)).toBeGreaterThan(wifiBefore);
		await expect.poll(() => statusReads(calls)).toBeGreaterThan(statusBefore);
		expect(container.textContent).not.toContain(en.network_forget_failed);
		await expect.element(page.getByRole('button', { name: en.network_forget_aria('Library-Guest') })).toBeEnabled();
	});

	it('forgetting the network in use when the request fails without an answer: not a failure either', async () => {
		const { calls, container, confirm } = await forgetActive(() => {
			throw new TypeError('Failed to fetch');
		});
		await expect.element(confirm).not.toBeInTheDocument();
		await expect.poll(() => wifiReads(calls)).toBe(2);
		expect(container.textContent).not.toContain(en.network_forget_failed);
		await expect.element(page.getByRole('button', { name: en.network_forget_aria('Library-Guest') })).toBeEnabled();
	});

	it('an HTTP error answer to a forget is a failure and says so', async () => {
		const { confirm } = await forgetActive(() => json(500, { detail: 'boom' }));
		await expect.element(confirm).not.toBeInTheDocument();
		await expect.element(page.getByText(en.network_forget_failed)).toBeVisible();
	});
});

describe('Network: a list shown after a failed read', () => {
	afterEach(() => vi.useRealTimers());

	it('a refresh that fails after a good list: the list stays, and both cards say it could not be read, with Retry', async () => {
		let wifiOk = true;
		serve({ wifi: () => (wifiOk ? json(200, SCAN) : json(500, { detail: 'boom' })) });
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		expect(container.textContent).not.toContain(en.network_err_wifi);

		wifiOk = false;
		await page.getByRole('button', { name: en.config_refresh_list }).click();
		await expect.poll(() => listCard(container)?.textContent ?? '').toContain(en.network_err_wifi);
		await expect.element(page.getByRole('button', { name: en.config_refresh_list })).toBeEnabled();
		expect(wifiRows(container)).toHaveLength(4);
		expect(savedRows(container)).toHaveLength(3);
		// "Connected now" on the saved card is shown only beside the notice.
		expect(savedCard(container)?.textContent).toContain(en.network_saved_active);
		expect(savedCard(container)?.textContent).toContain(en.network_err_wifi);
		for (const c of [listCard(container)!, savedCard(container)!]) {
			expect([...c.querySelectorAll('button')].some((b) => b.textContent?.trim() === en.common_retry)).toBe(true);
		}
		// Only the first notice is a live region.
		const alerts = [...container.querySelectorAll('[role="alert"]')].filter((e) => e.textContent?.includes(en.network_err_wifi));
		expect(alerts).toHaveLength(1);
		expect(listCard(container)?.contains(alerts[0])).toBe(true);
		// Join and Forget stay usable: the unit may still be reachable.
		await expect.element(page.getByRole('button', { name: en.network_join_aria('eduroam') })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: en.network_forget_aria('Library-Guest') })).toBeEnabled();

		wifiOk = true;
		const retry = [...listCard(container)!.querySelectorAll('button')].find((b) => b.textContent?.trim() === en.common_retry)!;
		retry.click();
		await expect.poll(() => container.textContent).not.toContain(en.network_err_wifi);
	});

	it('when the status reads again after failing, a list whose last read failed is read again, once', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let statusOk = true;
		let wifiOk = true;
		const calls = serve({
			status: () => (statusOk ? json(200, status([CABLE, WIFI_ON])) : json(500, { detail: 'boom' })),
			wifi: () => (wifiOk ? json(200, SCAN) : json(500, { detail: 'boom' }))
		});
		const wifiReads = () => calls.filter((c) => c.method === 'GET' && /\/network\/wifi$/.test(c.url)).length;
		const stale = () => container.querySelector('[data-network-notice="stale"]');
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);

		// The status fails and recovers while the list is good: no extra list read.
		statusOk = false;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(stale).not.toBeNull();
		statusOk = true;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(stale).toBeNull();
		await new Promise((r) => setTimeout(r, 50));
		expect(wifiReads()).toBe(1);

		// The status fails, and so does a refresh of the list.
		statusOk = false;
		wifiOk = false;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(stale).not.toBeNull();
		await page.getByRole('button', { name: en.config_refresh_list }).click();
		await expect.poll(() => listCard(container)?.textContent ?? '').toContain(en.network_err_wifi);

		// The unit answers again: the list is read once, and the notice goes.
		statusOk = true;
		wifiOk = true;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(stale).toBeNull();
		await expect.poll(wifiReads).toBe(2);
		await expect.poll(() => container.textContent).not.toContain(en.network_err_wifi);
		await new Promise((r) => setTimeout(r, 50));
		expect(wifiReads()).toBe(2);
	});
});

describe('Network: the connected network comes from the status', () => {
	afterEach(() => vi.useRealTimers());

	const WIFI_B = iface({
		device: 'wlan0', type: 'wifi', mac: MAC_WIFI, ssid: 'Library-Guest', signal: 70,
		connection: 'Library-Guest', ipv4: ['10.0.4.118/24'], gateway: '10.0.4.1', dns: ['10.0.4.1']
	});
	const joinOffered = (container: HTMLElement, ssid: string) =>
		!!wifiRows(container).find((r) => r.querySelector('.device-name')?.textContent?.trim() === ssid)?.querySelector('button');

	it('the unit moves to another saved network: the list marks it connected, with the list unchanged', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let current = WIFI_ON;
		const calls = serve({ status: () => json(200, status([CABLE, current])) });
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		expect(wifiRows(container)[0].querySelector('.device-name')?.textContent?.trim()).toBe('Archive-Office');

		current = WIFI_B;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => wifiRows(container)[0].querySelector('.device-name')?.textContent?.trim()).toBe('Library-Guest');
		const rows = wifiRows(container);
		expect(rows[0].textContent).toContain(en.network_connected_mark);
		expect(joinOffered(container, 'Library-Guest')).toBe(false);
		expect(joinOffered(container, 'Archive-Office')).toBe(true);
		const where = (name: string) => savedRows(container).find((r) => r.querySelector('.device-name')?.textContent?.trim() === name)?.textContent ?? '';
		expect(where('Library-Guest')).toContain(en.network_saved_active);
		expect(where('Archive-Office')).not.toContain(en.network_saved_active);
		// Library-Guest is in the list: no extra list read.
		expect(calls.filter((c) => /\/network\/wifi(\?|$)/.test(c.url))).toHaveLength(1);
	});

	it('the status shows a network the list does not contain: the list is read once more, not again', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let current = WIFI_ON;
		const calls = serve({ status: () => json(200, status([CABLE, current])) });
		const wifiReads = () => calls.filter((c) => c.method === 'GET' && /\/network\/wifi$/.test(c.url)).length;
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		expect(wifiReads()).toBe(1);

		current = iface({ device: 'wlan0', type: 'wifi', mac: MAC_WIFI, ssid: 'Hidden-Net', connection: 'Hidden-Net', signal: 55 });
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(wifiReads).toBe(2);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await new Promise((r) => setTimeout(r, 50));
		expect(wifiReads()).toBe(2);
	});

	it('a list asked for under one connection does not count as read for the next: it is read once more, not again', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let current = WIFI_ON;
		let releaseRescan!: (r: Response) => void;
		// The first list contains the network the unit moves to; the one asked for later does not.
		const WITH_HIDDEN: WifiScan = {
			...SCAN,
			networks: [...SCAN.networks, { ssid: 'Hidden-Net', signal: 55, security: 'password', inUse: false, saved: false }]
		};
		const calls = serve({
			status: () => json(200, status([CABLE, current])),
			wifi: (c) => (c.url.endsWith('rescan=true') ? new Promise<Response>((r) => (releaseRescan = r)) : json(200, WITH_HIDDEN))
		});
		const listReads = () => calls.filter((c) => c.method === 'GET' && /\/network\/wifi(\?|$)/.test(c.url)).length;
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(5);
		expect(listReads()).toBe(1);

		// A list is asked for while Archive-Office is connected.
		await page.getByRole('button', { name: en.config_refresh_list }).click();
		await expect.poll(listReads).toBe(2);

		// While it is pending the unit moves to a network the answer will not contain.
		current = iface({ device: 'wlan0', type: 'wifi', mac: MAC_WIFI, ssid: 'Hidden-Net', connection: 'Hidden-Net', signal: 55 });
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => get(networkState).status?.interfaces.find((i) => i.type === 'wifi')?.ssid).toBe('Hidden-Net');
		expect(listReads()).toBe(2);

		releaseRescan(json(200, { ...SCAN, rescanned: true }));
		await expect.poll(listReads).toBe(3);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await new Promise((r) => setTimeout(r, 50));
		expect(listReads()).toBe(3);
	});

	it('the status could not be read: the list markers stand', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		let ok = true;
		serve({ status: () => (ok ? json(200, status([CABLE, WIFI_B])) : json(500, { detail: 'boom' })) });
		const { container } = mount();
		await expect.poll(() => wifiRows(container).length).toBe(4);
		expect(wifiRows(container)[0].querySelector('.device-name')?.textContent?.trim()).toBe('Library-Guest');
		ok = false; // the list's own markers (Archive-Office) now stand
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await expect.poll(() => container.querySelector('[data-network-notice="stale"]')).not.toBeNull();
		expect(wifiRows(container)[0].querySelector('.device-name')?.textContent?.trim()).toBe('Archive-Office');
	});
});

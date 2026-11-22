// NEH-253: the shared network status store. One poller however many readers
// there are, a read every 30 s while the tab is visible and none while it is
// hidden, a 501 that drops the state, and the indicator's three states.
//
// Version: 0.1.0-beta
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import type { NetworkInterface, NetworkStatus } from '$lib/api';
import {
	NETWORK_POLL_MS,
	networkIndicator,
	networkState,
	readNetworkStatus,
	refreshNetworkStatus,
	resetNetworkStatus,
	watchNetworkStatus
} from './network';

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

function json(code: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status: code,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** Counts GET /network/status and answers with `answer()`. */
function serveStatus(answer: () => Response) {
	const calls: string[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
		const url = String(input instanceof Request ? input.url : input);
		calls.push(url);
		return answer();
	});
	return calls;
}

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
	document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
});
afterEach(() => {
	resetNetworkStatus();
	vi.useRealTimers();
	vi.restoreAllMocks();
	setVisibility('visible');
});

describe('readNetworkStatus', () => {
	it('accepts a status and refuses anything else', () => {
		const s = status([iface()]);
		expect(readNetworkStatus(s)).toEqual(s);
		expect(readNetworkStatus({ id: 1, username: 'admin' })).toBeNull();
		expect(readNetworkStatus(null)).toBeNull();
	});
});

describe('the poller', () => {
	it('reads once on the first reader and every 30 s, however many readers there are', async () => {
		const calls = serveStatus(() => json(200, status([iface()])));
		const stopA = watchNetworkStatus();
		const stopB = watchNetworkStatus();
		await vi.waitFor(() => expect(get(networkState).status).not.toBeNull());
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatch(/\/network\/status$/);

		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(calls).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(calls).toHaveLength(3);

		stopA();
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(calls).toHaveLength(4);
		stopB();
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 3);
		expect(calls).toHaveLength(4);
	});

	it('stops while the tab is hidden and reads at once when it is shown again', async () => {
		const calls = serveStatus(() => json(200, status([iface()])));
		const stop = watchNetworkStatus();
		await vi.waitFor(() => expect(calls).toHaveLength(1));

		setVisibility('hidden');
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 4);
		expect(calls).toHaveLength(1);

		setVisibility('visible');
		await vi.waitFor(() => expect(calls).toHaveLength(2));
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(calls).toHaveLength(3);
		stop();
	});

	it('drops the state on a 501 and keeps the last status on a 503', async () => {
		let answer = json(200, status([iface()]));
		serveStatus(() => answer.clone());
		const stop = watchNetworkStatus();
		await vi.waitFor(() => expect(get(networkState).status).not.toBeNull());

		answer = json(503, {
			detail: {
				message: 'NetworkManager is not answering.',
				problems: [{ code: 'network_manager_unavailable' }]
			}
		});
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await vi.waitFor(() => expect(get(networkState).error).toBe('service_unavailable'));
		expect(get(networkState).status).not.toBeNull();

		answer = json(501, { detail: 'Network settings are not available on this device.' });
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		await vi.waitFor(() => expect(get(networkState).error).toBe('not_available'));
		expect(get(networkState).status).toBeNull();
		stop();
	});
});

describe('networkIndicator', () => {
	it('is Connected with the cable address when the cable has no problem', () => {
		expect(networkIndicator(status([iface()]))).toEqual({
			state: 'connected',
			via: 'ethernet',
			name: '192.168.10.42',
			signal: null
		});
	});

	it('names the Wi-Fi network and its signal when Wi-Fi is connected', () => {
		const wifi = iface({ device: 'wlan0', type: 'wifi', ssid: 'Archive-Office', signal: 72 });
		const cable = iface({ state: 'unavailable', ipv4: [] });
		expect(networkIndicator(status([cable, wifi]))).toEqual({
			state: 'connected',
			via: 'wifi',
			name: 'Archive-Office',
			signal: 72
		});
	});

	it('is Network problem when a connected interface has a problem', () => {
		const wifi = iface({
			device: 'wlan0',
			type: 'wifi',
			ssid: 'Library-Guest',
			signal: 81,
			ipv4: [],
			gateway: null,
			dns: []
		});
		const view = networkIndicator(status([wifi], [{ code: 'no_address', device: 'wlan0' }]));
		expect(view.state).toBe('problem');
		expect(view.name).toBe('Library-Guest');
	});

	it('is Offline when nothing is connected', () => {
		const cable = iface({ state: 'unavailable', ipv4: [] });
		const wifi = iface({ device: 'wlan0', type: 'wifi', state: 'disconnected', ipv4: [] });
		expect(
			networkIndicator(status([cable, wifi], [{ code: 'no_connection', device: null }]))
		).toEqual({
			state: 'offline',
			via: null,
			name: null,
			signal: null
		});
	});
});

describe('a read that never answers (NEH-253 fix round)', () => {
	it('is aborted after 5 s, counts as a failed read, and does not block the next read', async () => {
		vi.useRealTimers();
		vi.useFakeTimers({
			toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date']
		});
		let hang = true;
		const calls: string[] = [];
		vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
			calls.push(String(input));
			if (!hang) return Promise.resolve(json(200, status([iface()])));
			return new Promise((_, reject) => {
				init?.signal?.addEventListener('abort', () =>
					reject(new DOMException('Aborted', 'AbortError'))
				);
			});
		});
		const stop = watchNetworkStatus();
		await expect.poll(() => calls.length).toBe(1);
		await vi.advanceTimersByTimeAsync(4999);
		expect(get(networkState).error).toBeNull();
		expect(get(networkState).loading).toBe(true);
		await vi.advanceTimersByTimeAsync(1);
		await expect.poll(() => get(networkState).error).toBe('failed');
		expect(get(networkState).failures).toBe(1);

		hang = false;
		await refreshNetworkStatus();
		expect(calls).toHaveLength(2);
		expect(get(networkState).status).not.toBeNull();
		expect(get(networkState).error).toBeNull();
		stop();
	});
});

describe('failed reads and the last good read', () => {
	it('counts consecutive failures and keeps the time of the last good read', async () => {
		let code = 200;
		serveStatus(() =>
			code === 200 ? json(200, status([iface()])) : json(code, { detail: 'boom' })
		);
		await refreshNetworkStatus();
		const goodAt = get(networkState).lastReadAt;
		expect(goodAt).toBe(Date.now());
		expect(get(networkState).failures).toBe(0);

		vi.setSystemTime(Date.now() + 60_000);
		code = 500;
		await refreshNetworkStatus();
		expect(get(networkState).failures).toBe(1);
		await refreshNetworkStatus();
		expect(get(networkState).failures).toBe(2);
		expect(get(networkState).lastReadAt).toBe(goodAt);
		expect(get(networkState).status).not.toBeNull();

		code = 200;
		await refreshNetworkStatus();
		expect(get(networkState).failures).toBe(0);
		expect(get(networkState).lastReadAt).toBe(Date.now());
	});
});

describe('releasing a reader', () => {
	it('counts once, and a release from before a reset does not stop a later reader', async () => {
		const calls = serveStatus(() => json(200, status([iface()])));
		const a = watchNetworkStatus();
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		a();
		a();
		const b = watchNetworkStatus();
		resetNetworkStatus();
		b();
		const c = watchNetworkStatus();
		await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
		const before = calls.length;
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS);
		expect(calls.length).toBe(before + 1);
		c();
		c();
		await vi.advanceTimersByTimeAsync(NETWORK_POLL_MS * 2);
		expect(calls.length).toBe(before + 1);
	});
});

describe('networkIndicator: which interface it names (fix round)', () => {
	const cable = iface();
	const wifiOn = iface({
		device: 'wlan0',
		type: 'wifi',
		ssid: 'Archive-Office',
		signal: 72,
		ipv4: ['10.0.4.117/24']
	});

	it('names the cable when only the cable has a problem', () => {
		expect(networkIndicator(status([cable, wifiOn], [{ code: 'no_dns', device: 'eth0' }]))).toEqual(
			{
				state: 'problem',
				via: 'ethernet',
				name: '192.168.10.42',
				signal: null
			}
		);
	});

	it('names the Wi-Fi network when only the Wi-Fi has a problem', () => {
		expect(
			networkIndicator(status([cable, wifiOn], [{ code: 'no_gateway', device: 'wlan0' }]))
		).toEqual({
			state: 'problem',
			via: 'wifi',
			name: 'Archive-Office',
			signal: 72
		});
	});

	it('is Connecting when nothing is connected and an interface is connecting', () => {
		const connecting = iface({
			device: 'wlan0',
			type: 'wifi',
			state: 'connecting',
			ssid: null,
			signal: null,
			connection: 'eduroam',
			ipv4: []
		});
		const off = iface({ state: 'unavailable', ipv4: [] });
		expect(networkIndicator(status([off, connecting]))).toEqual({
			state: 'connecting',
			via: 'wifi',
			name: 'eduroam',
			signal: null
		});
	});

	it('gives no name for an empty network name', () => {
		const blank = iface({ device: 'wlan0', type: 'wifi', ssid: '', connection: '', signal: 50 });
		expect(networkIndicator(status([blank])).name).toBeNull();
	});
});

// The connected network is read from the status, not from the cached list:
// markConnected, connectedKey and listLacksConnected.
//
// Version: 0.3.3
import { describe, expect, it } from 'vitest';
import type {
	NetworkInterface,
	NetworkStatus,
	SavedWifiNetwork,
	WifiNetwork,
	WifiScan
} from '$lib/api';
import { connectedKey, listLacksConnected, markConnected } from './connected-network';

function wifi(
	ssid: string | null,
	connection: string | null = ssid,
	state: NetworkInterface['state'] = 'connected',
	device = 'wlan0'
): NetworkInterface {
	return {
		device,
		type: 'wifi',
		state,
		connection,
		mac: null,
		ipv4: [],
		ipv6: [],
		gateway: null,
		dns: [],
		ssid,
		signal: 60
	};
}

function status(
	interfaces: NetworkInterface[],
	wifiDevice: string | null = 'wlan0'
): NetworkStatus {
	return {
		hostname: 'captua',
		wifiDevice,
		permissions: { scan: true, control: true, modify: true },
		interfaces,
		problems: []
	};
}

const net = (ssid: string, inUse: boolean): WifiNetwork => ({
	ssid,
	signal: 50,
	security: 'password',
	inUse,
	saved: true
});
const saved = (uuid: string, ssid: string, active: boolean, name = ssid): SavedWifiNetwork => ({
	uuid,
	name,
	ssid,
	security: 'password',
	active
});

// The list was read while the unit was on A.
const SCAN: WifiScan = {
	networks: [net('A', true), net('B', false)],
	saved: [saved('ua', 'A', true), saved('ub', 'B', false)],
	rescanned: false
};

describe('markConnected', () => {
	it('takes the connected network from the status, not from the list', () => {
		const out = markConnected(SCAN, status([wifi('B')]), false);
		expect(out.networks.map((n) => [n.ssid, n.inUse])).toEqual([
			['A', false],
			['B', true]
		]);
		expect(out.saved.map((s) => [s.uuid, s.active])).toEqual([
			['ua', false],
			['ub', true]
		]);
	});

	it('marks nothing when the status shows no connected Wi-Fi', () => {
		const out = markConnected(SCAN, status([wifi(null, null, 'disconnected')]), false);
		expect(out.networks.some((n) => n.inUse)).toBe(false);
		expect(out.saved.some((s) => s.active)).toBe(false);
	});

	it('uses the list markers when the status was never read or its last read failed', () => {
		for (const out of [
			markConnected(SCAN, null, false),
			markConnected(SCAN, status([wifi('B')]), true)
		]) {
			expect(out.networks.map((n) => n.inUse)).toEqual([true, false]);
			expect(out.saved.map((s) => s.active)).toEqual([true, false]);
		}
	});

	it('two saved profiles with one SSID: the one whose name the status gives is marked', () => {
		const two: WifiScan = {
			networks: [net('Office', false)],
			saved: [saved('u1', 'Office', true, 'Office'), saved('u2', 'Office', false, 'Office 2')],
			rescanned: false
		};
		const out = markConnected(two, status([wifi('Office', 'Office 2')]), false);
		expect(out.saved.map((s) => [s.uuid, s.active])).toEqual([
			['u1', false],
			['u2', true]
		]);
	});

	it('a profile named differently from its SSID is marked by the SSID when it is the only one', () => {
		const one: WifiScan = {
			networks: [net('Office', false)],
			saved: [saved('u1', 'Office', false, 'Reading room')],
			rescanned: false
		};
		const out = markConnected(one, status([wifi('Office', 'Reading room')]), false);
		expect(out.saved[0].active).toBe(true);
	});

	it('two profiles that share SSID and name cannot be told apart: both are marked', () => {
		const dup: WifiScan = {
			networks: [net('Office', false)],
			saved: [
				saved('u1', 'Office', false),
				saved('u2', 'Office', false),
				saved('u3', 'Other', true)
			],
			rescanned: false
		};
		const out = markConnected(dup, status([wifi('Office')]), false);
		expect(out.saved.map((s) => s.active)).toEqual([true, true, false]);
	});
});

describe('two Wi-Fi interfaces: the controlled one decides', () => {
	const idle = wifi(null, null, 'disconnected', 'wlan0');

	it('the controlled adapter is disconnected and the other is on B: B is not marked, and the list does not lack it', () => {
		const st = status([idle, wifi('B', 'B', 'connected', 'wlan1')]);
		const out = markConnected(SCAN, st, false);
		expect(out.networks.some((n) => n.inUse)).toBe(false);
		expect(listLacksConnected({ ...SCAN, networks: [net('A', false)] }, st, false)).toBe(false);
		expect(connectedKey(st, false)).toBeNull();
	});

	it('the controlled adapter is on A and the other on B: only A is marked in range', () => {
		const st = status([wifi('A', 'A', 'connected', 'wlan0'), wifi('B', 'B', 'connected', 'wlan1')]);
		const out = markConnected(SCAN, st, false);
		expect(out.networks.map((n) => [n.ssid, n.inUse])).toEqual([
			['A', true],
			['B', false]
		]);
	});

	it('a saved profile is active when any interface is on it, as the backend reports it', () => {
		const st = status([idle, wifi('B', 'B', 'connected', 'wlan1')]);
		const out = markConnected(SCAN, st, false);
		expect(out.saved.map((s) => [s.uuid, s.active])).toEqual([
			['ua', false],
			['ub', true]
		]);
	});

	it('no Wi-Fi device (wifiDevice null): nothing in range is marked', () => {
		const st = status([wifi('A')], null);
		const out = markConnected(SCAN, st, false);
		expect(out.networks.some((n) => n.inUse)).toBe(false);
		expect(listLacksConnected(SCAN, st, false)).toBe(false);
		expect(connectedKey(st, false)).toBeNull();
	});
});

describe('connectedKey and listLacksConnected', () => {
	it('the key changes with the connected network and is null when unknown or none', () => {
		expect(connectedKey(status([wifi('A')]), false)).not.toBe(
			connectedKey(status([wifi('B')]), false)
		);
		expect(connectedKey(null, false)).toBeNull();
		expect(connectedKey(status([wifi('A')]), true)).toBeNull();
		expect(connectedKey(status([wifi(null, null, 'disconnected')]), false)).toBeNull();
	});

	it('the list lacks the connected network only when the status is known and names one that is not in it', () => {
		expect(listLacksConnected(SCAN, status([wifi('C')]), false)).toBe(true);
		expect(listLacksConnected(SCAN, status([wifi('B')]), false)).toBe(false);
		expect(listLacksConnected(SCAN, status([wifi('C')]), true)).toBe(false);
		expect(listLacksConnected(SCAN, null, false)).toBe(false);
	});
});

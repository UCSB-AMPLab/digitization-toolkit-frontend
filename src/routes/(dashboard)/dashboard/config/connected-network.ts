// Which Wi-Fi network the unit is connected to, for the lists of Settings >
// Network (NEH-253).
//
// THE RULE: which network is connected is taken from the current status
// (GET /network/status, through the status store), never from the cached
// Wi-Fi list. The list supplies only what the status does not know: which
// networks are in range, their signal and security, and which are saved. The
// list's own `inUse` and `active` markers are not read anywhere else.
//
// Derived from the status here, and nowhere else:
//   1. the "connected" mark of a network in range (`WifiNetwork.inUse`), and
//      with it the row's highlight and whether it offers Join: from the
//      controlled Wi-Fi interface only, the one whose device name is
//      `status.wifiDevice`, because scanning and joining act on that adapter;
//   2. the order of the networks in range, the connected one first: the same
//      interface as 1;
//   3. the "connected now" text of a saved network (`SavedWifiNetwork.active`):
//      from any Wi-Fi interface, as the backend's `active` flag is (nmcli
//      reports a profile active on whichever device holds it);
//   4. whether the list lacks the connected network (`listLacksConnected`),
//      which is what makes the section read the list again: the same
//      interface as 1, as is `connectedKey`, which says when to read again.
// When the status has no `wifiDevice` (the unit has no Wi-Fi adapter) no
// network in range is marked.
// The "forget the network in use" confirmation is not derived from either:
// the backend asks for it (409 connection_active) when Forget is sent.
//
// The status names the network by the SSID of a connected Wi-Fi interface
// and by its connection (profile) name; it carries no profile uuid. A network
// in range is matched by SSID. A saved profile is matched by SSID, and when
// several saved profiles share that SSID, by the profile name too. When the
// SSID and the name are both shared by several profiles the status cannot
// tell them apart, and all of those are marked.
//
// When the status is unknown (never read, or its latest read failed) the
// list's own markers are used as they are: they are the only account of the
// connection there is, and the section says that the list could not be read
// or that the status is old.
//
// Version: 0.3.0

import type { NetworkStatus, SavedWifiNetwork, WifiNetwork, WifiScan } from '$lib/api';

export interface ConnectedWifi {
	ssid: string;
	/** The connection (profile) name, when the status gives one. */
	connection: string | null;
}

/**
 * The Wi-Fi networks the status shows as connected; null when the status is unknown.
 * `controlledOnly` keeps the interface named by `status.wifiDevice` and no other.
 */
export function connectedWifi(
	status: NetworkStatus | null,
	statusFailed: boolean,
	controlledOnly = false
): ConnectedWifi[] | null {
	if (!status || statusFailed) return null;
	const out: ConnectedWifi[] = [];
	for (const i of status.interfaces) {
		if (controlledOnly && (status.wifiDevice === null || i.device !== status.wifiDevice)) continue;
		if (i.type === 'wifi' && i.state === 'connected' && i.ssid)
			out.push({ ssid: i.ssid, connection: i.connection });
	}
	return out;
}

/** The scan with its connected markers taken from the status; unchanged when the status is unknown. */
export function markConnected(
	scan: WifiScan,
	status: NetworkStatus | null,
	statusFailed: boolean
): WifiScan {
	const anyInterface = connectedWifi(status, statusFailed);
	if (anyInterface === null) return scan;
	const controlled = connectedWifi(status, statusFailed, true) ?? [];
	const networks: WifiNetwork[] = scan.networks.map((n) => ({
		...n,
		inUse: controlled.some((c) => c.ssid === n.ssid)
	}));
	const saved: SavedWifiNetwork[] = scan.saved.map((s) => ({
		...s,
		active: isActiveProfile(s, scan.saved, anyInterface)
	}));
	return { ...scan, networks, saved };
}

function isActiveProfile(
	profile: SavedWifiNetwork,
	all: SavedWifiNetwork[],
	connected: ConnectedWifi[]
): boolean {
	return connected.some((c) => {
		if (profile.ssid !== c.ssid) return false;
		const sameSsid = all.filter((s) => s.ssid === c.ssid);
		if (sameSsid.length === 1 || c.connection === null) return true;
		const named = sameSsid.filter((s) => s.name === c.connection);
		// No profile has that name: the SSID is all there is to go by.
		return named.length === 0 ? true : profile.name === c.connection;
	});
}

/** A key that changes when the connected Wi-Fi network does; null when none is connected or the status is unknown. */
export function connectedKey(status: NetworkStatus | null, statusFailed: boolean): string | null {
	const connected = connectedWifi(status, statusFailed, true);
	if (!connected || connected.length === 0) return null;
	return connected.map((c) => `${c.ssid}\u0000${c.connection ?? ''}`).join('\u0001');
}

/** Whether the status shows a connected network that the list does not contain. */
export function listLacksConnected(
	scan: WifiScan,
	status: NetworkStatus | null,
	statusFailed: boolean
): boolean {
	const connected = connectedWifi(status, statusFailed, true);
	if (!connected) return false;
	return connected.some((c) => !scan.networks.some((n) => n.ssid === c.ssid));
}

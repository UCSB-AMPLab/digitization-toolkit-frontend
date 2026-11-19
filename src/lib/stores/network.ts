// The unit's network state (NEH-253), as GET /network/status reports it,
// shared by the sidebar's network indicator and Settings > Network so that
// there is one poller.
//
// `watchNetworkStatus()` registers a reader and returns the function that
// unregisters it. The first reader starts the polling: a read at once, then
// one every 30 s while the tab is visible. A hidden tab stops the interval
// and a tab shown again reads at once and starts it again. A reader that
// arrives while the polling runs reads again only when the last read is older
// than 5 s. The last reader to leave stops everything.
//
// `networkState.status` is the last status read; a failed read keeps it and
// sets `error`, except a 501 (no NetworkManager: a development machine),
// which drops it, since there is no network state to show at all.
// `failures` counts the failed reads since the last good one, and
// `lastReadAt` is the browser's time of that good read, so readers can say
// when what they show is old. A read that has not answered in 5 s is
// aborted and counts as failed, so one request that never returns cannot
// hold up the reads after it.
//
// Version: 0.1.0-beta

import { writable } from 'svelte/store';
import { networkApi, type NetworkInterface, type NetworkStatus } from '$lib/api';

export const NETWORK_POLL_MS = 30_000;
const FRESH_MS = 5_000;
export const NETWORK_READ_TIMEOUT_MS = 5_000;

/** Why the last read failed: 501, 503 network_manager_unavailable, or anything else. */
export type NetworkReadError = 'not_available' | 'service_unavailable' | 'failed';

export interface NetworkState {
	status: NetworkStatus | null;
	error: NetworkReadError | null;
	/** A read is in flight. */
	loading: boolean;
	/** Failed reads in a row since the last good one. */
	failures: number;
	/** Date.now() of the last good read; null before the first. */
	lastReadAt: number | null;
}

const INITIAL: NetworkState = { status: null, error: null, loading: false, failures: 0, lastReadAt: null };

export const networkState = writable<NetworkState>({ ...INITIAL });

/** The error kind of a failed network request. */
export function networkErrorKind(error: unknown): NetworkReadError {
	const status = (error as { status?: unknown } | null)?.status;
	if (status === 501) return 'not_available';
	if (status === 503) return 'service_unavailable';
	return 'failed';
}

function isStrings(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function readInterface(data: unknown): NetworkInterface | null {
	if (typeof data !== 'object' || data === null) return null;
	const i = data as Record<string, unknown>;
	if (typeof i.device !== 'string' || (i.type !== 'ethernet' && i.type !== 'wifi')) return null;
	if (typeof i.state !== 'string') return null;
	return {
		device: i.device,
		type: i.type,
		state: i.state as NetworkInterface['state'],
		connection: typeof i.connection === 'string' ? i.connection : null,
		mac: typeof i.mac === 'string' ? i.mac : null,
		ipv4: isStrings(i.ipv4) ? i.ipv4 : [],
		ipv6: isStrings(i.ipv6) ? i.ipv6 : [],
		gateway: typeof i.gateway === 'string' ? i.gateway : null,
		dns: isStrings(i.dns) ? i.dns : [],
		ssid: typeof i.ssid === 'string' ? i.ssid : null,
		signal: typeof i.signal === 'number' ? i.signal : null
	};
}

/** A status answer checked field by field; null when it is not one. */
export function readNetworkStatus(data: unknown): NetworkStatus | null {
	if (typeof data !== 'object' || data === null) return null;
	const d = data as Record<string, unknown>;
	if (!Array.isArray(d.interfaces) || !Array.isArray(d.problems)) return null;
	const p = (typeof d.permissions === 'object' && d.permissions !== null ? d.permissions : {}) as Record<string, unknown>;
	const interfaces = d.interfaces.map(readInterface).filter((i): i is NetworkInterface => i !== null);
	const problems = d.problems
		.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && typeof x.code === 'string')
		.map((x) => ({ code: x.code as string, device: typeof x.device === 'string' ? x.device : null }));
	return {
		hostname: typeof d.hostname === 'string' ? d.hostname : '',
		wifiDevice: typeof d.wifiDevice === 'string' ? d.wifiDevice : null,
		permissions: { scan: p.scan === true, control: p.control === true, modify: p.modify === true },
		interfaces,
		problems
	};
}

let readers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let lastRead = 0;
// Bumped by resetNetworkStatus, so that a read still in flight then is dropped.
let generation = 0;

/** Read the status now; a read already in flight is shared. */
export function refreshNetworkStatus(): Promise<void> {
	if (inFlight) return inFlight;
	const startedIn = generation;
	networkState.update((s) => ({ ...s, loading: true }));
	const p = (async () => {
		const controller = new AbortController();
		const abort = setTimeout(() => controller.abort(), NETWORK_READ_TIMEOUT_MS);
		try {
			const status = readNetworkStatus(await networkApi.status(controller.signal));
			if (startedIn !== generation) return;
			if (status) networkState.set({ status, error: null, loading: false, failures: 0, lastReadAt: Date.now() });
			else networkState.update((s) => ({ ...s, error: 'failed', loading: false, failures: s.failures + 1 }));
		} catch (error) {
			if (startedIn !== generation) return;
			// An aborted read has no status, so it is 'failed'.
			const kind = networkErrorKind(error);
			networkState.update((s) => ({
				...s,
				status: kind === 'not_available' ? null : s.status,
				error: kind,
				loading: false,
				failures: s.failures + 1
			}));
		} finally {
			clearTimeout(abort);
			if (startedIn === generation) inFlight = null;
			lastRead = Date.now();
		}
	})();
	inFlight = p;
	return p;
}

function tabVisible(): boolean {
	return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function startTimer() {
	if (timer !== null) return;
	timer = setInterval(() => {
		if (tabVisible()) void refreshNetworkStatus();
	}, NETWORK_POLL_MS);
}

function stopTimer() {
	if (timer === null) return;
	clearInterval(timer);
	timer = null;
}

function onVisibilityChange() {
	if (tabVisible()) {
		void refreshNetworkStatus();
		startTimer();
	} else {
		stopTimer();
	}
}

/**
 * Register a reader of the status; returns the function that unregisters
 * it. That function counts once however often it is called, and does
 * nothing after a reset, since the reader it stood for is already gone.
 */
export function watchNetworkStatus(): () => void {
	const joinedIn = generation;
	readers += 1;
	if (readers === 1) {
		document.addEventListener('visibilitychange', onVisibilityChange);
		if (tabVisible()) {
			void refreshNetworkStatus();
			startTimer();
		}
	} else if (!inFlight && Date.now() - lastRead > FRESH_MS) {
		void refreshNetworkStatus();
	}
	let released = false;
	return () => {
		if (released || joinedIn !== generation) return;
		released = true;
		readers = Math.max(0, readers - 1);
		if (readers === 0) {
			stopTimer();
			document.removeEventListener('visibilitychange', onVisibilityChange);
		}
	};
}

/** Stop the polling and forget the state (between tests). */
export function resetNetworkStatus(): void {
	generation += 1;
	readers = 0;
	stopTimer();
	if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
	inFlight = null;
	lastRead = 0;
	networkState.set({ ...INITIAL });
}

// ---------------------------------------------------------------------------
// The sidebar indicator
// ---------------------------------------------------------------------------

export interface NetworkIndicatorView {
	/**
	 * connected: an interface is connected and none has a problem; problem:
	 * a connected one has; connecting: none is connected and one is
	 * connecting; offline: none is either.
	 */
	state: 'connected' | 'problem' | 'connecting' | 'offline';
	/**
	 * The interface the line describes: the connected one with a problem,
	 * else the connected Wi-Fi, else the connected cable; when none is
	 * connected, the one connecting.
	 */
	via: 'wifi' | 'ethernet' | null;
	/** The network's name on Wi-Fi; on a cable, the unit's IPv4 address without its prefix; null when empty. */
	name: string | null;
	signal: number | null;
}

function viewOf(i: NetworkInterface, state: NetworkIndicatorView['state']): NetworkIndicatorView {
	if (i.type === 'wifi') {
		return { state, via: 'wifi', name: i.ssid || i.connection || null, signal: i.signal };
	}
	return { state, via: 'ethernet', name: i.ipv4[0]?.split('/')[0] || null, signal: null };
}

// The backend has no internet reachability check yet. When it has one, the
// states "Online", "No internet" and "Sign-in needed" attach here, read from
// that check, with "Connected" kept for a unit whose check has not run.
export function networkIndicator(status: NetworkStatus): NetworkIndicatorView {
	const connected = status.interfaces.filter((i) => i.state === 'connected');
	if (connected.length === 0) {
		const connecting = status.interfaces.find((i) => i.state === 'connecting');
		if (connecting) return viewOf(connecting, 'connecting');
		return { state: 'offline', via: null, name: null, signal: null };
	}
	const troubled = new Set(status.problems.map((p) => p.device).filter((d): d is string => d !== null));
	const withProblem = connected.find((i) => i.type === 'wifi' && troubled.has(i.device))
		?? connected.find((i) => troubled.has(i.device));
	if (withProblem) return viewOf(withProblem, 'problem');
	return viewOf(connected.find((i) => i.type === 'wifi') ?? connected[0], 'connected');
}

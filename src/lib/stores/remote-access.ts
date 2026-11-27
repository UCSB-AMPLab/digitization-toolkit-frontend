// The unit's remote access (NEH-254), as GET /network/tailscale reports it,
// for the "Remote access" card of Settings > Network.
//
// `watchRemoteAccess()` registers a reader and returns the function that
// unregisters it. It polls on the schedule of the network status
// (stores/network): the first reader reads at once and then every
// NETWORK_POLL_MS while the tab is visible; a hidden tab stops the interval,
// and a tab shown again reads at once and starts it again. The last reader to
// leave stops everything. A read that has not answered in 5 s is aborted and
// counts as failed.
//
// `remoteAccess.status` is the last answer read. A 503
// (tailscale_unavailable) drops it, since the service says it cannot tell;
// any other failure keeps it and sets `error`. The last answer outlives its
// readers: when the last one leaves, the polling stops and the state stays,
// so a card mounted again shows that answer while its first read is pending,
// and still shows it if that read fails other than with a 503.
//
// `remoteAccessView()` is the one place that decides what the card shows for
// a read: its badge and tone, its line, whether it lists the name and the
// addresses, and the count of problems Tailscale reports.
//
// Version: 0.4.0

import { writable } from 'svelte/store';
import { networkApi, type TailscaleStatus } from '$lib/api';
import { NETWORK_POLL_MS, NETWORK_READ_TIMEOUT_MS } from './network';

/** Why the last read failed: 503 tailscale_unavailable, or anything else. */
export type RemoteAccessReadError = 'service_unavailable' | 'failed';

export interface RemoteAccessState {
	status: TailscaleStatus | null;
	error: RemoteAccessReadError | null;
}

const INITIAL: RemoteAccessState = { status: null, error: null };

export const remoteAccess = writable<RemoteAccessState>({ ...INITIAL });

/** An answer checked field by field; null when it is not one. */
export function readTailscaleStatus(data: unknown): TailscaleStatus | null {
	if (typeof data !== 'object' || data === null) return null;
	const d = data as Record<string, unknown>;
	if (typeof d.installed !== 'boolean') return null;
	return {
		installed: d.installed,
		state: typeof d.state === 'string' ? d.state : null,
		online: typeof d.online === 'boolean' ? d.online : null,
		name: typeof d.name === 'string' && d.name !== '' ? d.name : null,
		addresses: Array.isArray(d.addresses)
			? d.addresses.filter((a): a is string => typeof a === 'string' && a !== '')
			: [],
		health:
			typeof d.health === 'number' && Number.isFinite(d.health) && d.health > 0
				? Math.floor(d.health)
				: 0,
		needs_login: typeof d.needs_login === 'boolean' ? d.needs_login : null
	};
}

let readers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
// Bumped by resetRemoteAccess, so that a read still in flight then is dropped.
let generation = 0;

/** Read remote access now; a read already in flight is shared. */
export function refreshRemoteAccess(): Promise<void> {
	if (inFlight) return inFlight;
	const startedIn = generation;
	const p = (async () => {
		const controller = new AbortController();
		const abort = setTimeout(() => controller.abort(), NETWORK_READ_TIMEOUT_MS);
		try {
			const status = readTailscaleStatus(await networkApi.tailscale(controller.signal));
			if (startedIn !== generation) return;
			if (status) remoteAccess.set({ status, error: null });
			else remoteAccess.update((s) => ({ ...s, error: 'failed' }));
		} catch (error) {
			if (startedIn !== generation) return;
			const unavailable = (error as { status?: unknown } | null)?.status === 503;
			remoteAccess.update((s) =>
				unavailable ? { status: null, error: 'service_unavailable' } : { ...s, error: 'failed' }
			);
		} finally {
			clearTimeout(abort);
			if (startedIn === generation) inFlight = null;
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
		if (tabVisible()) void refreshRemoteAccess();
	}, NETWORK_POLL_MS);
}

function stopTimer() {
	if (timer === null) return;
	clearInterval(timer);
	timer = null;
}

function onVisibilityChange() {
	if (tabVisible()) {
		void refreshRemoteAccess();
		startTimer();
	} else {
		stopTimer();
	}
}

/**
 * Register a reader of remote access; returns the function that unregisters
 * it. That function counts once however often it is called, and does
 * nothing after a reset.
 */
export function watchRemoteAccess(): () => void {
	const joinedIn = generation;
	readers += 1;
	if (readers === 1) {
		document.addEventListener('visibilitychange', onVisibilityChange);
		if (tabVisible()) {
			void refreshRemoteAccess();
			startTimer();
		}
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
export function resetRemoteAccess(): void {
	generation += 1;
	readers = 0;
	stopTimer();
	if (typeof document !== 'undefined')
		document.removeEventListener('visibilitychange', onVisibilityChange);
	inFlight = null;
	remoteAccess.set({ ...INITIAL });
}

// ---------------------------------------------------------------------------
// What the card shows
// ---------------------------------------------------------------------------

export type RemoteAccessBadge =
	| 'connected'
	| 'not_connected'
	| 'connecting'
	| 'off'
	| 'sign_in'
	| 'not_installed'
	| 'not_available';

export type RemoteAccessLine =
	| 'not_connected'
	| 'off'
	| 'needs_login'
	| 'not_installed'
	| 'unavailable';

export interface RemoteAccessView {
	badge: RemoteAccessBadge;
	tone: 'ok' | 'warn' | 'off';
	/** The line under the badge; null when the badge says all there is. */
	line: RemoteAccessLine | null;
	/** Whether the name and the addresses are listed (connected only). */
	facts: boolean;
	/** Problems Tailscale reports; 0 when none or when not installed. */
	warnings: number;
}

/**
 * What the card shows for the last read; null before the first answer. A
 * failed read other than the 503 shows the last answer, or Not available
 * when there is none.
 */
export function remoteAccessView(s: RemoteAccessState): RemoteAccessView | null {
	const view = (
		badge: RemoteAccessBadge,
		tone: RemoteAccessView['tone'],
		line: RemoteAccessLine | null = null,
		facts = false
	): RemoteAccessView => ({
		badge,
		tone,
		line,
		facts,
		warnings: s.status?.installed ? s.status.health : 0
	});
	if (s.error === 'service_unavailable') return view('not_available', 'off', 'unavailable');
	const t = s.status;
	if (!t) return s.error ? view('not_available', 'off') : null;
	if (!t.installed) return view('not_installed', 'off', 'not_installed');
	if (t.needs_login === true || t.state === 'NeedsLogin' || t.state === 'NeedsMachineAuth')
		return view('sign_in', 'warn', 'needs_login');
	if (t.state === 'Running')
		return t.online === true
			? view('connected', 'ok', null, true)
			: view('not_connected', 'warn', 'not_connected');
	if (t.state === 'Starting') return view('connecting', 'warn');
	if (t.state === 'Stopped') return view('off', 'off', 'off');
	return view('not_available', 'off');
}

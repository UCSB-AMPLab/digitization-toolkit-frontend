// Settings > Network (NEH-253): the texts and checks shared by the section
// and the join dialog. Every code the backend sends is translated here; the
// backend's English is never shown.
//
// Version: 0.3.3

import type { Messages } from '$lib/i18n';
import type { WifiNetwork, WifiSecurity } from '$lib/api';
import { formatApiDate } from '$lib/format-date';

/** Filled bars, 0 to 4, for a signal in percent. */
export function signalBars(signal: number | null | undefined): number {
	const s = signal ?? 0;
	if (s <= 0) return 0;
	if (s >= 70) return 4;
	if (s >= 50) return 3;
	if (s >= 30) return 2;
	return 1;
}

export function signalWord(signal: number, msgs: Messages): string {
	if (signal >= 70) return msgs.network_signal_strong;
	if (signal >= 50) return msgs.network_signal_good;
	if (signal >= 30) return msgs.network_signal_fair;
	return msgs.network_signal_weak;
}

export function securityLabel(security: WifiSecurity, msgs: Messages): string {
	if (security === 'open') return msgs.network_kind_open;
	if (security === 'password') return msgs.network_kind_password;
	return msgs.network_kind_enterprise;
}

/**
 * The time of a read in the interface's language (formatApiDate, as the
 * rest of the app writes dates): the time alone when it was on the day of
 * `now`, else with the day and month too, and the year when that differs.
 */
export function formatReadTime(ms: number, locale: 'es' | 'en', now: number = Date.now()): string {
	const at = new Date(ms);
	const today = new Date(now);
	const sameYear = at.getFullYear() === today.getFullYear();
	const sameDay = sameYear && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();
	const time: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
	const options: Intl.DateTimeFormatOptions = sameDay
		? time
		: { ...time, day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) };
	return formatApiDate(at.toISOString(), locale, options);
}

/** The networks in range, the one in use first, then by signal. */
export function orderNetworks(networks: WifiNetwork[]): WifiNetwork[] {
	return [...networks].sort(
		(a, b) => Number(b.inUse) - Number(a.inUse) || b.signal - a.signal || a.ssid.localeCompare(b.ssid)
	);
}

export interface StatusWarning {
	title: string;
	body: string | null;
	tryText: string | null;
}

/** The warning of a GET /network/status problem; `wifi` picks the advice for a Wi-Fi interface. */
export function statusWarning(code: string, wifi: boolean, msgs: Messages): StatusWarning {
	switch (code) {
		case 'no_connection':
			return {
				title: msgs.network_warn_no_connection_title,
				body: msgs.network_warn_no_connection_body,
				tryText: msgs.network_warn_no_connection_try
			};
		case 'no_address':
			return {
				title: msgs.network_warn_no_address_title,
				body: msgs.network_warn_no_address_body,
				tryText: msgs.network_warn_no_address_try(wifi)
			};
		case 'link_local_only':
			return {
				title: msgs.network_warn_link_local_only_title,
				body: msgs.network_warn_link_local_only_body,
				tryText: msgs.network_warn_link_local_only_try(wifi)
			};
		case 'no_gateway':
			return {
				title: msgs.network_warn_no_gateway_title,
				body: msgs.network_warn_no_gateway_body,
				tryText: msgs.network_warn_no_gateway_try(wifi)
			};
		case 'no_dns':
			return {
				title: msgs.network_warn_no_dns_title,
				body: msgs.network_warn_no_dns_body,
				tryText: msgs.network_warn_no_dns_try(wifi)
			};
		default:
			return { title: msgs.network_warn_other_title, body: null, tryText: null };
	}
}

/** The sentence for a failed join (GET /network/wifi/join `problem.code`). */
export function joinFailureText(code: string | null | undefined, msgs: Messages): string {
	switch (code) {
		case 'wrong_password': return msgs.network_fail_wrong_password;
		case 'wrong_credentials': return msgs.network_fail_wrong_credentials;
		case 'server_name_mismatch': return msgs.network_fail_server_name_mismatch;
		case 'server_not_trusted': return msgs.network_fail_server_not_trusted;
		case 'timeout': return msgs.network_fail_timeout;
		case 'not_permitted': return msgs.network_fail_not_permitted;
		default: return msgs.network_fail_failed;
	}
}

/** Where a refusal of POST /network/wifi/join is shown: beside a field, or in the dialog. */
export type JoinField = 'password' | 'identity' | 'anonymousIdentity' | 'method' | 'serverName' | 'dialog';

export function refusalField(code: string): JoinField {
	switch (code) {
		case 'password_required':
		case 'password_invalid':
		case 'password_length':
			return 'password';
		case 'identity_required':
		case 'identity_invalid':
			return 'identity';
		case 'anonymous_identity_invalid':
			return 'anonymousIdentity';
		case 'method_required':
		case 'inner_method_invalid':
			return 'method';
		case 'server_name_required':
		case 'server_name_invalid':
			return 'serverName';
		default:
			return 'dialog';
	}
}

export function refusalText(code: string, msgs: Messages): string {
	switch (code) {
		case 'ssid_invalid': return msgs.network_refusal_ssid_invalid;
		case 'password_required': return msgs.network_refusal_password_required;
		case 'password_invalid': return msgs.network_refusal_password_invalid;
		case 'password_length': return msgs.network_refusal_password_length;
		case 'identity_required': return msgs.network_refusal_identity_required;
		case 'identity_invalid': return msgs.network_refusal_identity_invalid;
		case 'anonymous_identity_invalid': return msgs.network_refusal_anonymous_identity_invalid;
		case 'method_required': return msgs.network_refusal_method_required;
		case 'server_name_required': return msgs.network_refusal_server_name_required;
		case 'server_name_invalid': return msgs.network_refusal_server_name_invalid;
		case 'inner_method_invalid': return msgs.network_refusal_inner_method_invalid;
		case 'no_wifi_device': return msgs.network_no_wifi_device;
		case 'not_permitted': return msgs.network_refusal_not_permitted;
		case 'join_in_progress': return msgs.network_refusal_join_in_progress;
		default: return msgs.network_refusal_other;
	}
}

/** The problem codes of a 409 {message, problems}, or null for any other error. */
export function refusalCodes(error: unknown): string[] | null {
	if (typeof error !== 'object' || error === null) return null;
	const e = error as { status?: unknown; detail?: unknown };
	if (e.status !== 409 || typeof e.detail !== 'object' || e.detail === null) return null;
	const problems = (e.detail as { problems?: unknown }).problems;
	if (!Array.isArray(problems)) return null;
	return problems.map((p) => (p && typeof p === 'object' && typeof p.code === 'string' ? p.code : ''));
}

// The backend's _LINE_BREAKS: a value with one would end its passwd-file line early.
const LINE_BREAK = /[\n\r\0]/;
// The backend's _has_control_character: an ASCII control character (below
// 32, or 127), which wpa_supplicant refuses in a WPA2/WPA3 passphrase.
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/** The length the backend measures: bytes of UTF-8, not UTF-16 units. */
function utf8Length(value: string): number {
	return new TextEncoder().encode(value).length;
}

// Labels of letters, digits and inner hyphens; at least two; the last not all
// digits: the backend's rule (app/core/network.py, _valid_server_name).
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

export function validServerName(name: string): boolean {
	if (!HOSTNAME.test(name)) return false;
	return !/^\d+$/.test(name.slice(name.lastIndexOf('.') + 1));
}

export interface JoinForm {
	ssid: string;
	security: WifiSecurity;
	password: string;
	identity: string;
	serverName: string;
	anonymousIdentity: string;
}

/**
 * The refusal codes the form can find before anything is sent: those of the
 * backend's join_problems (app/core/network.py), in its order, for what the
 * form can hold. method_required and inner_method_invalid cannot arise,
 * since the form always sends a method and, for PEAP, MSCHAPv2.
 */
export function joinFormProblems(form: JoinForm): string[] {
	const codes: string[] = [];
	if (!form.ssid || utf8Length(form.ssid) > 32 || LINE_BREAK.test(form.ssid)) codes.push('ssid_invalid');
	if (form.security === 'password') {
		if (!form.password) codes.push('password_required');
		else if (CONTROL_CHARACTER.test(form.password)) codes.push('password_invalid');
		else if (utf8Length(form.password) < 8 || utf8Length(form.password) > 63) codes.push('password_length');
	} else if (form.security === 'enterprise') {
		if (!form.password) codes.push('password_required');
		else if (LINE_BREAK.test(form.password)) codes.push('password_invalid');
		if (!form.identity) codes.push('identity_required');
		else if (LINE_BREAK.test(form.identity)) codes.push('identity_invalid');
		if (form.anonymousIdentity && LINE_BREAK.test(form.anonymousIdentity)) codes.push('anonymous_identity_invalid');
		if (!form.serverName) codes.push('server_name_required');
		else if (!validServerName(form.serverName)) codes.push('server_name_invalid');
	}
	return codes;
}

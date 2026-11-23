// The first-run wizard's two direct calls to the backend (NEH-336). On the
// unit the page is served from http://localhost through nginx, and nginx
// never forwards a request the backend counts as local. The wizard therefore
// asks the backend at its own address, port 8000 of the same host, with no
// credentials: GET /auth/setup/status says whether the request is local, and
// a local POST /auth/register creates the first administrator without the
// bootstrap token. The backend allows these two cross-origin calls from
// http://localhost and http://127.0.0.1 only, never with credentials, so the
// address is formed only for a page opened under one of those two names;
// from a LAN name or another device there is no direct address, and every
// failure of the direct status call counts as "not local". The registration
// sets no session: the wizard signs in through the normal API afterwards.
//
// No Svelte or SvelteKit imports, so the module runs in the Node test project.

import type { Locale } from './i18n';

export const DIRECT_BACKEND_PORT = 8000;
const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1']);
// The status route answers at once; a direct call nobody answers is not local.
export const LOCAL_CHECK_TIMEOUT_MS = 3000;
// A registration with no complete answer by then ends as a FirstRunTimeout:
// the account may or may not exist, and the wizard asks the status to find out.
export const REGISTER_TIMEOUT_MS = 30_000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The backend's direct address for a page opened as `hostname`, or null when there is none. */
export function directBackendBase(hostname: string): string | null {
	return LOOPBACK_NAMES.has(hostname) ? `http://${hostname}:${DIRECT_BACKEND_PORT}` : null;
}

/** Whether the backend, asked directly at `base`, counts this browser as the unit's own screen. */
export async function isLocalUnit(
	base: string | null,
	fetchImpl: FetchLike = fetch,
	timeoutMs = LOCAL_CHECK_TIMEOUT_MS
): Promise<boolean> {
	if (!base) return false;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(`${base}/auth/setup/status`, {
			credentials: 'omit',
			signal: controller.signal
		});
		if (!response.ok) return false;
		const body = (await response.json()) as { local?: unknown };
		return body?.local === true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

/** A refused direct registration: the HTTP status, and the detail as the backend sent it. */
export class FirstRunError extends Error {
	status: number;
	detail?: unknown;
	constructor(status: number, message: string, detail?: unknown) {
		super(message);
		this.name = 'FirstRunError';
		this.status = status;
		this.detail = detail;
	}
}

/** A direct registration with no complete answer in time. */
export class FirstRunTimeout extends Error {
	constructor() {
		super('No answer from the unit');
		this.name = 'FirstRunTimeout';
	}
}

export interface FirstAccount {
	username: string;
	password: string;
	email: string | null;
	default_language: Locale;
}

/** Create the first administrator at the unit's direct address; returns the user. */
export async function registerAtUnit<T = unknown>(
	base: string,
	account: FirstAccount,
	fetchImpl: FetchLike = fetch,
	timeoutMs = REGISTER_TIMEOUT_MS
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let response: Response;
	let body: unknown;
	try {
		response = await fetchImpl(`${base}/auth/register`, {
			method: 'POST',
			credentials: 'omit',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(account),
			signal: controller.signal
		});
		body = await response.json().catch((error) => {
			if (controller.signal.aborted) throw error;
			return null;
		});
	} catch (error) {
		if (controller.signal.aborted) throw new FirstRunTimeout();
		throw error;
	} finally {
		clearTimeout(timer);
	}
	if (!response.ok) {
		const detail = (body as { detail?: unknown } | null)?.detail;
		const structured = typeof detail === 'object' && detail !== null;
		const message = structured
			? String((detail as { message?: unknown }).message ?? JSON.stringify(detail))
			: String(detail ?? `HTTP ${response.status}`);
		throw new FirstRunError(response.status, message, structured ? detail : undefined);
	}
	return body as T;
}

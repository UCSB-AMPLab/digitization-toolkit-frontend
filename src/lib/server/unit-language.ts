// The unit's language for server-side rendering (NEH-336). A page with no
// language cookie, and the login page always, is rendered in the language
// the unit's administrator chose, which GET /auth/setup/status reports
// without a session. The answer is kept for a short time so that not every
// request asks for it; concurrent requests share one read. A failed read
// gives the last language read, or Spanish before any read, and is asked
// again after the same time.

import { DEFAULT_LOCALE, isLocale, type Locale } from '$lib/i18n';

export const UNIT_LANGUAGE_TTL_MS = 30_000;
// The status route answers at once; a page waits no longer than this for it.
export const UNIT_LANGUAGE_TIMEOUT_MS = 2_000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createUnitLanguage(options: {
	url: string | (() => string);
	fetchImpl?: FetchLike;
	ttlMs?: number;
	timeoutMs?: number;
	now?: () => number;
}): () => Promise<Locale> {
	const {
		fetchImpl = fetch,
		ttlMs = UNIT_LANGUAGE_TTL_MS,
		timeoutMs = UNIT_LANGUAGE_TIMEOUT_MS,
		now = Date.now
	} = options;
	const urlOf = typeof options.url === 'function' ? options.url : () => options.url as string;
	let known: Locale = DEFAULT_LOCALE;
	let readAt = -Infinity;
	let pending: Promise<Locale> | null = null;

	async function read(): Promise<Locale> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchImpl(urlOf(), { signal: controller.signal });
			if (response.ok) {
				const body = (await response.json()) as { default_language?: unknown };
				if (isLocale(body?.default_language)) known = body.default_language;
			}
		} catch {
			// The last language read stays.
		} finally {
			clearTimeout(timer);
			readAt = now();
		}
		return known;
	}

	return () => {
		if (now() - readAt < ttlMs) return Promise.resolve(known);
		if (!pending) pending = read().finally(() => (pending = null));
		return pending;
	};
}

/** The language a page is rendered in: the unit's on the login page and with no cookie, else the cookie's. */
export async function pickLocale(
	pathname: string,
	cookie: Locale | null,
	unitLanguage: () => Promise<Locale>
): Promise<Locale> {
	const isLogin = pathname === '/login' || pathname.startsWith('/login/');
	if (cookie && !isLogin) return cookie;
	return unitLanguage();
}

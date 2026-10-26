// i18n — a typed message catalogue without a framework (NEH-93).
//
//   - `es.ts` is the source catalogue; `Messages = typeof es` forces every
//     catalogue to have exactly the same keys.
//   - The language is set ONCE per page load: the server reads it from the
//     cookie in `hooks.server.ts`, passes it through `+layout.server.ts`, and
//     the root layout sets it in the `locale` store. Switching language
//     (`setLanguage`) writes the cookie and reloads the whole page, so there
//     is no reactive language re-render mid-session.
//   - Components use the derived store `m`: `{$m.login_submit}`.
//
// SSR: `locale` is a module-level store, so on the server it is state shared
// between concurrent requests. This is deliberate: the toolkit is a
// single-session kiosk and the language is set at the start of each render.
// A concurrent multi-user deployment would need Svelte context instead.
//
// Version: 0.1.0-beta

import { derived, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { es } from './es';
import { en } from './en';

export type Messages = typeof es;
export type Locale = 'es' | 'en';

/**
 * Catalogue keys whose value is a plain string (no parameters). Use it when a
 * key is stored as data (e.g. NAV_ITEMS), so that an entry with parameters
 * (a function) cannot end up where plain text is expected.
 */
export type StringMessageKey = {
	[K in keyof Messages]: Messages[K] extends string ? K : never;
}[keyof Messages];

export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'captua_locale';
// Written by releases before 0.1.0; read as a fallback so that a language
// chosen then still applies, and never written.
export const LEGACY_LOCALE_COOKIE = 'dtk_locale';

const catalogs: Record<Locale, Messages> = { es, en };

export function isLocale(value: unknown): value is Locale {
	return value === 'es' || value === 'en';
}

/** Language from the cookies: the current name first, then the old one. */
export function localeFromCookies(get: (name: string) => string | undefined): Locale {
	const current = get(LOCALE_COOKIE);
	if (isLocale(current)) return current;
	const legacy = get(LEGACY_LOCALE_COOKIE);
	return isLocale(legacy) ? legacy : DEFAULT_LOCALE;
}

/** Active language for this page load. The root layout sets it. */
export const locale = writable<Locale>(DEFAULT_LOCALE);

/** Active catalogue: `{$m.login_submit}` in components. */
export const m = derived(locale, (l) => catalogs[l]);

/**
 * Translated label for a role: `{$roleLabel(member.role)}`.
 *
 * The backend sends the enum in English (admin/operator/reviewer, with a
 * CHECK constraint in the database), and it must not be shown raw (NEH-183).
 * The mapping lives here rather than in each page so that copies cannot fall
 * out of sync when a role or a key changes.
 *
 * Returns the raw value for an unknown role — better than hiding a new role
 * the backend already emits — and a dash when there is none. The badge CSS
 * classes still use the raw value.
 */
export const roleLabel = derived(
	m,
	($m) =>
		(role: string | null | undefined): string => {
			if (!role) return '—';
			const labels: Record<string, string> = {
				admin: $m.role_admin,
				operator: $m.role_operator,
				reviewer: $m.role_reviewer
			};
			return labels[role] ?? role;
		}
);

/**
 * Cookie strings for a language. The old name is written too, with the same
 * value and attributes, so that a rollback to a build that reads only
 * `dtk_locale` shows the language last chosen.
 */
export function localeCookies(next: Locale): string[] {
	return [LOCALE_COOKIE, LEGACY_LOCALE_COOKIE].map(
		(name) => `${name}=${next}; path=/; max-age=31536000; samesite=lax`
	);
}

/**
 * Switches language: stores the cookie (1 year) and reloads the page so that
 * SSR renders everything again in the new language. With `to`, the page loads
 * that address instead of reloading, for a caller that is leaving the page
 * anyway: a client-side navigation would keep the old language, since the
 * server only reads the cookie on a full load.
 */
export function setLanguage(next: Locale, to?: string) {
	if (!browser) return;
	for (const cookie of localeCookies(next)) document.cookie = cookie;
	if (to) location.assign(to);
	else location.reload();
}

import type { Handle } from '@sveltejs/kit';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '$lib/i18n';

// Reads the locale from the cookie on every request so that SSR renders the
// page in the right language from the first paint, with no flash of the other
// language. The value reaches the components through locals →
// +layout.server.ts → store.
export const handle: Handle = async ({ event, resolve }) => {
	const raw = event.cookies.get(LOCALE_COOKIE);
	event.locals.locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};

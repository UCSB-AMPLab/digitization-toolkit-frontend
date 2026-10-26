import type { Handle } from '@sveltejs/kit';
import { localeFromCookies } from '$lib/i18n';

// Reads the locale from the cookie on every request so that SSR renders the
// page in the right language from the first paint, with no flash of the other
// language. The value reaches the components through locals →
// +layout.server.ts → store.
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.locale = localeFromCookies((name) => event.cookies.get(name));
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};

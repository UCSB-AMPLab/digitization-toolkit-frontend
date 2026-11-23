// Version: 0.1.0-beta

import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { cookieLocale } from '$lib/i18n';
import { resolveApiBase } from '$lib/api-base';
import { createUnitLanguage, pickLocale } from '$lib/server/unit-language';

// The unit's language, kept for a short time (src/lib/server/unit-language.ts).
const unitLanguage = createUnitLanguage({
	url: () => `${resolveApiBase(false, env)}/auth/setup/status`
});

// Picks the locale on every request so that SSR renders the page in the
// right language from the first paint, with no flash of the other language:
// the cookie's, or the unit's when there is no cookie and on the login page,
// which is shown in the unit's language whoever signed in last. The value
// reaches the components through locals → +layout.server.ts → store.
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.locale = await pickLocale(
		event.url.pathname,
		cookieLocale((name) => event.cookies.get(name)),
		unitLanguage
	);
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};

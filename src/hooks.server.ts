import type { Handle } from '@sveltejs/kit';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '$lib/i18n';

// Lee el idioma de la cookie en cada request para que el SSR renderice la
// página en el idioma correcto desde el primer paint (sin flash de idioma).
// El valor viaja a los componentes vía locals → +layout.server.ts → store.
export const handle: Handle = async ({ event, resolve }) => {
	const raw = event.cookies.get(LOCALE_COOKIE);
	event.locals.locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.locale)
	});
};

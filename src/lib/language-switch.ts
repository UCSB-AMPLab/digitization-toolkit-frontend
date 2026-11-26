// Changing the language of a signed-in page (NEH-336). The server renders a
// page in the cookie's language, so a change shows fully only after a full
// load. Every reload a signed-in page asks for to change the language goes
// through switchLanguage: it reloads (or loads `to`) only when this browser
// kept the signed-in user (authStore.isStored); otherwise it writes the
// cookie, sets the language in memory, and with `to` goes there without a
// reload. A full load without a stored user would also find the session,
// because the route guards ask /users/me with the session cookie
// (stores/session.ts, NEH-415); switchLanguage still does not reload then.
//
// Version: 0.4.0

import { goto } from '$app/navigation';
import { locale, setLanguage, storeLanguage, type Locale } from './i18n';
import { authStore } from './stores/auth';

export function switchLanguage(next: Locale, to?: string): void {
	if (authStore.isStored()) {
		if (to) setLanguage(next, to);
		else setLanguage(next);
		return;
	}
	storeLanguage(next);
	locale.set(next);
	document.documentElement.lang = next;
	if (to) goto(to);
}

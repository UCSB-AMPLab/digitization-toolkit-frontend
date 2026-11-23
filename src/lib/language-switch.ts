// Changing the language of a signed-in page (NEH-336). The server renders a
// page in the cookie's language, so a change shows fully only after a full
// load, and a full load keeps the session only when this browser kept the
// signed-in user (authStore.isStored): the session cookie is httpOnly and
// the dashboard's guard starts from the stored user. Every reload a
// signed-in page asks for to change the language goes through
// switchLanguage: it reloads (or loads `to`) only when the stored user reads
// back; otherwise it writes the cookie, sets the language in memory, and with
// `to` goes there without a reload.

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

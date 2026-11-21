// A one-shot notice for the login page. The change-password dialog sets it
// when the backend has changed the person's own password (and ended every
// session of theirs); the login page shows it above the form and clears it
// when the page is left, so it is shown for that one visit. The login page
// reads it reactively, so a notice set while the page is already open, after
// a background 401 took the screen there first, still appears.

import { writable } from 'svelte/store';

export type LoginNotice = 'password_changed';

export const loginNotice = writable<LoginNotice | null>(null);

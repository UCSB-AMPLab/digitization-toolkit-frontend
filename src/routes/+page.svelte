<script lang="ts">
	// Root route: it only redirects and renders nothing. A saved user goes to
	// `/dashboard`, whose layout validates the session cookie against
	// `/users/me`. With no saved user the session is asked of `/users/me` once
	// (stores/session.ts, NEH-415): a 200 goes to `/dashboard`; a 401, or no
	// answer, goes to `/login`, which sends a unit with no account yet to the
	// first-run wizard (`/setup`). After a sign-out in this browser, until the
	// next sign-in, nothing is asked and it goes to `/login` (the sign-out
	// mark, stores/signed-out.ts). Left before the check is answered, it does
	// nothing.
	//
	// Version: 0.4.0

	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { checkSession } from '$lib/stores/session';

	// The check ends with the page: left before it is answered, the route
	// changes nothing.
	const sessionCheck = new AbortController();
	onDestroy(() => sessionCheck.abort());

	if (browser) {
		void checkSession({ wait: false, signal: sessionCheck.signal }).then((outcome) => {
			if (sessionCheck.signal.aborted) return;
			goto(outcome.kind === 'valid' ? '/dashboard' : '/login');
		});
	}
</script>

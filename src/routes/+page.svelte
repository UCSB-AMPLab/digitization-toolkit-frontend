<script lang="ts">
	// Root route: it only redirects and renders nothing. A stored user goes to
	// `/dashboard`, whose layout validates the session cookie against
	// `/users/me`; no stored user goes to `/login`, which sends a unit with no
	// account yet to the first-run wizard (`/setup`).
	//
	// Version: 0.3.0

	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { authStore } from '$lib/stores/auth';

	if (browser) {
		if (authStore.getUser()) {
			goto('/dashboard');
		} else {
			goto('/login');
		}
	}
</script>

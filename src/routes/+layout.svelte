<script lang="ts">
	// Version: 0.3.0

	import '../app.css';
	import favicon from '$lib/assets/brand/captua-favicon.svg';
	import GuidedTour from '$lib/components/GuidedTour.svelte';
	import { locale } from '$lib/i18n';
	import { onMount } from 'svelte';
	import { initErrorCapture } from '$lib/bug-report/error-capture';
	import { authApi } from '$lib/api';
	import { authStore } from '$lib/stores/auth';
	import { startSessionKeepalive } from '$lib/session-keepalive';

	let { children, data } = $props();

	// Syncs the locale store with the cookie the server read. The language
	// changes only on a full reload (see `setLanguage` in `$lib/i18n`), so
	// setting it once per load is enough.
	locale.set(data.locale);
	onMount(() => {
		initErrorCapture();
	});

	// Renews the session while someone uses the interface (NEH-355). Here
	// rather than in the dashboard layout so that every signed-in page has it,
	// the capture screen (/live-preview) included, which is outside that layout.
	onMount(() =>
		startSessionKeepalive({
			target: window,
			renew: () => authApi.refreshSession(),
			isSignedIn: () => authStore.isAuthenticated()
		})
	);
</script>

<svelte:head>
	<!-- Green on a light browser theme, ivory on a dark one (the SVG's own
       prefers-color-scheme rule). -->
	<link rel="icon" type="image/svg+xml" href={favicon} />
</svelte:head>

{@render children?.()}

<!-- The guided tour is mounted here, once, so that it survives route
     changes: its steps live on three different screens (NEH-95). -->
<GuidedTour />

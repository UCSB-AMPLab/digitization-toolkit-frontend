<script lang="ts">
  // Version: 0.1.0-beta

  import '../app.css';
  import favicon from '$lib/assets/brand/captua-favicon.svg';
  import GuidedTour from '$lib/components/GuidedTour.svelte';
  import { locale } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { initErrorCapture } from '$lib/bug-report/error-capture';

  let { children, data } = $props();

  // Syncs the locale store with the cookie the server read. The language
  // changes only on a full reload (see `setLanguage` in `$lib/i18n`), so
  // setting it once per load is enough.
  locale.set(data.locale);
  onMount(() => { initErrorCapture(); });
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



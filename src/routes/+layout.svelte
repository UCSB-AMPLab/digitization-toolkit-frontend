<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
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
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}

<!-- The guided tour is mounted here, once, so that it survives route
     changes: its steps live on three different screens (NEH-95). -->
<GuidedTour />



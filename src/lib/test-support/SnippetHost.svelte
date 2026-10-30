<script lang="ts">
  // Renders a snippet outside the component that made it, so that a test
  // can mount what a page puts in a slot without the layout that renders it
  // (the volume top bar's actions). Used by tests only.
  //
  // Version: 0.2.0

  import type { Snippet } from 'svelte';

  let { snippet }: { snippet: Snippet } = $props();
</script>

{@render snippet()}

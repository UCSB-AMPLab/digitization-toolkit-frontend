<script lang="ts">
  // The pill of a missing record (NEH-317): "Closed" in grey when it was
  // closed without capturing, "Opening not captured" in sand for a
  // placeholder (missing_side 'both'), "Page not captured" in sand for a
  // record missing one page. Nothing for any other record. The grid tile,
  // the spread and the gallery's modal draw it.
  //
  // Version: 0.3.3

  import { m } from '$lib/i18n';
  import type { Record } from '$lib/api';

  let { record }: { record: Pick<Record, 'missing_side' | 'closed_reason'> } = $props();
</script>

{#if record.missing_side != null && record.closed_reason}
  <span class="status-badge missing-pill is-closed">{$m.pill_closed}</span>
{:else if record.missing_side === 'both'}
  <span class="status-badge missing-pill">{$m.pill_opening_missing}</span>
{:else if record.missing_side != null}
  <span class="status-badge missing-pill">{$m.pill_page_missing}</span>
{/if}

<style>
  .missing-pill { color: var(--color-warning); }
  .missing-pill.is-closed { color: var(--color-light-grey); }
</style>

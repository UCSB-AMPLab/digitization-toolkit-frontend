<script lang="ts">
  // Version: 0.1.0-beta

  import type { Record as ApiRecord } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { formatCount } from '$lib/format-count';

  // variant 'bar'    → legend in its own strip (grid and book view)
  // variant 'inline' → the legend only, to sit inside an existing bar
  let { records, variant = 'bar' }: {
    records: ApiRecord[];
    variant?: 'bar' | 'inline';
  } = $props();

  // captured leads, because that is the order the work moves in: the
  // operator's own, then handed over, then ruled on (NEH-260).
  const statusKeys = ['captured', 'in_review', 'rejected', 'approved'] as const;
  type S = ApiRecord['status'];

  let labels = $derived<{ [K in S]: string }>({
    captured:  $m.status_captured_plural,
    in_review: $m.status_in_review,
    rejected:  $m.status_rejected_plural,
    approved:  $m.status_approved_plural,
  });

  // Total records in the volume: shown with each count so that the number
  // reads as a proportion.
  let total = $derived(records.length);

  let counts = $derived(
    statusKeys.reduce((acc, s) => {
      acc[s] = records.filter(r => r.status === s).length;
      return acc;
    }, {} as { [K in S]: number })
  );

</script>

<div class="status-bar-wrapper" class:inline={variant === 'inline'}>
  <div class="status-bar-legend">
    {#each statusKeys as s}
      {#if counts[s] > 0}
        <div class="status-bar-item">
          <div class="status-bar-dot seg-{s}"></div>
          <span>{labels[s]}: {formatCount(counts[s], $locale)} / {formatCount(total, $locale)}</span>
        </div>
      {/if}
    {/each}
    {#if records.length === 0}
      <span class="status-bar-item">{$m.col_no_records}</span>
    {/if}
  </div>
</div>

<style>
  /* In the inline variant the component has no box of its own: it takes the
     alignment of the bar that contains it. */
  .status-bar-wrapper.inline {
    padding: 0;
    border: none;
    background: none;
  }
</style>

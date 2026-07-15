<script lang="ts">
  import type { Record as ApiRecord } from '$lib/api';
  import { m } from '$lib/i18n';

  let { records }: { records: ApiRecord[] } = $props();

  const statusKeys = ['captured', 'in_review', 'rejected', 'approved'] as const;
  type S = ApiRecord['status'];

  let labels = $derived<{ [K in S]: string }>({
    captured:  $m.status_captured_plural,
    in_review: $m.status_in_review,
    rejected:  $m.status_rejected_plural,
    approved:  $m.status_approved_plural,
  });

  let counts = $derived(
    statusKeys.reduce((acc, s) => {
      acc[s] = records.filter(r => r.status === s).length;
      return acc;
    }, {} as { [K in S]: number })
  );

  let total = $derived(records.length || 1); // avoid div by 0
</script>

<div class="status-bar-wrapper">
  <div class="status-bar-track">
    {#each statusKeys as s}
      {#if counts[s] > 0}
        <div
          class="status-bar-segment seg-{s}"
          style="--seg-width: {(counts[s] / total * 100).toFixed(1)}%"
        ></div>
      {/if}
    {/each}
  </div>
  <div class="status-bar-legend">
    {#each statusKeys as s}
      {#if counts[s] > 0}
        <div class="status-bar-item">
          <div class="status-bar-dot seg-{s}"></div>
          <span>{labels[s]}: {counts[s]}</span>
        </div>
      {/if}
    {/each}
    {#if records.length === 0}
      <span class="status-bar-item">{$m.col_no_records}</span>
    {/if}
  </div>
</div>

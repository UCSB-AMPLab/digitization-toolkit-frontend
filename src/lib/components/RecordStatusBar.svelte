<script lang="ts">
  import type { Record } from '$lib/api';

  let { records }: { records: Record[] } = $props();

  const statusKeys = ['captured', 'in_review', 'rejected', 'approved'] as const;
  type S = typeof statusKeys[number];

  const labels: Record<S, string> = {
    captured:  'Capturados',
    in_review: 'En revisión',
    rejected:  'Rechazados',
    approved:  'Aprobados',
  };

  let counts = $derived(
    statusKeys.reduce((acc, s) => {
      acc[s] = records.filter(r => r.status === s).length;
      return acc;
    }, {} as Record<S, number>)
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
      <span class="status-bar-item">Sin registros</span>
    {/if}
  </div>
</div>

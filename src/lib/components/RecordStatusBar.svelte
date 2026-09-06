<script lang="ts">
  import type { Record as ApiRecord } from '$lib/api';
  import { m } from '$lib/i18n';

  // variant 'bar'    → leyenda en su propia franja (grid y vista de libro)
  // variant 'inline'  → sólo la leyenda, para meterla en una barra existente
  let { records, variant = 'bar' }: {
    records: ApiRecord[];
    variant?: 'bar' | 'inline';
  } = $props();

  const statusKeys = ['in_review', 'rejected', 'approved'] as const;
  type S = ApiRecord['status'];

  let labels = $derived<{ [K in S]: string }>({
    in_review: $m.status_in_review,
    rejected:  $m.status_rejected_plural,
    approved:  $m.status_approved_plural,
  });

  // Total de registros del volumen: acompaña a cada conteo para que el número
  // se lea como proporción. Es la información que antes daba la barra de
  // segmentos, ahora en texto.
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
          <span>{labels[s]}: {counts[s]} / {total}</span>
        </div>
      {/if}
    {/each}
    {#if records.length === 0}
      <span class="status-bar-item">{$m.col_no_records}</span>
    {/if}
  </div>
</div>

<style>
  /* En variante inline el componente no aporta caja propia: hereda la
     alineación de la barra que lo contiene. */
  .status-bar-wrapper.inline {
    padding: 0;
    border: none;
    background: none;
  }
</style>

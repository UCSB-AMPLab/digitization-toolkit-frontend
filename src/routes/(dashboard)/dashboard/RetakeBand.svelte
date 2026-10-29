<script lang="ts">
  // ============================================================================
  // The Resumen's recapture band and "Volúmenes con recapturas" (0.2.0), from
  // GET /records/to-retake/summary, which the page loads. Nothing is drawn
  // while no record is pending. The band counts the page pairs and the
  // volumes, names the volume with most pending, and starts its retakes;
  // the list gives each volume its pending count and a Recapturar that opens
  // the capture screen on its first pending record. The links are for the
  // roles that can capture (`canRetake`).
  // ============================================================================
  //
  // Version: 0.2.0

  import type { RetakeSummary } from '$lib/api';
  import { m } from '$lib/i18n';
  import { retakeUrl } from '$lib/queue';

  let { summary, canRetake }: { summary: RetakeSummary | null; canRetake: boolean } = $props();

  let shown = $derived(summary !== null && summary.pendingRecords > 0 && summary.volumes.length > 0);
  let most = $derived(summary?.volumes[0] ?? null);

  // Share of the volume's retakes already done, for its bar.
  function donePercent(pending: number, total: number): number {
    return total > 0 ? Math.max(0, Math.min(100, ((total - pending) / total) * 100)) : 0;
  }
</script>

{#if shown && summary && most}
  <section class="rb-band" aria-labelledby="rb-band-title">
    <svg class="rb-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
    </svg>
    <div class="rb-text">
      <h2 id="rb-band-title" class="rb-title">{$m.retake_band_title(summary.pendingRecords, summary.volumes.length)}</h2>
      <p class="rb-body">{$m.retake_band_body}</p>
      <p class="rb-most">{$m.retake_band_most(most.name, most.pending)}</p>
    </div>
    {#if canRetake}
      <a class="btn btn-recapture btn-lg rb-cta" href={retakeUrl(most.projectId, most.collectionId, most.firstPendingRecordId)}>
        {$m.retake_band_cta}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </a>
    {/if}
  </section>

  <section class="rb-vols" aria-labelledby="rb-vols-title">
    <h2 id="rb-vols-title" class="rb-vols-title">{$m.retake_vols_title}</h2>
    <ul class="rb-list">
      {#each summary.volumes as v (v.collectionId)}
        <li class="rb-row">
          <span class="rb-name">{v.name}</span>
          {#if v.filenameStem}<span class="rb-stem">{v.filenameStem}</span>{/if}
          <span class="rb-bar" aria-hidden="true"><span class="rb-bar-fill" style="width: {donePercent(v.pending, v.total)}%"></span></span>
          <span class="rb-pending">{$m.retake_pending_of(v.pending, v.total)}</span>
          {#if canRetake}
            <a class="btn btn-recapture-outline rb-row-cta" href={retakeUrl(v.projectId, v.collectionId, v.firstPendingRecordId)}>{$m.retake_cta}</a>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .rb-band {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px 24px;
    margin-bottom: 24px;
    padding: 28px 32px;
    border-radius: var(--radius-lg);
    border: 2px solid var(--color-highlight);
    background-color: rgba(225, 183, 120, 0.12);
  }
  .rb-icon { flex-shrink: 0; color: var(--color-highlight); }
  .rb-text { flex: 1; min-width: 16rem; display: flex; flex-direction: column; gap: 8px; }
  .rb-title { margin: 0; font-size: var(--text-h3); font-weight: var(--fw-extrabold); line-height: 1.2; color: var(--color-light); }
  .rb-body { margin: 0; font-size: var(--text-base); line-height: 1.5; color: var(--color-light); }
  .rb-most { margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); }
  .rb-cta { flex-shrink: 0; }

  .rb-vols { margin-bottom: 36px; display: flex; flex-direction: column; gap: 8px; }
  .rb-vols-title { margin: 0 0 4px; font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); }
  .rb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .rb-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    min-height: 56px;
    padding: 8px 16px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface);
  }
  .rb-name { min-width: 7rem; font-weight: var(--fw-bold); color: var(--color-light); }
  .rb-stem { min-width: 9rem; font-size: var(--text-xs); color: var(--color-light-grey); overflow-wrap: anywhere; }
  .rb-bar { flex: 1; min-width: 6rem; height: 6px; border-radius: var(--radius-full); background-color: var(--color-surface-alt-2); overflow: hidden; }
  .rb-bar-fill { display: block; height: 100%; border-radius: var(--radius-full); background-color: var(--color-highlight); }
  .rb-pending { min-width: 8rem; text-align: right; font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-highlight); font-variant-numeric: tabular-nums; }
  .rb-row-cta { padding: 8px 14px; font-size: var(--text-sm); }
</style>

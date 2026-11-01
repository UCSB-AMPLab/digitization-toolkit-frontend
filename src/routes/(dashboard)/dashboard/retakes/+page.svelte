<script lang="ts">
  // ============================================================================
  // Por recapturar (0.2.0): every pending record on the unit, across all
  // volumes, from GET /records/to-retake, the one rejected longest ago
  // first. Each row names the volume, the record, the reason with its gloss
  // (the nine reasons' text in $lib/rejectionReasons), the reviewer's
  // comment, and who rejected it when. A record prepared for retake shows
  // its rejection the same way. A record that misses a side (0.3.2,
  // `pendingReason` missing_side) has no rejection: its row says that a page
  // is missing and asks for the whole opening, in place of the reason.
  //
  // "Volver a capturar" takes the same path as the volume view's retake
  // buttons (NEH-209): the capture screen with the record's project, volume
  // and id, which opens that record's retake directly. A record with no
  // volume or project has no button.
  //
  // A select above the list narrows it to one volume, client-side. The volume
  // is kept in the query (?collectionId=), which the Cola page links to. The
  // select shows whenever the rows span two volumes or a volume is chosen, so
  // a filter can always be cleared.
  //
  // Openings and pages never captured (NEH-317). The backend orders the rows
  // by volume and then by sequence; the page groups them under a heading per
  // volume (name, stem, how many are pending), in that order. A placeholder
  // for a whole opening (missingSide 'both') shows its pill, what it should
  // hold and the note; a record missing one page shows its pill and which
  // page. Both offer "Capture", the same path as Volver a capturar, and a
  // button that opens the close dialog (CloseMissingDialog); a closed record
  // is taken off the list. Rejected rows are as before.
  // ============================================================================
  //
  // Version: 0.3.3

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { recordsApi, AuthError, type RecordToRetake } from '$lib/api';
  import CloseMissingDialog from '$lib/components/CloseMissingDialog.svelte';
  import { m, locale } from '$lib/i18n';
  import { userRole } from '$lib/stores/auth';
  import { formatApiDate } from '$lib/format-date';
  import { parseApiDate } from '$lib/pipeline';
  import { rejectionReasonText } from '$lib/rejectionReasons';
  import { retakeUrl } from '$lib/queue';

  // A retake fires the camera, so only admin and operator may start one, as
  // in the volume view (LeftSidebar.svelte).
  let canOperate = $derived($userRole === 'admin' || $userRole === 'operator');

  let rows = $state<RecordToRetake[] | null>(null);
  let loadError = $state(false);
  onMount(async () => {
    try {
      rows = await recordsApi.toRetake();
    } catch (err) {
      // A 401 is a dead session: apiRequest already sends the user to /login.
      if (err instanceof AuthError && err.status === 401) return;
      console.error('[Retakes] Error loading records to retake:', err);
      loadError = true;
    }
  });

  // The volume to show, from ?collectionId=; null shows every volume.
  let volumeId = $derived.by(() => {
    const raw = $page.url.searchParams.get('collectionId');
    return raw && Number.isInteger(Number(raw)) ? Number(raw) : null;
  });

  // One option per volume present in the rows, by name.
  let volumes = $derived.by(() => {
    const seen = new Map<number, RecordToRetake>();
    for (const row of rows ?? []) {
      if (row.collectionId != null && !seen.has(row.collectionId)) seen.set(row.collectionId, row);
    }
    return [...seen.values()].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', $locale, { numeric: true })
    );
  });

  let shownRows = $derived(volumeId === null ? rows : (rows ?? []).filter(r => r.collectionId === volumeId));

  // The shown rows by volume, in the order the backend gives (by volume,
  // then sequence); records in no volume form one group.
  let groups = $derived.by(() => {
    const out: { key: string; first: RecordToRetake; rows: RecordToRetake[] }[] = [];
    for (const row of shownRows ?? []) {
      const key = row.collectionId == null ? 'none' : String(row.collectionId);
      const group = out.find(g => g.key === key);
      if (group) group.rows.push(row);
      else out.push({ key, first: row, rows: [row] });
    }
    return out;
  });

  // The row whose close dialog is open.
  let closing = $state<RecordToRetake | null>(null);

  function handleClosed() {
    const id = closing?.recordId;
    closing = null;
    if (rows && id != null) rows = rows.filter(r => r.recordId !== id);
  }

  function chooseVolume(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    goto(value ? `?collectionId=${value}` : '?', { replaceState: true, keepFocus: true, noScroll: true });
  }

  function formatWhen(iso: string): string {
    return formatApiDate(iso, $locale, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function retake(row: RecordToRetake) {
    if (row.projectId == null || row.collectionId == null) return;
    goto(retakeUrl(row.projectId, row.collectionId, row.recordId));
  }
</script>

<div class="page">
  <div class="page-header">
    <h1 class="page-title">{$m.retakes_title}</h1>
    <p class="page-subtitle">{$m.retakes_subtitle}</p>
  </div>

  {#if loadError}
    <p class="notice is-error" role="status">{$m.retakes_load_error}</p>
  {:else if rows === null}
    <p class="notice" role="status">{$m.common_loading_ellipsis}</p>
  {:else if rows.length === 0}
    <p class="empty">{$m.retakes_empty}</p>
  {:else}
    {#if volumes.length > 1 || volumeId !== null}
      <label class="filter">
        <span class="filter-label">{$m.retakes_filter_volume_label}</span>
        <select class="filter-select" value={volumeId === null ? '' : String(volumeId)} onchange={chooseVolume}>
          <option value="">{$m.retakes_filter_all_volumes}</option>
          {#each volumes as v (v.collectionId)}
            <option value={String(v.collectionId)}>{v.name ?? '—'}{v.filenameStem ? ` ${v.filenameStem}` : ''}</option>
          {/each}
        </select>
      </label>
    {/if}
    {#if shownRows && shownRows.length === 0}
      <p class="empty">{$m.retakes_filter_empty}</p>
    {:else}
    {#each groups as group (group.key)}
    <section class="rt-group" aria-labelledby="rt-group-{group.key}">
    <h2 class="rt-volume" id="rt-group-{group.key}">
      {#if group.first.collectionId != null}
        <span class="rt-volume-name">{group.first.name ?? '—'}</span>
        {#if group.first.filenameStem}<span class="rt-stem">{group.first.filenameStem}</span>{/if}
        <span class="rt-count">{$m.retakes_volume_pending(group.rows.length)}</span>
      {:else}
        <span class="rt-no-volume">{$m.retakes_no_volume}</span>
      {/if}
    </h2>
    <ul class="retakes">
      {#each group.rows as row (row.recordId)}
        {@const reason = row.reason ? rejectionReasonText($m, row.reason) : null}
        {@const missing = row.pendingReason === 'missing_side'}
        <li class="rt-row">
          <div class="rt-main">
            <div class="rt-record">
              <span class="rt-title">{row.title}</span>
              {#if row.sequence != null}<span class="rt-sequence">{$m.retakes_sequence(row.sequence)}</span>{/if}
            </div>

            <div class="rt-reason">
              {#if missing && row.missingSide === 'both'}
                <span class="status-badge rt-pill-missing">{$m.pill_opening_missing}</span>
                {#if row.missingExpected}<span class="rt-gloss">{row.missingExpected}</span>{/if}
                {#if row.missingNote}<p class="rt-comment rt-note-missing"><span class="visually-hidden">{$m.retakes_comment_label}:</span> {row.missingNote}</p>{/if}
              {:else if missing}
                <span class="status-badge rt-pill-missing">{$m.pill_page_missing}</span>
                {#if row.missingSide === 'left' || row.missingSide === 'right'}
                  <span class="rt-gloss">{$m.retakes_page_missing_row(row.missingSide)}</span>
                {:else}
                  <span class="rt-missing">{$m.missing_page_reason}</span>
                {/if}
                {#if row.missingNote}<p class="rt-comment rt-note-missing"><span class="visually-hidden">{$m.retakes_comment_label}:</span> {row.missingNote}</p>{/if}
              {:else if reason}
                <span class="status-badge status-rejected rt-reason-label">{reason.label}</span>
                {#if reason.gloss}<span class="rt-gloss">{reason.gloss}</span>{/if}
              {:else}
                <span class="rt-gloss">{$m.retakes_no_reason}</span>
              {/if}
            </div>

            <!-- A missing side is not a rejection: an older rejection of
                 the record, if the backend sends one, is not shown with it. -->
            {#if row.comment && row.pendingReason !== 'missing_side'}
              <p class="rt-comment"><span class="visually-hidden">{$m.retakes_comment_label}:</span>{" "}{row.comment}</p>
            {/if}

            {#if row.rejectedAt && row.pendingReason !== 'missing_side'}
              {@const when = formatWhen(row.rejectedAt)}
              <time class="rt-when" datetime={parseApiDate(row.rejectedAt).toISOString()}>
                {row.rejectedBy ? $m.retakes_rejected_by(row.rejectedBy, when) : $m.retakes_rejected_on(when)}
              </time>
            {/if}
          </div>

          {#if canOperate && missing}
            <div class="rt-actions">
              <button class="btn btn-ghost ip-btn" onclick={() => (closing = row)}>
                {row.missingSide === 'both' ? $m.retakes_no_opening : $m.retakes_no_page}
              </button>
              {#if row.collectionId != null && row.projectId != null}
                <button class="btn ip-btn ip-btn-capture" onclick={() => retake(row)}>
                  <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">photo_camera</span>
                  <span>{$m.retakes_capture}</span>
                </button>
              {/if}
            </div>
          {:else if canOperate && row.collectionId != null && row.projectId != null}
            <div class="rt-actions">
              <button class="btn ip-btn ip-btn-capture" onclick={() => retake(row)}>
                <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">photo_camera</span>
                <span>{$m.retakes_retake}</span>
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    </section>
    {/each}
    {/if}
  {/if}
</div>

{#if closing}
  <CloseMissingDialog
    record={{ id: closing.recordId, missing_side: closing.missingSide }}
    onCancel={() => (closing = null)}
    onClosed={handleClosed}
  />
{/if}

<style>
  .page { padding: 32px; max-width: 1200px; }

  .page-header { margin-bottom: 24px; }
  .page-title    { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .notice { margin: 0 0 16px; font-size: var(--text-sm); color: var(--color-light-grey); }
  .notice.is-error { color: var(--color-error); }
  .empty { margin: 0; padding: 24px; border: 1px dashed var(--border-color); border-radius: var(--radius-md); color: var(--color-light-grey); font-size: var(--text-sm); }

  .filter { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .filter-label { font-size: var(--text-xs); font-weight: var(--fw-bold); letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-light-grey); }
  .filter-select {
    min-height: var(--touch-target-min);
    max-width: 100%;
    padding: 0 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface-alt-2);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: var(--text-sm);
  }

  .rt-group + .rt-group { margin-top: 24px; }
  .rt-volume { margin: 0 0 8px; font-size: var(--text-base); font-weight: var(--fw-regular); }
  .rt-count { font-size: var(--text-xs); color: var(--color-light-grey); font-variant-numeric: tabular-nums; }
  .rt-pill-missing { color: var(--color-warning); }
  .rt-note-missing { border-left-color: var(--color-warning); }
  .rt-actions { display: flex; flex-wrap: wrap; gap: 8px; }

  .retakes {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  .rt-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 24px;
    padding: 14px 16px;
  }
  .rt-row + .rt-row { border-top: 1px solid var(--border-color); }

  .rt-main { flex: 1 1 24rem; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .rt-volume { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
  .rt-volume-name { font-weight: var(--fw-bold); color: var(--color-light); overflow-wrap: anywhere; }
  .rt-no-volume { font-size: var(--text-sm); color: var(--color-light-grey); }
  .rt-stem { font-size: var(--text-xs); color: var(--color-light-grey); overflow-wrap: anywhere; }
  .rt-record { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: var(--text-sm); color: var(--color-light); }
  .rt-sequence { color: var(--color-light-grey); font-variant-numeric: tabular-nums; }
  .rt-reason { display: flex; flex-direction: column; gap: 2px; }
  .rt-gloss { font-size: var(--text-sm); line-height: 1.4; color: var(--color-light-grey); }
  .rt-missing { font-size: var(--text-sm); font-weight: var(--fw-bold); line-height: 1.4; color: var(--color-light); }
  .rt-comment {
    margin: 0;
    padding: 6px 10px;
    border-left: 3px solid var(--color-error);
    background-color: var(--color-surface-alt);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--color-light);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .rt-when { font-size: var(--text-xs); color: var(--color-light-grey); }

  /* The capture button of "Digitalizaciones en curso". */
  .ip-btn { padding: 8px 14px; font-size: var(--text-sm); background-color: transparent; }
  .ip-btn-capture { border-color: var(--color-primary); color: var(--color-primary); }
  .ip-btn-capture:hover,
  .ip-btn-capture:focus-visible { background-color: var(--color-primary); color: var(--color-light); }
</style>

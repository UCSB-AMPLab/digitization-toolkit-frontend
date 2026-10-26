<script lang="ts">
  // ============================================================================
  // Digitalizaciones en curso (NEH-233), with a board view.
  //
  // Tabla: the five most recently worked volumes, with direct access to
  // capture or review, plus an Avance column with each volume's status mix.
  // Tablero: every volume, in the column of its first unfinished stage
  // (placeVolume in $lib/pipeline).
  //
  // The page passes in the collections and projects it already loads for the
  // KPIs; this component loads the per-volume status counts itself from
  // GET /activity/collections.
  // ============================================================================
  //
  // Version: 0.1.0-beta

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { activityApi, AuthError, type Collection, type CollectionActivity, type Project } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { STORAGE_KEYS, readStored, writeStored } from '$lib/storage-keys';
  import { formatCount } from '$lib/format-count';
  import {
    PIPELINE_STAGES, barSegments, groupByStage, parseApiDate,
    type BarStatus, type PipelineStage
  } from '$lib/pipeline';

  let { collections, projects }: { collections: Collection[]; projects: Project[] } = $props();

  // ---------------------------------------------------------------------------
  // View switch, remembered per browser. Tabla is the default.
  // ---------------------------------------------------------------------------
  type View = 'board' | 'table';
  const VIEW_STORAGE_KEY = STORAGE_KEYS.inProgressView;

  function readView(): View {
    if (!browser) return 'table';
    return readStored(VIEW_STORAGE_KEY) === 'board' ? 'board' : 'table';
  }

  let view = $state<View>(readView());

  function setView(next: View) {
    view = next;
    if (!browser) return;
    // Storage unavailable (private mode, quota): the choice lasts for this
    // page only.
    writeStored(VIEW_STORAGE_KEY, next);
  }

  // ---------------------------------------------------------------------------
  // Status counts per volume
  // ---------------------------------------------------------------------------
  let activity = $state<CollectionActivity[] | null>(null);
  let activityError = $state<string | null>(null);

  onMount(async () => {
    try {
      activity = await activityApi.collections();
    } catch (err) {
      // A 401 is a dead session, not a failed load: apiRequest already
      // redirects to /login (NEH-64).
      if (err instanceof AuthError && err.status === 401) return;
      activityError = err instanceof Error ? err.message : String(err);
    }
  });

  let activityById = $derived(new Map((activity ?? []).map(a => [a.collection_id, a])));
  let projectNameById = $derived(new Map(projects.map(p => [p.id, p.name])));

  // ---------------------------------------------------------------------------
  // Tabla rows
  // ---------------------------------------------------------------------------
  const IN_PROGRESS_LIMIT = 5;

  type InProgressRow = {
    collectionId: number;
    projectId: number;
    volumeName: string;
    signatura: string;
    projectName: string;
    lastActivity: string;
  };

  // A volume is "in progress" when it has records: last_activity_at is null
  // exactly when nothing was ever captured in it (NEH-247). The model has no
  // volume status, so this is the signal there is.
  let inProgress = $derived<InProgressRow[]>(
    collections
      .filter(c => c.last_activity_at && c.project_id != null)
      .sort((a, b) => (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''))
      .slice(0, IN_PROGRESS_LIMIT)
      .map(c => ({
        collectionId: c.id,
        projectId:    c.project_id as number,
        volumeName:   c.name,
        // Only when the volume has one: inventing a signatura would be
        // exactly the problem in NEH-138.
        signatura:    (c.archival_metadata?.signatura as string | undefined) ?? '',
        projectName:  projectNameById.get(c.project_id as number) ?? '',
        lastActivity: c.last_activity_at as string,
      }))
  );

  // ---------------------------------------------------------------------------
  // Tablero cards: every volume the activity endpoint reports and the
  // collections list knows, empty volumes included. Volumes are top-level
  // collections; a nested one has project_id null and is left out on both
  // views, without walking up to its parent.
  // ---------------------------------------------------------------------------
  type BoardCard = CollectionActivity & { projectId: number; volumeName: string; projectName: string };

  let board = $derived.by(() => {
    const byId = new Map(collections.map(c => [c.id, c]));
    const cards: BoardCard[] = [];
    for (const a of activity ?? []) {
      const c = byId.get(a.collection_id);
      if (!c || c.project_id == null) continue;
      cards.push({
        ...a,
        projectId:   c.project_id,
        volumeName:  c.name,
        projectName: projectNameById.get(c.project_id) ?? '',
      });
    }
    return groupByStage(cards);
  });

  let stageText = $derived<{ [K in PipelineStage]: { title: string; desc: string } }>({
    capture:   { title: $m.dash_stage_capture,   desc: $m.dash_stage_capture_desc },
    recapture: { title: $m.dash_stage_recapture, desc: $m.dash_stage_recapture_desc },
    review:    { title: $m.dash_stage_review,    desc: $m.dash_stage_review_desc },
    approved:  { title: $m.dash_stage_approved,  desc: $m.dash_stage_approved_desc },
  });

  // Dot colour of each column: the status that keeps a volume there.
  const stageStatus: { [K in PipelineStage]: BarStatus } = {
    capture: 'captured', recapture: 'rejected', review: 'in_review', approved: 'approved',
  };

  let statusLabel = $derived<{ [K in BarStatus]: string }>({
    captured:  $m.status_captured_plural,
    rejected:  $m.status_rejected_plural,
    in_review: $m.status_in_review,
    approved:  $m.status_approved_plural,
  });

  // Both dates on the block, Tabla's last_activity_at (MAX(records.modified_at))
  // and the cards' last_status_change_at, arrive as naive UTC (see
  // parseApiDate), so they are read the same way and agree on the day.
  function formatDate(iso: string): string {
    return parseApiDate(iso).toLocaleDateString($locale, {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  function captureUrl(projectId: number, collectionId: number) {
    return `/live-preview?projectId=${projectId}&collectionId=${collectionId}`;
  }
  function volumeUrl(projectId: number, collectionId: number) {
    return `/dashboard/projects/${projectId}/collections/${collectionId}`;
  }
</script>

<!-- Stacked status bar. The bar is decorative; the counts are in the
     visually hidden text next to it. -->
{#snippet statusBar(a: CollectionActivity)}
  {@const segs = barSegments(a.status_counts)}
  <div class="pl-bar" aria-hidden="true">
    {#each segs as seg (seg.status)}
      <span class="pl-seg seg-{seg.status}" style="width: {seg.percent}%"></span>
    {/each}
  </div>
  {#if segs.length > 0}
    <span class="visually-hidden">
      {#each segs as seg, i (seg.status)}{statusLabel[seg.status]}: {formatCount(seg.count, $locale)}{i < segs.length - 1 ? ', ' : ''}{/each}
    </span>
  {/if}
{/snippet}

<!-- If no volume has records the block is not drawn: on a freshly installed
     unit there is nothing to list, and an empty table with headers tells
     nobody anything. -->
{#if inProgress.length > 0}
  <div class="section">
    <div class="ip-header">
      <h2 class="section-title">{$m.dash_in_progress}</h2>

      <div class="view-switch" role="group" aria-label={$m.dash_view_label}>
        <button type="button" class="view-btn" aria-pressed={view === 'board'} onclick={() => setView('board')}>
          {$m.dash_view_board}
        </button>
        <button type="button" class="view-btn" aria-pressed={view === 'table'} onclick={() => setView('table')}>
          {$m.dash_view_table}
        </button>
      </div>
    </div>

    {#if activityError}
      <p class="load-status is-error" role="status">{$m.dash_progress_load_error}: {activityError}</p>
    {/if}

    {#if view === 'table'}
      <div class="table-wrap">
        <div class="in-progress">
          <span class="ip-h">{$m.dash_col_volume}</span>
          <span class="ip-h">{$m.dash_col_project}</span>
          <span class="ip-h">{$m.dash_col_progress}</span>
          <span class="ip-h">{$m.dash_col_last_activity}</span>
          <span class="ip-h">{$m.dash_col_actions}</span>

          {#each inProgress as row (row.collectionId)}
            {@const a = activityById.get(row.collectionId)}
            <div class="ip-row">
              <a class="ip-volume" href={volumeUrl(row.projectId, row.collectionId)}>
                <span class="ip-volume-name">{row.volumeName}</span>
                {#if row.signatura}<span class="ip-signatura">{row.signatura}</span>{/if}
              </a>

              <a class="ip-project" href="/dashboard/projects/{row.projectId}"><span>{row.projectName}</span></a>

              <div class="ip-progress">
                {#if a}
                  {@render statusBar(a)}
                  <span class="pl-count">{$m.dash_records_count(a.record_count)}</span>
                {:else}
                  <span class="pl-count">—</span>
                {/if}
              </div>

              <span class="ip-date">{formatDate(row.lastActivity)}</span>

              <div class="ip-actions">
                <button class="btn ip-btn ip-btn-capture" onclick={() => goto(captureUrl(row.projectId, row.collectionId))}>
                  <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">photo_camera</span>
                  <span>{$m.col_live_preview}</span>
                </button>

                <button class="btn ip-btn ip-btn-review" onclick={() => goto(volumeUrl(row.projectId, row.collectionId))}>
                  <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">rate_review</span>
                  <span>{$m.tb_go_to_review}</span>
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if activity}
      <div class="board-wrap">
        <div class="board">
          {#each PIPELINE_STAGES as stage (stage)}
            {@const cards = board[stage]}
            <section class="board-col" aria-labelledby="stage-{stage}">
              <div class="col-head">
                <div class="col-title-row">
                  <span class="status-bar-dot seg-{stageStatus[stage]}" aria-hidden="true"></span>
                  <h3 id="stage-{stage}" class="col-title">{stageText[stage].title}</h3>
                  <span class="col-count" aria-hidden="true">{formatCount(cards.length, $locale)}</span>
                  <span class="visually-hidden">{$m.proj_collections_count(cards.length)}</span>
                </div>
                <p class="col-desc">{stageText[stage].desc}</p>
              </div>

              {#each cards as card (card.collection_id)}
                <article class="card" aria-labelledby="card-{card.collection_id}">
                  <div>
                    <h4 id="card-{card.collection_id}" class="card-name">
                      <a href={volumeUrl(card.projectId, card.collection_id)}>{card.volumeName}</a>
                    </h4>
                    <div class="card-project">{card.projectName}</div>
                  </div>

                  {@render statusBar(card)}

                  <div class="card-meta">
                    <span>{$m.dash_records_count(card.record_count)}</span>
                    {#if card.last_status_change_at}
                      <time datetime={parseApiDate(card.last_status_change_at).toISOString()}>{formatDate(card.last_status_change_at)}</time>
                    {:else}
                      <span>—</span>
                    {/if}
                  </div>

                  {#if stage === 'capture' || stage === 'recapture'}
                    <button
                      class="btn ip-btn ip-btn-capture card-btn"
                      aria-describedby="card-{card.collection_id}"
                      onclick={() => goto(captureUrl(card.projectId, card.collection_id))}
                    >
                      <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">photo_camera</span>
                      <span>{$m.col_live_preview}</span>
                    </button>
                  {:else if stage === 'review'}
                    <button
                      class="btn ip-btn ip-btn-review card-btn"
                      aria-describedby="card-{card.collection_id}"
                      onclick={() => goto(volumeUrl(card.projectId, card.collection_id))}
                    >
                      <span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">rate_review</span>
                      <span>{$m.tb_go_to_review}</span>
                    </button>
                  {/if}
                </article>
              {/each}
            </section>
          {/each}
        </div>
      </div>
    {:else if !activityError}
      <p class="load-status" role="status">{$m.common_loading_ellipsis}</p>
    {/if}
  </div>
{/if}

<style>
  /* Same values as .section / .section-title on the dashboard page. */
  .section { margin-bottom: 36px; }
  .section-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }

  .ip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px 16px;
    margin-bottom: 20px;
  }

  /* ── View switch ── */
  .view-switch {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-full);
    background-color: var(--color-surface-alt-2);
    border: 1px solid var(--border-color);
  }
  .view-btn {
    min-height: var(--touch-target-min);
    padding: 0 18px;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-light-grey);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
  }
  .view-btn:hover { color: var(--color-light); }
  .view-btn[aria-pressed='true'] {
    background-color: var(--color-light);
    color: var(--color-bg);
  }
  .view-btn:focus-visible {
    outline: 2px solid var(--color-primary-focus);
    outline-offset: 2px;
  }

  /* Same look as .capture-status on the dashboard page. */
  .load-status { margin: 0 0 16px; font-size: var(--text-sm); color: var(--color-light-grey); }
  .load-status.is-error { color: var(--color-error); }

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

  /* ── Stacked status bar ── */
  .pl-bar {
    display: flex;
    width: 100%;
    height: 8px;
    border-radius: var(--radius-full);
    overflow: hidden;
    background-color: var(--color-surface-alt-2);
  }
  .pl-seg { display: block; height: 100%; }
  /* The status colours of .status-badge.status-* in app.css. */
  .pl-seg.seg-captured  { background-color: var(--color-primary); }
  .pl-seg.seg-rejected  { background-color: var(--color-error); }
  .pl-seg.seg-in_review { background-color: var(--color-warning); }
  .pl-seg.seg-approved  { background-color: var(--color-success); }

  .pl-count { font-size: var(--text-sm); color: var(--color-light-grey); white-space: nowrap; }

  /* ── Tabla (NEH-233) ── */
  /* One grid for header and rows: each .ip-row is display:contents, so its
     cells are children of .in-progress and the columns are measured once for
     all of them. The last two columns are max-content: exactly as wide as the
     date and the buttons. */
  .in-progress {
    display: grid;
    grid-template-columns: minmax(12rem, 3fr) minmax(8rem, 2fr) minmax(8rem, 2fr) max-content max-content;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  /* Column spacing is padding, not gap: with gap the line between rows would
     break at the gaps. */
  .ip-h,
  .ip-row > * {
    display: flex;
    align-items: center;
    padding: 12px 24px 12px 0;
    min-width: 0;
  }
  .ip-h:first-of-type,
  .ip-row > *:first-child { padding-left: 16px; }
  .ip-h:last-of-type,
  .ip-row > *:last-child  { padding-right: 16px; }

  /* Same values as .list-header in the volume view. */
  .ip-h {
    background-color: var(--color-surface-alt);
    border-bottom: 1px solid var(--border-color);
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-light-grey);
  }

  .ip-row { display: contents; }
  .ip-row + .ip-row > * { border-top: 1px solid var(--border-color); }

  /* No text in the table wraps: what does not fit is cut with an ellipsis. */
  .ip-h,
  .ip-volume-name,
  .ip-signatura,
  .ip-project,
  .ip-date {
    white-space: nowrap;
  }

  /* The ellipsis only draws on a block box, and the cells are flex, so the
     cut goes on the inner element. That is why the project name is wrapped
     in a <span>. */
  .ip-volume-name,
  .ip-signatura,
  .ip-project > span {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .ip-project { overflow: hidden; }

  /* Volume and project navigate, so they look like links: the Pi's
     touchscreen has no hover to reveal it later (NEH-237). */
  .ip-volume,
  .ip-project { text-decoration: none; }

  .ip-volume {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
  }
  .ip-volume-name {
    color: var(--color-light);
    font-weight: var(--fw-bold);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(255,255,255,0.25);
  }
  .ip-signatura {
    font-size: var(--text-xs);
    line-height: 1.3;
    color: var(--color-light-grey);
  }

  .ip-project {
    color: var(--color-light-grey);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(255,255,255,0.2);
  }

  .ip-volume-name:hover,
  .ip-project:hover { text-decoration-color: currentColor; }

  .ip-progress {
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 6px;
  }

  .ip-date {
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--color-light-grey);
    font-variant-numeric: tabular-nums;
  }

  .ip-actions { gap: 8px; }

  /* They take shape, height and type from .btn, --radius-md included. Only
     the colour and a smaller text size here, because they repeat on every
     row. */
  .ip-btn {
    padding: 8px 14px;
    font-size: var(--text-sm);
    background-color: transparent;
  }

  .ip-btn-capture {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
  .ip-btn-capture:hover,
  .ip-btn-capture:focus-visible {
    background-color: var(--color-primary);
    color: var(--color-light);
  }

  /* Dark text on filled sand: --color-highlight is #E1B778, and the cream of
     --color-light on top would not read. */
  .ip-btn-review {
    border-color: var(--color-highlight);
    color: var(--color-highlight);
  }
  .ip-btn-review:hover,
  .ip-btn-review:focus-visible {
    background-color: var(--color-highlight);
    color: var(--color-bg);
  }

  /* Narrow: one column, no headers, each row as a block. Measured on the
     block's own width, which the sidebar narrows, not on the viewport. The
     five columns need about 51rem (814px in Chromium with Mulish and the
     icon font: 192 + 128 + 128 track minimums, 136 for the date, 228 for
     the two buttons); 54rem leaves room for longer dates and labels. */
  .table-wrap { container-type: inline-size; }
  @container (max-width: 54rem) {
    .in-progress { grid-template-columns: 1fr; }
    .ip-h { display: none; }

    .ip-row > * { padding: 3px 16px; }
    .ip-row > *:first-child { padding-top: 14px; }
    .ip-row > *:last-child  { padding-bottom: 14px; padding-right: 16px; }

    .ip-row + .ip-row > *:first-child { border-top: 1px solid var(--border-color); }
    .ip-row + .ip-row > *:not(:first-child) { border-top: none; }
  }

  /* ── Tablero ── */
  /* Four columns while there is room for them, two, then one. Measured on
     the block's own width, which the sidebar narrows, not on the viewport. */
  .board-wrap { container-type: inline-size; }
  .board {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    align-items: start;
  }
  @container (max-width: 60rem) {
    .board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @container (max-width: 32rem) {
    .board { grid-template-columns: minmax(0, 1fr); }
  }

  .board-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }

  .col-head { display: flex; flex-direction: column; gap: 4px; padding: 0 4px; }
  .col-title-row { display: flex; align-items: center; gap: 8px; }
  .col-title-row .status-bar-dot { width: 10px; height: 10px; }
  .col-title { margin: 0; font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light); }
  .col-count { margin-left: auto; font-weight: var(--fw-bold); color: var(--color-light-grey); font-variant-numeric: tabular-nums; }
  .col-desc { margin: 0; font-size: var(--text-sm); line-height: 1.4; color: var(--color-light-grey); }

  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: var(--radius-lg);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    min-width: 0;
  }
  .card-name {
    margin: 0;
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    overflow-wrap: anywhere;
  }
  .card-name a {
    color: var(--color-light);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(255,255,255,0.25);
  }
  .card-name a:hover { text-decoration-color: currentColor; }
  .card-project { font-size: var(--text-sm); color: var(--color-light-grey); overflow-wrap: anywhere; }
  .card-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    font-variant-numeric: tabular-nums;
  }
  .card-btn { width: 100%; }
</style>

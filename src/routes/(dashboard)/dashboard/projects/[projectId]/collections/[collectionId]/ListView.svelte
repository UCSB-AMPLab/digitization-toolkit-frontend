<script lang="ts">
  // List view of a volume's records: one row per record, with up to two
  // thumbnails (L/R badge on a two-camera capture), title, status, image
  // count and date. Rows can be dragged into a new order in reorder mode.
  //
  // A row click opens the record in book view (onRecordClick, handled by
  // the page), not in a modal.
  //
  // Version: 0.1.0-beta

  import { recordsApi, collectionsApi, type Record, type RecordImage } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { formatApiDate } from '$lib/format-date';
  import { formatCount } from '$lib/format-count';
  import { reorderErrorText } from '$lib/volume-refusals';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import RecordStatusBar from '$lib/components/RecordStatusBar.svelte';
  // @ts-ignore — installed in Docker, not locally
  import { dndzone } from 'svelte-dnd-action';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    records,
    collectionId = 0,
    onRecordClick,
    onRecordsUpdate,
    onReorderNotice,
  }: {
    records: Record[];
    collectionId?: number;
    onRecordClick: (record: Record) => void;
    onRecordsUpdate?: () => void;
    // Why the last drag was not saved, or null once one is saved.
    onReorderNotice?: (notice: string | null) => void;
  } = $props();

  // Local copy for DnD
  let localRecords = $state<Record[]>([]);
  $effect(() => { localRecords = [...records]; });

  function handleDndConsider(e: CustomEvent) { localRecords = e.detail.items; }

  async function handleDndFinalize(e: CustomEvent) {
    localRecords = e.detail.items;
    if (collectionId && onRecordsUpdate) {
      try {
        await collectionsApi.reorderRecords(collectionId, localRecords.map(r => r.id));
        onReorderNotice?.(null);
        onRecordsUpdate();
      } catch (err) {
        console.error('[ListView] Error reordering:', err);
        // The page holds the notice: the reload below unmounts this view.
        onReorderNotice?.(reorderErrorText(err, $m));
        onRecordsUpdate();
      }
    }
  }

  // Reorder mode (NEH-137). On the touch kiosk the gesture for scrolling the
  // list IS the drag gesture, so with dragging always live an operator
  // scrolling could silently reorder the pages of a volume — and record
  // order is the archival page order. Reordering therefore requires entering
  // an explicit mode, as in GridView.
  let isReorderMode = $state(false);

  function toggleReorderMode() {
    isReorderMode = !isReorderMode;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  function sortedImages(record: Record): RecordImage[] {
    const imgs = record.images ?? [];
    return [...imgs].sort((a, b) => {
      const order = (r?: string | null) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
      return order(a.role) - order(b.role) || a.id - b.id;
    });
  }

  function roleLabel(img: RecordImage): 'L' | 'R' | null {
    if (img.role === 'left')  return 'L';
    if (img.role === 'right') return 'R';
    return null;
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '—';
    return formatApiDate(dateStr, $locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  }
</script>

<div class="list-view">

  {#if records.length === 0}
    <div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
      <span>{$m.col_empty_collection}</span>
    </div>

  {:else}
    <!-- Reorder toggle and status counts. Unlike GridView there are no
         filters here to clear when reorder mode starts. -->
    <div class="list-toolbar">
      <div class="reorder-group">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          style="color: {isReorderMode ? 'var(--color-primary)' : 'var(--color-light-grey)'}; flex-shrink:0">
          <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
        </svg>
        <button class="reorder-btn" class:active={isReorderMode} onclick={toggleReorderMode}>
          {isReorderMode ? $m.col_reorder_done : $m.col_reorder}
        </button>
      </div>

      <RecordStatusBar {records} variant="inline" />
    </div>

    <div class="list-header">
      <span class="col-thumb">{$m.col_col_images}</span>
      <span class="col-title">{$m.col_col_title}</span>
      <span class="col-status">{$m.common_status}</span>
      <span class="col-count">{$m.col_col_captures}</span>
      <span class="col-date">{$m.pd_col_date}</span>
    </div>

    <div
      use:dndzone={{
        items: localRecords,
        dragDisabled: !isReorderMode,
        // Inside reorder mode a plain touch-scroll must still scroll: the drag
        // only starts if the finger is held down first.
        delayTouchStart: 200
      }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
    >
    {#each localRecords as record, i (record.id)}
      {@const imgs = sortedImages(record)}

      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="list-row"
        class:alt={i % 2 !== 0}
        onclick={() => onRecordClick(record)}
        role="button"
        tabindex="0"
      >

        <div class="col-thumb thumb-group">
          {#each imgs.slice(0, 2) as img}
            <div class="thumb-wrap">
              <img
                src={recordsApi.getImageThumbnailUrl(img.id)}
                alt={record.title}
                class="row-thumb"
                onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {#if roleLabel(img)}
                <span class="role-badge" class:right={roleLabel(img) === 'R'}>{roleLabel(img)}</span>
              {/if}
            </div>
          {/each}
          {#if imgs.length === 0}
            <div class="thumb-placeholder">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
          {/if}
        </div>

        <span class="col-title row-title">
          {record.title || $m.record_fallback_title(record.id)}
        </span>

        <span class="col-status">
          <StatusBadge status={record.status} />
        </span>

        <span class="col-count row-count">{formatCount(imgs.length, $locale)}</span>

        <span class="col-date row-date">{formatDate(record.created_at)}</span>

      </div>
    {/each}
    </div>
  {/if}

</div>

<style>
  .list-view {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 0 16px 16px;
  }

  .list-view::-webkit-scrollbar { width: 4px; }
  .list-view::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .empty-state {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--color-light-grey);
    opacity: 0.4;
    padding: 80px 0;
  }

  /* Reorder mode bar — same styles as in GridView (NEH-137) */
  .list-toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .reorder-group { display: flex; align-items: center; gap: 10px; }

  .reorder-btn {
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    background: none; border: none;
    cursor: pointer; padding: 4px 0;
    transition: color var(--transition-fast);
    white-space: nowrap; min-height: 0;
  }

  .reorder-btn:hover { color: var(--color-light); }
  .reorder-btn.active { color: var(--color-primary); }

  .list-header {
    display: grid;
    grid-template-columns: 160px 1fr 140px 80px 110px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-color);
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    position: sticky;
    top: 0;
    background-color: var(--color-bg);
    z-index: 1;
  }

  .list-row {
    display: grid;
    grid-template-columns: 160px 1fr 140px 80px 110px;
    align-items: center;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
    gap: 0;
  }

  .list-row:hover { background-color: rgba(255,255,255,0.04); }
  .list-row.alt   { background-color: rgba(255,255,255,0.015); }
  .list-row.alt:hover { background-color: rgba(255,255,255,0.05); }

  .thumb-group {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 2px 0;
  }

  .thumb-wrap {
    position: relative;
    width: 64px;
    height: 48px;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
  }

  .row-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .role-badge {
    position: absolute;
    bottom: 2px;
    left: 3px;
    background: rgba(0,0,0,0.75);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 9px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    line-height: 1.4;
  }
  .role-badge.right { left: auto; right: 3px; }

  .thumb-placeholder {
    width: 64px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light-grey);
    opacity: 0.3;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-sm);
  }

  .row-title {
    font-size: var(--text-sm);
    color: var(--color-light);
    padding-right: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-count {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    text-align: center;
  }

  .row-date {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
  }
</style>

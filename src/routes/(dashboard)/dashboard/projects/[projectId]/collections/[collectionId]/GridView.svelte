<script lang="ts">
  // Grid view of a volume's records, one card per record (an L/R pair shares
  // one card). The toolbar holds the status filter, renumber (numbers the
  // records from 1 in the current order, without renaming files), the
  // reorder mode toggle and the thumbnail size slider.
  //
  // Reordering drags with svelte-dnd-action. On drop, handleDndFinalize saves
  // the order with collectionsApi.reorderRecords; if the backend refuses it,
  // the notice goes up to +page.svelte and the list is reloaded from the
  // server, because the reload unmounts this view.

  import { recordsApi, collectionsApi, type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import { renumberErrorText, reorderErrorText } from '$lib/volume-refusals';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  // @ts-ignore — installed in Docker, not locally
  import { dndzone } from 'svelte-dnd-action';

  let {
    records,
    collectionId,
    onRecordsUpdate,
    onRecordClick,
    onReorderNotice,
    onRenumbered,
  }: {
    records: Record[];
    collectionId: number;
    onRecordsUpdate: () => void;
    // As in ListView, a click on a card (single or L/R pair) goes to the
    // book view (spread) of that record — the spread already shows L and R
    // together, so a pair needs no special handling.
    onRecordClick: (record: Record) => void;
    // Why the last drag was not saved, or null once one is saved.
    onReorderNotice?: (notice: string | null) => void;
    // How many records the backend renumbered, and in which volume. The
    // page shows it, because the reload that follows unmounts this view;
    // the volume lets it drop a result that lands after the operator left.
    onRenumbered?: (volumeId: number, count: number) => void;
  } = $props();

  // Local copy of records for DnD reordering
  let localRecords = $state<Record[]>([]);

  // Sync localRecords when records prop changes
  $effect(() => {
    localRecords = [...records];
  });

  // Thumbnail size, 2 (small) to 6 (large): this is what the slider sets.
  // Columns run the other way — more columns, smaller thumbnails — so they
  // are derived instead of bound to the control.
  let thumbSize = $state(4);
  let columns = $derived(8 - thumbSize);

  let isReorderMode = $state(false);

  let showFilterPanel   = $state(false);
  let activeStatusFilter = $state<string | null>(null);

  let showRenumberModal = $state(false);
  let renumbering       = $state(false);
  let renumberError     = $state<string | null>(null);

  // One GridGroup per record. A two-camera record (left + right) puts both
  // images in a single GridGroup — NEH-211: the L/R pair is wrapped in one
  // container instead of two separate cards, so it reads as one unit and
  // moves as one in reorder mode. A single-capture record gives a GridGroup
  // with one item. The role rule is the same as in ThumbnailStrip.svelte.
  interface GridItem {
    record: Record;
    image: RecordImage | null;
    role: 'L' | 'R' | null;
    thumbnailUrl: string | null;
  }

  interface GridGroup {
    record: Record;
    items: GridItem[];
  }

  function imageRole(img: RecordImage | null): 'L' | 'R' | null {
    if (!img) return null;
    if (img.role === 'left')  return 'L';
    if (img.role === 'right') return 'R';
    return null;
  }

  function gridItemsForRecord(record: Record): GridItem[] {
    if (!record.images || record.images.length === 0) {
      return [{ record, image: null, role: null, thumbnailUrl: null }];
    }
    // Left first, then right, then images without a role; id breaks ties.
    const sorted = [...record.images].sort((a, b) => {
      const order = (r?: string | null) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
      return order(a.role) - order(b.role) || a.id - b.id;
    });
    return sorted.map((img): GridItem => ({
      record,
      image: img,
      role: imageRole(img),
      thumbnailUrl: recordsApi.getImageThumbnailUrl(img.id),
    }));
  }

  function recordsToGridGroups(recs: Record[]): GridGroup[] {
    return recs.map((record): GridGroup => ({ record, items: gridItemsForRecord(record) }));
  }

  function toggleReorderMode() {
    isReorderMode = !isReorderMode;
    if (isReorderMode) {
      // Record order is the archival page order and reorderRecords() persists
      // the full collection sequence. dndzone's `items` must match the #each
      // exactly (svelte-dnd-action requirement), so reordering only ever
      // operates on the full, unfiltered list — a filtered subset would let
      // dndzone's indices drift from what's rendered and corrupt the
      // persisted sequence (NEH-83).
      activeStatusFilter = null;
      showFilterPanel = false;
    }
  }

  function handleDndConsider(e: CustomEvent) {
    localRecords = e.detail.items;
  }

  async function handleDndFinalize(e: CustomEvent) {
    localRecords = e.detail.items;
    try {
      await collectionsApi.reorderRecords(collectionId, localRecords.map(r => r.id));
      onReorderNotice?.(null);
      onRecordsUpdate();
    } catch (err) {
      console.error('[GridView] Error reordering:', err);
      // The page holds the notice: the reload below unmounts this view.
      onReorderNotice?.(reorderErrorText(err, $m));
      onRecordsUpdate(); // restore from server
    }
  }

  async function handleConfirmRenumber() {
    renumbering = true;
    renumberError = null;
    try {
      const volumeId = collectionId;
      const { renumbered } = await collectionsApi.renumberImages(volumeId);
      showRenumberModal = false;
      onRenumbered?.(volumeId, renumbered);
      onRecordsUpdate();
    } catch (err) {
      // The backend's English text goes to the console only.
      console.error('[GridView] Error renumbering:', err);
      renumberError = renumberErrorText(err, $m);
    } finally {
      renumbering = false;
    }
  }

  function handleCloseRenumberModal() {
    if (renumbering) return; // not while the renumber request is in flight
    showRenumberModal = false;
    renumberError = null;
  }
</script>

<div class="grid-view">

  <!-- ── TOOLBAR ── -->
  <div class="grid-toolbar">

    <div class="toolbar-left">
      <button
        class="toolbar-btn"
        disabled={isReorderMode}
        title={isReorderMode ? $m.col_filters_disabled_reorder : undefined}
        onclick={() => showFilterPanel = !showFilterPanel}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span>{$m.common_filters}</span>
      </button>

      <div class="toolbar-divider"></div>

      <button class="toolbar-btn" onclick={() => showRenumberModal = true}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="9" y1="20" x2="15" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
        <span>{$m.col_renumber}</span>
      </button>

      <div class="toolbar-divider"></div>

      <div class="reorder-group">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          style="color: {isReorderMode ? 'var(--color-primary)' : 'var(--color-light-grey)'}; flex-shrink:0">
          <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
        </svg>

        <button
          class="reorder-btn"
          class:active={isReorderMode}
          onclick={toggleReorderMode}
        >
          {isReorderMode ? $m.col_reorder_done : $m.col_reorder}
        </button>
      </div>
    </div>

    <div class="toolbar-right">
      <!--
        The slider sets SIZE, not columns: small thumbnails to the left, large
        to the right, which is what the person dragging it expects. Columns
        run the other way, so they are derived inverted (see `columns`).
      -->
      <input
        type="range"
        min="2"
        max="6"
        step="1"
        bind:value={thumbSize}
        class="columns-slider"
        title={$m.col_thumb_size}
        aria-label={$m.col_columns_aria}
      />
    </div>

  </div>

  {#if showFilterPanel}
    <div class="filter-panel">
      <span class="filter-title">{$m.col_filter_by_status}</span>
      <div class="filter-chips">
        {#each [
          { id: 'captured',   label: $m.status_captured },
          { id: 'approved',   label: $m.status_approved },
          { id: 'rejected',   label: $m.status_rejected },
          { id: 'in_review',  label: $m.status_in_review },
        ] as f}
      <button
            class="filter-chip"
            class:active={activeStatusFilter === f.id}
            onclick={() => activeStatusFilter = activeStatusFilter === f.id ? null : f.id}
          >
            {f.label}
          </button>
        {/each}
        {#if activeStatusFilter}
          <button class="filter-chip clear" onclick={() => activeStatusFilter = null}>{$m.col_clear_filter}</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if isReorderMode}
    <div
      class="image-grid reorder-mode"
      style="--grid-cols: {columns}"
      use:dndzone={{ items: localRecords, dragDisabled: false }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
    >
      {#each localRecords as record, i (record.id)}
        {@const items = gridItemsForRecord(record)}

        {#if items.length > 1}
          <!-- NEH-211: the L/R pair is dragged as one unit — the container
               that groups it in the normal view is also the single
               draggable element here, not two separate ones. -->
          <div class="grid-pair draggable" id="record-{record.id}">
            <div class="reorder-handle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8">
                <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
                <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
              </svg>
            </div>
            <div class="pair-thumbs">
              {#each items as item (item.image?.id ?? item.role)}
                <div class="card-image-wrapper reorder">
                  {@render thumbContent(item, record)}
                </div>
              {/each}
            </div>
            <div class="card-meta pair-meta">
              <span class="card-name pair-name" title={record.title}>{record.title || $m.col_image_n(i + 1)}</span>
              <div class="card-status-row"><StatusBadge status={record.status} /></div>
            </div>
          </div>
        {:else}
          {@const item = items[0]}
          <div class="grid-card draggable" id="record-{record.id}">
            <div class="reorder-handle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8">
                <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
                <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
              </svg>
            </div>
            <div class="card-image-wrapper reorder">
              {@render thumbContent(item, record)}
            </div>
            <div class="card-meta">
              <span class="card-name" title={record.title}>{record.title || $m.col_image_n(i + 1)}</span>
              <div class="card-status-row"><StatusBadge status={record.status} /></div>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else}
  <div
    class="image-grid"
    class:reorder-mode={isReorderMode}
    style="--grid-cols: {columns}"
  >
    {#each recordsToGridGroups(records.filter(r => !activeStatusFilter || r.status === activeStatusFilter)) as group, i (group.record.id)}
      {@const record = group.record}

      {#if group.items.length > 1}
        <!-- NEH-211: L/R pair wrapped in a single container -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="grid-pair" onclick={() => onRecordClick(record)} role="button" tabindex="0">
          <div class="pair-thumbs">
            {#each group.items as item (item.image?.id ?? item.role)}
              <div class="card-image-wrapper">
                {@render thumbContent(item, record)}
              </div>
            {/each}
          </div>

          <div class="card-meta pair-meta">
            <span class="card-name pair-name" title={record.title}>{record.title || $m.col_image_n(i + 1)}</span>
            <div class="card-status-row">
              <StatusBadge status={record.status} />
            </div>
          </div>
        </div>
      {:else}
        {@const item = group.items[0]}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="grid-card" onclick={() => onRecordClick(record)} role="button" tabindex="0">
          <div class="card-image-wrapper">
            {@render thumbContent(item, record)}
          </div>

          <div class="card-meta">
            <span class="card-name" title={record.title}>{record.title || $m.col_image_n(i + 1)}</span>
            <div class="card-status-row">
              <StatusBadge status={record.status} />
            </div>
          </div>
        </div>
      {/if}
    {/each}
  </div>
  {/if}

</div>

{#snippet thumbContent(item: GridItem, record: Record)}
  {#if item.thumbnailUrl}
    <img src={item.thumbnailUrl} alt="{record.title}{item.role ? ' ' + item.role : ''}" class="card-image" draggable="false" />
  {:else}
    <div class="card-placeholder">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    </div>
  {/if}

  {#if item.role}
    <div class="role-badge" class:right={item.role === 'R'}>{item.role}</div>
  {/if}
{/snippet}

{#if showRenumberModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) handleCloseRenumberModal(); }}>
    <div class="modal-card">
      <h3 class="modal-title">{$m.col_renumber_modal_title}</h3>
      <p class="modal-subtitle">{$m.col_renumber_desc}</p>
      {#if renumberError}
        <div class="modal-error-banner" role="alert" aria-live="polite">{renumberError}</div>
      {/if}
      <div class="modal-actions">
        {#if renumbering}
          <span class="modal-subtitle-sm">
            <span class="spin material-symbols-outlined icon-sm" style="display:inline-block">progress_activity</span>
            {$m.col_renumbering}
          </span>
        {:else}
          <button class="modal-btn cancel" onclick={handleCloseRenumberModal}>{$m.common_cancel}</button>
          <button class="modal-btn confirm" onclick={handleConfirmRenumber}>{$m.col_renumber}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .grid-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--color-bg);
  }

  /* ── TOOLBAR ── */
  .grid-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    height: 52px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--color-surface-alt);
    gap: 16px;
  }

  .toolbar-left { display: flex; align-items: center; gap: 4px; }
  .toolbar-right { display: flex; align-items: center; gap: 12px; }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    background: none; border: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-md);
    min-height: var(--touch-target-min);
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .toolbar-btn:hover { color: var(--color-light); background-color: rgba(255,255,255,0.05); }
  .toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .toolbar-btn:disabled:hover { color: var(--color-light-grey); background-color: transparent; }

  .toolbar-divider { width: 1px; height: 18px; background-color: var(--border-color); margin: 0 4px; }

  /* padding-left: 12px matches the left padding of .toolbar-btn (6px
     12px) — without it the hand icon sits against the divider while the
     Renumber icon (inside a button with that padding) does not. */
  .reorder-group { display: flex; align-items: center; gap: 10px; padding-left: 12px; }

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

  .columns-slider {
    width: 120px; height: 4px;
    -webkit-appearance: none;
    background-color: var(--border-color);
    border-radius: var(--radius-full);
    cursor: pointer; outline: none;
    transition: background-color var(--transition-fast);
  }

  .columns-slider:hover { background-color: rgba(171,183,183,0.3); }

  .columns-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px; height: 16px;
    border-radius: 50%;
    background-color: var(--color-light);
    border: 2px solid rgba(0,0,0,0.2);
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    transition: transform var(--transition-fast);
  }

  .columns-slider::-webkit-slider-thumb:active { transform: scale(1.2); }

  .filter-panel {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background-color: rgba(255,255,255,0.02);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .filter-title { font-size: var(--text-sm); color: var(--color-light-grey); white-space: nowrap; }
  .filter-chips { display: flex; gap: 8px; flex-wrap: wrap; }

  .filter-chip {
    padding: 4px 12px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-color);
    background: none;
    font-family: var(--font-family);
    font-size: var(--text-xs);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: 28px;
    display: flex; align-items: center;
  }

  .filter-chip:hover  { border-color: var(--color-primary); color: var(--color-primary); }
  .filter-chip.active { background-color: var(--color-primary); border-color: var(--color-primary); color: white; }
  .filter-chip.clear  { border-color: var(--color-error); color: var(--color-error); }

  /* ── Grid ── */
  .image-grid {
    /* Two different gaps, and the difference between them does the
       grouping: --grid-gap separates records, --pair-gap separates the two
       halves of one folio. The pair is marked by proximity, not by a frame.
       Change one and check the padding of .grid-pair, which depends on both. */
    --grid-gap: 24px;
    --pair-gap: 6px;
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: grid;
    gap: var(--grid-gap);
    align-content: start;
  }

  .image-grid::-webkit-scrollbar { width: 4px; }
  .image-grid::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .image-grid.reorder-mode { cursor: grab; }
  .image-grid.reorder-mode:active { cursor: grabbing; }

  .grid-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-md);
    transition: transform var(--transition-base), box-shadow var(--transition-base);
    cursor: pointer;
  }

  .grid-card:not(.draggable):hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
  .grid-card.draggable { transform: scale(1.01); cursor: grab; }
  .grid-card.draggable:hover { transform: scale(1.02); }

  .reorder-handle {
    position: absolute;
    top: 8px; left: 8px;
    width: 28px; height: 28px;
    background-color: var(--color-primary);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    z-index: 5;
    box-shadow: 0 2px 8px rgba(90,140,98,0.4);
    pointer-events: none;
  }

  .card-image-wrapper {
    position: relative;
    aspect-ratio: 3/4;
    border-radius: var(--radius-md);
    overflow: hidden;
    background-color: var(--color-surface-alt);
    border: 2px solid transparent;
    transition: border-color var(--transition-fast);
  }

  .card-image-wrapper.reorder { border-color: rgba(90,140,98,0.4); }
  .grid-card:not(.draggable):hover .card-image-wrapper { border-color: rgba(255,255,255,0.1); }

  .card-image { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s ease; display: block; }
  .grid-card:not(.draggable):hover .card-image { transform: scale(1.04); }

  .card-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--color-light-grey); opacity: 0.3; }

  /* ── L/R pair (NEH-211) ──
     The wrapper spans two real grid columns (grid-column: span 2), not one
     compressed column, so its width is 2·col + --grid-gap. Inside,
     .pair-thumbs splits that width into two .card-image-wrapper elements
     separated by --pair-gap; the padding below makes each half exactly
     `col` wide, the same as a single-image thumbnail. */
  .grid-pair {
    grid-column: span 2;
    position: relative;
    display: flex;
    flex-direction: column;
    /* The pair reads as a unit through proximity, not a frame: the two
       halves almost touch (--pair-gap) and the side padding pushes
       neighbouring groups away. The padding is (--grid-gap - --pair-gap) / 2
       so that each half still measures the same as a single thumbnail, the
       NEH-211 guarantee (see the algebra above); the rest of the gap goes to
       the sides instead of the middle. Gap between groups: --grid-gap +
       2·padding. */
    padding: 0 calc((var(--grid-gap) - var(--pair-gap)) / 2);
    transition: transform var(--transition-base);
    cursor: pointer;
  }

  .grid-pair:not(.draggable):hover { transform: translateY(-3px); }
  .grid-pair.draggable { transform: scale(1.01); cursor: grab; }
  .grid-pair.draggable:hover { transform: scale(1.02); }

  .pair-thumbs {
    position: relative;
    display: flex;
    gap: var(--pair-gap);
  }

  /* Reuses .card-image-wrapper (same aspect-ratio/border/radius as a single
     image) — flex: 1 1 0 splits the width 50/50 inside the pair. */
  .pair-thumbs .card-image-wrapper {
    flex: 1 1 0;
    min-width: 0;
  }

  .pair-meta { text-align: center; }
  .pair-name { text-align: center; }

  /* L/R badge — same background and border as in ThumbnailStrip.svelte;
     position and size differ. */
  .role-badge {
    position: absolute;
    bottom: 6px; left: 6px;
    background: rgba(19,17,16,0.8);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    pointer-events: none;
    z-index: 2;
  }
  .role-badge.right { left: auto; right: 6px; }


  .card-meta { padding: 7px 2px 2px; }

  .card-name { font-size: 11px; font-weight: var(--fw-bold); color: var(--color-light-grey); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; transition: color var(--transition-fast); }
  .grid-card:hover .card-name { color: var(--color-light); }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .modal-backdrop { position: fixed; inset: 0; background-color: rgba(0,0,0,0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }

  .modal-card { background-color: var(--color-surface-alt); border: 1px solid var(--border-color); border-radius: var(--radius-xl); padding: 28px; width: 100%; max-width: 460px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 14px; }

  .modal-title     { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }
  .modal-subtitle  { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; line-height: 1.5; }
  .modal-subtitle-sm { font-size: var(--text-xs); color: var(--color-light-grey); margin: 0; }

  .modal-actions { display: flex; gap: 12px; }


  .modal-btn { flex: 1; height: 44px; border-radius: var(--radius-md); font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold); cursor: pointer; transition: all var(--transition-base); border: 1px solid var(--border-color); }
  .modal-btn.cancel  { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover  { color: var(--color-light); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
  .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .modal-error-banner {
    margin: 0;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background-color: rgba(220, 80, 60, 0.12);
    border: 1px solid var(--color-error);
    color: var(--color-error);
    font-size: var(--text-sm);
  }
</style>
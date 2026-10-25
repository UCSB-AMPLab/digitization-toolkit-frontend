<script lang="ts">
  // Horizontal strip of thumbnails along the bottom of the live preview,
  // showing the records captured in the current volume.
  //
  // The unit is the RECORD, not the image (NEH-236). A folio captured with two
  // cameras has two images and is one thing; showing them apart, with the
  // title repeated under each half, would say otherwise. The halves are
  // grouped by proximity, as in the gallery and the grid, and the selection
  // frame surrounds the whole folio rather than each half. In `single` mode
  // each record shows its first image; in `double` mode both images of the
  // folio sit together with an L/R badge.

  import { recordsApi, type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';

  let {
    records,
    selectedRecordId,
    cameraMode,
    onSelect,
  }: {
    records: Record[];
    selectedRecordId: number | null;
    cameraMode: 'single' | 'double';
    onSelect: (record: Record) => void;
  } = $props();

  // One image within a strip unit. In `single` mode a record has one item
  // (its first image); in `double` mode, one item per image.
  interface ThumbItem {
    record: Record;
    image: RecordImage | null;
    role: 'L' | 'R' | null;
    thumbnailUrl: string | null;
  }

  function imageRole(img: RecordImage | null): 'L' | 'R' | null {
    if (!img) return null;
    if (img.role === 'left')  return 'L';
    if (img.role === 'right') return 'R';
    return null;
  }

  function thumbnailUrl(img: RecordImage | null): string | null {
    if (!img) return null;
    return recordsApi.getImageThumbnailUrl(img.id);
  }

  // The strip does not depend on the order in which the records arrive
  // (NEH-159: the backend guarantees no ORDER BY, so that order can vary). It
  // sorts by the same criterion as the gallery — `sequence` ascending (nulls
  // last), then `id` — in chronological reading order: oldest on the left and
  // the most recent capture at the RIGHT end (agreed convention,
  // NEH-159/NEH-183 — do not invert). When capture assigns `sequence`
  // (NEH-122), this criterion applies unchanged.
  function archivalOrder(a: Record, b: Record): number {
    if (a.sequence == null && b.sequence == null) return a.id - b.id;
    if (a.sequence == null) return 1;
    if (b.sequence == null) return -1;
    return a.sequence - b.sequence;
  }

  let orderedRecords = $derived([...records].sort(archivalOrder));

  interface ThumbGroup {
    record: Record;
    items: ThumbItem[];
  }

  let thumbGroups = $derived(
    orderedRecords.map((record): ThumbGroup => {
      if (cameraMode !== 'double') {
        const img = record.images?.[0] ?? null;
        return {
          record,
          items: [{ record, image: img, role: imageRole(img), thumbnailUrl: thumbnailUrl(img) }],
        };
      }
      if (!record.images || record.images.length === 0) {
        return { record, items: [{ record, image: null, role: null, thumbnailUrl: null }] };
      }
      // Sort: left before right, then by id for stability
      const sorted = [...record.images].sort((a, b) => {
        const order = (r?: string) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
        return order(a.role) - order(b.role) || a.id - b.id;
      });
      return {
        record,
        items: sorted.map((img): ThumbItem => ({
          record,
          image: img,
          role: imageRole(img),
          thumbnailUrl: thumbnailUrl(img),
        })),
      };
    })
  );
</script>

<div class="thumbnail-strip">
  <div class="strip-scroll">

    {#if thumbGroups.length === 0}
      <div class="empty-state">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span>{$m.lv_thumb_empty}</span>
      </div>
    {:else}
      {#each thumbGroups as group, i}
        {@const isSelected = group.record.id === selectedRecordId}

        <button
          class="thumbnail-item"
          class:selected={isSelected}
          onclick={() => onSelect(group.record)}
        >

          <!-- The halves of the folio, together. The selection frame goes here
               and not on each image: the operator selects the folio (NEH-236). -->
          <div class="thumb-pair" class:selected={isSelected}>
            {#each group.items as item, j}
              <div class="thumb-image-wrapper" class:alt-bg={j % 2 !== 0}>
                {#if item.thumbnailUrl}
                  <img
                    src={item.thumbnailUrl}
                    alt={item.record.title}
                    class="thumb-img"
                    onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                {:else}
                  <div class="thumb-placeholder">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                {/if}

                {#if cameraMode === 'double' && item.role}
                  <div class="thumb-badge" class:right={item.role === 'R'}>
                    {item.role}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- The folio name, once for the whole folio -->
          <div class="thumb-info">
            <span class="thumb-name" title={group.record.title}>
              {group.record.title || `Cap. ${String(i + 1).padStart(3, '0')}`}
            </span>
          </div>

        </button>
      {/each}
    {/if}

  </div>
</div>

<style>
  .thumbnail-strip {
    width: 100%;
    height: 100%;
    background-color: var(--color-bg);
    border-top: 1px solid var(--border-color);
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 20;
    flex-shrink: 0;
  }

  /* 18px between folios against the 4px of `--pair-gap`: the difference does
     the grouping, not the values. A change to one needs a look at the other. */
  .strip-scroll {
    flex: 1;
    display: flex;
    gap: 18px;
    overflow-x: auto;
    overflow-y: hidden;
    align-items: stretch;
    padding: 4px 4px 4px 4px;
    min-height: 0;
  }

  .strip-scroll::-webkit-scrollbar { height: 3px; }
  .strip-scroll::-webkit-scrollbar-thumb { background-color: var(--border-color); border-radius: 999px; }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--color-light-grey);
    opacity: 0.5;
    font-size: var(--text-sm);
    white-space: nowrap;
    min-width: 300px;
  }

  /* ── Folio ──
     The halves set the width: 100px in single-camera mode, and in double
     mode twice that plus the inner gap, so each half is the same size in
     both modes. */
  .thumbnail-item {
    --pair-gap: 4px;
    display: flex;
    flex-direction: column;
    height: 100%;
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0 4px;
    gap: 4px;
    transition: opacity var(--transition-base);
    opacity: 0.7;
  }

  .thumbnail-item:hover { opacity: 1; }
  .thumbnail-item.selected { opacity: 1; }

  /* The selection frame surrounds the whole folio, not each half. */
  .thumb-pair {
    display: flex;
    gap: var(--pair-gap);
    flex: 1;
    min-height: 0;
    padding: 2px;
    border-radius: var(--radius-md);
    border: 2px solid transparent;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
  }

  .thumb-pair.selected {
    border-color: var(--color-selected);
    box-shadow: var(--selected-ring);
  }

  .thumb-image-wrapper {
    position: relative;
    width: 100px;
    flex-shrink: 0;
    border-radius: var(--radius-md);
    overflow: hidden;
    background-color: var(--color-surface-alt);
    min-height: 0;
    padding: 4px;
  }

  /* Alternate background to tell L from R */
  .thumb-image-wrapper.alt-bg {
    background-color: var(--color-surface);
  }

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }

  .thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light-grey);
    opacity: 0.4;
  }

  .thumb-badge {
    position: absolute;
    top: 4px;
    left: 4px;
    background-color: rgba(19,17,16,0.8);
    backdrop-filter: blur(2px);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    line-height: 1.4;
  }

  .thumb-badge.right {
    left: auto;
    right: 4px;
  }

  /* The box holds only the name, with no status icon: during capture every
     record has just been captured, so there is no status to report. The list
     and grid views show the record status with `StatusBadge`. */
  .thumb-info {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 2px;
  }

  .thumb-name {
    font-size: 11px;
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    transition: color var(--transition-fast);
  }

  .thumbnail-item.selected .thumb-name,
  .thumbnail-item:hover .thumb-name {
    color: var(--color-light);
  }

</style>

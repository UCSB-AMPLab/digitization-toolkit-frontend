<script lang="ts">
  // Horizontal thumbnail strip at the bottom of the gallery's spread view.
  //
  // One unit per RECORD, not per image (NEH-236). A folio captured with two
  // cameras has two images, and the list view treats it as one thing
  // (NEH-211); the strip must agree, so the title appears once per record.
  //
  // It groups by proximity and not with a frame, as the grid does: the two
  // halves almost touch and neighbouring folios sit far apart. The light
  // frame is kept for what needs marking — the active folio — and surrounds
  // the whole group, not each half.

  import { recordsApi, type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';

  let {
    records,
    selectedRecordId,
    viewMode,
    onSelect,
  }: {
    records: Record[];
    selectedRecordId: number | null;
    viewMode: 'list' | 'spread' | 'grid';
    onSelect: (id: number) => void;
  } = $props();

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

  function imageThumbnailUrl(img: RecordImage | null): string | null {
    if (!img) return null;
    return recordsApi.getImageThumbnailUrl(img.id);
  }

  // One group per record, holding its images.
  interface ThumbGroup {
    record: Record;
    items: ThumbItem[];
  }

  let thumbGroups = $derived(
    records.map((record): ThumbGroup => {
      if (!record.images || record.images.length === 0) {
        return { record, items: [{ record, image: null, role: null, thumbnailUrl: null }] };
      }
      // Left first, then right, then images without a role; id breaks ties.
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
          thumbnailUrl: imageThumbnailUrl(img),
        })),
      };
    })
  );
</script>

<div class="thumbnail-strip">
  <div class="strip-scroll">

    {#if thumbGroups.length === 0}
      <div class="empty-state">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>{$m.col_empty_collection}</span>
      </div>
    {:else}
      {#each thumbGroups as group, i}
        {@const selected = group.record.id === selectedRecordId}

        <button
          class="thumb-item"
          class:selected
          onclick={() => onSelect(group.record.id)}
        >

          <!-- The folio's halves, together. The selection frame goes here and
               not on each image: what is selected is the folio. -->
          <div class="thumb-pair" class:selected>
            {#each group.items as item, j}
              <div class="thumb-img-wrapper" class:alt={j % 2 !== 0}>
                {#if item.thumbnailUrl}
                  <img src={item.thumbnailUrl} alt={item.record.title} class="thumb-img" />
                {:else}
                  <div class="thumb-placeholder">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                {/if}

                {#if item.role}
                  <div class="role-badge" class:right={item.role === 'R'}>{item.role}</div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Name: once per folio, not under each half -->
          <div class="thumb-info">
            <span class="thumb-name" title={group.record.title}>{group.record.title || `Img ${i+1}`}</span>
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
    flex-shrink: 0;
  }

  /* 16px between folios against the 4px of --pair-gap: four times as much,
     which is what makes the eye read the two halves as one thing. Change one
     and check the other — the difference does the grouping, not the value. */
  .strip-scroll {
    flex: 1;
    display: flex;
    gap: 16px;
    overflow-x: auto;
    overflow-y: hidden;
    align-items: stretch;
    padding: 2px 2px 4px;
  }

  .strip-scroll::-webkit-scrollbar { height: 3px; }
  .strip-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--color-light-grey);
    opacity: 0.4;
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  /* The halves set the width: a one-image folio is 100px wide and a
     two-image one twice that plus the inner gap, so each half keeps the size
     of a single thumbnail. The gap between folios comes from .strip-scroll
     and is much larger than --pair-gap: that difference does the grouping. */
  .thumb-item {
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
    opacity: 0.65;
    transition: opacity var(--transition-base);
  }

  .thumb-item:hover { opacity: 1; }
  .thumb-item.selected { opacity: 1; }

  /* The selection frame surrounds the whole folio, not each image, so that
     each half does not read as a record of its own (NEH-236). */
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

  .thumb-img-wrapper {
    position: relative;
    width: 100px;
    flex-shrink: 0;
    border-radius: var(--radius-md);
    overflow: hidden;
    background-color: var(--color-surface-alt);
    min-height: 0;
    padding: 3px;
  }

  .thumb-img-wrapper.alt { background-color: var(--color-surface); }

  .thumb-img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; display: block; }

  .thumb-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey); opacity: 0.3;
  }

  .role-badge {
    position: absolute;
    top: 4px; left: 4px;
    background: rgba(19,17,16,0.8);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    pointer-events: none;
  }

  .role-badge.right { left: auto; right: 4px; }

  .thumb-info {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
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

  .thumb-item.selected .thumb-name,
  .thumb-item:hover .thumb-name { color: var(--color-light); }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

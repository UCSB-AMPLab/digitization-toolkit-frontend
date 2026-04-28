<script lang="ts">
  // ============================================================================
  // COMPONENTE: ThumbnailStrip (Gallery)
  // Archivo: src/routes/gallery/[collectionId]/ThumbnailStrip.svelte
  //
  // Tira horizontal de miniaturas en la parte inferior de la galería.
  // Similar al ThumbnailStrip del live-preview, con estas diferencias:
  //   - En vista 'spread': los dos thumbnails del par activo se destacan
  //   - Los estados son: approved, rejected, pending, processing
  //   - No hay badges L/R (se muestran siempre todas las imágenes)
  //
  // Para compartir con live-preview en el futuro, mover a src/lib/components/.
  // ============================================================================

  import { recordsApi, type Record } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    records,
    selectedRecordId,
    viewMode,
    onSelect,
  }: {
    records: Record[];
    selectedRecordId: number | null;
    viewMode: 'single' | 'spread' | 'grid';
    onSelect: (id: number) => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------
  let selectedIndex = $derived(records.findIndex(r => r.id === selectedRecordId));

  // En spread, los dos del par están activos
  function isSelected(i: number): boolean {
    if (viewMode === 'spread') {
      const leftIdx = selectedIndex % 2 === 0 ? selectedIndex : selectedIndex - 1;
      return i === leftIdx || i === leftIdx + 1;
    }
    return records[i]?.id === selectedRecordId;
  }

  // URL de thumbnail
  function getThumbnailUrl(record: Record): string | null {
    if (!record.images || record.images.length === 0) return null;
    return recordsApi.getImageThumbnailUrl(record.images[0].id);
  }

  // Rol (L/R) de la primera imagen
  function getRole(record: Record): 'L' | 'R' | null {
    const role = record.images?.[0]?.role;
    if (role === 'left')  return 'L';
    if (role === 'right') return 'R';
    return null;
  }

  // Status de imagen (en producción vendrá del backend)
  function getStatus(_record: Record): 'approved' | 'rejected' | 'pending' | 'processing' {
    return 'pending'; // TODO: conectar con backend
  }
</script>

<!-- ============================================================
     TIRA DE MINIATURAS
     ============================================================ -->
<div class="thumbnail-strip">
  <div class="strip-scroll">

    {#if records.length === 0}
      <div class="empty-state">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>Sin imágenes en esta colección</span>
      </div>
    {:else}
      {#each records as record, i}
        {@const selected = isSelected(i)}
        {@const thumbUrl = getThumbnailUrl(record)}
        {@const role = getRole(record)}
        {@const status = getStatus(record)}

        <button
          class="thumb-item"
          class:selected
          onclick={() => onSelect(record.id)}
        >

          <!-- Imagen -->
          <div class="thumb-img-wrapper" class:selected class:alt={i % 2 !== 0}>
            {#if thumbUrl}
              <img src={thumbUrl} alt={record.title} class="thumb-img" />
            {:else}
              <div class="thumb-placeholder">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
            {/if}

            <!-- Badge L/R -->
            {#if role}
              <div class="role-badge" class:right={role === 'R'}>{role}</div>
            {/if}
          </div>

          <!-- Nombre + status -->
          <div class="thumb-info">
            <span class="thumb-name" title={record.title}>{record.title || `Img ${i+1}`}</span>
            <div class="thumb-status">
              {#if status === 'approved'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {:else if status === 'rejected'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {:else if status === 'processing'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-light)" stroke-width="2" class="spin"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 0 .57-8.38"/></svg>
              {:else}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-light-grey)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {/if}
            </div>
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

  .strip-scroll {
    flex: 1;
    display: flex;
    gap: 10px;
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

  .thumb-item {
    display: flex;
    flex-direction: column;
    width: 100px;
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

  .thumb-img-wrapper {
    position: relative;
    width: 100%;
    flex: 1;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 2px solid transparent;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
    background-color: var(--color-surface-alt);
    min-height: 0;
    padding: 3px;
  }

  .thumb-img-wrapper.selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(90,140,98,0.2);
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
    height: 36px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
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

  .thumb-status { display: flex; align-items: center; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

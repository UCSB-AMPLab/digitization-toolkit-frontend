<script lang="ts">
  // ============================================================================
  // COMPONENTE: ThumbnailStrip (Gallery)
  //
  // Tira horizontal de miniaturas en la parte inferior de la galería.
  // Muestra una miniatura por cada imagen del registro — si un registro tiene
  // imagen izquierda Y derecha (captura doble), ambas aparecen como items
  // independientes con badge L/R, igual que en el live-preview.
  //
  // En vista 'spread': los dos items del par activo se resaltan.
  // ============================================================================

  import { recordsApi, type Record, type RecordImage } from '$lib/api';

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
  // TIPO: item individual de la tira
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // DERIVADO: lista plana — un item por imagen dentro de cada registro
  // Los registros con captura doble producen dos items (L + R).
  // ---------------------------------------------------------------------------
  let thumbItems = $derived(
    records.flatMap((record): ThumbItem[] => {
      if (!record.images || record.images.length === 0) {
        return [{ record, image: null, role: null, thumbnailUrl: null }];
      }
      // Ordenar: left primero, luego right, luego sin rol (por id como desempate)
      const sorted = [...record.images].sort((a, b) => {
        const order = (r?: string) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
        return order(a.role) - order(b.role) || a.id - b.id;
      });
      return sorted.map((img): ThumbItem => ({
        record,
        image: img,
        role: imageRole(img),
        thumbnailUrl: imageThumbnailUrl(img),
      }));
    })
  );

  // En vista 'spread': resalta el par de items del registro activo
  function isSelected(item: ThumbItem): boolean {
    if (viewMode === 'spread') return item.record.id === selectedRecordId;
    return item.record.id === selectedRecordId;
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

    {#if thumbItems.length === 0}
      <div class="empty-state">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>Sin imágenes en esta colección</span>
      </div>
    {:else}
      {#each thumbItems as item, i}
        {@const selected = isSelected(item)}
        {@const status = getStatus(item.record)}

        <button
          class="thumb-item"
          class:selected
          onclick={() => onSelect(item.record.id)}
        >

          <!-- Imagen -->
          <div class="thumb-img-wrapper" class:selected class:alt={i % 2 !== 0}>
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

            <!-- Badge L/R -->
            {#if item.role}
              <div class="role-badge" class:right={item.role === 'R'}>{item.role}</div>
            {/if}
          </div>

          <!-- Nombre + status -->
          <div class="thumb-info">
            <span class="thumb-name" title={item.record.title}>{item.record.title || `Img ${i+1}`}</span>
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

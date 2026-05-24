<script lang="ts">
  // ============================================================================
  // COMPONENTE: ThumbnailStrip
  // Archivo: src/routes/live-preview/ThumbnailStrip.svelte
  //
  // Tira horizontal de miniaturas en la parte inferior de la interfaz.
  // Muestra los registros capturados en la colección actual.
  //
  // Comportamiento según cameraMode:
  //   'single' → muestra solo imágenes de cámara izquierda (index par)
  //   'double' → muestra todas las imágenes con badge L/R
  //
  // Estados de imagen:
  //   approved   → check verde
  //   rejected   → X rojo
  //   processing → spinner girando
  //   pending    → reloj (por defecto)
  // ============================================================================

  import { recordsApi, type Record, type RecordImage } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // TIPO: item individual de la tira
  // En modo 'single' → un item por registro (primera imagen)
  // En modo 'double' → un item por imagen dentro de cada registro
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

  function thumbnailUrl(img: RecordImage | null): string | null {
    if (!img) return null;
    return recordsApi.getImageThumbnailUrl(img.id);
  }

  // ---------------------------------------------------------------------------
  // DERIVADO: lista plana de items para la tira
  // ---------------------------------------------------------------------------
  let thumbItems = $derived(
    cameraMode === 'double'
      ? records.flatMap((record): ThumbItem[] => {
          if (!record.images || record.images.length === 0) {
            return [{ record, image: null, role: null, thumbnailUrl: null }];
          }
          // Sort: left before right, then by id for stability
          const sorted = [...record.images].sort((a, b) => {
            const order = (r?: string) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
            return order(a.role) - order(b.role) || a.id - b.id;
          });
          return sorted.map((img): ThumbItem => ({
            record,
            image: img,
            role: imageRole(img),
            thumbnailUrl: thumbnailUrl(img),
          }));
        })
      : records.map((record): ThumbItem => {
          const img = record.images?.[0] ?? null;
          return { record, image: img, role: imageRole(img), thumbnailUrl: thumbnailUrl(img) };
        })
  );
</script>

<!-- ============================================================
     TIRA DE MINIATURAS: barra horizontal con scroll
     ============================================================ -->
<div class="thumbnail-strip">
  <div class="strip-scroll">

    {#if thumbItems.length === 0}
      <!-- Estado vacío: no hay capturas aún -->
      <div class="empty-state">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span>Sin capturas aún — usa el botón de captura</span>
      </div>
    {:else}
      <!-- Lista de miniaturas -->
      {#each thumbItems as item, i}
        {@const isSelected = item.record.id === selectedRecordId}

        <button
          class="thumbnail-item"
          class:selected={isSelected}
          onclick={() => onSelect(item.record)}
        >

          <!-- Contenedor de imagen -->
          <div
            class="thumb-image-wrapper"
            class:selected={isSelected}
            class:alt-bg={i % 2 !== 0}
          >
            {#if item.thumbnailUrl}
              <!-- Imagen real del registro -->
              <img
                src={item.thumbnailUrl}
                alt={item.record.title}
                class="thumb-img"
                onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            {:else}
              <!-- Placeholder cuando no hay imagen -->
              <div class="thumb-placeholder">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
            {/if}

            <!-- Badge L/R en modo doble cámara -->
            {#if cameraMode === 'double' && item.role}
              <div class="thumb-badge" class:right={item.role === 'R'}>
                {item.role}
              </div>
            {/if}
          </div><!-- /thumb-image-wrapper -->

          <!-- Info del registro: nombre + estado -->
          <div class="thumb-info">
            <span class="thumb-name" title={item.record.title}>
              {item.record.title || `Cap. ${String(i + 1).padStart(3, '0')}`}
            </span>
            <!-- Estado de la imagen (siempre pending para capturas nuevas) -->
            <!-- Para actualizar el estado, el backend debe devolver un campo status -->
            <div class="thumb-status">
              <!-- Por ahora todas las capturas nuevas son 'pending' -->
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="status-icon pending">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
          </div>

        </button>
      {/each}
    {/if}

  </div>
</div>

<style>
  /* Contenedor principal de la tira */
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

  /* Área de scroll horizontal */
  .strip-scroll {
    flex: 1;
    display: flex;
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    align-items: stretch;
    padding: 4px 4px 4px 4px;
    min-height: 0;
  }

  /* Scrollbar mínimo */
  .strip-scroll::-webkit-scrollbar { height: 3px; }
  .strip-scroll::-webkit-scrollbar-thumb { background-color: var(--border-color); border-radius: 999px; }

  /* Estado vacío */
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

  /* ── Item de miniatura ── */
  .thumbnail-item {
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
    transition: opacity var(--transition-base);
    opacity: 0.7;
  }

  .thumbnail-item:hover { opacity: 1; }
  .thumbnail-item.selected { opacity: 1; }

  /* Contenedor de la imagen */
  .thumb-image-wrapper {
    position: relative;
    width: 100%;
    flex: 1;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 2px solid transparent;
    transition: border-color var(--transition-base), box-shadow var(--transition-base);
    background-color: var(--color-surface-alt);
    min-height: 0;
    padding: 4px;
  }

  .thumb-image-wrapper.selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(90,140,98,0.2);
  }

  /* Fondo alternado para diferenciar L/R */
  .thumb-image-wrapper.alt-bg {
    background-color: var(--color-surface);
  }

  /* Imagen de miniatura */
  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }

  /* Placeholder sin imagen */
  .thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light-grey);
    opacity: 0.4;
  }

  /* Badge L/R */
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

  /* Badge R (derecha, se posiciona a la derecha) */
  .thumb-badge.right {
    left: auto;
    right: 4px;
  }

  /* Info del registro */
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

  .thumbnail-item.selected .thumb-name,
  .thumbnail-item:hover .thumb-name {
    color: var(--color-light);
  }

  .thumb-status { display: flex; align-items: center; }

  /* Ícono de estado */
  .status-icon.pending  { color: var(--color-light-grey); }
  .status-icon.approved { color: var(--color-success); }
  .status-icon.rejected { color: var(--color-error); }
  .status-icon.processing {
    color: var(--color-light);
    animation: spin 1s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>

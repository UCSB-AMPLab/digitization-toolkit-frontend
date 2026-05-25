<script lang="ts">
  // ============================================================================
  // COMPONENTE: GridView
  // Archivo: src/routes/gallery/[collectionId]/GridView.svelte
  //
  // Vista de cuadrícula. El botón "Finalizar" NO está aquí —
  // vive en el TopBar y +page.svelte lo controla.
  //
  // Este componente recibe `triggerFinalizeModal` como prop:
  //   - Cuando se pone true (TopBar pulsó Finalizar), abre el modal
  //   - Cuando el usuario confirma → llama onFinalized()
  //   - Cuando cancela → llama onFinalizeModalClosed()
  //
  // TOOLBAR:
  //   [Filtros | Renombrar]      [🖐 Reordenar / Listo]  [slider ──●──]
  //
  // SLIDER: controla el número de columnas del grid
  //   izquierda (2) = cards grandes | derecha (6) = cards pequeñas
  //
  // TOOLBAR SUPERIOR:
  //   Filtros | Renombrar           [Reordenar 🖐 ──●── ] [Finalizar]
  //
  //   - Filtros     → panel de filtros por estado
  //   - Renombrar   → modal de renombrado masivo
  //   - Reordenar   → botón que activa el modo drag-and-drop
  //                   cuando está activo el texto cambia a "Listo"
  //   - Slider      → controla el número de columnas del grid
  //                   izquierda = menos columnas (cards más grandes)
  //                   derecha   = más columnas (cards más pequeñas)
  //   - Finalizar   → botón en el TopBar (pasado como prop desde +page.svelte)
  //
  // REORDENAMIENTO:
  //   Actualmente es visual (las tarjetas muestran el ícono de mano).
  //   Para implementar drag-and-drop real usar @neodrag/svelte:
  //     npm install @neodrag/svelte
  //     import { draggable, droppable } from '@neodrag/svelte'
  //   Ver comentario TODO en el template.
  // ============================================================================

  import { recordsApi, collectionsApi, type Record } from '$lib/api';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  // @ts-ignore — installed in Docker, not locally
  import { dndzone } from 'svelte-dnd-action';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    records,
    collectionId,
    selectedIds = new Set<number>(),
    triggerFinalizeModal,
    onRecordsUpdate,
    onFinalized,
    onFinalizeModalClosed,
    onToggleSelect,
  }: {
    records: Record[];
    collectionId: number;
    selectedIds?: Set<number>;
    triggerFinalizeModal: boolean;
    onRecordsUpdate: () => void;
    onFinalized: () => void;
    onFinalizeModalClosed: () => void;
    onToggleSelect?: (id: number) => void;
  } = $props();

  let isSelectMode = $derived(selectedIds.size > 0);

  // Local copy of records for DnD reordering
  let localRecords = $state<Record[]>([]);

  // Sync localRecords when records prop changes
  $effect(() => {
    localRecords = [...records];
  });

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // Número de columnas del grid (slider: 2 = grande, 6 = pequeño)
  let columns = $state(4);

  // Modo reordenamiento
  let isReorderMode = $state(false);

  // Filtros
  let showFilterPanel   = $state(false);
  let activeStatusFilter = $state<string | null>(null);

  // Modal de Renombrar
  let showRenameModal    = $state(false);
  let renameCollectionId = $state(`coleccion_${collectionId}`);

  // Modal de Finalizar (controlado por el prop triggerFinalizeModal)
  let isFinalizing = $state(false);

  // ---------------------------------------------------------------------------
  // REACTIVIDAD: el prop triggerFinalizeModal abre el modal cuando se pone true
  // ---------------------------------------------------------------------------
  $effect(() => {
    // No hay nada que hacer aquí porque el modal se controla directamente
    // con la expresión {#if triggerFinalizeModal} en el template
  });

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------

  // Status simulado — ELIMINADO: usar record.status real

  function getThumbnailUrl(record: Record): string | null {
    if (!record.images || record.images.length === 0) return null;
    return recordsApi.getImageThumbnailUrl(record.images[0].id);
  }

  // ---------------------------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------------------------

  function toggleReorderMode() { isReorderMode = !isReorderMode; }

  function handleDndConsider(e: CustomEvent) {
    localRecords = e.detail.items;
  }

  async function handleDndFinalize(e: CustomEvent) {
    localRecords = e.detail.items;
    try {
      await collectionsApi.reorderRecords(collectionId, localRecords.map(r => r.id));
      onRecordsUpdate();
    } catch (err) {
      console.error('[GridView] Error reordenando:', err);
      onRecordsUpdate(); // restore from server
    }
  }

  async function handleConfirmRename() {
    // TODO: await collectionsApi.renameImages(collectionId, renameCollectionId);
    showRenameModal = false;
  }

  async function handleConfirmFinalize() {
    isFinalizing = true;
    try {
      // TODO: await collectionsApi.finalize(collectionId);
      onFinalized();  // notifica al padre (+page.svelte)
    } catch (err) {
      console.error('[GridView] Error finalizando:', err);
    } finally {
      isFinalizing = false;
    }
  }

  function handleCancelFinalize() {
    onFinalizeModalClosed();  // notifica al padre para resetear el trigger
  }
</script>

<!-- ============================================================
     VISTA GRID
     ============================================================ -->
<div class="grid-view">

  <!-- ── TOOLBAR ── -->
  <div class="grid-toolbar">

    <!-- Izquierda: Filtros + Renombrar -->
    <div class="toolbar-left">
      <button class="toolbar-btn" onclick={() => showFilterPanel = !showFilterPanel}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span>Filtros</span>
      </button>

      <div class="toolbar-divider"></div>

      <button class="toolbar-btn" onclick={() => showRenameModal = true}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 7 4 4 20 4 20 7"/>
          <line x1="9" y1="20" x2="15" y2="20"/>
          <line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
        <span>Renombrar</span>
      </button>
    </div>

    <!-- Derecha: Reordenar + Slider de columnas -->
    <div class="toolbar-right">
      <div class="reorder-group">

        <!-- Ícono mano -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          style="color: {isReorderMode ? 'var(--color-primary)' : 'var(--color-light-grey)'}; flex-shrink:0">
          <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
        </svg>

        <!-- Botón Reordenar / Listo -->
        <button
          class="reorder-btn"
          class:active={isReorderMode}
          onclick={toggleReorderMode}
        >
          {isReorderMode ? 'Listo' : 'Reordenar'}
        </button>

        <!-- Slider de columnas -->
        <!--
          Izquierda (2) = menos columnas = thumbnails más grandes (como screenshot 3)
          Derecha   (6) = más columnas   = thumbnails más pequeños (como screenshot 2)
          Para cambiar el rango, modifica min y max
        -->
        <input
          type="range"
          min="2"
          max="6"
          step="1"
          bind:value={columns}
          class="columns-slider"
          title="Tamaño de thumbnails"
          aria-label="Número de columnas"
        />

      </div>
    </div>

  </div>

  <!-- Panel de filtros -->
  {#if showFilterPanel}
    <div class="filter-panel">
      <span class="filter-title">Filtrar por estado:</span>
      <div class="filter-chips">
        {#each [
          { id: 'approved',   label: 'Aprobado' },
          { id: 'rejected',   label: 'Rechazado' },
          { id: 'in_review',  label: 'En revisión' },
          { id: 'captured',   label: 'Capturado' },
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
          <button class="filter-chip clear" onclick={() => activeStatusFilter = null}>× Limpiar</button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── CUADRÍCULA ── -->
  {#if isReorderMode}
    <div
      class="image-grid reorder-mode"
      style="--grid-cols: {columns}"
      use:dndzone={{ items: localRecords, dragDisabled: false }}
      onconsider={handleDndConsider}
      onfinalize={handleDndFinalize}
    >
      {#each localRecords.filter(r => !activeStatusFilter || r.status === activeStatusFilter) as record, i (record.id)}
        {@const thumbUrl = getThumbnailUrl(record)}
        <div class="grid-card draggable" id="record-{record.id}">
          <div class="drag-handle visible">
            <span class="material-symbols-outlined icon-sm">drag_indicator</span>
          </div>
          <div class="card-image-wrapper reorder">
            {#if thumbUrl}
              <img src={thumbUrl} alt={record.title} class="card-image" draggable="false" />
            {:else}
              <div class="card-placeholder">
                <span class="material-symbols-outlined icon-md">image</span>
              </div>
            {/if}
          </div>
          <div class="card-meta">
            <span class="card-name" title={record.title}>{record.title || `Imagen ${i + 1}`}</span>
            <div class="card-status-row"><StatusBadge status={record.status} /></div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
  <div
    class="image-grid"
    class:reorder-mode={isReorderMode}
    style="--grid-cols: {columns}"
  >
    {#each records.filter(r => !activeStatusFilter || r.status === activeStatusFilter) as record, i}
      {@const thumbUrl = getThumbnailUrl(record)}

      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="grid-card"
        class:draggable={isReorderMode}
        class:selected={selectedIds.has(record.id)}
        onclick={() => { if (isSelectMode && onToggleSelect) onToggleSelect(record.id); }}
      >

        {#if isReorderMode}
          <div class="reorder-handle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8">
              <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
              <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </div>
        {/if}

        <div class="card-image-wrapper" class:reorder={isReorderMode}>
          {#if thumbUrl}
            <img src={thumbUrl} alt={record.title} class="card-image" draggable="false" />
          {:else}
            <div class="card-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
          {/if}

          <!-- Multi-select overlay -->
          {#if onToggleSelect}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="selectable-overlay"
              class:selected={selectedIds.has(record.id)}
              onclick={(e) => { e.stopPropagation(); onToggleSelect!(record.id); }}
            >
              {#if selectedIds.has(record.id)}
                <span class="material-symbols-outlined">check</span>
              {/if}
            </div>
          {/if}
        </div>

        <div class="card-meta">
          <span class="card-name" title={record.title}>{record.title || `Imagen ${i + 1}`}</span>
          <div class="card-status-row">
            <StatusBadge status={record.status} />
          </div>
        </div>

      </div>
    {/each}
  </div>
  {/if}

</div>

<!-- ============================================================
     MODAL: Renombrar
     ============================================================ -->
{#if showRenameModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) showRenameModal = false; }}>
    <div class="modal-card">
      <h3 class="modal-title">Renombrar imágenes</h3>
      <p class="modal-subtitle">
        Todas las imágenes se renombrarán usando el patrón:
        <code class="code-inline">{renameCollectionId}_001</code>...
      </p>
      <div class="modal-field">
        <label class="modal-label">ID de colección</label>
        <input class="modal-input" type="text" bind:value={renameCollectionId} placeholder="id_coleccion" />
      </div>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => showRenameModal = false}>Cancelar</button>
        <button class="modal-btn confirm" onclick={handleConfirmRename}>Renombrar</button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================================================
     MODAL: Finalizar proyecto
     Se abre cuando triggerFinalizeModal = true (desde el TopBar via +page.svelte)
     ============================================================ -->
{#if triggerFinalizeModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) handleCancelFinalize(); }}>
    <div class="modal-card">
      <div class="finalize-header">
        <div class="finalize-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div>
          <h3 class="modal-title">¿Finalizar Proyecto?</h3>
          <p class="modal-subtitle-sm">Esta acción marcará el proyecto como terminado</p>
        </div>
      </div>
      <p class="modal-desc">
        Al finalizar el proyecto se asume que <strong>todas las correcciones y revisiones fueron completadas</strong>. Las imágenes se guardarán automáticamente en la tarjeta de memoria.
      </p>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={handleCancelFinalize} disabled={isFinalizing}>
          Cancelar
        </button>
        <button class="modal-btn confirm" onclick={handleConfirmFinalize} disabled={isFinalizing}>
          {isFinalizing ? 'Finalizando...' : 'Sí, Finalizar'}
        </button>
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

  .toolbar-divider { width: 1px; height: 18px; background-color: var(--border-color); margin: 0 4px; }

  /* Reordenar group */
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

  /* Slider de columnas */
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

  /* Filtros */
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
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: grid;
    gap: 16px;
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
    top: -12px; left: 50%;
    transform: translateX(-50%);
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

  .status-badge { position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 3; box-shadow: 0 1px 4px rgba(0,0,0,0.5); }
  .status-badge.approved { background-color: var(--color-success); }
  .status-badge.rejected { background-color: var(--color-error); }

  .card-meta { padding: 7px 2px 2px; }

  .card-name { font-size: 11px; font-weight: var(--fw-bold); color: var(--color-light-grey); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; transition: color var(--transition-fast); }
  .grid-card:hover .card-name { color: var(--color-light); }

  .card-status { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--color-light-grey); }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Modales ── */
  .modal-backdrop { position: fixed; inset: 0; background-color: rgba(0,0,0,0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }

  .modal-card { background-color: var(--color-surface-alt); border: 1px solid var(--border-color); border-radius: var(--radius-xl); padding: 28px; width: 100%; max-width: 460px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 14px; }

  .modal-title     { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }
  .modal-subtitle  { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; line-height: 1.5; }
  .modal-subtitle-sm { font-size: var(--text-xs); color: var(--color-light-grey); margin: 0; }
  .modal-desc      { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.6; margin: 0; }
  .modal-desc strong { color: var(--color-light); }

  .code-inline { font-family: monospace; font-size: var(--text-sm); background-color: var(--color-surface); padding: 1px 6px; border-radius: var(--radius-sm); color: var(--color-primary); }

  .finalize-header { display: flex; align-items: center; gap: 12px; }
  .finalize-icon { width: 44px; height: 44px; border-radius: 50%; background-color: var(--color-highlight); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

  .modal-field { display: flex; flex-direction: column; gap: 6px; }
  .modal-label { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); }

  .modal-input { font-family: var(--font-family); font-size: var(--text-base); color: var(--color-light); background-color: var(--color-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 14px; outline: none; transition: border-color var(--transition-base); min-height: var(--touch-target-min); }
  .modal-input:focus { border-color: var(--color-primary); }

  .modal-actions { display: flex; gap: 12px; }

  .modal-btn { flex: 1; height: 44px; border-radius: var(--radius-md); font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold); cursor: pointer; transition: all var(--transition-base); border: 1px solid var(--border-color); }
  .modal-btn.cancel  { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover  { color: var(--color-light); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
  .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
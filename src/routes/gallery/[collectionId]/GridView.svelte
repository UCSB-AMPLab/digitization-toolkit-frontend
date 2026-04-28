<script lang="ts">
  // ============================================================================
  // COMPONENTE: GridView
  // Archivo: src/routes/gallery/[collectionId]/GridView.svelte
  //
  // Vista de cuadrícula de todos los registros de la colección.
  // Funcionalidades:
  //   - 4 columnas de imágenes con status (Approved/Rejected/Pending/Processing)
  //   - Barra superior: Filtros | Renombrar | Reordenar (toggle) | Finalizar
  //   - Filtros por tipo de error (se agregan desde las anotaciones)
  //   - Renombrar todos los archivos con patrón ID_colección_XXX
  //   - Reordenar por drag (actualmente visual — sin DnD implementado por limitaciones)
  //   - Modal de confirmación "Finalizar proyecto"
  //
  // DRAG & DROP: El reordenamiento real con DnD requiere una librería como
  // @neodrag/svelte o svelte-dnd-action. Por ahora muestra el modo visual.
  // Para implementarlo: npm install @neodrag/svelte y usar la directiva use:draggable.
  // ============================================================================

  import { recordsApi, type Record } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    records,
    collectionId,
    onRecordsUpdate,
  }: {
    records: Record[];
    collectionId: number;
    onRecordsUpdate: () => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // true = modo reordenamiento activo (toggle visual)
  let isReorderMode = $state(false);

  // Filtros activos por estado de imagen
  // Para agregar filtros, modificar statusFilters
  let activeStatusFilter = $state<string | null>(null); // null = todos

  // Modal de Renombrar
  let showRenameModal = $state(false);
  let renameCollectionId = $state(`coleccion_${collectionId}`);

  // Modal de Finalizar
  let showFinalizeModal = $state(false);
  let isFinalized = $state(false);
  let isFinalizing = $state(false);

  // Filtro de status panel
  let showFilterPanel = $state(false);

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------

  // Registros filtrados según el filtro activo
  let filteredRecords = $derived(() => {
    // TODO: cuando el backend devuelva status en los registros, filtrar por él
    // Por ahora devuelve todos
    return records;
  });

  // Status simulados para visualización (en producción vendrán del backend)
  // Mapa de record.id → status
  // Para conectar con el backend, reemplazar por datos reales del registro
  const statusMock: Record<number, 'approved' | 'rejected' | 'pending' | 'processing'> = {};

  function getStatus(record: Record): 'approved' | 'rejected' | 'pending' | 'processing' {
    // TODO: cuando el backend devuelva status, usar record.status
    return statusMock[record.id] ?? 'pending';
  }

  // URL de thumbnail del primer imagen del registro
  function getThumbnailUrl(record: Record): string | null {
    if (!record.images || record.images.length === 0) return null;
    return recordsApi.getImageThumbnailUrl(record.images[0].id);
  }

  // ---------------------------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------------------------

  // Confirmar renombrado
  // Para conectar con backend: llamar a collectionsApi.renameImages(collectionId, renameCollectionId)
  async function handleConfirmRename() {
    // TODO: implementar endpoint de renombrado masivo en el backend
    // Por ahora cierra el modal
    showRenameModal = false;
  }

  // Confirmar finalización del proyecto
  // Para conectar con backend: llamar a collectionsApi.finalize(collectionId)
  async function handleConfirmFinalize() {
    isFinalizing = true;
    try {
      // TODO: implementar endpoint de finalización
      // await collectionsApi.finalize(collectionId);
      isFinalized = true;
      showFinalizeModal = false;
    } catch (error) {
      console.error('[GridView] Error finalizando:', error);
    } finally {
      isFinalizing = false;
    }
  }
</script>

<!-- ============================================================
     VISTA GRID
     ============================================================ -->
<div class="grid-view">

  <!-- ── Barra de herramientas superior ── -->
  <div class="grid-toolbar">

    <div class="toolbar-left">
      <!-- Filtros -->
      <button class="toolbar-btn" onclick={() => showFilterPanel = !showFilterPanel}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span>Filtros</span>
      </button>

      <div class="toolbar-divider"></div>

      <!-- Renombrar -->
      <button class="toolbar-btn" onclick={() => showRenameModal = true}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
        </svg>
        <span>Renombrar</span>
      </button>
    </div>

    <div class="toolbar-right">
      <!-- Reordenar toggle -->
      <div class="reorder-toggle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <!-- Ícono de mano / arrastrar -->
          <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
        </svg>
        <span>Reordenar</span>
        <!-- Toggle switch -->
        <button
          class="toggle-switch"
          class:on={isReorderMode}
          onclick={() => isReorderMode = !isReorderMode}
          aria-label="Activar modo reordenar"
        >
          <div class="toggle-knob" class:on={isReorderMode}></div>
        </button>
      </div>
    </div>
  </div>

  <!-- Panel de filtros (desplegable) -->
  {#if showFilterPanel}
    <div class="filter-panel">
      <span class="filter-title">Filtrar por estado:</span>
      <div class="filter-chips">
        {#each ['approved', 'rejected', 'pending', 'processing'] as status}
          <button
            class="filter-chip"
            class:active={activeStatusFilter === status}
            onclick={() => activeStatusFilter = activeStatusFilter === status ? null : status}
          >
            {status === 'approved' ? 'Aprobado' : status === 'rejected' ? 'Rechazado' : status === 'pending' ? 'Pendiente' : 'Procesando'}
          </button>
        {/each}
        {#if activeStatusFilter}
          <button class="filter-chip clear" onclick={() => activeStatusFilter = null}>
            Limpiar filtro
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ── Cuadrícula de imágenes ── -->
  <div class="image-grid" class:reorder-mode={isReorderMode}>
    {#each filteredRecords() as record, i}
      {@const status = getStatus(record)}
      {@const thumbUrl = getThumbnailUrl(record)}

      <div class="grid-card" class:reorder-active={isReorderMode}>

        <!-- Indicador de reordenamiento -->
        {#if isReorderMode}
          <div class="reorder-indicator">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
              <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          </div>
        {/if}

        <!-- Imagen -->
        <div class="card-image-wrapper">
          {#if thumbUrl}
            <img src={thumbUrl} alt={record.title} class="card-image" draggable="false" />
          {:else}
            <div class="card-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
          {/if}

          <!-- Indicador de status sobre la imagen -->
          {#if status === 'approved'}
            <div class="status-badge approved">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          {:else if status === 'rejected'}
            <div class="status-badge rejected">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
          {/if}
        </div>

        <!-- Metadata debajo de la imagen -->
        <div class="card-meta">
          <span class="card-name" title={record.title}>{record.title || `Imagen ${i + 1}`}</span>
          <div class="card-status">
            {#if status === 'approved'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span style="color: var(--color-success)">Approved</span>
            {:else if status === 'rejected'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span style="color: var(--color-error)">Rejected</span>
            {:else if status === 'processing'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-light)" stroke-width="2" class="spin"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              <span>Processing</span>
            {:else}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-light-grey)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style="color: var(--color-light-grey)">Pending</span>
            {/if}
          </div>
        </div>

      </div>
    {/each}
  </div>

  <!-- Botón Finalizar (flotante abajo derecha cuando hay registros) -->
  {#if records.length > 0 && !isFinalized}
    <button class="btn-finalizar" onclick={() => showFinalizeModal = true}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span>Finalizar</span>
    </button>
  {/if}

  {#if isFinalized}
    <div class="finalized-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Proyecto finalizado
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
        <code>{renameCollectionId}_001</code>, <code>{renameCollectionId}_002</code>, etc.
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
     MODAL: Finalizar
     ============================================================ -->
{#if showFinalizeModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) showFinalizeModal = false; }}>
    <div class="modal-card">
      <div class="finalize-icon-row">
        <div class="finalize-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div>
          <h3 class="modal-title">¿Finalizar Proyecto?</h3>
          <p class="modal-subtitle-small">Esta acción marcará el proyecto como terminado</p>
        </div>
      </div>
      <p class="modal-desc">
        Al finalizar el proyecto se asume que <strong>todas las correcciones y revisiones fueron completadas</strong>. Las imágenes se guardarán automáticamente en la tarjeta de memoria.
      </p>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => showFinalizeModal = false} disabled={isFinalizing}>Cancelar</button>
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
    position: relative;
  }

  /* ── Toolbar ── */
  .grid-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    height: 52px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--color-surface-alt);
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: none;
    border: none;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-md);
    min-height: var(--touch-target-min);
    transition: all var(--transition-fast);
  }

  .toolbar-btn:hover { color: var(--color-light); background-color: rgba(255,255,255,0.05); }

  .toolbar-divider { width: 1px; height: 20px; background-color: var(--border-color); }

  .reorder-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
  }

  /* Toggle switch */
  .toggle-switch {
    width: 40px; height: 22px;
    border-radius: var(--radius-full);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    cursor: pointer;
    position: relative;
    transition: background-color var(--transition-base);
    flex-shrink: 0;
  }

  .toggle-switch.on { background-color: var(--color-primary); border-color: var(--color-primary); }

  .toggle-knob {
    position: absolute;
    top: 1px; left: 1px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    transition: transform var(--transition-base), background-color var(--transition-base);
  }

  .toggle-knob.on { transform: translateX(18px); background-color: white; }

  /* Panel de filtros */
  .filter-panel {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background-color: rgba(255,255,255,0.02);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
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
    min-height: 30px;
  }

  .filter-chip:hover { border-color: var(--color-primary); color: var(--color-primary); }
  .filter-chip.active { background-color: var(--color-primary); border-color: var(--color-primary); color: white; }
  .filter-chip.clear { border-color: var(--color-error); color: var(--color-error); }

  /* ── Cuadrícula ── */
  .image-grid {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    align-content: start;
  }

  .image-grid::-webkit-scrollbar { width: 4px; }
  .image-grid::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  /* En modo reordenamiento, añadir cursor grab */
  .image-grid.reorder-mode { cursor: grab; }

  /* Card de imagen */
  .grid-card {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-md);
    transition: transform var(--transition-base), box-shadow var(--transition-base);
    cursor: pointer;
  }

  .grid-card:hover:not(.reorder-active) {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }

  .grid-card.reorder-active { transform: scale(1.02); }

  /* Indicador de reordenamiento */
  .reorder-indicator {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background-color: var(--color-primary);
    border-radius: 50%;
    width: 28px; height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    box-shadow: 0 2px 8px rgba(90,140,98,0.4);
  }

  /* Wrapper de imagen */
  .card-image-wrapper {
    position: relative;
    aspect-ratio: 3/4;
    border-radius: var(--radius-md);
    overflow: hidden;
    background-color: var(--color-surface-alt);
    border: 2px solid transparent;
    transition: border-color var(--transition-fast);
  }

  .grid-card:hover .card-image-wrapper { border-color: var(--color-surface); }

  .card-image {
    width: 100%; height: 100%;
    object-fit: cover;
    transition: transform 0.5s ease;
    display: block;
  }

  .grid-card:hover .card-image { transform: scale(1.05); }

  .card-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    opacity: 0.3;
  }

  /* Badges de status sobre la imagen */
  .status-badge {
    position: absolute;
    top: 8px; right: 8px;
    width: 24px; height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  }

  .status-badge.approved  { background-color: var(--color-success); }
  .status-badge.rejected  { background-color: var(--color-error); }

  /* Metadata */
  .card-meta { padding: 8px 2px 4px; }

  .card-name {
    font-size: 11px;
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
    transition: color var(--transition-fast);
  }

  .grid-card:hover .card-name { color: var(--color-light); }

  .card-status {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--color-light-grey);
    text-transform: capitalize;
  }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Botón Finalizar ── */
  .btn-finalizar {
    position: absolute;
    top: 0;
    right: 80px; /* deja espacio para la toolbar derecha */
    transform: none;
    display: none; /* lo muestra el TopBar cuando viewMode es grid */
    /* En realidad lo mostramos aquí como botón flotante */
  }

  /* Mostrar el botón Finalizar en la toolbar ya que el grid ocupa toda la pantalla */
  /* Rediseñado como botón en la toolbar superior */
  .btn-finalizar {
    display: flex;
    position: fixed;
    top: 16px;
    right: 100px;
    z-index: 30;
    align-items: center;
    gap: 8px;
    background-color: var(--color-primary);
    color: white;
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    border: none;
    border-radius: var(--radius-lg);
    padding: 10px 20px;
    min-height: var(--touch-target-min);
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(90,140,98,0.3);
    transition: all var(--transition-base);
  }

  .btn-finalizar:hover { background-color: var(--color-primary-hover); box-shadow: 0 4px 16px rgba(90,140,98,0.4); }

  .finalized-badge {
    position: fixed;
    top: 20px;
    right: 100px;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background-color: var(--color-error);
    color: white;
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: var(--fw-bold);
  }

  /* ── Modales ── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }

  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 28px;
    width: 100%;
    max-width: 460px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }
  .modal-subtitle-small { font-size: var(--text-xs); color: var(--color-light-grey); margin: 0; }
  .modal-desc { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.6; margin: 0; }

  .modal-desc strong { color: var(--color-light); }

  .finalize-icon-row { display: flex; align-items: center; gap: 12px; }

  .finalize-icon {
    width: 44px; height: 44px;
    border-radius: 50%;
    background-color: var(--color-highlight);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .modal-field { display: flex; flex-direction: column; gap: 6px; }
  .modal-label { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); }

  .modal-input {
    font-family: var(--font-family);
    font-size: var(--text-base);
    color: var(--color-light);
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    outline: none;
    transition: border-color var(--transition-base);
    min-height: var(--touch-target-min);
  }

  .modal-input:focus { border-color: var(--color-primary); }

  .modal-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
  }

  .modal-btn.cancel { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover { color: var(--color-light); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
  .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

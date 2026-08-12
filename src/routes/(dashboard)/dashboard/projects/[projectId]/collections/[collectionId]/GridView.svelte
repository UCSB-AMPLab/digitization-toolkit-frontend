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
  //   [Filtros | Renumerar]      [🖐 Reordenar / Listo]  [slider ──●──]
  //
  // SLIDER: controla el número de columnas del grid
  //   izquierda (2) = cards grandes | derecha (6) = cards pequeñas
  //
  // TOOLBAR SUPERIOR:
  //   Filtros | Renumerar           [Reordenar 🖐 ──●── ] [Finalizar]
  //
  //   - Filtros     → panel de filtros por estado
  //   - Renumerar   → renumera secuencialmente los archivos de imagen (desde 1)
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

  import { recordsApi, collectionsApi, type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  // @ts-ignore — installed in Docker, not locally
  import { dndzone } from 'svelte-dnd-action';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    records,
    collectionId,
    triggerFinalizeModal,
    onRecordsUpdate,
    onFinalized,
    onFinalizeModalClosed,
    onRecordClick,
  }: {
    records: Record[];
    collectionId: number;
    triggerFinalizeModal: boolean;
    onRecordsUpdate: () => void;
    onFinalized: () => void;
    onFinalizeModalClosed: () => void;
    // Mismo patrón que ListView: click en una tarjeta (simple o par L/R) va
    // al Book view (spread) de ese registro — el spread ya muestra L y R
    // juntos, así que no hace falta lógica especial para el caso de par.
    onRecordClick: (record: Record) => void;
  } = $props();

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

  // Modal de Renumerar
  let showRenumberModal = $state(false);
  let renumbering       = $state(false);
  let renumberError     = $state<string | null>(null);

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

  // ---------------------------------------------------------------------------
  // GRID GROUPS: una entrada por registro, con 1 o 2 imágenes adentro
  //
  // Un registro con captura doble (izq + der) agrupa sus dos imágenes en un
  // único GridGroup — NEH-211: el par L/R se envuelve en un solo contenedor
  // rectangular en vez de mostrarse como dos tarjetas independientes, para
  // que se lea como una sola unidad (y, si algún día hay drag-and-drop en
  // esta vista, el par se mueva junto). Un registro de captura simple
  // produce un GridGroup con un solo item — mismo criterio de rol que
  // ThumbnailStrip.svelte (misma carpeta), reutilizado acá.
  // ---------------------------------------------------------------------------
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
    // Izquierda primero, luego derecha, luego sin rol (id como desempate)
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

  // ---------------------------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------------------------

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
      onRecordsUpdate();
    } catch (err) {
      console.error('[GridView] Error reordenando:', err);
      onRecordsUpdate(); // restore from server
    }
  }

  async function handleConfirmRenumber() {
    renumbering = true;
    renumberError = null;
    try {
      await collectionsApi.renumberImages(collectionId);
      showRenumberModal = false;
      onRecordsUpdate();
    } catch (err) {
      renumberError = err instanceof Error ? err.message : String(err);
    } finally {
      renumbering = false;
    }
  }

  function handleCloseRenumberModal() {
    if (renumbering) return; // no cerrar mientras la operación está en curso
    showRenumberModal = false;
    renumberError = null;
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
          {isReorderMode ? $m.col_reorder_done : $m.col_reorder}
        </button>
      </div>
    </div>

    <!-- Derecha: Slider de columnas, solo -->
    <div class="toolbar-right">
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
        title={$m.col_thumb_size}
        aria-label={$m.col_columns_aria}
      />
    </div>

  </div>

  <!-- Panel de filtros -->
  {#if showFilterPanel}
    <div class="filter-panel">
      <span class="filter-title">{$m.col_filter_by_status}</span>
      <div class="filter-chips">
        {#each [
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

  <!-- ── CUADRÍCULA ── -->
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
          <!-- NEH-211: el par L/R se arrastra como una sola unidad — el
               rectángulo que lo enmarca en la vista normal es también el
               único elemento draggable acá, no dos por separado. -->
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
        <!-- NEH-211: par L/R envuelto en un único contenedor rectangular -->
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

  <!-- Badge L/R — solo si el registro tiene captura doble -->
  {#if item.role}
    <div class="role-badge" class:right={item.role === 'R'}>{item.role}</div>
  {/if}
{/snippet}

<!-- ============================================================
     MODAL: Renumerar
     ============================================================ -->
{#if showRenumberModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) handleCloseRenumberModal(); }}>
    <div class="modal-card">
      <h3 class="modal-title">{$m.col_renumber_modal_title}</h3>
      <p class="modal-subtitle">{$m.col_renumber_desc}</p>
      {#if renumberError}
        <div class="modal-error-banner" role="alert" aria-live="polite">{$m.col_renumber_error(renumberError)}</div>
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
          <h3 class="modal-title">{$m.col_finalize_title}</h3>
          <p class="modal-subtitle-sm">{$m.col_finalize_subtitle}</p>
        </div>
      </div>
      <p class="modal-desc">
        {$m.col_finalize_p1}<strong>{$m.col_finalize_bold}</strong>{$m.col_finalize_p2}
      </p>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={handleCancelFinalize} disabled={isFinalizing}>
          {$m.common_cancel}
        </button>
        <button class="modal-btn confirm" onclick={handleConfirmFinalize} disabled={isFinalizing}>
          {isFinalizing ? $m.col_finalizing : $m.col_finalize_btn}
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
  .toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .toolbar-btn:disabled:hover { color: var(--color-light-grey); background-color: transparent; }

  .toolbar-divider { width: 1px; height: 18px; background-color: var(--border-color); margin: 0 4px; }

  /* Reordenar group */
  /* padding-left: 12px iguala el padding izquierdo de .toolbar-btn (6px
     12px) — sin esto, el ícono de mano queda pegado al divisor mientras
     el ícono de Renumerar (dentro de un botón con ese padding) no. */
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
    /* Compartida con .pair-thumbs (NEH-211): el gap interno del par debe
       ser idéntico al gap del grid para que cada miniatura L/R mida
       exactamente lo mismo que una miniatura de documento simple —
       ver comentario en .grid-pair más abajo. */
    --grid-gap: 16px;
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

  /* ── Par L/R (NEH-211) ──
     El wrapper ocupa 2 columnas reales del grid (grid-column: span 2), no
     una sola comprimida. Adentro, .pair-thumbs reparte ese ancho en dos
     .card-image-wrapper con el MISMO gap que usa .image-grid
     (var(--grid-gap)) y sin padding/border propios — border-box con
     padding o border restaría ancho y volvería a achicar las miniaturas
     (ver bug anterior). Álgebra: ancho del wrapper = 2·col + gap; al
     partirlo en dos con ese mismo gap en el medio, cada mitad da
     exactamente `col` — igual que una miniatura de documento simple.
     El marco combina un `outline` fino (no `border`: un outline no
     participa en el box model/layout, así que no resta ancho) con un
     relleno verde transparente detrás de las miniaturas. Ese relleno es
     un ::before absolutamente posicionado (tampoco participa en el layout
     del flex) que se extiende un poco más allá de .pair-thumbs con
     `inset` negativo — al no llevar z-index compite en el mismo nivel de
     stacking que .card-image-wrapper y, por ir primero en el DOM, queda
     atrás sin necesidad de tocarlo. */
  .grid-pair {
    grid-column: span 2;
    position: relative;
    display: flex;
    flex-direction: column;
    transition: transform var(--transition-base);
    cursor: pointer;
  }

  .grid-pair:not(.draggable):hover { transform: translateY(-3px); }
  .grid-pair.draggable { transform: scale(1.01); cursor: grab; }
  .grid-pair.draggable:hover { transform: scale(1.02); }

  .pair-thumbs {
    position: relative;
    display: flex;
    gap: var(--grid-gap);
    border-radius: var(--radius-md);
    outline: 1px solid var(--color-primary);
    outline-offset: 3px;
  }

  .pair-thumbs::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: var(--radius-md);
    background-color: rgba(90, 140, 98, 0.16);
    pointer-events: none;
  }

  /* Reutiliza .card-image-wrapper (mismo aspect-ratio/border/radius que un
     documento simple) — flex:1 1 0 reparte el ancho 50/50 dentro del par. */
  .pair-thumbs .card-image-wrapper {
    flex: 1 1 0;
    min-width: 0;
  }

  .pair-meta { text-align: center; }
  .pair-name { text-align: center; }

  /* Badge L/R — mismo estilo que ThumbnailStrip.svelte (misma carpeta). */
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

  .finalize-header { display: flex; align-items: center; gap: 12px; }
  .finalize-icon { width: 44px; height: 44px; border-radius: 50%; background-color: var(--color-highlight); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

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
<script lang="ts">
  // ============================================================================
  // PÁGINA: Galería de colección
  // Ruta: /dashboard/projects/[projectId]/collections/[collectionId]
  //
  // Reemplaza la antigua vista de lista de registros con la galería completa.
  // La navegación superior (breadcrumb, botón cámara) vive en +layout@.svelte.
  //
  // Componentes hijos:
  //   LeftSidebar.svelte      → strip de íconos + paneles (en list y spread)
  //   ListView.svelte         → vista de lista de registros
  //   ImageViewer.svelte      → visor en modo spread
  //   ImageViewerModal.svelte → modal de inspección (desde ListView)
  //   GridView.svelte         → vista cuadrícula (con Filtros/Renombrar/Finalizar)
  //   RightToolbar.svelte     → toolbar flotante derecha
  //   ThumbnailStrip.svelte   → tira de miniaturas inferior (solo en spread)
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore, userRole } from '$lib/stores/auth';
  import { recordsApi, collectionsApi, ApiError, type Record } from '$lib/api';
  import { m } from '$lib/i18n';
  import JSZip from 'jszip';

  import LeftSidebar from './LeftSidebar.svelte';
  import ListView from './ListView.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';
  import GridView from './GridView.svelte';
  import RightToolbar from './RightToolbar.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';
  import RecordStatusBar from '$lib/components/RecordStatusBar.svelte';

  // ---------------------------------------------------------------------------
  // PARÁMETROS DE RUTA
  // ---------------------------------------------------------------------------
  let projectId    = $derived(Number($page.params.projectId) || 0);
  let collectionId = $derived(Number($page.params.collectionId) || 0);
  let collectionName = $derived(($page.data as any).collectionName ?? '');

  // ---------------------------------------------------------------------------
  // ESTADO GLOBAL
  // ---------------------------------------------------------------------------
  let viewMode         = $state<'list' | 'spread' | 'grid'>('list');
  let selectedRecordId = $state<number | null>(null);
  let records          = $state<Record[]>([]);
  let zoom             = $state(1);
  let rotation         = $state(0);
  let isLoading        = $state(true);

  // Registro inspeccionado en el modal (desde ListView)
  let inspectedRecord = $state<Record | null>(null);

  // Estado de finalización
  let isFinalized = $state(false);

  // Trigger para abrir el modal de finalización dentro de GridView
  let triggerFinalizeModal = $state(false);

  // ---------------------------------------------------------------------------
  // AL MONTAR
  // ---------------------------------------------------------------------------
  onMount(async () => {
    if (!authStore.requireSession()) {
      return;
    }
    await loadRecords();
  });

  async function loadRecords() {
    try {
      isLoading = true;
      const data = await recordsApi.listAll({ collection_id: collectionId });
      // Sort by sequence (nulls last), then by id
      records = data.sort((a, b) => {
        if (a.sequence == null && b.sequence == null) return a.id - b.id;
        if (a.sequence == null) return 1;
        if (b.sequence == null) return -1;
        return a.sequence - b.sequence;
      });
      if (records.length > 0) selectedRecordId = records[0].id;
    } catch (err) {
      console.error('[Gallery] Error cargando registros:', err);
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  function handlePrev() {
    const idx = records.findIndex(r => r.id === selectedRecordId);
    if (idx > 0) selectedRecordId = records[idx - 1].id;
  }

  function handleNext() {
    const idx = records.findIndex(r => r.id === selectedRecordId);
    if (idx < records.length - 1) selectedRecordId = records[idx + 1].id;
  }

  function handleSelect(id: number) { selectedRecordId = id; }

  function handleViewModeChange(mode: 'list' | 'spread' | 'grid') {
    viewMode = mode;
    zoom = 1;
    rotation = 0;
  }

  function handleRotateLeft()  { rotation = ((rotation - 90) % 360 + 360) % 360; }
  function handleRotateRight() { rotation = (rotation + 90) % 360; }

  // Retomar: navega a live-preview con el mismo proyecto/colección + el
  // record puntual, para que live-preview abra directo su modal de retoma
  // (NEH-209 — antes se perdía el record.id acá y había que buscarlo de
  // nuevo manualmente en la tira de miniaturas de live-preview).
  function handleRetake(record: Record) {
    inspectedRecord = null;
    goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}&recordId=${record.id}`);
  }

  // Recapturar desde Book view (NEH-209): mismo destino que handleRetake,
  // disparado desde el botón "Recapturar imagen" del panel izquierdo en vez
  // del modal de inspección de ListView.
  function handleRecapture(record: Record) {
    goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}&recordId=${record.id}`);
  }

  // Eliminar registro completo y refrescar lista
  async function handleDeleteRecord(record: Record) {
    try {
      await recordsApi.delete(record.id);
      await loadRecords();
    } catch (err) {
      console.error('[Gallery] Error eliminando registro:', err);
    } finally {
      inspectedRecord = null;
    }
  }

  // GridView confirmó la finalización
  function handleFinalized() {
    isFinalized = true;
    triggerFinalizeModal = false;
  }

  // GridView canceló o cerró el modal sin finalizar
  function handleFinalizeModalClosed() {
    triggerFinalizeModal = false;
  }

  // BagIt export
  let showExportModal = $state(false);
  let isExporting     = $state(false);
  let exportResult    = $state<{ zip_filename: string } | null>(null);
  let exportError     = $state<string | null>(null);
  let exportProgress  = $state<{ done: number; total: number } | null>(null);
  // Registros que impiden exportar (aún no aprobados)
  let showBlockersModal = $state(false);

  const hasCurrentImage = (r: Record) => (r.images ?? []).some((i) => i.is_current);
  let blockingRecords   = $derived(records.filter(r => r.status !== 'approved' || !hasCurrentImage(r)));

  // Selector Exportar/Descargar + descarga de imágenes (ZIP) en el navegador
  let showChooserModal = $state(false);
  let isZipping        = $state(false);
  let zipProgress      = $state(0);
  let zipError         = $state<string | null>(null);

  async function handleExport() {
    if (!canExport) { showBlockersModal = true; return; }
    showExportModal = true;
    isExporting = true;
    exportResult = null;
    exportError = null;
    exportProgress = null;
    try {
      // Export runs as a background job on the appliance
      const { job_id } = await collectionsApi.exportBagit(collectionId);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 700));
        const st = await collectionsApi.getExportStatus(collectionId, job_id);
        exportProgress = { done: st.done, total: st.total };
        if (st.state === 'done' && st.zip_filename) {
          exportResult = { zip_filename: st.zip_filename };
          break;
        }
        if (st.state === 'failed') {
          exportError = st.error ?? $m.col_err_export;
          break;
        }
      }
    } catch (err: any) {
      // El cliente pre-valida canExport contra el estado local de records,
      // pero ese estado puede quedar desactualizado (otro operador aprobó/
      // rechazó registros entre tanto). Si el backend igual devuelve un 422
      // con blocking_record_ids, refrescamos records y mostramos el modal
      // de bloqueadores real en vez del modal de error genérico.
      const detail = err instanceof ApiError ? (err.detail as { blocking_record_ids?: number[] } | undefined) : undefined;
      if (detail?.blocking_record_ids) {
        showExportModal = false;
        await loadRecords();
        showBlockersModal = true;
      } else {
        exportError = err?.message ?? $m.col_err_export;
      }
    } finally {
      isExporting = false;
    }
  }

  // Descarga de imágenes como ZIP, generado en el navegador (sin backend).
  // Nota: para volúmenes muy grandes convendría un endpoint del backend (mejora futura).
  async function downloadImagesZip() {
    const items = records.flatMap(r => (r.images ?? []).map(img => ({ img, r })));
    if (items.length === 0) return;
    isZipping = true;
    zipProgress = 0;
    zipError = null;
    try {
      const zip = new JSZip();
      let done = 0;
      for (const { img, r } of items) {
        const res = await fetch(recordsApi.getImageFileUrl(img.id));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const ext = (img.format || img.filename?.split('.').pop() || 'jpg').toLowerCase();
        const base = (r.title || `registro-${r.id}`).replace(/[\/\\:*?"<>|]+/g, '').replace(/\s+/g, '_');
        const seq = String(done + 1).padStart(3, '0');
        zip.file(`${seq}_${base}_${img.id}.${ext}`, blob);
        done++;
        zipProgress = Math.round((done / items.length) * 100);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      const safeName = ((collectionName || `coleccion-${collectionId}`).replace(/[\/\\:*?"<>|]+/g, '').replace(/\s+/g, '_')) || `coleccion-${collectionId}`;
      a.download = `${safeName}-imagenes.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      zipError = e?.message ?? $m.col_zip_error;
    } finally {
      isZipping = false;
    }
  }

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------
  let selectedRecord = $derived(records.find(r => r.id === selectedRecordId) ?? null);
  let selectedIndex  = $derived(records.findIndex(r => r.id === selectedRecordId) + 1);
  let canExport      = $derived(records.length > 0 && records.every(r => r.status === 'approved' && hasCurrentImage(r)));
</script>

<!-- ============================================================
     LAYOUT DE GALERÍA
     (la barra superior vive en +layout@.svelte)
     ============================================================ -->
<div class="gallery-wrapper">

  <!-- En lista la leyenda vive dentro de la barra de Reordenar, no aparte -->
  {#if viewMode !== 'list'}
    <RecordStatusBar {records} />
  {/if}

  <div class="content-area">

    <!-- Panel lateral: solo en spread (vista libro) -->
    {#if viewMode === 'spread'}
      <LeftSidebar
        {viewMode}
        currentRecord={selectedRecord}
        currentIndex={selectedIndex}
        totalRecords={records.length}
        userRole={$userRole}
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
        onRecordUpdated={loadRecords}
        onRecapture={handleRecapture}
      />
    {/if}

    <div class="center-column">

      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <span>{$m.col_loading_images}</span>
        </div>

      {:else if viewMode === 'grid'}
        <GridView
          {records}
          {collectionId}
          {triggerFinalizeModal}
          onRecordsUpdate={loadRecords}
          onFinalized={handleFinalized}
          onFinalizeModalClosed={handleFinalizeModalClosed}
          onRecordClick={(r) => { selectedRecordId = r.id; viewMode = 'spread'; }}
        />

      {:else if viewMode === 'list'}
        <ListView
          {records}
          {collectionId}
          onRecordClick={(r) => { selectedRecordId = r.id; viewMode = 'spread'; }}
          onRecordsUpdate={loadRecords}
        />

      {:else if viewMode === 'spread'}
        <ImageViewer
          {viewMode}
          {records}
          {selectedRecordId}
          {zoom}
          {rotation}
          onPrev={handlePrev}
          onNext={handleNext}
          onZoomChange={(z) => zoom = z}
        />
        <div class="thumbnail-area">
          <ThumbnailStrip
            {records}
            {selectedRecordId}
            {viewMode}
            onSelect={handleSelect}
          />
        </div>
      {/if}

    </div>

    <RightToolbar
      {viewMode}
      {zoom}
      {canExport}
      onViewModeChange={handleViewModeChange}
      onZoomChange={(z) => zoom = z}
      onRotateLeft={handleRotateLeft}
      onRotateRight={handleRotateRight}
      onExport={() => showChooserModal = true}
    />

  </div>

</div>

<!-- Modal de inspección (desde ListView) -->
{#if inspectedRecord}
  <ImageViewerModal
    record={inspectedRecord}
    userRole={$userRole}
    onClose={() => inspectedRecord = null}
    onRetake={handleRetake}
    onDelete={handleDeleteRecord}
  />
{/if}

<!-- Modal de exportación BagIt -->
{#if showExportModal}
  <div class="export-modal-backdrop" role="dialog" aria-modal="true">
    <div class="export-modal-card">
      {#if isExporting}
        <div class="spinner"></div>
        <h3 class="export-modal-title">{$m.col_export_generating}</h3>
        <p class="export-modal-subtitle">
          {#if exportProgress && exportProgress.total > 0}
            {exportProgress.done} / {exportProgress.total}
          {:else}
            {$m.col_export_copying}
          {/if}
        </p>
      {:else if exportResult}
        <span class="material-symbols-outlined icon-lg export-success-icon">check_circle</span>
        <h3 class="export-modal-title">{$m.col_export_done}</h3>
        <p class="export-modal-subtitle">{exportResult.zip_filename}</p>
        <div class="export-modal-actions">
          <a href={collectionsApi.getExportDownloadUrl(collectionId)} download class="btn-primary">
            <span class="material-symbols-outlined icon-sm">download</span>
            {$m.col_download_zip}
          </a>
          <button class="btn-secondary" onclick={() => showExportModal = false}>{$m.common_close}</button>
        </div>
      {:else if exportError}
        <span class="material-symbols-outlined icon-lg export-error-icon">error</span>
        <h3 class="export-modal-title">{$m.col_err_export}</h3>
        <p class="export-modal-subtitle">{exportError}</p>
        <div class="export-modal-actions">
          <button class="btn-secondary" onclick={() => showExportModal = false}>{$m.common_close}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
<!-- Modal: registros que bloquean la exportación -->
{#if showBlockersModal}
  <div class="export-modal-backdrop" role="dialog" aria-modal="true">
    <div class="export-modal-card">
      <span class="material-symbols-outlined icon-lg export-error-icon">block</span>
      <h3 class="export-modal-title">{$m.col_export_blocked_title}</h3>
      <p class="export-modal-subtitle">{$m.col_export_blocked_desc}</p>
      <ul class="blockers-list">
        {#each blockingRecords as r}
          <li>
            <button class="blocker-item" onclick={() => { showBlockersModal = false; inspectedRecord = r; }}>
              <span class="material-symbols-outlined icon-sm">image</span>
              {r.title || $m.record_fallback_title(r.id)}
            </button>
          </li>
        {/each}
      </ul>
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={() => showBlockersModal = false}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}
<!-- Modal: elegir exportación BagIt o descarga de imágenes -->
{#if showChooserModal}
  <div class="export-modal-backdrop" role="dialog" aria-modal="true">
    <div class="export-modal-card">
      <h3 class="export-modal-title">{$m.col_download_choose_title}</h3>
      <p class="export-modal-subtitle">{$m.col_download_choose_desc}</p>
      <div class="chooser-options">
        <button class="chooser-option" onclick={() => { showChooserModal = false; handleExport(); }}>
          <span class="material-symbols-outlined chooser-icon bagit">inventory_2</span>
          <span class="chooser-text">
            <span class="chooser-title">{$m.col_bagit_option_title}</span>
            <span class="chooser-desc">{$m.col_bagit_option_desc}</span>
            <span class="chooser-chip amber"><span class="material-symbols-outlined">lock</span>{$m.col_bagit_requires_approval}</span>
          </span>
        </button>
        <button class="chooser-option" onclick={() => { showChooserModal = false; downloadImagesZip(); }}>
          <span class="material-symbols-outlined chooser-icon images">image</span>
          <span class="chooser-text">
            <span class="chooser-title">{$m.col_images_option_title}</span>
            <span class="chooser-desc">{$m.col_images_option_desc}</span>
            <span class="chooser-chip green"><span class="material-symbols-outlined">check</span>{$m.col_images_always}</span>
          </span>
        </button>
      </div>
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={() => showChooserModal = false}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}
<!-- Modal: progreso / error del ZIP de imágenes -->
{#if isZipping || zipError}
  <div class="export-modal-backdrop" role="dialog" aria-modal="true">
    <div class="export-modal-card">
      {#if isZipping}
        <div class="spinner"></div>
        <h3 class="export-modal-title">{$m.col_zip_generating}</h3>
        <p class="export-modal-subtitle">{zipProgress}%</p>
      {:else if zipError}
        <span class="material-symbols-outlined icon-lg export-error-icon">error</span>
        <h3 class="export-modal-title">{$m.col_zip_error}</h3>
        <p class="export-modal-subtitle">{zipError}</p>
        <div class="export-modal-actions">
          <button class="btn-secondary" onclick={() => zipError = null}>{$m.common_close}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes spin { to { transform: rotate(360deg); } }

  .chooser-options { display: flex; flex-direction: column; gap: 12px; width: 100%; margin: 6px 0 4px; }
  .chooser-option {
    display: flex; gap: 14px; text-align: left; width: 100%;
    padding: 14px; border: 1px solid var(--border-color); border-radius: 12px;
    background: var(--color-surface); color: var(--color-light); cursor: pointer;
    font-family: var(--font-family);
    transition: background-color var(--transition-fast), border-color var(--transition-fast);
  }
  .chooser-option:hover { background: var(--color-surface-alt-2); border-color: var(--color-primary); }
  .chooser-icon { flex-shrink: 0; width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .chooser-icon.bagit { background: rgba(90,140,98,0.16); color: var(--color-primary); }
  .chooser-icon.images { background: rgba(150,177,240,0.15); color: var(--color-secondary); }
  .chooser-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .chooser-title { font-size: 15px; font-weight: var(--fw-semibold); }
  .chooser-desc { font-size: 12.5px; color: var(--color-light-grey); line-height: 1.5; }
  .chooser-chip { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 11px; padding: 3px 9px; border-radius: var(--radius-full); width: fit-content; }
  .chooser-chip .material-symbols-outlined { font-size: 13px; }
  .chooser-chip.amber { color: var(--color-highlight); background: rgba(225,183,120,0.14); }
  .chooser-chip.green { color: var(--color-primary); background: rgba(90,140,98,0.14); }
  .blockers-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .blocker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }
  .blocker-item:hover { background: var(--color-surface-alt-2); }
</style>

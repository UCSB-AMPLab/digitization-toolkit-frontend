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
  import { recordsApi, collectionsApi, type Record } from '$lib/api';

  import LeftSidebar from './LeftSidebar.svelte';
  import ListView from './ListView.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';
  import GridView from './GridView.svelte';
  import RightToolbar from './RightToolbar.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';
  import RecordStatusBar from '$lib/components/RecordStatusBar.svelte';
  import ActionBar from './ActionBar.svelte';

  // ---------------------------------------------------------------------------
  // PARÁMETROS DE RUTA
  // ---------------------------------------------------------------------------
  let projectId    = $derived(Number($page.params.projectId) || 0);
  let collectionId = $derived(Number($page.params.collectionId) || 0);

  // ---------------------------------------------------------------------------
  // ESTADO GLOBAL
  // ---------------------------------------------------------------------------
  let viewMode         = $state<'list' | 'spread' | 'grid'>('list');
  let selectedRecordId = $state<number | null>(null);
  let records          = $state<Record[]>([]);
  let zoom             = $state(1);
  let rotation         = $state(0);
  let isLoading        = $state(true);

  // Multi-select state
  let selectedIds   = $state<Set<number>>(new Set());
  let isSelectMode  = $state(false);

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
    if (!authStore.isAuthenticated()) {
      goto('/login');
      return;
    }
    await loadRecords();
  });

  async function loadRecords() {
    try {
      isLoading = true;
      const data = await recordsApi.list({ collection_id: collectionId });
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

  // Retomar: navega a live-preview con el mismo proyecto/colección
  function handleRetake(record: Record) {
    inspectedRecord = null;
    goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}`);
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

  // Multi-select handlers
  function handleToggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    selectedIds = next;
    isSelectMode = next.size > 0;
  }

  function handleDeselectAll() {
    selectedIds = new Set();
    isSelectMode = false;
  }

  async function handleBulkStatusChange(status: Record['status'], rejectionNote?: string) {
    try {
      await recordsApi.bulkUpdateStatus(Array.from(selectedIds), status, rejectionNote);
      await loadRecords();
      handleDeselectAll();
    } catch (err) {
      console.error('[Gallery] Error actualizando estado:', err);
    }
  }

  // BagIt export
  let showExportModal = $state(false);
  let isExporting     = $state(false);
  let exportResult    = $state<{ bag_name: string; zip_filename: string; size_bytes: number; download_url: string } | null>(null);
  let exportError     = $state<string | null>(null);

  async function handleExport() {
    showExportModal = true;
    isExporting = true;
    exportResult = null;
    exportError = null;
    try {
      const result = await collectionsApi.exportBagit(collectionId);
      exportResult = result;
    } catch (err: any) {
      exportError = err?.message ?? 'Error al exportar';
    } finally {
      isExporting = false;
    }
  }

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------
  let selectedRecord = $derived(records.find(r => r.id === selectedRecordId) ?? null);
  let selectedIndex  = $derived(records.findIndex(r => r.id === selectedRecordId) + 1);
  let canExport      = $derived(records.length > 0 && records.every(r => r.status === 'approved'));
</script>

<!-- ============================================================
     LAYOUT DE GALERÍA
     (la barra superior vive en +layout@.svelte)
     ============================================================ -->
<div class="gallery-wrapper">

  <RecordStatusBar {records} />

  <div class="content-area">

    <!-- Panel lateral: en list y spread -->
    {#if viewMode !== 'grid'}
      <LeftSidebar
        {viewMode}
        currentRecord={selectedRecord}
        currentIndex={selectedIndex}
        totalRecords={records.length}
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
      />
    {/if}

    <div class="center-column">

      {#if isLoading}
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Cargando imágenes...</span>
        </div>

      {:else if viewMode === 'grid'}
        <GridView
          {records}
          {collectionId}
          {selectedIds}
          {triggerFinalizeModal}
          onRecordsUpdate={loadRecords}
          onFinalized={handleFinalized}
          onFinalizeModalClosed={handleFinalizeModalClosed}
          onToggleSelect={handleToggleSelect}
        />

      {:else if viewMode === 'list'}
        <ListView
          {records}
          {collectionId}
          {selectedIds}
          onRecordClick={(r) => { selectedRecordId = r.id; inspectedRecord = r; }}
          onToggleSelect={handleToggleSelect}
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
      onExport={handleExport}
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
    onStatusChange={async (id, status) => { await recordsApi.updateStatus(id, status); await loadRecords(); inspectedRecord = null; }}
  />
{/if}

<!-- Barra de acciones multi-selección -->
<ActionBar
  selectedCount={selectedIds.size}
  userRole={$userRole}
  onBulkStatusChange={handleBulkStatusChange}
  onDeselect={handleDeselectAll}
/>

<!-- Modal de exportación BagIt -->
{#if showExportModal}
  <div class="export-modal-backdrop" role="dialog" aria-modal="true">
    <div class="export-modal-card">
      {#if isExporting}
        <div class="spinner"></div>
        <h3 class="export-modal-title">Generando BagIt...</h3>
        <p class="export-modal-subtitle">Copiando imágenes y calculando checksums</p>
      {:else if exportResult}
        <span class="material-symbols-outlined icon-lg export-success-icon">check_circle</span>
        <h3 class="export-modal-title">Exportación completada</h3>
        <p class="export-modal-subtitle">{exportResult.zip_filename}</p>
        <p class="export-modal-subtitle">{(exportResult.size_bytes / 1024 / 1024).toFixed(1)} MB</p>
        <div class="export-modal-actions">
          <a href={collectionsApi.getExportDownloadUrl(collectionId)} download class="btn-primary">
            <span class="material-symbols-outlined icon-sm">download</span>
            Descargar ZIP
          </a>
          <button class="btn-secondary" onclick={() => showExportModal = false}>Cerrar</button>
        </div>
      {:else if exportError}
        <span class="material-symbols-outlined icon-lg export-error-icon">error</span>
        <h3 class="export-modal-title">Error al exportar</h3>
        <p class="export-modal-subtitle">{exportError}</p>
        <div class="export-modal-actions">
          <button class="btn-secondary" onclick={() => showExportModal = false}>Cerrar</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

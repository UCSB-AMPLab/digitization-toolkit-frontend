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
  import { authStore } from '$lib/stores/auth';
  import { recordsApi, type Record } from '$lib/api';

  import LeftSidebar from './LeftSidebar.svelte';
  import ListView from './ListView.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';
  import GridView from './GridView.svelte';
  import RightToolbar from './RightToolbar.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';

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
      records = data;
      if (data.length > 0) selectedRecordId = data[0].id;
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

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------
  let selectedRecord = $derived(records.find(r => r.id === selectedRecordId) ?? null);
  let selectedIndex  = $derived(records.findIndex(r => r.id === selectedRecordId) + 1);
</script>

<!-- ============================================================
     LAYOUT DE GALERÍA
     (la barra superior vive en +layout@.svelte)
     ============================================================ -->
<div class="gallery-wrapper">

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
          {triggerFinalizeModal}
          onRecordsUpdate={loadRecords}
          onFinalized={handleFinalized}
          onFinalizeModalClosed={handleFinalizeModalClosed}
        />

      {:else if viewMode === 'list'}
        <ListView
          {records}
          onRecordClick={(r) => { selectedRecordId = r.id; inspectedRecord = r; }}
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
      onViewModeChange={handleViewModeChange}
      onZoomChange={(z) => zoom = z}
      onRotateLeft={handleRotateLeft}
      onRotateRight={handleRotateRight}
    />

  </div>

</div>

<!-- Modal de inspección (desde ListView) -->
{#if inspectedRecord}
  <ImageViewerModal
    record={inspectedRecord}
    onClose={() => inspectedRecord = null}
    onRetake={handleRetake}
    onDelete={handleDeleteRecord}
  />
{/if}

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

<script lang="ts">
  // ============================================================================
  // PÁGINA: Galería de colección
  // Ruta: /dashboard/projects/[projectId]/collections/[collectionId]
  //
  // Reemplaza la antigua vista de lista de registros con la galería completa.
  // La navegación superior (breadcrumb, botón cámara) vive en +layout@.svelte.
  //
  // Componentes hijos:
  //   LeftSidebar.svelte    → strip de íconos + paneles (solo en single/spread)
  //   ImageViewer.svelte    → visor de imagen (single y spread)
  //   GridView.svelte       → vista cuadrícula (con Filtros/Renombrar/Finalizar)
  //   RightToolbar.svelte   → toolbar flotante derecha
  //   ThumbnailStrip.svelte → tira de miniaturas inferior
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { recordsApi, type Record } from '$lib/api';

  import LeftSidebar from './LeftSidebar.svelte';
  import ImageViewer from './ImageViewer.svelte';
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
  let viewMode         = $state<'single' | 'spread' | 'grid'>('single');
  let selectedRecordId = $state<number | null>(null);
  let records          = $state<Record[]>([]);
  let zoom             = $state(1);
  let rotation         = $state(0);
  let isLoading        = $state(true);

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

  function handleViewModeChange(mode: 'single' | 'spread' | 'grid') {
    viewMode = mode;
    zoom = 1;
    rotation = 0;
  }

  function handleRotateLeft()  { rotation = ((rotation - 90) % 360 + 360) % 360; }
  function handleRotateRight() { rotation = (rotation + 90) % 360; }

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

    <!-- Panel lateral: solo en single y spread -->
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

      {:else}
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

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

<script lang="ts">
  // ============================================================================
  // PÁGINA: Gallery — Ruta: /gallery/[collectionId]
  //
  // Orquestador principal. Aquí vive el estado de `isFinalized` porque
  // afecta tanto al TopBar (badge de estado) como al GridView (modal).
  //
  // Regla de visibilidad del botón "Finalizar" en el TopBar:
  //   ✅ viewMode === 'grid'
  //   ✅ records.length > 0
  //   ✅ !isFinalized

    //
  // Orquestador principal de la vista de galería.
  // Maneja tres vistas:
  //   'single' → una imagen centrada con panel lateral de info/edición/anotaciones
  //   'spread' → dos páginas abiertas como libro
  //   'grid'   → cuadrícula de todas las imágenes con Filtros/Renombrar/Finalizar
  //
  // Componentes hijos:
  //   TopBar.svelte         → barra superior con tabs y controles
  //   LeftSidebar.svelte    → strip de íconos + paneles (solo en single)
  //   ImageViewer.svelte    → visor de imagen (single y spread)
  //   GridView.svelte       → vista cuadrícula
  //   RightToolbar.svelte   → toolbar flotante derecha
  //   ThumbnailStrip.svelte → tira de miniaturas inferior
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { recordsApi, type Record } from '$lib/api';

  import TopBar from './TopBar.svelte';
  import LeftSidebar from './LeftSidebar.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import GridView from './GridView.svelte';
  import RightToolbar from './RightToolbar.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';

  // ---------------------------------------------------------------------------
  // PARÁMETROS DE RUTA
  // ---------------------------------------------------------------------------
  let collectionId = $derived(Number($page.params.collectionId) || 0);

  // ---------------------------------------------------------------------------
  // ESTADO GLOBAL
  // ---------------------------------------------------------------------------
  let viewMode      = $state<'single' | 'spread' | 'grid'>('single');
  let selectedRecordId = $state<number | null>(null);
  let records       = $state<Record[]>([]);
  let zoom          = $state(1);
  let rotation      = $state(0);
  let isLoading     = $state(true);

  // Estado de finalización — vive aquí porque afecta TopBar Y GridView
  let isFinalized   = $state(false);

  // Trigger para abrir el modal de finalización dentro de GridView
  // TopBar lo activa → GridView abre el modal → lo desactiva al cerrar
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
      console.error('[Gallery] Error:', err);
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // DERIVADO: cuándo mostrar el botón "Finalizar"
  // Se pasa al TopBar para que lo muestre en la posición correcta
  // ---------------------------------------------------------------------------
  let showFinalize = $derived(
    viewMode === 'grid' && records.length > 0 && !isFinalized
  );

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

  function handleTabChange(tab: 'live' | 'gallery') {
    if (tab === 'live') {
      const projectId = records[0]?.project_id ?? 0;
      goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}`);
    }
  }

  function handleBack() {
    const projectId = records[0]?.project_id ?? 0;
    if (projectId && collectionId) {
      goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
    } else {
      goto('/dashboard/projects');
    }
  }

  // Botón "Finalizar" en el TopBar fue pulsado:
  // activa el trigger para que GridView abra su modal de confirmación
  function handleFinalizeClick() {
    triggerFinalizeModal = true;
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
     LAYOUT PRINCIPAL
     ============================================================ -->
<div class="gallery-wrapper">

  <!--
    TopBar:
    - showFinalize  → muestra/oculta el botón "Finalizar"
    - isFinalized   → cambia badge "In review" → "Terminado"
    - onFinalizeClick → abre el modal de confirmación en GridView
  -->
  <TopBar
    activeTab="gallery"
    {showFinalize}
    {isFinalized}
    onTabChange={handleTabChange}
    onBack={handleBack}
    onFinalizeClick={handleFinalizeClick}
  />

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
        <!--
          GridView recibe:
          - triggerFinalizeModal → cuando true, abre el modal de confirmación
          - onFinalized          → cuando el usuario confirma, notifica al padre
          - onFinalizeModalClosed → cuando el modal se cierra (cancel o confirm)
        -->
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
  .gallery-wrapper {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background-color: var(--color-bg);
    overflow: hidden;
  }

  .content-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  .center-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .thumbnail-area { height: 140px; flex-shrink: 0; }

  .loading-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--color-light-grey);
    font-size: var(--text-base);
  }

  .spinner {
    width: 40px; height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>


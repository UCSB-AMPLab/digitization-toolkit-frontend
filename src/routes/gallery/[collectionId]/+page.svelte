<script lang="ts">
  // ============================================================================
  // PÁGINA: Gallery
  // Ruta: /gallery/[collectionId]
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
  // collectionId viene de /gallery/[collectionId]
  // ---------------------------------------------------------------------------
  let collectionId = $derived(Number($page.params.collectionId) || 0);

  // ---------------------------------------------------------------------------
  // ESTADO GLOBAL
  // ---------------------------------------------------------------------------

  // Vista activa
  // 'single' → imagen individual | 'spread' → libro abierto | 'grid' → cuadrícula
  let viewMode = $state<'single' | 'spread' | 'grid'>('single');

  // Registro seleccionado actualmente
  let selectedRecordId = $state<number | null>(null);

  // Lista completa de registros de la colección
  let records = $state<Record[]>([]);

  // Zoom del visor (solo en single)
  let zoom = $state(1);

  // Rotación de la imagen seleccionada en grados (0, 90, 180, 270)
  let rotation = $state(0);

  // Estado de carga
  let isLoading = $state(true);

  // ---------------------------------------------------------------------------
  // AL MONTAR: verifica auth y carga registros
  // ---------------------------------------------------------------------------
  onMount(async () => {
    if (!authStore.isAuthenticated()) {
      goto('/login');
      return;
    }
    await loadRecords();
  });

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Carga los registros de la colección
  // ---------------------------------------------------------------------------
  async function loadRecords() {
    try {
      isLoading = true;
      const data = await recordsApi.list({ collection_id: collectionId });
      records = data;
      if (data.length > 0) {
        selectedRecordId = data[0].id;
      }
    } catch (error) {
      console.error('[Gallery] Error cargando registros:', error);
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // HANDLERS DE NAVEGACIÓN
  // ---------------------------------------------------------------------------

  // Navegar a registro anterior
  function handlePrev() {
    const idx = records.findIndex(r => r.id === selectedRecordId);
    if (idx > 0) selectedRecordId = records[idx - 1].id;
  }

  // Navegar a registro siguiente
  function handleNext() {
    const idx = records.findIndex(r => r.id === selectedRecordId);
    if (idx < records.length - 1) selectedRecordId = records[idx + 1].id;
  }

  // Cambiar registro desde la tira de miniaturas
  function handleSelect(id: number) {
    selectedRecordId = id;
  }

  // ---------------------------------------------------------------------------
  // HANDLERS DE VISTA
  // ---------------------------------------------------------------------------

  // Al cambiar de vista, resetear zoom y rotación
  function handleViewModeChange(mode: 'single' | 'spread' | 'grid') {
    viewMode = mode;
    zoom = 1;
    rotation = 0;
  }

  // Rotación de imagen (en grados)
  function handleRotateLeft()  { rotation = ((rotation - 90) % 360 + 360) % 360; }
  function handleRotateRight() { rotation = (rotation + 90) % 360; }

  // ---------------------------------------------------------------------------
  // HANDLER: Cambio de tab (ir a Live Scan)
  // ---------------------------------------------------------------------------
  function handleTabChange(tab: 'live' | 'gallery') {
    if (tab === 'live') {
      // Redirige al live preview de la misma colección
      // El projectId se obtendría del record — por ahora usamos 0
      const projectId = records[0]?.project_id ?? 0;
      goto(`/live-preview?projectId=${projectId}&collectionId=${collectionId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // HANDLER: Volver al dashboard
  // ---------------------------------------------------------------------------
  function handleBack() {
    goto('/');
  }

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------
  let selectedRecord = $derived(records.find(r => r.id === selectedRecordId) ?? null);

  // Índice del registro seleccionado (para mostrar "3/100")
  let selectedIndex = $derived(records.findIndex(r => r.id === selectedRecordId) + 1);
</script>

<!-- ============================================================
     LAYOUT PRINCIPAL
     ============================================================ -->
<div class="gallery-wrapper">

  <!-- Barra superior -->
  <TopBar
    activeTab="gallery"
    onTabChange={handleTabChange}
    onBack={handleBack}
  />

  <!-- Área de contenido -->
  <div class="content-area">

    <!-- ── Panel izquierdo: strip de íconos + paneles ── -->
    <!-- Solo visible en vista single — colapsado en spread y oculto en grid -->
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

    <!-- ── Área central ── -->
    <div class="center-column">

      {#if isLoading}
        <!-- Estado de carga -->
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Cargando imágenes...</span>
        </div>

      {:else if viewMode === 'grid'}
        <!-- Vista cuadrícula -->
        <GridView
          {records}
          collectionId={collectionId}
          onRecordsUpdate={loadRecords}
        />

      {:else}
        <!-- Vista single o spread -->
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

        <!-- Tira de miniaturas inferior -->
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

    <!-- ── Toolbar flotante derecha ── -->
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

  .thumbnail-area {
    height: 140px;
    flex-shrink: 0;
  }

  /* Estado de carga */
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
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>

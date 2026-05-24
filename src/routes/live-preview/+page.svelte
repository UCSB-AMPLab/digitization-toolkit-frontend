<script lang="ts">
  // ============================================================================
  // PÁGINA: Live Preview
  // Ruta: /live-preview?projectId=X&collectionId=Y
  //
  // Orquestador principal — solo gestiona estado global y pasa props a hijos.
  // No tiene lógica de renderizado propia (eso está en cada componente).
  //
  // Componentes hijos:
  //   TopBar.svelte         → barra superior con tabs y controles de sesión
  //   CameraControls.svelte → panel izquierdo con ajustes de cámara
  //   LiveViewport.svelte   → área central con la vista de cámara en vivo
  //   ThumbnailStrip.svelte → tira de miniaturas inferior
  //   Para acceder temporalmente hacer inicio de sesion y luego entrar a http://localhost:5173/live-preview?projectId=1&collectionId=1
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { camerasApi, recordsApi, projectsApi, type Record } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';

  import TopBar from './TopBar.svelte';
  import CameraControls from './CameraControls.svelte';
  import LiveViewport from './LiveViewport.svelte';
  import ThumbnailStrip from './ThumbnailStrip.svelte';
  import ImageViewerModal from './ImageViewerModal.svelte';

  // ---------------------------------------------------------------------------
  // PARÁMETROS DE URL
  // Se reciben desde la ruta: /live-preview?projectId=1&collectionId=2
  // Para navegar aquí desde una colección: goto(`/live-preview?projectId=${p}&collectionId=${c}`)
  // ---------------------------------------------------------------------------
  let projectId = $derived(Number($page.url.searchParams.get('projectId')) || 0);
  let collectionId = $derived(Number($page.url.searchParams.get('collectionId')) || 0);

  // ---------------------------------------------------------------------------
  // ESTADO GLOBAL — se pasa como props a los componentes hijos
  // ---------------------------------------------------------------------------

  // Tab activo: 'live' = captura en vivo | 'gallery' = visor de imágenes
  // Cambiar de tab redirige a /gallery cuando se selecciona 'gallery'
  let activeTab = $state<'live' | 'gallery'>('live');

  // Modo de cámara: 'single' = una cámara | 'double' = dos cámaras (izq + der)
  let cameraMode = $state<'single' | 'double'>('double');

  // Modo de control: 'manual' = ajustes manuales | 'automatic' = automático
  let controlMode = $state<'manual' | 'automatic'>('manual');

  // Ajustes de cámara (solo activos en modo manual)
  let shutterSpeed = $state('1.6s');
  let iso = $state('200');
  let aperture = $state('13.0');

  // Nombre real del proyecto (cargado desde la API al montar)
  let projectName = $state<string>('');

  // Lista de registros/imágenes capturadas en esta colección
  let records = $state<Record[]>([]);
  let selectedRecordId = $state<number | null>(null);

  // Registro inspeccionado en el modal de imagen (null = modal cerrado)
  let inspectedRecord = $state<Record | null>(null);

  // Estado de carga general (al iniciar, al capturar, etc.)
  let isLoading = $state(false);

  // ---------------------------------------------------------------------------
  // AL MONTAR: verifica auth y carga registros existentes de la colección
  // ---------------------------------------------------------------------------
  onMount(async () => {
    // Verificar que hay sesión activa
    if (!authStore.isAuthenticated()) {
      goto('/login');
      return;
    }

    // Cargar nombre del proyecto y registros en paralelo
    const tasks: Promise<void>[] = [];

    if (projectId) {
      tasks.push(
        projectsApi.get(projectId)
          .then(p => { projectName = p.name; })
          .catch(e => console.error('[LivePreview] Error cargando proyecto:', e))
      );
    }

    if (collectionId) {
      tasks.push(loadRecords());
    }

    await Promise.all(tasks);
  });

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Carga los registros de la colección actual
  // Llama a recordsApi.list() filtrando por collectionId
  // ---------------------------------------------------------------------------
  async function loadRecords() {
    try {
      isLoading = true;
      const data = await recordsApi.list({ collection_id: collectionId });
      records = data;
      // Seleccionar el primer registro si existe
      if (data.length > 0 && !selectedRecordId) {
        selectedRecordId = data[0].id;
      }
    } catch (error) {
      console.error('[LivePreview] Error cargando registros:', error);
    } finally {
      isLoading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // HANDLER: Cambio de tab
  // Si se cambia a 'gallery', redirige a la vista de galería de la colección
  // Para cambiar la ruta de galería, modifica el goto aquí
  // ---------------------------------------------------------------------------
  function handleTabChange(tab: 'live' | 'gallery') {
    activeTab = tab;
    if (tab === 'gallery') {
      goto(`/gallery/${collectionId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // HANDLER: Nueva captura completada
  // Se llama desde LiveViewport cuando el botón de captura tiene éxito.
  // Recarga los registros para mostrar la nueva imagen en la tira.
  // ---------------------------------------------------------------------------
  async function handleCaptureDone() {
    await loadRecords();
  }

  // ---------------------------------------------------------------------------
  // HANDLER: Botón volver
  // Regresa a la vista de la colección dentro del dashboard
  // Para cambiar la ruta de regreso, modifica este goto
  // ---------------------------------------------------------------------------
  function handleBack() {
    // Navegar de regreso a la colección en el dashboard
    if (projectId && collectionId) {
      goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
    } else {
      goto('/');
    }
  }

  // ---------------------------------------------------------------------------
  // HANDLER: Retoma de un registro desde el modal de imagen
  // Elimina las imágenes existentes y vuelve a capturar para el mismo registro.
  // ---------------------------------------------------------------------------
  async function handleRetake(record: Record) {
    // Cerrar modal y limpiar selección
    inspectedRecord = null;

    try {
      // Eliminar las imágenes actuales del registro
      for (const img of record.images ?? []) {
        await recordsApi.deleteImage(img.id);
      }

      // Volver a capturar
      if (cameraMode === 'double') {
        await camerasApi.captureDual({
          project_name: projectName,
          collection_id: collectionId ?? undefined,
          record_id: record.id,
        });
      } else {
        await camerasApi.capture({
          project_name: projectName,
          camera_index: 0,
          collection_id: collectionId ?? undefined,
          record_id: record.id,
        });
      }
    } catch (err) {
      console.error('[LivePreview] Error en retoma:', err);
    } finally {
      // Actualizar lista de registros independientemente del resultado
      await loadRecords();
    }
  }
</script>

<!-- ============================================================
     LAYOUT PRINCIPAL: pantalla completa sin sidebar del dashboard
     ============================================================ -->
<div class="live-preview-wrapper">

  <!-- ── Barra superior con tabs Live Scan / Gallery ── -->
  <TopBar
    {activeTab}
    onTabChange={handleTabChange}
    onBack={handleBack}
  />

  <!-- ── Área de contenido: controles + viewport + tiras ── -->
  <div class="content-area">

    <!-- Panel izquierdo: controles de cámara -->
    <CameraControls
      {cameraMode}
      {controlMode}
      {shutterSpeed}
      {iso}
      {aperture}
      onCameraModeChange={(m) => cameraMode = m}
      onControlModeChange={(m) => controlMode = m}
      onShutterSpeedChange={(v) => shutterSpeed = v}
      onIsoChange={(v) => iso = v}
      onApertureChange={(v) => aperture = v}
    />

    <!-- Área central: viewport + tira de miniaturas -->
    <div class="center-column">

      <!-- Vista de cámara en vivo -->
      <LiveViewport
        {cameraMode}
        {controlMode}
        {shutterSpeed}
        {iso}
        {aperture}
        {projectId}
        {projectName}
        {collectionId}
        onCaptureDone={handleCaptureDone}
      />

      <!-- Tira de miniaturas inferior -->
      <div class="thumbnail-area">
        <ThumbnailStrip
          {records}
          {selectedRecordId}
          {cameraMode}
          onSelect={(record) => { selectedRecordId = record.id; inspectedRecord = record; }}
        />
      </div>

    </div>

  </div>

</div>

<!-- ── Modal de inspección de imagen ── -->
{#if inspectedRecord}
  <ImageViewerModal
    record={inspectedRecord}
    {cameraMode}
    onClose={() => inspectedRecord = null}
    onRetake={handleRetake}
  />
{/if}

<style>
  /* Pantalla completa, sin overflow, sin sidebar del dashboard */
  .live-preview-wrapper {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background-color: var(--color-bg);
    overflow: hidden;
    /* Sin scroll — la interfaz debe caber exactamente en la pantalla */
  }

  /* Fila horizontal: panel izquierdo + columna central */
  .content-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }

  /* Columna central: viewport (flex: 1) + tira fija de 140px */
  .center-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    background-color: var(--color-bg);
  }

  /* Área de miniaturas: altura fija para la tira */
  .thumbnail-area {
    height: 140px;
    flex-shrink: 0;
  }
</style>

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
  //   Para acceder: iniciar sesión como admin u operator y entrar a
  //   http://localhost:5173/live-preview?projectId=1&collectionId=1
  //   (reviewer es redirigido — ver el guard de rol en el onMount, NEH-66)
  // ============================================================================

  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { camerasApi, recordsApi, projectsApi, collectionsApi, type Record as ApiRecord, type CameraDevice } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { m } from '$lib/i18n';

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
  // Presente cuando se llega acá desde el botón "Recapturar imagen" de Book
  // view (NEH-209) sobre un registro puntual — abre directo su modal de
  // retoma en vez de obligar a buscarlo de nuevo en la tira de miniaturas.
  let recordId = $derived(Number($page.url.searchParams.get('recordId')) || 0);
  // Si la retoma vino de ese flujo, al terminar con éxito volvemos a Book
  // view en vez de quedarnos en /live-preview (la retoma "suelta", iniciada
  // desde una miniatura ya cargada acá, no navega a ningún lado).
  let cameFromRecapture = $state(false);

  // ---------------------------------------------------------------------------
  // ESTADO GLOBAL — se pasa como props a los componentes hijos
  // ---------------------------------------------------------------------------

  // Tab activo: 'live' = captura en vivo | 'gallery' = visor de imágenes
  // Cambiar de tab redirige a /gallery cuando se selecciona 'gallery'

  // Modo de cámara: 'single' = una cámara | 'double' = dos cámaras (izq + der)
  let cameraMode = $state<'single' | 'double'>('double');

  // Dispositivos de cámara detectados (actualizados por CameraControls al montar)
  let devices = $state<CameraDevice[]>([]);


  // Ajustes de cámara (solo activos en modo manual)
  let shutterSpeed = $state('1.6s');
  let iso = $state('200');
  let aperture = $state('13.0');

  // Per-camera capture rotation (clockwise degrees): 0 | 90 | 180 | 270
  // Default 90° — most digitisation rigs use vertical (portrait) orientation
  let rotateDeg = $state<{ [cam: number]: number }>({ 0: 90, 1: 90 });

  // Nombre real del proyecto (cargado desde la API al montar)
  let projectName = $state<string>('');

  // Nombre del volumen. La barra superior lo muestra junto al proyecto: sin
  // esto, quien captura no tiene en pantalla nada que le diga en qué volumen
  // está guardando, y un volumen equivocado sólo se descubre después.
  let collectionName = $state<string>('');

  // Lista de registros/imágenes capturadas en esta colección
  let records = $state<ApiRecord[]>([]);
  let selectedRecordId = $state<number | null>(null);

  // Registro inspeccionado en el modal de imagen (null = modal cerrado)
  let inspectedRecord = $state<ApiRecord | null>(null);

  // Estado de carga general (al iniciar, al capturar, etc.)
  let isLoading = $state(false);

  // ---------------------------------------------------------------------------
  // AL MONTAR: verifica auth y carga registros existentes de la colección
  // ---------------------------------------------------------------------------
  onMount(async () => {
    // Verificar sesión + rol: la pantalla de captura es solo para admin y
    // operator — reviewer no puede disparar capturas ni borrar (el backend
    // ya lo rechaza con 403 en cameras.py/records.py), pero antes de este
    // fix esta ruta (fuera del grupo (dashboard)) solo chequeaba que hubiera
    // un token, sin validar rol (NEH-66).
    if (!authStore.requireSession(['admin', 'operator'])) {
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
      tasks.push(
        collectionsApi.get(collectionId)
          .then(c => { collectionName = c.name; })
          .catch(e => console.error('[LivePreview] Error cargando volumen:', e))
      );
    }

    await Promise.all(tasks);

    // Si llegamos con un recordId puntual (NEH-209, botón "Recapturar
    // imagen" de Book view), abrimos directo su modal de retoma y ajustamos
    // el modo de cámara al capture_mode real del registro — si no, un
    // registro dual con cameraMode en 'single' (o viceversa) dispararía el
    // guard de modo-no-coincide del backend en cameras.py.
    if (recordId) {
      const target = records.find(r => r.id === recordId);
      if (target) {
        cameraMode = target.capture_mode === 'dual' ? 'double' : 'single';
        selectedRecordId = target.id;
        inspectedRecord = target;
        cameFromRecapture = true;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Carga los registros de la colección actual
  // Llama a recordsApi.listAll() filtrando por collectionId
  // ---------------------------------------------------------------------------
  async function loadRecords() {
    try {
      isLoading = true;
      const data = await recordsApi.listAll({ collection_id: collectionId });
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
  // HANDLER: Salir a revisión
  // Lleva a la vista del volumen, que es donde se revisa lo capturado.
  // ---------------------------------------------------------------------------
  function handleGoToReview() {
    goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
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
  // El backend (cameras.py, NEH-208) ya se encarga de conservar la(s)
  // imagen(es) anterior(es) como historial no bien detecta que el registro
  // está 'rejected' y llega una captura nueva con el mismo record_id — las
  // marca is_current=false en vez de borrarlas, para que sigan disponibles
  // como auditoría vía GET /records/{id}/rejections. El frontend NO debe
  // volver a borrarlas por su cuenta (antes lo hacía acá, destruyendo esa
  // auditoría — bug corregido en NEH-209).
  // ---------------------------------------------------------------------------
  async function handleRetake(record: ApiRecord) {
    let result;
    if (cameraMode === 'double') {
      result = await camerasApi.captureDual({
        project_name: projectName,
        collection_id: collectionId ?? undefined,
        record_id: record.id,
        rotate_deg_cam0: rotateDeg[0] ?? 0,
        rotate_deg_cam1: rotateDeg[1] ?? 0,
      });
    } else {
      result = await camerasApi.capture({
        project_name: projectName,
        camera_index: 0,
        collection_id: collectionId ?? undefined,
        record_id: record.id,
        rotate_deg: rotateDeg[0] ?? 0,
      });
    }

    if (!result.success) {
      throw new Error(result.error || $m.lv_capture_error);
    }

    inspectedRecord = null;

    // Si llegamos acá desde "Recapturar imagen" en Book view (NEH-209),
    // volvemos ahí en vez de quedarnos en /live-preview — la retoma queda
    // conclusa y el operador ve de una el resultado en el mismo lugar donde
    // la pidió. La retoma "suelta" (miniatura ya cargada en esta sesión) no
    // navega a ningún lado, como siempre.
    if (cameFromRecapture && projectId && collectionId) {
      goto(`/dashboard/projects/${projectId}/collections/${collectionId}`);
      return;
    }

    await loadRecords();
  }
</script>

<!-- ============================================================
     LAYOUT PRINCIPAL: pantalla completa sin sidebar del dashboard
     ============================================================ -->
<div class="live-preview-wrapper">

  <!-- ── Barra superior con tabs Live Scan / Gallery ── -->
  <TopBar
    {projectName}
    {collectionName}
    onBack={handleBack}
    onGoToReview={handleGoToReview}
  />

  <!-- ── Área de contenido: controles + viewport + tiras ── -->
  <div class="content-area">

    <!-- Panel izquierdo: controles de cámara -->
    <CameraControls
      {cameraMode}
      {shutterSpeed}
      {iso}
      {aperture}
      onCameraModeChange={(m) => cameraMode = m}
      onShutterSpeedChange={(v) => shutterSpeed = v}
      onIsoChange={(v) => iso = v}
      onApertureChange={(v) => aperture = v}
      onDevicesChange={(d) => devices = d}
      onRotateDegChange={(cam, deg) => rotateDeg = { ...rotateDeg, [cam]: deg }}
    />

    <!-- Área central: viewport + tira de miniaturas -->
    <div class="center-column">

      <!-- Vista de cámara en vivo -->
      <LiveViewport
        {cameraMode}
        {shutterSpeed}
        {iso}
        {aperture}
        {projectId}
        {projectName}
        {collectionId}
        {devices}
        {rotateDeg}
        onCaptureDone={handleCaptureDone}
        onRotateDegChange={(cam, deg) => rotateDeg = { ...rotateDeg, [cam]: deg }}
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

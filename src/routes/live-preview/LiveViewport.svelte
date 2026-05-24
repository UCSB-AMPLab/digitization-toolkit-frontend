<script lang="ts">
  // ============================================================================
  // COMPONENTE: LiveViewport
  // Archivo: src/routes/live-preview/LiveViewport.svelte
  //
  // Área central de la interfaz de captura.
  // Contiene:
  //   - Vista en vivo de una o dos cámaras (polling cada PREVIEW_INTERVAL_MS ms)
  //   - Líneas de guía arrastrables (rojas)
  //   - Líneas de grilla (cian)
  //   - Botón de captura (círculo blanco)
  //   - Panel flotante: zoom + configurar grilla
  //   - Barra de metadatos inferior (ISO, shutter, aperture)
  //   - Modal de configuración de grilla
  //
  // ── CÓMO FUNCIONA EL PREVIEW ────────────────────────────────────────────────
  // El backend NO tiene streaming MJPEG. En su lugar, el frontend hace polling:
  // cada PREVIEW_INTERVAL_MS ms llama a GET /cameras/preview/{index} que captura
  // un frame en resolución "low" y lo devuelve como JPEG (sin guardar en BD).
  //
  // Para sustituir el polling por streaming real:
  //   1. Agrega un endpoint MJPEG al backend (ej: /cameras/stream/{index})
  //   2. En el bloque marcado "STREAM DE CÁMARA" abajo, reemplaza el <img>
  //      que usa previewUrls[n] por:
  //      <img src="{getApiBase()}/cameras/stream/{n}?token={token}" ... />
  //   3. Elimina todo el bloque "POLLING DEL PREVIEW" del <script>
  //   4. Elimina los imports de onDestroy y browser
  //
  // Para cambiar la frecuencia del polling, modifica PREVIEW_INTERVAL_MS.
  // Para cambiar la resolución del preview, modifica el endpoint en cameras.py.
  // ============================================================================

  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { camerasApi } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { wbSamplingStore } from '$lib/stores/wbSampling';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    cameraMode,
    controlMode,
    shutterSpeed,
    iso,
    aperture,
    projectId,
    projectName,
    collectionId,
    onCaptureDone,
  }: {
    cameraMode: 'single' | 'double';
    controlMode: 'manual' | 'automatic';
    shutterSpeed: string;
    iso: string;
    aperture: string;
    projectId: number;
    projectName: string;
    collectionId: number;
    onCaptureDone: () => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL: Viewport
  // ---------------------------------------------------------------------------

  let zoom = $state(1);          // Zoom del viewport CSS (1 = 100%)
  let guideV = $state(50);       // Guía vertical (% desde izquierda)
  let guideH = $state(50);       // Guía horizontal (% desde arriba)
  let dragging = $state<'v' | 'h' | null>(null);

  // Configuración de la grilla
  let gridRows = 3;
  let gridCols = 3;
  let showGrid = $state(false);
  let showGuides = $state(true);
  let showGridModal = $state(false);

  // Estado de la captura
  let isCapturing = $state(false);
  let captureFlash = $state(false);

  // Referencia al contenedor del viewport (para calcular posición de guías)
  let viewportEl = $state<HTMLElement | null>(null);

  // ===========================================================================
  // POLLING DEL PREVIEW
  // ===========================================================================
  // Este bloque maneja la vista en vivo de las cámaras mediante polling periódico.
  //
  // ── PARA SUSTITUIR POR STREAMING REAL ──────────────────────────────────────
  // Si en el futuro el backend implementa MJPEG streaming:
  //   1. Elimina todo este bloque (desde "POLLING DEL PREVIEW" hasta "FIN POLLING")
  //   2. En el HTML abajo, reemplaza el <img src={previewUrls[n]}> por:
  //      <img src="{getApiBase()}/cameras/stream/{n}" class="feed-img" />
  //   3. Agrega el token de auth como query param si el backend lo requiere:
  //      <img src="{getApiBase()}/cameras/stream/{n}?token={getToken()}" ... />
  // ===========================================================================

  // Frecuencia de actualización del preview en milisegundos.
  // Aumentar si el Pi tiene problemas de rendimiento (ej: 3000 = 3s).
  // Disminuir para más fluidez si el hardware lo permite (ej: 1000 = 1s).
  const PREVIEW_INTERVAL_MS = 2000;

  // URLs de objeto de las últimas imágenes capturadas por cada cámara.
  // Key = índice de cámara (0 = izquierda, 1 = derecha).
  // Se actualizan con cada ciclo de polling.
  let previewUrls = $state<Record<number, string>>({});

  // References to the live preview <img> elements for pixel sampling.
  let imgEl0: HTMLImageElement | null = $state(null);
  let imgEl1: HTMLImageElement | null = $state(null);

  // ---------------------------------------------------------------------------
  // WB SAMPLING — click-to-neutralize
  // Reads a 3×3 pixel block from the blob-URL preview image via an offscreen
  // canvas (same-origin: no CORS issue with blob URLs).
  // ---------------------------------------------------------------------------
  function samplePixel(imgEl: HTMLImageElement, event: MouseEvent): [number, number, number] | null {
    if (!imgEl || !imgEl.naturalWidth) return null;
    const rect = imgEl.getBoundingClientRect();
    const cx = Math.round(((event.clientX - rect.left) / rect.width) * imgEl.naturalWidth);
    const cy = Math.round(((event.clientY - rect.top) / rect.height) * imgEl.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imgEl, 0, 0);
    // Average a 3×3 block for robustness against noise
    const x0 = Math.max(0, cx - 1);
    const y0 = Math.max(0, cy - 1);
    const w = Math.min(3, imgEl.naturalWidth - x0);
    const h = Math.min(3, imgEl.naturalHeight - y0);
    const data = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0;
    const count = w * h;
    for (let i = 0; i < count; i++) {
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
    }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  }

  function handleWbSampleClick(cameraIndex: number, event: MouseEvent) {
    const sampling = $wbSamplingStore;
    if (!sampling.active || sampling.cameraIndex !== cameraIndex) return;
    const imgEl = cameraIndex === 0 ? imgEl0 : imgEl1;
    if (!imgEl) return;
    const pixel = samplePixel(imgEl, event);
    if (pixel) {
      sampling.onSample?.(pixel[0], pixel[1], pixel[2]);
    }
    // Deactivate regardless so we don't get stuck
    wbSamplingStore.set({ active: false, cameraIndex: 0, onSample: null });
  }

  // Handle del intervalo de polling (null cuando está pausado)
  let previewInterval: ReturnType<typeof setInterval> | null = null;

  // true cuando la pestaña es visible — se pausa el polling si el usuario
  // cambia de pestaña para ahorrar recursos en el Raspberry Pi.
  let previewActive = $state(true);

  // Indica si ya hay un fetch en curso para evitar requests solapados
  let fetchingPreview: Record<number, boolean> = { 0: false, 1: false };

  // Contador de errores consecutivos de preview — muestra banner tras 3 fallos
  let previewErrorCount = $state(0);
  let previewConnectError = $derived(previewErrorCount >= 3);

  // ── Helper: URL base de la API ─────────────────────────────────────────────
  function getApiBase(): string {
    if (!browser) return 'http://localhost:8000';
    return env.PUBLIC_API_BASE || 'http://localhost:8000';
  }

  // ── Helper: cabecera de autenticación ──────────────────────────────────────
  function getAuthHeader(): HeadersInit {
    if (!browser) return {};
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // ── Fetch de un frame de preview para una cámara ───────────────────────────
  // Llama a GET /cameras/preview/{cameraIndex} (endpoint en cameras.py).
  // Si la cámara no está conectada, el backend devuelve 404 — falla silenciosamente.
  // La URL de objeto anterior se libera para evitar memory leaks.
  async function fetchPreview(cameraIndex: number) {
    // Evitar requests solapados para la misma cámara
    if (fetchingPreview[cameraIndex] || !previewActive) return;

    fetchingPreview[cameraIndex] = true;
    try {
      const response = await fetch(
        `${getApiBase()}/cameras/preview/${cameraIndex}`,
        { headers: getAuthHeader() }
      );

      if (response.ok) {
        const blob = await response.blob();
        const newUrl = URL.createObjectURL(blob);

        // Liberar la URL anterior para no acumular memoria
        if (previewUrls[cameraIndex]) {
          URL.revokeObjectURL(previewUrls[cameraIndex]);
        }

        previewUrls = { ...previewUrls, [cameraIndex]: newUrl };
        previewErrorCount = 0;  // reset on success
      } else if (response.status !== 404) {
        // 404 = cámara no conectada → falla silencioso
        // Otros errores (500, etc.) cuentan para el banner
        previewErrorCount += 1;
      }
    } catch {
      // Error de red — cuenta para el banner de reconexión
      previewErrorCount += 1;
    } finally {
      fetchingPreview[cameraIndex] = false;
    }
  }

  // ── Inicia o reinicia el polling ───────────────────────────────────────────
  // Se llama al montar el componente y cada vez que cambia cameraMode.
  // Cancela el intervalo anterior antes de crear uno nuevo.
  function startPreviewPolling() {
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }

    // Fetch inmediato al arrancar (no esperar el primer intervalo)
    fetchPreview(0);
    if (cameraMode === 'double') fetchPreview(1);

    // Polling periódico
    previewInterval = setInterval(() => {
      fetchPreview(0);
      if (cameraMode === 'double') fetchPreview(1);
    }, PREVIEW_INTERVAL_MS);
  }

  // ── Pausa el polling cuando la pestaña pierde el foco ─────────────────────
  // Esto ahorra recursos en el Raspberry Pi cuando el usuario no está mirando.
  function handleVisibilityChange() {
    previewActive = !document.hidden;
    if (previewActive) {
      // Pestaña visible de nuevo → reiniciar polling
      startPreviewPolling();
    } else {
      // Pestaña oculta → pausar polling
      if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
      }
    }
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  onMount(() => {
    // Solo registrar el listener de visibilidad aquí.
    // startPreviewPolling() se llama desde el $effect de abajo,
    // que ya corre en el montaje inicial. Tenerlo en ambos lanzaba
    // dos ciclos de polling al montar el componente.
    if (browser) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  // Reactivo: reiniciar polling cuando cambia el modo de cámara
  // (ej: de single a double → empezar a pedir también camera 1)
  $effect(() => {
    const _mode = cameraMode; // suscribirse al cambio
    startPreviewPolling();
  });

  onDestroy(() => {
    // Limpiar el intervalo al desmontar el componente
    if (previewInterval) clearInterval(previewInterval);

    // Liberar todas las URLs de objeto para evitar memory leaks
    Object.values(previewUrls).forEach(url => {
      try { URL.revokeObjectURL(url); } catch {}
    });

    if (browser) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  // ===========================================================================
  // FIN POLLING DEL PREVIEW
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // ZOOM (CSS transform del wrapper — ajuste visual del viewport, no afecta la cámara)
  // Para zoom de cámara (ScalerCrop) usa el slider de Zoom en CameraControls.
  // ---------------------------------------------------------------------------
  function zoomIn()    { zoom = Math.min(zoom + 0.2, 3); }
  function zoomOut()   { zoom = Math.max(zoom - 0.2, 0.5); }
  function resetZoom() { zoom = 1; }

  // ---------------------------------------------------------------------------
  // GUÍAS ARRASTRABLES
  // ---------------------------------------------------------------------------
  function startDrag(guide: 'v' | 'h') { dragging = guide; }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging || !viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    if (dragging === 'v') {
      guideV = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    } else {
      guideH = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    }
  }

  function stopDrag() { dragging = null; }

  // ---------------------------------------------------------------------------
  // CAPTURA
  // ---------------------------------------------------------------------------
  async function handleCapture() {
    if (isCapturing) return;
    isCapturing = true;
    captureFlash = true;
    setTimeout(() => { captureFlash = false; }, 150);

    try {
      const payload = {
        project_name: projectName || `project_${projectId}`,
        collection_id: collectionId || undefined,
        record_title: `Captura ${new Date().toISOString().slice(0,19)}`,
      };

      let result;
      if (cameraMode === 'double') {
        result = await camerasApi.captureDual(payload);
      } else {
        result = await camerasApi.capture({ ...payload, camera_index: 0 });
      }

      if (!result.success) {
        throw new Error(result.error || 'Capture failed');
      }

      cameraStatus.reportSuccess();
      onCaptureDone();

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al capturar';
      cameraStatus.reportFailure(msg);
      console.error('[LiveViewport] Capture error:', error);
    } finally {
      isCapturing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // MODAL DE GRILLA
  // ---------------------------------------------------------------------------
</script>

<!-- ============================================================
     VIEWPORT PRINCIPAL
     ============================================================ -->
<div class="viewport-outer">
  <div class="mat-board">

    <!-- ══════════════════════════════════════════════════════════
         ÁREA DE CÁMARAS
         ══════════════════════════════════════════════════════════ -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="camera-viewport"
      class:flash={captureFlash}
      bind:this={viewportEl}
      onmousemove={handleMouseMove}
      onmouseup={stopDrag}
      onmouseleave={stopDrag}
    >

      <!-- Banner: reconectando tras errores consecutivos de preview -->
      {#if previewConnectError}
        <div class="reconnect-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          Reconectando con la cámara…
        </div>
      {/if}

      <!-- ══════════════════════════════════════════════════════
           STREAM DE CÁMARA
           ══════════════════════════════════════════════════════
           Este bloque muestra el feed en vivo de una o dos cámaras.

           ESTADO ACTUAL: usa previewUrls[n] que se actualiza via polling.
           previewUrls[n] es una Object URL que apunta al último frame JPEG
           capturado por /cameras/preview/{n} en el backend.

           ── PARA SUSTITUIR POR STREAMING REAL ──────────────────
           Cuando el backend tenga MJPEG streaming, reemplaza cada:

             {#if previewUrls[n]}
               <img src={previewUrls[n]} ... />
             {:else}
               <div class="no-stream">...</div>
             {/if}

           Por simplemente:

             <img
               src="{getApiBase()}/cameras/stream/{n}"
               class="feed-img"
               alt="Camera {n}"
             />

           Y elimina el bloque "POLLING DEL PREVIEW" del <script>.
           ══════════════════════════════════════════════════════ -->
      <div class="camera-feeds-wrapper" style="transform: scale({zoom * 0.85})">

        <!-- Cámara izquierda (index 0) — siempre visible -->
        <div class="camera-feed">
          {#if previewUrls[0]}
            <!-- Frame en vivo del polling — se actualiza cada PREVIEW_INTERVAL_MS -->
            <img
              bind:this={imgEl0}
              src={previewUrls[0]}
              alt="Camera izquierda"
              class="feed-img"
            />
            <!-- WB sampling overlay: visible only when picker is active for this camera -->
            {#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === 0}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="wb-sample-overlay"
                onclick={(e) => handleWbSampleClick(0, e)}
                title="Haz clic en un área blanca o gris neutro"
              ></div>
            {/if}
          {:else}
            <!-- Placeholder: sin señal o esperando primer frame -->
            <div class="no-stream">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span>Sin señal — Izquierda</span>
              <small>Verifica conexión del hardware</small>
            </div>
          {/if}
          <!-- Badge identificador de cámara -->
          <div class="feed-label">L</div>
        </div>

        <!-- Cámara derecha (index 1) — solo en modo double -->
        {#if cameraMode === 'double'}
          <div class="camera-feed">
            {#if previewUrls[1]}
              <!-- Frame en vivo del polling -->
              <img
                bind:this={imgEl1}
                src={previewUrls[1]}
                alt="Camera derecha"
                class="feed-img"
              />
              {#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === 1}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="wb-sample-overlay"
                  onclick={(e) => handleWbSampleClick(1, e)}
                  title="Haz clic en un área blanca o gris neutro"
                ></div>
              {/if}
            {:else}
              <!-- Placeholder: sin señal o esperando primer frame -->
              <div class="no-stream">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>Sin señal — Derecha</span>
                <small>Verifica conexión del hardware</small>
              </div>
            {/if}
            <!-- Badge identificador de cámara -->
            <div class="feed-label right">R</div>
          </div>
        {/if}

      </div>
      <!-- ══ FIN STREAM DE CÁMARA ══ -->

      <!-- ── GRILLA (líneas cian, no arrastrables) ── -->
      {#if showGrid}
        {#each Array.from({length: gridCols - 1}, (_, i) => i) as i}
          <div class="grid-line vertical" style="left: {(i+1) * (100/gridCols)}%"></div>
        {/each}
        {#each Array.from({length: gridRows - 1}, (_, i) => i) as i}
          <div class="grid-line horizontal" style="top: {(i+1) * (100/gridRows)}%"></div>
        {/each}
      {/if}

      <!-- ── GUÍAS ARRASTRABLES (líneas rojas) ── -->
      {#if showGuides}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="guide vertical" style="left: {guideV}%" onmousedown={() => startDrag('v')}>
          <div class="guide-line"></div>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="guide horizontal" style="top: {guideH}%" onmousedown={() => startDrag('h')}>
          <div class="guide-line"></div>
        </div>
      {/if}

      <!-- ── BARRA DE METADATOS ── -->
      <div class="metadata-bar">
        {#if controlMode === 'manual'}
          <div class="metadata-values">
            <span>ISO {iso}</span>
            <span>{shutterSpeed}</span>
            <span>f/{aperture}</span>
            <span>50mm</span>
          </div>
        {:else}
          <span class="metadata-auto">AUTO</span>
        {/if}
      </div>

    </div><!-- /camera-viewport -->

    <!-- ── PANEL FLOTANTE: zoom + grilla ── -->
    <div class="floating-controls">
      <button class="float-btn" onclick={zoomIn} aria-label="Zoom in">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <button class="float-btn" onclick={zoomOut} aria-label="Zoom out">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <button class="float-btn" onclick={resetZoom} aria-label="Fit to screen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      </button>
      <div class="float-divider"></div>
      <button class="float-btn" onclick={() => showGridModal = true} aria-label="Grid settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      </button>
    </div>

    <!-- ── BOTÓN DE CAPTURA ── -->
    <div class="capture-btn-wrapper">
      <button
        class="capture-btn"
        class:capturing={isCapturing}
        onclick={handleCapture}
        disabled={isCapturing}
        aria-label="Capturar"
      >
        <div class="capture-ring outer"></div>
        <div class="capture-ring middle"></div>
        <div class="capture-circle"></div>
      </button>
    </div>

  </div><!-- /mat-board -->
</div><!-- /viewport-outer -->

<!-- ============================================================
     MODAL: Configuración de Grilla
     ============================================================ -->
{#if showGridModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) showGridModal = false; }}>
    <div class="modal-card">
      <h3 class="modal-title">Cuadrícula y Guías</h3>
      <p class="modal-subtitle">Activa las ayudas visuales de encuadre.</p>
      <div class="modal-body">
        <div class="modal-toggle-row">
          <div>
            <p class="modal-toggle-title">Cuadrícula</p>
            <p class="modal-toggle-sub">Mostrar grid 3×3 de captura</p>
          </div>
          <button class="toggle-btn" class:on={showGrid} onclick={() => showGrid = !showGrid}>
            <div class="toggle-thumb" class:on={showGrid}></div>
          </button>
        </div>
        <div class="modal-toggle-row">
          <div>
            <p class="modal-toggle-title">Líneas de Guía</p>
            <p class="modal-toggle-sub">Guías arrastrables (rojo)</p>
          </div>
          <button class="toggle-btn" class:on={showGuides} onclick={() => showGuides = !showGuides}>
            <div class="toggle-thumb" class:on={showGuides}></div>
          </button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="modal-btn confirm" onclick={() => showGridModal = false}>Cerrar</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .viewport-outer {
    flex: 1;
    position: relative;
    background-color: var(--color-bg);
    overflow: hidden;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .mat-board {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: #2c2920;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
  }

  /* Banner de reconexión */
  .reconnect-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(220, 80, 60, 0.88);
    color: #fff;
    font-size: 0.75rem;
    border-radius: 20px;
    backdrop-filter: blur(4px);
    pointer-events: none;
    animation: pulse-opacity 1.5s ease-in-out infinite;
  }

  @keyframes pulse-opacity {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.6; }
  }

  /* ── Viewport negro interno ── */
  .camera-viewport {
    position: relative;
    width: 100%;
    max-width: 1200px;
    max-height: 100%;
    aspect-ratio: 4/3;
    background-color: #0a0a0a;
    border: 1px solid rgba(90,140,98,0.2);
    box-shadow: 0 4px 24px rgba(0,0,0,0.6);
    overflow: hidden;
    cursor: crosshair;
  }

  /* Efecto flash al capturar */
  .camera-viewport.flash::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: rgba(255,255,255,0.3);
    z-index: 50;
    pointer-events: none;
    animation: flash 150ms ease;
  }

  @keyframes flash { 0% { opacity: 0.3; } 100% { opacity: 0; } }

  /* ══════════════════════════════════════════════════════════════
     FEEDS DE CÁMARA
     Wrapper flex que contiene los paneles L y R lado a lado.
     En modo single: solo aparece el feed izquierdo (flex: 1).
     En modo double: dos feeds iguales dividiendo el espacio.
     ══════════════════════════════════════════════════════════════ */
  .camera-feeds-wrapper {
    display: flex;
    width: 100%;
    height: 100%;
    transition: transform 0.3s ease;
  }

  /* Cada panel de cámara */
  .camera-feed {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    /* Línea divisoria entre L y R */
    border-right: 1px solid rgba(255,255,255,0.06);
  }

  .camera-feed:last-child { border-right: none; }

  /* Imagen del stream / polling */
  .feed-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  /* Badge L / R en la esquina del feed */
  .feed-label {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(19,17,16,0.75);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 9px;
    font-weight: 700;
    color: var(--color-light);
    pointer-events: none;
    z-index: 5;
  }

  .feed-label.right { left: auto; right: 8px; }

  /* Placeholder sin señal */
  .no-stream {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    opacity: 0.4;
    text-align: center;
    padding: 16px;
  }

  .no-stream span  { font-size: var(--text-base); font-weight: var(--fw-medium); }
  .no-stream small { font-size: var(--text-sm); }

  /* ── Grilla (cian) ── */
  .grid-line {
    position: absolute;
    pointer-events: none;
    z-index: 20;
    background-color: rgba(0, 210, 255, 0.5);
  }

  .grid-line.vertical   { top: 0; bottom: 0; width: 1px; }
  .grid-line.horizontal { left: 0; right: 0; height: 1px; }

  /* ── Guías arrastrables (rojo) ── */
  .guide {
    position: absolute;
    z-index: 30;
  }

  .guide.vertical   { top: 0; bottom: 0; width: 16px; margin-left: -8px; cursor: ew-resize; }
  .guide.horizontal { left: 0; right: 0; height: 16px; margin-top: -8px; cursor: ns-resize; }

  .guide-line {
    position: absolute;
    background-color: rgba(220,50,50,0.8);
    transition: background-color var(--transition-fast);
  }

  .guide.vertical   .guide-line { left: 50%; top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
  .guide.horizontal .guide-line { top: 50%; left: 0; right: 0; height: 1px; transform: translateY(-50%); }
  .guide:hover .guide-line { background-color: rgba(255,80,80,1); }

  /* ── Barra de metadatos ── */
  .metadata-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 32px;
    background-color: #18181b;
    border-top: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    padding: 0 16px;
    z-index: 40;
  }

  .metadata-values {
    display: flex;
    gap: 16px;
    font-family: monospace;
    font-size: 10px;
    color: var(--color-light-grey);
  }

  .metadata-auto {
    font-family: monospace;
    font-size: 10px;
    color: var(--color-light-grey);
  }

  /* ── Panel flotante ── */
  .floating-controls {
    position: absolute;
    top: 24px; right: 24px;
    z-index: 40;
    background-color: rgba(26,24,21,0.9);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 54px;
    align-items: center;
  }

  .float-btn {
    width: 38px; height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none; border: none;
    cursor: pointer;
    color: var(--color-light-grey);
    border-radius: var(--radius-md);
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .float-btn:hover { color: var(--color-primary); background-color: rgba(255,255,255,0.05); }

  .float-divider { width: 32px; height: 1px; background-color: var(--border-color); }

  /* ── Botón de captura ── */
  .capture-btn-wrapper {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
  }

  .capture-btn {
    position: relative;
    width: 60px; height: 60px;
    background: none; border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: opacity var(--transition-fast);
  }

  .capture-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .capture-ring {
    position: absolute;
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .capture-ring.outer  { inset: 0; border: 2px solid rgba(255,255,255,0.6); animation: pulse-ring 2s ease infinite; }
  .capture-ring.middle { width: 52px; height: 52px; border: 1.5px solid rgba(255,255,255,0.3); }

  .capture-circle {
    width: 44px; height: 44px;
    background-color: white;
    border-radius: 50%;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
    transition: transform var(--transition-fast);
    z-index: 1;
  }

  .capture-btn:hover:not(:disabled)  .capture-circle { transform: scale(0.93); }
  .capture-btn:active:not(:disabled) .capture-circle { transform: scale(0.88); }
  .capture-btn.capturing .capture-ring.outer { border-color: var(--color-primary); animation: none; }

  @keyframes pulse-ring {
    0%   { opacity: 1; transform: scale(1); }
    50%  { opacity: 0.7; transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }

  /* ── Modal ── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.6);
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
    padding: 32px 28px;
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow-lg);
  }

  .modal-title    { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 6px; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0 0 24px; }

  .modal-body   { display: flex; flex-direction: column; gap: 20px; margin-bottom: 24px; }
  .modal-field  { display: flex; flex-direction: column; gap: 8px; }
  .modal-label  { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); }

  .slider-with-value { display: flex; align-items: center; gap: 12px; }

  .modal-range {
    flex: 1; height: 8px;
    -webkit-appearance: none;
    background-color: var(--color-surface-alt-2);
    border-radius: var(--radius-full);
    cursor: pointer;
  }

  .modal-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px; height: 16px;
    border-radius: 50%;
    background-color: var(--color-primary);
    cursor: pointer;
  }

  .range-value {
    width: 40px; height: 40px;
    background-color: var(--color-surface-alt-2);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    flex-shrink: 0;
  }

  .modal-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .modal-toggle-title { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); margin: 0 0 2px; }
  .modal-toggle-sub   { font-size: var(--text-xs); color: var(--color-light-grey); margin: 0; }

  .toggle-btn {
    width: 48px; height: 24px;
    border-radius: var(--radius-full);
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    cursor: pointer;
    position: relative;
    transition: background-color var(--transition-base);
    flex-shrink: 0;
  }

  .toggle-btn.on { background-color: var(--color-primary); border-color: var(--color-primary); }

  .toggle-thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    transition: transform var(--transition-base), background-color var(--transition-base);
  }

  .toggle-thumb.on { transform: translateX(24px); background-color: white; }

  .modal-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
  }

  .modal-btn.cancel  { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover { background-color: rgba(255,255,255,0.05); color: var(--color-light); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); box-shadow: 0 4px 12px rgba(90,140,98,0.3); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
</style>
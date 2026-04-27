<script lang="ts">
  // ============================================================================
  // COMPONENTE: LiveViewport
  // Archivo: src/routes/live-preview/LiveViewport.svelte
  //
  // Área central de la interfaz de captura.
  // Contiene:
  //   - Área de vista de cámara (placeholder con stream real en producción)
  //   - Líneas de guía arrastrables (rojo)
  //   - Líneas de grilla (cian)
  //   - Botón de captura (círculo blanco)
  //   - Controles de zoom + grilla (panel flotante derecho)
  //   - Barra de metadatos inferior (ISO, shutter, aperture)
  //   - Modal de configuración de grilla
  //
  // Para conectar el stream real de la cámara:
  //   Reemplaza el div placeholder por un <img> con src que apunte
  //   a /cameras/stream o similar según lo que devuelva el backend.
  // ============================================================================

  import { camerasApi, recordsApi, type DualCaptureRequest } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';

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
    collectionId,
    onCaptureDone,
  }: {
    cameraMode: 'single' | 'double';
    controlMode: 'manual' | 'automatic';
    shutterSpeed: string;
    iso: string;
    aperture: string;
    projectId: number;
    collectionId: number;
    onCaptureDone: () => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // Zoom del viewport (1 = 100%, 0.5 = 50%, 3 = 300%)
  let zoom = $state(1);

  // Guías arrastrables: posición como porcentaje del área
  let guideV = $state(50);   // guía vertical (% desde izquierda)
  let guideH = $state(50);   // guía horizontal (% desde arriba)
  let dragging = $state<'v' | 'h' | null>(null);

  // Configuración de la grilla
  let gridRows = $state(3);
  let gridCols = $state(3);
  let showGrid = $state(true);
  let showGuides = $state(true);
  let showGridModal = $state(false);

  // Estado de la captura
  let isCapturing = $state(false);
  let captureFlash = $state(false);  // efecto flash al capturar

  // Referencia al contenedor del viewport para calcular posiciones de guías
  let viewportEl = $state<HTMLElement | null>(null);

  // ---------------------------------------------------------------------------
  // ACCIONES DE ZOOM
  // Min 50%, Max 300%
  // Para cambiar los límites, modifica los valores aquí
  // ---------------------------------------------------------------------------
  function zoomIn()     { zoom = Math.min(zoom + 0.2, 3); }
  function zoomOut()    { zoom = Math.max(zoom - 0.2, 0.5); }
  function resetZoom()  { zoom = 1; }

  // ---------------------------------------------------------------------------
  // GUÍAS ARRASTRABLES
  // onmousedown en cada guía → drag hasta mouseup
  // ---------------------------------------------------------------------------
  function startDrag(guide: 'v' | 'h') {
    dragging = guide;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging || !viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();

    if (dragging === 'v') {
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      guideV = Math.max(0, Math.min(100, x));
    } else {
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      guideH = Math.max(0, Math.min(100, y));
    }
  }

  function stopDrag() {
    dragging = null;
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Captura
  // Llama al backend para disparar las cámaras.
  // En modo 'double': captureDual (ambas cámaras)
  // En modo 'single': capture (cámara izquierda, index 0)
  //
  // El record se crea automáticamente en el backend con record_id si se pasa.
  // Para asociar la captura a un registro existente, pasa record_id en el payload.
  // ---------------------------------------------------------------------------
  async function handleCapture() {
    if (isCapturing) return;

    isCapturing = true;
    captureFlash = true;

    // Efecto de flash visual — dura 150ms
    setTimeout(() => { captureFlash = false; }, 150);

    try {
      const payload: DualCaptureRequest = {
        // El project_name se usa para organizar carpetas en el backend
        project_name: `project_${projectId}`,
        record_title: `Captura ${new Date().toISOString().slice(0,19)}`,
      };

      if (cameraMode === 'double') {
        await camerasApi.captureDual(payload);
      } else {
        await camerasApi.capture({ ...payload, camera_index: 0 });
      }

      cameraStatus.reportSuccess();
      // Notifica al padre para que recargue la lista de registros
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
  // FUNCIÓN: Aplicar configuración de grilla
  // ---------------------------------------------------------------------------
  function applyGrid() {
    showGridModal = false;
  }
</script>

<!-- ============================================================
     VIEWPORT PRINCIPAL: área de cámara con overlay de controles
     ============================================================ -->
<div class="viewport-outer">

  <!-- Área gris de "mesa de luz" que enmarca el viewport -->
  <div class="mat-board">

    <!-- ── Viewport de cámara (área negra interna) ── -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="camera-viewport"
      class:flash={captureFlash}
      bind:this={viewportEl}
      onmousemove={handleMouseMove}
      onmouseup={stopDrag}
      onmouseleave={stopDrag}
    >

      <!-- STREAM DE CÁMARA -->
      <!-- Para conectar el stream real, reemplaza este div por:
           <img src="{apiBase}/cameras/stream?index=0" alt="Camera feed" class="camera-stream" />
           El backend debería servir un MJPEG stream o similar -->
      <div class="camera-stream-placeholder" style="transform: scale({zoom * 0.85})">
        <!-- Mensaje cuando no hay stream disponible -->
        <div class="no-stream">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span>Sin señal de cámara</span>
          <small>Verifica conexión del hardware</small>
        </div>
      </div>

      <!-- ── GRILLA (líneas cian) ── -->
      {#if showGrid}
        <!-- Líneas verticales de grilla -->
        {#each Array.from({length: gridCols - 1}, (_, i) => i) as i}
          <div class="grid-line vertical" style="left: {(i + 1) * (100 / gridCols)}%"></div>
        {/each}
        <!-- Líneas horizontales de grilla -->
        {#each Array.from({length: gridRows - 1}, (_, i) => i) as i}
          <div class="grid-line horizontal" style="top: {(i + 1) * (100 / gridRows)}%"></div>
        {/each}
      {/if}

      <!-- ── GUÍAS ARRASTRABLES (líneas rojas) ── -->
      {#if showGuides}
        <!-- Guía vertical: arrastra horizontalmente -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="guide vertical"
          style="left: {guideV}%"
          onmousedown={() => startDrag('v')}
        >
          <div class="guide-line"></div>
        </div>

        <!-- Guía horizontal: arrastra verticalmente -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="guide horizontal"
          style="top: {guideH}%"
          onmousedown={() => startDrag('h')}
        >
          <div class="guide-line"></div>
        </div>
      {/if}

      <!-- ── BARRA DE METADATOS (parte inferior del viewport) ── -->
      <!-- Muestra los ajustes actuales de la cámara en modo manual -->
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

    <!-- ── PANEL FLOTANTE: Controles de zoom y grilla (esquina superior derecha) ── -->
    <div class="floating-controls">
      <!-- Zoom in -->
      <button class="float-btn" onclick={zoomIn} aria-label="Zoom in">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <!-- Zoom out -->
      <button class="float-btn" onclick={zoomOut} aria-label="Zoom out">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </button>
      <!-- Fit to screen -->
      <button class="float-btn" onclick={resetZoom} aria-label="Fit to screen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      </button>
      <div class="float-divider"></div>
      <!-- Configurar grilla -->
      <button class="float-btn" onclick={() => showGridModal = true} aria-label="Grid settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
        </svg>
      </button>
    </div>

    <!-- ── BOTÓN DE CAPTURA (círculo blanco, costado derecho) ── -->
    <!-- Para cambiar la posición, modifica el CSS de .capture-btn-wrapper -->
    <div class="capture-btn-wrapper">
      <button
        class="capture-btn"
        class:capturing={isCapturing}
        onclick={handleCapture}
        disabled={isCapturing}
        aria-label="Capturar"
      >
        <!-- Anillo exterior animado -->
        <div class="capture-ring outer"></div>
        <!-- Anillo medio -->
        <div class="capture-ring middle"></div>
        <!-- Círculo interior blanco -->
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
      <h3 class="modal-title">Configuración de Cuadrícula</h3>
      <p class="modal-subtitle">Ajusta el grid de captura y las líneas de guía.</p>

      <div class="modal-body">

        <!-- Slider Filas -->
        <div class="modal-field">
          <label class="modal-label">Filas</label>
          <div class="slider-with-value">
            <input type="range" min="1" max="6" bind:value={gridRows} class="modal-range" />
            <div class="range-value">{gridRows}</div>
          </div>
        </div>

        <!-- Slider Columnas -->
        <div class="modal-field">
          <label class="modal-label">Columnas</label>
          <div class="slider-with-value">
            <input type="range" min="1" max="6" bind:value={gridCols} class="modal-range" />
            <div class="range-value">{gridCols}</div>
          </div>
        </div>

        <!-- Toggle: Mostrar grilla -->
        <div class="modal-toggle-row">
          <div>
            <p class="modal-toggle-title">Cuadrícula</p>
            <p class="modal-toggle-sub">Mostrar grid de captura</p>
          </div>
          <button class="toggle-btn" class:on={showGrid} onclick={() => showGrid = !showGrid}>
            <div class="toggle-thumb" class:on={showGrid}></div>
          </button>
        </div>

        <!-- Toggle: Mostrar guías -->
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

      <!-- Botones del modal -->
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => showGridModal = false}>Cancelar</button>
        <button class="modal-btn confirm" onclick={applyGrid}>Aplicar</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Contenedor externo: ocupa el espacio disponible ── */
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

  /* ── Mesa de luz (área gris que enmarca la cámara) ── */
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

  /* ── Viewport interno (área negra donde aparece el stream) ── */
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

  @keyframes flash {
    0%   { opacity: 0.3; }
    100% { opacity: 0; }
  }

  /* ── Placeholder de stream ── */
  .camera-stream-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s ease;
  }

  .no-stream {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    opacity: 0.4;
    text-align: center;
  }

  .no-stream span { font-size: var(--text-base); font-weight: var(--fw-medium); }
  .no-stream small { font-size: var(--text-sm); }

  /* ── Líneas de grilla (cian) ── */
  .grid-line {
    position: absolute;
    pointer-events: none;
    z-index: 20;
    background-color: rgba(0, 210, 255, 0.5);
  }

  .grid-line.vertical  { top: 0; bottom: 0; width: 1px; }
  .grid-line.horizontal { left: 0; right: 0; height: 1px; }

  /* ── Guías arrastrables (rojo) ── */
  .guide {
    position: absolute;
    z-index: 30;
  }

  .guide.vertical {
    top: 0;
    bottom: 0;
    width: 16px;
    margin-left: -8px;
    cursor: ew-resize;
  }

  .guide.horizontal {
    left: 0;
    right: 0;
    height: 16px;
    margin-top: -8px;
    cursor: ns-resize;
  }

  .guide-line {
    position: absolute;
    background-color: rgba(220, 50, 50, 0.8);
    transition: background-color var(--transition-fast);
  }

  .guide.vertical   .guide-line { left: 50%; top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
  .guide.horizontal .guide-line { top: 50%; left: 0; right: 0; height: 1px; transform: translateY(-50%); }

  .guide:hover .guide-line { background-color: rgba(255, 80, 80, 1); }

  /* ── Barra de metadatos ── */
  .metadata-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
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
    align-items: center;
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

  /* ── Panel flotante (zoom + grilla) ── */
  .floating-controls {
    position: absolute;
    top: 24px;
    right: 24px;
    z-index: 40;
    background-color: rgba(26, 24, 21, 0.9);
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
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-light-grey);
    border-radius: var(--radius-md);
    transition: color var(--transition-fast), background-color var(--transition-fast);
    min-height: 0;
  }

  .float-btn:hover { color: var(--color-primary); background-color: rgba(255,255,255,0.05); }

  .float-divider {
    width: 32px;
    height: 1px;
    background-color: var(--border-color);
  }

  /* ── Botón de captura ── */
  .capture-btn-wrapper {
    position: absolute;
    right: 22px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 50;
    /* Ajustar para que no se superponga con el panel flotante */
    margin-top: 80px;
  }

  .capture-btn {
    position: relative;
    width: 60px;
    height: 60px;
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: opacity var(--transition-fast);
  }

  .capture-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Anillos del botón */
  .capture-ring {
    position: absolute;
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .capture-ring.outer {
    inset: 0;
    border: 2px solid rgba(255,255,255,0.6);
    animation: pulse-ring 2s ease infinite;
  }

  .capture-ring.middle {
    width: 52px;
    height: 52px;
    border: 1.5px solid rgba(255,255,255,0.3);
  }

  /* Círculo blanco central */
  .capture-circle {
    width: 44px;
    height: 44px;
    background-color: white;
    border-radius: 50%;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
    transition: transform var(--transition-fast);
    z-index: 1;
  }

  .capture-btn:hover:not(:disabled) .capture-circle { transform: scale(0.93); }
  .capture-btn:active:not(:disabled) .capture-circle { transform: scale(0.88); }
  .capture-btn.capturing .capture-ring.outer { border-color: var(--color-primary); animation: none; }

  @keyframes pulse-ring {
    0%   { opacity: 1; transform: scale(1); }
    50%  { opacity: 0.7; transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }

  /* ── Modal de configuración de grilla ── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
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

  .modal-title {
    font-size: var(--text-h3);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 6px;
  }

  .modal-subtitle {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    margin: 0 0 24px;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 24px;
  }

  .modal-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .modal-label {
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light);
  }

  .slider-with-value {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .modal-range {
    flex: 1;
    height: 8px;
    -webkit-appearance: none;
    background-color: var(--color-surface);
    border-radius: var(--radius-full);
    cursor: pointer;
  }

  .modal-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: var(--color-primary);
    cursor: pointer;
  }

  .range-value {
    width: 40px;
    height: 40px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    flex-shrink: 0;
  }

  .modal-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .modal-toggle-title {
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    color: var(--color-light);
    margin: 0 0 2px;
  }

  .modal-toggle-sub {
    font-size: var(--text-xs);
    color: var(--color-light-grey);
    margin: 0;
  }

  .toggle-btn {
    width: 48px;
    height: 24px;
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
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    transition: transform var(--transition-base), background-color var(--transition-base);
  }

  .toggle-thumb.on { transform: translateX(24px); background-color: white; }

  .modal-actions {
    display: flex;
    gap: 12px;
  }

  .modal-btn {
    flex: 1;
    height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
  }

  .modal-btn.cancel {
    background-color: var(--color-surface);
    color: var(--color-light-grey);
  }

  .modal-btn.cancel:hover { background-color: rgba(255,255,255,0.05); color: var(--color-light); }

  .modal-btn.confirm {
    background-color: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
    box-shadow: 0 4px 12px rgba(90,140,98,0.3);
  }

  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
</style>

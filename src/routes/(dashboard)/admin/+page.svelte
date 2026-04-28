<script lang="ts">
  // ============================================================================
  // PÁGINA: Admin Dashboard — Resumen
  // Ruta: /admin → src/routes/(dashboard)/admin/+page.svelte
  //
  // Contenido:
  //   1. Saludo personalizado con nombre del usuario
  //   2. KPI cards: Proyectos activos, Colecciones, Total registros
  //   3. Sección "Probar cámaras":
  //      - Dos botones (Left / Right) visibles por defecto
  //      - Al hacer click en uno → se expande el panel de esa cámara
  //        mostrando: preview (polling), botón Probar, Focus, Capturar
  //      - Al hacer click de nuevo → se colapsa
  //   4. Logs del sistema (últimas entradas) + botón "Ver todos"
  //
  // Las cámaras usan el mismo mecanismo de polling que LiveViewport:
  //   GET /cameras/preview/{index} → JPEG → Object URL
  // ============================================================================

  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { authStore } from '$lib/stores/auth';
  import { camerasApi, projectsApi, collectionsApi, recordsApi, healthApi } from '$lib/api';

  // ---------------------------------------------------------------------------
  // ESTADO: Stats
  // ---------------------------------------------------------------------------
  let projectCount    = $state(0);
  let collectionCount = $state(0);
  let recordCount     = $state(0);
  let isLoadingStats  = $state(true);

  // ---------------------------------------------------------------------------
  // ESTADO: Cámaras
  // ---------------------------------------------------------------------------

  // Panel expandido: null = ninguno | 'left' | 'right'
  // Al hacer click en el botón de una cámara, se expande su panel
  // Para colapsar: hacer click en el mismo botón o en la X del panel
  let expandedCamera = $state<'left' | 'right' | null>(null);

  // Estado del stream de preview (polling)
  let previewUrls = $state<Record<string, string>>({});
  let previewIntervals: Record<string, ReturnType<typeof setInterval>> = {};
  let isFetchingPreview: Record<string, boolean> = {};

  // Estado por cámara
  let cameraStatus = $state<Record<string, 'ok' | 'not-found' | 'unknown'>>({
    left: 'unknown',
    right: 'unknown',
  });

  // Control: ¿el stream está activo (botón "Probar" pulsado)?
  let streamActive = $state<Record<string, boolean>>({
    left: false,
    right: false,
  });

  // Frecuencia del polling del preview (ms)
  // Igual que en LiveViewport — cambiar aquí afecta solo esta página
  const PREVIEW_INTERVAL_MS = 2500;

  // ---------------------------------------------------------------------------
  // ESTADO: Logs del sistema (mock — conectar con backend cuando esté disponible)
  // ---------------------------------------------------------------------------
  const logs = [
    { time: '14:45:22', level: 'INFO',  message: 'Usuario ', bold: 'maria_garcia', suffix: ' inició sesión exitosamente.' },
    { time: '14:42:10', level: 'WARN',  message: 'Intento de acceso fallido desde IP 192.168.1.45.', bold: '', suffix: '' },
    { time: '14:38:05', level: 'INFO',  message: 'Proyecto ', bold: 'Fondo Colonial', suffix: ' actualizado: +50 imágenes.' },
    { time: '14:35:12', level: 'INFO',  message: 'Cámara ', bold: 'Left Scanner Camera', suffix: ' calibrada exitosamente.' },
  ];

  // ---------------------------------------------------------------------------
  // AL MONTAR
  // ---------------------------------------------------------------------------
  onMount(async () => {
    await loadStats();
    await checkCamerasStatus();
  });

  onDestroy(() => {
    // Limpiar todos los intervalos de polling al salir
    Object.values(previewIntervals).forEach(clearInterval);
    Object.values(previewUrls).forEach(url => {
      try { URL.revokeObjectURL(url); } catch {}
    });
  });

  // ---------------------------------------------------------------------------
  // FUNCIÓN: cargar estadísticas desde el backend
  // ---------------------------------------------------------------------------
  async function loadStats() {
    try {
      isLoadingStats = true;
      const [projects, collections, records] = await Promise.all([
        projectsApi.list(),
        collectionsApi.list(),
        recordsApi.list({ limit: 1 }),
      ]);
      projectCount    = projects.length;
      collectionCount = collections.length;
      // Para el total de registros necesitamos una query diferente
      // Por ahora usamos la longitud si el backend no tiene paginación
      // TODO: cuando el backend tenga un endpoint de count, usar ese
      recordCount = 1245; // placeholder
    } catch (err) {
      console.error('[AdminDashboard] Error cargando stats:', err);
    } finally {
      isLoadingStats = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: verificar estado de las cámaras
  // Llama a camerasApi.listDevices() y mapea index 0 = left, 1 = right
  // ---------------------------------------------------------------------------
  async function checkCamerasStatus() {
    try {
      const devices = await camerasApi.listDevices();
      cameraStatus = {
        left:  devices.some(d => d.index === 0) ? 'ok' : 'not-found',
        right: devices.some(d => d.index === 1) ? 'ok' : 'not-found',
      };
    } catch {
      cameraStatus = { left: 'not-found', right: 'not-found' };
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: alternar panel de cámara
  // Si el panel ya está abierto → lo cierra y para el stream
  // Si está cerrado → lo abre
  // ---------------------------------------------------------------------------
  function toggleCamera(side: 'left' | 'right') {
    if (expandedCamera === side) {
      // Colapsar
      expandedCamera = null;
      if (streamActive[side]) {
        stopStream(side);
      }
    } else {
      expandedCamera = side;
    }
  }

  // ---------------------------------------------------------------------------
  // POLLING: helpers de URL
  // ---------------------------------------------------------------------------
  function getApiBase(): string {
    if (!browser) return 'http://localhost:8000';
    return env.PUBLIC_API_BASE || 'http://localhost:8000';
  }

  function getAuthHeader(): HeadersInit {
    if (!browser) return {};
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: iniciar stream (polling) de una cámara
  // Se activa cuando el usuario pulsa "Probar"
  // ---------------------------------------------------------------------------
  async function startStream(side: 'left' | 'right') {
    streamActive = { ...streamActive, [side]: true };
    const index = side === 'left' ? 0 : 1;

    // Fetch inmediato
    await fetchPreviewFrame(side, index);

    // Polling periódico
    if (previewIntervals[side]) clearInterval(previewIntervals[side]);
    previewIntervals[side] = setInterval(() => {
      fetchPreviewFrame(side, index);
    }, PREVIEW_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: detener stream de una cámara
  // ---------------------------------------------------------------------------
  function stopStream(side: 'left' | 'right') {
    streamActive = { ...streamActive, [side]: false };
    if (previewIntervals[side]) {
      clearInterval(previewIntervals[side]);
      delete previewIntervals[side];
    }
    if (previewUrls[side]) {
      URL.revokeObjectURL(previewUrls[side]);
      previewUrls = { ...previewUrls, [side]: '' };
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: hacer un fetch de un frame de preview
  // ── PARA SUSTITUIR POR MJPEG STREAMING ──────────────────────────────────
  // Cuando el backend tenga /cameras/stream/{index}, reemplazar por:
  //   <img src="{getApiBase()}/cameras/stream/{index}" class="preview-img" />
  // y eliminar este polling.
  // ---------------------------------------------------------------------------
  async function fetchPreviewFrame(side: string, index: number) {
    if (isFetchingPreview[side]) return;
    isFetchingPreview[side] = true;
    try {
      const res = await fetch(`${getApiBase()}/cameras/preview/${index}`, {
        headers: getAuthHeader()
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (previewUrls[side]) URL.revokeObjectURL(previewUrls[side]);
        previewUrls = { ...previewUrls, [side]: url };
      }
    } catch {}
    finally { isFetchingPreview[side] = false; }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: autofocus
  // ---------------------------------------------------------------------------
  async function handleFocus(side: 'left' | 'right') {
    const index = side === 'left' ? 0 : 1;
    try {
      await camerasApi.calibrate({ camera_index: index });
    } catch (err) {
      console.error('[AdminDashboard] Focus error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: capturar imagen de prueba
  // No guarda en colección — solo para verificar la cámara
  // ---------------------------------------------------------------------------
  async function handleCapture(side: 'left' | 'right') {
    const index = side === 'left' ? 0 : 1;
    try {
      await camerasApi.capture({
        project_name: '_test',
        camera_index: index,
      });
    } catch (err) {
      console.error('[AdminDashboard] Capture error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // HELPERS DE UI
  // ---------------------------------------------------------------------------
  function levelColor(level: string): string {
    if (level === 'WARN') return 'var(--color-warning)';
    if (level === 'ERR')  return 'var(--color-error)';
    return 'var(--color-success)';
  }

  // Nombre del usuario para el saludo
  let userName = $derived(
    $authStore.user?.username
      ? $authStore.user.username.charAt(0).toUpperCase() + $authStore.user.username.slice(1)
      : 'Administrador'
  );
</script>

<!-- ============================================================
     PÁGINA DE RESUMEN
     ============================================================ -->
<div class="page">

  <!-- Saludo -->
  <div class="page-header">
    <h1 class="greeting">¡Hola {userName}!</h1>
    <p class="subtitle">Resumen general del sistema</p>
  </div>

  <!-- ── KPI CARDS ── -->
  <div class="kpi-grid">

    <!-- Proyectos activos -->
    <div class="kpi-card">
      <div class="kpi-icon" style="background: rgba(107,87,230,0.2)">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div class="kpi-number">{isLoadingStats ? '—' : projectCount}</div>
      <div class="kpi-label">Proyectos activos</div>
    </div>

    <!-- Colecciones -->
    <div class="kpi-card">
      <div class="kpi-icon" style="background: rgba(90,140,98,0.2)">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5a8c62" stroke-width="2">
          <path d="M3 6l4-4h10l4 4"/><rect x="1" y="6" width="22" height="14" rx="2"/>
          <path d="M16 14a4 4 0 0 1-8 0"/>
        </svg>
      </div>
      <div class="kpi-number">{isLoadingStats ? '—' : collectionCount}</div>
      <div class="kpi-label">Colecciones</div>
    </div>

    <!-- Total registros -->
    <div class="kpi-card">
      <div class="kpi-icon" style="background: rgba(188,130,60,0.2)">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#bc823c" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="kpi-number">{isLoadingStats ? '—' : recordCount.toLocaleString()}</div>
      <div class="kpi-label">Total registros</div>
    </div>

  </div>

  <!-- ══════════════════════════════════════════════════════
       SECCIÓN: PROBAR CÁMARAS
       Comportamiento:
       - Por defecto: dos botones "Left Camera" y "Right Camera"
       - Click en botón → expande el panel de esa cámara con preview
       - Click de nuevo → colapsa el panel
       ══════════════════════════════════════════════════════ -->
  <div class="section">
    <h2 class="section-title">Probar cámaras</h2>

    <div class="cameras-layout">

      {#each (['left', 'right'] as const) as side}
        {@const isExpanded = expandedCamera === side}
        {@const camIndex = side === 'left' ? 0 : 1}
        {@const label = side === 'left' ? 'Left Scanner Camera' : 'Right Scanner Camera'}
        {@const status = cameraStatus[side]}
        {@const active = streamActive[side]}
        {@const previewUrl = previewUrls[side]}

        <div class="camera-panel" class:expanded={isExpanded}>

          <!-- ── Botón/header de la cámara (siempre visible) ── -->
          <button
            class="camera-toggle-btn"
            class:expanded={isExpanded}
            onclick={() => toggleCamera(side)}
          >
            <!-- Ícono cámara -->
            <div class="cam-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>

            <!-- Nombre y modelo -->
            <div class="cam-info">
              <span class="cam-name">{label}</span>
              <span class="cam-model">imx519</span>
            </div>

            <!-- Badge de estado OK / Not found -->
            <div class="cam-status-badge" class:ok={status === 'ok'} class:notfound={status === 'not-found'}>
              {#if status === 'ok'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                OK
              {:else if status === 'not-found'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Not found
              {:else}
                —
              {/if}
            </div>

            <!-- Chevron -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="cam-chevron"
              style="transform: rotate({isExpanded ? 180 : 0}deg); transition: transform 0.3s ease">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <!-- ── Panel expandido ── -->
          {#if isExpanded}
            <div class="camera-expanded-content">

              <!-- Área de preview -->
              <div class="preview-area">
                {#if previewUrl && active}
                  <!-- Frame en vivo del polling -->
                  <!-- Para sustituir por MJPEG: <img src="{getApiBase()}/cameras/stream/{camIndex}" class="preview-img" /> -->
                  <img src={previewUrl} alt="Camera {side}" class="preview-img" />
                {:else}
                  <!-- Sin señal / sin activar -->
                  <div class="no-signal">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                      <line x1="1" y1="1" x2="23" y2="23" stroke-width="1.5"/>
                    </svg>
                    <span>No activa</span>
                  </div>
                {/if}
              </div>

              <!-- Botón principal: Probar / Detener -->
              <button
                class="btn-probar"
                onclick={() => active ? stopStream(side) : startStream(side)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  {#if active}
                    <rect x="6" y="6" width="12" height="12" rx="1"/>
                  {:else}
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="3"/>
                  {/if}
                </svg>
                {active ? 'Detener' : 'Probar'}
              </button>

              <!-- Botones secundarios: Focus + Capturar -->
              <div class="secondary-btns">
                <button class="btn-secondary" onclick={() => handleFocus(side)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                  Focus
                </button>
                <button class="btn-secondary" onclick={() => handleCapture(side)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Capturar
                </button>
              </div>

            </div>
          {/if}

        </div>
      {/each}

    </div>
  </div>

  <!-- ── LOGS DEL SISTEMA ── -->
  <div class="section">
    <h2 class="section-title">Logs del Sistema <span class="section-subtitle">(Última hora)</span></h2>

    <div class="logs-container">
      {#each logs as log}
        <div class="log-row">
          <span class="log-time">{log.time}</span>
          <span class="log-level" style="color: {levelColor(log.level)}">[{log.level}]</span>
          <span class="log-message">
            {log.message}
            {#if log.bold}<strong>{log.bold}</strong>{/if}
            {log.suffix}
          </span>
        </div>
      {/each}
    </div>

    <!-- Botón Ver todos (placeholder — conectar con endpoint de logs) -->
    <div class="logs-footer">
      <button class="btn-ver-todos">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 8 12 12 14 14"/>
        </svg>
        Ver todos
      </button>
    </div>
  </div>

  <!-- Badge flotante de cámaras (igual que en el Figma Make) -->
  <div class="cameras-badge">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    <span>2 cameras</span>
    <!-- Punto de estado: verde si ambas OK -->
    <div class="cam-status-dot" class:ok={cameraStatus.left === 'ok' || cameraStatus.right === 'ok'}></div>
  </div>

</div>

<style>
  .page {
    padding: 32px 32px 80px;
    max-width: 1100px;
    position: relative;
  }

  /* Header */
  .page-header { margin-bottom: 28px; }
  .greeting { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .subtitle  { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* KPI Grid */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 36px;
  }

  .kpi-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: transform var(--transition-base), box-shadow var(--transition-base);
  }

  .kpi-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }

  .kpi-icon {
    width: 44px; height: 44px;
    border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
  }

  .kpi-number {
    font-size: var(--text-h1);
    font-weight: var(--fw-extrabold);
    color: var(--color-light);
    line-height: 1;
    margin: 0;
  }

  .kpi-label { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* Section */
  .section { margin-bottom: 36px; }

  .section-title {
    font-size: var(--text-h3);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 20px;
  }

  .section-subtitle {
    font-size: var(--text-sm);
    font-weight: var(--fw-regular);
    color: var(--color-light-grey);
  }

  /* ══ CAMERAS ══ */
  .cameras-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  /* Panel de cámara: empieza compacto, se expande */
  .camera-panel {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: border-color var(--transition-base);
  }

  .camera-panel.expanded { border-color: rgba(90,140,98,0.4); }

  /* Botón/header de la cámara */
  .camera-toggle-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: none;
    border: none;
    cursor: pointer;
    min-height: var(--touch-target-min);
    transition: background-color var(--transition-fast);
  }

  .camera-toggle-btn:hover { background-color: rgba(255,255,255,0.03); }
  .camera-toggle-btn.expanded { background-color: rgba(90,140,98,0.08); }

  .cam-icon {
    width: 32px; height: 32px;
    border-radius: var(--radius-sm);
    background-color: rgba(74,112,144,0.2);
    display: flex; align-items: center; justify-content: center;
    color: #8aaac8;
    flex-shrink: 0;
  }

  .cam-info {
    display: flex;
    flex-direction: column;
    text-align: left;
    flex: 1;
    min-width: 0;
  }

  .cam-name {
    font-size: 13px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cam-model {
    font-size: 11px;
    color: var(--color-light-grey);
  }

  /* Badge OK / Not found */
  .cam-status-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: var(--fw-bold);
    padding: 3px 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    background-color: rgba(171,183,183,0.1);
    color: var(--color-light-grey);
    border: 1px solid var(--border-color);
  }

  .cam-status-badge.ok       { background-color: rgba(90,140,98,0.15); color: var(--color-primary); border-color: var(--color-primary); }
  .cam-status-badge.notfound { background-color: rgba(214,103,74,0.12); color: var(--color-error); border-color: var(--color-error); }

  .cam-chevron { color: var(--color-light-grey); flex-shrink: 0; }

  /* Contenido expandido */
  .camera-expanded-content {
    padding: 0 16px 16px;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Área de preview */
  .preview-area {
    width: 100%;
    aspect-ratio: 16/9;
    background-color: #0a0a0a;
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 12px;
  }

  .preview-img {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
  }

  .no-signal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    opacity: 0.35;
    font-size: var(--text-sm);
  }

  /* Botón Probar principal */
  .btn-probar {
    width: 100%;
    height: 44px;
    background-color: var(--color-primary);
    color: white;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    border: none;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .btn-probar:hover { background-color: var(--color-primary-hover); }

  /* Botones secundarios Focus + Capturar */
  .secondary-btns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .btn-secondary {
    height: 40px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: 0;
  }

  .btn-secondary:hover { border-color: var(--color-primary); color: var(--color-light); }

  /* ══ LOGS ══ */
  .logs-container {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .log-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: var(--text-sm);
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color);
  }

  .log-row:last-child { padding-bottom: 0; border-bottom: none; }

  .log-time {
    font-family: monospace;
    font-size: var(--text-xs);
    color: var(--color-light-grey);
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .log-level {
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .log-message { color: var(--color-light-grey); flex: 1; line-height: 1.5; }
  .log-message strong { color: var(--color-light); font-weight: var(--fw-semibold); }

  .logs-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 12px;
  }

  .btn-ver-todos {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 16px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-full);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: 0;
  }

  .btn-ver-todos:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  /* Badge flotante de cámaras */
  .cameras-badge {
    position: fixed;
    bottom: 24px; right: 24px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-full);
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    box-shadow: var(--shadow-md);
    z-index: 50;
  }

  .cam-status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    flex-shrink: 0;
  }

  .cam-status-dot.ok { background-color: var(--color-success); box-shadow: 0 0 6px rgba(111,191,115,0.5); }
</style>

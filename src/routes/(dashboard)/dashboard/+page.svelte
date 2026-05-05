<script lang="ts">
  // ============================================================================
  // PÁGINA: Resumen (Dashboard unificado)
  // Ruta: /dashboard → src/routes/(dashboard)/+page.svelte
  //
  // Una sola página de resumen para todos los roles.
  // El contenido se adapta según el rol:
  //
  //   admin    → KPIs + cámaras expandibles + logs del sistema
  //   operator → KPIs + cámaras expandibles (sin logs)
  //   reviewer → KPIs (sin cámaras ni logs)
  //
  // Para mostrar/ocultar secciones por rol, busca los comentarios
  // "Solo admin", "Admin + Operator", etc. en el template.
  // ============================================================================

  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { authStore } from '$lib/stores/auth';
  import { camerasApi, projectsApi, collectionsApi, recordsApi } from '$lib/api';

  // ---------------------------------------------------------------------------
  // ESTADO: Usuario y rol
  // ---------------------------------------------------------------------------
  let currentUser = $state<any>(null);
  let userRole    = $state('');

  onMount(() => {
    const unsub = authStore.subscribe(s => {
      currentUser = s.user;
      userRole    = s.user?.role ?? '';
    });
    return unsub;
  });

  // Derivados de visibilidad de secciones
  let isAdmin    = $derived(userRole === 'admin');
  let isOperator = $derived(userRole === 'operator');
  let isReviewer = $derived(userRole === 'reviewer');
  let canSeeCameras = $derived(isAdmin || isOperator);
  let canSeeLogs    = $derived(isAdmin);

  // Nombre del usuario para el saludo
  let userName = $derived(
    currentUser?.username
      ? currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1)
      : 'bienvenido'
  );

  // ---------------------------------------------------------------------------
  // ESTADO: KPI stats
  // ---------------------------------------------------------------------------
  let projectCount    = $state(0);
  let collectionCount = $state(0);
  let recordCount     = $state(1245); // placeholder hasta que el backend tenga /count
  let isLoadingStats  = $state(true);

  // ---------------------------------------------------------------------------
  // ESTADO: Almacenamiento
  // Se muestra una alerta en el resumen cuando el uso supera el 85%.
  // TODO: backend — reemplazar con llamada a systemApi.getStorageInfo()
  // ---------------------------------------------------------------------------
  const STORAGE_ALERT_THRESHOLD = 85;  // porcentaje

  let storageUsedGB  = $state(2457.6);   // placeholder — conectar con backend
  let storageTotalGB = $state(10240);

  let storagePercent = $derived(
    Math.min(100, Math.round((storageUsedGB / storageTotalGB) * 100))
  );

  let storageAlert = $derived(storagePercent >= STORAGE_ALERT_THRESHOLD);

  function formatStorage(gb: number): string {
    if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
    return `${gb.toFixed(0)} GB`;
  }

  // ---------------------------------------------------------------------------
  // ESTADO: Cámaras
  // expandedCamera: null | 'left' | 'right'
  // Click en botón → expande el panel de esa cámara con preview
  // Click de nuevo → colapsa
  // ---------------------------------------------------------------------------
  let expandedCamera = $state<'left' | 'right' | null>(null);
  let previewUrls    = $state<Record<string, string>>({});
  let streamActive   = $state<Record<string, boolean>>({ left: false, right: false });
  let cameraStatus   = $state<Record<string, 'ok' | 'not-found' | 'unknown'>>({ left: 'unknown', right: 'unknown' });
  let previewIntervals: Record<string, ReturnType<typeof setInterval>> = {};
  let isFetchingPreview: Record<string, boolean> = {};

  // Frecuencia del polling (ms) — para cambiar, modifica este valor
  const PREVIEW_INTERVAL_MS = 2500;

  // ---------------------------------------------------------------------------
  // ESTADO: Logs del sistema (mock — conectar con backend)
  // ---------------------------------------------------------------------------
  const logs = [
    { time: '14:45:22', level: 'INFO',  msg: 'Usuario ', bold: 'maria_garcia', suffix: ' inició sesión exitosamente.' },
    { time: '14:42:10', level: 'WARN',  msg: 'Intento de acceso fallido desde IP 192.168.1.45.', bold: '', suffix: '' },
    { time: '14:38:05', level: 'INFO',  msg: 'Proyecto ', bold: 'Fondo Colonial', suffix: ' actualizado: +50 imágenes.' },
    { time: '14:35:12', level: 'INFO',  msg: 'Cámara ', bold: 'Left Scanner Camera', suffix: ' calibrada exitosamente.' },
  ];

  // ---------------------------------------------------------------------------
  // AL MONTAR
  // ---------------------------------------------------------------------------
  onMount(async () => {
    await Promise.all([
      loadStats(),
      canSeeCameras ? checkCamerasStatus() : Promise.resolve(),
    ]);
  });

  onDestroy(() => {
    Object.values(previewIntervals).forEach(clearInterval);
    Object.values(previewUrls).forEach(url => { try { URL.revokeObjectURL(url); } catch {} });
  });

  // ---------------------------------------------------------------------------
  // FUNCIONES
  // ---------------------------------------------------------------------------

  async function loadStats() {
    try {
      isLoadingStats = true;
      const [projects, collections] = await Promise.all([
        projectsApi.list(),
        collectionsApi.list(),
      ]);
      projectCount    = projects.length;
      collectionCount = collections.length;
    } catch (err) {
      console.error('[Dashboard] Stats error:', err);
    } finally {
      isLoadingStats = false;
    }
  }

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

  function toggleCamera(side: 'left' | 'right') {
    if (expandedCamera === side) {
      expandedCamera = null;
      if (streamActive[side]) stopStream(side);
    } else {
      expandedCamera = side;
    }
  }

  function getApiBase(): string {
    if (!browser) return 'http://localhost:8000';
    return env.PUBLIC_API_BASE || 'http://localhost:8000';
  }

  function getAuthHeader(): HeadersInit {
    if (!browser) return {};
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function startStream(side: 'left' | 'right') {
    streamActive = { ...streamActive, [side]: true };
    const index = side === 'left' ? 0 : 1;
    await fetchFrame(side, index);
    if (previewIntervals[side]) clearInterval(previewIntervals[side]);
    previewIntervals[side] = setInterval(() => fetchFrame(side, index), PREVIEW_INTERVAL_MS);
  }

  function stopStream(side: 'left' | 'right') {
    streamActive = { ...streamActive, [side]: false };
    if (previewIntervals[side]) { clearInterval(previewIntervals[side]); delete previewIntervals[side]; }
    if (previewUrls[side]) { URL.revokeObjectURL(previewUrls[side]); previewUrls = { ...previewUrls, [side]: '' }; }
  }

  // ── PARA SUSTITUIR POR STREAMING REAL ──────────────────────────────────────
  // Cuando el backend tenga /cameras/stream/{index}, reemplazar fetchFrame por:
  //   <img src="{getApiBase()}/cameras/stream/{index}" class="preview-img" />
  // y eliminar el polling.
  async function fetchFrame(side: string, index: number) {
    if (isFetchingPreview[side]) return;
    isFetchingPreview[side] = true;
    try {
      const res = await fetch(`${getApiBase()}/cameras/preview/${index}`, { headers: getAuthHeader() });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (previewUrls[side]) URL.revokeObjectURL(previewUrls[side]);
        previewUrls = { ...previewUrls, [side]: url };
      }
    } catch {}
    finally { isFetchingPreview[side] = false; }
  }

  async function handleFocus(side: 'left' | 'right') {
    try { await camerasApi.calibrate({ camera_index: side === 'left' ? 0 : 1 }); } catch {}
  }

  async function handleCapture(side: 'left' | 'right') {
    try { await camerasApi.capture({ project_name: '_test', camera_index: side === 'left' ? 0 : 1 }); } catch {}
  }

  function levelColor(level: string): string {
    if (level === 'WARN') return 'var(--color-warning)';
    if (level === 'ERR')  return 'var(--color-error)';
    return 'var(--color-success)';
  }
</script>

<!-- ============================================================
     PÁGINA DE RESUMEN
     ============================================================ -->
<div class="page">

  <!-- Saludo personalizado -->
  <div class="page-header">
    <h1 class="greeting">¡Hola {userName}!</h1>
    <p class="subtitle">
      {#if isAdmin}Panel de administración — Resumen general del sistema
      {:else if isOperator}Panel de operario — Tus proyectos asignados
      {:else}Panel de revisión — Colecciones pendientes de revisión
      {/if}
    </p>
  </div>

  <!-- ── ALERTA DE ALMACENAMIENTO ── -->
  <!-- Visible solo cuando el almacenamiento supera el STORAGE_ALERT_THRESHOLD -->
  <!-- La misma lógica está en la página de Configuración -->
  {#if storageAlert}
    <div class="storage-alert-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>
        El almacenamiento está al <strong>{storagePercent}%</strong>
        ({formatStorage(storageUsedGB)} / {formatStorage(storageTotalGB)}).
        Revisa la <a href="/dashboard/config" class="alert-link">Configuración</a> para liberar espacio.
      </span>
    </div>
  {/if}

  <!-- ── KPI CARDS ── -->
  <div class="kpi-grid">

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-primary)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : projectCount}</div>
      <div class="kpi-label">Proyectos activos</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-secondary)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : collectionCount}</div>
      <div class="kpi-label">Colecciones</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-warning)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : recordCount.toLocaleString()}</div>
      <div class="kpi-label">Total registros</div>
    </div>

  </div>

  <!-- ══════════════════════════════════════════════════════
       SECCIÓN: PROBAR CÁMARAS
       Solo visible para admin y operator (canSeeCameras)
       ══════════════════════════════════════════════════════ -->
  {#if canSeeCameras}
    <div class="section">
      <h2 class="section-title">Probar cámaras</h2>

      <div class="cameras-layout">
        {#each (['left', 'right'] as const) as side}
          {@const isExpanded = expandedCamera === side}
          {@const label = side === 'left' ? 'Left Scanner Camera' : 'Right Scanner Camera'}
          {@const status = cameraStatus[side]}
          {@const active = streamActive[side]}

          <div class="camera-panel" class:expanded={isExpanded}>

            <!-- Botón/header (siempre visible) — click para expandir/colapsar -->
            <button class="camera-toggle-btn" class:expanded={isExpanded} onclick={() => toggleCamera(side)}>
              <div class="cam-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
              <div class="cam-info">
                <span class="cam-name">{label}</span>
                <span class="cam-model">imx519</span>
              </div>
              <!-- Badge OK / Not found -->
              <div class="cam-badge" class:ok={status === 'ok'} class:notfound={status === 'not-found'}>
                {#if status === 'ok'}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  OK
                {:else if status === 'not-found'}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Not found
                {:else}—{/if}
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="transform: rotate({isExpanded ? 180 : 0}deg); transition: transform 0.3s ease; flex-shrink:0; color: var(--color-light-grey)">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            <!-- Panel expandido: preview + botones -->
            {#if isExpanded}
              <div class="cam-expanded">
                <!-- Área de preview (polling) -->
                <!-- Para sustituir: ver comentario en fetchFrame() arriba -->
                <div class="preview-area">
                  {#if previewUrls[side] && active}
                    <img src={previewUrls[side]} alt="Camera {side}" class="preview-img" />
                  {:else}
                    <div class="no-signal">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                      <span>No activa</span>
                    </div>
                  {/if}
                </div>

                <!-- Botón Probar / Detener -->
                <button class="btn-probar" onclick={() => active ? stopStream(side) : startStream(side)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    {#if active}
                      <rect x="6" y="6" width="12" height="12" rx="1"/>
                    {:else}
                      <circle cx="12" cy="12" r="10"/>
                      <circle cx="12" cy="12" r="3"/>
                    {/if}
                  </svg>
                  {active ? 'Detener' : 'Probar'}
                </button>

                <!-- Botones secundarios -->
                <div class="secondary-btns">
                  <button class="btn-secondary" onclick={() => handleFocus(side)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                    Focus
                  </button>
                  <button class="btn-secondary" onclick={() => handleCapture(side)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
  {/if}

  <!-- ══════════════════════════════════════════════════════
       SECCIÓN: LOGS DEL SISTEMA
       Solo visible para admin (canSeeLogs)
       ══════════════════════════════════════════════════════ -->
  {#if canSeeLogs}
    <div class="section">
      <h2 class="section-title">
        Logs del Sistema
        <span class="section-sub">(Última hora)</span>
      </h2>
      <div class="logs-box">
        {#each logs as log}
          <div class="log-row">
            <span class="log-time">{log.time}</span>
            <span class="log-level" style="color:{levelColor(log.level)}">[{log.level}]</span>
            <span class="log-msg">
              {log.msg}
              {#if log.bold}<strong>{log.bold}</strong>{/if}
              {log.suffix}
            </span>
          </div>
        {/each}
        <div class="logs-footer">
          <button class="btn-ver-todos">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>
            </svg>
            Ver todos
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Badge flotante de cámaras (solo si el usuario puede ver cámaras) -->
  {#if canSeeCameras}
    <div class="cameras-badge">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <span>2 cameras</span>
      <div class="cam-dot" class:ok={cameraStatus.left === 'ok' || cameraStatus.right === 'ok'}></div>
    </div>
  {/if}

</div>

<style>
  .page { padding: 32px 32px 80px; max-width: 1100px; position: relative; }

  .page-header { margin-bottom: 28px; }
  .greeting { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* Alerta de almacenamiento */
  .storage-alert-banner {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 14px 18px;
    background-color: rgba(214,103,74,0.08);
    border: 1px solid rgba(214,103,74,0.3);
    border-radius: var(--radius-md);
    color: var(--color-error);
    font-size: var(--text-sm); line-height: 1.5;
    margin-bottom: 24px;
  }

  .storage-alert-banner strong { font-weight: var(--fw-bold); }

  .alert-link {
    color: var(--color-error);
    font-weight: var(--fw-semibold);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .alert-link:hover { opacity: 0.8; }

  /* KPIs */
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
    padding: 20px 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: transform var(--transition-base);
  }

  .kpi-card:hover { transform: translateY(-3px); }

  /* Rayita de color en la parte superior izquierda */
  .kpi-line {
    width: 32px;
    height: 3px;
    border-radius: var(--radius-full);
    margin-bottom: 4px;
  }

  .kpi-number { font-size: var(--text-h1); font-weight: var(--fw-extrabold); color: var(--color-light); line-height: 1; margin: 0; }
  .kpi-label  { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* Sección */
  .section { margin-bottom: 36px; }
  .section-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 20px; }
  .section-sub { font-size: var(--text-sm); font-weight: var(--fw-regular); color: var(--color-light-grey); margin-left: 8px; }

  /* Cámaras */
  .cameras-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .camera-panel {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: border-color var(--transition-base);
  }

  .camera-panel.expanded { border-color: rgba(90,140,98,0.4); }

  .camera-toggle-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: none; border: none;
    cursor: pointer;
    min-height: var(--touch-target-min);
    transition: background-color var(--transition-fast);
  }

  .camera-toggle-btn:hover    { background-color: rgba(255,255,255,0.03); }
  .camera-toggle-btn.expanded { background-color: rgba(90,140,98,0.08); }

  .cam-icon {
    width: 30px; height: 30px;
    border-radius: var(--radius-sm);
    background-color: rgba(74,112,144,0.2);
    display: flex; align-items: center; justify-content: center;
    color: #8aaac8; flex-shrink: 0;
  }

  .cam-info { display: flex; flex-direction: column; text-align: left; flex: 1; min-width: 0; }
  .cam-name  { font-size: 13px; font-weight: var(--fw-bold); color: var(--color-light); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cam-model { font-size: 11px; color: var(--color-light-grey); }

  .cam-badge {
    display: flex; align-items: center; gap: 4px;
    font-size: 11px; font-weight: var(--fw-bold);
    padding: 3px 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
    background-color: rgba(171,183,183,0.1);
    color: var(--color-light-grey);
    border: 1px solid var(--border-color);
  }

  .cam-badge.ok       { background-color: rgba(90,140,98,0.15); color: var(--color-primary); border-color: var(--color-primary); }
  .cam-badge.notfound { background-color: rgba(214,103,74,0.12); color: var(--color-error); border-color: var(--color-error); }

  .cam-expanded {
    padding: 0 16px 16px;
    border-top: 1px solid var(--border-color);
    display: flex; flex-direction: column; gap: 10px;
  }

  .preview-area {
    width: 100%; aspect-ratio: 16/9;
    background-color: #0a0a0a;
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    margin-top: 12px;
  }

  .preview-img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .no-signal {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: var(--color-light-grey); opacity: 0.35;
    font-size: var(--text-sm);
  }

  .btn-probar {
    width: 100%; height: 44px;
    background-color: var(--color-primary); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; transition: background-color var(--transition-base);
  }

  .btn-probar:hover { background-color: var(--color-primary-hover); }

  .secondary-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

  .btn-secondary {
    height: 40px;
    background: none; border: 1px solid var(--border-color); border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center; gap: 7px;
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    transition: all var(--transition-fast); min-height: 0;
  }

  .btn-secondary:hover { border-color: var(--color-primary); color: var(--color-light); }

  /* Logs */
  .logs-box {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 16px 20px;
    display: flex; flex-direction: column; gap: 12px;
  }

  .log-row {
    display: flex; align-items: flex-start; gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color);
    font-size: var(--text-sm);
  }

  .log-row:last-of-type { padding-bottom: 0; border-bottom: none; }

  .log-time  { font-family: monospace; font-size: var(--text-xs); color: var(--color-light-grey); white-space: nowrap; flex-shrink: 0; padding-top: 2px; }
  .log-level { font-size: var(--text-xs); font-weight: var(--fw-bold); white-space: nowrap; flex-shrink: 0; padding-top: 2px; }
  .log-msg   { color: var(--color-light-grey); flex: 1; line-height: 1.5; }
  .log-msg strong { color: var(--color-light); font-weight: var(--fw-semibold); }

  .logs-footer { display: flex; justify-content: flex-end; padding-top: 4px; }

  .btn-ver-todos {
    display: flex; align-items: center; gap: 7px;
    padding: 7px 14px;
    background: none; border: 1px solid var(--border-color); border-radius: var(--radius-full);
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    transition: all var(--transition-fast); min-height: 0;
  }

  .btn-ver-todos:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }

  /* Badge flotante de cámaras */
  .cameras-badge {
    position: fixed; bottom: 24px; right: 24px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-full);
    padding: 8px 16px;
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: var(--fw-bold);
    color: var(--color-light);
    box-shadow: var(--shadow-md); z-index: 50;
  }

  .cam-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background-color: var(--color-light-grey); flex-shrink: 0;
  }

  .cam-dot.ok { background-color: var(--color-success); box-shadow: 0 0 6px rgba(111,191,115,0.5); }
</style>
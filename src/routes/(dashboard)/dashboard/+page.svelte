<script lang="ts">
  // ============================================================================
  // PÁGINA: Resumen (Dashboard unificado)
  // Ruta: /dashboard → src/routes/(dashboard)/+page.svelte
  //
  // Una sola página de resumen para todos los roles.
  // El contenido se adapta según el rol:
  //
  //   admin    → KPIs + cámaras expandibles
  //   operator → KPIs + cámaras expandibles
  //   reviewer → KPIs
  //
  // Para mostrar/ocultar secciones por rol, busca los comentarios
  // "Solo admin", "Admin + Operator", etc. en el template.
  // ============================================================================

  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { authStore } from '$lib/stores/auth';
  import { camerasApi, projectsApi, collectionsApi, recordsApi, AuthError, tokenStore } from '$lib/api';
  import { m } from '$lib/i18n';
  import { describeCaptureFailure, describeTestCapture, type CaptureOutcome } from '$lib/capture-outcome';
  import { sidesFromDevices, type SideInfo, type SideStatus } from '$lib/camera-sides';
  import { createCameraRefresh } from '$lib/camera-refresh';

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

  // Nombre del usuario para el saludo
  let userName = $derived(
    currentUser?.username
      ? currentUser.username.charAt(0).toUpperCase() + currentUser.username.slice(1)
      : $m.dash_greeting_fallback
  );

  // ---------------------------------------------------------------------------
  // ESTADO: KPI stats
  // ---------------------------------------------------------------------------
  let projectCount    = $state(0);
  let collectionCount = $state(0);
  let recordCount     = $state(0);
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
  let cameraModel    = $state<Record<string, string | null>>({ left: null, right: null });
  type CameraSides = { left: SideInfo; right: SideInfo };
  // Writers: initial enumeration, reconnect, and per-side preview results.
  // List writers use cameraRefresh; previews check its recovery token and
  // patch only their own side. Every status/model write happens here.
  function applyCameraSides(sides: Partial<CameraSides>) {
    for (const side of ['left', 'right'] as const) {
      const info = sides[side];
      if (!info) continue;
      cameraStatus = { ...cameraStatus, [side]: info.status };
      cameraModel = { ...cameraModel, [side]: info.model };
    }
  }
  const cameraRefresh = createCameraRefresh<CameraSides>(applyCameraSides);

  function applyPreviewStatus(token: number | null, side: string, status: SideStatus): boolean {
    if (!cameraRefresh.acceptPreview(token)) return false;
    applyCameraSides({ [side]: { status, model: cameraModel[side] } });
    return true;
  }
  let previewIntervals: Record<string, ReturnType<typeof setInterval>> = {};
  let isFetchingPreview: Record<string, boolean> = {};
  // Resultado de la última captura de prueba por cámara — visible hasta que se
  // limpia (éxito) o hasta la próxima captura (fallo, para que no desaparezca sola).
  let captureStatus = $state<Record<'left' | 'right', CaptureOutcome | null>>({ left: null, right: null });
  // Handle del timeout que limpia un resultado "ok" tras 4s — si llega una
  // segunda captura en esa ventana, hay que cancelar el timer de la primera
  // para que no borre el resultado (éxito o error) de la segunda (NEH-166).
  let captureClearTimers: Record<'left' | 'right', ReturnType<typeof setTimeout> | null> = { left: null, right: null };
  // true mientras hay una petición de captura en curso para ese lado — bloquea
  // el botón para que no se puedan solapar dos capturas en la misma cámara.
  let captureInFlight = $state<Record<'left' | 'right', boolean>>({ left: false, right: false });
  // Contador (no reactivo) por lado: cada captura incrementa su valor y guarda
  // el suyo en `seq`; si al terminar el contador ya avanzó, esta respuesta es
  // obsoleta y no debe escribir en captureStatus. Guarda de refuerzo — con el
  // botón deshabilitado durante la petición no debería llegar a activarse.
  let captureSeq: Record<'left' | 'right', number> = { left: 0, right: 0 };

  // Frecuencia del polling (ms) — para cambiar, modifica este valor
  const PREVIEW_INTERVAL_MS = 2500;

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
    Object.values(captureClearTimers).forEach(timer => { if (timer) clearTimeout(timer); });
  });

  // ---------------------------------------------------------------------------
  // FUNCIONES
  // ---------------------------------------------------------------------------

  async function loadStats() {
    try {
      isLoadingStats = true;
      const [projects, collectionCountResult, count] = await Promise.all([
        projectsApi.list(),
        collectionsApi.count(),
        recordsApi.count(),
      ]);
      projectCount    = projects.length;
      collectionCount = collectionCountResult;
      recordCount     = count;
    } catch (err) {
      console.error('[Dashboard] Stats error:', err);
    } finally {
      isLoadingStats = false;
    }
  }

  async function checkCamerasStatus() {
    await cameraRefresh.read(
      async () => sidesFromDevices(await camerasApi.listDevices()),
      (err) => {
        // A dead login is not a hardware failure; apiRequest redirects (NEH-64).
        if (err instanceof AuthError && err.status === 401) return;
        applyCameraSides({
          left: { status: 'not-found', model: null },
          right: { status: 'not-found', model: null }
        });
      }
    );
  }

  // true mientras hay una petición de "reconectar cámaras" en curso — evita
  // solapar dos reconexiones y deshabilita el botón mientras corre.
  let rescanInFlight = $state(false);
  // Mensaje de error de la última reconexión fallida, o null si no hay uno
  // pendiente de mostrar.
  let rescanError = $state<string | null>(null);

  async function rescanCameras() {
    if (rescanInFlight) return;
    rescanInFlight = true;
    try {
      await cameraRefresh.reconnect(async () => sidesFromDevices(await camerasApi.rescan()));
      rescanError = null;
    } catch (err) {
      // Un 401 significa sesión muerta, no un fallo de reconexión — apiRequest
      // ya limpió la sesión y redirige a /login (mismo razonamiento que
      // checkCamerasStatus, NEH-64).
      if (err instanceof AuthError && err.status === 401) return;
      rescanError = err instanceof Error ? err.message : String(err);
    } finally {
      rescanInFlight = false;
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
    const token = tokenStore.get();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  async function startStream(side: 'left' | 'right') {
    streamActive = { ...streamActive, [side]: true };
    const index = side === 'left' ? 0 : 1;
    await fetchFrame(side, index);
    // fetchFrame() puede haber detenido el stream (cámara no encontrada,
    // 404) mientras esperábamos — no instalar el polling en ese caso.
    if (!streamActive[side]) return;
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
    const token = cameraRefresh.previewToken();
    try {
      const res = await fetch(`${getApiBase()}/cameras/preview/${index}`, { headers: getAuthHeader() });
      if (res.status === 404) {
        // A preview from before/during reconnect cannot undo its result or
        // stop the stream. An accepted failure changes only this camera.
        if (applyPreviewStatus(token, side, 'not-found')) {
          stopStream(side as 'left' | 'right');
        }
        return;
      }
      if (res.ok) {
        // A good frame is evidence the body is there, whether the badge said
        // not-found or was still unknown while the device list loaded.
        if (cameraStatus[side] !== 'ok') {
          applyPreviewStatus(token, side, 'ok');
        }
        const blob = await res.blob();
        // Si el operador detuvo el stream mientras esta petición estaba en
        // vuelo, el frame llega tarde: no publicarlo, porque ya no hay
        // polling que lo reemplace y el recuadro se quedaría con una imagen
        // vieja junto a "Probar". Una captura de prueba sí se muestra con
        // el stream detenido (NEH-166), pero esa entra por handleCapture.
        if (!streamActive[side as 'left' | 'right']) return;
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
    // Si ya hay una captura en curso para este lado, ignora el clic — evita
    // que dos peticiones se solapen y pisen el resultado la una de la otra
    // (NEH-166).
    if (captureInFlight[side]) return;
    captureInFlight = { ...captureInFlight, [side]: true };
    // Marca esta captura como la más reciente para este lado; cualquier
    // escritura posterior a captureStatus[side] que no lleve este número ya
    // quedó obsoleta y se descarta.
    const seq = ++captureSeq[side];
    // Cancela el timer de limpieza de una captura anterior en esta cámara,
    // si lo hay, para que no borre el resultado de esta nueva captura (NEH-166).
    if (captureClearTimers[side]) {
      clearTimeout(captureClearTimers[side]!);
      captureClearTimers[side] = null;
    }
    captureStatus = { ...captureStatus, [side]: null };
    try {
      const index = side === 'left' ? 0 : 1;
      const result = await camerasApi.testCapture(index);
      if (seq === captureSeq[side]) {
        // La imagen capturada sustituye el frame de preview de este lado
        // hasta que llegue el próximo frame real (NEH-166) — así el
        // operador ve lo que la cámara realmente tomó, en el mismo recuadro.
        const url = URL.createObjectURL(result.blob);
        if (previewUrls[side]) URL.revokeObjectURL(previewUrls[side]);
        previewUrls = { ...previewUrls, [side]: url };
        const outcome = describeTestCapture(result, url);
        captureStatus = { ...captureStatus, [side]: outcome };
        captureClearTimers[side] = setTimeout(() => {
          captureClearTimers[side] = null;
          // Solo limpiar si el resultado sigue siendo el "ok" que programó
          // este timer — si una captura posterior ya cambió el estado
          // (éxito o error), no lo pisemos.
          if (seq === captureSeq[side] && captureStatus[side]?.kind === 'ok') {
            captureStatus = { ...captureStatus, [side]: null };
          }
        }, 4000);
      }
    } catch (e) {
      if (seq === captureSeq[side]) {
        captureStatus = { ...captureStatus, [side]: describeCaptureFailure(e) };
      }
    } finally {
      captureInFlight = { ...captureInFlight, [side]: false };
    }
  }

</script>

<!-- ============================================================
     PÁGINA DE RESUMEN
     ============================================================ -->
<div class="page">

  <!-- Saludo personalizado -->
  <div class="page-header">
    <h1 class="greeting">{$m.dash_greeting(userName)}</h1>
    <p class="subtitle">
      {#if isAdmin}{$m.dash_subtitle_admin}
      {:else if isOperator}{$m.dash_subtitle_operator}
      {:else}{$m.dash_subtitle_reviewer}
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
        {$m.dash_storage_alert_p1}<strong>{storagePercent}%</strong>{$m.dash_storage_alert_p2(formatStorage(storageUsedGB), formatStorage(storageTotalGB))}<a href="/dashboard/config" class="alert-link">{$m.nav_settings}</a>{$m.dash_storage_alert_p3}
      </span>
    </div>
  {/if}

  <!-- ── KPI CARDS ── -->
  <div class="kpi-grid">

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-primary)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : projectCount}</div>
      <div class="kpi-label">{$m.dash_kpi_active_projects}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-secondary)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : collectionCount}</div>
      <div class="kpi-label">{$m.dash_kpi_collections}</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-line" style="background: var(--color-warning)"></div>
      <div class="kpi-number">{isLoadingStats ? '—' : recordCount.toLocaleString()}</div>
      <div class="kpi-label">{$m.dash_kpi_total_records}</div>
    </div>

  </div>

  <!-- ══════════════════════════════════════════════════════
       SECCIÓN: PROBAR CÁMARAS
       Solo visible para admin y operator (canSeeCameras)
       ══════════════════════════════════════════════════════ -->
  {#if canSeeCameras}
    <div class="section">
      <h2 class="section-title">{$m.dash_test_cameras}</h2>

      <div class="cameras-layout">
        {#each (['left', 'right'] as const) as side}
          {@const isExpanded = expandedCamera === side}
          {@const label = side === 'left' ? $m.dash_camera_left : $m.dash_camera_right}
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
                <span class="cam-model">{cameraModel[side] ?? '—'}</span>
              </div>
              <!-- Badge OK / Not found -->
              <div class="cam-badge" class:ok={status === 'ok'} class:notfound={status === 'not-found'}>
                {#if status === 'ok'}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  OK
                {:else if status === 'not-found'}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  {$m.camera_not_detected}
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
                  {#if previewUrls[side]}
                    <img src={previewUrls[side]} alt={side === 'left' ? $m.dash_camera_left : $m.dash_camera_right} class="preview-img" />
                  {:else}
                    <div class="no-signal">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                      <span>{$m.dash_camera_not_active}</span>
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
                  {active ? $m.dash_camera_stop : $m.dash_camera_test}
                </button>

                <!-- Botones secundarios -->
                <div class="secondary-btns">
                  <button class="btn-secondary" onclick={() => handleFocus(side)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                    {$m.dash_camera_focus}
                  </button>
                  <button class="btn-secondary" disabled={captureInFlight[side]} onclick={() => handleCapture(side)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    {$m.common_capture}
                  </button>
                </div>
                {#if captureStatus[side]}
                  <p
                    class="capture-status"
                    class:is-error={captureStatus[side].kind === 'error'}
                    role="status"
                  >
                    {captureStatus[side].kind === 'ok' ? $m.dash_camera_capture_ok : $m.dash_camera_capture_error}
                    {#if captureStatus[side].kind === 'ok' && captureStatus[side].seconds != null}
                      {$m.dash_camera_capture_took(captureStatus[side].seconds.toFixed(1))}
                    {/if}
                    {#if captureStatus[side].kind === 'error' && captureStatus[side].detail}: {captureStatus[side].detail}{/if}
                  </p>
                {/if}
              </div>
            {/if}

          </div>
        {/each}
      </div>

      <!-- Recuperación de cámara: reconectar tras un cable suelto o una cámara
           que se durmió (NEH-229). Siempre visible cuando la sección de
           cámaras lo está; la pista de "cámara faltante" solo aparece si
           algún lado está not-found. -->
      <div class="cam-recovery">
        {#if cameraStatus.left === 'not-found' || cameraStatus.right === 'not-found'}
          {@const missingLabels = (['left', 'right'] as const)
            .filter(side => cameraStatus[side] === 'not-found')
            .map(side => (side === 'left' ? $m.dash_camera_left : $m.dash_camera_right))
            .join(' / ')}
          <p class="cam-hint">{$m.dash_camera_missing_hint(missingLabels)}</p>
        {/if}
        <button class="btn-secondary" disabled={rescanInFlight} onclick={rescanCameras}>
          {$m.dash_camera_reconnect}
        </button>
        {#if rescanError}
          <p class="capture-status is-error" role="status">
            {$m.dash_camera_reconnect_error}: {rescanError}
          </p>
        {/if}
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
      <span>{$m.dash_two_cameras}</span>
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

  .cam-recovery { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 12px; }
  .cam-hint { font-size: 12px; color: var(--color-light-grey); margin: 0; }

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
  .btn-secondary:disabled { opacity: 0.5; cursor: default; pointer-events: none; }

  .capture-status { margin: 8px 0 0; font-size: var(--text-sm); color: var(--color-light-grey); }
  .capture-status.is-error { color: var(--color-error); }

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
<script lang="ts">
  // ============================================================================
  // PÁGINA: Configuración del Sistema
  // Ruta: /dashboard/config
  // Archivo: src/routes/(dashboard)/dashboard/config/+page.svelte
  //
  // Solo visible para administradores (el layout controla el acceso).
  //
  // Secciones:
  //   1. Almacenamiento
  //      - Barra de uso (usado / total)
  //      - Almacenamiento primario (ruta local del sistema)
  //      - Alerta automática cuando el uso supera el 85%
  //
  //   2. Seguridad & Acceso

  //
  // MODO DEMO: los valores son locales — no se envían al backend.
  // Para conectar con el backend cuando esté disponible, busca los
  // comentarios "TODO: backend" y reemplaza con las llamadas a la API.
  // ============================================================================

  import { onMount } from 'svelte';
  import { systemApi, type SystemLogEntry, type StorageInfo, type StorageDevice } from '$lib/api';

  // ---------------------------------------------------------------------------
  // ESTADO: Almacenamiento — info del disco actual
  // ---------------------------------------------------------------------------
  let storageInfo    = $state<StorageInfo | null>(null);
  let storageLoading = $state(true);

  // Derived values replace the old mock literals
  let storageUsedGB  = $derived(storageInfo ? storageInfo.used_bytes  / (1024 ** 3) : 0);
  let storageTotalGB = $derived(storageInfo ? storageInfo.total_bytes / (1024 ** 3) : 1);
  let storagePrimaryPath = $derived(storageInfo?.projects_path ?? '…');

  // ---------------------------------------------------------------------------
  // ESTADO: Almacenamiento — selector de dispositivo externo
  // ---------------------------------------------------------------------------
  let devicesExpanded  = $state(false);
  let devices          = $state<StorageDevice[]>([]);
  let devicesLoading   = $state(false);
  let devicesError     = $state<string | null>(null);
  let mountingDevice   = $state<string | null>(null);  // device path being mounted
  let activatingPath   = $state<string | null>(null);  // mountpoint being activated
  let storageOpError   = $state<string | null>(null);
  let storageOpSuccess = $state<string | null>(null);
  let resettingStorage = $state(false);

  // Porcentaje de uso calculado
  let storagePercent = $derived(
    Math.min(100, Math.round((storageUsedGB / storageTotalGB) * 100))
  );

  // Alerta cuando el uso supera este umbral (%)
  // Para cambiar el umbral, edita este valor
  const STORAGE_ALERT_THRESHOLD = 85;

  // true cuando el almacenamiento está por completarse
  let storageAlert = $derived(storagePercent >= STORAGE_ALERT_THRESHOLD);

  // Formato legible del almacenamiento (GB → TB si es >= 1000)
  function formatStorage(gb: number): string {
    if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
    return `${gb.toFixed(0)} GB`;
  }

  // Color de la barra de almacenamiento según el porcentaje
  // Verde normal → amarillo de advertencia → rojo crítico
  let storageBarColor = $derived(
    storagePercent >= STORAGE_ALERT_THRESHOLD
      ? 'var(--color-error)'
      : storagePercent >= 70
        ? 'var(--color-warning)'
        : 'var(--color-primary)'
  );

  // ---------------------------------------------------------------------------
  // ESTADO: Seguridad & Acceso
  // ---------------------------------------------------------------------------


  // ---------------------------------------------------------------------------
  // CICLO DE VIDA
  // ---------------------------------------------------------------------------
  onMount(async () => {
    try {
      storageInfo = await systemApi.getStorage();
    } catch {
      // fail silently — bar shows 0% until backend is reachable
    } finally {
      storageLoading = false;
    }
  });

  // ---------------------------------------------------------------------------
  // ACCIONES: Almacenamiento externo
  // ---------------------------------------------------------------------------
  async function toggleDevices() {
    devicesExpanded = !devicesExpanded;
    if (devicesExpanded && devices.length === 0 && !devicesLoading) {
      await refreshDevices();
    }
  }

  async function refreshDevices() {
    devicesLoading = true;
    devicesError   = null;
    try {
      devices = await systemApi.getStorageDevices();
    } catch {
      devicesError = 'No se pudieron leer los dispositivos.';
    } finally {
      devicesLoading = false;
    }
  }

  async function mountDevice(devicePath: string) {
    mountingDevice   = devicePath;
    storageOpError   = null;
    storageOpSuccess = null;
    try {
      const result = await systemApi.mountDevice(devicePath);
      storageOpSuccess = `Montado correctamente en ${result.mountpoint ?? 'directorio desconocido'}.`;
      await refreshDevices();
    } catch (e: unknown) {
      storageOpError = (e instanceof Error ? e.message : null) || 'Error al montar el dispositivo.';
    } finally {
      mountingDevice = null;
    }
  }

  async function activateStorage(mountpoint: string) {
    activatingPath   = mountpoint;
    storageOpError   = null;
    storageOpSuccess = null;
    try {
      const result = await systemApi.activateStorage(mountpoint);
      storageOpSuccess = `Almacenamiento activo: ${result.projects_path}`;
      storageInfo = await systemApi.getStorage();
      setTimeout(() => { storageOpSuccess = null; }, 6000);
    } catch (e: unknown) {
      storageOpError = (e instanceof Error ? e.message : null) || 'Error al activar el almacenamiento.';
    } finally {
      activatingPath = null;
    }
  }

  async function resetStorage() {
    resettingStorage = true;
    storageOpError   = null;
    storageOpSuccess = null;
    try {
      await systemApi.resetStorage();
      storageInfo = await systemApi.getStorage();
      storageOpSuccess = 'Restaurado al almacenamiento predeterminado.';
      setTimeout(() => { storageOpSuccess = null; }, 5000);
    } catch (e: unknown) {
      storageOpError = (e instanceof Error ? e.message : null) || 'Error al restaurar.';
    } finally {
      resettingStorage = false;
    }
  }

  // ---------------------------------------------------------------------------
  // ESTADO: Diagnóstico — logs del sistema
  // ---------------------------------------------------------------------------
  let logsExpanded = $state(false);
  let logs         = $state<SystemLogEntry[]>([]);
  let logsLoading  = $state(false);
  let logsError    = $state<string | null>(null);

  async function loadLogs() {
    logsLoading = true;
    logsError   = null;
    try {
      logs = await systemApi.getLogs({ limit: 50 });
    } catch {
      logsError = 'No se pudieron cargar los logs del sistema.';
    } finally {
      logsLoading = false;
    }
  }

  function toggleLogs() {
    logsExpanded = !logsExpanded;
    // Lazy-load on first open
    if (logsExpanded && logs.length === 0 && !logsLoading) loadLogs();
  }

  function levelColor(level: string): string {
    if (level === 'WARN') return 'var(--color-warning)';
    if (level === 'ERR')  return 'var(--color-error)';
    return 'var(--color-success)';
  }

  function formatLogTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('es', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
    } catch { return iso; }
  }

  function formatLogMessage(log: SystemLogEntry): { before: string; bold: string; after: string } {
    const subject = log.subject ?? '';
    const actor   = log.actor   ?? 'sistema';
    switch (log.action) {
      case 'login_success':      return { before: 'Usuario ',    bold: actor,   after: ' inició sesión exitosamente.' };
      case 'login_failed':       return { before: 'Acceso fallido. Usuario: ', bold: actor, after: log.detail ? ` (${log.detail}).` : '.' };
      case 'user_created':       return { before: 'Usuario ',    bold: subject, after: ` creado por ${actor}.` };
      case 'project_created':    return { before: 'Proyecto ',   bold: subject, after: ` creado por ${actor}.` };
      case 'project_deleted':    return { before: 'Proyecto ',   bold: subject, after: ` eliminado por ${actor}.` };
      case 'collection_created': return { before: 'Colección ',  bold: subject, after: ` creada por ${actor}.` };
      default: return { before: log.action.replace(/_/g, ' '), bold: subject, after: log.detail ? ` — ${log.detail}` : '' };
    }
  }

</script>

<!-- ============================================================
     PÁGINA DE CONFIGURACIÓN
     ============================================================ -->
<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">Configuración</h1>
      <p class="page-subtitle">Parámetros del sistema de digitalización</p>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECCIÓN 1: ALMACENAMIENTO
       Muestra el uso actual del disco y la ruta de almacenamiento.
       La alerta se activa cuando el uso supera STORAGE_ALERT_THRESHOLD.
       ══════════════════════════════════════════════════════════ -->
  <div class="config-section">
    <h2 class="section-title">Almacenamiento</h2>
    <div class="config-card">

      <!-- Alerta de almacenamiento casi lleno -->
      <!-- Esta misma lógica se replica en el dashboard de Resumen -->
      {#if storageAlert}
        <div class="storage-alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            El almacenamiento está al <strong>{storagePercent}%</strong>.
            Se recomienda liberar espacio o expandir la capacidad.
          </span>
        </div>
      {/if}

      <!-- Fila: Almacenamiento usado + barra de progreso -->
      <div class="config-row">
        <div class="row-info">
          <span class="row-label">Almacenamiento usado</span>
        </div>
        {#if storageLoading}
          <span class="row-value muted">Cargando…</span>
        {:else}
          <span class="row-value" class:alert-text={storageAlert}>
            {formatStorage(storageUsedGB)} / {formatStorage(storageTotalGB)}
          </span>
        {/if}
      </div>

      <!-- Barra de progreso de almacenamiento -->
      <div class="storage-bar-bg">
        <div
          class="storage-bar-fill"
          style="width: {storagePercent}%; background-color: {storageBarColor}"
        ></div>
      </div>

      <div class="section-divider"></div>

      <!-- Fila: Almacenamiento primario (ruta del disco) -->
      <div class="config-row">
        <div class="row-info">
          <span class="row-label">Almacenamiento primario</span>
          <span class="row-desc">
            Ruta donde se guardan las imágenes
            {#if storageInfo?.is_override}
              <span class="storage-override-badge">externo</span>
            {/if}
          </span>
        </div>
        <span class="row-value muted">{storagePrimaryPath}</span>
      </div>

      <div class="section-divider"></div>

      <!-- ── Selector de unidad externa (expandible) ── -->
      <button class="config-row logs-expand-row" onclick={toggleDevices}>
        <div class="row-info">
          <span class="row-label">Unidad de almacenamiento <span class="badge-experimental">experimental</span></span>
          <span class="row-desc">Conectar un disco USB o tarjeta SD como almacenamiento adicional</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style="transform: rotate({devicesExpanded ? 180 : 0}deg); transition: transform 0.3s ease; flex-shrink:0; color: var(--color-light-grey)">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if devicesExpanded}
        <div class="section-divider"></div>
        <div class="devices-panel">

          <!-- Banner: override activo -->
          {#if storageInfo?.is_override}
            <div class="storage-override-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span>Usando almacenamiento externo. Las imágenes nuevas se guardan en <strong>{storagePrimaryPath}</strong>.</span>
              <button class="btn-reset-storage" onclick={resetStorage} disabled={resettingStorage}>
                {resettingStorage ? 'Restaurando…' : 'Restaurar predeterminado'}
              </button>
            </div>
          {/if}

          <!-- Aviso experimental -->
          <div class="devices-notice devices-notice-warning">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>Función experimental.</strong> La compatibilidad depende del formato del dispositivo (exFAT, ext4). Discos formateados para Windows (NTFS) o macOS (APFS) pueden no funcionar correctamente. No usar como única copia de seguridad.</span>
          </div>

          <!-- Alerta de advertencia sobre proyectos existentes -->
          <div class="devices-notice">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Solo los proyectos nuevos se guardarán en la unidad seleccionada. Los proyectos existentes permanecen donde están.</span>
          </div>

          <!-- Mensajes de operación -->
          {#if storageOpError}
            <div class="devices-op-msg devices-op-error">{storageOpError}</div>
          {/if}
          {#if storageOpSuccess}
            <div class="devices-op-msg devices-op-success">{storageOpSuccess}</div>
          {/if}

          <!-- Lista de dispositivos -->
          {#if devicesLoading}
            <p class="logs-status">Detectando dispositivos…</p>
          {:else if devicesError}
            <p class="logs-status logs-status-error">{devicesError}</p>
          {:else if devices.length === 0}
            <p class="logs-status">No se detectaron particiones disponibles.</p>
          {:else}
            {#each devices as device}
              {@const isActive = storageInfo?.is_override && storageInfo.projects_path.startsWith(device.mountpoint ?? '__none__')}
              <div class="device-row" class:device-row-active={isActive}>
                <div class="device-info">
                  <span class="device-name">
                    {device.label || device.name}
                    {#if isActive}<span class="storage-override-badge">activo</span>{/if}
                  </span>
                  <span class="device-meta">
                    {device.size}
                    {#if device.fstype} · {device.fstype}{/if}
                    {#if device.mountpoint} · <span class="device-mountpoint">{device.mountpoint}</span>{/if}
                    {#if !device.mountpoint} · <em>no montado</em>{/if}
                  </span>
                </div>
                <div class="device-actions">
                  {#if device.mountpoint}
                    {#if !isActive}
                      <button
                        class="btn-device btn-activate"
                        onclick={() => activateStorage(device.mountpoint!)}
                        disabled={activatingPath === device.mountpoint}
                      >
                        {activatingPath === device.mountpoint ? 'Activando…' : 'Activar'}
                      </button>
                    {:else}
                      <span class="device-active-label">✓ En uso</span>
                    {/if}
                  {:else}
                    <button
                      class="btn-device btn-mount"
                      onclick={() => mountDevice(device.path)}
                      disabled={mountingDevice === device.path}
                    >
                      {mountingDevice === device.path ? 'Montando…' : 'Montar'}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}

          <!-- Actualizar lista -->
          <button class="btn-refresh-devices" onclick={refreshDevices} disabled={devicesLoading}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Actualizar lista
          </button>

        </div>
      {/if}

    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECCIÓN 2: SEGURIDAD & ACCESO
       Configuraciones de seguridad relevantes para uso offline.
       ══════════════════════════════════════════════════════════ -->

  <!-- ══════════════════════════════════════════════════════════
       SECCIÓN 3: DIAGNÓSTICO DEL SISTEMA
       Logs de actividad reciente. Ocultos por defecto, expandibles.
       Solo administradores (el layout controla el acceso a esta página).
       ══════════════════════════════════════════════════════════ -->
  <div class="config-section">
    <h2 class="section-title">Diagnóstico</h2>
    <div class="config-card">

      <!-- Fila expandible: click para mostrar/ocultar logs -->
      <button class="config-row logs-expand-row" onclick={toggleLogs}>
        <div class="row-info">
          <span class="row-label">Logs del sistema</span>
          <span class="row-desc">Actividad reciente — última hora</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style="transform: rotate({logsExpanded ? 180 : 0}deg); transition: transform 0.3s ease; flex-shrink:0; color: var(--color-light-grey)">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if logsExpanded}
        <div class="section-divider"></div>
        <div class="logs-panel-body">
          {#if logsLoading}
            <p class="logs-status">Cargando actividad reciente…</p>
          {:else if logsError}
            <p class="logs-status logs-status-error">{logsError}</p>
          {:else if logs.length === 0}
            <p class="logs-status">Sin actividad registrada todavía.</p>
          {:else}
            {#each logs as log}
              {@const parts = formatLogMessage(log)}
              <div class="log-row">
                <span class="log-time">{formatLogTime(log.created_at)}</span>
                <span class="log-level" style="color:{levelColor(log.level)}">[{log.level}]</span>
                <span class="log-msg">
                  {parts.before}
                  {#if parts.bold}<strong>{parts.bold}</strong>{/if}
                  {parts.after}
                </span>
              </div>
            {/each}
          {/if}
        </div>
      {/if}

    </div>
  </div>

  <!-- Nota informativa sobre el contexto offline -->
  <p class="info-note">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    Este sistema opera completamente offline. Los datos se almacenan localmente en el dispositivo.
  </p>

</div>

<style>
  .page { padding: 32px; max-width: 900px; }

  /* Header */
  .page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 28px;
  }

  .page-title    { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  /* Botón guardar */
  .btn-save {
    display: flex; align-items: center; gap: 8px;
    background-color: var(--color-primary); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    padding: 9px 18px; min-height: var(--touch-target-min);
    cursor: pointer; transition: background-color var(--transition-base); white-space: nowrap;
  }

  .btn-save:hover    { background-color: var(--color-primary-hover); }
  .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

  .spinner-sm {
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Toast de éxito */
  .toast-success {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px;
    background-color: rgba(90,140,98,0.15);
    border: 1px solid var(--color-primary);
    border-radius: var(--radius-md);
    color: var(--color-primary);
    font-size: var(--text-sm); font-weight: var(--fw-semibold);
    margin-bottom: 20px;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

  /* Secciones */
  .config-section { margin-bottom: 32px; }

  .section-title {
    font-size: var(--text-h3); font-weight: var(--fw-bold);
    color: var(--color-light); margin: 0 0 14px;
  }

  /* Card de configuración */
  .config-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  /* Alerta de almacenamiento */
  .storage-alert {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 14px 20px;
    background-color: rgba(214,103,74,0.08);
    border-bottom: 1px solid rgba(214,103,74,0.2);
    color: var(--color-error);
    font-size: var(--text-sm); line-height: 1.5;
  }

  .storage-alert strong { font-weight: var(--fw-bold); }

  /* Fila de configuración */
  .config-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px; gap: 20px;
  }

  .config-row + .config-row { border-top: 1px solid var(--border-color); }

  .toggle-row { min-height: 60px; }

  .row-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

  .row-label { font-size: var(--text-base); color: var(--color-light); font-weight: var(--fw-medium); }
  .row-desc  { font-size: var(--text-sm); color: var(--color-light-grey); }

  .row-value {
    font-size: var(--text-sm); color: var(--color-light);
    font-weight: var(--fw-semibold); white-space: nowrap; flex-shrink: 0;
  }

  .row-value.muted { color: var(--color-light-grey); font-weight: var(--fw-regular); }
  .row-value.alert-text { color: var(--color-error); }

  /* Barra de almacenamiento */
  .storage-bar-bg {
    height: 6px;
    background-color: var(--color-surface-alt-2);
    border-radius: var(--radius-full);
    overflow: hidden;
    margin: 0 20px 18px;
  }

  .storage-bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 0.5s ease, background-color 0.3s ease;
  }

  /* Separador dentro de la card */
  .section-divider { height: 1px; background-color: var(--border-color); }

  /* Toggle switch */
  .toggle {
    width: 48px; height: 26px;
    border-radius: var(--radius-full);
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    cursor: pointer;
    position: relative;
    transition: background-color var(--transition-base), border-color var(--transition-base);
    flex-shrink: 0;
  }

  .toggle.on { background-color: var(--color-primary); border-color: var(--color-primary); }

  .toggle-knob {
    position: absolute; top: 2px; left: 2px;
    width: 20px; height: 20px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    transition: transform var(--transition-base), background-color var(--transition-base);
    pointer-events: none;
  }

  .toggle-knob.on { transform: translateX(22px); background-color: white; }

  /* Nota informativa */
  .info-note {
    display: flex; align-items: center; gap: 8px;
    font-size: var(--text-sm); color: var(--color-light-grey);
    opacity: 0.6; margin-top: 8px;
  }

  /* Logs expandibles (sección Diagnóstico) */
  .logs-expand-row {
    width: 100%; background: none; border: none; cursor: pointer;
    text-align: left; font-family: var(--font-family);
    transition: background-color var(--transition-fast);
  }
  .logs-expand-row:hover { background-color: rgba(255,255,255,0.03); }

  .logs-panel-body { padding: 0 20px 16px; display: flex; flex-direction: column; gap: 12px; }

  .logs-status { font-size: var(--text-sm); color: var(--color-light-grey); margin: 4px 0; }
  .logs-status-error { color: var(--color-error); }

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

  /* ── Device / storage panel ─────────────────────────────── */
  .devices-panel {
    padding: 12px 20px 16px;
    display: flex; flex-direction: column; gap: 10px;
  }

  .devices-notice {
    display: flex; align-items: flex-start; gap: 8px;
    font-size: var(--text-xs); color: var(--color-light-grey);
    background-color: rgba(255,255,255,0.03);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 10px 12px; line-height: 1.5;
  }
  .devices-notice-warning {
    color: #c9a04a;
    background-color: rgba(201,160,74,0.06);
    border-color: rgba(201,160,74,0.25);
  }
  .devices-notice-warning strong { font-weight: var(--fw-semibold); }

  .badge-experimental {
    display: inline-block;
    font-size: 10px;
    font-weight: var(--fw-semibold);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #c9a04a;
    background-color: rgba(201,160,74,0.12);
    border: 1px solid rgba(201,160,74,0.3);
    border-radius: 4px;
    padding: 1px 5px;
    vertical-align: middle;
    margin-left: 6px;
    line-height: 1.6;
  }

  .storage-override-banner {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 14px;
    background-color: rgba(90,140,98,0.1);
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--color-primary);
  }
  .storage-override-banner span { flex: 1; line-height: 1.4; }
  .storage-override-banner strong { font-weight: var(--fw-semibold); }

  .storage-override-badge {
    display: inline-block;
    font-size: 10px; font-weight: var(--fw-bold);
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--color-primary);
    background-color: rgba(90,140,98,0.15);
    border: 1px solid rgba(90,140,98,0.35);
    border-radius: var(--radius-sm);
    padding: 1px 5px; margin-left: 6px; vertical-align: middle;
  }

  .btn-reset-storage {
    font-family: var(--font-family); font-size: var(--text-xs); font-weight: var(--fw-semibold);
    color: var(--color-primary);
    background: none; border: 1px solid rgba(90,140,98,0.4);
    border-radius: var(--radius-sm); padding: 4px 10px;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    transition: background-color var(--transition-fast);
  }
  .btn-reset-storage:hover    { background-color: rgba(90,140,98,0.1); }
  .btn-reset-storage:disabled { opacity: 0.5; cursor: not-allowed; }

  .device-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    transition: border-color var(--transition-fast);
  }
  .device-row-active { border-color: rgba(90,140,98,0.4); background-color: rgba(90,140,98,0.05); }

  .device-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .device-name { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); }
  .device-meta { font-size: var(--text-xs); color: var(--color-light-grey); }
  .device-mountpoint { font-family: monospace; }

  .device-actions { flex-shrink: 0; }
  .device-active-label { font-size: var(--text-xs); color: var(--color-primary); font-weight: var(--fw-semibold); }

  .btn-device {
    font-family: var(--font-family); font-size: var(--text-xs); font-weight: var(--fw-semibold);
    border: none; border-radius: var(--radius-sm);
    padding: 6px 14px; cursor: pointer;
    transition: background-color var(--transition-fast);
    min-height: var(--touch-target-min);
  }
  .btn-device:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-mount {
    background-color: var(--color-surface-alt);
    color: var(--color-light);
    border: 1px solid var(--border-color);
  }
  .btn-mount:hover:not(:disabled) { background-color: var(--color-surface-alt-2); }

  .btn-activate {
    background-color: var(--color-primary);
    color: white;
  }
  .btn-activate:hover:not(:disabled) { background-color: var(--color-primary-hover); }

  .devices-op-msg {
    font-size: var(--text-sm); padding: 8px 12px;
    border-radius: var(--radius-md); border: 1px solid;
  }
  .devices-op-error   { color: var(--color-error);   border-color: rgba(214,103,74,0.3);   background-color: rgba(214,103,74,0.08); }
  .devices-op-success { color: var(--color-primary); border-color: rgba(90,140,98,0.3);    background-color: rgba(90,140,98,0.08); }

  .btn-refresh-devices {
    display: flex; align-items: center; gap: 6px; align-self: flex-start;
    font-family: var(--font-family); font-size: var(--text-xs); font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    background: none; border: none; cursor: pointer; padding: 4px 0;
    transition: color var(--transition-fast);
    margin-top: 2px;
  }
  .btn-refresh-devices:hover:not(:disabled) { color: var(--color-light); }
  .btn-refresh-devices:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
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
  //      - Audit log (toggle): registra todas las acciones del sistema
  //
  // MODO DEMO: los valores son locales — no se envían al backend.
  // Para conectar con el backend cuando esté disponible, busca los
  // comentarios "TODO: backend" y reemplaza con las llamadas a la API.
  // ============================================================================

  import { onMount } from 'svelte';

  // ---------------------------------------------------------------------------
  // ESTADO: Almacenamiento
  // ---------------------------------------------------------------------------

  // Almacenamiento usado y total en GB
  // TODO: backend — reemplazar con llamada a systemApi.getStorageInfo()
  let storageUsedGB  = $state(2457.6);   // 2.4 TB en GB
  let storageTotalGB = $state(10240);    // 10 TB en GB

  // Ruta del almacenamiento primario (disco local del Raspberry Pi / NAS)
  // TODO: backend — reemplazar con el valor real de configuración
  let storagePrimaryPath = $state('/mnt/storage/digitalizaciones');

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

  // Audit log: registra todas las acciones del sistema (crear, editar, eliminar)
  // TODO: backend — persistir con systemApi.updateConfig({ auditLog })
  let auditLogEnabled = $state(true);

  // ---------------------------------------------------------------------------
  // GUARDAR CONFIGURACIÓN
  // Por ahora solo muestra confirmación visual.
  // TODO: backend — llamar a systemApi.updateConfig({ auditLog, storagePrimaryPath })
  // ---------------------------------------------------------------------------
  let saveSuccess = $state(false);
  let isSaving    = $state(false);

  async function handleSave() {
    isSaving = true;
    // Simular delay de guardado
    await new Promise(r => setTimeout(r, 600));
    // TODO: await systemApi.updateConfig({ auditLog: auditLogEnabled });
    isSaving    = false;
    saveSuccess = true;
    // Ocultar el mensaje de éxito después de 3 segundos
    setTimeout(() => { saveSuccess = false; }, 3000);
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
    <!-- Botón guardar cambios -->
    <button class="btn-save" onclick={handleSave} disabled={isSaving}>
      {#if isSaving}
        <div class="spinner-sm"></div>
        Guardando...
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Guardar cambios
      {/if}
    </button>
  </div>

  <!-- Toast de éxito al guardar -->
  {#if saveSuccess}
    <div class="toast-success">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Configuración guardada correctamente
    </div>
  {/if}

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
        <span class="row-value" class:alert-text={storageAlert}>
          {formatStorage(storageUsedGB)} / {formatStorage(storageTotalGB)}
        </span>
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
          <span class="row-desc">Ruta del disco local donde se guardan las imágenes</span>
        </div>
        <span class="row-value muted">{storagePrimaryPath}</span>
      </div>

    </div>
  </div>

  <!-- ══════════════════════════════════════════════════════════
       SECCIÓN 2: SEGURIDAD & ACCESO
       Configuraciones de seguridad relevantes para uso offline.
       ══════════════════════════════════════════════════════════ -->
  <div class="config-section">
    <h2 class="section-title">Seguridad y acceso</h2>
    <div class="config-card">

      <!-- Audit log -->
      <!-- Registra todas las acciones: logins, creaciones, ediciones, eliminaciones -->
      <!-- Útil para trazabilidad en proyectos de patrimonio cultural -->
      <div class="config-row toggle-row">
        <div class="row-info">
          <span class="row-label">Audit log</span>
          <span class="row-desc">Registro de todas las acciones del sistema</span>
        </div>
        <button
          class="toggle"
          class:on={auditLogEnabled}
          onclick={() => auditLogEnabled = !auditLogEnabled}
          aria-label="Toggle audit log"
        >
          <div class="toggle-knob" class:on={auditLogEnabled}></div>
        </button>
      </div>

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
</style>
<script lang="ts">
  // Settings page (/dashboard/config), admin only: the role guard in
  // `(dashboard)/+layout.svelte` redirects every other role. Sections:
  // language, storage (usage, primary path, external drive), the catalogue's
  // off-site copy, diagnostics, maintenance, and power. Everything except the
  // language choice acts on the appliance through the backend.

  import { onMount } from 'svelte';
  import { m, locale, setLanguage, type Locale } from '$lib/i18n';
  import CatalogueBackupCard from './CatalogueBackupCard.svelte';
  // Available languages. The catalogue lives in `$lib/i18n`; this list only
  // names them for the selector.
  const LANGUAGES: { code: Locale; label: string }[] = [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'English' },
  ];

  import {
    systemApi,
    camerasApi,
    healthApi,
    PowerControlError,
    type SystemLogEntry,
    type StorageInfo,
    type StorageDevice,
    type PowerAction
  } from '$lib/api';
  // The overview's banner reads the figures the same way and uses the same threshold.
  import { formatStorage, storageUsage, STORAGE_ALERT_THRESHOLD } from '$lib/storage-usage';

  let storageInfo    = $state<StorageInfo | null>(null);
  let storageLoading = $state(true);

  // Null when the request failed or the backend reported no usable figures
  // (`available: false` comes with zeros): the row then shows a dash and the
  // bar is hidden, rather than a percentage the unit never reported.
  let usage = $derived(storageUsage(storageInfo));
  let storagePrimaryPath = $derived(storageInfo?.projects_path ?? '…');

  let devicesExpanded  = $state(false);
  let devices          = $state<StorageDevice[]>([]);
  let devicesLoading   = $state(false);
  let devicesError     = $state<string | null>(null);
  let mountingDevice   = $state<string | null>(null);  // device path being mounted
  let unmountingDevice = $state<string | null>(null);  // mountpoint being unmounted
  let activatingPath   = $state<string | null>(null);  // mountpoint being activated
  let storageOpError   = $state<string | null>(null);
  let storageOpSuccess = $state<string | null>(null);
  let resettingStorage = $state(false);

  let storageAlert = $derived(usage?.alert ?? false);

  // Green below 70%, warning from 70%, error from the alert threshold.
  let storageBarColor = $derived(
    (usage?.percent ?? 0) >= STORAGE_ALERT_THRESHOLD
      ? 'var(--color-error)'
      : (usage?.percent ?? 0) >= 70
        ? 'var(--color-warning)'
        : 'var(--color-primary)'
  );

  let flushingPreview    = $state(false);
  let flushPreviewResult = $state<string | null>(null);
  let flushPreviewError  = $state<string | null>(null);

  async function flushPreviewTmp() {
    flushingPreview    = true;
    flushPreviewResult = null;
    flushPreviewError  = null;
    try {
      const result = await camerasApi.flushPreviewTmp();
      const n = result.deleted;
      flushPreviewResult = n === 0
        ? $m.config_tmp_none
        : $m.config_tmp_deleted(n);
      setTimeout(() => { flushPreviewResult = null; }, 5000);
    } catch (e: unknown) {
      flushPreviewError = (e instanceof Error ? e.message : null) || $m.config_err_clean;
    } finally {
      flushingPreview = false;
    }
  }

  // Power: shut down or reboot the unit, so that nobody has to pull the
  // plug, which corrupts the SD card. The backend performs the real shutdown
  // or reboot and stops responding seconds later, so the UI enters a blocking
  // state.
  //
  //   200 → shutdown/reboot under way (the backend goes away at once)
  //   501 → power control unavailable (development machine)
  //   401 → session expired
  let pendingPowerAction = $state<PowerAction | null>(null);   // action awaiting confirmation
  let sendingPower = $state(false);                            // request in flight (dialog open)
  let powerPhase = $state<'idle' | 'poweroff' | 'reboot'>('idle');
  let powerError = $state<string | null>(null);

  let confirmTitle = $derived(
    pendingPowerAction === 'reboot' ? $m.config_confirm_reboot_title : $m.config_confirm_shutdown_title
  );
  let confirmDesc = $derived(
    pendingPowerAction === 'reboot'
      ? $m.config_confirm_reboot_desc
      : $m.config_confirm_shutdown_desc
  );

  function askPower(action: PowerAction) {
    powerError = null;
    pendingPowerAction = action;
  }

  function cancelPower() {
    if (sendingPower) return; // an order already sent cannot be cancelled
    pendingPowerAction = null;
  }

  async function confirmPower() {
    const action = pendingPowerAction;
    if (!action || sendingPower) return;
    powerError = null;
    // The dialog stays open with its buttons disabled while the request is
    // in flight. The blocking state appears only once the backend confirms
    // (200) — a 501/401 must not block the page.
    sendingPower = true;
    try {
      await systemApi.powerControl(action);
      powerPhase = action === 'reboot' ? 'reboot' : 'poweroff';
      if (action === 'reboot') pollForRecovery();
    } catch (e: unknown) {
      if (e instanceof PowerControlError && e.status === 501) {
        powerError = $m.config_err_power_unavailable;
      } else if (e instanceof PowerControlError && e.status === 401) {
        powerError = $m.config_err_session_expired;
      } else {
        powerError = (e instanceof Error ? e.message : null) || $m.config_err_operation;
      }
    } finally {
      sendingPower = false;
      pendingPowerAction = null;
    }
  }

  // After a reboot the backend goes down and comes back. Once /health
  // responds again, the app is reloaded to start from a clean session.
  async function pollForRecovery() {
    // Gives the backend time to start shutting down before polling.
    await new Promise((r) => setTimeout(r, 8000));
    while (powerPhase === 'reboot') {
      try {
        await healthApi.check();
        window.location.reload();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }



  // Active camera backend (NEH-188), shown exactly as the backend reports it
  // ('picamera2', 'gphoto2', 'chdk'…): that identifier is what supporting a
  // unit in the field needs. It is neither translated nor given a trade name.
  let cameraBackend = $state<string | null>(null);

  onMount(async () => {
    try {
      storageInfo = await systemApi.getStorage();
    } catch {
      // No figures: the row shows a dash and the bar is hidden.
    } finally {
      storageLoading = false;
    }

    try {
      cameraBackend = (await camerasApi.getCapabilities()).backend;
    } catch {
      // With no capture backend available the row shows "not available".
    }
  });

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
      devicesError = $m.config_err_read_devices;
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
      storageOpSuccess = $m.config_mounted_at(result.mountpoint ?? $m.config_unknown_location);
      await refreshDevices();
    } catch (e: unknown) {
      storageOpError = (e instanceof Error ? e.message : null) || $m.config_err_mount;
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
      storageOpSuccess = $m.config_storage_active(result.projects_path);
      storageInfo = await systemApi.getStorage();
      setTimeout(() => { storageOpSuccess = null; }, 6000);
    } catch (e: unknown) {
      storageOpError = (e instanceof Error ? e.message : null) || $m.config_err_activate;
    } finally {
      activatingPath = null;
    }
  }

  async function unmountDevice(mountpoint: string) {
    unmountingDevice = mountpoint;
    storageOpError   = null;
    storageOpSuccess = null;
    try {
      const result = await systemApi.unmountDevice(mountpoint);
      storageOpSuccess = result.message;
      storageInfo = await systemApi.getStorage();
      await refreshDevices();
      setTimeout(() => { storageOpSuccess = null; }, 6000);
    } catch (e: unknown) {
      storageOpError = (e instanceof Error ? e.message : null) || $m.config_err_unmount;
    } finally {
      unmountingDevice = null;
    }
  }

  async function resetStorage() {    resettingStorage = true;
    storageOpError   = null;
    storageOpSuccess = null;
    try {
      await systemApi.resetStorage();
      storageInfo = await systemApi.getStorage();
      storageOpSuccess = $m.config_restored_default;
      setTimeout(() => { storageOpSuccess = null; }, 5000);
    } catch (e: unknown) {
      storageOpError = (e instanceof Error ? e.message : null) || $m.config_err_restore;
    } finally {
      resettingStorage = false;
    }
  }

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
      logsError = $m.config_err_logs;
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
      return new Date(iso).toLocaleTimeString($locale, {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
    } catch { return iso; }
  }

  function formatLogMessage(log: SystemLogEntry): { before: string; bold: string; after: string } {
    const subject = log.subject ?? '';
    const actor   = log.actor   ?? $m.log_actor_system;
    switch (log.action) {
      case 'login_success':      return { before: $m.log_user_prefix,    bold: actor,   after: $m.log_login_success_suffix };
      case 'login_failed':       return { before: $m.log_login_failed_prefix, bold: actor, after: log.detail ? $m.log_login_failed_detail(log.detail) : '.' };
      case 'user_created':       return { before: $m.log_user_prefix,    bold: subject, after: $m.log_created_by_m(actor) };
      case 'project_created':    return { before: $m.log_project_prefix,   bold: subject, after: $m.log_created_by_m(actor) };
      case 'project_deleted':    return { before: $m.log_project_prefix,   bold: subject, after: $m.log_deleted_by_m(actor) };
      case 'collection_created': return { before: $m.log_collection_prefix,  bold: subject, after: $m.log_created_by_f(actor) };
      default: return { before: log.action.replace(/_/g, ' '), bold: subject, after: log.detail ? $m.log_detail_suffix(log.detail) : '' };
    }
  }

</script>

<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <h1 class="page-title">{$m.nav_settings}</h1>
      <p class="page-subtitle">{$m.config_subtitle}</p>
    </div>
  </div>

  <!-- Language comes first because it is the only personal preference on
       this page; the rest are operations on the appliance. `setLanguage`
       writes a cookie and reloads: it does not touch the session. -->
  <div class="config-section">
    <h2 class="section-title">{$m.config_section_language}</h2>
    <div class="config-card">

      <div class="config-row">
        <div class="row-info">
          <span class="row-label">{$m.config_language_label}</span>
          <span class="row-desc">{$m.config_language_desc}</span>
        </div>

        <div class="lang-options" role="group" aria-label={$m.config_language_label}>
          {#each LANGUAGES as lang}
            <button
              type="button"
              class="lang-option"
              class:active={$locale === lang.code}
              aria-pressed={$locale === lang.code}
              onclick={() => setLanguage(lang.code)}
            >
              {lang.label}
            </button>
          {/each}
        </div>
      </div>

    </div>
  </div>

  <div class="config-section">
    <h2 class="section-title">{$m.config_section_storage}</h2>
    <div class="config-card">

      {#if storageAlert}
        <div class="storage-alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            {$m.config_storage_alert_pre}<strong>{usage?.percent}%</strong>{$m.config_storage_alert_post}
          </span>
        </div>
      {/if}

      <div class="config-row">
        <div class="row-info">
          <span class="row-label">{$m.config_storage_used}</span>
        </div>
        {#if storageLoading}
          <span class="row-value muted">{$m.common_loading_ellipsis}</span>
        {:else if usage}
          <span class="row-value" class:alert-text={storageAlert} data-storage-used>
            {formatStorage(usage.usedGB)} / {formatStorage(usage.totalGB)}
          </span>
        {:else}
          <span class="row-value muted" data-storage-used>—</span>
        {/if}
      </div>

      {#if usage}
        <div class="storage-bar-bg">
          <div
            class="storage-bar-fill"
            style="width: {usage.percent}%; background-color: {storageBarColor}"
          ></div>
        </div>
      {/if}

      <div class="section-divider"></div>

      <div class="config-row">
        <div class="row-info">
          <span class="row-label">{$m.config_storage_primary}</span>
          <span class="row-desc">
            {$m.config_storage_primary_desc}
            {#if storageInfo?.is_override}
              <span class="storage-override-badge">{$m.config_badge_external}</span>
            {/if}
          </span>
        </div>
        <span class="row-value muted">{storagePrimaryPath}</span>
      </div>

      {#if storageInfo?.override_invalid}
        <div class="storage-override-banner storage-override-warning">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>{$m.config_storage_override_invalid}</span>
        </div>
      {/if}

      <div class="section-divider"></div>

      <button class="config-row logs-expand-row" onclick={toggleDevices}>
        <div class="row-info">
          <span class="row-label">{$m.config_storage_device} <span class="badge-experimental">{$m.config_badge_experimental}</span></span>
          <span class="row-desc">{$m.config_storage_device_desc}</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style="transform: rotate({devicesExpanded ? 180 : 0}deg); transition: transform 0.3s ease; flex-shrink:0; color: var(--color-light-grey)">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if devicesExpanded}
        <div class="section-divider"></div>
        <div class="devices-panel">

          {#if storageInfo?.is_override}
            <div class="storage-override-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span>{$m.config_external_active_pre}<strong>{storagePrimaryPath}</strong>.</span>
              <button class="btn-reset-storage" onclick={resetStorage} disabled={resettingStorage}>
                {resettingStorage ? $m.config_restore_progress : $m.config_restore_default}
              </button>
            </div>
          {/if}

          <div class="devices-notice devices-notice-warning">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span><strong>{$m.config_experimental_lead}</strong> {$m.config_experimental_body}</span>
          </div>

          <div class="devices-notice">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top:1px">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{$m.config_new_projects_note}</span>
          </div>

          {#if storageOpError}
            <div class="devices-op-msg devices-op-error">{storageOpError}</div>
          {/if}
          {#if storageOpSuccess}
            <div class="devices-op-msg devices-op-success">{storageOpSuccess}</div>
          {/if}

          {#if devicesLoading}
            <p class="logs-status">{$m.config_detecting_devices}</p>
          {:else if devicesError}
            <p class="logs-status logs-status-error">{devicesError}</p>
          {:else if devices.length === 0}
            <p class="logs-status">{$m.config_no_partitions}</p>
          {:else}
            {#each devices as device}
              {@const isActive = storageInfo?.is_override && storageInfo.projects_path.startsWith(device.mountpoint ?? '__none__')}
              <div class="device-row" class:device-row-active={isActive}>
                <div class="device-info">
                  <span class="device-name">
                    {device.label || device.name}
                    {#if isActive}<span class="storage-override-badge">{$m.config_badge_active}</span>{/if}
                  </span>
                  <span class="device-meta">
                    {device.size}
                    {#if device.fstype} · {device.fstype}{/if}
                    {#if device.mountpoint} · <span class="device-mountpoint">{device.mountpoint}</span>{/if}
                    {#if !device.mountpoint} · <em>{$m.config_not_mounted}</em>{/if}
                  </span>
                </div>
                <div class="device-actions">
                  {#if device.mountpoint}
                    {#if !isActive}
                      <button
                        class="btn-device btn-activate"
                        onclick={() => activateStorage(device.mountpoint!)}
                        disabled={activatingPath === device.mountpoint || unmountingDevice === device.mountpoint}
                      >
                        {activatingPath === device.mountpoint ? $m.config_activating : $m.config_activate}
                      </button>
                    {:else}
                      <span class="device-active-label">{$m.config_in_use}</span>
                    {/if}
                    <button
                      class="btn-device btn-unmount"
                      onclick={() => unmountDevice(device.mountpoint!)}
                      disabled={unmountingDevice === device.mountpoint || activatingPath === device.mountpoint}
                      title={$m.config_unmount_tooltip}
                    >
                      {unmountingDevice === device.mountpoint ? $m.config_unmounting : $m.config_unmount}
                    </button>
                  {:else}
                    <button
                      class="btn-device btn-mount"
                      onclick={() => mountDevice(device.path)}
                      disabled={mountingDevice === device.path}
                    >
                      {mountingDevice === device.path ? $m.config_mounting : $m.config_mount}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}

          <button class="btn-refresh-devices" onclick={refreshDevices} disabled={devicesLoading}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {$m.config_refresh_list}
          </button>

        </div>
      {/if}

    </div>
  </div>

  <!-- The catalogue's off-site copy (NEH-266). Read-only: the destination is
       set when the unit is installed. The sidebar indicator links to
       #offsite-copy. -->
  <div class="config-section" id="offsite-copy">
    <h2 class="section-title">{$m.backup_section_title}</h2>
    <CatalogueBackupCard />
  </div>

  <div class="config-section">
    <h2 class="section-title">{$m.config_section_diagnostics}</h2>
    <div class="config-card">

      <div class="config-row">
        <div class="row-info">
          <span class="row-label">{$m.config_camera_backend}</span>
          <span class="row-desc">{$m.config_camera_backend_desc}</span>
        </div>
        <code class="inline-code">{cameraBackend ?? $m.config_camera_backend_unknown}</code>
      </div>

      <div class="section-divider"></div>

      <button class="config-row logs-expand-row" onclick={toggleLogs}>
        <div class="row-info">
          <span class="row-label">{$m.config_system_logs}</span>
          <span class="row-desc">{$m.config_system_logs_desc}</span>
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
            <p class="logs-status">{$m.config_logs_loading}</p>
          {:else if logsError}
            <p class="logs-status logs-status-error">{logsError}</p>
          {:else if logs.length === 0}
            <p class="logs-status">{$m.config_logs_empty}</p>
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



  <div class="config-section">
    <h2 class="section-title">{$m.config_section_maintenance}</h2>
    <div class="config-card">

      <div class="config-row">
        <div class="row-info">
          <span class="row-label">{$m.config_tmp_files}</span>
          <span class="row-desc">
            {$m.config_tmp_files_desc_p1}<code class="inline-code">dtk_preview_c*.jpg</code>{$m.config_tmp_files_desc_p2}<code class="inline-code">/tmp</code>{$m.config_tmp_files_desc_p3}
          </span>
        </div>
        <button
          class="btn-flush"
          onclick={flushPreviewTmp}
          disabled={flushingPreview}
        >
          {flushingPreview ? $m.config_cleaning : $m.config_clean_tmp}
        </button>
      </div>

      {#if flushPreviewResult || flushPreviewError}
        <div class="section-divider"></div>
        <div class="flush-result-row">
          {#if flushPreviewResult}
            <span class="flush-msg flush-msg-ok">{flushPreviewResult}</span>
          {:else if flushPreviewError}
            <span class="flush-msg flush-msg-err">{flushPreviewError}</span>
          {/if}
        </div>
      {/if}

    </div>
  </div>

  <div class="config-section">
    <h2 class="section-title">{$m.config_section_power}</h2>
    <div class="config-card">

      <div class="config-row">
        <div class="row-info">
          <span class="row-label">{$m.config_shutdown_label}</span>
          <span class="row-desc">
            {$m.config_shutdown_desc}
          </span>
        </div>
        <button class="btn-power btn-power-off" onclick={() => askPower('poweroff')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
          {$m.config_shutdown_btn}
        </button>
      </div>

      <div class="config-row">
        <div class="row-info">
          <span class="row-label">{$m.config_reboot_label}</span>
          <span class="row-desc">
            {$m.config_reboot_desc}
          </span>
        </div>
        <button class="btn-power btn-power-reboot" onclick={() => askPower('reboot')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {$m.config_reboot_btn}
        </button>
      </div>

      {#if powerError}
        <div class="section-divider"></div>
        <div class="power-error-row">
          <span class="flush-msg flush-msg-err">{powerError}</span>
        </div>
      {/if}

    </div>
  </div>

  <p class="info-note">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    {$m.config_offline_note}
  </p>

</div>

<!-- Shutdown/reboot confirmation, styled like the confirmations on the
     Users page, so that a single click cannot power the unit off. -->
{#if pendingPowerAction}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      cancelPower();
    }
  }}>
    <div class="modal-card modal-confirm">
      <h3 class="confirm-title">{confirmTitle}</h3>
      <p class="confirm-desc">{confirmDesc}</p>

      <div class="modal-actions">
        <button class="btn-ghost" onclick={cancelPower} disabled={sendingPower}>{$m.common_cancel}</button>
        {#if pendingPowerAction === 'reboot'}
          <button class="btn-confirm-power" onclick={confirmPower} disabled={sendingPower}>
            {sendingPower ? $m.config_sending : $m.config_confirm_reboot_btn}
          </button>
        {:else}
          <button class="btn-delete" onclick={confirmPower} disabled={sendingPower}>
            {sendingPower ? $m.config_sending : $m.config_confirm_shutdown_btn}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Blocking state while the backend shuts down or reboots. No buttons: it
     ends only when the unit powers off (poweroff) or the app reloads itself
     (reboot). -->
{#if powerPhase === 'poweroff' || powerPhase === 'reboot'}
  <div class="power-overlay">
    <div class="power-overlay-card">
      <div class="spinner-lg"></div>
      {#if powerPhase === 'poweroff'}
        <h3 class="power-overlay-title">{$m.config_shutting_down}</h3>
        <p class="power-overlay-desc">
          {$m.config_shutdown_overlay_desc}
        </p>
      {:else}
        <h3 class="power-overlay-title">{$m.config_rebooting}</h3>
        <p class="power-overlay-desc">
          {$m.config_reboot_overlay_desc}
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page { padding: 32px; max-width: 900px; }

  /* Header */
  .page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    margin-bottom: 28px;
  }

  .page-title    { font-size: var(--text-h2); font-weight: var(--fw-black); color: var(--color-light); margin: 0 0 4px; }
  .page-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0; }

  @keyframes spin { to { transform: rotate(360deg); } }


  .config-section { margin-bottom: 32px; }

  .section-title {
    font-size: var(--text-h3); font-weight: var(--fw-bold);
    color: var(--color-light); margin: 0 0 14px;
  }

  .config-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .storage-alert {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 14px 20px;
    background-color: rgba(214,103,74,0.08);
    border-bottom: 1px solid rgba(214,103,74,0.2);
    color: var(--color-error);
    font-size: var(--text-sm); line-height: 1.5;
  }

  .storage-alert strong { font-weight: var(--fw-bold); }

  .config-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px; gap: 20px;
  }

  .config-row + .config-row { border-top: 1px solid var(--border-color); }

  .row-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

  .row-label { font-size: var(--text-base); color: var(--color-light); font-weight: var(--fw-medium); }
  .row-desc  { font-size: var(--text-sm); color: var(--color-light-grey); }

  /* Language selector: toggle buttons, not a dropdown — two options fit on
     screen, so the current one can be read without opening anything. */
  .lang-options { display: flex; gap: 8px; flex-shrink: 0; }

  .lang-option {
    padding: 8px 16px;
    min-height: var(--touch-target-min);
    border-radius: var(--radius-md);
    border: var(--border-width) solid var(--border-color);
    background-color: transparent;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    white-space: nowrap;
    transition: color var(--transition-base), border-color var(--transition-base);
  }
  .lang-option:hover { color: var(--color-light); }
  .lang-option.active {
    border-color: var(--color-light);
    color: var(--color-light);
    font-weight: var(--fw-bold);
  }

  .row-value {
    font-size: var(--text-sm); color: var(--color-light);
    font-weight: var(--fw-semibold); white-space: nowrap; flex-shrink: 0;
  }

  .row-value.muted { color: var(--color-light-grey); font-weight: var(--fw-regular); }
  .row-value.alert-text { color: var(--color-error); }

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

  .section-divider { height: 1px; background-color: var(--border-color); }

  .info-note {
    display: flex; align-items: center; gap: 8px;
    font-size: var(--text-sm); color: var(--color-light-grey);
    opacity: 0.6; margin-top: 8px;
  }

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

  .storage-override-warning {
    margin-top: 10px;
    background-color: rgba(200,140,60,0.12);
    border-color: rgba(200,140,60,0.4);
    color: var(--color-warning, #b5731f);
  }

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

  .device-actions { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
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

  .btn-unmount {
    background-color: transparent;
    color: var(--color-light-grey);
    border: 1px solid var(--border-color);
  }
  .btn-unmount:hover:not(:disabled) { color: var(--color-error); border-color: rgba(214,103,74,0.5); background-color: rgba(214,103,74,0.06); }

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

  .btn-flush {
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 8px 16px; min-height: var(--touch-target-min);
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    transition: color var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast);
  }
  .btn-flush:hover:not(:disabled) {
    color: var(--color-light);
    border-color: rgba(255,255,255,0.2);
    background-color: rgba(255,255,255,0.04);
  }
  .btn-flush:disabled { opacity: 0.5; cursor: not-allowed; }

  .flush-result-row {
    padding: 10px 20px 14px;
  }
  .flush-msg {
    font-size: var(--text-sm);
  }
  .flush-msg-ok  { color: var(--color-primary); }
  .flush-msg-err { color: var(--color-error); }

  .inline-code {
    font-family: monospace;
    font-size: 0.88em;
    background-color: rgba(255,255,255,0.06);
    border-radius: 3px;
    padding: 1px 4px;
  }

  .btn-power {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-semibold);
    border-radius: var(--radius-md);
    padding: 8px 16px; min-height: var(--touch-target-min);
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    transition: color var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast);
  }

  .btn-power-off {
    color: var(--color-error);
    background: none;
    border: 1px solid rgba(214,103,74,0.4);
  }
  .btn-power-off:hover { background-color: rgba(214,103,74,0.1); border-color: var(--color-error); }

  .btn-power-reboot {
    color: var(--color-light-grey);
    background: none;
    border: 1px solid var(--border-color);
  }
  .btn-power-reboot:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); background-color: rgba(255,255,255,0.04); }

  .power-error-row { padding: 10px 20px 14px; }

  /* Confirmation modal: same styles as the Users page. */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; padding: 24px;
  }

  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 28px;
    width: 100%; max-width: 420px;
    box-shadow: var(--shadow-lg);
    display: flex; flex-direction: column; gap: 16px;
    max-height: 90vh; overflow-y: auto;
  }

  .modal-confirm { max-width: 440px; gap: 12px; }

  .confirm-title {
    font-size: var(--text-h3); font-weight: var(--fw-bold);
    color: var(--color-light); margin: 0;
  }

  .confirm-desc {
    font-size: var(--text-sm); color: var(--color-light-grey);
    line-height: 1.6; margin: 0;
  }

  .modal-actions {
    display: flex; gap: 12px;
    padding-top: 4px;
    border-top: 1px solid var(--border-color);
  }

  .btn-ghost {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    flex: 1;
    background: none; border: 1px solid var(--border-color);
    border-radius: var(--radius-md); padding: 9px 18px;
    font-family: var(--font-family); font-size: var(--text-sm);
    color: var(--color-light-grey); cursor: pointer;
    transition: all var(--transition-fast); min-height: var(--touch-target-min);
    white-space: nowrap;
  }
  .btn-ghost:hover { color: var(--color-light); border-color: rgba(255,255,255,0.2); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-delete {
    flex: 1; height: 44px;
    background-color: var(--color-error); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    cursor: pointer; transition: opacity var(--transition-base);
  }
  .btn-delete:hover    { opacity: 0.85; }
  .btn-delete:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Reboot is not destructive, so its confirm button is primary green. */
  .btn-confirm-power {
    flex: 1; height: 44px;
    background-color: var(--color-primary); color: white;
    font-family: var(--font-family); font-size: var(--text-sm); font-weight: var(--fw-bold);
    border: none; border-radius: var(--radius-md);
    cursor: pointer; transition: background-color var(--transition-base);
  }
  .btn-confirm-power:hover    { background-color: var(--color-primary-hover); }
  .btn-confirm-power:disabled { opacity: 0.5; cursor: not-allowed; }

  .power-overlay {
    position: fixed; inset: 0;
    background-color: rgba(19,17,16,0.92);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; padding: 24px;
  }

  .power-overlay-card {
    display: flex; flex-direction: column; align-items: center; text-align: center;
    gap: 16px; max-width: 420px;
  }

  .power-overlay-title {
    font-size: var(--text-h3); font-weight: var(--fw-bold);
    color: var(--color-light); margin: 0;
  }

  .power-overlay-desc {
    font-size: var(--text-base); color: var(--color-light-grey);
    line-height: 1.6; margin: 0;
  }

  .spinner-lg {
    width: 40px; height: 40px;
    border: 3px solid var(--border-color);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
</style>
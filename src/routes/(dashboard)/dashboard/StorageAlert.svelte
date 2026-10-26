<script lang="ts">
  // The overview's low-storage banner, from GET /system/storage on the drive
  // that holds the projects root (see `$lib/storage-usage`). It reads the
  // figures on mount and again whenever the page becomes visible after being
  // hidden. Captures happen on other pages, and returning to the overview
  // mounts this component again, so no timer is needed: the figures cannot
  // change much while someone is looking at the overview itself, and a timer
  // would keep asking the backend from a background tab or a kiosk left idle.
  //
  // A failed request or an answer without usable figures shows nothing, and
  // clears figures read earlier: the banner never states a fill level the
  // unit did not just report.
  //
  // Version: 0.1.0-beta

  import { onMount } from 'svelte';
  import { systemApi } from '$lib/api';
  import { m } from '$lib/i18n';
  import { formatStorage, storageUsage, type StorageUsage } from '$lib/storage-usage';

  let usage = $state<StorageUsage | null>(null);

  onMount(() => {
    let alive = true;
    // Each read takes the next number; an answer from an older read that
    // arrives after a newer one is dropped, so a slow request cannot bring
    // back stale figures.
    let latest = 0;

    async function read() {
      const seq = ++latest;
      let next: StorageUsage | null = null;
      try {
        next = storageUsage(await systemApi.getStorage());
      } catch {
        next = null;
      }
      if (alive && seq === latest) usage = next;
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') read();
    }

    read();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

<!-- The Settings page applies the same threshold. -->
{#if usage?.alert}
  <div class="storage-alert-banner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span>
      {$m.dash_storage_alert_p1}<strong>{usage.percent}%</strong>{$m.dash_storage_alert_p2(formatStorage(usage.usedGB), formatStorage(usage.totalGB))}<a href="/dashboard/config" class="alert-link">{$m.nav_settings}</a>{$m.dash_storage_alert_p3}
    </span>
  </div>
{/if}

<style>
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
</style>

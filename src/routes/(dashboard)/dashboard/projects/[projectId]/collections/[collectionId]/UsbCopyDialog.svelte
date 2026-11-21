<script lang="ts">
  // Copies a testing volume's pictures to a USB drive. On open it asks the
  // unit for its USB drives (GET /system/testing/usb); the person chooses
  // one (the only drive is chosen already) and Copy starts the job
  // (POST /collections/{id}/usb-copy). The dialog then polls the job's
  // status every 700 ms, the export job's interval, and shows the files
  // done of the total and a bar by bytes.
  //
  // A job that ends `done` names the folder it wrote on the drive, and the
  // number of pictures it left out when there are any. It adds that the
  // drive can be removed only when the status carries no error and says the
  // drive was unmounted; otherwise the folder line stands alone. A job that ends `failed`, or a refusal of the start,
  // shows the message for its code (testing-space.ts).
  //
  // The copy runs in the backend whatever the dialog does. A status request
  // that fails (other than a 404) leaves the dialog polling; after
  // UNREACHABLE_AFTER failures in a row a line says the progress cannot be
  // read. A 404 means the unit no longer knows the job. When the drive list
  // says a copy is running for this volume the dialog resumes it; for
  // another volume it says the unit is busy and offers no copy.
  // Closing the dialog does not cancel a copy, since the backend has no
  // route for it. The polling stops with the dialog, and a reopened dialog
  // lists the drives again.
  //
  // Version: 0.2.0

  import { onDestroy, onMount, untrack } from 'svelte';
  import { ApiError, collectionsApi, systemApi, type UsbCopyStatus, type UsbDrive } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { dismissible, trapFocus } from '$lib/dialog';
  import { formatBytes } from '$lib/format-bytes';
  import { usbFailureCode, usbFailureText } from '$lib/testing-space';

  let { collectionId, onClose }: { collectionId: number; onClose: () => void } = $props();

  // The polling interval of the export job.
  const POLL_MS = 700;
  // Failed status requests in a row after which the progress is said to be unreadable.
  const UNREACHABLE_AFTER = 3;

  type Phase = 'choose' | 'starting' | 'copying' | 'done' | 'failed';

  let phase = $state<Phase>('choose');
  let loading = $state(true);
  let listError = $state(false);
  let drives = $state<UsbDrive[]>([]);
  let selected = $state<string | null>(null);
  let status = $state<UsbCopyStatus | null>(null);
  let failure = $state<string | null>(null);
  // The message of a refused start, shown above the drive list.
  let startError = $state<string | null>(null);
  // A copy for another volume is running.
  let busyElsewhere = $state(false);
  let pollFailures = $state(0);

  let alive = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Number of the last list request: only that one may write the list.
  let listSeq = 0;

  async function loadDrives() {
    const seq = ++listSeq;
    loading = true;
    listError = false;
    startError = null;
    try {
      const body = await systemApi.getTestingUsb();
      if (!alive || seq !== listSeq) return;
      busyElsewhere = false;
      const active = body.active ?? null;
      if (active && active.collection_id === collectionId) {
        phase = 'copying';
        schedule(active.job_id);
        return;
      }
      if (active) {
        busyElsewhere = true;
        drives = [];
        selected = null;
        return;
      }
      drives = body.drives;
      if (drives.length === 1) selected = drives[0].name;
      else if (!drives.some((d) => d.name === selected)) selected = null;
    } catch {
      if (!alive || seq !== listSeq) return;
      drives = [];
      selected = null;
      listError = true;
    } finally {
      if (alive && seq === listSeq) loading = false;
    }
  }

  onMount(loadDrives);

  function stopPolling() {
    alive = false;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  onDestroy(stopPolling);

  // Another volume's page reuses this component: the dialog closes.
  let shownFor = untrack(() => collectionId);
  $effect(() => {
    if (collectionId !== shownFor) {
      shownFor = collectionId;
      stopPolling();
      untrack(onClose);
    }
  });

  function failWith(code: string | null | undefined) {
    failure = usbFailureText(code, $m) ?? $m.testing_err_other;
    phase = 'failed';
  }

  async function start() {
    if (!selected || phase !== 'choose') return;
    phase = 'starting';
    try {
      const { job_id } = await collectionsApi.startUsbCopy(collectionId, selected);
      if (!alive) return;
      phase = 'copying';
      schedule(job_id);
    } catch (err) {
      if (!alive) return;
      // Back to the list, with the message above it.
      startError = usbFailureText(usbFailureCode(err), $m) ?? $m.testing_err_other;
      phase = 'choose';
    }
  }

  function schedule(jobId: string) {
    timer = setTimeout(() => poll(jobId), POLL_MS);
  }

  async function poll(jobId: string) {
    timer = null;
    if (!alive) return;
    try {
      const st = await collectionsApi.getUsbCopyStatus(collectionId, jobId);
      if (!alive) return;
      status = st;
      pollFailures = 0;
      if (st.state === 'done') {
        phase = 'done';
      } else if (st.state === 'failed') {
        failWith(st.error);
      } else {
        schedule(jobId);
      }
    } catch (err) {
      if (!alive) return;
      if (err instanceof ApiError && err.status === 404) {
        failure = $m.testing_usb_err_lost;
        phase = 'failed';
        return;
      }
      pollFailures += 1;
      schedule(jobId);
    }
  }

  let driveName = (d: UsbDrive) => d.label || d.name;
  // The pictures the copy left out.
  let skipped = $derived(status ? (status.skipped?.not_regular ?? 0) + (status.skipped?.outside ?? 0) + (status.skipped?.missing ?? 0) : 0);
</script>

<div class="export-modal-backdrop" use:dismissible={{ onDismiss: onClose }}>
  <div class="export-modal-card dialog-fit usb-card" role="dialog" aria-modal="true" aria-labelledby="usb-title" tabindex="-1" use:trapFocus>
    <h3 class="export-modal-title" id="usb-title">{$m.testing_usb_copy}</h3>

    {#if phase === 'choose'}
      {#if startError}
        <p class="export-modal-subtitle">{startError}</p>
      {/if}
      {#if loading}
        <p class="export-modal-subtitle">{$m.testing_usb_loading}</p>
      {:else if busyElsewhere}
        <p class="export-modal-subtitle">{$m.testing_usb_err_copy_busy}</p>
      {:else if listError}
        <p class="export-modal-subtitle">{$m.testing_usb_err_list}</p>
      {:else if drives.length === 0}
        <p class="export-modal-subtitle">{$m.testing_usb_none}</p>
      {:else}
        <div class="usb-drives" role="radiogroup" aria-label={$m.testing_usb_list_label}>
          {#each drives as d (d.name)}
            <label class="usb-drive">
              <input type="radio" name="usb-drive" value={d.name} bind:group={selected} />
              <span>{$m.testing_usb_drive(driveName(d), formatBytes(d.size, $locale), d.fstype)}</span>
            </label>
          {/each}
        </div>
      {/if}
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={loadDrives} disabled={loading}>{$m.testing_usb_refresh}</button>
        {#if !busyElsewhere}
          <button class="btn-primary" onclick={start} disabled={!selected || loading}>{$m.testing_usb_start}</button>
        {/if}
        <button class="btn-secondary" onclick={onClose}>{$m.common_close}</button>
      </div>
    {:else if phase === 'starting' || phase === 'copying'}
      {#if status}
        <p class="export-modal-subtitle">{$m.testing_usb_files(status.done, status.total)}</p>
        <progress
          class="usb-bar"
          aria-label={$m.testing_usb_progress_label}
          value={status.bytes_done}
          max={status.bytes_total > 0 ? status.bytes_total : 1}
        ></progress>
        <p class="usb-bytes">{$m.testing_usb_bytes(formatBytes(status.bytes_done, $locale), formatBytes(status.bytes_total, $locale))}</p>
      {:else}
        <p class="export-modal-subtitle">{$m.testing_usb_starting}</p>
      {/if}
      {#if pollFailures >= UNREACHABLE_AFTER}
        <p class="usb-note">{$m.testing_usb_status_unreachable}</p>
      {/if}
      <p class="usb-note">{$m.testing_usb_close_note}</p>
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={onClose}>{$m.common_close}</button>
      </div>
    {:else if phase === 'done' && status}
      <p class="export-modal-subtitle">{$m.testing_usb_done(status.folder)}</p>
      {#if skipped > 0}
        <p class="export-modal-subtitle">{$m.testing_usb_skipped(skipped)}</p>
      {/if}
      {#if status.error === null && status.unmounted}
        <p class="export-modal-subtitle">{$m.testing_usb_safe}</p>
      {/if}
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={onClose}>{$m.common_close}</button>
      </div>
    {:else if phase === 'failed'}
      <p class="export-modal-subtitle">{failure}</p>
      <div class="export-modal-actions">
        <button class="btn-secondary" onclick={onClose}>{$m.common_close}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .usb-drives { display: flex; flex-direction: column; gap: 8px; width: 100%; margin: 6px 0 4px; }
  .usb-drive {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    border: 1px solid var(--border-color); border-radius: 10px;
    background: var(--color-surface); color: var(--color-light); cursor: pointer;
    text-align: left;
  }
  .usb-bar { width: 100%; height: 10px; margin: 8px 0 4px; }
  .usb-bytes, .usb-note { margin: 4px 0 0; font-size: var(--text-xs); color: var(--color-light-grey); }
</style>

<script lang="ts">
  // Shows one captured record's images at full size and lets the operator
  // retake the record. Images are ordered left before right, with an L/R badge
  // in `double` mode. Retake asks for confirmation, and the modal cannot be
  // closed while the replacement capture runs.

  import { type Record as ApiRecord } from '$lib/api';
  import { m } from '$lib/i18n';
  import RecordImageDisplay from '$lib/components/RecordImageDisplay.svelte';
  import { dismissible } from '$lib/dialog';

  let {
    record,
    cameraMode,
    onClose,
    onRetake,
  }: {
    record: ApiRecord;
    cameraMode: 'single' | 'double';
    onClose: () => void;
    onRetake: (record: ApiRecord) => Promise<void>;
  } = $props();

  let confirmRetake = $state(false);

  // Blocks closing the modal while the capture runs, so that an error stays
  // in view if the capture fails.
  let retaking = $state(false);
  let retakeError = $state<string | null>(null);

  async function confirmAndRetake() {
    confirmRetake = false;
    retaking = true;
    retakeError = null;
    try {
      // `onRetake` throws if the capture fails, and the record keeps its
      // images. The frontend never deletes the previous images; the backend
      // keeps them as history (NEH-208).
      await onRetake(record);
      // On success the parent has already closed the modal (`inspectedRecord = null`).
    } catch (err) {
      retakeError = err instanceof Error ? err.message : String(err);
    } finally {
      retaking = false;
    }
  }

  function handleClose() {
    if (retaking) return;
    onClose();
  }

  const images = $derived.by(() => {
    const imgs = record.images ?? [];
    return [...imgs].sort((a, b) => {
      const order: { [key: string]: number } = { left: 0, single: 0, right: 1 };
      return (order[a.role ?? 'single'] ?? 0) - (order[b.role ?? 'single'] ?? 0);
    });
  });
</script>

<!-- Escape first cancels a pending retake, then closes; a click on the
     backdrop closes outright. Neither works while the retake runs. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="img-viewer-backdrop"
  onclick={handleClose}
  use:dismissible={{ onDismiss: () => { if (confirmRetake) confirmRetake = false; else handleClose(); }, backdrop: false }}
>

  <!-- `stopPropagation` keeps a click inside the content from closing the modal -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="img-viewer-content" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="lv-img-viewer-title" onclick={(e) => e.stopPropagation()}>

    <div class="img-viewer-header">
      <span class="img-viewer-title" id="lv-img-viewer-title">
        {record.title || $m.record_fallback_title(record.id)}
      </span>
      <button class="img-viewer-close-btn" onclick={handleClose} disabled={retaking} aria-label={$m.common_close}>
        <span class="material-symbols-outlined icon-md">close</span>
      </button>
    </div>

    <!-- Retake error; the record keeps its original images -->
    {#if retakeError}
      <div class="img-viewer-retake-error">
        <span class="material-symbols-outlined icon-sm">error</span>
        <span>{$m.lvm_retake_error(retakeError)}</span>
      </div>
    {/if}

    <div class="img-viewer-images">
      {#each images as img}
        <div class="img-viewer-frame">
          {#if cameraMode === 'double' && img.role && img.role !== 'single'}
            <span class="img-viewer-badge">
              {img.role === 'left' ? $m.badge_left : $m.badge_right}
            </span>
          {/if}

          <!-- NEH-139: a RAW image is shown through its JPEG preview or its
               thumbnail, never as a broken image -->
          <RecordImageDisplay image={img}>
            {#snippet children(src, onerror)}
              <img
                {src}
                {onerror}
                alt={record.title || $m.col_image_alt(img.id)}
                class="img-viewer-img"
              />
            {/snippet}
          </RecordImageDisplay>
        </div>
      {/each}

      {#if images.length === 0}
        <div class="img-viewer-frame">
          <span style="--c: var(--color-light-grey)" class="material-symbols-outlined icon-lg">image_not_supported</span>
        </div>
      {/if}
    </div>

    <div class="img-viewer-footer">
      {#if retaking}
        <span class="img-viewer-confirm-msg">
          <span class="img-viewer-spinner"></span>
          {$m.lvm_retaking}
        </span>
      {:else if !confirmRetake}
        <button class="btn btn-secondary" onclick={handleClose}>
          <span class="material-symbols-outlined icon-sm">close</span>
          {$m.common_close}
        </button>
        <button class="btn btn-danger" onclick={() => confirmRetake = true}>
          <span class="material-symbols-outlined icon-sm">refresh</span>
          {$m.lvm_retake}
        </button>
      {:else}
        <span class="img-viewer-confirm-msg">
          {$m.lvm_retake_confirm}
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmRetake = false}>
            {$m.common_cancel}
          </button>
          <button class="btn btn-danger" onclick={confirmAndRetake}>
            <span class="material-symbols-outlined icon-sm">check</span>
            {$m.common_confirm}
          </button>
        </div>
      {/if}
    </div>

  </div>
</div>

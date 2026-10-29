<script lang="ts">
  // Shows one captured record's images at full size and lets the operator
  // retake the record. Images are ordered left before right, with an L/R badge
  // in `double` mode. Retake asks for confirmation, and the modal cannot be
  // closed while the replacement capture runs. A rejected record also shows
  // its newest rejection (reason, note, who and when), so the operator
  // retaking it does not need the Por recapturar page open beside it.
  //
  // Version: 0.2.0

  import { recordsApi, type Record as ApiRecord, type RecordRejection } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { formatApiDate } from '$lib/format-date';
  import { parseApiDate } from '$lib/pipeline';
  import { rejectionReasonText } from '$lib/rejectionReasons';
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

  // The newest rejection of a rejected record. If the history cannot be
  // fetched, nothing extra is shown and the modal works as before.
  let rejection = $state<RecordRejection | null>(null);

  $effect(() => {
    const id = record.id;
    const rejected = record.status === 'rejected';
    rejection = null;
    if (!rejected) return;
    let stale = false;
    recordsApi
      .listRejections(id)
      .then((list) => {
        if (!stale) rejection = list[0] ?? null;
      })
      .catch((err) => {
        console.error('[ImageViewerModal] Error loading rejections:', err);
      });
    return () => {
      stale = true;
    };
  });

  const rejectionReason = $derived(
    rejection?.predefined_reason ? rejectionReasonText($m, rejection.predefined_reason) : null,
  );

  function formatWhen(iso: string): string {
    return formatApiDate(iso, $locale, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

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

    <!-- Why the record was rejected, as on the Por recapturar page -->
    {#if rejection}
      <div class="lv-rejection" data-testid="lv-rejection">
        <div class="lv-rejection-reason">
          {#if rejectionReason}
            <span class="status-badge status-rejected">{rejectionReason.label}</span>
            {#if rejectionReason.gloss}<span class="lv-rejection-gloss">{rejectionReason.gloss}</span>{/if}
          {:else}
            <span class="lv-rejection-gloss">{$m.retakes_no_reason}</span>
          {/if}
        </div>
        {#if rejection.comment}
          <p class="lv-rejection-comment"><span class="visually-hidden">{$m.retakes_comment_label}:</span>{" "}{rejection.comment}</p>
        {/if}
        {#if rejection.rejected_at}
          {@const when = formatWhen(rejection.rejected_at)}
          <time class="lv-rejection-when" datetime={parseApiDate(rejection.rejected_at).toISOString()}>
            {rejection.rejected_by ? $m.retakes_rejected_by(rejection.rejected_by, when) : $m.retakes_rejected_on(when)}
          </time>
        {/if}
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

<style>
  .lv-rejection {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 16px;
    flex-shrink: 0;
    max-height: 30vh;
    overflow-y: auto;
  }
  .lv-rejection-reason { display: flex; flex-direction: column; gap: 2px; }
  .lv-rejection-gloss { font-size: var(--text-sm); line-height: 1.4; color: var(--color-light-grey); }
  .lv-rejection-comment {
    margin: 0;
    padding: 6px 10px;
    border-left: 3px solid var(--color-error);
    background-color: var(--color-surface-alt);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--color-light);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .lv-rejection-when { font-size: var(--text-xs); color: var(--color-light-grey); }
</style>

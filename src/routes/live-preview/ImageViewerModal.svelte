<script lang="ts">
  // Shows one captured record's images at full size and lets the operator
  // retake the record. Images are ordered left before right, with an L/R badge
  // in `double` mode. Retake asks for confirmation, and the modal cannot be
  // closed while the replacement capture runs. A rejected record also shows
  // its newest rejection (reason, note, who and when), so the operator
  // retaking it does not need the Por recapturar page open beside it. In the
  // guided retake (0.2.0) the page passes `guide`, drawn under the header and
  // told whether the retake is running. A captured record prepared for
  // retake is still pending (the backend's pending, which the record does
  // not show): the page passes `pending` for it, and its rejection shows too.
  // A record Fisqua excluded (contract 1.6) takes no retake (the backend
  // refuses the capture with a 409): the modal offers none and says why.
  //
  // The modal opens on each image's thumbnail (0.3.1): /preview is the master
  // itself for a JPEG, 3–4 MB a page, which is slow over the network. "Full
  // size" loads every image through RecordImageDisplay (its candidates and
  // its freed notice unchanged) under one shared pan and zoom, the model of
  // the gallery's ImageViewerModal; "Thumbnails" goes back.
  //
  // Version: 0.3.1

  import type { Snippet } from 'svelte';
  import { recordsApi, type Record as ApiRecord, type RecordRejection } from '$lib/api';
  import { m, locale } from '$lib/i18n';
  import { formatApiDate } from '$lib/format-date';
  import { parseApiDate } from '$lib/pipeline';
  import { rejectionReasonText } from '$lib/rejectionReasons';
  import RecordImageDisplay from '$lib/components/RecordImageDisplay.svelte';
  import ExcludedNotice from '$lib/components/ExcludedNotice.svelte';
  import { dismissible } from '$lib/dialog';
  import {
    fittedSize,
    screenExtent,
    oneToOneZoom,
    effectiveOneToOne,
    pageScale,
    panBounds,
    panPixels,
    dragToFraction,
    transformFor,
    type Pan,
    type PanFraction,
  } from '$lib/pan-zoom';

  let {
    record,
    cameraMode,
    onClose,
    onRetake,
    guide,
    pending = false,
  }: {
    record: ApiRecord;
    cameraMode: 'single' | 'double';
    onClose: () => void;
    onRetake: (record: ApiRecord) => Promise<void>;
    guide?: Snippet<[boolean]>;
    // The summary lists the record as pending.
    pending?: boolean;
  } = $props();

  let confirmRetake = $state(false);
  let isExcluded = $derived(record.status === 'excluded');

  // The newest rejection of a rejected record. If the history cannot be
  // fetched, nothing extra is shown and the modal works as before.
  let rejection = $state<RecordRejection | null>(null);

  $effect(() => {
    const id = record.id;
    const rejected = record.status === 'rejected' || pending;
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
    if (isExcluded) return;
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

  // Thumbnails until the operator asks for full size; no /preview before.
  let fullSize = $state(false);
  // Thumbnails that failed to load, by image id.
  let thumbFailed = $state<{ [id: number]: boolean }>({});

  // Shared pan and zoom in full size (NEH-230), the same model as the
  // gallery's ImageViewerModal: one zoom and one pan fraction shared by every
  // frame, from which each frame derives its own CSS scale and pixel pan with
  // its own measured geometry. No rotation here, so rotation is always 0.
  let zoom = $state(1);
  let pan = $state<PanFraction>({ x: 0, y: 0 });

  // Measured size of each frame and natural size of each image, by index in
  // images.
  let frameW    = $state<number[]>([0, 0]);
  let frameH    = $state<number[]>([0, 0]);
  let naturalW  = $state<number[]>([0, 0]);
  let naturalH  = $state<number[]>([0, 0]);

  function dpr(): number {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  type FrameGeom = { scale: number; pan: Pan; bounds: { w: number; h: number } };

  // Each image's 1:1 is clamped to >= 1, and the reference for pageScale is
  // the largest of them (see the pageScale comment in pan-zoom.ts).
  let oneToOnes = $derived.by((): number[] =>
    images.map((_, i) =>
      effectiveOneToOne(
        oneToOneZoom({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0, dpr())
      )
    )
  );

  let oneToOneRef = $derived(oneToOnes.length > 0 ? Math.max(...oneToOnes) : 1);

  let frameGeoms = $derived.by((): FrameGeom[] => {
    const fitted = images.map((_, i) =>
      fittedSize({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0)
    );
    return images.map((_, i) => {
      const scale = pageScale(zoom, oneToOnes[i] ?? 1, oneToOneRef);
      const extent = screenExtent(fitted[i], 0, scale);
      const bounds = panBounds(extent, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 });
      return { scale, pan: panPixels(pan, bounds), bounds };
    });
  });

  // Drag to pan, through pointer events, for mouse and touch alike; only the
  // first pointer drags (a second finger is ignored until it ends).
  let dragIndex = $state<number | null>(null);
  let dragPointerId: number | null = null;
  let dragLastX = 0;
  let dragLastY = 0;

  function handlePointerDown(e: PointerEvent, i: number) {
    if (!fullSize || e.button !== 0) return;
    // A press on a control inside the frame is not captured, so its click
    // still reaches the button.
    if ((e.target as HTMLElement).closest('button, a')) return;
    if (dragPointerId !== null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragIndex = i;
    dragPointerId = e.pointerId;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
  }

  function handlePointerMove(e: PointerEvent, i: number) {
    if (dragIndex !== i || e.pointerId !== dragPointerId) return;
    const deltaX = e.clientX - dragLastX;
    const deltaY = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    pan = dragToFraction(pan, { x: deltaX, y: deltaY }, frameGeoms[i]?.bounds ?? { w: 0, h: 0 });
  }

  function endDrag(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return;
    dragIndex = null;
    dragPointerId = null;
  }

  function frameImageStyle(i: number): string {
    const geom = frameGeoms[i];
    const transition = dragIndex === null ? 'transition: transform 0.15s ease;' : '';
    if (!geom) return `${transition} transform: ${transformFor({ x: 0, y: 0 }, 1, 0)};`;
    return `${transition} transform: ${transformFor(geom.pan, geom.scale, 0)};`;
  }

  // "Fit" sets zoom to 1 and leaves the pan fraction, as in the gallery.
  function handleFit() { zoom = 1; }
  function handleActualSize() { zoom = oneToOneRef; }

  // Back to the thumbnails: zoom and pan start again at fit next time.
  function toggleFullSize() {
    fullSize = !fullSize;
    zoom = 1;
    pan = { x: 0, y: 0 };
    dragIndex = null;
    dragPointerId = null;
  }
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

    {#if guide}{@render guide(retaking)}{/if}

    <!-- Retake error; the record keeps its original images -->
    {#if retakeError}
      <div class="img-viewer-retake-error">
        <span class="material-symbols-outlined icon-sm">error</span>
        <span>{$m.lvm_retake_error(retakeError)}</span>
      </div>
    {/if}

    {#if isExcluded}
      <div class="lv-excluded">
        <ExcludedNotice {record} />
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
      {#each images as img, i (img.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="img-viewer-frame"
          class:lv-pannable={fullSize}
          class:dragging={dragIndex === i}
          bind:clientWidth={frameW[i]}
          bind:clientHeight={frameH[i]}
          onpointerdown={(e) => handlePointerDown(e, i)}
          onpointermove={(e) => handlePointerMove(e, i)}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onlostpointercapture={endDrag}
        >
          {#if cameraMode === 'double' && img.role && img.role !== 'single'}
            <span class="img-viewer-badge">
              {img.role === 'left' ? $m.badge_left : $m.badge_right}
            </span>
          {/if}

          {#if fullSize}
            <!-- NEH-139: a RAW image is shown through its JPEG preview or its
                 thumbnail, never as a broken image; a freed master gets the
                 calm notice (NEH-248) -->
            <RecordImageDisplay image={img}>
              {#snippet children(src, onerror)}
                <img
                  {src}
                  {onerror}
                  alt={record.title || $m.col_image_alt(img.id)}
                  class="img-viewer-img"
                  draggable="false"
                  bind:naturalWidth={naturalW[i]}
                  bind:naturalHeight={naturalH[i]}
                  style={frameImageStyle(i)}
                />
              {/snippet}
            </RecordImageDisplay>
            <div class="lv-zoom-controls">
              <button
                class="lv-zoom-btn"
                onclick={(e) => { e.stopPropagation(); handleFit(); }}
                title={$m.col_fit_screen}
                aria-label={$m.col_fit_screen_aria}
              >
                <span class="material-symbols-outlined icon-sm">fit_screen</span>
              </button>
              <button
                class="lv-zoom-btn"
                onclick={(e) => { e.stopPropagation(); handleActualSize(); }}
                title={$m.col_zoom_actual}
                aria-label={$m.col_zoom_actual_aria}
              >
                <span class="lv-one-to-one-glyph">1:1</span>
              </button>
            </div>
          {:else if thumbFailed[img.id]}
            <span style="--c: var(--color-light-grey)" class="material-symbols-outlined icon-lg">image_not_supported</span>
          {:else}
            <img
              src={recordsApi.getImageThumbnailUrl(img.id)}
              onerror={() => (thumbFailed[img.id] = true)}
              alt={record.title || $m.col_image_alt(img.id)}
              class="img-viewer-img lv-thumb-img"
              draggable="false"
            />
          {/if}
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
      {:else if !confirmRetake || isExcluded}
        <button class="btn btn-secondary" onclick={handleClose}>
          <span class="material-symbols-outlined icon-sm">close</span>
          {$m.common_close}
        </button>
        {#if images.length > 0}
          <button class="btn btn-secondary" onclick={toggleFullSize} data-view-toggle>
            <!-- No icon: the font subset (icon-names.json) has no fitting pair. -->
            {fullSize ? $m.lvm_thumbnails : $m.lvm_full_size}
          </button>
        {/if}
        {#if !isExcluded}
          <button class="btn btn-danger" onclick={() => confirmRetake = true}>
            <span class="material-symbols-outlined icon-sm">refresh</span>
            {$m.lvm_retake}
          </button>
        {/if}
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
  .lv-pannable { touch-action: none; cursor: grab; }
  .lv-pannable.dragging { cursor: grabbing; }
  /* A thumbnail is 600 px at most: it fills its frame, contained. */
  .lv-thumb-img { width: 100%; height: 100%; }
  /* Fit and 1:1 (NEH-230), as in the gallery modal: 32px, translucent dark. */
  .lv-zoom-controls {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    z-index: 6;
  }
  .lv-zoom-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.55);
    color: var(--color-light);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }
  .lv-zoom-btn:hover { background: var(--color-primary); }
  .lv-one-to-one-glyph { font-size: 11px; font-weight: var(--fw-bold); }
  .lv-excluded { padding: 8px 16px; flex-shrink: 0; }
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

<script lang="ts">
  // Inspection modal for one record in the gallery: shows all of the record's
  // images (with an L/R badge on a two-camera capture) under one shared
  // pan and zoom, and offers retake and delete within the record's lock.
  //
  // Version: 0.1.0-beta

  import { recordsApi, type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import RecordImageDisplay from '$lib/components/RecordImageDisplay.svelte';
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
    onClose,
    onRetake,
    onDelete,
    userRole = null,
  }: {
    record: Record;
    onClose: () => void;
    onRetake: (record: Record) => void;
    onDelete: (record: Record) => void;
    userRole?: string | null;
  } = $props();

  // Lock: in_review and approved block delete for non-admins, and retake for
  // everyone: the backend refuses a retake of a record that is neither
  // captured nor rejected (409, RETAKE_STATUS_DETAIL in app/core/volume_stem.py).
  let isLocked = $derived(record.status === 'in_review' || record.status === 'approved');

  let confirmAction = $state<null | 'retake' | 'delete'>(null);

  // Masters a 410 has said are freed (NEH-248), by image id. The records can
  // be older than a free, so master_freed_at alone can miss one.
  let masterFreedById = $state<{ [id: number]: boolean }>({});

  // Left first, then right, then images without a role; id breaks ties.
  const images = $derived(() => {
    const imgs = record.images ?? [];
    return [...imgs].sort((a, b) => {
      const order = (r?: string | null) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
      return order(a.role) - order(b.role) || a.id - b.id;
    });
  });

  const isDouble = $derived(() => images().some(i => i.role === 'left' || i.role === 'right'));

  // Shared pan and zoom (NEH-230), the same model as ImageViewer.svelte: one
  // zoom and one pan fraction shared by both frames, from which each frame
  // derives its own CSS scale and pixel pan with its own measured geometry.
  // This modal does not support rotation, so rotation is always 0 in the
  // calls to the module.
  let zoom = $state(1);
  let pan = $state<PanFraction>({ x: 0, y: 0 });

  // Measured size of each frame and natural size of each image, by index in
  // images() (0 = first, 1 = second if there is one).
  let frameW    = $state<number[]>([0, 0]);
  let frameH    = $state<number[]>([0, 0]);
  let naturalW  = $state<number[]>([0, 0]);
  let naturalH  = $state<number[]>([0, 0]);

  function dpr(): number {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  type FrameGeom = { scale: number; pan: Pan; bounds: { w: number; h: number } };

  // effectiveOneToOne clamps each image to >= 1: 1:1 never shrinks
  // an image below fit. The reference for pageScale is the LARGEST of those
  // values across ALL of the record's images, not the first one — pageScale
  // needs the reference to be >= every image's value so that each image's
  // fit->1:1 curve is monotonic (see the pageScale comment in pan-zoom.ts).
  let oneToOnes = $derived.by((): number[] =>
    images().map((_, i) =>
      effectiveOneToOne(
        oneToOneZoom({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0, dpr())
      )
    )
  );

  let oneToOneRef = $derived(oneToOnes.length > 0 ? Math.max(...oneToOnes) : 1);

  // One entry per image of the record, in the same order as images().
  let frameGeoms = $derived.by((): FrameGeom[] => {
    const imgs = images();
    const fitted = imgs.map((_, i) =>
      fittedSize({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0)
    );
    return imgs.map((_, i) => {
      const scale = pageScale(zoom, oneToOnes[i] ?? 1, oneToOneRef);
      const extent = screenExtent(fitted[i], 0, scale);
      const bounds = panBounds(extent, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 });
      return { scale, pan: panPixels(pan, bounds), bounds };
    });
  });

  // Drag to pan, through pointer events, for mouse and touch alike.
  let dragIndex = $state<number | null>(null);
  // The pointerId that is actually dragging. An active index is not enough,
  // because a second finger (multi-touch) also arrives as a pointerdown with
  // button === 0 and would overwrite the first finger's dragLastX/Y: the
  // FIRST finger's next pointermove would then compute its delta against the
  // SECOND finger's position and jump.
  let dragPointerId: number | null = null;
  let dragLastX = 0;
  let dragLastY = 0;

  function handlePointerDown(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    // Do not capture the pointer when the down started on a control inside
    // the frame (zoom or download button): the capture would retarget the
    // pointerup to the frame and the click would never reach the button.
    if ((e.target as HTMLElement).closest('button, a')) return;
    // A pointer is already dragging: ignore any other (a second finger)
    // until the current one ends.
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
    if (e.pointerId !== dragPointerId) return; // the finger released or cancelled is not the one dragging
    dragIndex = null;
    dragPointerId = null;
  }

  function frameImageStyle(i: number): string {
    const geom = frameGeoms[i];
    const transition = dragIndex === null ? 'transition: transform 0.15s ease;' : '';
    if (!geom) return `${transition} transform: ${transformFor({ x: 0, y: 0 }, 1, 0)};`;
    return `${transition} transform: ${transformFor(geom.pan, geom.scale, 0)};`;
  }

  // As in RightToolbar, "fit" only sets zoom to 1 (relative to fit). `pan` is
  // left alone: at zoom 1 the bounds are 0 and the pixel pan is 0, and the
  // fraction is still there if the user zooms in again (the same design as
  // the spread view, see pan-zoom.ts).
  function handleFit() { zoom = 1; }
  function handleActualSize() { zoom = oneToOneRef; }

</script>

<!-- Escape first cancels a pending retake or delete, then closes; a click on
     the backdrop closes outright. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="img-viewer-backdrop"
  onclick={onClose}
  use:dismissible={{ onDismiss: () => { if (confirmAction) confirmAction = null; else onClose(); }, backdrop: false }}
>

  <!-- `stopPropagation` keeps a click inside the content from closing the modal -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="img-viewer-content" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="img-viewer-title" onclick={(e) => e.stopPropagation()}>

    <div class="img-viewer-header">
      <div class="img-viewer-header-title-group">
        <span class="img-viewer-title" id="img-viewer-title">
          {record.title || $m.record_fallback_title(record.id)}
        </span>
        <StatusBadge status={record.status} />
      </div>
      <button class="img-viewer-close-btn" onclick={onClose} aria-label={$m.common_close}>
        <span class="material-symbols-outlined icon-md">close</span>
      </button>
    </div>

    <div class="img-viewer-images">
      {#each images() as img, i}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="img-viewer-frame"
          class:dragging={dragIndex === i}
          bind:clientWidth={frameW[i]}
          bind:clientHeight={frameH[i]}
          onpointerdown={(e) => handlePointerDown(e, i)}
          onpointermove={(e) => handlePointerMove(e, i)}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onlostpointercapture={endDrag}
        >
          {#if isDouble() && (img.role === 'left' || img.role === 'right')}
            <span class="img-viewer-badge">
              {img.role === 'left' ? $m.badge_left : $m.badge_right}
            </span>
          {/if}

          <!-- NEH-139: a RAW is shown through its JPEG preview or its thumbnail,
               never as a broken image -->
          <RecordImageDisplay image={img} onMasterFreed={(f) => (masterFreedById[img.id] = f)}>
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
          <div class="img-viewer-zoom-controls">
            <button
              class="img-viewer-zoom-btn"
              onclick={(e) => { e.stopPropagation(); handleFit(); }}
              title={$m.col_fit_screen}
              aria-label={$m.col_fit_screen_aria}
            >
              <span class="material-symbols-outlined icon-sm">fit_screen</span>
            </button>
            <button
              class="img-viewer-zoom-btn"
              onclick={(e) => { e.stopPropagation(); handleActualSize(); }}
              title={$m.col_zoom_actual}
              aria-label={$m.col_zoom_actual_aria}
            >
              <span class="one-to-one-glyph">1:1</span>
            </button>
          </div>
          <!-- NEH-248: a master freed from the card is not on the scanner to
               download, whether the record says so or a 410 did -->
          {#if !img.master_freed_at && !masterFreedById[img.id]}
            <a
              class="img-viewer-download"
              href={recordsApi.getImageFileUrl(img.id)}
              download
              title={$m.col_download_image}
              aria-label={$m.col_download_image}
              onclick={(e) => e.stopPropagation()}
            >
              <span class="material-symbols-outlined icon-sm">download</span>
            </a>
          {/if}
        </div>
      {/each}

      {#if images().length === 0}
        <div class="img-viewer-frame">
          <span class="material-symbols-outlined icon-lg" style="--c: var(--color-light-grey)">
            image_not_supported
          </span>
        </div>
      {/if}
    </div>

    <div class="img-viewer-footer">

      {#if confirmAction === null}
        <button class="btn btn-secondary" onclick={onClose}>
          <span class="material-symbols-outlined icon-sm">close</span>
          {$m.common_close}
        </button>
        <div class="img-viewer-actions">
          {#if isLocked && userRole !== 'admin'}
            <span class="img-viewer-locked-msg">
              <span class="material-symbols-outlined icon-sm">lock</span>
              {$m.col_record_locked(record.status === 'in_review' ? $m.col_status_in_review_lc : $m.col_status_approved_lc)}
            </span>
          {:else}
            {#if !isLocked}
              <button class="btn btn-warning" onclick={() => confirmAction = 'retake'}>
                <span class="material-symbols-outlined icon-sm">refresh</span>
                {$m.col_retake}
              </button>
            {/if}
            <button class="btn btn-danger" onclick={() => confirmAction = 'delete'}>
              <span class="material-symbols-outlined icon-sm">delete</span>
              {$m.common_delete}
            </button>
          {/if}
        </div>

      {:else if confirmAction === 'retake'}
        <span class="img-viewer-confirm-msg">
          {$m.col_retake_confirm}
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmAction = null}>
            {$m.common_cancel}
          </button>
          <button class="btn btn-warning" onclick={() => { confirmAction = null; onRetake(record); }}>
            <span class="material-symbols-outlined icon-sm">check</span>
            {$m.common_confirm}
          </button>
        </div>

      {:else if confirmAction === 'delete'}
        <span class="img-viewer-confirm-msg">
          {$m.col_delete_record_confirm}
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmAction = null}>
            {$m.common_cancel}
          </button>
          <button class="btn btn-danger" onclick={() => { confirmAction = null; onDelete(record); }}>
            <span class="material-symbols-outlined icon-sm">check</span>
            {$m.common_delete}
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
.img-viewer-frame {
  position: relative;
  touch-action: none;
  cursor: grab;
}
.img-viewer-frame.dragging { cursor: grabbing; }

  .img-viewer-download {
    position: absolute;
    top: 8px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.55);
    color: var(--color-light);
    text-decoration: none;
    transition: background-color var(--transition-fast);
  }
  .img-viewer-download:hover { background: var(--color-primary); }

  /* Fit/1:1 group (NEH-230), just left of the download button, with the
     same size and style (32px, translucent dark). */
  .img-viewer-zoom-controls {
    position: absolute;
    top: 8px;
    right: 48px;
    display: flex;
    gap: 4px;
  }
  .img-viewer-zoom-btn {
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
  .img-viewer-zoom-btn:hover { background: var(--color-primary); }
  .one-to-one-glyph { font-size: 11px; font-weight: var(--fw-bold); }
  /* Retake and delete. They wrap onto a second row when the footer is too
     narrow for both, instead of pushing past the modal at phone width. */
  .img-viewer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .btn-warning {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-warning, #d97706);
    background: transparent;
    color: var(--color-warning, #d97706);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }
  .btn-warning:hover { background-color: rgba(217, 119, 6, 0.12); }
</style>

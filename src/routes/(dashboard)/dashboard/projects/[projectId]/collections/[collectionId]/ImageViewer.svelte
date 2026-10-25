<script lang="ts">
  // Spread view: shows the left and right pages of the selected record side by
  // side, as an open book, with a zoom and pan shared by both pages.
  //
  // This is the main reading and inspection viewer, like ImageViewerModal, so it
  // asks for the full image rather than the thumbnail. RecordImageDisplay
  // (NEH-139) picks what each format can show: a RAW appears as its JPEG preview,
  // a TIFF only as its thumbnail, and any image falls back to its thumbnail when
  // the preview fails.

  import { type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import RecordImageDisplay from '$lib/components/RecordImageDisplay.svelte';
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
    isSwapped,
    type Pan,
    type PanFraction,
  } from '$lib/pan-zoom';

  let {
    viewMode,
    records,
    selectedRecordId,
    zoom,
    rotation,
    brightness = 0,
    contrast = 0,
    saturation = 0,
    onPrev,
    onNext,
    onOneToOneChange,
  }: {
    viewMode: 'spread';
    records: Record[];
    selectedRecordId: number | null;
    zoom: number;
    rotation: number;
    // Preview adjustments, -100 to 100 (set in LeftSidebar).
    brightness?: number;
    contrast?: number;
    saturation?: number;
    onPrev: () => void;
    onNext: () => void;
    onOneToOneChange?: (z: number) => void;
  } = $props();

  let selectedRecord = $derived(records.find(r => r.id === selectedRecordId) ?? null);
  let selectedIndex  = $derived(records.findIndex(r => r.id === selectedRecordId));

  // Both pages come from the selected record itself (a dual capture). If no image
  // has a role, the first image is shown as the left page.
  let spreadLeftImage  = $derived(
    selectedRecord?.images?.find(img => img.role === 'left')
    ?? selectedRecord?.images?.[0]
    ?? null
  );
  let spreadRightImage = $derived(
    selectedRecord?.images?.find(img => img.role === 'right') ?? null
  );

  // NEH-201: the image's exact file name, not the record's derived title — the
  // file name is what survives in the BagIt export.
  function getImageName(img: RecordImage | null): string {
    return img?.filename ?? '—';
  }

  // NEH-209: while a record is `rejected`, its current images
  // (`selectedRecord.images`, already filtered to `is_current` by the backend)
  // are exactly the ones awaiting retake — one in single mode, two in dual. No
  // fixed count is assumed: a page that shows an image of a rejected record is
  // awaiting retake. Each page carries its own badge.
  let isRejected = $derived(selectedRecord?.status === 'rejected');
  let isApproved = $derived(selectedRecord?.status === 'approved');

  // Measured size of each page frame, so a rotated image is not cropped.
  // `.spread-image` has no fixed width/height (only max-width/max-height) and
  // `.spread-frame` has `overflow: hidden`. A plain rotate(90/270deg) on that box
  // gets cropped: the page turns from landscape to portrait (or the reverse) and
  // the rotated rectangle no longer fits the container. So each `.spread-frame`
  // is measured and, at 90°/270°, the image gets the container size with width
  // and height swapped, absolutely centered, which makes the rotated box fit.
  let leftFrameW  = $state(0);
  let leftFrameH  = $state(0);
  let rightFrameW = $state(0);
  let rightFrameH = $state(0);

  // Natural size of each image (`bind:naturalWidth/Height`), needed to compute
  // the fit and the 1:1 zoom (NEH-230).
  let leftNaturalW  = $state(0);
  let leftNaturalH  = $state(0);
  let rightNaturalW = $state(0);
  let rightNaturalH = $state(0);

  // Shared pan/zoom (NEH-230). The `zoom` prop is relative to the fit: 1 = fit.
  // `pan` is a fraction shared by both pages; each page converts it to
  // its own pixel offset within its own bounds, so the two move in proportion
  // even when their sizes differ, and every edge of either page stays reachable.
  let pan = $state<PanFraction>({ x: 0, y: 0 });

  function dpr(): number {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  let leftFitted  = $derived(fittedSize({ w: leftNaturalW, h: leftNaturalH }, { w: leftFrameW, h: leftFrameH }, rotation));
  let rightFitted = $derived(fittedSize({ w: rightNaturalW, h: rightNaturalH }, { w: rightFrameW, h: rightFrameH }, rotation));

  // `effectiveOneToOne` clamps to >= 1, so 1:1 never shrinks a page
  // below the fit: a page whose natural size already fits its frame (or a
  // high-DPR screen) can have a raw one-to-one zoom below 1.
  let leftOneToOneRaw  = $derived(oneToOneZoom({ w: leftNaturalW, h: leftNaturalH }, { w: leftFrameW, h: leftFrameH }, rotation, dpr()));
  let rightOneToOneRaw = $derived(oneToOneZoom({ w: rightNaturalW, h: rightNaturalH }, { w: rightFrameW, h: rightFrameH }, rotation, dpr()));
  let leftOneToOne  = $derived(effectiveOneToOne(leftOneToOneRaw));
  let rightOneToOne = $derived(effectiveOneToOne(rightOneToOneRaw));

  // Reference for `pageScale`: the LARGEST 1:1 among the pages that have an
  // image, not simply the left page. `pageScale` requires the reference to be
  // >= every page so that each page's fit -> 1:1 curve is monotonic (see the
  // comment on `pageScale` in pan-zoom.ts).
  let oneToOneRef = $derived.by(() => {
    const candidates: number[] = [];
    if (spreadLeftImage) candidates.push(leftOneToOne);
    if (spreadRightImage) candidates.push(rightOneToOne);
    return candidates.length > 0 ? Math.max(...candidates) : 1;
  });

  let leftScale  = $derived(pageScale(zoom, leftOneToOne, oneToOneRef));
  let rightScale = $derived(pageScale(zoom, rightOneToOne, oneToOneRef));

  let leftExtent  = $derived(screenExtent(leftFitted, rotation, leftScale));
  let rightExtent = $derived(screenExtent(rightFitted, rotation, rightScale));

  let leftBounds  = $derived(panBounds(leftExtent, { w: leftFrameW, h: leftFrameH }));
  let rightBounds = $derived(panBounds(rightExtent, { w: rightFrameW, h: rightFrameH }));

  let leftPan  = $derived(panPixels(pan, leftBounds));
  let rightPan = $derived(panPixels(pan, rightBounds));

  // Reports the reference page's 1:1 zoom (one image pixel per device pixel) to
  // the parent whenever it changes, so RightToolbar knows which zoom the 1:1
  // button targets and where to cap the maximum zoom.
  $effect(() => {
    onOneToOneChange?.(oneToOneRef);
  });

  // Drag-to-pan with pointer events: mouse and touch both arrive here, so no
  // separate touch handler is needed.
  let dragSide = $state<'left' | 'right' | null>(null);
  // The pointerId that is actually dragging. Knowing the active side is not
  // enough: a second finger (multi-touch) also arrives as a pointerdown with
  // button === 0 and, without this, overwrites the first finger's
  // dragLastX/Y — the FIRST finger's next pointermove would then compute its
  // delta against the SECOND finger's position and produce a large false jump.
  let dragPointerId: number | null = null;
  let dragLastX = 0;
  let dragLastY = 0;

  function handlePointerDown(e: PointerEvent, side: 'left' | 'right') {
    if (e.button !== 0) return; // primary button only
    // Do not capture the pointer if the press started on a control (button,
    // link) inside the frame: capture retargets the pointerup to the frame and
    // the click never reaches the control. No `.spread-frame` contains a control,
    // but the guard matches ImageViewerModal.svelte and covers any control added
    // to the frame.
    if ((e.target as HTMLElement).closest('button, a')) return;
    // A pointer is already dragging: ignore any other (a second finger) until
    // that drag ends.
    if (dragPointerId !== null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragSide = side;
    dragPointerId = e.pointerId;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
  }

  function handlePointerMove(e: PointerEvent, side: 'left' | 'right') {
    if (dragSide !== side || e.pointerId !== dragPointerId) return;
    const deltaX = e.clientX - dragLastX;
    const deltaY = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    const bounds = side === 'left' ? leftBounds : rightBounds;
    pan = dragToFraction(pan, { x: deltaX, y: deltaY }, bounds);
  }

  function endDrag(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return; // the released/cancelled pointer is not the dragging one
    dragSide = null;
    dragPointerId = null;
  }

  // The panel's three sliders, translated into a CSS filter. Preview only: the
  // file is not modified.
  //
  // All three use the same mapping, -100..100 to 0..2, and 0 is the identity, so
  // resetting them returns the image as the camera delivered it. The mapping is
  // symmetric and predictable on purpose: the sliders are not for retouching a
  // photograph but for drawing detail out of a fogged folio or faded ink, and
  // the right range for that can only be judged on real scans. The bottom
  // quarter of the brightness range is almost black and of little use; it stays
  // reachable rather than adding a curve nobody can reason about.
  let filtro = $derived(
    brightness === 0 && contrast === 0 && saturation === 0
      ? ''
      : `filter: brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100});`
  );

  function spreadImageStyle(rotation: number, scale: number, pixelPan: Pan, containerW: number, containerH: number): string {
    const transition = dragSide === null ? 'transition: transform 0.15s ease;' : '';
    const transformStr = transformFor(pixelPan, scale, rotation);
    if (isSwapped(rotation) && containerW && containerH) {
      // The swapped box (containerH x containerW) exceeds 100% of the unrotated
      // frame on one axis, so max-width/max-height (from `.spread-image`) must be
      // overridden or they crop it again.
      return `${transition} ${filtro} position: absolute; top: 50%; left: 50%; width: ${containerH}px; height: ${containerW}px; max-width: none; max-height: none; transform: translate(-50%, -50%) ${transformStr};`;
    }
    return `${transition} ${filtro} transform: ${transformStr};`;
  }
</script>

<div class="viewer-area">

  <button class="nav-btn left" onclick={onPrev} disabled={selectedIndex <= 0} aria-label={$m.col_prev}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <div class="spread-wrapper">

      <div class="spread-page">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="spread-frame"
          class:dragging={dragSide === 'left'}
          bind:clientWidth={leftFrameW}
          bind:clientHeight={leftFrameH}
          onpointerdown={(e) => handlePointerDown(e, 'left')}
          onpointermove={(e) => handlePointerMove(e, 'left')}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onlostpointercapture={endDrag}
        >
          {#if spreadLeftImage}
            <!-- NEH-139: a RAW shows as its JPEG preview or its thumbnail,
                 never as a broken image -->
            <RecordImageDisplay image={spreadLeftImage}>
              {#snippet children(src, onerror)}
                <img
                  {src}
                  {onerror}
                  alt={$m.col_left_page}
                  class="spread-image left"
                  draggable="false"
                  bind:naturalWidth={leftNaturalW}
                  bind:naturalHeight={leftNaturalH}
                  style={spreadImageStyle(rotation, leftScale, leftPan, leftFrameW, leftFrameH)}
                />
              {/snippet}
            </RecordImageDisplay>
            {#if isRejected}
              <span class="pending-recapture-badge">
                <span class="material-symbols-outlined icon-sm">refresh</span>
                {$m.col_pending_recapture}
              </span>
            {:else if isApproved}
              <span class="approved-badge">
                <span class="material-symbols-outlined icon-sm">check_circle</span>
                {$m.col_approved_badge}
              </span>
            {/if}
          {:else}
            <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
          {/if}
        </div>
        {#if spreadLeftImage}
          <div class="spread-label">
            <span class="spread-name">{getImageName(spreadLeftImage)}</span>
            <span class="spread-side">{$m.col_left_page_short}</span>
          </div>
        {/if}
      </div>

      <div class="book-spine"></div>

      <div class="spread-page">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="spread-frame"
          class:dragging={dragSide === 'right'}
          bind:clientWidth={rightFrameW}
          bind:clientHeight={rightFrameH}
          onpointerdown={(e) => handlePointerDown(e, 'right')}
          onpointermove={(e) => handlePointerMove(e, 'right')}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onlostpointercapture={endDrag}
        >
          {#if spreadRightImage}
            <!-- NEH-139: a RAW shows as its JPEG preview or its thumbnail,
                 never as a broken image -->
            <RecordImageDisplay image={spreadRightImage}>
              {#snippet children(src, onerror)}
                <img
                  {src}
                  {onerror}
                  alt={$m.col_right_page}
                  class="spread-image right"
                  draggable="false"
                  bind:naturalWidth={rightNaturalW}
                  bind:naturalHeight={rightNaturalH}
                  style={spreadImageStyle(rotation, rightScale, rightPan, rightFrameW, rightFrameH)}
                />
              {/snippet}
            </RecordImageDisplay>
            {#if isRejected}
              <span class="pending-recapture-badge">
                <span class="material-symbols-outlined icon-sm">refresh</span>
                {$m.col_pending_recapture}
              </span>
            {:else if isApproved}
              <span class="approved-badge">
                <span class="material-symbols-outlined icon-sm">check_circle</span>
                {$m.col_approved_badge}
              </span>
            {/if}
          {:else}
            <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
          {/if}
        </div>
        {#if spreadRightImage}
          <div class="spread-label right">
            <span class="spread-name">{getImageName(spreadRightImage)}</span>
            <span class="spread-side">{$m.col_right_page_short}</span>
          </div>
        {/if}
      </div>

    </div>

  <button class="nav-btn right" onclick={onNext} disabled={selectedIndex >= records.length - 1} aria-label={$m.col_next}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>

</div>

<style>
  .viewer-area {
    flex: 1;
    position: relative;
    background-color: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
  }

  /* Per-page badge (NEH-209): one status indicator at the bottom of each page,
     with no shared indicator above both. */
  .pending-recapture-badge {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    background-color: rgba(214,103,74,0.85);
    color: white;
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
  }

  .approved-badge {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    background-color: rgba(90,140,98,0.9);
    color: white;
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
  }

  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 52px; height: 52px;
    border-radius: 50%;
    background-color: rgba(26,24,21,0.75);
    backdrop-filter: blur(4px);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light);
    cursor: pointer;
    z-index: 10;
    transition: background-color var(--transition-base);
  }

  /* Symmetric offsets: RightToolbar sits in its own 80px flex column outside
     `.viewer-area` (see +page.svelte / RightToolbar.svelte) and does not
     overlap it, so the right button needs no extra offset; one would push it
     onto the right page on narrow (tablet) screens. */
  .nav-btn.left  { left: 24px; }
  .nav-btn.right { right: 24px; }
  .nav-btn:hover { background-color: rgba(90,140,98,0.3); }
  .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .spread-wrapper {
    display: flex;
    align-items: stretch;
    height: 90%;
    width: 100%;
    max-width: calc(100% - 120px);
    gap: 0;
  }

  /* Column: image box (`.spread-frame`) on top, title (`.spread-label`) below in
     static flow, so the title never overlaps the image at any zoom (NEH-230). */
  .spread-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Image box: measured for the fit and 1:1, receives the pointer for
     drag-to-pan, and clips whatever leaves the frame when zoomed. */
  .spread-frame {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
  }

  .spread-frame.dragging { cursor: grabbing; }

  .book-spine {
    width: 4px;
    background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.4), transparent);
    flex-shrink: 0;
    align-self: stretch;
  }

  /* Spread label: a text row below the image, never over it (NEH-230 — an
     overlaid label covers foliation and marginalia in the corner). */
  .spread-label {
    margin-top: 8px;
    align-self: flex-start;
    background-color: var(--color-surface-alt);
    border-radius: var(--radius-full);
    padding: 6px 14px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .spread-label.right { align-self: flex-end; align-items: flex-end; }

  .spread-name { font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light); }
  .spread-side { font-size: var(--text-xs); color: var(--color-light-grey); }

  .spread-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    display: block;
  }

  .spread-image.left  { box-shadow: inset -8px 0 16px rgba(0,0,0,0.3); }
  .spread-image.right { box-shadow: inset  8px 0 16px rgba(0,0,0,0.3); }

  .no-image {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    opacity: 0.3;
  }

  .no-image span { font-size: var(--text-sm); }
</style>

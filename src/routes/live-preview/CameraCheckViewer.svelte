<script lang="ts">
  // The camera check's test captures at full size (NEH-339): both captures
  // side by side, left page and right page, under one zoom and one pan
  // (src/lib/pair-pan-zoom.svelte.ts, as in the Refocus dialog's
  // test-pictures stage). It opens at 1:1 on the centre once both captures
  // are measured; Fit, 1:1 and the zoom steps sit in the header. Each
  // capture is shown turned by its camera's saved orientation, and pans in
  // screen axes when turned. The captures
  // are the check's object URLs, which the check revokes, not this viewer.
  // Close and Escape close it.
  //
  // Version: 0.3.3

  import { m } from '$lib/i18n';
  import { dismissible, trapFocus } from '$lib/dialog';
  import { PairPanZoom } from '$lib/pair-pan-zoom.svelte';

  let {
    left,
    right,
    leftRotation = 0,
    rightRotation = 0,
    onClose,
  }: {
    // Object URLs of the two captures; null for a side without one.
    left: string | null;
    right: string | null;
    // Clockwise degrees each is shown at: its camera's saved orientation.
    leftRotation?: number;
    rightRotation?: number;
    onClose: () => void;
  } = $props();

  const SIDES = ['left', 'right'] as const;
  let urls = $derived([left, right]);

  const pz = new PairPanZoom(
    (i) => urls[i] !== null,
    (i) => (i === 0 ? leftRotation : rightRotation)
  );
  let wantOneToOne = $state(true);

  $effect(() => {
    if (!wantOneToOne) return;
    const shown = [0, 1].filter((i) => urls[i] !== null);
    if (shown.length === 0) {
      wantOneToOne = false;
      return;
    }
    if (!pz.measured(shown)) return;
    pz.centreOneToOne();
    wantOneToOne = false;
  });
</script>

<div class="img-viewer-backdrop" use:dismissible={{ onDismiss: onClose, backdrop: false }}>
  <div class="img-viewer-content fv-card" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="fv-title" use:trapFocus>
    <div class="img-viewer-header">
      <span class="img-viewer-title" id="fv-title">{$m.camcheck_viewer_title}</span>
      <div class="fv-tools">
        <button class="btn btn-secondary fv-icon-btn" onclick={() => pz.fit()} title={$m.col_fit_screen} aria-label={$m.col_fit_screen_aria}>
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">fit_screen</span>
        </button>
        <button class="btn btn-secondary fv-icon-btn" onclick={() => pz.oneToOne()} title={$m.col_zoom_actual} aria-label={$m.col_zoom_actual_aria}>
          <span class="fv-glyph" aria-hidden="true">1:1</span>
        </button>
        <button class="btn btn-secondary fv-icon-btn" onclick={() => pz.step(-1)} title={$m.lv_zoom_out} aria-label={$m.lv_zoom_out}>
          <span class="fv-glyph" aria-hidden="true">−</span>
        </button>
        <button class="btn btn-secondary fv-icon-btn" onclick={() => pz.step(1)} title={$m.lv_zoom_in} aria-label={$m.lv_zoom_in}>
          <span class="fv-glyph" aria-hidden="true">+</span>
        </button>
      </div>
    </div>

    <div class="img-viewer-images">
      {#each SIDES as side, i (side)}
        {@const url = urls[i]}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="img-viewer-frame fv-frame"
          class:fv-pannable={url !== null}
          class:dragging={pz.dragIndex === i}
          data-viewer-pane={side}
          bind:clientWidth={pz.frameW[i]}
          bind:clientHeight={pz.frameH[i]}
          onpointerdown={(e) => pz.pointerDown(e, i)}
          onpointermove={(e) => pz.pointerMove(e, i)}
          onpointerup={(e) => pz.endDrag(e)}
          onpointercancel={(e) => pz.endDrag(e)}
          onlostpointercapture={(e) => pz.endDrag(e)}
        >
          <span class="img-viewer-badge fv-badge">{side === 'left' ? $m.camcheck_left_page : $m.camcheck_right_page}</span>
          {#if url}
            <img
              src={url}
              alt={side === 'left' ? $m.camcheck_left_page : $m.camcheck_right_page}
              class="img-viewer-img"
              draggable="false"
              bind:naturalWidth={pz.naturalW[i]}
              bind:naturalHeight={pz.naturalH[i]}
              style={pz.imageStyle(i)}
            />
          {:else}
            <p class="fv-empty">{$m.camcheck_no_capture}</p>
          {/if}
        </div>
      {/each}
    </div>

    <div class="img-viewer-footer">
      <span class="fv-hint">{$m.camcheck_viewer_hint}</span>
      <button class="btn btn-secondary" onclick={onClose}>{$m.common_close}</button>
    </div>
  </div>
</div>

<style>
  /* The whole screen less the backdrop's 16px margin (app.css). */
  .fv-card { height: 100%; max-height: 100%; }
  .fv-tools { display: flex; gap: 6px; margin-left: auto; }
  .fv-icon-btn { width: var(--touch-target-min); padding: 0; }
  .fv-glyph { font-size: var(--text-sm); font-weight: var(--fw-bold); }
  .fv-frame { min-height: 0; }
  /* A Canon T7's test capture carries the camera's own EXIF orientation tag
     (6 was seen on the unit), and a browser turns an <img> by it by default.
     Only the saved orientation may turn the pixels here (pz.imageStyle). */
  .fv-frame img { image-orientation: none; }
  .fv-badge { font-size: var(--text-sm); }
  .fv-pannable { touch-action: none; cursor: grab; }
  .fv-pannable.dragging { cursor: grabbing; }
  .fv-empty { margin: 0; padding: 0 0.75rem; font-size: var(--text-sm); color: var(--color-light-grey); text-align: center; }
  .fv-hint { flex: 1; min-width: 0; font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.4; }
</style>

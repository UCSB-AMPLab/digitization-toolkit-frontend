<script lang="ts">
  // The camera check (NEH-339): one screen, over the capture screen, where
  // the operator takes a pair of test captures and checks the cameras before
  // going on capturing. The capture screen opens it with "Check cameras" in
  // its top bar; "Back to capturing" and Escape close it, except when Escape
  // is the assigned capture key, which takes the test captures instead.
  // Nothing opens it by itself.
  //
  // - Captures: "Take test captures", the capture key or the pedal take one
  //   test capture from each camera at once (POST /cameras/test-capture/{n},
  //   the ordinary mode, not the focus check's). The backend never stores
  //   them; here they live as object URLs, revoked when replaced and when the
  //   check closes. A camera that fails shows the catalogued reason on its
  //   side (src/lib/capture-outcome.ts), never the backend's English. The
  //   device list is read on opening and again after each pair.
  // - Zoom, by capability. A CHDK camera (capabilities.zoom_steps) is zoomed
  //   from here in steps, 0..zoom_steps - 1 (POST /cameras/settings/{n} with
  //   zoom_step): one linked control that sends the new step to both cameras,
  //   the left page's first, one request at a time; or, after "Adjust
  //   separately", one control per camera, with "Match" (the right page
  //   camera takes the left page camera's step) while they differ. The check
  //   opens separate when the two steps differ. A step is null until the
  //   camera has entered shooting mode, so the control waits for the first
  //   pair, and waits for the device listing that follows each pair; a
  //   listing requested before a zoom write never overwrites the steps the
  //   cameras confirmed since. A refused step shows the backend's detail and
  //   re-reads the devices. Any zoom change marks the captures on screen out
  //   of date. A
  //   DSLR's zoom ring is on the lens: the check shows the focal length the
  //   backend reads from each capture, and says when the two differ
  //   (focalMismatch, shared with the Refocus dialog).
  // - Focus: 1:1 on a capture opens the pair at full size
  //   (CameraCheckViewer); a DSLR unit (capabilities.dslr_settings) also has
  //   "Refocus", which opens RefocusModal over the check and reports its
  //   closing through onRefocusClosed, as a focus check done.
  // - Orientation: each capture is shown turned by its camera's saved
  //   orientation (`rotateDeg`, the capture screen's state, seeded from the
  //   device rows), so the operator sees the page as Captua will save it.
  //   "Turn" on a pane turns that camera by 90° clockwise through
  //   `onRotateDegChange`, the capture screen's only writer, which saves it
  //   (PUT /cameras/{n}/orientation, one at a time per camera). It needs no
  //   capture, and waits while the cameras work and while that camera's save
  //   is in flight (`savingOrientation`).
  // - The cameras: a chip for each in the top bar, by the page it takes,
  //   connected or not; pressing one shows the model and the connection of
  //   both. A camera missing from the device list is one
  //   Captua cannot reach.
  //
  // Nothing closes the check while the cameras are working. The layout
  // section and "Which camera is this?" of the mock-up are not part of it.
  //
  // Version: 0.3.3

  import { onDestroy, onMount } from 'svelte';
  import { camerasApi, type CameraCapabilities, type CameraDevice } from '$lib/api';
  import { m } from '$lib/i18n';
  import { describeCaptureFailure } from '$lib/capture-outcome';
  import { ownsEvent, readChords } from '$lib/capture-key';
  import { focalMismatch } from '$lib/focus-check';
  import { clampStep, stepRange, zoomFailureDetail } from '$lib/zoom-steps';
  import { dismissible, toBody, trapFocus } from '$lib/dialog';
  import { PairPanZoom } from '$lib/pair-pan-zoom.svelte';
  import RefocusModal from './RefocusModal.svelte';
  import CameraCheckViewer from './CameraCheckViewer.svelte';

  let {
    leftIndex = 0,
    projectName = '',
    collectionName = '',
    rotateDeg = {},
    onRotateDegChange,
    savingOrientation = {},
    onClose,
    onRefocusClosed,
  }: {
    // The camera that takes the left page: 1 when the viewport is swapped.
    leftIndex?: number;
    projectName?: string;
    collectionName?: string;
    // Clockwise degrees by camera index, and the capture screen's writer.
    rotateDeg?: Record<number, number>;
    onRotateDegChange?: (cam: number, deg: number) => void;
    // A camera whose orientation save is in flight.
    savingOrientation?: Record<number, boolean>;
    onClose: () => void;
    // The Refocus dialog opened from here has closed, completed or skipped.
    onRefocusClosed?: () => void;
  } = $props();

  type Side = 'left' | 'right';
  const SIDES: Side[] = ['left', 'right'];

  function cameraOf(side: Side): number {
    return side === 'left' ? leftIndex : 1 - leftIndex;
  }

  let destroyed = false;

  // ---------------------------------------------------------------------------
  // Capabilities and devices
  // ---------------------------------------------------------------------------
  let caps = $state<CameraCapabilities | null>(null);
  let stepped = $derived(caps?.zoom_steps === true);
  let dslr = $derived(caps?.dslr_settings === true);

  // Null until the first answer.
  let devices = $state<CameraDevice[] | null>(null);
  let devicesFailed = $state(false);
  let deviceSeq = 0;
  // One operation runs at a time on this screen: a pair of test captures with
  // the listing that follows it, a zoom write with any re-read it triggers, an
  // orientation save. `running` counts the first two (always 0 or 1); every
  // control that could start another reads `operating`.
  let running = $state(0);
  let saving = $derived(Object.values(savingOrientation).some(Boolean));
  let operating = $derived(running > 0 || saving);

  async function operate<T>(run: () => Promise<T>): Promise<T> {
    running += 1;
    try {
      return await run();
    } finally {
      running -= 1;
    }
  }

  function deviceOf(side: Side): CameraDevice | null {
    return devices?.find((d) => d.index === cameraOf(side)) ?? null;
  }

  // 'unknown' while the list has not been read.
  function reach(side: Side): 'ok' | 'down' | 'unknown' {
    if (devices === null) return 'unknown';
    return deviceOf(side) ? 'ok' : 'down';
  }

  let unreachable = $derived(devices === null ? [] : SIDES.filter((side) => !devices!.some((d) => d.index === cameraOf(side))));

  async function readDevices() {
    const seq = ++deviceSeq;
    try {
      const list = await camerasApi.listDevices();
      if (destroyed || seq !== deviceSeq) return;
      devices = list;
      devicesFailed = false;
      takeSteps(list);
    } catch (err) {
      if (destroyed || seq !== deviceSeq) return;
      console.error('[CameraCheck] Could not read the devices:', err);
      devicesFailed = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Test captures, by camera index
  // ---------------------------------------------------------------------------
  type Shot = {
    status: 'idle' | 'busy' | 'ok' | 'error';
    url?: string;
    focal?: number | null;
    detail?: string;
  };
  let shots = $state<Record<number, Shot>>({ 0: { status: 'idle' }, 1: { status: 'idle' } });
  let capturing = $derived(shots[0].status === 'busy' || shots[1].status === 'busy');
  let hasPicture = $derived(shots[0].status === 'ok' || shots[1].status === 'ok');
  // A zoom change since the captures on screen were taken.
  let stale = $state(false);

  function shotOf(side: Side): Shot {
    return shots[cameraOf(side)];
  }

  function revokeShots() {
    for (const cam of [0, 1]) {
      const url = shots[cam].url;
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function takePictures() {
    if (operating) return;
    await operate(captureAndList);
  }

  async function captureAndList() {
    revokeShots();
    shots = { 0: { status: 'busy' }, 1: { status: 'busy' } };
    stale = false;
    // Both requests go out before either is awaited.
    await Promise.all(
      [0, 1].map(async (cam) => {
        try {
          const result = await camerasApi.testCapture(cam);
          if (destroyed) return;
          shots = { ...shots, [cam]: { status: 'ok', url: URL.createObjectURL(result.blob), focal: result.focalLength ?? null } };
        } catch (err) {
          if (destroyed) return;
          // The backend's English goes to the console only.
          console.error('[CameraCheck] Test capture failed:', cam, err);
          const outcome = describeCaptureFailure(err, $m);
          shots = { ...shots, [cam]: { status: 'error', detail: outcome.kind === 'error' ? outcome.detail : undefined } };
        }
      })
    );
    if (destroyed) return;
    // A capture puts a CHDK camera in shooting mode, which gives it a step.
    await readDevices();
  }

  // ---------------------------------------------------------------------------
  // Stepped zoom (CHDK), by camera index
  // ---------------------------------------------------------------------------
  let steps = $state<Record<number, number | null>>({ 0: null, 1: null });
  let counts = $state<Record<number, number | null>>({ 0: null, 1: null });
  let lastStep = $derived(stepRange(counts[0], counts[1]));
  let stepsKnown = $derived(lastStep !== null && steps[0] != null && steps[1] != null);
  let stepsDiffer = $derived(stepsKnown && steps[0] !== steps[1]);
  let linked = $state(true);
  let zoomError = $state<string | null>(null);
  let zoomDisabled = $derived(!stepsKnown || operating);

  // The steps the device list reports; two different ones unlink the control.
  function takeSteps(list: CameraDevice[]) {
    const at = (cam: number) => list.find((d) => d.index === cam);
    steps = { 0: at(0)?.zoom_step ?? null, 1: at(1)?.zoom_step ?? null };
    counts = { 0: at(0)?.zoom_steps ?? null, 1: at(1)?.zoom_steps ?? null };
    if (steps[0] != null && steps[1] != null && steps[0] !== steps[1]) linked = false;
  }

  // One request to one camera; true when the camera confirmed a step.
  async function sendStep(side: Side, step: number): Promise<boolean> {
    const cam = cameraOf(side);
    try {
      const answer = await camerasApi.setZoomStep(cam, step);
      if (destroyed) return false;
      steps = { ...steps, [cam]: typeof answer?.zoom_step === 'number' ? answer.zoom_step : step };
      if (hasPicture) stale = true;
      return true;
    } catch (err) {
      if (destroyed) return false;
      console.error('[CameraCheck] Zoom step refused:', cam, err);
      zoomError = $m.camcheck_zoom_failed(side, zoomFailureDetail(err));
      return false;
    }
  }

  // Sends `step` to each side in turn, never two requests at once; stops at
  // the first refusal and reads the devices again.
  async function zoomTo(targets: [Side, number][]) {
    if (zoomDisabled) return false;
    return operate(() => writeSteps(targets));
  }

  async function writeSteps(targets: [Side, number][]) {
    zoomError = null;
    let ok = true;
    for (const [side, step] of targets) {
      if (!(await sendStep(side, step))) {
        ok = false;
        break;
      }
    }
    if (destroyed) return false;
    if (steps[0] !== steps[1]) linked = false;
    if (!ok) await readDevices();
    return ok;
  }

  function stepOf(side: Side): number | null {
    return steps[cameraOf(side)];
  }

  function zoomBoth(delta: 1 | -1) {
    const from = stepOf('left');
    if (from == null || lastStep === null) return;
    const target = clampStep(from + delta, lastStep);
    void zoomTo([
      ['left', target],
      ['right', target],
    ]);
  }

  function zoomOne(side: Side, delta: 1 | -1) {
    const from = stepOf(side);
    if (from == null || lastStep === null) return;
    void zoomTo([[side, clampStep(from + delta, lastStep)]]);
  }

  async function match() {
    const target = stepOf('left');
    if (target == null) return;
    if (await zoomTo([['right', target]])) {
      if (stepOf('left') === stepOf('right')) linked = true;
    }
  }

  function together() {
    if (!stepsDiffer) linked = true;
  }

  // ---------------------------------------------------------------------------
  // Focal lengths (DSLR), read from the captures
  // ---------------------------------------------------------------------------
  let focals = $derived.by(() => {
    const l = shotOf('left');
    const r = shotOf('right');
    if (l.status !== 'ok' || r.status !== 'ok' || l.focal == null || r.focal == null) return null;
    return { left: l.focal, right: r.focal, mismatch: focalMismatch(l.focal, r.focal) };
  });

  // ---------------------------------------------------------------------------
  // Orientation, by side
  // ---------------------------------------------------------------------------
  function rotationOf(side: Side): number {
    return rotateDeg[cameraOf(side)] ?? 0;
  }

  // The panes, at fit: the shared geometry turns each capture inside its frame.
  const panes = new PairPanZoom(
    () => false,
    (i) => rotationOf(SIDES[i])
  );

  function turnDisabled(side: Side): boolean {
    return running > 0 || reach(side) !== 'ok' || savingOrientation[cameraOf(side)] === true;
  }

  function turn(side: Side) {
    if (turnDisabled(side)) return;
    onRotateDegChange?.(cameraOf(side), (rotationOf(side) + 90) % 360);
  }

  // ---------------------------------------------------------------------------
  // What opens over the check
  // ---------------------------------------------------------------------------
  let viewerOpen = $state(false);
  let detailsOpen = $state(false);
  let refocusOpen = $state(false);

  function closeRefocus() {
    refocusOpen = false;
    onRefocusClosed?.();
  }

  function close() {
    if (operating) return;
    onClose();
  }

  // The capture key and the pedal take the test captures. While something is
  // open over the check, they are that dialog's. LiveViewport ignores them
  // while the check is open (its otherModalOpen).
  const chords = readChords();
  // The whole assigned chord, modifiers included, as in the Refocus dialog.
  const isCaptureKey = (event: KeyboardEvent) =>
    ownsEvent(event, { chords, modalOpen: false, activeElement: document.activeElement });
  // Escape closes the check unless that press is the capture key: a pedal on
  // Escape takes the test captures and never closes it; with the pedal on
  // Ctrl+Escape, plain Escape still closes it. Nothing closes it while the
  // cameras work.
  const closesOnEscape = (event: KeyboardEvent) => !operating && !isCaptureKey(event);

  function handleKeydown(event: KeyboardEvent) {
    // A press a nested dialog already consumed (Escape closing it) takes nothing.
    if (event.defaultPrevented) return;
    if (viewerOpen || detailsOpen || refocusOpen) return;
    if (!isCaptureKey(event)) return;
    event.preventDefault();
    if (!event.repeat && !operating) void takePictures();
  }

  onMount(() => {
    camerasApi
      .getCapabilities()
      .then((c) => {
        if (!destroyed) caps = c;
      })
      .catch((err) => console.error('[CameraCheck] Could not read the capabilities:', err));
    void readDevices();
  });

  onDestroy(() => {
    destroyed = true;
    revokeShots();
  });

  function sideLabel(side: Side): string {
    return side === 'left' ? $m.camcheck_left_page : $m.camcheck_right_page;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet zoomControl(which: 'both' | Side, value: number | null)}
  <div class="zc" data-zoom={which}>
    <button
      class="btn btn-secondary ck-icon-btn"
      data-dir="out"
      aria-label={$m.camcheck_zoom_out(which)}
      title={$m.camcheck_zoom_out(which)}
      disabled={zoomDisabled || value == null || value <= 0}
      onclick={() => (which === 'both' ? zoomBoth(-1) : zoomOne(which, -1))}
    >−</button>
    <span class="zc-num">
      <span class="zc-val" class:is-off={which === 'right' && stepsDiffer} aria-live="polite">{value ?? '—'}</span>
      {#if lastStep !== null}<span class="zc-of">{$m.camcheck_zoom_of(lastStep)}</span>{/if}
    </span>
    <button
      class="btn btn-secondary ck-icon-btn"
      data-dir="in"
      aria-label={$m.camcheck_zoom_in(which)}
      title={$m.camcheck_zoom_in(which)}
      disabled={zoomDisabled || value == null || lastStep === null || value >= lastStep}
      onclick={() => (which === 'both' ? zoomBoth(1) : zoomOne(which, 1))}
    >+</button>
  </div>
{/snippet}

<div
  class="ck-view"
  data-camera-check
  role="dialog"
  aria-modal="true"
  aria-labelledby="ck-title"
  tabindex="-1"
  use:toBody
  use:trapFocus
  use:dismissible={{ onDismiss: close, escape: closesOnEscape, backdrop: false }}
>
  <div class="topbar">
    <div class="topbar-left">
      <div class="topbar-title">
        <span class="ck-name" id="ck-title">{$m.camcheck_title}</span>
        {#if projectName || collectionName}
          <nav class="breadcrumb" aria-label={$m.tb_breadcrumb_nav}>
            {#if projectName}<span class="bc-item">{projectName}</span>{/if}
            {#if projectName && collectionName}<span class="bc-item bc-sep" aria-hidden="true">/</span>{/if}
            {#if collectionName}<span class="bc-item bc-collection">{collectionName}</span>{/if}
          </nav>
        {/if}
      </div>
    </div>

    <div class="ck-status" role="group" aria-label={$m.camcheck_details_title}>
      {#each SIDES as side (side)}
        {@const conn = reach(side)}
        <button class="cs-btn" data-chip={side} aria-label={$m.camcheck_chip_aria(side)} onclick={() => (detailsOpen = true)}>
          <span class="cam-badge" class:ok={conn === 'ok'} class:err={conn === 'down'}>
            {#if conn === 'ok'}
              <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            {:else if conn === 'down'}
              <span class="material-symbols-outlined" aria-hidden="true">error</span>
            {/if}
            <span>{sideLabel(side)}</span>
            {#if conn === 'ok' && deviceOf(side)?.model}
              <span class="cs-model">· {deviceOf(side)?.model}</span>
            {:else if conn === 'down'}
              <span>· {$m.camcheck_not_reachable}</span>
            {/if}
            <span class="material-symbols-outlined cs-more" aria-hidden="true">expand_more</span>
          </span>
        </button>
      {/each}
    </div>

    <div class="topbar-right">
      <button class="btn-review" onclick={close} disabled={operating}>
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        <span>{$m.camcheck_back}</span>
      </button>
    </div>
  </div>

  <div class="sf">
    <div class="sf-body">
      <div class="sf-board">
        {#each SIDES as side, i (side)}
          {@const shot = shotOf(side)}
          <div
            class="sf-frame"
            class:empty={shot.status !== 'ok'}
            data-frame={side}
            data-stale={stale && shot.status === 'ok' ? '' : undefined}
            bind:clientWidth={panes.frameW[i]}
            bind:clientHeight={panes.frameH[i]}
          >
            {#if shot.status === 'ok' && shot.url}
              <img
                class="ck-img"
                src={shot.url}
                alt={sideLabel(side)}
                draggable="false"
                bind:naturalWidth={panes.naturalW[i]}
                bind:naturalHeight={panes.naturalH[i]}
                style={panes.imageStyle(i)}
              />
            {:else if shot.status === 'busy'}
              <p class="empty-msg" role="status"><span class="img-viewer-spinner" aria-hidden="true"></span>{$m.camcheck_taking}</p>
            {:else if reach(side) === 'down'}
              <p class="empty-msg is-error">
                <span class="material-symbols-outlined" aria-hidden="true">error</span>{$m.camcheck_frame_unreachable}
              </p>
            {:else if shot.status === 'error'}
              <p class="empty-msg is-error" role="alert">
                <span class="material-symbols-outlined" aria-hidden="true">error</span>{$m.camcheck_test_failed(shot.detail)}
              </p>
            {:else}
              <p class="empty-msg">{$m.camcheck_no_capture}</p>
            {/if}
            <div class="feed-label" class:right={side === 'right'}>{sideLabel(side)}</div>
            <button
              class="float-btn ck-turn"
              data-turn
              aria-label={$m.camcheck_turn_aria(side)}
              title={$m.camcheck_turn_title}
              disabled={turnDisabled(side)}
              onclick={() => turn(side)}
            >
              <!-- The mock-up's "turn" icon: the app's icon font has none. -->
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.3-5.6" />
                <path d="M4 4v4h4" />
              </svg>
            </button>
            {#if shot.status === 'ok'}
              <button
                class="float-btn ck-full"
                aria-label={$m.camcheck_full_size_aria(side)}
                title={$m.col_zoom_actual}
                onclick={() => (viewerOpen = true)}
              ><span class="ck-glyph" aria-hidden="true">1:1</span></button>
            {/if}
          </div>
        {/each}
      </div>

      <div class="ck-col">
        {#if devicesFailed}
          <div class="action-notice is-error" role="alert">
            <span class="material-symbols-outlined" aria-hidden="true">error</span>
            <span class="action-notice-text">{$m.camcheck_devices_failed}</span>
          </div>
        {/if}
        {#each unreachable as side (side)}
          <div class="action-notice is-error" role="alert">
            <span class="material-symbols-outlined" aria-hidden="true">error</span>
            <span class="action-notice-text"><strong>{$m.camcheck_unreachable_title(side)}</strong> {$m.camcheck_unreachable_body}</span>
          </div>
        {/each}
        {#if !hasPicture && !capturing && unreachable.length === 0}
          <div class="ck-result">
            <span class="material-symbols-outlined" aria-hidden="true">photo_camera</span>
            <span>{$m.camcheck_idle}</span>
          </div>
        {/if}

        {#if stepped}
          <section class="ck-sec">
            <span class="ck-label">{linked ? $m.camcheck_zoom_both : $m.camcheck_zoom_each}</span>
            {#if linked}
              <div class="ck-row">
                {@render zoomControl('both', stepOf('left'))}
                <span class="ck-spacer"></span>
                <button class="btn btn-ghost" onclick={() => (linked = false)} disabled={operating}>{$m.camcheck_adjust_separately}</button>
              </div>
            {:else}
              <div class="zc-pair">
                {#each SIDES as side (side)}
                  <div class="zc-cam">
                    <span class="sf-small">{sideLabel(side)}</span>
                    {@render zoomControl(side, stepOf(side))}
                  </div>
                {/each}
              </div>
              <div class="ck-row">
                {#if stepsDiffer}
                  <button class="btn btn-secondary" onclick={match} disabled={zoomDisabled}>{$m.camcheck_match}</button>
                {/if}
                <button class="btn btn-ghost" onclick={together} disabled={stepsDiffer || operating}>{$m.camcheck_adjust_together}</button>
              </div>
            {/if}
            {#if !stepsKnown}
              <p class="sf-small">{$m.camcheck_zoom_first}</p>
            {/if}
            {#if zoomError}
              <p class="ck-error" role="alert">{zoomError}</p>
            {/if}
            {#if stale}
              <p class="ck-stale">
                <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
                <span>{$m.camcheck_stale}</span>
              </p>
            {/if}
          </section>
        {:else if dslr}
          <section class="ck-sec">
            <span class="ck-label">{$m.camcheck_zoom}</span>
            {#if focals}
              <div class="fl-pair">
                {#each SIDES as side (side)}
                  <div class="fl-cam">
                    <span class="sf-small">{sideLabel(side)}</span>
                    <span class="fl-val" class:is-off={side === 'right' && focals.mismatch !== null} data-focal={side}
                      >{$m.camcheck_focal_value(focals[side])}<span class="fl-unit">{$m.camcheck_mm}</span></span>
                  </div>
                {/each}
              </div>
              {#if focals.mismatch}
                <div class="action-notice" role="status">
                  <span class="material-symbols-outlined" aria-hidden="true">warning</span>
                  <span class="action-notice-text"><strong>{$m.camcheck_focal_differ_title}</strong> {$m.camcheck_focal_differ_body}</span>
                </div>
              {:else}
                <p class="sf-small">{$m.camcheck_focal_read}</p>
              {/if}
            {:else}
              <p class="sf-small">{$m.camcheck_focal_hint}</p>
            {/if}
          </section>
        {/if}

        <section class="ck-sec">
          <span class="ck-label">{$m.camcheck_focus}</span>
          <div class="ck-row ck-focus">
            <p class="sf-small">{$m.camcheck_focus_hint}</p>
            {#if dslr}
              <button class="btn btn-secondary" onclick={() => (refocusOpen = true)} disabled={operating}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                  <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>{$m.focus_refocus}</span>
              </button>
            {/if}
          </div>
        </section>
      </div>
    </div>

    <div class="sf-foot">
      <span class="sf-small">{$m.camcheck_discarded}</span>
      <span class="ck-spacer"></span>
      <button class="btn btn-primary" onclick={takePictures} disabled={operating}>
        <span class="material-symbols-outlined" aria-hidden="true">photo_camera</span>
        <span>{$m.camcheck_take}</span>
      </button>
    </div>
  </div>

  {#if viewerOpen}
    <CameraCheckViewer
      left={shotOf('left').status === 'ok' ? (shotOf('left').url ?? null) : null}
      right={shotOf('right').status === 'ok' ? (shotOf('right').url ?? null) : null}
      leftRotation={rotationOf('left')}
      rightRotation={rotationOf('right')}
      onClose={() => (viewerOpen = false)}
    />
  {/if}

  {#if detailsOpen}
    <div class="modal-backdrop" use:dismissible={{ onDismiss: () => (detailsOpen = false) }}>
      <div class="modal-card cd-card dialog-fit" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="cd-title" use:trapFocus>
        <h3 class="modal-title" id="cd-title">{$m.camcheck_details_title}</h3>
        <div class="cd-grid">
          {#each SIDES as side (side)}
            {@const device = deviceOf(side)}
            {@const conn = reach(side)}
            <div class="cd-cam" data-details={side}>
              <span class="ck-label">{$m.camcheck_details_camera(side)}</span>
              <dl>
                <dt>{$m.camcheck_connection}</dt>
                <dd class:is-error={conn === 'down'}>
                  {conn === 'ok' ? $m.camcheck_connected : conn === 'down' ? $m.camcheck_cannot_reach : '—'}
                </dd>
                <dt>{$m.camcheck_model}</dt>
                <dd>{device?.model || '—'}</dd>
              </dl>
            </div>
          {/each}
        </div>
        <div class="modal-actions">
          <button class="modal-btn cancel" onclick={() => (detailsOpen = false)}>{$m.common_close}</button>
        </div>
      </div>
    </div>
  {/if}
</div>

{#if refocusOpen}
  <RefocusModal {leftIndex} onClose={closeRefocus} />
{/if}

<style>
  /* Over the whole capture screen, under the dialogs that open over it
     (the image viewer's 200, the Refocus dialog's too). */
  .ck-view {
    position: fixed;
    inset: 0;
    z-index: 150;
    display: flex;
    flex-direction: column;
    background-color: var(--color-bg);
    overflow: hidden;
  }

  /* ── Top bar: TopBar.svelte's, with the screen's name over the breadcrumb ── */
  .topbar {
    height: 72px;
    width: 100%;
    background-color: var(--color-surface-alt);
    border-bottom: 2px solid var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 32px;
    flex-shrink: 0;
  }
  .topbar-left,
  .topbar-right { display: flex; align-items: center; gap: 16px; }
  .topbar-left { min-width: 0; flex: 1; }
  .topbar-right { justify-content: flex-end; flex-shrink: 0; }
  .ck-name { font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light); line-height: 1.2; white-space: nowrap; }
  .breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 13px; min-width: 0; }
  .bc-item { color: var(--color-light-grey); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bc-sep { flex-shrink: 0; }
  .bc-collection { color: var(--color-light); font-weight: var(--fw-bold); }
  .btn-review {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    min-height: var(--touch-target-min);
    border-radius: var(--radius-full);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: 13px;
    font-weight: var(--fw-bold);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-base);
  }
  .btn-review:hover { background-color: var(--color-primary-hover); }
  .btn-review:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-review .material-symbols-outlined { font-size: 20px; }

  /* The camera chips: the dashboard's .cam-badge, pressable */
  .ck-status { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .cs-btn { min-height: var(--touch-target-min); display: inline-flex; align-items: center; background: none; border: none; padding: 0 2px; cursor: pointer; font-family: var(--font-family); }
  .cam-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: var(--fw-bold);
    padding: 4px 6px 4px 8px;
    border-radius: var(--radius-full);
    background-color: rgba(171, 183, 183, 0.1);
    color: var(--color-light-grey);
    border: 1px solid var(--border-color);
    white-space: nowrap;
  }
  .cam-badge.ok { background-color: rgba(90, 140, 98, 0.15); color: var(--color-primary); border-color: var(--color-primary); }
  .cam-badge.err { background-color: var(--color-error-bg); color: var(--color-error); border-color: var(--color-error); }
  .cam-badge .material-symbols-outlined { font-size: 15px; }
  .cam-badge .cs-more { font-size: 16px; opacity: 0.8; }
  .cs-model { font-weight: var(--fw-semibold); }

  @media (max-width: 900px) {
    .topbar { padding: 0 16px; }
    .topbar-left,
    .topbar-right { gap: 10px; }
    .btn-review { padding: 10px 14px; }
    .cs-model { display: none; }
  }

  /* ── Body: the pair on the left, the check column on the right ── */
  .sf { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .sf-body { flex: 1; min-height: 0; display: flex; gap: 16px; padding: 10px 16px; overflow: hidden; }
  .sf-foot {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background-color: var(--color-surface);
    border-top: 1px solid var(--border-color);
  }
  .sf-small { margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.4; }
  .sf-board {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    background-color: #2c2920;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
  }
  .sf-frame {
    position: relative;
    height: 100%;
    aspect-ratio: 2 / 3;
    max-width: calc(50% - 3px);
    background: #0a0a0a;
    border: 1px solid rgba(90, 140, 98, 0.2);
    overflow: hidden;
  }
  .sf-frame.empty { display: flex; align-items: center; justify-content: center; }
  /* A Canon T7's test capture carries the camera's own EXIF orientation tag
     (6 was seen on the unit), and a browser turns an <img> by it by default.
     Only the saved orientation may turn the pixels here (panes.imageStyle). */
  .ck-img { width: 100%; height: 100%; object-fit: contain; display: block; image-orientation: none; }
  .empty-msg { margin: 0; padding: 12px; font-size: var(--text-sm); line-height: 1.4; color: var(--color-light-grey); text-align: center; }
  .empty-msg .material-symbols-outlined { display: block; margin: 0 auto 6px; font-size: 28px; }
  .empty-msg.is-error { color: var(--color-light); }
  .empty-msg.is-error .material-symbols-outlined { color: var(--color-error); }

  /* LiveViewport.svelte's .feed-label, at the frame's size */
  .feed-label {
    position: absolute;
    top: 6px;
    left: 6px;
    background: rgba(19, 17, 16, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 700;
    color: var(--color-light);
    pointer-events: none;
    z-index: 5;
    white-space: nowrap;
  }
  .feed-label.right { left: auto; right: 6px; }

  /* LiveViewport.svelte's .float-btn, in the Refocus dialog's 1:1 look */
  .float-btn {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .ck-full {
    position: absolute;
    bottom: 4px;
    right: 4px;
    z-index: 5;
    background-color: rgba(26, 24, 21, 0.9);
    border: 1px solid rgba(90, 140, 98, 0.3);
    color: var(--color-light);
  }
  /* The mock-up's turn button, in the corner the 1:1 button leaves free */
  .ck-turn {
    position: absolute;
    bottom: 4px;
    left: 4px;
    z-index: 5;
    background-color: rgba(26, 24, 21, 0.9);
    border: 1px solid rgba(90, 140, 98, 0.3);
    color: var(--color-light);
  }
  .ck-turn:disabled { opacity: 0.4; cursor: not-allowed; }
  .ck-glyph { font-size: var(--text-sm); font-weight: var(--fw-bold); }
  .ck-icon-btn { width: var(--touch-target-min); padding: 0; font-size: 20px; font-weight: var(--fw-bold); }

  /* ── The check column ── */
  .ck-col { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; overscroll-behavior: contain; }
  @media (min-width: 1100px) { .ck-col { width: 380px; } }
  .ck-col > * { flex-shrink: 0; }
  .ck-col .action-notice { margin: 0; padding: 8px 12px; line-height: 1.45; }
  .action-notice .material-symbols-outlined { font-size: 18px; color: var(--color-warning); flex-shrink: 0; }
  .action-notice.is-error .material-symbols-outlined { color: var(--color-error); }
  .action-notice strong { font-weight: var(--fw-bold); }
  /* CaptureInstruction.svelte's small uppercase label */
  .ck-label { font-size: var(--text-xs); font-weight: var(--fw-bold); letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-light-grey); }
  .ck-sec { display: flex; flex-direction: column; gap: 6px; }
  .ck-sec + .ck-sec,
  .ck-result + .ck-sec { border-top: 1px solid var(--border-color); padding-top: 6px; }
  .ck-result { display: flex; align-items: flex-start; gap: 6px; font-size: 14px; font-weight: var(--fw-bold); line-height: 1.35; color: var(--color-light); }
  .ck-result .material-symbols-outlined { font-size: 18px; flex-shrink: 0; margin-top: 1px; color: var(--color-light-grey); }
  .ck-stale { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.4; }
  .ck-stale .material-symbols-outlined { font-size: 16px; flex-shrink: 0; }
  .ck-error { margin: 0; font-size: var(--text-sm); line-height: 1.4; color: var(--color-error); }
  .ck-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ck-focus { flex-wrap: nowrap; }
  .ck-focus p { flex: 1; min-width: 0; }
  .ck-spacer { flex: 1; }
  .ck-col .btn { font-size: 13px; padding: 8px 12px; }
  .ck-col .btn.ck-icon-btn { font-size: 20px; padding: 0; }
  .ck-col .btn svg { flex-shrink: 0; }

  /* Zoom: minus, the step and its range, plus */
  .zc { display: inline-flex; align-items: center; gap: 4px; }
  .zc-num { display: inline-flex; flex-direction: column; align-items: center; min-width: 48px; }
  .zc-val { font-size: var(--text-h3); font-weight: var(--fw-black); line-height: 1; font-variant-numeric: tabular-nums; color: var(--color-light); }
  .zc-val.is-off { color: var(--color-warning); }
  .zc-of { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.2; white-space: nowrap; }
  .zc-pair { display: flex; gap: 12px; }
  .zc-cam { display: flex; flex-direction: column; gap: 2px; }

  /* Focal lengths read from the test captures (DSLR) */
  .fl-pair { display: flex; gap: 24px; }
  .fl-cam { display: flex; flex-direction: column; }
  .fl-val { font-size: var(--text-h3); font-weight: var(--fw-black); line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--color-light); }
  .fl-unit { font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light-grey); margin-left: 3px; }
  .fl-val.is-off { color: var(--color-warning); }

  /* ── The camera details: LiveViewport.svelte's modal ── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 210;
    padding: 24px;
  }
  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 20px 24px;
    width: 100%;
    max-width: 540px;
    box-shadow: var(--shadow-lg);
  }
  .modal-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 6px; }
  .modal-actions { display: flex; gap: 12px; }
  .modal-btn {
    flex: 1;
    height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    cursor: pointer;
    border: 1px solid var(--border-color);
  }
  .modal-btn.cancel { background-color: var(--color-surface); color: var(--color-light-grey); }
  .cd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0 20px; }
  .cd-cam { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background-color: var(--color-surface-alt-2); min-width: 0; }
  .cd-cam dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; font-size: var(--text-sm); }
  .cd-cam dt { color: var(--color-light-grey); }
  .cd-cam dd { margin: 0; color: var(--color-light); font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
  .cd-cam dd.is-error { color: var(--color-error); }
</style>

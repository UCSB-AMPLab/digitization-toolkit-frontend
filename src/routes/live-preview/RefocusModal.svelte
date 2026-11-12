<script lang="ts">
  // The focus check of a two-DSLR unit (NEH-339), in three stages of one
  // dialog. The capture screen opens it with "Refocus", and by itself when a
  // session starts or resumes after a break (src/lib/focus-check.ts).
  //
  // 1. Autofocus: the operator switches the light on, puts a page with text
  //    under the cameras and slides both lens switches to AF. Each camera's
  //    focus mode, from GET /cameras/dslr/{n}/settings, is read again every
  //    FOCUS_POLL_MS, with a tick for each camera that reads AF. "Next"
  //    never waits for it.
  // 2. Test pictures: POST /cameras/test-capture/{n}?focus_check=true for
  //    both cameras at once, from the button or from the capture key and the
  //    pedal (the chords LiveViewport uses, src/lib/capture-key.ts). The
  //    backend answers within about 20 s; a 504 means the camera did not
  //    fire, which on AF means it found no focus. The backend never stores
  //    these pictures; here they live as object URLs, revoked when replaced
  //    and when the dialog closes. The pair opens at 1:1 on the centre,
  //    under one shared zoom and pan (src/lib/pan-zoom.ts, as in
  //    ImageViewerModal). Each picture shows its focal length when the
  //    backend sends one, and two different ones get a line saying so.
  // 3. Manual focus: both switches back to MF, the focus ring untouched.
  //    "Continue" waits until both cameras read MF (REQUIRE_MF_READING); a
  //    camera whose reading has failed CONTINUE_ANYWAY_AFTER times in a row
  //    gets "Continue anyway", so a failed read never holds the unit.
  //
  // On the first and last stages the capture key and the pedal do nothing:
  // the key is taken from the focused button too. No reading is taken on
  // the test-pictures stage, so none while a test capture runs. Nothing
  // closes the dialog while one runs; otherwise "Skip" and Escape close it,
  // as dismissed.
  //
  // At the unit's 800x480 screen the test-pictures stage fills the dialog's
  // height without scrolling: the panes take what the rest leaves, the
  // status row keeps its height whether it shows anything, and the steps
  // fold behind "Show steps" once a pair has answered
  // (RefocusModal.fit.svelte.test.ts).
  //
  // Version: 0.3.3

  import { onDestroy, untrack } from 'svelte';
  import { camerasApi } from '$lib/api';
  import { m } from '$lib/i18n';
  import { describeFocusMode, type FocusModeKind } from '$lib/focus-mode';
  import { describeCaptureFailure } from '$lib/capture-outcome';
  import { ownsEvent, readChords } from '$lib/capture-key';
  import {
    CONTINUE_ANYWAY_AFTER,
    FOCUS_POLL_MS,
    REQUIRE_MF_READING,
    canContinue,
    mfWarning,
    nextFailedReadings,
  } from '$lib/focus-check';
  import { dismissible, toBody, trapFocus } from '$lib/dialog';
  import {
    fittedSize,
    screenExtent,
    oneToOneZoom,
    effectiveOneToOne,
    pageScale,
    panBounds,
    panPixels,
    dragToFraction,
    stepZoom,
    transformFor,
    type Pan,
    type PanFraction,
  } from '$lib/pan-zoom';

  let {
    leftIndex = 0,
    onClose,
    requireMfReading = REQUIRE_MF_READING,
  }: {
    // The camera that takes the left page: 1 when the viewport is swapped.
    leftIndex?: number;
    onClose: (outcome: 'completed' | 'dismissed') => void;
    requireMfReading?: boolean;
  } = $props();

  type Side = 'left' | 'right';
  const SIDES: Side[] = ['left', 'right'];
  const STAGES = 3;

  function cameraOf(side: Side): number {
    return side === 'left' ? leftIndex : 1 - leftIndex;
  }

  let stage = $state<0 | 1 | 2>(0);
  let destroyed = false;

  // ---------------------------------------------------------------------------
  // Focus-mode readings, by camera index
  // ---------------------------------------------------------------------------
  let modes = $state<Record<number, FocusModeKind>>({ 0: 'unknown', 1: 'unknown' });
  // Failed readings in a row (no answer, or an answer without a mode).
  let failures = $state<Record<number, number>>({ 0: 0, 1: 0 });
  let readings = $derived({ left: modes[cameraOf('left')], right: modes[cameraOf('right')] });
  let warning = $derived(stage === 2 ? mfWarning(readings) : null);
  let continueAllowed = $derived(canContinue(readings, requireMfReading));
  let continueAnyway = $derived(
    stage === 2 && !continueAllowed && (failures[0] >= CONTINUE_ANYWAY_AFTER || failures[1] >= CONTINUE_ANYWAY_AFTER)
  );
  // The mode each stage asks for: a tick for each camera that reads it.
  let wanted = $derived<FocusModeKind | null>(stage === 0 ? 'auto' : stage === 2 ? 'manual' : null);

  // At most one settings request per camera is in flight; a poll tick for a
  // camera that is still waiting starts nothing. The token names the request
  // whose answer may be recorded: invalidating a camera clears it, so that
  // an answer sent before then is dropped.
  const inFlight: Record<number, number | null> = { 0: null, 1: null };
  let requestToken = 0;

  function setReading(cam: number, kind: FocusModeKind) {
    modes = { ...modes, [cam]: kind };
    failures = { ...failures, [cam]: nextFailedReadings(failures[cam], kind) };
  }

  function readModes() {
    for (const cam of [0, 1]) {
      if (inFlight[cam] !== null) continue;
      const token = ++requestToken;
      inFlight[cam] = token;
      const settled = () => {
        if (destroyed || inFlight[cam] !== token) return false;
        inFlight[cam] = null;
        return true;
      };
      camerasApi
        .getDSLRSettings(cam)
        .then((s) => {
          if (settled()) setReading(cam, describeFocusMode(s.focus_mode));
        })
        .catch(() => {
          // A camera that does not answer has no reading.
          if (settled()) setReading(cam, 'unknown');
        });
    }
  }

  // Entering the MF stage: what was read before may predate a lens switch, so
  // no reading carries over and no answer already on its way is recorded.
  function forgetReadings() {
    modes = { 0: 'unknown', 1: 'unknown' };
    failures = { 0: 0, 1: 0 };
    inFlight[0] = null;
    inFlight[1] = null;
  }

  // ---------------------------------------------------------------------------
  // Test pictures, by camera index
  // ---------------------------------------------------------------------------
  type Shot = {
    status: 'idle' | 'busy' | 'ok' | 'error';
    url?: string;
    focal?: number | null;
    // 'no-focus' for a 504; otherwise the catalogue's detail, when there is one.
    failure?: 'no-focus' | { detail?: string };
  };
  let shots = $state<Record<number, Shot>>({ 0: { status: 'idle' }, 1: { status: 'idle' } });
  let capturing = $derived(shots[0].status === 'busy' || shots[1].status === 'busy');
  // A picture has actually arrived, from either camera.
  let hasPicture = $derived(shots[0].status === 'ok' || shots[1].status === 'ok');
  let elapsed = $state(0);
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  // Both focal lengths known and different: the two lenses are zoomed apart.
  let focalMismatch = $derived.by(() => {
    const left = shots[cameraOf('left')];
    const right = shots[cameraOf('right')];
    if (left.status !== 'ok' || right.status !== 'ok') return null;
    if (left.focal == null || right.focal == null || left.focal === right.focal) return null;
    return { left: left.focal, right: right.focal };
  });

  // A pair has answered, with a picture or a failure from each camera.
  let answered = $derived(!capturing && (shots[0].status !== 'idle' || shots[1].status !== 'idle'));
  // Once a pair has answered, the steps fold behind "Show steps", so that a
  // picture or a failure message gets the room.
  let stepsExpanded = $state(false);
  let stepsShown = $derived(stage !== 1 || !answered || stepsExpanded);

  // The "could not focus" list never gets cut off. With the steps shown over
  // it, the panes keep the height the list needs and the body scrolls: the
  // only state of this stage in which it does.
  let listH = $state<number[]>([0, 0]);
  let holdForList = $derived(
    stage === 1 && stepsShown && [0, 1].some((i) => shotOf(i).failure === 'no-focus')
  );
  // The focal-length row under each frame: .rf-focal-row, 18px and a 2px margin.
  const FOCAL_ROW = 20;
  // 8px above and below the list, inside the frame.
  let holdHeight = $derived(Math.ceil(Math.max(listH[0], listH[1])) + 16);

  // The readings run on the AF and MF stages only, so never during a capture.
  $effect(() => {
    if (stage === 1 || capturing) return;
    untrack(readModes);
    const timer = setInterval(readModes, FOCUS_POLL_MS);
    return () => clearInterval(timer);
  });

  function stopElapsed() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function revokeShots() {
    for (const cam of [0, 1]) {
      const url = shots[cam].url;
      if (url) URL.revokeObjectURL(url);
    }
  }

  function failureOf(err: unknown): Shot['failure'] {
    const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined;
    if (status === 504) return 'no-focus';
    const outcome = describeCaptureFailure(err, $m);
    return { detail: outcome.kind === 'error' ? outcome.detail : undefined };
  }

  async function takePictures() {
    if (capturing) return;
    revokeShots();
    shots = { 0: { status: 'busy' }, 1: { status: 'busy' } };
    naturalW = [0, 0];
    naturalH = [0, 0];
    zoom = 1;
    pan = { x: 0, y: 0 };
    wantOneToOne = true;
    stepsExpanded = false;
    elapsed = 0;
    stopElapsed();
    elapsedTimer = setInterval(() => (elapsed += 1), 1000);
    // Both requests go out before either is awaited.
    await Promise.all(
      [0, 1].map(async (cam) => {
        try {
          const result = await camerasApi.testCapture(cam, { focusCheck: true });
          if (destroyed) return;
          shots = {
            ...shots,
            [cam]: { status: 'ok', url: URL.createObjectURL(result.blob), focal: result.focalLength ?? null },
          };
        } catch (err) {
          if (destroyed) return;
          // The backend's English goes to the console only.
          console.error('[RefocusModal] Test capture failed:', cam, err);
          shots = { ...shots, [cam]: { status: 'error', failure: failureOf(err) } };
        }
      })
    );
    stopElapsed();
  }

  // The capture key and the pedal: on the test-pictures stage they take the
  // pair; on the others they do nothing. Either way the key is taken from
  // the focused button. LiveViewport ignores it while this dialog is open
  // (its otherModalOpen), so it never starts a real capture.
  const chords = readChords();

  function handleKeydown(event: KeyboardEvent) {
    if (!ownsEvent(event, { chords, modalOpen: false, activeElement: document.activeElement })) return;
    event.preventDefault();
    if (stage === 1 && !event.repeat && !capturing) void takePictures();
  }

  // ---------------------------------------------------------------------------
  // Shared pan and zoom over the pair, by pane (0 left, 1 right)
  // ---------------------------------------------------------------------------
  let zoom = $state(1);
  let pan = $state<PanFraction>({ x: 0, y: 0 });
  let frameW = $state<number[]>([0, 0]);
  let frameH = $state<number[]>([0, 0]);
  let naturalW = $state<number[]>([0, 0]);
  let naturalH = $state<number[]>([0, 0]);
  // Set by each new pair: once every picture of it is measured, the zoom goes
  // to 1:1 on the centre.
  let wantOneToOne = $state(false);

  function dpr(): number {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  function shotOf(pane: number): Shot {
    return shots[cameraOf(SIDES[pane])];
  }

  let oneToOnes = $derived(
    [0, 1].map((i) =>
      effectiveOneToOne(
        oneToOneZoom({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0, dpr())
      )
    )
  );
  let oneToOneRef = $derived(Math.max(...oneToOnes));

  let frameGeoms = $derived(
    [0, 1].map((i) => {
      const fitted = fittedSize({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0);
      const scale = pageScale(zoom, oneToOnes[i] ?? 1, oneToOneRef);
      const bounds = panBounds(screenExtent(fitted, 0, scale), { w: frameW[i] ?? 0, h: frameH[i] ?? 0 });
      return { scale, pan: panPixels(pan, bounds) as Pan, bounds };
    })
  );

  $effect(() => {
    if (!wantOneToOne || capturing) return;
    const shown = [0, 1].filter((i) => shotOf(i).status === 'ok');
    if (shown.length === 0) {
      wantOneToOne = false;
      return;
    }
    if (shown.some((i) => !(naturalW[i] > 0 && frameW[i] > 0))) return;
    zoom = oneToOneRef;
    pan = { x: 0, y: 0 };
    wantOneToOne = false;
  });

  // Drag to pan, as in ImageViewerModal: the first pointer only.
  let dragIndex = $state<number | null>(null);
  let dragPointerId: number | null = null;
  let dragLastX = 0;
  let dragLastY = 0;

  function handlePointerDown(e: PointerEvent, i: number) {
    if (shotOf(i).status !== 'ok' || e.button !== 0 || dragPointerId !== null) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is no longer active cannot be captured; the drag works without.
    }
    dragIndex = i;
    dragPointerId = e.pointerId;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
  }

  function handlePointerMove(e: PointerEvent, i: number) {
    if (dragIndex !== i || e.pointerId !== dragPointerId) return;
    const delta = { x: e.clientX - dragLastX, y: e.clientY - dragLastY };
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    pan = dragToFraction(pan, delta, frameGeoms[i]?.bounds ?? { w: 0, h: 0 });
  }

  function endDrag(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return;
    dragIndex = null;
    dragPointerId = null;
  }

  function imageStyle(i: number): string {
    const geom = frameGeoms[i];
    const transition = dragIndex === null ? 'transition: transform 0.15s ease;' : '';
    return `${transition} transform: ${transformFor(geom.pan, geom.scale, 0)};`;
  }

  // ---------------------------------------------------------------------------
  // Stages and closing
  // ---------------------------------------------------------------------------
  function next() {
    if (capturing || stage === 2) return;
    if (stage === 1) forgetReadings();
    stage = (stage + 1) as 0 | 1 | 2;
  }

  function back() {
    if (capturing || stage === 0) return;
    stage = (stage - 1) as 0 | 1 | 2;
  }

  function dismiss() {
    if (capturing) return;
    onClose('dismissed');
  }

  function complete(anyway = false) {
    if (capturing || (!continueAllowed && !(anyway && continueAnyway))) return;
    onClose('completed');
  }

  function modeLabel(kind: FocusModeKind): string {
    return kind === 'manual' ? $m.focus_mode_manual : kind === 'auto' ? $m.focus_mode_auto : $m.focus_mode_unknown;
  }

  onDestroy(() => {
    destroyed = true;
    stopElapsed();
    revokeShots();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- A lens barrel from the side, with the AF / MF switch; the knob sits at
     the position the stage asks for. The step's own text says the same. -->
{#snippet lensDrawing(position: 'af' | 'mf')}
  <svg class="rf-lens" width="150" height="80" viewBox="0 0 120 64" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <rect x="2" y="24" width="10" height="24" rx="1.5" />
    <rect x="12" y="20" width="104" height="32" rx="4" />
    <line x1="34" y1="20" x2="34" y2="52" />
    <line x1="58" y1="20" x2="58" y2="52" />
    {#each [38, 42, 46, 50, 54] as x (x)}<line x1={x} y1="22" x2={x} y2="50" stroke-width="0.75" />{/each}
    <rect x="70" y="4" width="40" height="14" rx="3" />
    <rect class="rf-lens-knob" x={position === 'af' ? 72 : 91} y="6" width="17" height="10" rx="2" fill="currentColor" stroke="none" />
    <text x="80.5" y="30" text-anchor="middle" font-size="9" fill="currentColor" stroke="none" class:rf-lens-on={position === 'af'}>AF</text>
    <text x="99.5" y="30" text-anchor="middle" font-size="9" fill="currentColor" stroke="none" class:rf-lens-on={position === 'mf'}>MF</text>
  </svg>
{/snippet}

{#snippet readingList()}
  <dl class="rf-readings">
    {#each SIDES as side (side)}
      <div class="rf-reading" data-reading={side}>
        <dt>{side === 'left' ? $m.focus_camera_left : $m.focus_camera_right}</dt>
        <dd class="rf-reading-value" class:rf-reading-warn={stage === 2 && readings[side] === 'auto'}>{modeLabel(readings[side])}</dd>
        {#if wanted && readings[side] === wanted}
          <span class="material-symbols-outlined icon-sm rf-tick" aria-hidden="true">check_circle</span>
        {/if}
      </div>
    {/each}
  </dl>
{/snippet}

{#snippet stepList(items: string[])}
  <ol class="rf-steps">
    {#each items as item (item)}<li>{item}</li>{/each}
  </ol>
{/snippet}

<div
  class="img-viewer-backdrop"
  use:toBody
  use:dismissible={{ onDismiss: dismiss, escape: !capturing, backdrop: false }}
>
  <div
    class="img-viewer-content rf-card"
    class:rf-card-pictures={stage === 1}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-labelledby="rf-title"
    use:trapFocus
  >
    <div class="img-viewer-header">
      <span class="img-viewer-title" id="rf-title">{$m.focus_title}</span>
      <span class="rf-step">{$m.focus_step(stage + 1, STAGES)}</span>
    </div>

    <div class="rf-body">
      {#if stage === 0 || stage === 2}
        <h2 class="rf-stage-title">{stage === 0 ? $m.focus_af_title : $m.focus_mf_title}</h2>
        <div class="rf-instructions">
          {@render stepList(
            stage === 0
              ? [$m.focus_af_step_light, $m.focus_af_step_switch, $m.focus_af_step_tick]
              : [$m.focus_mf_step_switch, $m.focus_mf_step_ring, $m.focus_mf_step_tick]
          )}
          {@render lensDrawing(stage === 0 ? 'af' : 'mf')}
        </div>
        {@render readingList()}
        {#if warning}
          <p class="rf-warning" role="alert">
            <span class="material-symbols-outlined icon-sm" aria-hidden="true">warning</span>
            <span>{$m.focus_mf_warning(warning)}</span>
          </p>
        {/if}
        {#if stage === 2 && !continueAllowed}
          <p class="rf-note">{$m.focus_mf_required}</p>
        {/if}
      {:else}
        <div class="rf-title-row">
          <h2 class="rf-stage-title">{$m.focus_test_title}</h2>
          <span class="rf-spacer"></span>
          {#if answered}
            <button class="btn btn-ghost rf-steps-toggle" onclick={() => (stepsExpanded = !stepsExpanded)} aria-expanded={stepsExpanded}>
              {stepsExpanded ? $m.focus_steps_hide : $m.focus_steps_show}
            </button>
          {/if}
          {#if hasPicture}
            <button class="btn btn-secondary rf-icon-btn" onclick={() => (zoom = 1)} title={$m.col_fit_screen} aria-label={$m.col_fit_screen_aria}>
              <span class="material-symbols-outlined icon-sm" aria-hidden="true">fit_screen</span>
            </button>
            <button class="btn btn-secondary rf-icon-btn" onclick={() => (zoom = oneToOneRef)} title={$m.col_zoom_actual} aria-label={$m.col_zoom_actual_aria}>
              <span class="rf-glyph" aria-hidden="true">1:1</span>
            </button>
            <button class="btn btn-secondary rf-icon-btn" onclick={() => (zoom = stepZoom(zoom, -1, oneToOneRef))} title={$m.lv_zoom_out} aria-label={$m.lv_zoom_out}>
              <span class="rf-glyph" aria-hidden="true">−</span>
            </button>
            <button class="btn btn-secondary rf-icon-btn" onclick={() => (zoom = stepZoom(zoom, 1, oneToOneRef))} title={$m.lv_zoom_in} aria-label={$m.lv_zoom_in}>
              <span class="rf-glyph" aria-hidden="true">+</span>
            </button>
          {/if}
        </div>
        {#if stepsShown}
          <div class="rf-instructions">
            {@render stepList([$m.focus_test_step_hold, $m.focus_test_step_take, $m.focus_test_step_zoom, $m.focus_test_step_again])}
          </div>
          <p class="rf-note">{$m.focus_test_not_saved}</p>
        {/if}
        <!-- One row whose height never changes: the elapsed time while the
             cameras work, the zoom mismatch afterwards, or nothing. -->
        <div class="rf-status-row">
          {#if capturing}
            <p class="rf-status" role="status"><span class="img-viewer-spinner"></span>{$m.focus_taking(elapsed)}</p>
          {:else if focalMismatch}
            <p class="rf-focal-mismatch" role="status">{$m.focus_focal_mismatch(focalMismatch.left, focalMismatch.right)}</p>
          {/if}
        </div>
        <div class="rf-panes" class:rf-panes-hold={holdForList} style={holdForList ? `height: ${holdHeight + FOCAL_ROW}px` : undefined}>
          {#each SIDES as side, i (side)}
            {@const shot = shotOf(i)}
            <div class="rf-pane" data-pane={side}>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="img-viewer-frame rf-frame"
                class:rf-pannable={shot.status === 'ok'}
                class:dragging={dragIndex === i}
                bind:clientWidth={frameW[i]}
                bind:clientHeight={frameH[i]}
                onpointerdown={(e) => handlePointerDown(e, i)}
                onpointermove={(e) => handlePointerMove(e, i)}
                onpointerup={endDrag}
                onpointercancel={endDrag}
                onlostpointercapture={endDrag}
              >
                <span class="img-viewer-badge rf-badge">{side === 'left' ? $m.badge_left : $m.badge_right}</span>
                {#if shot.status === 'ok' && shot.url}
                  <img
                    src={shot.url}
                    alt={side === 'left' ? $m.focus_camera_left : $m.focus_camera_right}
                    class="img-viewer-img"
                    draggable="false"
                    bind:naturalWidth={naturalW[i]}
                    bind:naturalHeight={naturalH[i]}
                    style={imageStyle(i)}
                  />
                {:else if shot.status === 'busy'}
                  <span class="img-viewer-spinner" aria-hidden="true"></span>
                {:else if shot.status === 'error'}
                  {#if shot.failure === 'no-focus'}
                    <!-- The checks as a list, in the pane: at 800x480 the pane
                         has room for it once the steps have folded. -->
                    <div class="rf-pane-error rf-no-focus" role="alert" bind:offsetHeight={listH[i]}>
                      <p>{$m.focus_no_focus_lead}</p>
                      <ul>
                        <li>{$m.focus_no_focus_cap}</li>
                        <li>{$m.focus_no_focus_light}</li>
                        <li>{$m.focus_no_focus_glass}</li>
                        <li>{$m.focus_no_focus_page}</li>
                      </ul>
                      <p>{$m.focus_no_focus_again}</p>
                    </div>
                  {:else}
                    <p class="rf-pane-error" role="alert">{$m.focus_test_failed(shot.failure?.detail)}</p>
                  {/if}
                {:else}
                  <p class="rf-pane-empty">{$m.focus_test_empty}</p>
                {/if}
              </div>
              <p class="rf-focal-row">
                {#if shot.status === 'ok' && shot.focal != null}<span class="rf-focal">{$m.focus_focal(shot.focal)}</span>{/if}
              </p>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="img-viewer-footer">
      <button class="btn btn-ghost" onclick={dismiss} disabled={capturing}>{$m.focus_skip}</button>
      <span class="rf-spacer"></span>
      {#if stage > 0}
        <button class="btn btn-secondary" onclick={back} disabled={capturing}>{$m.focus_back}</button>
      {/if}
      {#if stage === 1}
        <button class={hasPicture ? 'btn btn-secondary' : 'btn btn-primary'} onclick={takePictures} disabled={capturing}>
          {hasPicture ? $m.focus_take_again : $m.focus_take}
        </button>
      {/if}
      {#if stage < 2}
        <button class={stage === 1 && !hasPicture ? 'btn btn-secondary' : 'btn btn-primary'} onclick={next} disabled={capturing}>{$m.focus_next}</button>
      {:else}
        {#if continueAnyway}
          <button class="btn btn-secondary" onclick={() => complete(true)}>{$m.focus_continue_anyway}</button>
        {/if}
        <button class="btn btn-primary" onclick={() => complete()} disabled={!continueAllowed}>{$m.focus_continue}</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .rf-card { max-width: min(96vw, 1000px); }
  /* The test-pictures stage takes the dialog's full height, so the panes can
     take what the rest leaves (90vh is the dialog's cap, app.css). */
  .rf-card-pictures { height: 90vh; }
  .rf-step { font-size: var(--text-sm); color: var(--color-light-grey); flex-shrink: 0; }
  .rf-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
  }
  .rf-body > * { flex-shrink: 0; }
  .rf-stage-title { margin: 0; font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light); }
  .rf-title-row { display: flex; align-items: center; gap: 4px; min-height: var(--touch-target-min); }
  .rf-steps-toggle { padding: 0 12px; font-size: var(--text-sm); }
  .rf-icon-btn { width: var(--touch-target-min); padding: 0; }
  .rf-glyph { font-size: var(--text-sm); font-weight: var(--fw-bold); }
  .rf-instructions { display: flex; align-items: center; gap: 1rem; }
  .rf-steps {
    flex: 1;
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--text-sm);
    line-height: 1.4;
    color: var(--color-light);
  }
  .rf-lens { flex-shrink: 0; color: var(--color-light-grey); }
  .rf-lens-knob { color: var(--color-primary); }
  .rf-lens-on { fill: var(--color-light); font-weight: var(--fw-bold); }
  .rf-note { margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); }
  .rf-readings { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; margin: 0; }
  .rf-reading { display: flex; align-items: center; gap: 0.5rem; }
  .rf-reading dt { font-size: var(--text-sm); color: var(--color-light-grey); }
  .rf-reading-value { margin: 0; font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light); }
  .rf-reading-warn { color: var(--color-warning); }
  .rf-tick { color: var(--color-success); }
  .rf-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-sm);
    background-color: var(--color-warning-bg);
    color: var(--color-warning);
    font-size: var(--text-sm);
  }
  /* Two lines of --text-sm, reserved whether or not it shows anything. */
  .rf-status-row { height: 34px; display: flex; align-items: center; overflow: hidden; }
  .rf-status { display: flex; align-items: center; margin: 0; font-size: var(--text-sm); color: var(--color-light-grey); }
  .rf-focal-mismatch { margin: 0; font-size: var(--text-sm); line-height: 1.4; color: var(--color-warning); }
  .rf-body > .rf-panes { flex: 1 1 0; min-height: 0; }
  .rf-body > .rf-panes.rf-panes-hold { flex: 0 0 auto; }
  .rf-panes { display: flex; gap: 0.5rem; }
  .rf-pane { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .rf-frame { flex: 1; min-height: 0; }
  .rf-badge { font-size: var(--text-sm); }
  .rf-focal-row { height: 18px; margin: 2px 0 0; font-size: var(--text-sm); line-height: 18px; color: var(--color-light-grey); text-align: center; }
  .rf-pannable { touch-action: none; cursor: grab; }
  .rf-pannable.dragging { cursor: grabbing; }
  .rf-pane-error { margin: 0; padding: 0 0.75rem; font-size: var(--text-sm); line-height: 1.4; color: var(--color-error); text-align: center; }
  .rf-no-focus { text-align: left; display: flex; flex-direction: column; gap: 2px; }
  .rf-no-focus p { margin: 0; }
  .rf-no-focus ul { margin: 0; padding-left: 1.25rem; }
  .rf-pane-empty { margin: 0; padding: 0 0.75rem; font-size: var(--text-sm); color: var(--color-light-grey); text-align: center; }
  .rf-spacer { flex: 1; }
</style>

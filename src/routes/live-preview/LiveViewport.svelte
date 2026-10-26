<script lang="ts">
  // The capture page's central area: the live preview of one or two cameras,
  // the framing guides and grid, the capture button and capture key, and the
  // grid settings modal.
  //
  // The backend has no MJPEG stream, so the live preview is polled: every
  // PREVIEW_INTERVAL_MS this component fetches GET /cameras/preview/{index},
  // a single JPEG frame. The frame's resolution is the backend's default for
  // that endpoint, since no `resolution` parameter is sent from here.

  import { onMount, onDestroy } from 'svelte';
  import { m } from '$lib/i18n';
  import { browser } from '$app/environment';
  import { env } from '$env/dynamic/public';
  import { camerasApi, tokenStore, type CameraDevice } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { wbSamplingStore } from '$lib/stores/wbSampling';
  import { histogramStore, computeHistogram } from '$lib/stores/histogram';
  import { viewportAspect as computeViewportAspect, fitBox, frameAspect, panelGrowFactor } from '$lib/viewport-aspect';
  import {
    DEFAULT_CHORD,
    describeChord,
    learnFromEvent,
    ownsEvent,
    readChord,
    shouldTrigger,
    writeChord,
    clearChord as clearStoredChord,
    type CaptureChord,
    type OwnsEventContext
  } from '$lib/capture-key';
  import { defaultRecordTitle } from '$lib/record-title';
  import { isConflict } from '$lib/volume-stem';
  import { CaptureFailed, captureErrorText } from '$lib/capture-errors';
  import { dismissible } from '$lib/dialog';

  let {
    cameraMode,
    shutterSpeed,
    iso,
    aperture,
    projectId,
    projectName,
    collectionId,
    onCaptureDone,
    devices = [],
    rotateDeg = {},
    onRotateDegChange,
    otherModalOpen = false,
    needsStem = false,
    stemFormHref = '',
    onStemRefused,
  }: {
    cameraMode: 'single' | 'double';
    shutterSpeed: string;
    iso: string;
    aperture: string;
    projectId: number;
    projectName: string;
    collectionId: number;
    onCaptureDone: () => void;
    devices?: CameraDevice[];
    rotateDeg?: Record<number, number>;
    onRotateDegChange?: (cam: number, deg: number) => void;
    // NEH-228: true while the page's own image-inspection modal is open
    // (Book view's "inspectedRecord"). That modal is rendered by +page.svelte,
    // not by this component, so its openness arrives as a prop instead of
    // local state — the capture key must not fire while it's up.
    otherModalOpen?: boolean;
    // True while the volume has no stem (filename_stem): the backend refuses
    // every capture into it (409), so the button is disabled and a banner
    // links to the volume's form at stemFormHref.
    needsStem?: boolean;
    stemFormHref?: string;
    // Called on a 409 from a capture. Reads the volume again and resolves
    // true when it has no stem, in which case the page sets needsStem and the
    // banner replaces the generic capture error.
    onStemRefused?: () => Promise<boolean>;
  } = $props();

  function stepRotation(camIdx: number, delta: number) {
    const current = (rotateDeg ?? {})[camIdx] ?? 0;
    const next = ((current + delta) % 360 + 360) % 360;
    onRotateDegChange?.(camIdx, next);
  }

  let zoom = $state(1);          // CSS zoom of the viewport (1 = 100%)
  let guideV = $state(50);       // Vertical guide (% from the left)
  let guideH = $state(50);       // Horizontal guide (% from the top)
  let dragging = $state<'v' | 'h' | null>(null);

  // swapped = true puts camera 1 on the left and camera 0 on the right.
  let swapped = $state(false);
  let leftIdx  = $derived(swapped ? 1 : 0);
  let rightIdx = $derived(swapped ? 0 : 1);

  let gridRows = 3;
  let gridCols = 3;
  let showGrid = $state(false);
  let showGuides = $state(true);
  let showGridModal = $state(false);

  // ---------------------------------------------------------------------------
  // CAPTURE KEY (NEH-228)
  // A USB digitization pedal behaves as a keyboard that sends a single key,
  // different for each device. Instead of manual configuration, the operator
  // assigns it by pressing the pedal once in the control in the grid settings
  // modal, and the key is stored in that browser. The default is the space
  // bar, so an ordinary keyboard works without any setup.
  // ---------------------------------------------------------------------------
  let chord = $state<CaptureChord>(readChord());

  // Held-key latch: set when a key press starts a capture and released on the
  // matching keyup. If the keyup never arrives (the window lost focus in the
  // middle of the press), blur and visibilitychange release it as well —
  // otherwise a pedal released out of focus would block capture until the
  // page is reloaded.
  let chordHeld = $state(false);
  // The release is compared against the physical `code` of the key that set
  // the latch, never against `chord.key`: releasing the modifier before the
  // key changes what that key reports (Shift+2 sets the latch with key "@"
  // and releases with key "2"), and `code` does not change with modifiers.
  // null when the latch is not set, or when the device reported no usable
  // `code` on the press.
  //
  // A release that does arrive always clears the latch: it clears when the
  // two `code`s (the press's and the release's) match, and also when either
  // of them lacks a usable `code` — a release without an identifiable `code`
  // is still a release. This is deliberately a weak guard, the third of
  // three: the capture-in-progress flag and the repeat flag already prevent
  // a second real capture; this latch only keeps an operating-system key
  // repeat from slipping an extra capture in between the keydown and its
  // keyup. A latch stuck for lack of a `code` is worse than one released too
  // early.
  let heldCode = $state<string | null>(null);

  // While `learning` is true, the window's next keydown does not start a
  // capture — it goes to `learnFromEvent` instead.
  let learning = $state(false);
  // A bare modifier (Control/Alt/Shift/Meta) arrived while the key was being
  // assigned, and the key that completes the combination is still expected.
  // If the modifier is released with nothing else arriving, keyup reports a
  // device that sends only the modifier, instead of staying in "assigning"
  // forever.
  let pendingModifier = $state<'Control' | 'Alt' | 'Shift' | 'Meta' | null>(null);
  let learnMessage = $state<string | null>(null);

  // Either modal takes the keyboard away from capture. The grid settings modal
  // is local; the image-inspection modal lives in the page (+page.svelte) and
  // arrives as a prop, so the two are combined here.
  let modalOpen = $derived(showGridModal || otherModalOpen);

  // Collapsible controls panel, open by default; collapsing it gives the feed
  // back the space the panel covers. The collapse button is always visible:
  // the Pi's touchscreen has no hover that could reveal it.
  let controlsOpen = $state(true);

  let isCapturing = $state(false);
  let captureFlash = $state(false);

  // Ready only once projectId and collectionId have resolved, so no capture
  // starts from an empty or malformed URL.
  const captureReady = $derived(projectId > 0 && collectionId > 0);
  // Ready and with a stem: the only state that enables the capture button
  // and the capture key.
  const canCapture = $derived(captureReady && !needsStem);

  // Its rect turns pointer positions into guide percentages.
  let viewportEl = $state<HTMLElement | null>(null);

  // Preview refresh interval in milliseconds. Raise it if the Pi struggles
  // (e.g. 3000 = 3 s); lower it for a smoother preview if the hardware allows
  // (e.g. 1000 = 1 s).
  const PREVIEW_INTERVAL_MS = 2000;

  // Object URLs of the latest preview frame from each camera, keyed by camera
  // index. Which index shows on the left depends on `swapped`.
  let previewUrls = $state<Record<number, string>>({});

  // References to the live preview <img> elements for pixel sampling.
  let imgEl0: HTMLImageElement | null = $state(null);
  let imgEl1: HTMLImageElement | null = $state(null);

  // Measured size of each `.camera-feed` panel (px), so the rotated image is
  // not clipped by the panel's overflow: hidden — see `feedRotateStyle` below.
  let feedW0 = $state(0);
  let feedH0 = $state(0);
  let feedW1 = $state(0);
  let feedH1 = $state(0);

  // NEH-222: natural size (px) of the frame shown in each panel (0 = left,
  // 1 = right). The viewport takes its shape from these frames rather than
  // from a fixed 4:3 — see `viewportAspect` and `fitBox` below.
  let naturalW0 = $state(0);
  let naturalH0 = $state(0);
  let naturalW1 = $state(0);
  let naturalH1 = $state(0);

  // Measured size of the board (`.mat-board`): the viewport is sized in
  // pixels within it (a definite width: 100% defeats aspect-ratio
  // when height is the limit, so the viewport gets explicit dimensions
  // instead of relying on CSS to derive them).
  let boardW = $state(0);
  let boardH = $state(0);

  // Viewport shape: the frame's in single mode; in double mode, the sum of
  // the two panels' widths at a common height.
  let viewportAspect = $derived(computeViewportAspect(
    [
      naturalW0 && naturalH0 ? { w: naturalW0, h: naturalH0, rotation: rotateDeg[leftIdx] ?? 0 } : null,
      cameraMode === 'double' && naturalW1 && naturalH1
        ? { w: naturalW1, h: naturalH1, rotation: rotateDeg[rightIdx] ?? 0 }
        : null,
    ],
    cameraMode
  ));

  // Pixel box that gives the viewport that shape within the measured board.
  let viewportBox = $derived(fitBox(viewportAspect, boardW, boardH));

  // Each panel's flex-grow factor in double mode is its own frame's
  // shape, so no panel is clipped even when only one is rotated. A panel
  // with no frame yet (no signal, or waiting for the first frame) borrows the
  // other panel's shape instead of an even 1:1 — it falls back to 1 only when
  // neither has one.
  let leftFrameAspect = $derived(
    frameAspect({ w: naturalW0, h: naturalH0, rotation: rotateDeg[leftIdx] ?? 0 })
  );
  let rightFrameAspect = $derived(
    frameAspect({ w: naturalW1, h: naturalH1, rotation: rotateDeg[rightIdx] ?? 0 })
  );
  let leftFeedAspect = $derived(panelGrowFactor(leftFrameAspect, rightFrameAspect));
  let rightFeedAspect = $derived(panelGrowFactor(rightFrameAspect, leftFrameAspect));

  // A plain `transform: rotate()` on a box the size of the panel is clipped
  // at 90°/270°: the panel is a rectangle (landscape) and the rotated image
  // becomes portrait (or the reverse), so the rotated rectangle no longer
  // fits the original one and overflow: hidden cuts off its corners.
  //
  // Before rotating, the image gets the panel's size with width and height
  // swapped, absolutely centered. Rotated 90°/270°, that swapped box fits
  // the panel exactly. 180° keeps the orientation, so it needs no adjustment.
  function feedRotateStyle(rotation: number, containerW: number, containerH: number): string {
    if (rotation === 90 || rotation === 270) {
      if (!containerW || !containerH) return `transform: rotate(${rotation}deg);`;
      return `position: absolute; top: 50%; left: 50%; width: ${containerH}px; height: ${containerW}px; transform: translate(-50%, -50%) rotate(${rotation}deg);`;
    }
    if (rotation === 180) return `transform: rotate(180deg);`;
    return '';
  }

  // ---------------------------------------------------------------------------
  // WB SAMPLING — click-to-neutralize
  // Reads a 3×3 pixel block from the blob-URL preview image via an offscreen
  // canvas (same-origin: no CORS issue with blob URLs).
  // ---------------------------------------------------------------------------
  function samplePixel(imgEl: HTMLImageElement, event: MouseEvent): [number, number, number] | null {
    if (!imgEl || !imgEl.naturalWidth) return null;
    const rect = imgEl.getBoundingClientRect();
    const cx = Math.round(((event.clientX - rect.left) / rect.width) * imgEl.naturalWidth);
    const cy = Math.round(((event.clientY - rect.top) / rect.height) * imgEl.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imgEl, 0, 0);
    // Average a 3×3 block for robustness against noise
    const x0 = Math.max(0, cx - 1);
    const y0 = Math.max(0, cy - 1);
    const w = Math.min(3, imgEl.naturalWidth - x0);
    const h = Math.min(3, imgEl.naturalHeight - y0);
    const data = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0;
    const count = w * h;
    for (let i = 0; i < count; i++) {
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
    }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  }

  function handleWbSampleClick(cameraIndex: number, event: MouseEvent) {
    const sampling = $wbSamplingStore;
    if (!sampling.active || sampling.cameraIndex !== cameraIndex) return;
    const imgEl = cameraIndex === 0 ? imgEl0 : imgEl1;
    if (!imgEl) return;
    const pixel = samplePixel(imgEl, event);
    if (pixel) {
      sampling.onSample?.(pixel[0], pixel[1], pixel[2]);
    }
    // Deactivate regardless so we don't get stuck
    wbSamplingStore.set({ active: false, cameraIndex: 0, onSample: null });
  }

  // null while polling is paused.
  let previewInterval: ReturnType<typeof setInterval> | null = null;

  // true while the tab is visible — polling pauses when the user switches
  // tabs, to save resources on the Raspberry Pi.
  let previewActive = $state(true);

  // One fetch in flight per camera, so requests never overlap.
  let fetchingPreview: Record<number, boolean> = { 0: false, 1: false };

  // Consecutive preview errors — the reconnect banner shows after 3.
  let previewErrorCount = $state(0);
  let previewConnectError = $derived(previewErrorCount >= 3);

  // A single missing camera (404 on its last preview fetch, NEH-229).
  // Separate from previewConnectError: 404 is deliberately left out of the
  // error counter because the backend returns it when the camera is not
  // connected or its frame could not be captured, not when the backend is
  // down — but per camera it still drives an overlay on that camera's feed.
  // This overlay follows continuous polling, outside cameraRefresh. A 404
  // from before reconnect can briefly restore it after reconnect succeeds;
  // the next successful frame clears it. Unlike the dashboard, a 404 here
  // does not stop polling.
  let cameraMissing = $state<Record<number, boolean>>({});

  function getApiBase(): string {
    if (!browser) return 'http://localhost:8000';
    return env.PUBLIC_API_BASE || 'http://localhost:8000';
  }

  function getAuthHeader(): HeadersInit {
    const token = tokenStore.get();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // Calls GET /cameras/preview/{cameraIndex} (the endpoint is in the
  // backend's cameras.py). A 404 does not count toward the reconnect banner.
  // The previous object URL is revoked so frames do not leak memory.
  async function fetchPreview(cameraIndex: number) {
    if (fetchingPreview[cameraIndex] || !previewActive) return;

    fetchingPreview[cameraIndex] = true;
    try {
      const response = await fetch(
        `${getApiBase()}/cameras/preview/${cameraIndex}`,
        { headers: getAuthHeader() }
      );

      if (response.ok) {
        const blob = await response.blob();
        const newUrl = URL.createObjectURL(blob);

        if (previewUrls[cameraIndex]) {
          URL.revokeObjectURL(previewUrls[cameraIndex]);
        }

        previewUrls = { ...previewUrls, [cameraIndex]: newUrl };
        previewErrorCount = 0;  // reset on success
        if (cameraMissing[cameraIndex]) {
          cameraMissing = { ...cameraMissing, [cameraIndex]: false };
        }
      } else if (response.status === 404) {
        // 404: the camera is not connected or its frame could not be
        // captured. It does not count as an error, but it shows in the
        // per-camera overlay (NEH-229).
        cameraMissing = { ...cameraMissing, [cameraIndex]: true };
      } else {
        // Other errors (500, etc.) count toward the banner.
        previewErrorCount += 1;
      }
    } catch {
      // A network error counts toward the reconnect banner.
      previewErrorCount += 1;
    } finally {
      fetchingPreview[cameraIndex] = false;
    }
  }

  // Called by the `$effect` below (on mount and whenever cameraMode changes)
  // and when the tab becomes visible again. Clears the previous interval
  // before creating a new one.
  function startPreviewPolling() {
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }

    // Fetch at once rather than waiting for the first interval.
    fetchPreview(0);
    if (cameraMode === 'double') fetchPreview(1);

    previewInterval = setInterval(() => {
      fetchPreview(0);
      if (cameraMode === 'double') fetchPreview(1);
    }, PREVIEW_INTERVAL_MS);
  }

  // Polling pauses while the tab is hidden, to save resources on the
  // Raspberry Pi.
  function handleVisibilityChange() {
    previewActive = !document.hidden;
    if (previewActive) {
      startPreviewPolling();
    } else {
      if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
      }
      // NEH-228: also releases the held-key latch — one of the two recovery
      // paths for a keyup that never arrives.
      clearChordLatch();
    }
  }

  onMount(() => {
    // Only the visibility listener is registered here. startPreviewPolling()
    // is called from the `$effect` below, which also runs on mount; calling
    // it here as well would start two polling cycles.
    if (browser) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  // Restart polling when the camera mode changes (e.g. from single to double,
  // so camera 1 is fetched as well).
  $effect(() => {
    const _mode = cameraMode; // read to subscribe the effect to cameraMode
    startPreviewPolling();
  });

  onDestroy(() => {
    if (previewInterval) clearInterval(previewInterval);

    Object.values(previewUrls).forEach(url => {
      try { URL.revokeObjectURL(url); } catch {}
    });

    if (browser) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  // Zoom is a CSS transform on the feeds wrapper — a visual adjustment of the
  // viewport that does not affect the camera. Camera zoom (ScalerCrop) is the
  // Zoom slider in CameraControls.
  function zoomIn()    { zoom = Math.min(zoom + 0.2, 3); }
  function zoomOut()   { zoom = Math.max(zoom - 0.2, 0.5); }
  function resetZoom() { zoom = 1; }

  // ---------------------------------------------------------------------------
  // DRAGGABLE GUIDES
  // ---------------------------------------------------------------------------
  // Pointer events, not mouse events: the device is operated by finger, and a
  // finger drag fires no mousedown/mousemove, so mouse handlers cannot move
  // the guides on the hardware they are made for (NEH-156). Pointer events
  // cover finger, stylus and mouse with the same code.
  //
  // The guide captures the pointer when grabbed, so the drag continues even
  // when the finger leaves the 24px strip — which is normal while dragging.
  // That is why the move and release handlers live on the guide itself, not
  // on the viewport.
  function startDrag(guide: 'v' | 'h', e: PointerEvent) {
    dragging = guide;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleGuideMove(e: PointerEvent) {
    if (!dragging || !viewportEl) return;
    const rect = viewportEl.getBoundingClientRect();
    if (dragging === 'v') {
      guideV = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    } else {
      guideH = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    }
  }

  function stopDrag() { dragging = null; }

  async function handleCapture() {
    if (isCapturing || !canCapture) return;
    isCapturing = true;

    try {
      const payload = {
        project_name: projectName,
        collection_id: collectionId || undefined,
        record_title: defaultRecordTitle(),
      };

      let result;
      if (cameraMode === 'double') {
        result = await camerasApi.captureDual({
          ...payload,
          left_camera_index: leftIdx,
          rotate_deg_cam0: rotateDeg[0] ?? 0,
          rotate_deg_cam1: rotateDeg[1] ?? 0,
        });
      } else {
        result = await camerasApi.capture({ ...payload, camera_index: 0, rotate_deg: rotateDeg[0] ?? 0 });
      }

      if (!result.success) {
        // The backend's `error` is English; captureErrorText turns it into
        // the catalogue's message below.
        throw new CaptureFailed(result.error);
      }

      // The flash fires only once the backend has confirmed the capture: it
      // is the only success signal the operator sees, and if it always fired,
      // a failed capture would look identical to a good one and the page
      // would be lost unnoticed until review or export (NEH-72).
      captureFlash = true;
      setTimeout(() => { captureFlash = false; }, 150);

      cameraStatus.reportSuccess();
      onCaptureDone();

    } catch (error) {
      console.error('[LiveViewport] Capture error:', error);
      if (isConflict(error) && onStemRefused && (await onStemRefused())) {
        // The needs-stem banner says why, in the catalogue's words; the
        // backend's English text is not shown.
        return;
      }
      // Every backend error is English; the operator sees the catalogue's
      // message for it, and the console has the original.
      cameraStatus.reportFailure(captureErrorText(error, $m));
    } finally {
      isCapturing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // CAPTURE KEY — keyboard handling (NEH-228)
  //
  // ownsEvent and shouldTrigger answer different questions and are called
  // separately: ownsEvent decides whether the event belongs to
  // capture (and therefore whether preventDefault is called), regardless of
  // whether this particular press should start a capture. Conflating them
  // lets a held pedal's repeats through to whatever has focus — the first
  // press is cancelled, but every repeat after it activates the focused
  // button instead of the camera.
  // ---------------------------------------------------------------------------

  function ownsEventContext(): OwnsEventContext {
    return {
      chord,
      modalOpen,
      activeElement: browser ? document.activeElement : null,
    };
  }

  function clearChordLatch() {
    chordHeld = false;
    heldCode = null;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (learning) {
      handleLearnKeydown(event);
      return;
    }
    const ctx = ownsEventContext();
    if (!ownsEvent(event, ctx)) return;
    // Whenever the event belongs to capture, not only when it actually
    // starts one: otherwise every repeat after the first goes through to the
    // focused button.
    event.preventDefault();
    if (shouldTrigger(event, { ...ctx, keyHeld: chordHeld, capturing: isCapturing, ready: canCapture })) {
      chordHeld = true;
      // The physical `code` is stored, not `chord.key`: it is the only thing
      // that still identifies this key when the release arrives with the
      // modifiers already up. If the event carries no usable `code`,
      // heldCode stays null and the next keyup of any key releases the latch.
      heldCode = event.code || null;
      handleCapture();
    }
  }

  function handleWindowKeyup(event: KeyboardEvent) {
    if (learning) {
      // The device sent only a modifier and is now releasing it with no
      // other key having arrived with it: tell the operator instead of
      // leaving the control in "assigning" forever.
      if (pendingModifier && event.key === pendingModifier) {
        learnMessage = $m.lv_capture_key_modifier_only(pendingModifier);
        pendingModifier = null;
      }
      return;
    }
    // Compared against the physical `code` that set the latch, not the
    // chord's key; the latch also clears when either side lacks a usable
    // `code`. See the comments on `chordHeld` and `heldCode` above.
    if (!heldCode || !event.code || event.code === heldCode) {
      clearChordLatch();
    }
  }

  function handleLearnKeydown(event: KeyboardEvent) {
    event.preventDefault();
    const result = learnFromEvent(event);
    if (result.ok) {
      chord = result.chord;
      writeChord(chord);
      learning = false;
      pendingModifier = null;
      learnMessage = null;
      return;
    }
    if (result.reason === 'modifier-only') {
      pendingModifier = result.modifier;
      learnMessage = null;
      return;
    }
    // 'unbindable': Dead, Unidentified, or an event in the middle of IME
    // composition.
    learnMessage = $m.lv_capture_key_unbindable;
  }

  function startLearningChord() {
    learning = true;
    pendingModifier = null;
    learnMessage = null;
  }

  // Cancelling is always a visible button, never a key — otherwise a pedal
  // that sends Escape could never be assigned.
  function cancelLearningChord() {
    learning = false;
    pendingModifier = null;
    learnMessage = null;
  }

  function resetChord() {
    clearStoredChord();
    chord = DEFAULT_CHORD;
    cancelLearningChord();
  }

  function closeGridModal() {
    showGridModal = false;
    // Closing the grid settings in the middle of an assignment must not
    // leave the window's next keydown captured by a control that is no
    // longer visible.
    cancelLearningChord();
  }

  function cameraLabel(idx: number): string {
    const dev = devices.find(d => d.index === idx);
    return `${dev?.label || dev?.model || $m.cam_fallback_name} [${idx}]`;
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} onkeyup={handleWindowKeyup} onblur={clearChordLatch} />

<div class="viewport-outer">
  <div class="mat-board" bind:clientWidth={boardW} bind:clientHeight={boardH}>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="camera-viewport"
      class:flash={captureFlash}
      bind:this={viewportEl}
      style={viewportBox.w && viewportBox.h ? `width: ${viewportBox.w}px; height: ${viewportBox.h}px` : undefined}
    >

      <!-- Banners: the volume has no stem, or the last capture failed
           (NEH-72). The capture-error banner clears on the next good capture
           (`reportSuccess`), so it cannot stay up in the middle of a
           sequence. -->
      {#if needsStem && captureReady}
        <div class="needs-stem-banner" role="alert">
          <span class="material-symbols-outlined icon-sm" aria-hidden="true">warning</span>
          <span>{$m.lv_needs_stem}</span>
          {#if stemFormHref}
            <a class="needs-stem-link" href={stemFormHref}>{$m.lv_needs_stem_link}</a>
          {/if}
        </div>
      {:else if $cameraStatus.captureError}
        <div class="capture-error-banner" role="alert">
          <span class="material-symbols-outlined icon-sm">error</span>
          <!-- `||`, not `??`: an empty message must also fall back to the
               catalogue, or the banner shows no text. -->
          {$cameraStatus.errorMessage || $m.lv_capture_error}
        </div>
      {/if}

      {#if previewConnectError}
        <div class="reconnect-banner" class:stacked={$cameraStatus.captureError}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          {$m.lv_reconnecting}
        </div>
      {/if}

      <div class="camera-feeds-wrapper" style="transform: scale({zoom})">

        <div class="camera-feed" bind:clientWidth={feedW0} bind:clientHeight={feedH0} style="flex-grow: {leftFeedAspect}">
          {#if previewUrls[leftIdx]}
            <img
              bind:this={imgEl0}
              bind:naturalWidth={naturalW0}
              bind:naturalHeight={naturalH0}
              src={previewUrls[leftIdx]}
              alt={$m.lv_camera_left_alt}
              class="feed-img"
              style={feedRotateStyle(rotateDeg[leftIdx] ?? 0, feedW0, feedH0)}
              onload={() => { if (imgEl0) histogramStore.update(s => ({ ...s, [leftIdx]: computeHistogram(imgEl0!) })); }}
            />
            <!-- WB sampling overlay: visible only when picker is active for this camera -->
            {#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === leftIdx}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="wb-sample-overlay"
                onclick={(e) => handleWbSampleClick(leftIdx, e)}
                title={$m.lv_wb_click_hint}
              ></div>
            {/if}
          {:else if !cameraMissing[leftIdx]}
            <!-- No signal yet, or waiting for the first frame. Omitted when
                 the camera is marked missing: the NEH-229 notice says the same
                 with the concrete instruction, and both would sit in the
                 center of the feed. -->
            <div class="no-stream">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span>{$m.lv_no_signal_left}</span>
              <small>{$m.lv_check_hw}</small>
            </div>
          {/if}
          <!-- The camera returned 404 on its last fetch (NEH-229). -->
          {#if cameraMissing[leftIdx]}
            <div class="camera-missing" role="status">{$m.lv_camera_missing}</div>
          {/if}
          <div class="feed-label">{cameraLabel(leftIdx)}</div>
          <!-- Floating rotation overlay -->
          <div class="feed-rotate-overlay">
            <button class="feed-rotate-btn" onclick={() => stepRotation(leftIdx, -90)} aria-label={$m.lv_rotate_ccw} title={$m.lv_rotate_ccw}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
            <span class="feed-rotate-deg">{(rotateDeg ?? {})[leftIdx] ?? 0}°</span>
            <button class="feed-rotate-btn" onclick={() => stepRotation(leftIdx, 90)} aria-label={$m.lv_rotate_cw} title={$m.lv_rotate_cw}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
              </svg>
            </button>
          </div>
        </div>

        {#if cameraMode === 'double'}
          <div class="camera-feed" bind:clientWidth={feedW1} bind:clientHeight={feedH1} style="flex-grow: {rightFeedAspect}">
            {#if previewUrls[rightIdx]}
              <img
                bind:this={imgEl1}
                bind:naturalWidth={naturalW1}
                bind:naturalHeight={naturalH1}
                src={previewUrls[rightIdx]}
                alt={$m.lv_camera_right_alt}
                class="feed-img"
                style={feedRotateStyle(rotateDeg[rightIdx] ?? 0, feedW1, feedH1)}
                onload={() => { if (imgEl1) histogramStore.update(s => ({ ...s, [rightIdx]: computeHistogram(imgEl1!) })); }}
              />
              {#if $wbSamplingStore.active && $wbSamplingStore.cameraIndex === rightIdx}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="wb-sample-overlay"
                  onclick={(e) => handleWbSampleClick(rightIdx, e)}
                  title={$m.lv_wb_click_hint}
                ></div>
              {/if}
            {:else if !cameraMissing[rightIdx]}
              <!-- No signal yet, or waiting for the first frame. Omitted when
                   the camera is marked missing: the NEH-229 notice says the
                   same with the concrete instruction, and both would sit in
                   the center of the feed. -->
              <div class="no-stream">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>{$m.lv_no_signal_right}</span>
                <small>{$m.lv_check_hw}</small>
              </div>
            {/if}
            <!-- The camera returned 404 on its last fetch (NEH-229). -->
            {#if cameraMissing[rightIdx]}
              <div class="camera-missing" role="status">{$m.lv_camera_missing}</div>
            {/if}
            <div class="feed-label right">{cameraLabel(rightIdx)}</div>
            <!-- Floating rotation overlay -->
            <div class="feed-rotate-overlay">
              <button class="feed-rotate-btn" onclick={() => stepRotation(rightIdx, -90)} aria-label={$m.lv_rotate_ccw} title={$m.lv_rotate_ccw}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
              <span class="feed-rotate-deg">{(rotateDeg ?? {})[rightIdx] ?? 0}°</span>
              <button class="feed-rotate-btn" onclick={() => stepRotation(rightIdx, 90)} aria-label={$m.lv_rotate_cw} title={$m.lv_rotate_cw}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            </div>
          </div>
        {/if}

      </div>

      {#if showGrid}
        {#each Array.from({length: gridCols - 1}, (_, i) => i) as i}
          <div class="grid-line vertical" style="left: {(i+1) * (100/gridCols)}%"></div>
        {/each}
        {#each Array.from({length: gridRows - 1}, (_, i) => i) as i}
          <div class="grid-line horizontal" style="top: {(i+1) * (100/gridRows)}%"></div>
        {/each}
      {/if}

      {#if showGuides}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="guide vertical"
          style="left: {guideV}%"
          onpointerdown={(e) => startDrag('v', e)}
          onpointermove={handleGuideMove}
          onpointerup={stopDrag}
          onpointercancel={stopDrag}
        >
          <div class="guide-line"></div>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="guide horizontal"
          style="top: {guideH}%"
          onpointerdown={(e) => startDrag('h', e)}
          onpointermove={handleGuideMove}
          onpointerup={stopDrag}
          onpointercancel={stopDrag}
        >
          <div class="guide-line"></div>
        </div>
      {/if}

      <div class="metadata-bar">
        <div class="metadata-values">
          <span>ISO {iso}</span>
          <span>{shutterSpeed}</span>
          <span>f/{aperture}</span>
          <span>50mm</span>
        </div>
      </div>

    </div><!-- /camera-viewport -->

    <div class="floating-controls" class:collapsed={!controlsOpen}>
      <button
        class="float-btn float-btn-toggle"
        onclick={() => controlsOpen = !controlsOpen}
        aria-expanded={controlsOpen}
        aria-label={controlsOpen ? $m.lv_controls_collapse : $m.lv_controls_expand}
        title={controlsOpen ? $m.lv_controls_collapse : $m.lv_controls_expand}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if controlsOpen}
            <path d="M9 18l6-6-6-6"/>
          {:else}
            <path d="M15 18l-6-6 6-6"/>
          {/if}
        </svg>
      </button>
      {#if controlsOpen}
        <div class="float-divider"></div>
        <button class="float-btn" onclick={zoomIn} aria-label={$m.lv_zoom_in} title={$m.lv_zoom_in}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button class="float-btn" onclick={zoomOut} aria-label={$m.lv_zoom_out} title={$m.lv_zoom_out}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button class="float-btn" onclick={resetZoom} aria-label={$m.col_fit_screen_aria} title={$m.col_fit_screen_aria}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
        <div class="float-divider"></div>
        <button class="float-btn" onclick={() => showGridModal = true} aria-label={$m.lv_grid_settings} title={$m.lv_grid_settings}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </button>
        {#if cameraMode === 'double'}
          <div class="float-divider"></div>
          <button
            class="float-btn"
            class:float-btn-active={swapped}
            onclick={() => swapped = !swapped}
            aria-label={$m.lv_swap_orientation}
            title={swapped ? $m.lv_orientation_swapped : $m.lv_orientation_normal}
          >
            <span class="material-symbols-outlined" style="font-size:22px">swap_horiz</span>
          </button>
        {/if}
      {/if}
    </div>

    <div class="capture-btn-wrapper">
      <button
        class="capture-btn"
        class:capturing={isCapturing}
        onclick={handleCapture}
        disabled={isCapturing || !canCapture}
        title={!captureReady ? $m.lv_capture_not_ready : needsStem ? $m.lv_needs_stem : undefined}
        aria-label={$m.lv_capture_btn}
      >
        <div class="capture-ring outer"></div>
        <div class="capture-ring middle"></div>
        <div class="capture-circle"></div>
      </button>
    </div>

  </div><!-- /mat-board -->
</div><!-- /viewport-outer -->

{#if showGridModal}
  <!-- No Escape while a key is being assigned: a pedal may send Escape. -->
  <div class="modal-backdrop" use:dismissible={{ onDismiss: closeGridModal, escape: !learning }}>
    <div class="modal-card dialog-fit" role="dialog" aria-modal="true" aria-labelledby="grid-modal-title">
      <h3 class="modal-title" id="grid-modal-title">{$m.lv_grid_modal_title}</h3>
      <p class="modal-subtitle">{$m.lv_grid_modal_subtitle}</p>
      <div class="modal-body">
        <div class="modal-toggle-row">
          <div>
            <p class="modal-toggle-title">{$m.lv_grid}</p>
            <p class="modal-toggle-sub">{$m.lv_grid_desc}</p>
          </div>
          <button class="toggle-btn" class:on={showGrid} onclick={() => showGrid = !showGrid}>
            <div class="toggle-thumb" class:on={showGrid}></div>
          </button>
        </div>
        <div class="modal-toggle-row">
          <div>
            <p class="modal-toggle-title">{$m.lv_guides}</p>
            <p class="modal-toggle-sub">{$m.lv_guides_desc}</p>
          </div>
          <button class="toggle-btn" class:on={showGuides} onclick={() => showGuides = !showGuides}>
            <div class="toggle-thumb" class:on={showGuides}></div>
          </button>
        </div>

        <!-- NEH-228: the capture key — assigned once and stored in this
             browser. -->
        <div class="modal-toggle-row capture-key-row">
          <div>
            <p class="modal-toggle-title">{$m.lv_capture_key_current(describeChord(chord, $m.lv_capture_key_space))}</p>
            <p class="modal-toggle-sub">{$m.lv_capture_key_desc}</p>
          </div>
          <div class="capture-key-buttons">
            {#if learning}
              <button class="capture-key-btn" onclick={cancelLearningChord}>{$m.common_cancel}</button>
            {:else}
              <button class="capture-key-btn" onclick={startLearningChord}>{$m.lv_capture_key_learn}</button>
            {/if}
            <button class="capture-key-btn" onclick={resetChord}>{$m.lv_capture_key_reset}</button>
          </div>
        </div>
        {#if learning}
          <p class="modal-toggle-sub capture-key-status" role="status">{$m.lv_capture_key_learning}</p>
        {/if}
        {#if learnMessage}
          <p class="modal-toggle-sub capture-key-status" role="alert">{learnMessage}</p>
        {/if}
        <p class="modal-toggle-sub capture-key-note">{$m.lv_capture_key_note}</p>
      </div>
      <div class="modal-actions">
        <button class="modal-btn confirm" onclick={closeGridModal}>{$m.common_close}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .viewport-outer {
    flex: 1;
    position: relative;
    background-color: var(--color-bg);
    overflow: hidden;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .mat-board {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: #2c2920;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
  }

  /* Failed-capture banner — the same visual language as the reconnect
     banner, but opaque and without the pulse: it is a state that calls for
     action, not a wait. z-index 60 puts it above everything drawn in the
     viewport (guides and overlays go up to 50), so it is not hidden while
     the operator has the framing guides on. */
  .capture-error-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 80%;
    padding: 8px 16px;
    background: rgba(190, 45, 35, 0.96);
    color: #fff;
    font-size: 0.8rem;
    border-radius: 20px;
    backdrop-filter: blur(4px);
    pointer-events: none;
  }

  /* Banner: the volume has no stem. Unlike the error banner, it receives
     clicks: it carries the link to the volume's form. */
  .needs-stem-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 80%;
    padding: 8px 16px;
    background: rgba(30, 30, 30, 0.94);
    border: 1px solid var(--color-highlight);
    color: #fff;
    font-size: 0.8rem;
    border-radius: 20px;
    backdrop-filter: blur(4px);
  }
  .needs-stem-link {
    color: var(--color-highlight);
    font-weight: var(--fw-bold);
    text-decoration: underline;
    white-space: nowrap;
  }

  .reconnect-banner {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    background: rgba(220, 80, 60, 0.88);
    color: #fff;
    font-size: 0.75rem;
    border-radius: 20px;
    backdrop-filter: blur(4px);
    pointer-events: none;
    animation: pulse-opacity 1.5s ease-in-out infinite;
  }

  /* A failed capture and a lost preview connection can show both banners at
     once, both centered at the top: the reconnect banner then moves down so
     it is not hidden under the failed-capture banner. */
  .reconnect-banner.stacked { top: 52px; }

  @keyframes pulse-opacity {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.6; }
  }

  /* width/aspect-ratio are the fallback until the board (.mat-board) is
     first measured — viewportBox is 0x0 on that first tick and the element
     has no inline size yet, so without them it would collapse to 0. Once
     viewportBox is no longer 0x0, the inline size (width/height in px)
     overrides these two rules. max-height: 100% is deliberately absent:
     with width: 100% it would cut the height but not the width and break
     the aspect ratio, and the inline size from fitBox already fits the
     board. */
  .camera-viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background-color: #0a0a0a;
    border: 1px solid rgba(90,140,98,0.2);
    box-shadow: 0 4px 24px rgba(0,0,0,0.6);
    overflow: hidden;
    cursor: crosshair;
  }

  .camera-viewport.flash::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: rgba(255,255,255,0.3);
    z-index: 50;
    pointer-events: none;
    animation: flash 150ms ease;
  }

  @keyframes flash { 0% { opacity: 0.3; } 100% { opacity: 0; } }

  /* Holds the left and right panels side by side. In double mode each
     panel's flex-grow is set inline from its frame's shape (leftFeedAspect,
     rightFeedAspect). */
  .camera-feeds-wrapper {
    display: flex;
    width: 100%;
    height: 100%;
    transition: transform 0.3s ease;
  }

  .camera-feed {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    border-right: 1px solid rgba(255,255,255,0.06);
  }

  .camera-feed:last-child { border-right: none; }

  /* Missing camera (404 on its last preview fetch, NEH-229) */
  .camera-missing {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 80%;
    background: rgba(19,17,16,0.85);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: var(--radius-md);
    padding: 10px 16px;
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light);
    text-align: center;
    z-index: 6;
    pointer-events: none;
  }

  .feed-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .feed-label {
    position: absolute;
    top: 8px;
    left: 8px;
    background: rgba(19,17,16,0.75);
    backdrop-filter: blur(2px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 14px;
    font-weight: 700;
    color: var(--color-light);
    pointer-events: none;
    z-index: 5;
  }

  .feed-label.right { left: auto; right: 8px; }

  .no-stream {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    opacity: 0.4;
    text-align: center;
    padding: 16px;
  }

  .no-stream span  { font-size: var(--text-base); font-weight: var(--fw-medium); }
  .no-stream small { font-size: var(--text-sm); }

  .grid-line {
    position: absolute;
    pointer-events: none;
    z-index: 20;
    background-color: rgba(0, 210, 255, 0.5);
  }

  .grid-line.vertical   { top: 0; bottom: 0; width: 1px; }
  .grid-line.horizontal { left: 0; right: 0; height: 1px; }

  .guide {
    position: absolute;
    z-index: 30;
    /* Without this the browser treats the gesture as a scroll and takes it
       over: pointer events stop arriving in the middle of the drag. */
    touch-action: none;
  }

  /* 24px, not 16: the strip has to be grabbed with a finger. It stays below
     the 44px touch minimum on purpose — a 44px vertical guide would cover a
     whole column of the image being framed, and unlike a button, a guide is
     visible before it is grabbed and is dragged rather than tapped. */
  .guide.vertical   { top: 0; bottom: 0; width: 24px; margin-left: -12px; cursor: ew-resize; }
  .guide.horizontal { left: 0; right: 0; height: 24px; margin-top: -12px; cursor: ns-resize; }

  .guide-line {
    position: absolute;
    background-color: rgba(220,50,50,0.8);
    transition: background-color var(--transition-fast);
  }

  .guide.vertical   .guide-line { left: 50%; top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
  .guide.horizontal .guide-line { top: 50%; left: 0; right: 0; height: 1px; transform: translateY(-50%); }
  .guide:hover .guide-line { background-color: rgba(255,80,80,1); }

  .metadata-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 32px;
    background-color: #18181b;
    border-top: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    padding: 0 16px;
    z-index: 40;
  }

  .metadata-values {
    display: flex;
    gap: 16px;
    font-family: monospace;
    font-size: 10px;
    color: var(--color-light-grey);
  }

  .floating-controls {
    position: absolute;
    top: 75px; right: 1px;
    z-index: 40;
    background-color: rgba(26,24,21,0.9);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 56px;
    align-items: center;
    /* No scroll on purpose: the panel is sized by its content. It sits inside
       the viewport, which clips any overflow, so any added control has to be
       checked against the space available. */
    transition: width var(--transition-base);
  }

  /* Collapsed: only the toggle button, to give the area back to the feed */
  .floating-controls.collapsed {
    background-color: rgba(26,24,21,0.6);
  }

  .float-btn-toggle { color: var(--color-light); }

  .float-btn {
    /* 44px, not 64: the collection view's rail can afford 64 because it is a
       full-height bar; this panel sits inside the viewport. */
    width: var(--touch-target-min); height: var(--touch-target-min);
    display: flex;
    align-items: center;
    justify-content: center;
    background: none; border: none;
    cursor: pointer;
    color: var(--color-light-grey);
    border-radius: var(--radius-md);
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .float-btn:hover { color: var(--color-primary); background-color: rgba(255,255,255,0.05); }
  .float-btn-active { color: var(--color-primary); }
  .float-btn-active:hover { color: var(--color-primary); }

  .float-divider { width: 32px; height: 1px; background-color: var(--border-color); }

  .capture-btn-wrapper {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
  }

  .capture-btn {
    position: relative;
    width: 60px; height: 60px;
    background: none; border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: opacity var(--transition-fast);
  }

  .capture-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .capture-ring {
    position: absolute;
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .capture-ring.outer  { inset: 0; border: 2px solid rgba(255,255,255,0.6); animation: pulse-ring 2s ease infinite; }
  .capture-ring.middle { width: 52px; height: 52px; border: 1.5px solid rgba(255,255,255,0.3); }

  .capture-circle {
    width: 44px; height: 44px;
    background-color: white;
    border-radius: 50%;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
    transition: transform var(--transition-fast);
    z-index: 1;
  }

  .capture-btn:hover:not(:disabled)  .capture-circle { transform: scale(0.93); }
  .capture-btn:active:not(:disabled) .capture-circle { transform: scale(0.88); }
  .capture-btn.capturing .capture-ring.outer { border-color: var(--color-primary); animation: none; }

  @keyframes pulse-ring {
    0%   { opacity: 1; transform: scale(1); }
    50%  { opacity: 0.7; transform: scale(1.05); }
    100% { opacity: 1; transform: scale(1); }
  }

  /* ── Modal ── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 24px;
  }

  .modal-card {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    padding: 32px 28px;
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow-lg);
  }

  .modal-title    { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0 0 6px; }
  .modal-subtitle { font-size: var(--text-sm); color: var(--color-light-grey); margin: 0 0 24px; }

  .modal-body   { display: flex; flex-direction: column; gap: 20px; margin-bottom: 24px; }

  .modal-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .modal-toggle-title { font-size: var(--text-sm); font-weight: var(--fw-semibold); color: var(--color-light); margin: 0 0 2px; }
  .modal-toggle-sub   { font-size: var(--text-xs); color: var(--color-light-grey); margin: 0; }

  .toggle-btn {
    width: 48px; height: 24px;
    border-radius: var(--radius-full);
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    cursor: pointer;
    position: relative;
    transition: background-color var(--transition-base);
    flex-shrink: 0;
  }

  .toggle-btn.on { background-color: var(--color-primary); border-color: var(--color-primary); }

  .toggle-thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 18px; height: 18px;
    border-radius: 50%;
    background-color: var(--color-light-grey);
    transition: transform var(--transition-base), background-color var(--transition-base);
  }

  .toggle-thumb.on { transform: translateX(24px); background-color: white; }

  /* NEH-228: the capture key row — like .modal-toggle-row, but with two
     buttons instead of a toggle on the right. */
  .capture-key-buttons { display: flex; gap: 8px; flex-shrink: 0; }

  .capture-key-btn {
    padding: 8px 12px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-semibold);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: var(--color-surface-alt);
    color: var(--color-light);
    cursor: pointer;
    transition: background-color var(--transition-fast);
    white-space: nowrap;
  }

  .capture-key-btn:hover { background-color: rgba(255,255,255,0.05); }

  .capture-key-status { color: var(--color-primary); }

  .capture-key-note { margin-top: -8px; }

  .modal-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
  }

  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); box-shadow: 0 4px 12px rgba(90,140,98,0.3); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
</style>
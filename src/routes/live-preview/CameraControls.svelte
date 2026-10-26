<script lang="ts">
  // Left-hand camera panel of the live preview. Its controls apply to the
  // selected camera; in `single` mode that is always camera 0, and in `double`
  // mode the operator picks it from a dropdown. The sections offer only what
  // the backend's capabilities report (picamera2 or a gphoto2 DSLR). The Basic
  // dropdowns are rendered outside the scrolling panel with `position: fixed`,
  // at coordinates taken from their trigger button each time one opens.

  import { onMount } from 'svelte';
  import { createCameraRefresh } from '$lib/camera-refresh';
  import { m } from '$lib/i18n';
  import { camerasApi, AuthError, type CameraDevice, type CameraControlsRequest, type CameraCapabilities, type DSLRSettingsUpdate } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { wbSamplingStore } from '$lib/stores/wbSampling';
  import { histogramStore } from '$lib/stores/histogram';
  import { describeFocusMode } from '$lib/focus-mode';

  let {
    cameraMode,
    shutterSpeed,
    iso,
    aperture,
    onCameraModeChange,
    onShutterSpeedChange,
    onIsoChange,
    onApertureChange,
    onDevicesChange,
    onRotateDegChange,
    rotateDeg = {},
  }: {
    cameraMode: 'single' | 'double';
    shutterSpeed: string;
    iso: string;
    aperture: string;
    onCameraModeChange: (mode: 'single' | 'double') => void;
    onShutterSpeedChange: (value: string) => void;
    onIsoChange: (value: string) => void;
    onApertureChange: (value: string) => void;
    onDevicesChange?: (devices: CameraDevice[]) => void;
    onRotateDegChange?: (cam: number, deg: number) => void;
    rotateDeg?: Record<number, number>;
  } = $props();

  // Index of the camera the panel controls: 0 = left, 1 = right.
  let selectedCameraIndex = $state(0);

  let devices = $state<CameraDevice[]>([]);
  // Writers: onMount, handleWbCalibration, applyPickedWb, rescanCameras.
  // All list results go through cameraRefresh, which publishes local and
  // parent state together. Calibration reloads wait for an active reconnect.
  function publishDevices(list: CameraDevice[]) {
    devices = list;
    onDevicesChange?.(list);
  }
  const cameraRefresh = createCameraRefresh<CameraDevice[]>(publishDevices);

  // Collapsed by default, for the 7" screen.
  let sidebarOpen = $state(false);

  // Lens position in dioptres: 0 = infinity, 10 = 10 cm.
  let lensPosition = $state(0);
  let isFocusing = $state(false);
  let focusDebounce: ReturnType<typeof setTimeout> | null = null;
  let focusResultMsg: string | null = $state(null);
  let focusResultOk: boolean = $state(true);
  let focusResultTimer: ReturnType<typeof setTimeout> | null = null;

  // Zoom per-camera (1.0 = full sensor, 4.0 = 4× ScalerCrop)
  let cameraZoom = $state<Record<number, number>>({ 0: 1, 1: 1 });
  let zoomDebounce: ReturnType<typeof setTimeout> | null = null;

  // Shutter speed and ISO per-camera (manual mode only)
  let cameraShutter = $state<Record<number, string>>({ 0: '1/125s', 1: '1/125s' });
  let cameraIso     = $state<Record<number, string>>({ 0: '100',    1: '100'    });

  // Backend capabilities (loaded on mount alongside devices)
  let capabilities = $state<CameraCapabilities | null>(null);
  // Set when the capabilities request fails, typically a 503 while the
  // capture system is down. Without capabilities the panel cannot tell a
  // DSLR rig from a picamera2 one, so it shows the failure in place of the
  // controls rather than guessing and offering the wrong options.
  let capabilitiesFailed = $state(false);

  // Derived capability flags
  const isDSLR          = $derived(capabilities?.dslr_settings === true);
  const hasFocusControl = $derived(capabilities?.focus_control === true);
  const hasLiveControls = $derived(capabilities?.live_controls === true);

  // DSLR-specific per-camera state
  let cameraDslrAperture = $state<Record<number, string>>({ 0: '5.6', 1: '5.6' });
  let cameraDslrFormat   = $state<Record<number, string>>({ 0: 'JPEG', 1: 'JPEG' });
  let cameraFocusMode    = $state<Record<number, string | undefined>>({});
  let dslrSettingsSeq = 0;

  // Per-camera rotation lives in the page (NEH-71): this panel keeps no copy
  // of its own, only reads the `rotateDeg` prop and reports steps upward, so
  // it never drifts from the `LiveViewport` overlay.
  function stepRotation(delta: number) {
    const idx = selectedCameraIndex;
    const current = rotateDeg[idx] ?? 0;
    const next = ((current + delta) % 360 + 360) % 360;
    onRotateDegChange?.(idx, next);
  }

  // WB calibration state
  let isWbCalibrating = $state(false);
  let wbResultMsg: string | null = $state(null);
  let wbResultOk: boolean = $state(true);
  let wbResultTimer: ReturnType<typeof setTimeout> | null = null;

  // WB picker (click-to-neutralize) state
  let isWbPickerActive = $state(false);

  // Deactivate picker if the store is cleared externally (e.g. Escape)
  $effect(() => {
    if (!$wbSamplingStore.active) {
      isWbPickerActive = false;
    }
  });

  const selectedDevice = $derived(devices.find(d => d.index === selectedCameraIndex));
  const cameraDisplayName = $derived(
    selectedDevice
      ? `${selectedDevice.label || selectedDevice.model || $m.cam_fallback_name} [${selectedCameraIndex}]`
      : `${$m.cam_fallback_name} ${selectedCameraIndex}`
  );

  let openSections = $state(['basic', 'focus', 'settings', 'histogram']);

  let showCameraDropdown = $state(false);

  // The open Basic dropdown; only one is open at a time.
  let openDropdown = $state<'shutter' | 'iso' | 'aperture' | 'format' | null>(null);

  // Viewport coordinates of the open Basic dropdown, recalculated each time
  // one opens (see `openBasicDropdown`).
  let dropdownPos = $state({ top: 0, left: 0, width: 0 });

  // References to the dropdown trigger buttons of Basic
  let shutterBtnEl = $state<HTMLElement | null>(null);
  let isoBtnEl     = $state<HTMLElement | null>(null);
  let apertureBtnEl = $state<HTMLElement | null>(null);
  let formatBtnEl  = $state<HTMLElement | null>(null);

  let temperature = $state(0);   // -100 to +100
  let tint = $state(0);          // -100 to +100
  let exposure = $state(0);      // -3 to +3

  // Shutter speed options useful for scanning (fixed lighting, no motion)
  const shutterOptions = ['1/1000s','1/500s','1/250s','1/125s','1/60s','1/30s','1/15s','1/8s','1/4s','1/2s','1s','1.6s','2s','3.2s','4s'];
  // ISO options: keep low for archival quality (IMX519 analogue gain max ≈ 16× = ISO 1600)
  const isoOptions     = ['100','200','400','800','1600'];
  const apertureOptions = ['1.4','2.0','2.8','4.0','5.6','8.0','11.0','13.0','16.0','22.0'];

  // DSLR shutter options — PTP format (no 's' suffix, Canon EOS 1500D range)
  const dsrlShutterOptions = ['1/2000','1/1000','1/500','1/250','1/125','1/60','1/30','1/15','1/8','1/4','1/2','1','2','4'];
  // DSLR ISO options (Canon EOS 1500D)
  const dsrlIsoOptions = ['100','200','400','800','1600','3200','6400','12800'];
  // DSLR aperture options (common values — camera will reject unsupported ones)
  const dsrlApertureOptions = ['3.5','4.0','4.5','5.0','5.6','6.3','7.1','8','9','10','11','13','16','18','20','22'];
  // DSLR image format options
  const dsrlFormatOptions = ['JPEG','RAW','RAW+JPEG'];

  // The Basic dropdowns sit outside the panel with `position: fixed`, so the
  // scrolling panel does not clip them; each opens below its trigger button.
  function openBasicDropdown(which: 'shutter' | 'iso' | 'aperture' | 'format') {
    if (openDropdown === which) {
      openDropdown = null;
      return;
    }

    const btnEl = which === 'shutter'  ? shutterBtnEl
                : which === 'iso'      ? isoBtnEl
                : which === 'aperture' ? apertureBtnEl
                : formatBtnEl;

    if (btnEl) {
      const rect = btnEl.getBoundingClientRect();
      dropdownPos = {
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      };
    }
    openDropdown = which;
  }

  function toggleSection(section: string) {
    openSections = openSections.includes(section)
      ? openSections.filter(s => s !== section)
      : [...openSections, section];
  }

  function showFocusResult(ok: boolean, msg: string) {
    focusResultOk = ok;
    focusResultMsg = msg;
    if (focusResultTimer) clearTimeout(focusResultTimer);
    focusResultTimer = setTimeout(() => { focusResultMsg = null; }, 5000);
  }

  async function handleAutoFocus() {
    const idx = selectedCameraIndex;
    try {
      isFocusing = true;
      const result = await camerasApi.calibrate({ camera_index: idx });
      if (result.success && result.lens_position != null) {
        lensPosition = result.lens_position;
        cameraStatus.reportSuccess();
        showFocusResult(true, $m.cam_focus_result(result.lens_position));
      } else {
        const msg = result.error ?? $m.cam_af_failed;
        cameraStatus.reportFailure(msg);
        showFocusResult(false, msg);
      }
    } catch (error) {
      const msg = $m.cam_af_error;
      cameraStatus.reportFailure(msg);
      showFocusResult(false, msg);
    } finally {
      isFocusing = false;
    }
  }

  function showWbResult(ok: boolean, msg: string) {
    wbResultOk = ok;
    wbResultMsg = msg;
    if (wbResultTimer) clearTimeout(wbResultTimer);
    wbResultTimer = setTimeout(() => { wbResultMsg = null; }, 5000);
  }

  async function handleWbCalibration() {
    const idx = selectedCameraIndex;
    try {
      isWbCalibrating = true;
      const result = await camerasApi.calibrateWhiteBalance({ camera_index: idx });
      if (result.success) {
        // Refresh device list so selectedDevice.awb_gains picks up new values
        await cameraRefresh.read(() => camerasApi.listDevices());
        // Reset sliders to neutral; the new baseGains already encodes the calibrated WB
        temperature = 0;
        tint = 0;
        // Apply the calibrated gains immediately
        if (result.awb_gains && result.awb_gains.length >= 2) {
          try {
            await camerasApi.setCameraControls(idx, {
              awb_enable: false,
              colour_gains: [result.awb_gains[0], result.awb_gains[1]]
            });
          } catch { /* ignore */ }
        }
        const tempLabel = result.colour_temperature ? ` (~${result.colour_temperature}K)` : '';
        cameraStatus.reportSuccess();
        showWbResult(true, $m.cam_wb_calibrated(tempLabel));
      } else {
        const msg = result.error ?? $m.cam_wb_failed;
        cameraStatus.reportFailure(msg);
        showWbResult(false, msg);
      }
    } catch {
      const msg = $m.cam_wb_error;
      cameraStatus.reportFailure(msg);
      showWbResult(false, msg);
    } finally {
      isWbCalibrating = false;
    }
  }

  // WB picker (click to neutralize). Puts `LiveViewport` into sampling mode.
  // When the operator clicks a white or neutral area, the gain correction is
  // computed and saved to the camera registry.
  //
  // Formula: neutral_gray = (R+G+B)/3
  //   new_red_gain  = baseGains[0] * (gray / R)
  //   new_blue_gain = baseGains[1] * (gray / B)
  // This corrects the difference between the observed colour and neutral
  // grey, relative to the stored calibration gains.
  function handleWbPicker() {
    if (isWbPickerActive) {
      // Toggle off — cancel sampling
      wbSamplingStore.set({ active: false, cameraIndex: 0, onSample: null });
      isWbPickerActive = false;
      return;
    }
    isWbPickerActive = true;
    wbSamplingStore.set({
      active: true,
      cameraIndex: selectedCameraIndex,
      onSample: (r: number, g: number, b: number) => applyPickedWb(r, g, b),
    });
  }

  async function applyPickedWb(r: number, g: number, b: number) {
    isWbPickerActive = false;
    const idx = selectedCameraIndex;

    if (r === 0 && b === 0) {
      showWbResult(false, $m.cam_wb_invalid_pixel);
      return;
    }
    const gray = (r + g + b) / 3;
    const safeR = Math.max(r, 1);
    const safeB = Math.max(b, 1);
    const newRed  = Math.max(0.1, Math.min(8.0, baseGains[0] * (gray / safeR)));
    const newBlue = Math.max(0.1, Math.min(8.0, baseGains[1] * (gray / safeB)));
    const gains: [number, number] = [newRed, newBlue];

    try {
      isWbCalibrating = true;
      // Apply to camera immediately so preview updates
      await camerasApi.setCameraControls(idx, { awb_enable: false, colour_gains: gains });
      // Persist to registry
      const result = await camerasApi.commitWhiteBalance(idx, gains);
      if (result.success) {
        await cameraRefresh.read(() => camerasApi.listDevices());
        temperature = 0;
        tint = 0;
        cameraStatus.reportSuccess();
        showWbResult(true, $m.cam_wb_sampled(newRed.toFixed(2), newBlue.toFixed(2)));
      } else {
        showWbResult(false, result.error ?? $m.cam_wb_save_error);
      }
    } catch {
      showWbResult(false, $m.cam_wb_apply_error);
    } finally {
      isWbCalibrating = false;
    }
  }

  function handleFocusSlider(value: number) {
    lensPosition = value;
    if (focusDebounce) clearTimeout(focusDebounce);
    focusDebounce = setTimeout(async () => {
      try {
        await camerasApi.setFocus(selectedCameraIndex, value);
      } catch {
        // Fail silently; the preview shows the actual focus.
      }
    }, 150);
  }

  function handleZoomSlider(value: number) {
    cameraZoom = { ...cameraZoom, [selectedCameraIndex]: value };
    if (zoomDebounce) clearTimeout(zoomDebounce);
    zoomDebounce = setTimeout(async () => {
      try {
        await camerasApi.setCameraControls(selectedCameraIndex, { zoom_factor: value });
      } catch {
        // Fail silently.
      }
    }, 150);
  }

  $effect(() => {
    if (cameraMode === 'single') {
      selectedCameraIndex = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // Sync parent display values when the selected camera changes
  // so LiveViewport metadata bar stays up to date.
  // ---------------------------------------------------------------------------
  $effect(() => {
    onShutterSpeedChange(cameraShutter[selectedCameraIndex] ?? '1/125s');
    onIsoChange(cameraIso[selectedCameraIndex] ?? '100');
  });

  $effect(() => {
    const dev = devices.find(d => d.index === selectedCameraIndex);
    if (dev?.lens_position !== undefined) {
      lensPosition = dev.lens_position;
    }
  });

  // ---------------------------------------------------------------------------
  // HELPERS: Settings sliders → camera controls
  // ---------------------------------------------------------------------------

  /** Parse shutter-speed string "1/8000s" or "1.6s" → microseconds integer */
  function parseShutterUs(s: string): number {
    const frac = s.match(/^([\d.]+)\/([\d.]+)s$/);
    if (frac) return Math.round(parseFloat(frac[1]) / parseFloat(frac[2]) * 1_000_000);
    return Math.round(parseFloat(s) * 1_000_000);
  }

  // Debounce timer for live-slider settings
  let settingsDebounce: ReturnType<typeof setTimeout> | null = null;

  /** Send camera controls to the backend (debounced by default 200ms) */
  function applySettings(controls: CameraControlsRequest, debounceMs = 200) {
    if (settingsDebounce) clearTimeout(settingsDebounce);
    settingsDebounce = setTimeout(async () => {
      try {
        await camerasApi.setCameraControls(selectedCameraIndex, controls);
      } catch {
        // Fail silently; the camera may be unavailable.
      }
    }, debounceMs);
  }

  /** Base AWB gains from calibration (fallback to neutral [2.0, 1.5]) */
  const baseGains = $derived<[number, number]>(
    (selectedDevice?.awb_gains && selectedDevice.awb_gains.length >= 2)
      ? [selectedDevice.awb_gains[0], selectedDevice.awb_gains[1]]
      : [2.0, 1.5]
  );

  /** Compute colour_gains from temperature/tint sliders */
  function computeColourGains(temp: number, t: number): [number, number] {
    const tempF = temp * 0.004;   // ±0.4 range over ±100
    const tintF = t   * 0.003;   // ±0.3 range over ±100
    const red  = Math.max(0.1, Math.min(8.0, baseGains[0] * (1 + tempF - tintF)));
    const blue = Math.max(0.1, Math.min(8.0, baseGains[1] * (1 - tempF + tintF)));
    return [red, blue];
  }

  // Only the latest request writes: a slow mount-time failure must not
  // undo the answer that came after a successful reconnect.
  let capabilitiesSeq = 0;
  async function loadCapabilities() {
    const seq = ++capabilitiesSeq;
    try {
      const caps = await camerasApi.getCapabilities();
      if (seq !== capabilitiesSeq) return;
      capabilities = caps;
      capabilitiesFailed = false;
    } catch (err) {
      if (seq !== capabilitiesSeq) return;
      // A dead session already sends the operator to the login screen.
      if (err instanceof AuthError && err.status === 401) return;
      capabilities = null;
      capabilitiesFailed = true;
    }
  }

  onMount(() => {
    void loadCapabilities();
    void cameraRefresh.read(() => camerasApi.listDevices());
  });

  // Reconnect cameras: rescans the USB ports and closes stale sessions
  // (NEH-229). It applies to every backend, not only DSLRs — a camera can
  // disconnect or go to sleep under gphoto2 and picamera2 alike.
  let rescanInFlight = $state(false);
  let rescanError = $state<string | null>(null);

  async function rescanCameras() {
    if (rescanInFlight) return;
    rescanInFlight = true;
    try {
      await cameraRefresh.reconnect(() => camerasApi.rescan());
      rescanError = null;
      // Reconnecting is the remedy the failure message offers, so the
      // capabilities are asked for again once the cameras are back.
      await loadCapabilities();
    } catch (err) {
      if (err instanceof AuthError && err.status === 401) return;
      rescanError = err instanceof Error ? err.message : String(err);
    } finally {
      rescanInFlight = false;
    }
  }

  $effect(() => {
    if (!isDSLR) return;
    const idx = selectedCameraIndex;
    const seq = ++dslrSettingsSeq;
    camerasApi.getDSLRSettings(idx)
      .then(s => {
        // Only the latest response writes the DSLR state; a stale response that
        // arrives late is discarded (the same guard as the dashboard capture).
        if (seq !== dslrSettingsSeq) return;
        if (s.shutter_speed) cameraShutter = { ...cameraShutter, [idx]: s.shutter_speed };
        if (s.iso)           cameraIso     = { ...cameraIso,     [idx]: s.iso };
        if (s.aperture)      cameraDslrAperture = { ...cameraDslrAperture, [idx]: s.aperture };
        if (s.image_format) {
          // Map PTP internal names → user-facing names
          const fmtMap: Record<string, string> = { 'L': 'JPEG', 'RAW': 'RAW', 'RAW + L': 'RAW+JPEG' };
          cameraDslrFormat = { ...cameraDslrFormat, [idx]: fmtMap[s.image_format] ?? s.image_format };
        }
        // Store it even when undefined: a reconnection that loses the value
        // must clear the warning, not keep the last one read (NEH-76).
        cameraFocusMode = { ...cameraFocusMode, [idx]: s.focus_mode };
      })
      .catch(() => {}); // Silent: the camera may not be connected.
  });

  // ---------------------------------------------------------------------------
  // DSLR: helper to apply DSLR settings asynchronously (silent fail)
  // ---------------------------------------------------------------------------
  async function applyDSLRSettingsFn(settings: DSLRSettingsUpdate) {
    try {
      await camerasApi.applyDSLRSettings(selectedCameraIndex, settings);
    } catch {
      // Fail silently; the camera may be unavailable.
    }
  }
</script>

<div class="sidebar-wrapper">

  {#if !sidebarOpen}
    <div class="icon-strip">
      <button class="strip-btn toggle" onclick={() => sidebarOpen = true} aria-label={$m.cam_panel_expand_aria}>
        <svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<circle cx="12" cy="12" r="3" />
									<path
										d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
									/>
								</svg>
      </button>
    </div>

  {:else}

<div class="controls-panel">

  <div class="panel-header">
    <h2 class="panel-title">{$m.cam_panel_title}</h2>
    <button class="collapse-btn" onclick={() => sidebarOpen = false} aria-label={$m.cam_panel_collapse}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
  </div>

  <div class="panel-body">

    <div class="camera-mode-row">
      <label class="radio-label">
        <div class="radio-circle" class:active={cameraMode === 'single'} style="border-color: {cameraMode === 'single' ? 'var(--color-light)' : 'var(--color-light-grey)'}">
          {#if cameraMode === 'single'}<div class="radio-dot" style="background: var(--color-light)"></div>{/if}
        </div>
        <span style="color: {cameraMode === 'single' ? 'var(--color-light)' : 'var(--color-light-grey)'}; font-size: 12px;">{$m.cam_mode_single}</span>
        <input type="radio" style="display:none" checked={cameraMode === 'single'} onchange={() => onCameraModeChange('single')} />
      </label>

      <label class="radio-label">
        <div class="radio-circle" style="border-color: {cameraMode === 'double' ? 'var(--color-primary)' : 'var(--color-light-grey)'}">
          {#if cameraMode === 'double'}<div class="radio-dot" style="background: var(--color-primary)"></div>{/if}
        </div>
        <span style="color: {cameraMode === 'double' ? 'var(--color-light)' : 'var(--color-light-grey)'}; font-size: 12px;">{$m.cam_mode_double}</span>
        <input type="radio" style="display:none" checked={cameraMode === 'double'} onchange={() => onCameraModeChange('double')} />
      </label>
    </div>

    <div class="relative">
      <button
        class="camera-selector"
        onclick={() => cameraMode === 'double' && (showCameraDropdown = !showCameraDropdown)}
        style="cursor: {cameraMode === 'double' ? 'pointer' : 'default'}"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span class="camera-name">
          {cameraDisplayName}
        </span>
        {#if selectedDevice?.calibrated}
          <span class="cal-dot" title={$m.cam_calibrated}>✓</span>
        {/if}
        {#if cameraMode === 'double'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        {/if}
      </button>

      {#if showCameraDropdown && cameraMode === 'double'}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="fixed-backdrop" onclick={() => showCameraDropdown = false}></div>
        <div class="camera-dropdown">
          {#each devices as device}
            <button
              class="camera-option"
              class:selected={selectedCameraIndex === device.index}
              onclick={() => { selectedCameraIndex = device.index; showCameraDropdown = false; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              {`${device.label || device.model || $m.cam_fallback_name} [${device.index}]`}
              {#if device.calibrated}
                <span class="cal-dot" title={$m.cam_calibrated}>✓</span>
              {/if}
            </button>
          {/each}
          {#if devices.length === 0}
            <div class="camera-option" style="opacity:0.5; cursor:default">{$m.cam_none_detected}</div>
          {/if}
        </div>
      {/if}
    </div>

    <div class="camera-status-row">
      <span class="status-dot" class:dot-connected={selectedDevice !== undefined} class:dot-disconnected={selectedDevice === undefined}></span>
      {#if selectedDevice !== undefined}
        <span class="status-label">{$m.cam_connected}</span>
      {:else}
        <span class="status-label status-warn">{$m.camera_not_detected}</span>
      {/if}
    </div>

    <!-- ── Reconnect cameras (NEH-229) ── -->
    <div class="reconnect-row">
      <button class="btn-reconnect" disabled={rescanInFlight} onclick={rescanCameras}>
        {$m.cam_reconnect}
      </button>
      {#if rescanError}
        <p class="text-error focus-result-msg">{$m.cam_reconnect_error}: {rescanError}</p>
      {/if}
    </div>

    <div class="accordion-block">
      <button
        class="accordion-trigger"
        onclick={() => toggleSection('basic')}
      >
        <div class="acc-left">
          <span>{$m.cam_section_basic}</span>
          <span class="info-wrap" title={$m.cam_section_basic_info} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('basic')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('basic')}
        <div class="accordion-content">

          <div class="control-row">
            <span class="control-label">{$m.cam_orientation}</span>
            <div class="orientation-row">
              <button class="rotate-step-btn" onclick={() => stepRotation(-90)} aria-label={$m.cam_rotate_ccw}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
              </button>
              <span class="orientation-label">{rotateDeg[selectedCameraIndex] ?? 0}°</span>
              <button class="rotate-step-btn" onclick={() => stepRotation(90)} aria-label={$m.cam_rotate_cw}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                </svg>
              </button>
            </div>
          </div>

          {#if capabilitiesFailed}
          <p class="controls-unavailable" role="alert">{$m.cam_capabilities_failed}</p>
          {:else if capabilities}
          <div class="control-row">
            <span class="control-label">{$m.cam_shutter}</span>
            <!-- `bind:this` gives `openBasicDropdown` the button's position -->
            <button
              bind:this={shutterBtnEl}
              class="control-btn"
              class:open={openDropdown === 'shutter'}
              onclick={() => openBasicDropdown('shutter')}
            >
              <span>{cameraShutter[selectedCameraIndex] ?? '1/125s'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="transform: rotate({openDropdown === 'shutter' ? 180 : 0}deg); transition: transform 0.2s">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>

          <div class="control-row">
            <span class="control-label">ISO</span>
            <button
              bind:this={isoBtnEl}
              class="control-btn"
              class:open={openDropdown === 'iso'}
              onclick={() => openBasicDropdown('iso')}
            >
              <span>{cameraIso[selectedCameraIndex] ?? '100'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="transform: rotate({openDropdown === 'iso' ? 180 : 0}deg); transition: transform 0.2s">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>

          {#if selectedDevice?.has_aperture_control}
          <div class="control-row">
            <span class="control-label">{$m.cam_aperture}</span>
            <button
              bind:this={apertureBtnEl}
              class="control-btn"
              class:open={openDropdown === 'aperture'}
              onclick={() => openBasicDropdown('aperture')}
            >
              <span>{isDSLR ? (cameraDslrAperture[selectedCameraIndex] ?? '5.6') : aperture}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="transform: rotate({openDropdown === 'aperture' ? 180 : 0}deg); transition: transform 0.2s">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
          {/if}

          {#if isDSLR}
          <div class="control-row">
            <span class="control-label">{$m.cam_format}</span>
            <button
              bind:this={formatBtnEl}
              class="control-btn"
              class:open={openDropdown === 'format'}
              onclick={() => openBasicDropdown('format')}
            >
              <span>{cameraDslrFormat[selectedCameraIndex] ?? 'JPEG'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="transform: rotate({openDropdown === 'format' ? 180 : 0}deg); transition: transform 0.2s">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
          {/if}
          {/if}

        </div>
      {/if}
    </div>

    <div class="accordion-block">
      <button class="accordion-trigger" onclick={() => toggleSection('focus')}>
        <div class="acc-left">
          <span>{$m.cam_section_focus}</span>
          <span class="info-wrap" title={$m.cam_section_focus_info} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('focus')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('focus')}
        <div class="accordion-content">
          {#if capabilitiesFailed}
          <p class="controls-unavailable" role="alert">{$m.cam_capabilities_failed}</p>
          {:else if hasFocusControl}
          <!-- Autofocus -->
          <button class="btn-autofocus" onclick={handleAutoFocus} disabled={isFocusing}>
            {#if isFocusing}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              {$m.cam_focusing}
            {:else}
              {$m.cam_autofocus}
            {/if}
          </button>
          {#if focusResultMsg}
            <p class:text-success={focusResultOk} class:text-error={!focusResultOk} class="focus-result-msg">{focusResultMsg}</p>
          {/if}

          <div class="zoom-row">
            <div class="zoom-header">
              <span class="zoom-row-label">{$m.cam_manual_focus}</span>
              <span class="zoom-value">{(lensPosition ?? 0).toFixed(1)} dpt</span>
            </div>
            <input
              type="range"
              class="zoom-slider"
              min="0"
              max="10"
              step="0.1"
              value={lensPosition}
              oninput={(e) => handleFocusSlider(Number((e.target as HTMLInputElement).value))}
              aria-label={$m.cam_focus_slider_aria}
            />
            <div class="zoom-ticks">
              <span title={$m.cam_focus_infinity}>∞</span>
              <span>5 dpt</span>
              <span title={$m.cam_focus_macro}>10cm</span>
            </div>
          </div>

          <div class="zoom-row">
            <div class="zoom-header">
              <span class="zoom-row-label">Zoom</span>
              <span class="zoom-value">
                {(cameraZoom[selectedCameraIndex] ?? 1).toFixed(1)}×
                {#if (cameraZoom[selectedCameraIndex] ?? 1) > 1}
                  <button
                    class="zoom-reset-btn"
                    onclick={() => handleZoomSlider(1)}
                    aria-label={$m.cam_zoom_reset_aria}
                  >{$m.cam_zoom_reset}</button>
                {/if}
              </span>
            </div>
            <input
              type="range"
              class="zoom-slider"
              min="1"
              max="4"
              step="0.5"
              value={cameraZoom[selectedCameraIndex] ?? 1}
              oninput={(e) => handleZoomSlider(Number((e.target as HTMLInputElement).value))}
              aria-label={$m.cam_zoom_slider_aria}
            />
            <div class="zoom-ticks">
              <span>1×</span>
              <span>2×</span>
              <span>3×</span>
              <span>4×</span>
            </div>
          </div>
          {:else}
          <p class="dslr-note">
            {$m.cam_dslr_note_p1}<strong>MF</strong>{$m.cam_dslr_note_p2}
            {$m.cam_dslr_note_p3}
          </p>
          {#if describeFocusMode(cameraFocusMode[selectedCameraIndex]) === 'auto'}
          <p class="dslr-note is-warning" role="status">{$m.cam_dslr_af_warning(cameraFocusMode[selectedCameraIndex] ?? '')}</p>
          {/if}
          {/if}
        </div>
      {/if}
    </div>

    <div class="accordion-block">
      <button
        class="accordion-trigger"
        onclick={() => toggleSection('settings')}
      >
        <div class="acc-left">
          <span>{$m.cam_section_settings}</span>
          <span class="info-wrap" title={$m.cam_section_settings_info} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('settings')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('settings')}
        <div class="accordion-content settings-content">
          {#if capabilitiesFailed}
          <p class="controls-unavailable" role="alert">{$m.cam_capabilities_failed}</p>
          {:else if hasLiveControls}

          <!-- White Balance -->
          <div class="settings-block">
            <span class="settings-label">
              {$m.cam_wb}
            </span>
            <div class="wb-row">
              <!-- wb_auto: auto white balance calibration -->
              <button
                class="wb-pipette"
                onclick={handleWbCalibration}
                disabled={isWbCalibrating}
                aria-label={$m.cam_wb_calibrate_aria}
                title={$m.cam_wb_calibrate_aria}
              >
                {#if isWbCalibrating}
                  <span class="material-symbols-outlined icon-sm">sync</span>
                {:else}
                  <span class="material-symbols-outlined icon-sm">wb_auto</span>
                {/if}
              </button>
              <!-- colorize: click-to-neutralize (experimental) -->
              <button
                class="wb-pipette wb-picker-btn"
                class:wb-picker-active={isWbPickerActive}
                onclick={handleWbPicker}
                disabled={isWbCalibrating}
                aria-label={isWbPickerActive ? $m.cam_wb_cancel_aria : $m.cam_wb_sample_aria}
                title={isWbPickerActive ? $m.cam_wb_cancel_aria : $m.cam_wb_sample_aria}
                aria-pressed={isWbPickerActive}
              >
                <span class="material-symbols-outlined icon-sm">colorize</span>
                <span class="wb-exp-badge">exp</span>
              </button>
            </div>
            {#if isWbPickerActive}
              <p class="wb-picker-hint">
                {$m.cam_wb_hint}
                <button class="wb-picker-cancel" onclick={handleWbPicker}>{$m.common_cancel}</button>
              </p>
            {/if}
            {#if wbResultMsg}
              <p class:text-success={wbResultOk} class:text-error={!wbResultOk} class="focus-result-msg">{wbResultMsg}</p>
            {/if}
          </div>

          <div class="settings-block">
            <span class="settings-label">{$m.cam_temperature}</span>
            <div class="slider-row">
              <div class="slider-track-wrapper temp">
                <input
                  type="range"
                  min="-100"
                  max="100"
                  bind:value={temperature}
                  class="styled-range"
                  oninput={() => applySettings({
                    awb_enable: false,
                    colour_gains: computeColourGains(temperature, tint)
                  })}
                />
              </div>
              <div class="slider-val">{temperature}</div>
            </div>
          </div>

          <div class="settings-block">
            <span class="settings-label">{$m.cam_tint}</span>
            <div class="slider-row">
              <div class="slider-track-wrapper tint">
                <input
                  type="range"
                  min="-100"
                  max="100"
                  bind:value={tint}
                  class="styled-range"
                  oninput={() => applySettings({
                    awb_enable: false,
                    colour_gains: computeColourGains(temperature, tint)
                  })}
                />
              </div>
              <div class="slider-val">{tint}</div>
            </div>
          </div>

          <div class="settings-block exposure-block">
            <span class="settings-label">{$m.cam_exposure}</span>
            <div class="exposure-val" class:nonzero={exposure !== 0}>
              {exposure > 0 ? `+${exposure}` : exposure}
            </div>
            <input
              type="range"
              min="-3"
              max="3"
              step="1"
              bind:value={exposure}
              class="styled-range exposure-range"
              oninput={() => applySettings({ ae_enable: true, exposure_value: exposure })}
            />
            <div class="exposure-marks">
              {#each [-3, -2, -1, 0, 1, 2, 3] as mark}
                <div class="e-mark" class:active={mark === exposure}>
                  <div class="e-tick"></div>
                  {#if Math.abs(mark) === 3 || mark === 0}
                    <span>{mark > 0 ? `+${mark}` : mark}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          {:else}
            <!-- An empty section is what NEH-152 reported. A failed
                 capabilities request has its own message above; this one
                 covers a camera that lacks the controls. -->
            <p class="controls-unavailable">{$m.cam_live_controls_unavailable}</p>
          {/if}

        </div>
      {/if}
    </div>

    <div class="accordion-block">
      <button class="accordion-trigger" onclick={() => toggleSection('histogram')}>
        <div class="acc-left">
          <span>{$m.cam_histogram}</span>
          <span class="info-wrap" title={$m.cam_histogram_info} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('histogram')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('histogram')}
        {@const hist = $histogramStore[selectedCameraIndex] ?? { r: [], g: [], b: [] }}
        <!-- The store starts with thirty zeros per camera, so the array length
             does not tell "no data" from "measured": the check is whether any
             bar has height. A real image, even a black one, piles its pixels
             into the first bin and normalizes it to 100, so all zeros happen
             only when no frame has arrived. -->
        {@const hasData = hist.r.some((v) => v > 0)}
        <div class="accordion-content">
          {#if hasData}
            <div class="histogram">
              {#each { length: 30 } as _, i}
                <div class="bar-group">
                  <div class="bar red"   style="height:{hist.r[i] ?? 0}%"></div>
                  <div class="bar green" style="height:{hist.g[i] ?? 0}%"></div>
                  <div class="bar blue"  style="height:{hist.b[i] ?? 0}%"></div>
                </div>
              {/each}
            </div>
            <div class="hist-legend">
              <div class="leg"><div class="leg-dot r"></div><span>R</span></div>
              <div class="leg"><div class="leg-dot g"></div><span>G</span></div>
              <div class="leg"><div class="leg-dot b"></div><span>B</span></div>
            </div>
          {:else}
            <!-- Without this message an empty rectangle reads as something
                 broken rather than as a chart waiting for data. The message has
                 no box, like the one in the Settings section: the box belongs
                 to the chart, and with no chart there is no box. The R/G/B
                 legend is hidden too while there are no bars to explain. -->
            <p class="controls-unavailable">{$m.cam_histogram_empty}</p>
          {/if}
        </div>
      {/if}
    </div>

  </div><!-- /panel-body -->
</div><!-- /controls-panel -->
  {/if}<!-- /sidebarOpen -->
</div><!-- /sidebar-wrapper -->

<!-- Basic dropdowns, rendered outside the panel with `position: fixed` so the
     scrolling panel does not clip them -->
{#if openDropdown !== null}
  <!-- Invisible backdrop: a click outside the dropdown closes it -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="global-backdrop" onclick={() => openDropdown = null}></div>

  <div
    class="global-dropdown"
    style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px"
  >
    {#if openDropdown === 'shutter'}
      {#each (isDSLR ? dsrlShutterOptions : shutterOptions) as opt}
        <button
          class:selected={opt === (cameraShutter[selectedCameraIndex] ?? (isDSLR ? '1/125' : '1/125s'))}
          onclick={() => {
            cameraShutter = { ...cameraShutter, [selectedCameraIndex]: opt };
            onShutterSpeedChange(opt);
            if (isDSLR) {
              applyDSLRSettingsFn({ shutter_speed: opt });
            } else {
              applySettings({ ae_enable: false, exposure_time_us: parseShutterUs(opt) }, 0);
            }
            openDropdown = null;
          }}
        >{opt}</button>
      {/each}
    {:else if openDropdown === 'iso'}
      {#each (isDSLR ? dsrlIsoOptions : isoOptions) as opt}
        <button
          class:selected={opt === (cameraIso[selectedCameraIndex] ?? '100')}
          onclick={() => {
            cameraIso = { ...cameraIso, [selectedCameraIndex]: opt };
            onIsoChange(opt);
            if (isDSLR) {
              applyDSLRSettingsFn({ iso: opt });
            } else {
              applySettings({ ae_enable: false, analogue_gain: parseInt(opt) / 100 }, 0);
            }
            openDropdown = null;
          }}
        >{opt}</button>
      {/each}
    {:else if openDropdown === 'aperture'}
      {#each (isDSLR ? dsrlApertureOptions : apertureOptions) as opt}
        <button
          class:selected={opt === (isDSLR ? (cameraDslrAperture[selectedCameraIndex] ?? '5.6') : aperture)}
          onclick={() => {
            if (isDSLR) {
              cameraDslrAperture = { ...cameraDslrAperture, [selectedCameraIndex]: opt };
              applyDSLRSettingsFn({ aperture: opt });
            } else {
              onApertureChange(opt);
            }
            openDropdown = null;
          }}
        >{opt}</button>
      {/each}
    {:else if openDropdown === 'format'}
      {#each dsrlFormatOptions as opt}
        <button
          class:selected={opt === (cameraDslrFormat[selectedCameraIndex] ?? 'JPEG')}
          onclick={() => {
            cameraDslrFormat = { ...cameraDslrFormat, [selectedCameraIndex]: opt };
            applyDSLRSettingsFn({ image_format: opt });
            openDropdown = null;
          }}
        >{opt}</button>
      {/each}
    {/if}
  </div>
{/if}

<style>
  /* ── Sidebar wrapper ── */
  .sidebar-wrapper {
    height: 100%;
    display: flex;
    flex-shrink: 0;
  }

  .icon-strip {
    width: 48px;
    height: 100%;
    background-color: var(--color-surface-alt);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    gap: 4px;
    flex-shrink: 0;
  }

  .strip-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--color-light-grey);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    padding: 0;
    flex-shrink: 0;
  }

  .strip-btn:hover {
    background: rgba(255,255,255,0.08);
    color: var(--color-light);
  }

  .strip-btn.toggle {
    color: var(--color-primary);
  }

  .collapse-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border: none;
    background: none;
    color: var(--color-light-grey);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
    padding: 0;
  }

  .collapse-btn:hover {
    background: rgba(255,255,255,0.08);
    color: var(--color-light);
  }

  .spin-icon {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── Zoom slider (horizontal, per-camera ScalerCrop) ── */
  .zoom-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0 2px;
  }

  .zoom-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .zoom-row-label {
    font-size: 11px;
    color: var(--color-light-grey);
    user-select: none;
  }

  .zoom-value {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--color-light);
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .zoom-reset-btn {
    font-size: 9px;
    font-family: var(--font-family);
    color: var(--color-light-grey);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
  }
  .zoom-reset-btn:hover { color: var(--color-primary); }

  .zoom-slider {
    width: 100%;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  .zoom-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--color-light-grey);
    padding: 0 2px;
    user-select: none;
  }

  .cal-dot {
    font-size: 10px;
    color: var(--color-success, #4ade80);
    line-height: 1;
  }

  .controls-panel {
    width: 280px;
    background-color: var(--color-surface-alt);
    height: 100%;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-color);
    overflow-y: auto;
    overflow-x: visible; /* computes to auto beside overflow-y: auto; the Basic dropdowns escape through position: fixed */
    flex-shrink: 0;
    z-index: 20;
  }

  .controls-panel::-webkit-scrollbar { width: 3px; }
  .controls-panel::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .panel-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
    text-align: center;
    position: relative;
  }

  .panel-title {
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0;
  }

  .panel-body {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ── Radio buttons ── */
  .camera-mode-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
    user-select: none;
  }

  .radio-circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: border-color 0.15s;
  }

  .radio-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .camera-selector {
    width: 100%;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 0 10px 0 12px;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    transition: border-color var(--transition-base);
    font-family: var(--font-family);
  }

  .camera-selector:hover { border-color: rgba(255,255,255,0.2); }

  .camera-name {
    flex: 1;
    text-align: center;
    font-weight: var(--fw-bold);
    font-size: 12px;
    color: var(--color-light);
  }

  .relative { position: relative; }

  /* Backdrop for the camera dropdown, which stays inside the panel */
  .fixed-backdrop {
    position: fixed;
    inset: 0;
    z-index: 29;
  }

  .camera-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
    z-index: 30;
    box-shadow: var(--shadow-md);
  }

  .camera-option {
    width: 100%;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
    min-height: var(--touch-target-min);
  }

  .camera-option:hover { background-color: var(--color-primary); color: white; }
  .camera-option.selected { background-color: var(--color-primary); color: white; }

  .camera-status-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-connected {
    background-color: #5a8c62;
    box-shadow: 0 0 8px rgba(90,140,98,0.5);
  }

  .dot-disconnected {
    background-color: #e07830;
    box-shadow: 0 0 8px rgba(224,120,48,0.4);
  }

  .status-label {
    font-size: 12px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
  }

  .status-warn {
    color: #e07830;
  }

  .reconnect-row { display: flex; flex-direction: column; gap: 4px; }

  .btn-reconnect {
    height: 36px;
    background: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-family);
    font-size: 12px;
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-reconnect:hover { border-color: var(--color-primary); color: var(--color-light); }
  .btn-reconnect:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Auto Focus ── */
  .btn-autofocus {
    width: 100%;
    background-color: var(--color-primary);
    color: var(--color-light);
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: var(--fw-bold);
    border: none;
    border-radius: var(--radius-md);
    height: 42px;
    cursor: pointer;
    transition: background-color var(--transition-base);
    box-shadow: 0 4px 12px rgba(90,140,98,0.2);
  }

  .btn-autofocus:hover { background-color: var(--color-primary-hover); }
  .btn-autofocus:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-autofocus:disabled:hover { background-color: var(--color-primary); }

  .accordion-block {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: visible;
  }

  .accordion-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: none;
    border: none;
    cursor: pointer;
    min-height: var(--touch-target-min);
    transition: background-color var(--transition-fast);
    border-radius: var(--radius-md);
  }

  .accordion-trigger:hover { background-color: rgba(255,255,255,0.03); }
  .accordion-trigger:disabled { cursor: default; }

  .acc-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: var(--fw-semibold);
    color: var(--color-light);
  }

  /* The title sits on the <span>, not on the <svg>, because browsers do not
     reliably show a title on an inline svg. aria-hidden: the screen reader
     already reads the section name and does not need the visual help text
     as well. */
  .info-wrap { display: inline-flex; }
  .info-icon { color: var(--color-light-grey); opacity: 0.4; }

  .chevron {
    color: var(--color-light-grey);
    transition: transform var(--transition-base);
    flex-shrink: 0;
  }

  .chevron.rotated { transform: rotate(180deg); }

  .accordion-content {
    padding: 12px 14px;
    background-color: var(--color-bg);
    border-top: 1px solid var(--border-color);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: visible;
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .control-label {
    font-size: 11px;
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    white-space: nowrap;
    flex: 1;
  }

  .control-btn {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0 10px;
    min-height: var(--touch-target-min);
    width: 110px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: var(--fw-semibold);
    color: var(--color-light);
    cursor: pointer;
    transition: border-color var(--transition-base);
    position: relative;
    z-index: 1;
  }

  .control-btn:hover, .control-btn.open {
    border-color: var(--color-highlight);
  }

  /* ── Basic dropdowns (rendered outside the panel, position: fixed) ── */

  .global-backdrop {
    position: fixed;
    inset: 0;
    z-index: 998;
  }

  .global-dropdown {
    position: fixed;
    background-color: var(--color-surface);
    border: 1px solid var(--color-highlight);
    border-radius: var(--radius-sm);
    max-height: 132px;    /* 3 items × 44px */
    overflow-y: auto;
    z-index: 999;
    box-shadow: var(--shadow-md);
  }

  .global-dropdown::-webkit-scrollbar { width: 3px; }
  .global-dropdown::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .global-dropdown button {
    width: 100%;
    min-height: 44px;
    padding: 0 14px;
    text-align: left;
    font-family: var(--font-family);
    font-size: 13px;
    font-weight: var(--fw-semibold);
    color: var(--color-light);
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: background-color var(--transition-fast);
  }

  .global-dropdown button:hover  { background-color: rgba(188,130,60,0.2); }
  .global-dropdown button.selected { background-color: var(--color-highlight); color: white; }

  /* ── Settings ── */
  .settings-content { gap: 14px; }

  .settings-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .settings-label {
    font-size: 12px;
    font-weight: var(--fw-medium);
    color: var(--color-light);
  }

  /* White Balance */
  .wb-row {
    display: flex;
    gap: 8px;
  }

  .wb-pipette {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    min-height: var(--touch-target-min);
    min-width: var(--touch-target-min);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-base);
    flex-shrink: 0;
  }

  .wb-pipette:hover { background-color: var(--color-highlight); color: white; }

  /* ── Gradient sliders (temperature and tint) ── */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .slider-track-wrapper {
    flex: 1;
    height: 44px;
    display: flex;
    align-items: center;
    border-radius: var(--radius-sm);
    overflow: hidden;
    position: relative;
  }

  .slider-track-wrapper.temp {
    background: linear-gradient(to right, #4a7ec4, #d4a944);
    border-radius: 4px;
    height: 8px;
    overflow: visible;
  }

  .slider-track-wrapper.tint {
    background: linear-gradient(to right, #5a8c62, #9a6c94);
    border-radius: 4px;
    height: 8px;
    overflow: visible;
  }

  /* The range input sits over the gradient track */
  .styled-range {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 44px;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
    margin: 0;
    top: 50%;
    transform: translateY(-50%);
  }

  .styled-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: white;
    border: 2px solid rgba(0,0,0,0.15);
    cursor: grab;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    transition: transform 0.15s;
  }

  .styled-range::-webkit-slider-thumb:active { transform: scale(1.1); cursor: grabbing; }

  .exposure-block { align-items: center; }

  .exposure-val {
    font-size: 12px;
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    transition: color var(--transition-fast);
    text-align: center;
  }

  .exposure-val.nonzero { color: var(--color-primary); }

  .exposure-range {
    width: 100%;
    height: 44px;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
    position: relative;
    z-index: 1;
  }

  .exposure-range::-webkit-slider-runnable-track {
    height: 4px;
    background-color: var(--color-surface);
    border-radius: 999px;
  }

  .exposure-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: var(--color-primary);
    border: 2px solid rgba(0,0,0,0.15);
    cursor: grab;
    box-shadow: 0 0 8px rgba(90,140,98,0.4);
    margin-top: -8px;
    transition: transform 0.15s;
  }

  .exposure-range::-webkit-slider-thumb:active { transform: scale(1.15); cursor: grabbing; }

  .exposure-marks {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-top: -4px;
  }

  .e-mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  .e-tick {
    width: 1px;
    height: 3px;
    background-color: var(--color-light-grey);
    opacity: 0.5;
  }

  .e-mark.active .e-tick { height: 6px; background-color: var(--color-primary); opacity: 1; }
  .e-mark span { font-size: 9px; color: var(--color-light-grey); }
  .e-mark.active span { color: var(--color-primary); }

  .histogram {
    height: 90px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 6px;
    display: flex;
    align-items: flex-end;
    gap: 1px;
  }

  .bar-group {
    flex: 1;
    min-width: 2px;
    max-width: 6px;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .bar {
    position: absolute;
    bottom: 0;
    width: 100%;
    border-radius: 1px 1px 0 0;
  }

  .bar.red   { background-color: rgba(192,90,68,0.6); }
  .bar.green { background-color: rgba(90,140,98,0.6); }
  .bar.blue  { background-color: rgba(74,112,144,0.6); }

  .hist-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding-top: 6px;
  }

  .leg {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .leg span { font-size: 11px; color: var(--color-light-grey); }

  .leg-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .leg-dot.r { background-color: #c05a44; }
  .leg-dot.g { background-color: var(--color-primary); }
  .leg-dot.b { background-color: #4a7090; }

  .slider-val {
    min-width: 48px;
    height: 36px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: var(--fw-semibold);
    color: var(--color-light);
    flex-shrink: 0;
  }

  .controls-unavailable {
    margin: 0;
    color: var(--color-light-grey);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .dslr-note.is-warning {
    color: var(--color-warning);
    margin-top: 6px;
  }
</style>
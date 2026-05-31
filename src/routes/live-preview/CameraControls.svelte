<script lang="ts">
  // ============================================================================
  // COMPONENTE: CameraControls
  // Archivo: src/routes/live-preview/CameraControls.svelte
  //
  // Panel izquierdo de controles de cámara.
  //
  // Lógica de cámaras:
  //   Single Camera → solo cámara izquierda activa, selector muestra solo "Left"
  //   Double Camera → selector muestra "Left" y "Right", se puede alternar
  //                   los controles de Basic/Focus/Settings aplican a la cámara seleccionada
  //
  // Acordeones:
  //   Basic    → Shutter Speed, ISO, Aperture (deshabilitado en modo 'automatic')
  //   Focus    → Botones de ajuste fino de foco
  //   Settings → White Balance, Temperatura, Tinte, Exposure (deshabilitado en 'automatic')
  //   Histogram→ Visualización RGB
  //
  // IMPORTANTE: Los dropdowns de Basic usan position:fixed para escapar del
  //             overflow:hidden del panel. Por eso usan onmount para calcular
  //             la posición del botón en el viewport.
  // ============================================================================

  import { onMount } from 'svelte';
  import { camerasApi, type CameraDevice, type CameraControlsRequest, type CameraCapabilities, type DSLRSettingsUpdate } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';
  import { wbSamplingStore } from '$lib/stores/wbSampling';
  import { histogramStore } from '$lib/stores/histogram';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
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
  } = $props();

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // Cámara seleccionada actualmente (0 = izquierda, 1 = derecha)
  let selectedCameraIndex = $state(0);

  // Lista de dispositivos reales cargados desde la API
  let devices = $state<CameraDevice[]>([]);

  // Estado del sidebar: colapsado por defecto (optimizado para pantalla de 7")
  let sidebarOpen = $state(false);

  // Posición actual del foco (dioptrias: 0 = infinito, 10 = 10cm)
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

  // Derived capability flags
  const isDSLR          = $derived(capabilities?.dslr_settings === true);
  const hasFocusControl = $derived(capabilities?.focus_control === true);
  const hasLiveControls = $derived(capabilities?.live_controls === true);

  // DSLR-specific per-camera state
  let cameraDslrAperture = $state<Record<number, string>>({ 0: '5.6', 1: '5.6' });
  let cameraDslrFormat   = $state<Record<number, string>>({ 0: 'JPEG', 1: 'JPEG' });

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

  // Cámara actualmente seleccionada (derivado)
  const selectedDevice = $derived(devices.find(d => d.index === selectedCameraIndex));
  const cameraDisplayName = $derived(
    selectedDevice
      ? `${selectedDevice.label || selectedDevice.model || 'Camera'} [${selectedCameraIndex}]`
      : `Camera ${selectedCameraIndex}`
  );

  // Secciones abiertas del acordeón
  let openSections = $state(['basic', 'focus', 'settings', 'histogram']);

  // Dropdowns abiertos
  let showCameraDropdown = $state(false);

  // Dropdown activo de Basic (shutter/iso/aperture/format) — solo uno a la vez
  let openDropdown = $state<'shutter' | 'iso' | 'aperture' | 'format' | null>(null);

  // Posición del dropdown de Basic (calculada en viewport para escapar overflow:hidden)
  // Se recalcula cada vez que se abre uno de los dropdowns
  let dropdownPos = $state({ top: 0, left: 0, width: 0 });

  // References to the dropdown trigger buttons of Basic
  let shutterBtnEl = $state<HTMLElement | null>(null);
  let isoBtnEl     = $state<HTMLElement | null>(null);
  let apertureBtnEl = $state<HTMLElement | null>(null);
  let formatBtnEl  = $state<HTMLElement | null>(null);

  // Valores de los sliders de Settings
  let temperature = $state(0);   // Temperatura de color (-100 a +100)
  let tint = $state(0);          // Tinte (-100 a +100)
  let exposure = $state(0);      // Exposición (-3 a +3)

  // Opciones de los dropdowns de Basic
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

  // ---------------------------------------------------------------------------
  // FUNCIÓN: abrir un dropdown de Basic y calcular su posición en viewport
  // Necesario porque el panel tiene overflow:hidden y los dropdowns se cortaban.
  // La posición se calcula relativa al botón que lo abre.
  // ---------------------------------------------------------------------------
  function openBasicDropdown(which: 'shutter' | 'iso' | 'aperture' | 'format') {
    // Si ya está abierto, cerrar
    if (openDropdown === which) {
      openDropdown = null;
      return;
    }

    // Obtener la referencia del botón correspondiente
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

  // ---------------------------------------------------------------------------
  // FUNCIÓN: toggle de acordeón
  // ---------------------------------------------------------------------------
  function toggleSection(section: string) {
    openSections = openSections.includes(section)
      ? openSections.filter(s => s !== section)
      : [...openSections, section];
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Autofocus
  // Llama al backend y actualiza el slider de foco con el resultado.
  // ---------------------------------------------------------------------------
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
        showFocusResult(true, `Foco: ${result.lens_position.toFixed(2)} dpt`);
      } else {
        const msg = result.error ?? 'Autofocus falló';
        cameraStatus.reportFailure(msg);
        showFocusResult(false, msg);
      }
    } catch (error) {
      const msg = 'Error en autofocus';
      cameraStatus.reportFailure(msg);
      showFocusResult(false, msg);
    } finally {
      isFocusing = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Calibración white balance
  // Llama al backend, actualiza los gains y refresca la lista de dispositivos.
  // ---------------------------------------------------------------------------
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
        try {
          devices = await camerasApi.listDevices();
        } catch { /* ignore — gains will apply on next mount */ }
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
        showWbResult(true, `WB calibrado${tempLabel}`);
      } else {
        const msg = result.error ?? 'Calibración WB falló';
        cameraStatus.reportFailure(msg);
        showWbResult(false, msg);
      }
    } catch {
      const msg = 'Error calibrando WB';
      cameraStatus.reportFailure(msg);
      showWbResult(false, msg);
    } finally {
      isWbCalibrating = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: WB picker — click-to-neutralize
  // Activa el modo de muestreo en LiveViewport. Cuando el usuario hace clic
  // sobre un área blanca/neutra, se calcula la corrección de ganancias y se
  // guarda en el registro de la cámara.
  //
  // Fórmula: neutral_gray = (R+G+B)/3
  //   new_red_gain  = baseGains[0] * (gray / R)
  //   new_blue_gain = baseGains[1] * (gray / B)
  // Esto corrige la diferencia entre el color observado y el gris neutro,
  // relativo a las ganancias de calibración almacenadas.
  // ---------------------------------------------------------------------------
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
      showWbResult(false, 'Pixel inválido — elige un área con luz');
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
        try { devices = await camerasApi.listDevices(); } catch { /* ignore */ }
        temperature = 0;
        tint = 0;
        cameraStatus.reportSuccess();
        showWbResult(true, `WB muestrado (R=${newRed.toFixed(2)}, B=${newBlue.toFixed(2)})`);
      } else {
        showWbResult(false, result.error ?? 'Error al guardar WB');
      }
    } catch {
      showWbResult(false, 'Error aplicando WB');
    } finally {
      isWbCalibrating = false;
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Ajuste manual de foco (slider vertical)
  // Envía el valor al backend con debounce de 150ms.
  // ---------------------------------------------------------------------------
  function handleFocusSlider(value: number) {
    lensPosition = value;
    if (focusDebounce) clearTimeout(focusDebounce);
    focusDebounce = setTimeout(async () => {
      try {
        await camerasApi.setFocus(selectedCameraIndex, value);
      } catch {
        // fallo silencioso — el preview mostrará el foco actual
      }
    }, 150);
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Zoom de cámara (ScalerCrop via API) por índice de cámara
  // ---------------------------------------------------------------------------
  function handleZoomSlider(value: number) {
    cameraZoom = { ...cameraZoom, [selectedCameraIndex]: value };
    if (zoomDebounce) clearTimeout(zoomDebounce);
    zoomDebounce = setTimeout(async () => {
      try {
        await camerasApi.setCameraControls(selectedCameraIndex, { zoom_factor: value });
      } catch {
        // fallo silencioso
      }
    }, 150);
  }

  // ---------------------------------------------------------------------------
  // Al cambiar a modo 'single', forzar cámara izquierda
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Al cambiar de cámara, actualizar lensPosition desde calibración si disponible
  // ---------------------------------------------------------------------------
  $effect(() => {
    const dev = devices.find(d => d.index === selectedCameraIndex);
    if (dev?.lens_position !== undefined) {
      lensPosition = dev.lens_position;
    }
  });

  // ---------------------------------------------------------------------------
  // Cerrar dropdowns al hacer click fuera (usando el backdrop)
  // ---------------------------------------------------------------------------
  function closeAll() {
    openDropdown = null;
    showCameraDropdown = false;
    showModeDropdown = false;
  }

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
        // Fallo silencioso — la cámara puede no estar disponible
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

  // ---------------------------------------------------------------------------
  // Cargar dispositivos reales al montar
  // ---------------------------------------------------------------------------
  onMount(() => {
    Promise.all([
      camerasApi.listDevices(),
      camerasApi.getCapabilities().catch(() => null),
    ]).then(([d, caps]) => {
      devices = d;
      capabilities = caps;
      onDevicesChange?.(d);
    }).catch(() => { /* fallo silencioso */ });
  });

  // ---------------------------------------------------------------------------
  // DSLR: cargar ajustes reales cuando se activa el backend gphoto2
  // ---------------------------------------------------------------------------
  $effect(() => {
    if (!isDSLR) return;
    const idx = selectedCameraIndex;
    camerasApi.getDSLRSettings(idx)
      .then(s => {
        if (s.shutter_speed) cameraShutter = { ...cameraShutter, [idx]: s.shutter_speed };
        if (s.iso)           cameraIso     = { ...cameraIso,     [idx]: s.iso };
        if (s.aperture)      cameraDslrAperture = { ...cameraDslrAperture, [idx]: s.aperture };
        if (s.image_format) {
          // Map PTP internal names → user-facing names
          const fmtMap: Record<string, string> = { 'L': 'JPEG', 'RAW': 'RAW', 'RAW + L': 'RAW+JPEG' };
          cameraDslrFormat = { ...cameraDslrFormat, [idx]: fmtMap[s.image_format] ?? s.image_format };
        }
      })
      .catch(() => {}); // silencioso — cámara puede no estar conectada
  });

  // ---------------------------------------------------------------------------
  // DSLR: helper to apply DSLR settings asynchronously (silent fail)
  // ---------------------------------------------------------------------------
  async function applyDSLRSettingsFn(settings: DSLRSettingsUpdate) {
    try {
      await camerasApi.applyDSLRSettings(selectedCameraIndex, settings);
    } catch {
      // fallo silencioso — la cámara puede no estar disponible
    }
  }
</script>

<!-- ============================================================
     SIDEBAR WRAPPER — colapsado por defecto en pantallas de 7"
     ============================================================ -->
<div class="sidebar-wrapper">

  {#if !sidebarOpen}
    <!-- ── TIRA DE ICONOS (sidebar colapsado) ── -->
    <div class="icon-strip">
      <!-- Botón para expandir -->
      <button class="strip-btn toggle" onclick={() => sidebarOpen = true} aria-label="Camara control">
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
    <!-- ── PANEL COMPLETO (sidebar expandido) ── -->

<!-- ============================================================
     PANEL DE CONTROLES
     ============================================================ -->
<div class="controls-panel">

  <div class="panel-header">
    <h2 class="panel-title">Camera Controls</h2>
    <!-- Botón para colapsar -->
    <button class="collapse-btn" onclick={() => sidebarOpen = false} aria-label="Colapsar panel">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
  </div>

  <div class="panel-body">

    <!-- ── RADIO: Single / Double Camera ── -->
    <div class="camera-mode-row">
      <label class="radio-label">
        <div class="radio-circle" class:active={cameraMode === 'single'} style="border-color: {cameraMode === 'single' ? 'var(--color-light)' : 'var(--color-light-grey)'}">
          {#if cameraMode === 'single'}<div class="radio-dot" style="background: var(--color-light)"></div>{/if}
        </div>
        <span style="color: {cameraMode === 'single' ? 'var(--color-light)' : 'var(--color-light-grey)'}; font-size: 12px;">Single Camera</span>
        <input type="radio" style="display:none" checked={cameraMode === 'single'} onchange={() => onCameraModeChange('single')} />
      </label>

      <label class="radio-label">
        <div class="radio-circle" style="border-color: {cameraMode === 'double' ? 'var(--color-primary)' : 'var(--color-light-grey)'}">
          {#if cameraMode === 'double'}<div class="radio-dot" style="background: var(--color-primary)"></div>{/if}
        </div>
        <span style="color: {cameraMode === 'double' ? 'var(--color-light)' : 'var(--color-light-grey)'}; font-size: 12px;">Double Camera</span>
        <input type="radio" style="display:none" checked={cameraMode === 'double'} onchange={() => onCameraModeChange('double')} />
      </label>
    </div>

    <!-- ── SELECTOR DE CÁMARA ── -->
    <!-- En modo single: no clickeable (siempre cámara 0)     -->
    <!-- En modo double: dropdown para seleccionar cuál controlar -->
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
          <span class="cal-dot" title="Calibrada">✓</span>
        {/if}
        {#if cameraMode === 'double'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        {/if}
      </button>

      <!-- Dropdown de selección de cámara (solo en double) -->
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
              {`${device.label || device.model || 'Camera'} [${device.index}]`}
              {#if device.calibrated}
                <span class="cal-dot" title="Calibrada">✓</span>
              {/if}
            </button>
          {/each}
          {#if devices.length === 0}
            <div class="camera-option" style="opacity:0.5; cursor:default">Sin cámaras detectadas</div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ── ESTADO DE CÁMARA ── -->
    <div class="camera-status-row">
      <span class="status-dot" class:dot-connected={selectedDevice !== undefined} class:dot-disconnected={selectedDevice === undefined}></span>
      {#if selectedDevice !== undefined}
        <span class="status-label">Conectada</span>
      {:else}
        <span class="status-label status-warn">No detectada</span>
      {/if}
    </div>


    <!-- ══════════════════════════════════════════
         ACORDEÓN: BASIC
         ══════════════════════════════════════════ -->
    <div class="accordion-block">
      <button
        class="accordion-trigger"
        onclick={() => toggleSection('basic')}
      >
        <div class="acc-left">
          <span>Basic</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('basic')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('basic')}
        <div class="accordion-content">

          <!-- Fila: Shutter Speed -->
          <div class="control-row">
            <span class="control-label">Shutter Speed</span>
            <!-- El botón guarda su referencia para calcular la posición del dropdown -->
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

          <!-- Fila: ISO -->
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

          <!-- Fila: Aperture (solo si la cámara lo soporta) -->
          {#if selectedDevice?.has_aperture_control}
          <div class="control-row">
            <span class="control-label">Aperture</span>
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

          <!-- Fila: Image Format (solo DSLR) -->
          {#if isDSLR}
          <div class="control-row">
            <span class="control-label">Format</span>
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

        </div>
      {/if}
    </div>

    <!-- ══════════════════════════════════════════
         ACORDEÓN: FOCUS
         ══════════════════════════════════════════ -->
    <div class="accordion-block">
      <button class="accordion-trigger" onclick={() => toggleSection('focus')}>
        <div class="acc-left">
          <span>Focus</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('focus')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('focus')}
        <div class="accordion-content">
          {#if hasFocusControl}
          <!-- Autofocus -->
          <button class="btn-autofocus" onclick={handleAutoFocus} disabled={isFocusing}>
            {#if isFocusing}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Enfocando…
            {:else}
              Enfocar auto
            {/if}
          </button>
          {#if focusResultMsg}
            <p class:text-success={focusResultOk} class:text-error={!focusResultOk} class="focus-result-msg">{focusResultMsg}</p>
          {/if}

          <!-- Foco manual (horizontal) -->
          <div class="zoom-row">
            <div class="zoom-header">
              <span class="zoom-row-label">Foco manual</span>
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
              aria-label="Posición de foco (dioptrias)"
            />
            <div class="zoom-ticks">
              <span title="Infinito (lejos)">∞</span>
              <span>5 dpt</span>
              <span title="Macro (10 cm)">10cm</span>
            </div>
          </div>

          <!-- Zoom de cámara (ScalerCrop por cámara) -->
          <div class="zoom-row">
            <div class="zoom-header">
              <span class="zoom-row-label">Zoom</span>
              <span class="zoom-value">
                {(cameraZoom[selectedCameraIndex] ?? 1).toFixed(1)}×
                {#if (cameraZoom[selectedCameraIndex] ?? 1) > 1}
                  <button
                    class="zoom-reset-btn"
                    onclick={() => handleZoomSlider(1)}
                    aria-label="Restablecer zoom a 1×"
                  >reset</button>
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
              aria-label="Zoom de cámara (ScalerCrop)"
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
            Set the lens barrel switch to <strong>MF</strong> before capturing.
            AF causes ~12 s PTP hangs on Canon DSLRs.
          </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ══════════════════════════════════════════
         ACORDEÓN: SETTINGS
         ══════════════════════════════════════════ -->
    <div class="accordion-block">
      <button
        class="accordion-trigger"
        onclick={() => toggleSection('settings')}
      >
        <div class="acc-left">
          <span>Settings</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('settings')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('settings')}
        <div class="accordion-content settings-content">
          {#if hasLiveControls}

          <!-- White Balance -->
          <div class="settings-block">
            <span class="settings-label">
              White Balance
            </span>
            <div class="wb-row">
              <!-- wb_auto: auto white balance calibration -->
              <button
                class="wb-pipette"
                onclick={handleWbCalibration}
                disabled={isWbCalibrating}
                aria-label="Calibrar white balance automáticamente (AWB convergencia)"
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
                aria-label={isWbPickerActive ? 'Cancelar muestreo de white balance' : 'Muestrear white balance: toca un área blanca en el preview (experimental)'}
                aria-pressed={isWbPickerActive}
              >
                <span class="material-symbols-outlined icon-sm">colorize</span>
                <span class="wb-exp-badge">exp</span>
              </button>
            </div>
            {#if isWbPickerActive}
              <p class="wb-picker-hint">
                Toca un área blanca o gris neutro en el preview.
                <button class="wb-picker-cancel" onclick={handleWbPicker}>Cancelar</button>
              </p>
            {/if}
            {#if wbResultMsg}
              <p class:text-success={wbResultOk} class:text-error={!wbResultOk} class="focus-result-msg">{wbResultMsg}</p>
            {/if}
          </div>

          <!-- Slider Temperatura: azul → arena (col design system) -->
          <div class="settings-block">
            <span class="settings-label">Temperatura</span>
            <div class="slider-row">
              <!-- Track con gradiente visible + input range encima -->
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

          <!-- Slider Tinte: verde → magenta -->
          <div class="settings-block">
            <span class="settings-label">Tinte</span>
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

          <!-- Slider Exposure: -3 a +3 con marcas -->
          <div class="settings-block exposure-block">
            <span class="settings-label">Exposure</span>
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
            <!-- Marcas debajo del slider -->
            <div class="exposure-marks">
              {#each [-3, -2, -1, 0, 1, 2, 3] as m}
                <div class="e-mark" class:active={m === exposure}>
                  <div class="e-tick"></div>
                  {#if Math.abs(m) === 3 || m === 0}
                    <span>{m > 0 ? `+${m}` : m}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
          {/if}

        </div>
      {/if}
    </div>

    <!-- ══════════════════════════════════════════
         ACORDEÓN: HISTOGRAM
         ══════════════════════════════════════════ -->
    <div class="accordion-block">
      <button class="accordion-trigger" onclick={() => toggleSection('histogram')}>
        <div class="acc-left">
          <span>Histogram</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          class="chevron" class:rotated={openSections.includes('histogram')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('histogram')}
        <div class="accordion-content">
          <div class="histogram">
            {#each { length: 30 } as _, i}
              {@const hist = $histogramStore[selectedCameraIndex] ?? { r: [], g: [], b: [] }}
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
        </div>
      {/if}
    </div>

  </div><!-- /panel-body -->
</div><!-- /controls-panel -->
  {/if}<!-- /sidebarOpen -->
</div><!-- /sidebar-wrapper -->

<!-- ══════════════════════════════════════════════════════════════
     DROPDOWNS DE BASIC (fuera del panel para escapar overflow:hidden)
     Se renderizan en el DOM root y usan posición fija calculada.
     ══════════════════════════════════════════════════════════════ -->
{#if openDropdown !== null}
  <!-- Backdrop invisible que cierra el dropdown al hacer click fuera -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="global-backdrop" onclick={() => openDropdown = null}></div>

  <!-- Menú del dropdown posicionado en el viewport -->
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

  /* ── Tira de iconos (sidebar colapsado) ── */
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

  /* ── Botón de colapsar (dentro del panel) ── */
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

  /* ── Icono giratorio (autofocus en curso) ── */
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

  /* ── Badge de calibración ── */
  .cal-dot {
    font-size: 10px;
    color: var(--color-success, #4ade80);
    line-height: 1;
  }

  /* ── Panel principal ── */
  .controls-panel {
    width: 280px;
    background-color: var(--color-surface-alt);
    height: 100%;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-color);
    overflow-y: auto;
    overflow-x: visible; /* importante: no cortar los dropdowns */
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

  /* ── Selector de cámara ── */
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

  /* Backdrop local (para dropdowns dentro del panel) */
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

  /* ── Fila Estado + Modo ── */
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

  /* ── Acordeón ── */
  .accordion-block {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: visible; /* IMPORTANTE: no cortar los dropdowns hijos */
  }

  .accordion-block.disabled {
    opacity: 0.4;
    pointer-events: none;
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
    overflow: visible; /* no cortar dropdowns */
  }

  /* ── Filas de Basic ── */
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

  /* Botón de dropdown de Basic */
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

  /* Borde color sand/highlight cuando está abierto */
  .control-btn:hover, .control-btn.open {
    border-color: var(--color-highlight);
  }

  /* ── Dropdowns globales de Basic (renderizados fuera del panel) ── */
  /* Se usan position: fixed calculada desde el viewport */

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

  /* ── Focus buttons ── */
  .focus-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 0;
  }

  .focus-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .focus-btn:hover { background-color: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.15); }
  .focus-btn:active { background-color: var(--color-primary); color: white; transform: scale(0.95); }
  .focus-btn.center { background-color: var(--color-primary); border-color: var(--color-primary); box-shadow: 0 0 10px rgba(90,140,98,0.3); }

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

  .wb-btn {
    flex: 1;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0 10px;
    min-height: var(--touch-target-min);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-family);
    font-size: 12px;
    color: var(--color-light);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .wb-btn:hover { border-color: var(--color-highlight); }

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

  /* ── Sliders de gradiente (Temperatura y Tinte) ── */
  /* El input[type=range] es completamente visible y estilizado */
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

  /* Track de gradiente visible detrás del range */
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

  /* El input range flota sobre el track de gradiente */
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

  /* ── Thumb del range: dot blanco visible ── */
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

  /* ── Slider de Exposure ── */
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

  /* Track oscuro del exposure */
  .exposure-range::-webkit-slider-runnable-track {
    height: 4px;
    background-color: var(--color-surface);
    border-radius: 999px;
  }

  /* Dot verde del exposure */
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

  /* Marcas del exposure */
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

  /* ── Histograma ── */
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

  .capitalize { text-transform: capitalize; }
</style>
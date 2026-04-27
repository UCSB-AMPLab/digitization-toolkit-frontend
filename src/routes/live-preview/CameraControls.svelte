<script lang="ts">
  // ============================================================================
  // COMPONENTE: CameraControls
  // Archivo: src/routes/live-preview/CameraControls.svelte
  //
  // Panel izquierdo de controles de cámara.
  // Contiene acordeones para:
  //   - Basic:     Shutter Speed, ISO, Aperture (solo en modo manual)
  //   - Focus:     Botones de ajuste de foco fino
  //   - Settings:  White Balance, Temperatura, Tinte, Exposure
  //   - Histogram: Visualización de histograma RGB
  //
  // Los acordeones se colapsan individualmente.
  // En modo 'automatic' los acordeones Basic y Settings se deshabilitan.
  // ============================================================================

  import { camerasApi } from '$lib/api';
  import { cameraStatus } from '$lib/stores/cameras';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    cameraMode,
    controlMode,
    shutterSpeed,
    iso,
    aperture,
    onCameraModeChange,
    onControlModeChange,
    onShutterSpeedChange,
    onIsoChange,
    onApertureChange,
  }: {
    cameraMode: 'single' | 'double';
    controlMode: 'manual' | 'automatic';
    shutterSpeed: string;
    iso: string;
    aperture: string;
    onCameraModeChange: (mode: 'single' | 'double') => void;
    onControlModeChange: (mode: 'manual' | 'automatic') => void;
    onShutterSpeedChange: (value: string) => void;
    onIsoChange: (value: string) => void;
    onApertureChange: (value: string) => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // Secciones del acordeón actualmente abiertas
  // Para cambiar cuáles están abiertas por defecto, edita este array
  let openSections = $state(['basic', 'focus', 'settings', 'histogram']);

  // Dropdown de modo de control (manual/automatic)
  let showModeDropdown = $state(false);

  // Dropdowns de valores de cámara (shutter speed, iso, aperture)
  let openDropdown = $state<'shutter' | 'iso' | 'aperture' | null>(null);

  // Valores de los sliders de settings
  let temperature = $state(0);   // Temperatura de color (-100 a +100)
  let tint = $state(0);          // Tinte (-100 a +100)
  let exposure = $state(0);      // Exposición (-3 a +3)

  // Opciones disponibles para cada control
  // Para cambiar los valores disponibles, modifica estos arrays
  const shutterOptions = ['1/8000s','1/4000s','1/2000s','1/1000s','1/500s','1/250s','1/125s','1/60s','1/30s','1/15s','1/8s','1/4s','1/2s','1s','1.6s','2s','3.2s','4s','5s','8s'];
  const isoOptions = ['100','200','400','800','1600','3200','6400','12800','25600'];
  const apertureOptions = ['1.4','2.0','2.8','4.0','5.6','8.0','11.0','13.0','16.0','22.0'];

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Toggle de acordeón
  // ---------------------------------------------------------------------------
  function toggleSection(section: string) {
    if (openSections.includes(section)) {
      openSections = openSections.filter(s => s !== section);
    } else {
      openSections = [...openSections, section];
    }
  }

  // ---------------------------------------------------------------------------
  // FUNCIÓN: Autofocus — llama al backend
  // Para cambiar el índice de cámara, modifica camera_index
  // ---------------------------------------------------------------------------
  async function handleAutoFocus() {
    try {
      await camerasApi.calibrate({ camera_index: 0 });
      cameraStatus.reportSuccess();
    } catch (error) {
      cameraStatus.reportFailure('Error en autofocus');
    }
  }

  // Histograma — datos simulados con forma de campana
  // En producción estos datos vendrán de la API de la cámara
  const histogramBars = [12,15,20,28,35,45,58,72,85,95,100,98,92,82,70,55,42,30,22,16,12,10,8,6,5,4,3,2,2,1];
</script>

<!-- ============================================================
     PANEL IZQUIERDO DE CONTROLES
     280px de ancho, scroll vertical si el contenido desborda
     ============================================================ -->
<div class="controls-panel">

  <!-- Título del panel -->
  <div class="panel-header">
    <h2 class="panel-title">Camera Controls</h2>
  </div>

  <div class="panel-body">

    <!-- ── SELECTOR: Single / Double Camera ── -->
    <!-- Para cambiar la forma de seleccionar, modifica estos radio buttons -->
    <div class="camera-mode-row">
      <label class="radio-label">
        <div class="radio-circle" class:active-white={cameraMode === 'single'}>
          {#if cameraMode === 'single'}
            <div class="radio-dot white"></div>
          {/if}
        </div>
        <span class:text-active={cameraMode === 'single'}>Single Camera</span>
        <input type="radio" class="sr-only" checked={cameraMode === 'single'} onchange={() => onCameraModeChange('single')} />
      </label>

      <label class="radio-label">
        <div class="radio-circle" class:active-green={cameraMode === 'double'}>
          {#if cameraMode === 'double'}
            <div class="radio-dot green"></div>
          {/if}
        </div>
        <span class:text-active={cameraMode === 'double'}>Double Camera</span>
        <input type="radio" class="sr-only" checked={cameraMode === 'double'} onchange={() => onCameraModeChange('double')} />
      </label>
    </div>

    <!-- ── SELECTOR: Nombre de cámara (informativo) ── -->
    <div class="camera-selector">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <span class="camera-name">
        {cameraMode === 'single' ? 'Arducam — Left' : 'Arducam — Left / Right'}
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>

    <!-- ── FILA: Estado (On) + Modo (Manual/Automatic) ── -->
    <div class="status-mode-row">
      <!-- Punto verde = cámara activa -->
      <div class="camera-on">
        <span class="on-dot"></span>
        <span class="on-label">On</span>
      </div>

      <!-- Dropdown de modo -->
      <div class="mode-select-wrapper">
        <span class="mode-label">Mode</span>
        <div class="mode-dropdown-trigger" onclick={() => showModeDropdown = !showModeDropdown}>
          <span class="capitalize">{controlMode}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

        <!-- Opciones de modo -->
        {#if showModeDropdown}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="dropdown-backdrop" onclick={() => showModeDropdown = false}></div>
          <div class="dropdown-menu">
            <button onclick={() => { onControlModeChange('manual'); showModeDropdown = false; }}>Manual</button>
            <button onclick={() => { onControlModeChange('automatic'); showModeDropdown = false; }}>Automatic</button>
          </div>
        {/if}
      </div>
    </div>

    <!-- ── BOTÓN: Auto Focus ── -->
    <!-- Al hacer click llama a camerasApi.calibrate() — ver handleAutoFocus() -->
    <button class="btn-autofocus" onclick={handleAutoFocus}>
      Auto Focus
    </button>

    <!-- ── ACORDEONES ── -->

    <!-- BÁSICO: Shutter Speed, ISO, Aperture -->
    <!-- Deshabilitado en modo 'automatic' -->
    <div class="accordion-wrapper" class:disabled={controlMode === 'automatic'}>
      <div class="accordion-block">
        <button class="accordion-trigger" onclick={() => controlMode === 'manual' && toggleSection('basic')}>
          <div class="accordion-trigger-left">
            <span>Basic</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron" class:open={openSections.includes('basic') && controlMode === 'manual'}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {#if openSections.includes('basic') && controlMode === 'manual'}
          <div class="accordion-content">
            <!-- Fila Shutter Speed -->
            <div class="control-row">
              <span class="control-label">Shutter Speed</span>
              <div class="control-dropdown-wrapper">
                <button class="control-dropdown-btn" onclick={() => openDropdown = openDropdown === 'shutter' ? null : 'shutter'}>
                  <span>{shutterSpeed}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {#if openDropdown === 'shutter'}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="dropdown-backdrop" onclick={() => openDropdown = null}></div>
                  <div class="control-dropdown-menu">
                    {#each shutterOptions as opt}
                      <button class:selected={opt === shutterSpeed} onclick={() => { onShutterSpeedChange(opt); openDropdown = null; }}>{opt}</button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Fila ISO -->
            <div class="control-row">
              <span class="control-label">ISO</span>
              <div class="control-dropdown-wrapper">
                <button class="control-dropdown-btn" onclick={() => openDropdown = openDropdown === 'iso' ? null : 'iso'}>
                  <span>{iso}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {#if openDropdown === 'iso'}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="dropdown-backdrop" onclick={() => openDropdown = null}></div>
                  <div class="control-dropdown-menu">
                    {#each isoOptions as opt}
                      <button class:selected={opt === iso} onclick={() => { onIsoChange(opt); openDropdown = null; }}>{opt}</button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Fila Aperture -->
            <div class="control-row">
              <span class="control-label">Aperture</span>
              <div class="control-dropdown-wrapper">
                <button class="control-dropdown-btn" onclick={() => openDropdown = openDropdown === 'aperture' ? null : 'aperture'}>
                  <span>{aperture}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {#if openDropdown === 'aperture'}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div class="dropdown-backdrop" onclick={() => openDropdown = null}></div>
                  <div class="control-dropdown-menu">
                    {#each apertureOptions as opt}
                      <button class:selected={opt === aperture} onclick={() => { onApertureChange(opt); openDropdown = null; }}>{opt}</button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- FOCUS: Botones de ajuste fino -->
    <div class="accordion-block">
      <button class="accordion-trigger" onclick={() => toggleSection('focus')}>
        <div class="accordion-trigger-left">
          <span>Focus</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron" class:open={openSections.includes('focus')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('focus')}
        <div class="accordion-content">
          <!-- Fila de botones de foco: <<< << ● >> >>> -->
          <!-- Para conectar estos con el backend, llama a camerasApi.calibrate() con step values -->
          <div class="focus-buttons">
            <button class="focus-btn">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:-6px"><polyline points="15 18 9 12 15 6"/></svg>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:-6px"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="focus-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
            </button>
            <!-- Punto central verde — posición neutral del foco -->
            <button class="focus-btn center-dot"></button>
            <button class="focus-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
            </button>
            <button class="focus-btn">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:-6px"><polyline points="9 18 15 12 9 6"/></svg>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:-6px"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- SETTINGS: White Balance, Temperatura, Tinte, Exposure -->
    <div class="accordion-wrapper" class:disabled={controlMode === 'automatic'}>
      <div class="accordion-block">
        <button class="accordion-trigger" onclick={() => controlMode === 'manual' && toggleSection('settings')}>
          <div class="accordion-trigger-left">
            <span>Settings</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron" class:open={openSections.includes('settings') && controlMode === 'manual'}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {#if openSections.includes('settings') && controlMode === 'manual'}
          <div class="accordion-content">
            <div class="settings-group">
              <span class="settings-group-label">White Balance</span>
              <div class="wb-row">
                <button class="wb-dropdown">
                  <span>Shot</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <!-- Botón pipette para calibrar white balance -->
                <button class="wb-pipette" onclick={async () => { try { await camerasApi.calibrateWhiteBalance(); } catch(e) {} }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L8 6H4v4l8 8 8-8v-4h-4z"/><line x1="2" y1="22" x2="22" y2="2"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Slider Temperatura: azul → naranja -->
            <div class="gradient-slider-group">
              <span class="slider-label">Temperatura</span>
              <div class="slider-row">
                <div class="gradient-track temp-gradient">
                  <input type="range" min="-100" max="100" bind:value={temperature} class="range-input" />
                </div>
                <div class="slider-value">{temperature}</div>
              </div>
            </div>

            <!-- Slider Tinte: verde → magenta -->
            <div class="gradient-slider-group">
              <span class="slider-label">Tinte</span>
              <div class="slider-row">
                <div class="gradient-track tint-gradient">
                  <input type="range" min="-100" max="100" bind:value={tint} class="range-input" />
                </div>
                <div class="slider-value">{tint}</div>
              </div>
            </div>

            <!-- Slider Exposure: -3 a +3 -->
            <div class="exposure-group">
              <span class="slider-label">Exposure</span>
              <div class="exposure-value" class:nonzero={exposure !== 0}>
                {exposure > 0 ? `+${exposure}` : exposure}
              </div>
              <input type="range" min="-3" max="3" step="1" bind:value={exposure} class="range-input range-exposure" />
              <div class="exposure-marks">
                {#each [-3, -2, -1, 0, 1, 2, 3] as mark}
                  <div class="exposure-mark" class:mark-active={mark === exposure}>
                    <div class="mark-tick"></div>
                    {#if Math.abs(mark) === 3 || mark === 0}
                      <span>{mark > 0 ? `+${mark}` : mark}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- HISTOGRAM: Visualización RGB -->
    <div class="accordion-block">
      <button class="accordion-trigger" onclick={() => toggleSection('histogram')}>
        <div class="accordion-trigger-left">
          <span>Histogram</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="info-icon">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron" class:open={openSections.includes('histogram')}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {#if openSections.includes('histogram')}
        <div class="accordion-content">
          <!-- Visualización de histograma -->
          <!-- En producción, estos valores vendrán del análisis de la imagen en vivo -->
          <div class="histogram-bars">
            {#each histogramBars as height, i}
              <div class="histogram-bar-group">
                <div class="hist-bar red" style="height: {height * 0.9}%"></div>
                <div class="hist-bar green" style="height: {height * 0.95}%"></div>
                <div class="hist-bar blue" style="height: {height}%"></div>
              </div>
            {/each}
          </div>
          <!-- Leyenda de canales -->
          <div class="histogram-legend">
            <div class="legend-item"><div class="legend-dot r"></div><span>R</span></div>
            <div class="legend-item"><div class="legend-dot g"></div><span>G</span></div>
            <div class="legend-item"><div class="legend-dot b"></div><span>B</span></div>
          </div>
        </div>
      {/if}
    </div>

  </div><!-- /panel-body -->
</div>

<style>
  /* Panel izquierdo: ancho fijo, scroll vertical */
  .controls-panel {
    width: 280px;
    background-color: var(--color-surface-alt);
    height: 100%;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-color);
    overflow-y: auto;
    flex-shrink: 0;
    z-index: 20;
  }

  /* Scrollbar mínimo para el panel */
  .controls-panel::-webkit-scrollbar { width: 3px; }
  .controls-panel::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  /* Encabezado del panel */
  .panel-header {
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
    text-align: center;
    flex-shrink: 0;
  }

  .panel-title {
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0;
  }

  /* Cuerpo con espaciado */
  .panel-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ── Radio buttons: Single/Double Camera ── */
  .camera-mode-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 10px;
    color: var(--color-light-grey);
  }

  .radio-circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--color-light-grey);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: border-color var(--transition-fast);
  }

  .radio-circle.active-white { border-color: var(--color-light); }
  .radio-circle.active-green { border-color: var(--color-primary); }

  .radio-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .radio-dot.white { background-color: var(--color-light); }
  .radio-dot.green { background-color: var(--color-primary); }

  .text-active { color: var(--color-light); }

  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

  /* ── Selector de cámara ── */
  .camera-selector {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 0 8px 0 12px;
    display: flex;
    align-items: center;
    height: 38px;
    cursor: pointer;
    transition: border-color var(--transition-base);
    gap: 8px;
  }

  .camera-selector:hover { border-color: rgba(255,255,255,0.2); }

  .camera-name {
    flex: 1;
    text-align: center;
    font-weight: var(--fw-bold);
    font-size: 12px;
    color: var(--color-light);
  }

  /* ── Fila Estado + Modo ── */
  .status-mode-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .camera-on {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .on-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-primary);
    box-shadow: 0 0 8px rgba(90,140,98,0.5);
  }

  .on-label {
    font-size: 12px;
    font-weight: var(--fw-bold);
    color: var(--color-light);
  }

  .mode-select-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
  }

  .mode-label {
    font-size: 11px;
    color: var(--color-light-grey);
    white-space: nowrap;
  }

  .mode-dropdown-trigger {
    flex: 1;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0 12px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--color-light);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .mode-dropdown-trigger:hover { border-color: rgba(255,255,255,0.2); }

  /* ── Dropdown genérico ── */
  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    overflow: hidden;
    z-index: 20;
    box-shadow: var(--shadow-md);
  }

  .dropdown-menu button {
    width: 100%;
    padding: 10px 12px;
    text-align: left;
    font-family: var(--font-family);
    font-size: 12px;
    color: var(--color-light);
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .dropdown-menu button:hover { background-color: var(--color-primary); color: white; }

  /* ── Botón Auto Focus ── */
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

  /* ── Acordeón ── */
  .accordion-wrapper.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .accordion-block {
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .accordion-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
    border-bottom: 1px solid transparent;
    min-height: var(--touch-target-min);
  }

  .accordion-trigger:hover { background-color: var(--color-surface); }

  .accordion-trigger-left {
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
  }

  .chevron.open { transform: rotate(180deg); }

  .accordion-content {
    padding: 16px;
    background-color: var(--color-bg);
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── Filas de controles (Basic) ── */
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
  }

  .control-dropdown-wrapper {
    position: relative;
  }

  .control-dropdown-btn {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0 12px;
    min-height: var(--touch-target-min);
    width: 110px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--font-family);
    font-size: 11px;
    font-weight: var(--fw-semibold);
    color: var(--color-light);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .control-dropdown-btn:hover { border-color: var(--color-highlight); }

  .control-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background-color: var(--color-surface);
    border: 1px solid var(--color-highlight);
    border-radius: var(--radius-sm);
    max-height: 132px;
    overflow-y: auto;
    z-index: 30;
    box-shadow: var(--shadow-md);
  }

  .control-dropdown-menu button {
    width: 100%;
    padding: 0 12px;
    min-height: 44px;
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

  .control-dropdown-menu button:hover { background-color: rgba(188,130,60,0.2); }
  .control-dropdown-menu button.selected { background-color: var(--color-highlight); color: white; }

  /* ── Botones de Focus ── */
  .focus-buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 0;
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
    min-width: 32px;
  }

  .focus-btn:hover { background-color: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.15); }
  .focus-btn:active { background-color: var(--color-primary); color: white; transform: scale(0.95); }

  .focus-btn.center-dot { background-color: var(--color-primary); border-color: var(--color-primary); box-shadow: 0 0 10px rgba(90,140,98,0.3); }

  /* ── Settings: White Balance ── */
  .settings-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .settings-group-label {
    font-size: 12px;
    font-weight: var(--fw-medium);
    color: var(--color-light);
  }

  .wb-row {
    display: flex;
    gap: 8px;
  }

  .wb-dropdown {
    flex: 1;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 0 12px;
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

  .wb-dropdown:hover { border-color: var(--color-highlight); }

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
  }

  .wb-pipette:hover { background-color: var(--color-highlight); color: white; }

  /* ── Sliders de gradiente ── */
  .gradient-slider-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .slider-label {
    font-size: 13px;
    font-weight: var(--fw-medium);
    color: var(--color-light);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .gradient-track {
    flex: 1;
    height: 44px;
    display: flex;
    align-items: center;
    position: relative;
    border-radius: var(--radius-sm);
    overflow: visible;
  }

  .temp-gradient {
    background: linear-gradient(to right, #4a7ec4, #d4a944);
    border-radius: 4px;
    height: 8px;
  }

  .tint-gradient {
    background: linear-gradient(to right, #5a8c62, #9a6c94);
    border-radius: 4px;
    height: 8px;
  }

  .range-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .slider-value {
    min-width: 56px;
    height: 44px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: var(--fw-semibold);
    color: var(--color-light);
  }

  /* ── Exposure slider ── */
  .exposure-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    padding-bottom: 20px;
  }

  .exposure-value {
    font-size: 12px;
    font-weight: var(--fw-semibold);
    color: var(--color-light-grey);
    transition: color var(--transition-fast);
  }

  .exposure-value.nonzero { color: var(--color-primary); }

  .range-exposure {
    width: 180px;
    height: 44px;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
    position: relative;
  }

  .exposure-marks {
    display: flex;
    justify-content: space-between;
    width: 180px;
  }

  .exposure-mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .mark-tick {
    width: 1px;
    height: 3px;
    background-color: var(--color-light-grey);
  }

  .exposure-mark.mark-active .mark-tick { background-color: var(--color-primary); height: 6px; }

  .exposure-mark span {
    font-size: 10px;
    color: var(--color-light-grey);
  }

  .exposure-mark.mark-active span { color: var(--color-primary); }

  /* ── Histograma ── */
  .histogram-bars {
    height: 100px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 8px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 1px;
  }

  .histogram-bar-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    position: relative;
    min-width: 2px;
    max-width: 6px;
    height: 100%;
  }

  .hist-bar {
    position: absolute;
    bottom: 0;
    width: 100%;
    border-radius: 1px 1px 0 0;
  }

  .hist-bar.red   { background-color: rgba(192, 90, 68, 0.6); }
  .hist-bar.green { background-color: rgba(90, 140, 98, 0.6); }
  .hist-bar.blue  { background-color: rgba(74, 112, 144, 0.6); }

  .histogram-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding-top: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .legend-item span {
    font-size: 11px;
    color: var(--color-light-grey);
  }

  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .legend-dot.r { background-color: #c05a44; }
  .legend-dot.g { background-color: var(--color-primary); }
  .legend-dot.b { background-color: #4a7090; }
</style>

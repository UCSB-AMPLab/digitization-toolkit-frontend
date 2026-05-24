<script lang="ts">
  // ============================================================================
  // COMPONENTE: LeftSidebar (Gallery)
  // Archivo: src/routes/gallery/[collectionId]/LeftSidebar.svelte
  //
  // Panel lateral izquierdo de la galería.
  // Contiene un strip de 3 íconos y un panel expandido según el tab activo:
  //
  //   'info'     → Image info: nombre, formato, metadatos, dimensiones, tamaño
  //   'edit'     → Preview Controls: rotar, brillo, contraste, saturación
  //   'comments' → Anotaciones: lista de notas + "Marcar error" + "Agregar nota"
  //
  // En vista 'spread' o 'grid', el sidebar se colapsa mostrando solo el strip.
  // Solo se muestran los paneles en vista 'single'.
  //
  // Las anotaciones son locales (estado del componente).
  // Para persistirlas en el backend, conectar handleAddNote / handleDeleteAnnotation
  // a un endpoint de notas cuando esté disponible.
  // ============================================================================

  import type { Record } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    viewMode,
    currentRecord,
    currentIndex,
    totalRecords,
    onRotateLeft,
    onRotateRight,
  }: {
    viewMode: 'single' | 'spread' | 'grid';
    currentRecord: Record | null;
    currentIndex: number;
    totalRecords: number;
    onRotateLeft: () => void;
    onRotateRight: () => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------

  // Tab activo del strip
  let activeTab = $state<'info' | 'edit' | 'comments'>('info');

  // Panel oculto por defecto; el usuario lo abre pulsando un ícono del strip
  let isExpanded = $state(false);

  // Abre el panel en el tab indicado, o lo colapsa si ya estaba en ese tab
  function toggleTab(tab: 'info' | 'edit' | 'comments') {
    if (isExpanded && activeTab === tab) {
      isExpanded = false;
    } else {
      activeTab = tab;
      isExpanded = true;
    }
  }

  // Valores de sliders de Preview Controls (-100 a 100)
  let brightness = $state(0);
  let contrast = $state(0);
  let saturation = $state(0);

  // Anotaciones locales
  // Para persistir en backend, conectar a una API de anotaciones
  interface Annotation {
    id: string;
    errorTypes: string[];
    note: string;
    timestamp: Date;
  }

  // Tipos de error disponibles para "Marcar error"
  // Para agregar tipos, añadir aquí
  const ERROR_TYPES = [
    { id: 'blur',     label: 'Imagen Borrosa',          color: '#bc823c' },
    { id: 'glare',    label: 'Reflejo/Brillo',           color: '#c05a44' },
    { id: 'shadow',   label: 'Sombras',                  color: '#8b7355' },
    { id: 'focus',    label: 'Fuera de Foco',            color: '#7ba3a3' },
    { id: 'exposure', label: 'Exposición',               color: '#c4a052' },
    { id: 'dirt',     label: 'Impurezas en superficie',  color: '#a85e78' },
  ];

  let annotations = $state<Annotation[]>([]);

  // Modal de "Marcar error"
  let showErrorModal = $state(false);
  let selectedErrorTypes = $state<string[]>([]);

  // Modal de "Agregar nota"
  let showNoteModal = $state(false);
  let noteText = $state('');

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  function getErrorLabel(id: string) {
    return ERROR_TYPES.find(e => e.id === id)?.label ?? id;
  }

  function getErrorColor(id: string) {
    return ERROR_TYPES.find(e => e.id === id)?.color ?? '#666';
  }

  function toggleErrorType(id: string) {
    selectedErrorTypes = selectedErrorTypes.includes(id)
      ? selectedErrorTypes.filter(t => t !== id)
      : [...selectedErrorTypes, id];
  }

  // ---------------------------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------------------------

  function handleSaveError() {
    if (selectedErrorTypes.length === 0) return;
    annotations = [{
      id: Date.now().toString(),
      errorTypes: selectedErrorTypes,
      note: '',
      timestamp: new Date(),
    }, ...annotations];
    selectedErrorTypes = [];
    showErrorModal = false;
  }

  function handleSaveNote() {
    if (!noteText.trim()) return;
    annotations = [{
      id: Date.now().toString(),
      errorTypes: [],
      note: noteText.trim(),
      timestamp: new Date(),
    }, ...annotations];
    noteText = '';
    showNoteModal = false;
  }

  function handleDeleteAnnotation(id: string) {
    annotations = annotations.filter(a => a.id !== id);
  }

  // Formatea la hora de una anotación
  function formatTime(date: Date): string {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  // Información de la imagen actual (mock — conectar con datos reales del record)
  // Para mostrar datos reales, el backend debe devolver EXIF en RecordImage
  let imageInfo = $derived(currentRecord ? {
    name:       currentRecord.title || 'Sin nombre',
    format:     currentRecord.images?.[0]?.format?.toUpperCase() || '—',
    metadata:   `${currentRecord.images?.[0]?.resolution_width ?? '—'}×${currentRecord.images?.[0]?.resolution_height ?? '—'}`,
    dimensions: currentRecord.images?.[0]?.resolution_width
      ? `${currentRecord.images[0].resolution_width} × ${currentRecord.images[0].resolution_height}`
      : '—',
    size: currentRecord.images?.[0]?.file_size
      ? `${(currentRecord.images[0].file_size / 1024 / 1024).toFixed(1)} MB`
      : '—',
  } : null);
</script>

<!-- ============================================================
     SIDEBAR
     En modo 'single': strip (60px) + panel expandido (260px) = 320px total
     En modo 'spread': solo strip (60px)
     ============================================================ -->
<div class="sidebar" class:expanded={isExpanded}>

  <!-- ── Strip de íconos ── -->
  <div class="icon-strip">
    <!-- Info -->
    <button
      class="strip-btn"
      class:active={activeTab === 'info' && isExpanded}
      onclick={() => toggleTab('info')}
      aria-label="Image info"
      title="Image info"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </button>

    <!-- Preview Controls -->
    <button
      class="strip-btn"
      class:active={activeTab === 'edit' && isExpanded}
      onclick={() => toggleTab('edit')}
      aria-label="Preview controls"
      title="Preview Controls"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>

    <!-- Anotaciones -->
    <button
      class="strip-btn"
      class:active={activeTab === 'comments' && isExpanded}
      onclick={() => toggleTab('comments')}
      aria-label="Anotaciones"
      title="Anotaciones"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  </div>

  <!-- ── Panel de contenido (solo en single) ── -->
  {#if isExpanded}
    <div class="panel-content">

      <!-- ══ TAB: IMAGE INFO ══ -->
      {#if activeTab === 'info'}
        <div class="panel-section">
          <h3 class="panel-title">Image info</h3>

          {#if imageInfo}
            <div class="info-rows">
              <div class="info-row"><span class="info-label">Name</span><span class="info-value">{imageInfo.name}</span></div>
              <div class="info-row"><span class="info-label">Format</span><span class="info-value">{imageInfo.format}</span></div>
              <div class="info-row"><span class="info-label">Metadata</span><span class="info-value">{imageInfo.metadata}</span></div>
              <div class="info-row"><span class="info-label">Dimensions</span><span class="info-value">{imageInfo.dimensions}</span></div>
              <div class="info-row"><span class="info-label">Size</span><span class="info-value">{imageInfo.size}</span></div>
            </div>
            <!-- Contador de posición -->
            <div class="info-footer">
              <span>{imageInfo.name}</span>
              <span>{currentIndex}/{totalRecords}</span>
            </div>
          {:else}
            <p class="empty-text">Selecciona una imagen</p>
          {/if}
        </div>

      <!-- ══ TAB: PREVIEW CONTROLS ══ -->
      {:else if activeTab === 'edit'}
        <div class="panel-section">
          <div class="preview-card">
            <h3 class="panel-title">Preview Controls</h3>

            <!-- Rotar -->
            <div class="control-group">
              <label class="control-label">Rotate</label>
              <div class="rotate-row">
                <button class="rotate-btn" onclick={onRotateLeft}>
                  <!-- Ícono rotar izquierda -->
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"/>
                  </svg>
                  <span>Left</span>
                </button>
                <button class="rotate-btn" onclick={onRotateRight}>
                  <!-- Ícono rotar derecha -->
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                  </svg>
                  <span>Right</span>
                </button>
              </div>
            </div>

            <!-- Brightness -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                  <span>Brightness</span>
                </div>
                <span class="slider-val">{brightness > 0 ? `+${brightness}` : brightness}</span>
              </div>
              <!-- El gradiente del slider refleja el porcentaje actual -->
              <input type="range" min="-100" max="100" bind:value={brightness}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((brightness+100)/200)*100}%, var(--color-surface) {((brightness+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

            <!-- Contrast -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20V2z"/>
                  </svg>
                  <span>Contrast</span>
                </div>
                <span class="slider-val">{contrast > 0 ? `+${contrast}` : contrast}</span>
              </div>
              <input type="range" min="-100" max="100" bind:value={contrast}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((contrast+100)/200)*100}%, var(--color-surface) {((contrast+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

            <!-- Saturation -->
            <div class="slider-group">
              <div class="slider-header">
                <div class="slider-label-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                  </svg>
                  <span>Saturation</span>
                </div>
                <span class="slider-val">{saturation > 0 ? `+${saturation}` : saturation}</span>
              </div>
              <input type="range" min="-100" max="100" bind:value={saturation}
                style="background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) {((saturation+100)/200)*100}%, var(--color-surface) {((saturation+100)/200)*100}%, var(--color-surface) 100%)"
              />
            </div>

          </div>
        </div>

      <!-- ══ TAB: ANOTACIONES ══ -->
      {:else if activeTab === 'comments'}
        <div class="panel-section">
          <div class="preview-card">

            <!-- Encabezado -->
            <div class="annotations-header">
              <div class="annotations-title-row">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <h3 class="panel-title" style="margin:0">Anotaciones</h3>
              </div>
              <span class="annotation-count">{annotations.length}</span>
            </div>

            <!-- Lista de anotaciones -->
            <div class="annotations-list">
              {#if annotations.length === 0}
                <p class="empty-text">Sin anotaciones — agrega una nota o marca un error</p>
              {:else}
                {#each annotations as ann}
                  <div class="annotation-card">
                    <div class="annotation-body">
                      <!-- Tags de tipo de error -->
                      {#if ann.errorTypes.length > 0}
                        <div class="error-tags">
                          {#each ann.errorTypes as errorId}
                            <div class="error-tag">
                              <div class="error-dot" style="background-color: {getErrorColor(errorId)}"></div>
                              <span>{getErrorLabel(errorId)}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                      <!-- Texto de la nota -->
                      {#if ann.note}
                        <p class="annotation-text">{ann.note}</p>
                      {/if}
                    </div>
                    <div class="annotation-footer">
                      <span class="annotation-time">{formatTime(ann.timestamp)}</span>
                      <!-- Botón eliminar (visible en hover) -->
                      <button class="delete-annotation-btn" onclick={() => handleDeleteAnnotation(ann.id)} aria-label="Eliminar anotación">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <!-- Botones de acción -->
            <div class="annotation-actions">
              <button class="action-btn" onclick={() => showErrorModal = true}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>Marcar error</span>
              </button>
              <button class="action-btn" onclick={() => showNoteModal = true}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>Agregar nota</span>
              </button>
            </div>

          </div>
        </div>
      {/if}

    </div>
  {/if}

</div>

<!-- ============================================================
     MODAL: Tipología de Error
     ============================================================ -->
{#if showErrorModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) { showErrorModal = false; selectedErrorTypes = []; } }}>
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">Tipología de Error</h3>
        <button class="modal-close" onclick={() => { showErrorModal = false; selectedErrorTypes = []; }} aria-label="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="error-type-list">
        {#each ERROR_TYPES as errType}
          <button
            class="error-type-btn"
            class:selected={selectedErrorTypes.includes(errType.id)}
            onclick={() => toggleErrorType(errType.id)}
          >
            <div class="et-dot" style="background-color: {errType.color}"></div>
            <span>{errType.label}</span>
            {#if selectedErrorTypes.includes(errType.id)}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2.5" class="et-check"><polyline points="20 6 9 17 4 12"/></svg>
            {/if}
          </button>
        {/each}
      </div>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => { showErrorModal = false; selectedErrorTypes = []; }}>Cancelar</button>
        <button class="modal-btn confirm" disabled={selectedErrorTypes.length === 0} onclick={handleSaveError}>Guardar</button>
      </div>
    </div>
  </div>
{/if}

<!-- ============================================================
     MODAL: Agregar Nota
     ============================================================ -->
{#if showNoteModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={(e) => { if ((e.target as HTMLElement).classList.contains('modal-backdrop')) { showNoteModal = false; noteText = ''; } }}>
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">Agregar Nota</h3>
        <button class="modal-close" onclick={() => { showNoteModal = false; noteText = ''; }} aria-label="Cerrar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <label class="note-label">Nota</label>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        class="note-textarea"
        bind:value={noteText}
        placeholder="Describe el problema o agrega un comentario..."
        autofocus
      ></textarea>
      <div class="modal-actions">
        <button class="modal-btn cancel" onclick={() => { showNoteModal = false; noteText = ''; }}>Cancelar</button>
        <button class="modal-btn confirm" disabled={!noteText.trim()} onclick={handleSaveNote}>Guardar</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Sidebar ── */
  .sidebar {
    display: flex;
    background-color: var(--color-surface-alt);
    border-right: 1px solid var(--border-color);
    height: 100%;
    flex-shrink: 0;
    z-index: 10;
    width: 60px;
    transition: width var(--transition-base);
  }

  .sidebar.expanded { width: 320px; }

  /* Strip de íconos */
  .icon-strip {
    width: 60px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0;
    gap: 12px;
    border-right: 1px solid var(--border-color);
    background-color: var(--color-surface);
  }

  .strip-btn {
    width: 40px; height: 40px;
    border-radius: var(--radius-md);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--color-light-grey);
    background: none;
    transition: all var(--transition-fast);
    min-height: 0;
  }

  .strip-btn:hover { color: var(--color-light-grey); background-color: rgba(255,255,255,0.04); }

  .strip-btn.active {
    background-color: rgba(90,140,98,0.2);
    color: var(--color-primary);
    border: 1.5px solid var(--color-primary);
  }

  /* Panel de contenido */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  .panel-content::-webkit-scrollbar { width: 3px; }
  .panel-content::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .panel-section { padding: 20px 16px; }

  .panel-title {
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    color: var(--color-light);
    margin: 0 0 16px;
  }

  /* Info rows */
  .info-rows { display: flex; flex-direction: column; }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color);
  }

  .info-label { font-size: 13px; color: var(--color-light-grey); }
  .info-value { font-size: 13px; color: var(--color-light-grey); font-weight: var(--fw-medium); text-align: right; }

  .info-footer {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    margin-top: 20px;
  }

  .info-footer span { font-size: var(--text-xs); color: var(--color-light-grey); opacity: 0.6; }

  /* Preview card (edit + comments) */
  .preview-card {
    background-color: rgba(255,255,255,0.04);
    border: 1.5px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  /* Rotar */
  .control-group { margin-bottom: 20px; }

  .control-label {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    display: block;
    margin-bottom: 10px;
  }

  .rotate-row { display: flex; gap: 8px; }

  .rotate-btn {
    flex: 1;
    height: 40px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--font-family);
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
  }

  .rotate-btn:hover { background-color: rgba(90,140,98,0.12); border-color: var(--color-primary); color: var(--color-primary); }

  /* Sliders */
  .slider-group { margin-bottom: 16px; }

  .slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .slider-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--color-light-grey);
  }

  .slider-val {
    font-size: var(--text-xs);
    color: var(--color-light-grey);
    font-family: monospace;
    min-width: 28px;
    text-align: right;
  }

  .slider-group input[type="range"] {
    width: 100%;
    height: 6px;
    -webkit-appearance: none;
    border-radius: var(--radius-full);
    cursor: pointer;
    outline: none;
  }

  .slider-group input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px; height: 18px;
    border-radius: 50%;
    background-color: white;
    border: 2px solid rgba(0,0,0,0.15);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    cursor: grab;
  }

  /* Anotaciones */
  .annotations-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .annotations-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-light);
  }

  .annotation-count {
    font-size: 13px;
    color: var(--color-light-grey);
  }

  .annotations-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow-y: auto;
    margin-bottom: 12px;
  }

  .annotations-list::-webkit-scrollbar { width: 3px; }
  .annotations-list::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 999px; }

  .annotation-card {
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    transition: border-color var(--transition-fast);
  }

  .annotation-card:hover { border-color: rgba(90,140,98,0.5); }

  .annotation-body { margin-bottom: 6px; }

  .error-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }

  .error-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    background-color: rgba(0,0,0,0.3);
    border-radius: 4px;
    font-size: 11px;
    color: var(--color-light-grey);
  }

  .error-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .annotation-text { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.5; margin: 0; }

  .annotation-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .annotation-time { font-size: 11px; color: var(--color-light-grey); opacity: 0.6; }

  .delete-annotation-btn {
    background: none; border: none;
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: all var(--transition-fast);
  }

  .annotation-card:hover .delete-annotation-btn { opacity: 1; }
  .delete-annotation-btn:hover { color: var(--color-error); background-color: rgba(214,103,74,0.1); }

  .annotation-actions { display: flex; flex-direction: column; gap: 8px; }

  .action-btn {
    width: 100%;
    height: 40px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-height: var(--touch-target-min);
  }

  .action-btn:hover { background-color: rgba(90,140,98,0.12); border-color: var(--color-primary); color: var(--color-primary); }

  .empty-text {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    opacity: 0.5;
    text-align: center;
    padding: 16px 0;
    margin: 0;
  }

  /* ══ Modales ══ */
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
    border: 1px solid rgba(90,140,98,0.3);
    border-radius: var(--radius-xl);
    padding: 24px;
    width: 100%;
    max-width: 480px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .modal-header { display: flex; align-items: center; justify-content: space-between; }

  .modal-title { font-size: var(--text-h4); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }

  .modal-close {
    width: 32px; height: 32px;
    border-radius: var(--radius-md);
    border: none; background: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .modal-close:hover { background-color: var(--color-surface); color: var(--color-light); }

  /* Error type list */
  .error-type-list { display: flex; flex-direction: column; gap: 8px; }

  .error-type-btn {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    color: var(--color-light-grey);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
    min-height: var(--touch-target-min);
  }

  .error-type-btn:hover { border-color: rgba(90,140,98,0.5); }
  .error-type-btn.selected { background-color: rgba(255,255,255,0.06); border-color: var(--color-primary); color: var(--color-light); }

  .et-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .et-check { margin-left: auto; flex-shrink: 0; }

  /* Nota textarea */
  .note-label { font-size: var(--text-sm); color: var(--color-light-grey); }

  .note-textarea {
    width: 100%;
    height: 120px;
    padding: 10px 12px;
    background-color: var(--color-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    color: var(--color-light);
    resize: none;
    outline: none;
    transition: border-color var(--transition-base);
  }

  .note-textarea::placeholder { color: var(--color-light-grey); opacity: 0.5; }
  .note-textarea:focus { border-color: var(--color-primary); }

  /* Modal actions */
  .modal-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 40px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
  }

  .modal-btn.cancel { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover { color: var(--color-light); border-color: rgba(90,140,98,0.5); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
  .modal-btn.confirm:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

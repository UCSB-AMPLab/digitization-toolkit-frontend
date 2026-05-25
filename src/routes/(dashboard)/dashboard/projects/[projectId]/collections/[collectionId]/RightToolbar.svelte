<script lang="ts">
  // ============================================================================
  // COMPONENTE: RightToolbar
  // Archivo: src/routes/gallery/[collectionId]/RightToolbar.svelte
  //
  // Toolbar flotante en el lado derecho de la galería.
  // Siempre visible independientemente de la vista activa.
  //
  // Controles:
  //   - Vista lista  (ícono lista)
  //   - Vista spread (ícono libro)
  //   - Vista grid   (ícono cuadrícula)
  //   [separador — solo en spread]
  //   - Zoom in / Zoom out / Fit to screen
  //   - Más opciones (placeholder)
  //
  // El ícono activo tiene un marcador verde a la izquierda + fondo oscuro.
  // ============================================================================

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    viewMode,
    zoom,
    onViewModeChange,
    onZoomChange,
    onRotateLeft,
    onRotateRight,
  }: {
    viewMode: 'list' | 'spread' | 'grid';
    zoom: number;
    onViewModeChange: (mode: 'list' | 'spread' | 'grid') => void;
    onZoomChange: (zoom: number) => void;
    onRotateLeft: () => void;
    onRotateRight: () => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------------------------

  function handleZoomIn()    { onZoomChange(Math.min(zoom + 0.2, 3)); }
  function handleZoomOut()   { onZoomChange(Math.max(zoom - 0.2, 0.5)); }
  function handleFitScreen() { onZoomChange(1); }
</script>

<!-- ============================================================
     TOOLBAR DERECHA
     80px de ancho, altura completa, fondo surface-alt
     ============================================================ -->
<div class="right-toolbar">

  <!-- ── Íconos de vista ── -->

  <!-- Vista lista -->
  <button
    class="tool-btn"
    class:active={viewMode === 'list'}
    onclick={() => onViewModeChange('list')}
    title="Vista lista"
    aria-label="Vista lista"
  >
    {#if viewMode === 'list'}
      <div class="active-indicator"></div>
    {/if}
    <span class="material-symbols-outlined icon-md">view_list</span>
  </button>

  <!-- Vista spread -->
  <button
    class="tool-btn"
    class:active={viewMode === 'spread'}
    onclick={() => onViewModeChange('spread')}
    title="Vista libro"
    aria-label="Vista libro abierto"
  >
    {#if viewMode === 'spread'}
      <div class="active-indicator"></div>
    {/if}
    <!-- Ícono libro -->
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  </button>

  <!-- Vista grid -->
  <button
    class="tool-btn"
    class:active={viewMode === 'grid'}
    onclick={() => onViewModeChange('grid')}
    title="Vista cuadrícula"
    aria-label="Vista cuadrícula"
  >
    {#if viewMode === 'grid'}
      <div class="active-indicator"></div>
    {/if}
    <!-- Ícono grid -->
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  </button>

  <!-- Separador + controles de zoom (solo en vista spread) -->
  {#if viewMode === 'spread'}
    <div class="divider"></div>

    <!-- Zoom in -->
    <button class="tool-btn" onclick={handleZoomIn} title="Zoom in" aria-label="Zoom in">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>

    <!-- Zoom out -->
    <button class="tool-btn" onclick={handleZoomOut} title="Zoom out" aria-label="Zoom out">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>

    <!-- Fit to screen -->
    <button class="tool-btn" onclick={handleFitScreen} title="Ajustar pantalla" aria-label="Ajustar a pantalla">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
    </button>
  {/if}

</div>

<style>
  /* Toolbar fija a la derecha */
  .right-toolbar {
    width: 80px;
    background-color: var(--color-surface-alt);
    border-left: 1px solid var(--border-color);
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 0;
    flex-shrink: 0;
    z-index: 10;
    overflow-y: auto;
  }

  .right-toolbar::-webkit-scrollbar { width: 0; }

  /* Botón de herramienta */
  .tool-btn {
    position: relative;
    width: 64px; height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-light-grey);
    border-radius: var(--radius-md);
    margin: 0 8px 4px;
    transition: color var(--transition-fast), background-color var(--transition-fast);
    min-height: 0;
  }

  .tool-btn:hover {
    color: var(--color-light);
    background-color: var(--color-surface);
  }

  /* Estado activo: fondo + color verde */
  .tool-btn.active {
    background-color: var(--color-surface);
    color: var(--color-primary);
  }

  /* Indicador verde a la izquierda del botón activo */
  .active-indicator {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 32px;
    background-color: var(--color-primary);
    border-radius: 0 3px 3px 0;
  }

  /* Botón retake con borde dorado */
  .tool-btn.retake { color: var(--color-highlight); }
  .tool-btn.retake:hover { background-color: rgba(225,183,120,0.08); }

  /* Separador */
  .divider {
    width: 48px;
    height: 1px;
    background-color: var(--border-color);
    margin: 12px auto;
    flex-shrink: 0;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed; inset: 0;
    background-color: rgba(0,0,0,0.65);
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
    padding: 28px;
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-title { font-size: var(--text-h3); font-weight: var(--fw-bold); color: var(--color-light); margin: 0; }
  .modal-desc  { font-size: var(--text-sm); color: var(--color-light-grey); line-height: 1.6; margin: 0; }

  .modal-actions { display: flex; gap: 12px; }

  .modal-btn {
    flex: 1; height: 44px;
    border-radius: var(--radius-md);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: all var(--transition-base);
    border: 1px solid var(--border-color);
  }

  .modal-btn.cancel  { background-color: var(--color-surface); color: var(--color-light-grey); }
  .modal-btn.cancel:hover  { color: var(--color-light); }
  .modal-btn.confirm { background-color: var(--color-primary); color: white; border-color: var(--color-primary); }
  .modal-btn.confirm:hover { background-color: var(--color-primary-hover); }
</style>

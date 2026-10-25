<script lang="ts">
  import { m } from '$lib/i18n';
  // Toolbar on the right edge of the volume gallery, shown in every view mode.
  // It holds the view-mode switch (list, spread, grid); the zoom controls appear
  // only in spread view, and the BagIt export button only when the parent passes
  // `onExport`.

  import { stepZoom } from '$lib/pan-zoom';

  let {
    viewMode,
    zoom,
    oneToOne = 1,
    canExport = false,
    onViewModeChange,
    onZoomChange,
    onRotateLeft,
    onRotateRight,
    onExport,
  }: {
    viewMode: 'list' | 'spread' | 'grid';
    zoom: number;
    oneToOne?: number;
    canExport?: boolean;
    onViewModeChange: (mode: 'list' | 'spread' | 'grid') => void;
    onZoomChange: (zoom: number) => void;
    onRotateLeft: () => void;
    onRotateRight: () => void;
    onExport?: () => void;
  } = $props();

  function handleZoomIn()    { onZoomChange(stepZoom(zoom, 1, oneToOne)); }
  function handleZoomOut()   { onZoomChange(stepZoom(zoom, -1, oneToOne)); }
  function handleFitScreen() { onZoomChange(1); }
  function handleActualSize() { onZoomChange(oneToOne); }
</script>

<div class="right-toolbar">

  <button
    class="tool-btn"
    class:active={viewMode === 'list'}
    onclick={() => onViewModeChange('list')}
    title={$m.col_view_list}
    aria-label={$m.col_view_list}
  >
    {#if viewMode === 'list'}
      <div class="active-indicator"></div>
    {/if}
    <span class="material-symbols-outlined icon-md">view_list</span>
  </button>

  <button
    class="tool-btn"
    class:active={viewMode === 'spread'}
    onclick={() => onViewModeChange('spread')}
    title={$m.col_view_spread}
    aria-label={$m.col_view_spread_aria}
  >
    {#if viewMode === 'spread'}
      <div class="active-indicator"></div>
    {/if}
    <!-- Book icon -->
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  </button>

  <button
    class="tool-btn"
    class:active={viewMode === 'grid'}
    onclick={() => onViewModeChange('grid')}
    title={$m.col_view_grid}
    aria-label={$m.col_view_grid}
  >
    {#if viewMode === 'grid'}
      <div class="active-indicator"></div>
    {/if}
    <!-- Grid icon -->
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  </button>

  {#if viewMode === 'spread'}
    <div class="divider"></div>

    <!-- Zoom in -->
    <button class="tool-btn" onclick={handleZoomIn} title={$m.col_zoom_in} aria-label={$m.col_zoom_in}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>

    <!-- Zoom out -->
    <button class="tool-btn" onclick={handleZoomOut} title={$m.col_zoom_out} aria-label={$m.col_zoom_out}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>

    <!-- Fit to screen -->
    <button class="tool-btn" onclick={handleFitScreen} title={$m.col_fit_screen} aria-label={$m.col_fit_screen_aria}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
    </button>

    <button class="tool-btn" onclick={handleActualSize} title={$m.col_zoom_actual} aria-label={$m.col_zoom_actual_aria}>
      <span class="one-to-one-glyph">1:1</span>
    </button>
  {/if}

  {#if onExport}
    <div class="divider"></div>
    <button
      class="tool-btn"
      class:export-ready={canExport}
      data-tour="exportar"
      onclick={onExport}
      title={canExport ? $m.col_export_available : $m.col_export_unavailable}
      aria-label={$m.col_export}
    >
      <span class="material-symbols-outlined icon-md">archive</span>
    </button>
  {/if}

</div>

<style>
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

  .tool-btn.active {
    background-color: var(--color-surface);
    color: var(--color-primary);
  }

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

  /* The 1:1 button uses a text glyph: there is no spare Material icon for
     actual size, and the `fit_screen` shape is taken by the Fit to screen
     button. */
  .one-to-one-glyph {
    font-size: var(--text-sm);
    font-weight: var(--fw-bold);
  }

  /* `.retake` sets the gold highlight color; no element in this component
     uses the class. */
  .tool-btn.retake { color: var(--color-highlight); }
  .tool-btn.retake:hover { background-color: rgba(225,183,120,0.08); }

  .divider {
    width: 48px;
    height: 1px;
    background-color: var(--border-color);
    margin: 12px auto;
    flex-shrink: 0;
  }

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

<script lang="ts">
  // ============================================================================
  // COMPONENTE: ImageViewer
  //
  // Vista spread: muestra las dos páginas (izq + der) del registro seleccionado
  // lado a lado, como un libro abierto.
  //
  // La imagen se muestra usando el thumbnail (si existe) o la URL completa.
  // ============================================================================

  import { recordsApi, type Record, type RecordImage } from '$lib/api';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    viewMode,
    records,
    selectedRecordId,
    zoom,
    rotation,
    onPrev,
    onNext,
    onZoomChange,
  }: {
    viewMode: 'spread';
    records: Record[];
    selectedRecordId: number | null;
    zoom: number;
    rotation: number;
    onPrev: () => void;
    onNext: () => void;
    onZoomChange: (z: number) => void;
  } = $props();

  // ---------------------------------------------------------------------------
  // DERIVADOS
  // ---------------------------------------------------------------------------
  let selectedRecord = $derived(records.find(r => r.id === selectedRecordId) ?? null);
  let selectedIndex  = $derived(records.findIndex(r => r.id === selectedRecordId));

  // Spread: busca L y R dentro del propio record seleccionado (captura doble).
  // Fallback: si no hay roles asignados, usa la primera imagen como izquierda.
  let spreadLeftImage  = $derived(
    selectedRecord?.images?.find(img => img.role === 'left')
    ?? selectedRecord?.images?.[0]
    ?? null
  );
  let spreadRightImage = $derived(
    selectedRecord?.images?.find(img => img.role === 'right') ?? null
  );

  // ---------------------------------------------------------------------------
  // HELPER: URL de una imagen concreta
  // ---------------------------------------------------------------------------
  function getImageUrl(img: RecordImage | null): string | null {
    if (!img) return null;
    if (img.thumbnail_path) return recordsApi.getImageThumbnailUrl(img.id);
    return recordsApi.getImageFileUrl(img.id);
  }

  // Nombre del record para mostrar en labels
  function getRecordName(record: Record | null): string {
    return record?.title ?? '—';
  }
</script>

<!-- ============================================================
     ÁREA DE VISUALIZACIÓN
     ============================================================ -->
<div class="viewer-area">

  <!-- ══════════════════════════════════════════════════════
       VISTA SPREAD: dos páginas lado a lado (libro abierto)
       ══════════════════════════════════════════════════════ -->

  <!-- Botón anterior (par anterior) -->
  <button class="nav-btn left" onclick={onPrev} disabled={selectedIndex <= 0} aria-label="Anterior">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <!-- Área de spread: dos páginas -->
    <div class="spread-wrapper">

      <!-- Página izquierda -->
      <div class="spread-page">
        {#if selectedRecord}
          <div class="spread-label">
            <span class="spread-name">{getRecordName(selectedRecord)}</span>
            <span class="spread-side">Página izq.</span>
          </div>
        {/if}
        {#if getImageUrl(spreadLeftImage)}
          <img
            src={getImageUrl(spreadLeftImage)}
            alt="Página izquierda"
            class="spread-image left"
            draggable="false"
            style="transform: scale({zoom}) rotate({rotation}deg); transition: transform 0.15s ease;"
          />
        {:else}
          <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
        {/if}
      </div>

      <!-- Línea divisoria (lomo del libro) -->
      <div class="book-spine"></div>

      <!-- Página derecha -->
      <div class="spread-page">
        {#if spreadRightImage}
          <div class="spread-label right">
            <span class="spread-name">{getRecordName(selectedRecord)}</span>
            <span class="spread-side">Página der.</span>
          </div>
        {/if}
        {#if getImageUrl(spreadRightImage)}
          <img
            src={getImageUrl(spreadRightImage)}
            alt="Página derecha"
            class="spread-image right"
            draggable="false"
            style="transform: scale({zoom}) rotate({rotation}deg); transition: transform 0.15s ease;"
          />
        {:else}
          <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
        {/if}
      </div>

    </div>

    <!-- Botón siguiente (par siguiente) -->
  <button class="nav-btn right" onclick={onNext} disabled={selectedIndex >= records.length - 1} aria-label="Siguiente">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>

</div>

<style>
  .viewer-area {
    flex: 1;
    position: relative;
    background-color: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Botones de navegación ── */
  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 52px; height: 52px;
    border-radius: 50%;
    background-color: rgba(26,24,21,0.75);
    backdrop-filter: blur(4px);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-light);
    cursor: pointer;
    z-index: 10;
    transition: background-color var(--transition-base);
  }

  .nav-btn.left  { left: 24px; }
  .nav-btn.right { right: 90px; } /* espacio para toolbar */
  .nav-btn:hover { background-color: rgba(90,140,98,0.3); }
  .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  /* ── Vista spread ── */
  .spread-wrapper {
    display: flex;
    align-items: stretch;
    height: 90%;
    max-width: calc(100% - 120px);
    gap: 0;
  }

  .spread-page {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* Lomo del libro */
  .book-spine {
    width: 4px;
    background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.4), transparent);
    flex-shrink: 0;
    align-self: stretch;
  }

  /* Label de spread (esquina superior) */
  .spread-label {
    position: absolute;
    top: 12px;
    left: 12px;
    background-color: var(--color-surface-alt);
    border-radius: var(--radius-full);
    padding: 6px 14px;
    z-index: 5;
    display: flex;
    flex-direction: column;
  }

  .spread-label.right { left: auto; right: 12px; align-items: flex-end; }

  .spread-name { font-size: var(--text-sm); font-weight: var(--fw-bold); color: var(--color-light); }
  .spread-side { font-size: var(--text-xs); color: var(--color-light-grey); }

  .spread-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    display: block;
    /* Sombra suave de lomo */
  }

  .spread-image.left  { box-shadow: inset -8px 0 16px rgba(0,0,0,0.3); }
  .spread-image.right { box-shadow: inset  8px 0 16px rgba(0,0,0,0.3); }

  /* Sin imagen */
  .no-image {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--color-light-grey);
    opacity: 0.3;
  }

  .no-image span { font-size: var(--text-sm); }
</style>

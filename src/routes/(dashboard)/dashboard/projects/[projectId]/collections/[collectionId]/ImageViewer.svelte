<script lang="ts">
  // ============================================================================
  // COMPONENTE: ImageViewer
  // Archivo: src/routes/gallery/[collectionId]/ImageViewer.svelte
  //
  // Muestra la imagen seleccionada en dos modos:
  //
  //   'single' → una imagen centrada con navegación prev/next y zoom aplicado
  //   'spread' → dos páginas lado a lado (izq + der) con labels de nombre
  //
  // La imagen se muestra usando la URL del thumbnail (para performance)
  // o la URL completa si el thumbnail no existe.
  //
  // Para mostrar la imagen a resolución completa, reemplaza getImageUrl()
  // por recordsApi.getImageFileUrl(imageId).
  //
  // El filtro CSS (brightness/contrast/saturation) NO está implementado aquí —
  // se puede agregar pasando los valores como prop si se desea.
  // ============================================================================

  import { recordsApi, type Record } from '$lib/api';

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
    viewMode: 'single' | 'spread';
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

  // En spread: el par es el record contiguo (siguiente si es izq, anterior si es der)
  // Los pares se identifican por índice par/impar
  let spreadLeft  = $derived(() => {
    // Imagen izquierda: índice par más cercano
    const idx = selectedIndex;
    const leftIdx = idx % 2 === 0 ? idx : idx - 1;
    return records[leftIdx] ?? null;
  });

  let spreadRight = $derived(() => {
    const idx = selectedIndex;
    const leftIdx = idx % 2 === 0 ? idx : idx - 1;
    return records[leftIdx + 1] ?? null;
  });

  // ---------------------------------------------------------------------------
  // HELPER: obtener URL de imagen
  // Usa thumbnail si existe, sino la URL del archivo completo
  // Para resolución máxima, usar getImageFileUrl
  // ---------------------------------------------------------------------------
  function getImageUrl(record: Record | null): string | null {
    if (!record || !record.images || record.images.length === 0) return null;
    const img = record.images[0];
    if (img.thumbnail_path) {
      return recordsApi.getImageThumbnailUrl(img.id);
    }
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

  {#if viewMode === 'single'}
    <!-- ══════════════════════════════════════════════════════
         VISTA SINGLE: imagen centrada con zoom y rotación
         ══════════════════════════════════════════════════════ -->

    <!-- Chip con nombre + posición (esquina superior) -->
    {#if selectedRecord}
      <div class="image-chip">
        <span class="chip-name">{getRecordName(selectedRecord)}</span>
        <span class="chip-index">{selectedIndex + 1}/{records.length}</span>
      </div>
    {/if}

    <!-- Botón anterior -->
    <button class="nav-btn left" onclick={onPrev} disabled={selectedIndex <= 0} aria-label="Anterior">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <!-- Imagen -->
    <div class="single-image-wrapper">
      {#if getImageUrl(selectedRecord)}
        <img
          src={getImageUrl(selectedRecord)}
          alt={getRecordName(selectedRecord)}
          class="main-image"
          style="transform: scale({zoom}) rotate({rotation}deg); transform-origin: center center;"
          draggable="false"
        />
      {:else}
        <div class="no-image">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Sin imagen</span>
        </div>
      {/if}
    </div>

    <!-- Botón siguiente -->
    <button class="nav-btn right" onclick={onNext} disabled={selectedIndex >= records.length - 1} aria-label="Siguiente">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>

  {:else}
    <!-- ══════════════════════════════════════════════════════
         VISTA SPREAD: dos páginas lado a lado (libro abierto)
         Sin panel lateral, imagen ocupa todo el ancho disponible
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
        <!-- Label con nombre + "Página izq." -->
        {#if spreadLeft()}
          <div class="spread-label">
            <span class="spread-name">{getRecordName(spreadLeft())}</span>
            <span class="spread-side">Página izq.</span>
          </div>
        {/if}
        {#if getImageUrl(spreadLeft())}
          <img src={getImageUrl(spreadLeft())} alt="Página izquierda" class="spread-image left" draggable="false" />
        {:else}
          <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
        {/if}
      </div>

      <!-- Línea divisoria (lomo del libro) -->
      <div class="book-spine"></div>

      <!-- Página derecha -->
      <div class="spread-page">
        {#if spreadRight()}
          <div class="spread-label right">
            <span class="spread-name">{getRecordName(spreadRight())}</span>
            <span class="spread-side">Página der.</span>
          </div>
        {/if}
        {#if getImageUrl(spreadRight())}
          <img src={getImageUrl(spreadRight())} alt="Página derecha" class="spread-image right" draggable="false" />
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

  {/if}

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

  /* ── Chip de nombre (single) ── */
  .image-chip {
    position: absolute;
    top: 16px;
    right: 90px; /* deja espacio para la toolbar derecha */
    background-color: var(--color-surface-alt);
    border-radius: var(--radius-full);
    padding: 6px 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    z-index: 10;
  }

  .chip-name { font-size: var(--text-base); font-weight: var(--fw-bold); color: var(--color-light); }
  .chip-index { font-size: var(--text-sm); color: var(--color-light-grey); }

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

  /* ── Vista single ── */
  .single-image-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .main-image {
    max-width: 80%;
    max-height: 90%;
    object-fit: contain;
    transition: transform var(--transition-slow);
    user-select: none;
    display: block;
  }

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

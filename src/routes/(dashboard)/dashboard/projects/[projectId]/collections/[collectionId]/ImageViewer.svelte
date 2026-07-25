<script lang="ts">
  // ============================================================================
  // COMPONENTE: ImageViewer
  //
  // Vista spread: muestra las dos páginas (izq + der) del registro seleccionado
  // lado a lado, como un libro abierto.
  //
  // Siempre carga la imagen completa (no el thumbnail, que el backend limita
  // a 200x200px para las tiras/grillas) — este es el visor principal de
  // lectura/inspección, igual que ImageViewerModal.
  // ============================================================================

  import { recordsApi, type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';

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
    return recordsApi.getImageFileUrl(img.id);
  }

  // Nombre del record para mostrar en labels
  function getRecordName(record: Record | null): string {
    return record?.title ?? '—';
  }

  // ---------------------------------------------------------------------------
  // TAMAÑO MEDIDO DE CADA PÁGINA — evita que la imagen rotada se recorte
  // ---------------------------------------------------------------------------
  // .spread-image no tiene width/height fijo (solo max-width/max-height), y
  // .spread-page tiene overflow:hidden. Un simple rotate(90/270deg) sobre esa
  // caja se recorta porque la página cambia de landscape a portrait (o
  // viceversa) y el rectángulo rotado ya no calza en el contenedor original.
  //
  // El arreglo: medimos cada .spread-page y, en 90°/270°, le damos a la
  // imagen el tamaño del contenedor con ancho/alto intercambiados, centrada
  // de forma absoluta — así la caja ya rotada vuelve a calzar exacto.
  let leftPageW  = $state(0);
  let leftPageH  = $state(0);
  let rightPageW = $state(0);
  let rightPageH = $state(0);

  function spreadImageStyle(rotation: number, zoom: number, containerW: number, containerH: number): string {
    const base = `transition: transform 0.15s ease;`;
    if ((rotation === 90 || rotation === 270) && containerW && containerH) {
      // La caja intercambiada (containerH x containerW) es más ancha que el
      // 100% del panel sin rotar — hay que anular max-width/max-height
      // (heredados de .spread-image) o los recortan de vuelta.
      return `${base} position: absolute; top: 50%; left: 50%; width: ${containerH}px; height: ${containerW}px; max-width: none; max-height: none; transform: translate(-50%, -50%) scale(${zoom}) rotate(${rotation}deg);`;
    }
    return `${base} transform: scale(${zoom}) rotate(${rotation}deg);`;
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
  <button class="nav-btn left" onclick={onPrev} disabled={selectedIndex <= 0} aria-label={$m.col_prev}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <!-- Área de spread: dos páginas -->
    <div class="spread-wrapper">

      <!-- Página izquierda -->
      <div class="spread-page" bind:clientWidth={leftPageW} bind:clientHeight={leftPageH}>
        {#if selectedRecord}
          <div class="spread-label">
            <span class="spread-name">{getRecordName(selectedRecord)}</span>
            <span class="spread-side">{$m.col_left_page_short}</span>
          </div>
        {/if}
        {#if getImageUrl(spreadLeftImage)}
          <img
            src={getImageUrl(spreadLeftImage)}
            alt={$m.col_left_page}
            class="spread-image left"
            draggable="false"
            style={spreadImageStyle(rotation, zoom, leftPageW, leftPageH)}
          />
        {:else}
          <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
        {/if}
      </div>

      <!-- Línea divisoria (lomo del libro) -->
      <div class="book-spine"></div>

      <!-- Página derecha -->
      <div class="spread-page" bind:clientWidth={rightPageW} bind:clientHeight={rightPageH}>
        {#if spreadRightImage}
          <div class="spread-label right">
            <span class="spread-name">{getRecordName(selectedRecord)}</span>
            <span class="spread-side">{$m.col_right_page_short}</span>
          </div>
        {/if}
        {#if getImageUrl(spreadRightImage)}
          <img
            src={getImageUrl(spreadRightImage)}
            alt={$m.col_right_page}
            class="spread-image right"
            draggable="false"
            style={spreadImageStyle(rotation, zoom, rightPageW, rightPageH)}
          />
        {:else}
          <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
        {/if}
      </div>

    </div>

    <!-- Botón siguiente (par siguiente) -->
  <button class="nav-btn right" onclick={onNext} disabled={selectedIndex >= records.length - 1} aria-label={$m.col_next}>
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

  /* Simétricas: RightToolbar vive en su propia columna flex de 80px fuera
     de .viewer-area (ver +page.svelte / RightToolbar.svelte), no se
     superpone acá — el offset extra que tenía "right" era innecesario y
     hacía que invadiera la página derecha en pantallas angostas (tablet). */
  .nav-btn.left  { left: 24px; }
  .nav-btn.right { right: 24px; }
  .nav-btn:hover { background-color: rgba(90,140,98,0.3); }
  .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  /* ── Vista spread ── */
  .spread-wrapper {
    display: flex;
    align-items: stretch;
    height: 90%;
    width: 100%;
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

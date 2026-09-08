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
  import {
    fittedSize,
    screenExtent,
    oneToOneZoom,
    effectiveOneToOne,
    pageScale,
    panBounds,
    panPixels,
    dragToFraction,
    transformFor,
    isSwapped,
    type Pan,
    type PanFraction,
  } from '$lib/pan-zoom';

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
    onOneToOneChange,
  }: {
    viewMode: 'spread';
    records: Record[];
    selectedRecordId: number | null;
    zoom: number;
    rotation: number;
    onPrev: () => void;
    onNext: () => void;
    onZoomChange: (z: number) => void;
    onOneToOneChange?: (z: number) => void;
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

  // NEH-201: the image's exact file name, not the record's derived title — the
  // file name is what survives in the BagIt export.
  function getImageName(img: RecordImage | null): string {
    return img?.filename ?? '—';
  }

  // NEH-209: mientras el registro esté "rejected", sus imágenes actuales
  // (selectedRecord.images, ya filtradas a is_current por el backend) SON
  // exactamente las pendientes de recaptura — 1 para modo single, 2 para
  // dual. No hay que asumir un número fijo: si hay imagen en la página, y
  // el registro está rechazado, esa página está pendiente de recaptura.
  // Un solo badge por página (no también uno flotante arriba de ambas — era
  // redundante y ya se quitó).
  let isRejected = $derived(selectedRecord?.status === 'rejected');
  let isApproved = $derived(selectedRecord?.status === 'approved');

  // ---------------------------------------------------------------------------
  // TAMAÑO MEDIDO DE CADA PÁGINA — evita que la imagen rotada se recorte
  // ---------------------------------------------------------------------------
  // .spread-image no tiene width/height fijo (solo max-width/max-height), y
  // .spread-frame tiene overflow:hidden. Un simple rotate(90/270deg) sobre esa
  // caja se recorta porque la página cambia de landscape a portrait (o
  // viceversa) y el rectángulo rotado ya no calza en el contenedor original.
  //
  // El arreglo: medimos cada .spread-frame y, en 90°/270°, le damos a la
  // imagen el tamaño del contenedor con ancho/alto intercambiados, centrada
  // de forma absoluta — así la caja ya rotada vuelve a calzar exacto.
  let leftFrameW  = $state(0);
  let leftFrameH  = $state(0);
  let rightFrameW = $state(0);
  let rightFrameH = $state(0);

  // Tamaño natural de cada imagen (bind:naturalWidth/Height) — necesario
  // para calcular el "fit" y el zoom 1:1 (NEH-230).
  let leftNaturalW  = $state(0);
  let leftNaturalH  = $state(0);
  let rightNaturalW = $state(0);
  let rightNaturalH = $state(0);

  // ---------------------------------------------------------------------------
  // PAN/ZOOM COMPARTIDO (NEH-230)
  // ---------------------------------------------------------------------------
  // zoom (prop) es relativo al fit: 1 = fit. pan es una fracción compartida
  // por ambas páginas (R34-2) — cada página la traduce a sus propios píxeles
  // de desplazamiento con sus propios límites, así que las dos se mueven en
  // proporción aunque tengan tamaños distintos, y siempre queda alcanzable
  // cualquier borde de cualquiera de las dos.
  let pan = $state<PanFraction>({ x: 0, y: 0 });

  function dpr(): number {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  let leftFitted  = $derived(fittedSize({ w: leftNaturalW, h: leftNaturalH }, { w: leftFrameW, h: leftFrameH }, rotation));
  let rightFitted = $derived(fittedSize({ w: rightNaturalW, h: rightNaturalH }, { w: rightFrameW, h: rightFrameH }, rotation));

  // effectiveOneToOne clampea a >= 1 (R35-1): 1:1 nunca encoge una página
  // por debajo del fit — una página cuyo tamaño natural ya cabe en su
  // frame (o una pantalla de DPR alto) puede tener un oneToOne crudo < 1.
  let leftOneToOneRaw  = $derived(oneToOneZoom({ w: leftNaturalW, h: leftNaturalH }, { w: leftFrameW, h: leftFrameH }, rotation, dpr()));
  let rightOneToOneRaw = $derived(oneToOneZoom({ w: rightNaturalW, h: rightNaturalH }, { w: rightFrameW, h: rightFrameH }, rotation, dpr()));
  let leftOneToOne  = $derived(effectiveOneToOne(leftOneToOneRaw));
  let rightOneToOne = $derived(effectiveOneToOne(rightOneToOneRaw));

  // Referencia para pageScale: la MAYOR de las páginas con imagen (no la
  // izquierda a secas) — pageScale exige que la referencia sea >= cada
  // página para que la curva fit->1:1 de cada una sea monótona (ver el
  // comentario de pageScale en pan-zoom.ts).
  let oneToOneRef = $derived.by(() => {
    const candidates: number[] = [];
    if (spreadLeftImage) candidates.push(leftOneToOne);
    if (spreadRightImage) candidates.push(rightOneToOne);
    return candidates.length > 0 ? Math.max(...candidates) : 1;
  });

  let leftScale  = $derived(pageScale(zoom, leftOneToOne, oneToOneRef));
  let rightScale = $derived(pageScale(zoom, rightOneToOne, oneToOneRef));

  let leftExtent  = $derived(screenExtent(leftFitted, rotation, leftScale));
  let rightExtent = $derived(screenExtent(rightFitted, rotation, rightScale));

  let leftBounds  = $derived(panBounds(leftExtent, { w: leftFrameW, h: leftFrameH }));
  let rightBounds = $derived(panBounds(rightExtent, { w: rightFrameW, h: rightFrameH }));

  let leftPan  = $derived(panPixels(pan, leftBounds));
  let rightPan = $derived(panPixels(pan, rightBounds));

  // Notifica al padre el 1:1 de la página de referencia (en px de
  // dispositivo) cada vez que cambia, para que RightToolbar sepa a qué zoom
  // apuntar el botón "1:1" y hasta dónde permitir el zoom máximo.
  $effect(() => {
    onOneToOneChange?.(oneToOneRef);
  });

  // ---------------------------------------------------------------------------
  // ARRASTRE (pan) CON POINTER EVENTS — mouse y touch llegan por igual acá,
  // no hace falta un handler de touch aparte.
  // ---------------------------------------------------------------------------
  let dragSide = $state<'left' | 'right' | null>(null);
  // El pointerId que efectivamente está arrastrando — no basta con "hay un
  // lado activo", porque un segundo dedo (touch multipunto) también llega
  // como pointerdown con button === 0 y, sin esto, pisa dragLastX/Y del
  // primero: el próximo pointermove del PRIMER dedo calcularía su delta
  // contra la posición del SEGUNDO, produciendo un salto enorme y falso.
  let dragPointerId: number | null = null;
  let dragLastX = 0;
  let dragLastY = 0;

  function handlePointerDown(e: PointerEvent, side: 'left' | 'right') {
    if (e.button !== 0) return; // solo botón primario
    // No capturar el pointer si el down empezó sobre un control (botón,
    // enlace) dentro del frame — si no, el pointerup se retarget-ea al
    // frame por la captura y el click nunca llega al control. Ningún
    // .spread-frame tiene controles hoy, pero se guarda por consistencia
    // con ImageViewerModal.svelte y por si alguno se agrega después.
    if ((e.target as HTMLElement).closest('button, a')) return;
    // Ya hay un pointer arrastrando — ignorar cualquier otro (segundo
    // dedo) hasta que termine el actual.
    if (dragPointerId !== null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragSide = side;
    dragPointerId = e.pointerId;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
  }

  function handlePointerMove(e: PointerEvent, side: 'left' | 'right') {
    if (dragSide !== side || e.pointerId !== dragPointerId) return;
    const deltaX = e.clientX - dragLastX;
    const deltaY = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    const bounds = side === 'left' ? leftBounds : rightBounds;
    pan = dragToFraction(pan, { x: deltaX, y: deltaY }, bounds);
  }

  function endDrag(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return; // el dedo que suelta/cancela no es el que arrastraba
    dragSide = null;
    dragPointerId = null;
  }

  function spreadImageStyle(rotation: number, scale: number, pixelPan: Pan, containerW: number, containerH: number): string {
    const transition = dragSide === null ? 'transition: transform 0.15s ease;' : '';
    const transformStr = transformFor(pixelPan, scale, rotation);
    if (isSwapped(rotation) && containerW && containerH) {
      // La caja intercambiada (containerH x containerW) es más ancha que el
      // 100% del panel sin rotar — hay que anular max-width/max-height
      // (heredados de .spread-image) o los recortan de vuelta.
      return `${transition} position: absolute; top: 50%; left: 50%; width: ${containerH}px; height: ${containerW}px; max-width: none; max-height: none; transform: translate(-50%, -50%) ${transformStr};`;
    }
    return `${transition} transform: ${transformStr};`;
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
      <div class="spread-page">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="spread-frame"
          class:dragging={dragSide === 'left'}
          bind:clientWidth={leftFrameW}
          bind:clientHeight={leftFrameH}
          onpointerdown={(e) => handlePointerDown(e, 'left')}
          onpointermove={(e) => handlePointerMove(e, 'left')}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onlostpointercapture={endDrag}
        >
          {#if getImageUrl(spreadLeftImage)}
            <img
              src={getImageUrl(spreadLeftImage)}
              alt={$m.col_left_page}
              class="spread-image left"
              draggable="false"
              bind:naturalWidth={leftNaturalW}
              bind:naturalHeight={leftNaturalH}
              style={spreadImageStyle(rotation, leftScale, leftPan, leftFrameW, leftFrameH)}
            />
            {#if isRejected}
              <span class="pending-recapture-badge">
                <span class="material-symbols-outlined icon-sm">refresh</span>
                {$m.col_pending_recapture}
              </span>
            {:else if isApproved}
              <span class="approved-badge">
                <span class="material-symbols-outlined icon-sm">check_circle</span>
                {$m.col_approved_badge}
              </span>
            {/if}
          {:else}
            <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
          {/if}
        </div>
        {#if spreadLeftImage}
          <div class="spread-label">
            <span class="spread-name">{getImageName(spreadLeftImage)}</span>
            <span class="spread-side">{$m.col_left_page_short}</span>
          </div>
        {/if}
      </div>

      <!-- Línea divisoria (lomo del libro) -->
      <div class="book-spine"></div>

      <!-- Página derecha -->
      <div class="spread-page">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="spread-frame"
          class:dragging={dragSide === 'right'}
          bind:clientWidth={rightFrameW}
          bind:clientHeight={rightFrameH}
          onpointerdown={(e) => handlePointerDown(e, 'right')}
          onpointermove={(e) => handlePointerMove(e, 'right')}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onlostpointercapture={endDrag}
        >
          {#if getImageUrl(spreadRightImage)}
            <img
              src={getImageUrl(spreadRightImage)}
              alt={$m.col_right_page}
              class="spread-image right"
              draggable="false"
              bind:naturalWidth={rightNaturalW}
              bind:naturalHeight={rightNaturalH}
              style={spreadImageStyle(rotation, rightScale, rightPan, rightFrameW, rightFrameH)}
            />
            {#if isRejected}
              <span class="pending-recapture-badge">
                <span class="material-symbols-outlined icon-sm">refresh</span>
                {$m.col_pending_recapture}
              </span>
            {:else if isApproved}
              <span class="approved-badge">
                <span class="material-symbols-outlined icon-sm">check_circle</span>
                {$m.col_approved_badge}
              </span>
            {/if}
          {:else}
            <div class="no-image"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/></svg></div>
          {/if}
        </div>
        {#if spreadRightImage}
          <div class="spread-label right">
            <span class="spread-name">{getImageName(spreadRightImage)}</span>
            <span class="spread-side">{$m.col_right_page_short}</span>
          </div>
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

  /* Badge por página (NEH-209): un solo indicador de estado debajo de cada
     página, no también uno flotante arriba de ambas — era redundante. */
  .pending-recapture-badge {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    background-color: rgba(214,103,74,0.85);
    color: white;
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
  }

  .approved-badge {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: var(--radius-full);
    background-color: rgba(90,140,98,0.9);
    color: white;
    font-size: var(--text-xs);
    font-weight: var(--fw-bold);
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

  /* Columna: caja de imagen (.spread-frame) arriba, título (.spread-label)
     debajo en flujo estático — así el título nunca se superpone a la
     imagen sea cual sea el zoom (NEH-230). */
  .spread-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Caja de imagen: mide el frame para el fit/1:1, atrapa el pointer para
     el arrastre (pan) y recorta lo que se sale del marco al hacer zoom. */
  .spread-frame {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
  }

  .spread-frame.dragging { cursor: grabbing; }

  /* Lomo del libro */
  .book-spine {
    width: 4px;
    background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.4), transparent);
    flex-shrink: 0;
    align-self: stretch;
  }

  /* Label de spread — fila de texto debajo de la imagen, ya no flotando
     encima (NEH-230: tapaba foliación/marginalia en la esquina). */
  .spread-label {
    margin-top: 8px;
    align-self: flex-start;
    background-color: var(--color-surface-alt);
    border-radius: var(--radius-full);
    padding: 6px 14px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .spread-label.right { align-self: flex-end; align-items: flex-end; }

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

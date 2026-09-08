<script lang="ts">
  // ============================================================================
  // COMPONENTE: ImageViewerModal (Gallery)
  //
  // Modal de inspección de imagen para la vista de galería.
  // Muestra todas las imágenes del registro con badge L/R cuando corresponde.
  //
  // Props:
  //   record    — registro a inspeccionar
  //   onClose   — callback para cerrar el modal
  //   onRetake  — callback para volver a capturar (navega a live-preview)
  //   onDelete  — callback para eliminar el registro completo
  // ============================================================================

  import { recordsApi, type Record, type RecordImage } from '$lib/api';
  import { m } from '$lib/i18n';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
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
    type Pan,
    type PanFraction,
  } from '$lib/pan-zoom';

  // ---------------------------------------------------------------------------
  // PROPS
  // ---------------------------------------------------------------------------
  let {
    record,
    onClose,
    onRetake,
    onDelete,
    userRole = null,
  }: {
    record: Record;
    onClose: () => void;
    onRetake: (record: Record) => void;
    onDelete: (record: Record) => void;
    userRole?: string | null;
  } = $props();

  // Lock: in_review and approved block retake/delete for non-admins
  let isLocked = $derived(record.status === 'in_review' || record.status === 'approved');

  // ---------------------------------------------------------------------------
  // ESTADO LOCAL
  // ---------------------------------------------------------------------------
  let confirmAction = $state<null | 'retake' | 'delete'>(null);

  // Imágenes del registro, ordenadas por rol (left primero, right después)
  const images = $derived(() => {
    const imgs = record.images ?? [];
    return [...imgs].sort((a, b) => {
      const order = (r?: string | null) => r === 'left' ? 0 : r === 'right' ? 1 : 2;
      return order(a.role) - order(b.role) || a.id - b.id;
    });
  });

  const isDouble = $derived(() => images().some(i => i.role === 'left' || i.role === 'right'));

  // ---------------------------------------------------------------------------
  // PAN/ZOOM COMPARTIDO (NEH-230) — mismo modelo que ImageViewer.svelte: un
  // zoom y una fracción de pan compartidos por ambos frames, cada uno
  // deriva su propia escala CSS y su propio pan en píxeles con su propia
  // geometría medida. Acá no hay rotación (este modal no la soporta), así
  // que rotation siempre es 0 en las llamadas al módulo.
  // ---------------------------------------------------------------------------
  let zoom = $state(1);
  let pan = $state<PanFraction>({ x: 0, y: 0 });

  // Tamaño medido de cada frame y tamaño natural de cada imagen, por índice
  // dentro de images() (0 = primero/referencia, 1 = segundo si lo hay).
  let frameW    = $state<number[]>([0, 0]);
  let frameH    = $state<number[]>([0, 0]);
  let naturalW  = $state<number[]>([0, 0]);
  let naturalH  = $state<number[]>([0, 0]);

  function dpr(): number {
    return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  type FrameGeom = { scale: number; pan: Pan; bounds: { w: number; h: number } };

  // effectiveOneToOne clampea cada imagen a >= 1 (R35-1): 1:1 nunca encoge
  // una imagen por debajo del fit. La referencia para pageScale es la
  // MAYOR de esos valores entre TODAS las imágenes del registro (no la
  // primera a secas) — pageScale exige que la referencia sea >= cada
  // imagen para que la curva fit->1:1 de cada una sea monótona (ver el
  // comentario de pageScale en pan-zoom.ts).
  let oneToOnes = $derived.by((): number[] =>
    images().map((_, i) =>
      effectiveOneToOne(
        oneToOneZoom({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0, dpr())
      )
    )
  );

  let oneToOneRef = $derived(oneToOnes.length > 0 ? Math.max(...oneToOnes) : 1);

  // Un elemento por imagen del registro, en el mismo orden que images().
  let frameGeoms = $derived.by((): FrameGeom[] => {
    const imgs = images();
    const fitted = imgs.map((_, i) =>
      fittedSize({ w: naturalW[i] ?? 0, h: naturalH[i] ?? 0 }, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 }, 0)
    );
    return imgs.map((_, i) => {
      const scale = pageScale(zoom, oneToOnes[i] ?? 1, oneToOneRef);
      const extent = screenExtent(fitted[i], 0, scale);
      const bounds = panBounds(extent, { w: frameW[i] ?? 0, h: frameH[i] ?? 0 });
      return { scale, pan: panPixels(pan, bounds), bounds };
    });
  });

  // ---------------------------------------------------------------------------
  // ARRASTRE (pan) — pointer events, mouse y touch por igual.
  // ---------------------------------------------------------------------------
  let dragIndex = $state<number | null>(null);
  // El pointerId que efectivamente está arrastrando — no basta con "hay un
  // índice activo", porque un segundo dedo (touch multipunto) también
  // llega como pointerdown con button === 0 y, sin esto, pisa
  // dragLastX/Y del primero: el próximo pointermove del PRIMER dedo
  // calcularía su delta contra la posición del SEGUNDO, produciendo un
  // salto enorme y falso.
  let dragPointerId: number | null = null;
  let dragLastX = 0;
  let dragLastY = 0;

  function handlePointerDown(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    // No capturar el pointer si el down empezó sobre un control (botón de
    // zoom, descarga) que vive dentro del frame — si no, el pointerup se
    // retarget-ea al frame por la captura y el click nunca llega al botón.
    if ((e.target as HTMLElement).closest('button, a')) return;
    // Ya hay un pointer arrastrando — ignorar cualquier otro (segundo
    // dedo) hasta que termine el actual.
    if (dragPointerId !== null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragIndex = i;
    dragPointerId = e.pointerId;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
  }

  function handlePointerMove(e: PointerEvent, i: number) {
    if (dragIndex !== i || e.pointerId !== dragPointerId) return;
    const deltaX = e.clientX - dragLastX;
    const deltaY = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    pan = dragToFraction(pan, { x: deltaX, y: deltaY }, frameGeoms[i]?.bounds ?? { w: 0, h: 0 });
  }

  function endDrag(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return; // el dedo que suelta/cancela no es el que arrastraba
    dragIndex = null;
    dragPointerId = null;
  }

  function frameImageStyle(i: number): string {
    const geom = frameGeoms[i];
    const transition = dragIndex === null ? 'transition: transform 0.15s ease;' : '';
    if (!geom) return `${transition} transform: ${transformFor({ x: 0, y: 0 }, 1, 0)};`;
    return `${transition} transform: ${transformFor(geom.pan, geom.scale, 0)};`;
  }

  // Igual que RightToolbar: "fit" solo lleva zoom a 1 (relativo a fit). No
  // hace falta tocar `pan` — a zoom 1 los bounds son 0 y el pan en píxeles
  // ya da 0, y la fracción sigue disponible si el usuario vuelve a acercar
  // (mismo diseño que la vista spread, ver pan-zoom.ts).
  function handleFit() { zoom = 1; }
  function handleActualSize() { zoom = oneToOneRef; }

</script>

<!-- ============================================================
     BACKDROP: click fuera cierra el modal
     ============================================================ -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="img-viewer-backdrop" onclick={onClose}>

  <!-- Contenido del modal -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="img-viewer-content" onclick={(e) => e.stopPropagation()}>

    <!-- ── Cabecera ── -->
    <div class="img-viewer-header">
      <div class="img-viewer-header-title-group">
        <span class="img-viewer-title">
          {record.title || $m.record_fallback_title(record.id)}
        </span>
        <StatusBadge status={record.status} />
      </div>
      <button class="img-viewer-close-btn" onclick={onClose} aria-label={$m.common_close}>
        <span class="material-symbols-outlined icon-md">close</span>
      </button>
    </div>

    <!-- ── Área de imágenes ── -->
    <div class="img-viewer-images">
      {#each images() as img, i}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="img-viewer-frame"
          class:dragging={dragIndex === i}
          bind:clientWidth={frameW[i]}
          bind:clientHeight={frameH[i]}
          onpointerdown={(e) => handlePointerDown(e, i)}
          onpointermove={(e) => handlePointerMove(e, i)}
          onpointerup={endDrag}
          onpointercancel={endDrag}
          onlostpointercapture={endDrag}
        >
          <!-- Badge L/R en captura doble -->
          {#if isDouble() && (img.role === 'left' || img.role === 'right')}
            <span class="img-viewer-badge">
              {img.role === 'left' ? $m.badge_left : $m.badge_right}
            </span>
          {/if}

        <img
            src={recordsApi.getImageFileUrl(img.id)}
            alt={record.title || $m.col_image_alt(img.id)}
            class="img-viewer-img"
            draggable="false"
            bind:naturalWidth={naturalW[i]}
            bind:naturalHeight={naturalH[i]}
            style={frameImageStyle(i)}
          />
          <div class="img-viewer-zoom-controls">
            <button
              class="img-viewer-zoom-btn"
              onclick={(e) => { e.stopPropagation(); handleFit(); }}
              title={$m.col_fit_screen}
              aria-label={$m.col_fit_screen_aria}
            >
              <span class="material-symbols-outlined icon-sm">fit_screen</span>
            </button>
            <button
              class="img-viewer-zoom-btn"
              onclick={(e) => { e.stopPropagation(); handleActualSize(); }}
              title={$m.col_zoom_actual}
              aria-label={$m.col_zoom_actual_aria}
            >
              <span class="one-to-one-glyph">1:1</span>
            </button>
          </div>
          <a
            class="img-viewer-download"
            href={recordsApi.getImageFileUrl(img.id)}
            download
            title={$m.col_download_image}
            aria-label={$m.col_download_image}
            onclick={(e) => e.stopPropagation()}
          >
            <span class="material-symbols-outlined icon-sm">download</span>
          </a>
        </div>
      {/each}

      {#if images().length === 0}
        <div class="img-viewer-frame">
          <span class="material-symbols-outlined icon-lg" style="--c: var(--color-light-grey)">
            image_not_supported
          </span>
        </div>
      {/if}
    </div>

    <!-- ── Pie de página ── -->
    <div class="img-viewer-footer">

      {#if confirmAction === null}
        <!-- Acciones normales -->
        <button class="btn btn-secondary" onclick={onClose}>
          <span class="material-symbols-outlined icon-sm">close</span>
          {$m.common_close}
        </button>
        <div style="display:flex; gap:8px;">
          {#if isLocked && userRole !== 'admin'}
            <span class="img-viewer-locked-msg">
              <span class="material-symbols-outlined icon-sm">lock</span>
              {$m.col_record_locked(record.status === 'in_review' ? $m.col_status_in_review_lc : $m.col_status_approved_lc)}
            </span>
          {:else}
            <button class="btn btn-warning" onclick={() => confirmAction = 'retake'}>
              <span class="material-symbols-outlined icon-sm">refresh</span>
              {$m.col_retake}
            </button>
            <button class="btn btn-danger" onclick={() => confirmAction = 'delete'}>
              <span class="material-symbols-outlined icon-sm">delete</span>
              {$m.common_delete}
            </button>
          {/if}
        </div>

      {:else if confirmAction === 'retake'}
        <!-- Confirmación de retoma -->
        <span class="img-viewer-confirm-msg">
          {$m.col_retake_confirm}
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmAction = null}>
            {$m.common_cancel}
          </button>
          <button class="btn btn-warning" onclick={() => { confirmAction = null; onRetake(record); }}>
            <span class="material-symbols-outlined icon-sm">check</span>
            {$m.common_confirm}
          </button>
        </div>

      {:else if confirmAction === 'delete'}
        <!-- Confirmación de eliminación -->
        <span class="img-viewer-confirm-msg">
          {$m.col_delete_record_confirm}
        </span>
        <div class="img-viewer-confirm-btns">
          <button class="btn btn-secondary" onclick={() => confirmAction = null}>
            {$m.common_cancel}
          </button>
          <button class="btn btn-danger" onclick={() => { confirmAction = null; onDelete(record); }}>
            <span class="material-symbols-outlined icon-sm">check</span>
            {$m.common_delete}
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
.img-viewer-frame {
  position: relative;
  touch-action: none;
  cursor: grab;
}
.img-viewer-frame.dragging { cursor: grabbing; }

  .img-viewer-download {
    position: absolute;
    top: 8px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.55);
    color: var(--color-light);
    text-decoration: none;
    transition: background-color var(--transition-fast);
  }
  .img-viewer-download:hover { background: var(--color-primary); }

  /* Grupo fit/1:1 (NEH-230), pegado a la izquierda del botón de descarga —
     mismo tamaño y estilo (32px, oscuro translúcido). */
  .img-viewer-zoom-controls {
    position: absolute;
    top: 8px;
    right: 48px;
    display: flex;
    gap: 4px;
  }
  .img-viewer-zoom-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: rgba(0, 0, 0, 0.55);
    color: var(--color-light);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }
  .img-viewer-zoom-btn:hover { background: var(--color-primary); }
  .one-to-one-glyph { font-size: 11px; font-weight: var(--fw-bold); }
  .btn-warning {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-warning, #d97706);
    background: transparent;
    color: var(--color-warning, #d97706);
    font-size: var(--text-sm);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }
  .btn-warning:hover { background-color: rgba(217, 119, 6, 0.12); }
</style>

<script lang="ts">
  // ==========================================================================
  // COMPONENTE: GuidedTour (NEH-95)
  //
  // La capa del recorrido guiado: oscurece la pantalla, abre un hueco sobre
  // el control del paso actual y pone al lado una caja con el texto, el
  // contador y las flechas.
  //
  // Se monta una sola vez en el layout raíz para que sobreviva a los cambios
  // de ruta: los seis pasos viven en tres pantallas distintas y el recorrido
  // acompaña al operador en vez de navegar por él (ver $lib/tour.ts).
  //
  // DOS REGLAS QUE NO SE PUEDEN ROMPER:
  //
  // 1. El hueco deja tocar. La capa oscura es un box-shadow enorme sobre un
  //    elemento con pointer-events:none, no un fondo que tape. Si tapara, el
  //    operador no podría hacer el paso que se le está explicando.
  // 2. La caja nunca se sale de la pantalla. En 800x480 no sobra espacio: se
  //    coloca donde el paso pide y se recorta contra los bordes.
  // ==========================================================================

  import { onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { m } from '$lib/i18n';
  import { tour, TOUR_STEPS } from '$lib/tour';
  import { placeTourBox, type TourRect } from '$lib/tour-position';

  const BOX_W = 264;
  const GAP   = 12;

  let box = $state<HTMLDivElement | undefined>(undefined);

  // Rectángulo del control resaltado, en coordenadas de viewport.
  let rect = $state<TourRect | null>(null);

  // A modal dialog (approve confirmation, export chooser, send for review)
  // sits below the tour's z-index, so with the veil on top the operator
  // could not answer it. While one is open the tour hides and waits; the
  // step resumes when the dialog closes.
  let modalOpen = $state(false);

  // El catálogo está tipado con claves literales; los pasos las arman en
  // tiempo de ejecución (tour_s1_title…), así que aquí se lee como mapa.
  let textos = $derived($m as unknown as Record<string, string>);

  let step  = $derived(TOUR_STEPS[$tour.index]);
  let onRoute = $derived(step ? step.match.test($page.url.pathname) : false);

  let innerW = $state(0);
  let innerH = $state(0);
  let boxH   = $state(180);

  let pos = $derived(
    placeTourBox(rect, step?.side ?? 'bottom', { width: BOX_W, height: boxH }, { width: innerW, height: innerH }, GAP)
  );

  // Scroll a control into view once per step, not on every measurement:
  // repeating it would pull a list back each time the operator scrolls it.
  let scrolledTo: Element | null = null;

  function sameRect(a: TourRect | null, b: TourRect | null) {
    return a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);
  }

  function measure() {
    modalOpen = document.querySelector('[aria-modal="true"]') !== null;
    if (!$tour.active || !onRoute || !step?.target) {
      rect = null;
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    // A control inside a collapsed or hidden panel has no boxes.
    if (!el || el.getClientRects().length === 0) {
      rect = null;
      return;
    }
    if (scrolledTo !== el) {
      scrolledTo = el;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const r = el.getBoundingClientRect();
    const next = { top: r.top, left: r.left, width: r.width, height: r.height };
    // Assign only on change: the tour's own re-render is a DOM mutation too.
    if (!sameRect(rect, next)) rect = next;
  }

  let frame = 0;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  }

  // Measure again when the step, the route or the window size changes.
  $effect(() => {
    void [$tour.active, $tour.index, $page.url.pathname, innerW, innerH];
    scrolledTo = null;
    tick().then(measure);
  });

  // The control of a step often appears after the step does: the approve
  // button exists only in book view with the annotations panel open, and the
  // send-for-review button only once there are captures. While the tour is
  // open, watch the page and measure again whenever it changes. Style
  // attributes are left out because the tour writes its own on each render.
  $effect(() => {
    if (!$tour.active) return;
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-modal', 'open', 'disabled'],
    });
    // Panels slide open with a CSS transition; measure once it ends.
    document.addEventListener('transitionend', schedule, true);
    // Lists scroll inside their own panels, which window scroll never sees.
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      document.removeEventListener('transitionend', schedule, true);
      document.removeEventListener('scroll', schedule, true);
    };
  });

  // The box grows with the text of each step and with the route hint.
  $effect(() => {
    if (!box) return;
    const el = box;
    boxH = el.offsetHeight;
    const observer = new ResizeObserver(() => { boxH = el.offsetHeight; });
    observer.observe(el);
    return () => observer.disconnect();
  });

  onDestroy(() => {
    if (frame) cancelAnimationFrame(frame);
  });

  function onKey(event: KeyboardEvent) {
    // Keys belong to the open dialog, not to the tour hidden behind it.
    if (!$tour.active || modalOpen) return;
    if (event.key === 'Escape') tour.stop();
    if (event.key === 'ArrowRight') tour.next();
    if (event.key === 'ArrowLeft') tour.prev();
  }
</script>

<svelte:window bind:innerWidth={innerW} bind:innerHeight={innerH} onkeydown={onKey} />

{#if $tour.active && step && !modalOpen}
  <!-- Resaltado. pointer-events:none a propósito: el control de abajo tiene
       que seguir siendo pulsable mientras el recorrido está abierto. -->
  {#if rect}
    <div
      class="tour-spot"
      style="top:{rect.top - 4}px; left:{rect.left - 4}px; width:{rect.width + 8}px; height:{rect.height + 8}px"
    ></div>
  {:else}
    <div class="tour-veil"></div>
  {/if}

  <div
    class="tour-box"
    bind:this={box}
    style="left:{pos.left}px; top:{pos.top}px"
    role="dialog"
    aria-modal="false"
    aria-label={$m.tour_aria}
  >
    <h3>{textos[`${step.id}_title`]}</h3>
    <p>{textos[`${step.id}_body`]}</p>

    {#if !onRoute}
      <!-- Fuera de la pantalla del paso, la caja dice el camino exacto con
           las etiquetas tal como aparecen en el menú y en los botones. -->
      <p class="tour-hint">{textos[`${step.id}_where`]}</p>
    {/if}

    <div class="tour-foot">
      <span class="tour-count">{$tour.index + 1} / {TOUR_STEPS.length}</span>
      <div class="tour-nav">
        <button
          onclick={() => tour.prev()}
          disabled={$tour.index === 0}
          aria-label={$m.tour_prev}
        >‹</button>
        <button
          class="go"
          onclick={() => tour.next()}
          aria-label={$tour.index === TOUR_STEPS.length - 1 ? $m.tour_finish : $m.tour_next}
        >{$tour.index === TOUR_STEPS.length - 1 ? '✓' : '›'}</button>
      </div>
    </div>

    <button class="tour-skip" onclick={() => tour.stop()}>{$m.tour_skip}</button>
  </div>
{/if}

<style>
  .tour-spot,
  .tour-veil {
    position: fixed;
    z-index: 900;
    pointer-events: none;
    transition: all var(--transition-base);
  }
  .tour-spot {
    border-radius: var(--radius-md);
    box-shadow: 0 0 0 9999px rgba(10, 10, 9, 0.78);
    outline: 2px solid var(--color-highlight);
    outline-offset: 2px;
  }
  .tour-veil {
    inset: 0;
    background-color: rgba(10, 10, 9, 0.78);
  }

  .tour-box {
    position: fixed;
    z-index: 901;
    width: 264px;
    padding: 12px;
    border-radius: var(--radius-md);
    background-color: var(--color-surface-alt);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-lg);
    /* Long steps on the 800x480 screen scroll inside the box instead of
       running past the bottom edge. */
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    transition: left var(--transition-base), top var(--transition-base);
  }
  .tour-box h3 {
    margin: 0 0 4px;
    font-size: var(--text-base);
    font-weight: var(--fw-bold);
    color: var(--color-light);
  }
  .tour-box p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.45;
    color: var(--color-light-grey);
  }
  .tour-hint {
    margin-top: 8px !important;
    color: var(--color-highlight) !important;
  }

  .tour-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 12px;
  }
  .tour-count {
    font-size: var(--text-sm);
    color: var(--color-light-grey);
    font-variant-numeric: tabular-nums;
  }
  .tour-nav { display: flex; gap: 6px; }
  .tour-nav button {
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background-color: transparent;
    color: var(--color-light);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .tour-nav button[disabled] { opacity: 0.35; cursor: default; }
  .tour-nav button.go {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .tour-skip {
    margin-top: 8px;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-light-grey);
    font-family: var(--font-family);
    font-size: var(--text-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
</style>

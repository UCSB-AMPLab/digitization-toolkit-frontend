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

  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import { m } from '$lib/i18n';
  import { tour, TOUR_STEPS } from '$lib/tour';

  const BOX_W = 264;
  const GAP   = 12;

  let box = $state<HTMLDivElement | undefined>(undefined);

  // Rectángulo del control resaltado, en coordenadas de viewport.
  let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);

  // El catálogo está tipado con claves literales; los pasos las arman en
  // tiempo de ejecución (tour_s1_title…), así que aquí se lee como mapa.
  let textos = $derived($m as unknown as Record<string, string>);

  let step  = $derived(TOUR_STEPS[$tour.index]);
  let onRoute = $derived(step ? step.match.test($page.url.pathname) : false);

  // Posición de la caja. Sin objetivo visible se centra abajo: el paso sigue
  // explicándose y de paso dice a dónde hay que ir.
  let pos = $derived.by(() => {
    if (!rect) {
      return {
        left: Math.max(GAP, (innerW - BOX_W) / 2),
        top: Math.max(GAP, innerH - boxH - GAP * 2),
      };
    }
    let left: number, top: number;
    switch (step.side) {
      case 'left':  left = rect.left - BOX_W - GAP; top = rect.top - 40; break;
      case 'right': left = rect.left + rect.width + GAP; top = rect.top - 40; break;
      case 'top':   left = rect.left; top = rect.top - boxH - GAP; break;
      default:      left = rect.left; top = rect.top + rect.height + GAP;
    }
    return {
      left: Math.max(GAP, Math.min(left, innerW - BOX_W - GAP)),
      top:  Math.max(GAP, Math.min(top,  innerH - boxH - GAP)),
    };
  });

  let innerW = $state(0);
  let innerH = $state(0);
  let boxH   = $state(180);

  // Volver a medir cuando cambia el paso, la ruta o el tamaño. El control
  // puede aparecer después (una lista que termina de cargar), así que se
  // reintenta un par de veces antes de darlo por ausente.
  $effect(() => {
    const _ = [$tour.active, $tour.index, $page.url.pathname, innerW, innerH];
    if (!$tour.active || !onRoute || !step?.target) {
      rect = null;
      return;
    }

    let cancelled = false;
    (async () => {
      for (let intento = 0; intento < 6 && !cancelled; intento++) {
        await tick();
        const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          rect = { top: r.top, left: r.left, width: r.width, height: r.height };
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!cancelled) rect = null;
    })();

    return () => { cancelled = true; };
  });

  $effect(() => {
    if (box) boxH = box.offsetHeight;
  });

  function onKey(event: KeyboardEvent) {
    if (!$tour.active) return;
    if (event.key === 'Escape') tour.stop();
    if (event.key === 'ArrowRight') tour.next();
    if (event.key === 'ArrowLeft') tour.prev();
  }
</script>

<svelte:window bind:innerWidth={innerW} bind:innerHeight={innerH} onkeydown={onKey} onscroll={() => ($tour.active ? tour.goTo($tour.index) : null)} />

{#if $tour.active && step}
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
